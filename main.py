"""
行测刷题工具 — 入口
启动 FastAPI 后端 + pywebview 原生窗口 + 系统级全局快捷键
可通过 PyInstaller 打包为独立 .app
"""
from __future__ import annotations

import sys
import threading
import time
from pathlib import Path

import uvicorn
import webview
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.cache import CacheManager
from backend.server import router
from backend.utils import take_screenshot, get_image_as_base64

# ── 确定资源路径（兼容 PyInstaller 打包后的路径）──
if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys._MEIPASS)
else:
    BASE_DIR = Path(__file__).resolve().parent

FRONTEND_DIR = BASE_DIR / "frontend"
PORT = 8000

# ── 创建 FastAPI 应用 ──
app = FastAPI(title="行测刷题工具")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

cache = CacheManager()
app.state.cache = cache

if FRONTEND_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/")
    async def index() -> FileResponse:
        return FileResponse(str(FRONTEND_DIR / "index.html"))
else:
    @app.get("/")
    async def index() -> dict:
        return {"message": "行测刷题工具 API 已启动。前端目录未找到。"}


def start_server() -> None:
    """在后台线程启动 uvicorn"""
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")


# ── 全局快捷键（系统级，程序在后台也能触发）──
_webview_window = None  # pywebview window reference


def _on_global_screenshot() -> None:
    """Ctrl+Shift+A 触发：截图 → 标注 → 插入编辑器"""
    if _webview_window is None:
        return

    def _do():
        path = take_screenshot()
        if path is None:
            return
        try:
            image_data = get_image_as_base64(path)
        except FileNotFoundError:
            return

        # 把窗口拉到前台
        _webview_window.on_top = True
        time.sleep(0.1)
        _webview_window.on_top = False

        # 把 base64 数据传给前端，让前端打开标注器
        js = f"""
        (function() {{
            const {{ base64ToBlob, showToast }} = await import('/static/tools/utils.js');
            const {{ ImageAnnotator }} = await import('/static/tools/image-annotator.js');
            const blob = base64ToBlob(`{image_data}`);
            const annotator = new ImageAnnotator();
            annotator.open(blob, (annotatedBlob) => {{
                if (annotatedBlob) {{
                    if (window.__entryInsertImage) {{
                        window.__entryInsertImage(annotatedBlob);
                        showToast('图片已插入', 'success', 1500);
                    }} else if (window.__app) {{
                        window.__app.state.pendingScreenshot = annotatedBlob;
                        if (window.__app.state.bankPath) {{
                            window.__app.navigate('entry');
                            showToast('截图已保存，已跳转到录入页', 'success', 2000);
                        }} else {{
                            showToast('截图已保存，请先打开题库', 'success', 2000);
                        }}
                    }}
                }}
            }});
        }})();
        """
        # evaluate_js 需要 top-level await，用 async wrapper
        safe_js = f"""
        (async function() {{
            try {{
                const utils = await import('/static/tools/utils.js');
                const ann = await import('/static/tools/image-annotator.js');
                const blob = utils.base64ToBlob(`{image_data}`);
                const annotator = new ann.ImageAnnotator();
                annotator.open(blob, (annotatedBlob) => {{
                    if (annotatedBlob) {{
                        if (window.__entryInsertImage) {{
                            window.__entryInsertImage(annotatedBlob);
                            utils.showToast('图片已插入', 'success', 1500);
                        }} else if (window.__app) {{
                            window.__app.state.pendingScreenshot = annotatedBlob;
                            if (window.__app.state.bankPath) {{
                                window.__app.navigate('entry');
                                utils.showToast('截图已保存，已跳转到录入页', 'success', 2000);
                            }} else {{
                                utils.showToast('截图已保存，请先打开题库', 'success', 2000);
                            }}
                        }}
                    }}
                }});
            }} catch(e) {{ console.error('Screenshot error:', e); }}
        }})();
        """
        _webview_window.evaluate_js(safe_js)

    threading.Thread(target=_do, daemon=True).start()


def start_hotkey_listener() -> None:
    """启动系统级全局快捷键监听"""
    try:
        from pynput import keyboard

        def on_activate():
            _on_global_screenshot()

        hotkey = keyboard.GlobalHotKeys({
            '<ctrl>+<shift>+a': on_activate,
        })
        hotkey.daemon = True
        hotkey.start()
    except Exception as e:
        print(f"⚠️ 全局快捷键注册失败: {e}")


if __name__ == "__main__":
    # 后台启动 API 服务
    server = threading.Thread(target=start_server, daemon=True)
    server.start()

    # 启动全局快捷键
    start_hotkey_listener()

    # 原生窗口（pywebview 使用 macOS WebKit，无需浏览器）
    _webview_window = webview.create_window(
        "行测刷题工具",
        f"http://127.0.0.1:{PORT}",
        width=1280,
        height=860,
        min_size=(900, 600),
    )
    webview.start()
