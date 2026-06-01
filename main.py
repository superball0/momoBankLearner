"""
行测刷题工具 — 入口
启动 FastAPI 后端 + pywebview 原生窗口
可通过 PyInstaller 打包为独立 .app
"""
from __future__ import annotations

import sys
import threading
from pathlib import Path

import uvicorn
import webview
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.cache import CacheManager
from backend.server import router

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


if __name__ == "__main__":
    # 后台启动 API 服务
    server = threading.Thread(target=start_server, daemon=True)
    server.start()

    # 原生窗口（pywebview 使用 macOS WebKit，无需浏览器）
    webview.create_window(
        "行测刷题工具",
        f"http://127.0.0.1:{PORT}",
        width=1280,
        height=860,
        min_size=(900, 600),
    )
    webview.start()
