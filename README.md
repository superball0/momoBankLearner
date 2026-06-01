# 行测刷题工具 v0.2

银行秋招行测备考工具 — 题目录入 + 刷题（开发中）

## 启动方式

```bash
cd 刷题工具
uv run python3 main.py
```

依赖通过 `uv` 管理，首次运行会自动安装。

## 技术架构

| 层 | 技术 |
|----|------|
| 前端 | 原生 HTML + CSS + JavaScript (ES Modules) |
| 后端 | Python 3.13 + FastAPI + uvicorn |
| 原生窗口 | pywebview（macOS WebKit） |
| 数据存储 | 纯文件系统（Markdown / PNG / JSON） |
| 全局快捷键 | pynput（Ctrl+Shift+A 截图） |
| 打包 | PyInstaller → 独立 .app（计划中） |

## 功能概览

### 已实现 — 录入模式
- **题库管理**：新建/选择已有题库（根目录 = "根"）
- **分支系统**：树形分支选择，对应文件夹结构（言语理解/数量关系/判断推理/资料分析）
- **Tag 系统**：递归创建子 Tag，多选叠加，重命名/删除
- **题目录入**：
  - 题干：Notion 风格 Markdown 编辑器 / 截图
  - 选项：4格文字 / 单张大截图 / 4张小截图（默认ABCD，可扩展到F）
  - 答案：Markdown 文字 / 截图
  - 正确答案：切换按钮标记
- **截图工具**：macOS screencapture 十字光标选区
- **图片标注**：矩形框 / 箭头 / 文字标注（Canvas 模态编辑器）
- **全局快捷键**：Ctrl+Shift+A 截图（需 macOS 辅助功能权限）

### 待实现 — 刷题模式
- 按分支/Tag 筛选
- 限时刷题
- 错题本
- 随机/顺序模式

## 项目结构

```
刷题工具/
├── main.py                 # 入口：FastAPI + pywebview + 全局快捷键
├── pyproject.toml          # uv 依赖配置
├── backend/
│   ├── server.py           # FastAPI 路由 (REST API)
│   ├── cache.py            # 缓存管理器（目录扫描、分支树、Tag 树）
│   ├── read.py             # 题目读取 + 历史记录
│   ├── write.py            # 题目保存（Q0001 自动编号）
│   └── utils.py            # 截图、Base64 转换
├── frontend/
│   ├── index.html          # SPA 入口
│   ├── styles.css          # 暗色主题
│   ├── views/
│   │   ├── app.js          # SPA 路由
│   │   ├── home.js         # 首页/题库选择
│   │   ├── entry.js        # 录入模式
│   │   ├── mode-select.js  # 模式选择
│   │   └── tree-selector.js # 分支 + Tag 树形选择器
│   └── tools/
│       ├── markdown-editor.js  # Notion 风格 MD 编辑器
│       ├── image-annotator.js  # 图片标注器
│       └── utils.js            # API 封装、DOM 工具
└── 根/                     # 题库数据目录
```

## 数据目录结构

```
根/
├── tags.json
├── 言语理解与表达/
│   ├── 逻辑填空/
│   │   ├── Q0001/
│   │   │   ├── question.md     # 题干
│   │   │   ├── options/
│   │   │   │   ├── A.md
│   │   │   │   ├── B.md
│   │   │   │   ├── C.md
│   │   │   │   └── D.md
│   │   │   ├── answer.md       # 答案
│   │   │   └── meta.json       # 元数据（tags、正确选项等）
│   │   └── Q0002/
│   └── 片段阅读/
├── 数量关系/
├── 判断推理/
└── 资料分析/
```

## 打包为 .app（计划中）

```bash
pyinstaller --windowed --add-data "frontend:frontend" main.py
```
