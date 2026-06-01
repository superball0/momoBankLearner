from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend import read, write, utils
from backend.cache import CacheManager

router = APIRouter(prefix="/api")

# Temp dir for uploaded images
_TMP_DIR = Path(__file__).resolve().parent.parent / ".tmp"


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class BankOpenRequest(BaseModel):
    path: str


class BranchCreateRequest(BaseModel):
    parent_path: str
    name: str


class BranchRenameRequest(BaseModel):
    old_path: str
    new_name: str


class TagRequest(BaseModel):
    path: str


class TagRenameRequest(BaseModel):
    old_path: str
    new_name: str


class QuestionsQueryParams(BaseModel):
    branch_path: str | None = None
    tag: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_cache(request: Request) -> CacheManager:
    """Retrieve the CacheManager from app state."""
    cache: CacheManager = request.app.state.cache
    return cache


def _require_bank(cache: CacheManager) -> None:
    """Raise 400 if no bank is currently open."""
    if cache.root_path is None:
        raise HTTPException(status_code=400, detail="题库未打开，请先打开题库")


# ---------------------------------------------------------------------------
# Read endpoints
# ---------------------------------------------------------------------------

@router.get("/history")
async def get_history() -> list[str]:
    """Return recent bank paths."""
    return read.load_history()


@router.post("/bank/open")
async def open_bank(body: BankOpenRequest, request: Request) -> dict:
    """Open a question bank at the given path."""
    cache = _get_cache(request)
    success = cache.set_root(body.path)
    if not success:
        raise HTTPException(status_code=400, detail=f"目录不存在: {body.path}")

    read.save_history(body.path)
    return {
        "success": True,
        "path": cache.root_path,
        "question_count": len(cache.questions),
    }


@router.post("/bank/select")
async def select_bank() -> dict:
    """Placeholder – the frontend should send the path directly.

    A future version could use a native file dialog.
    """
    raise HTTPException(
        status_code=501,
        detail="请直接输入题库路径或从历史记录中选择",
    )


@router.get("/branches")
async def get_branches(request: Request) -> dict:
    """Return the branch tree."""
    cache = _get_cache(request)
    _require_bank(cache)
    return cache.get_branch_tree()


@router.get("/tags")
async def get_tags(request: Request) -> dict:
    """Return the tag tree."""
    cache = _get_cache(request)
    _require_bank(cache)
    return cache.get_tag_tree()


@router.get("/questions")
async def get_questions(
    request: Request,
    branch_path: str | None = None,
    tag: str | None = None,
) -> list[dict]:
    """Return a list of question metadata.

    Optionally filter by *branch_path* and/or *tag*.
    """
    cache = _get_cache(request)
    _require_bank(cache)

    if branch_path:
        q_paths = cache.get_questions_in_branch(branch_path)
    else:
        q_paths = list(cache.questions)

    results: list[dict] = []
    for qp in q_paths:
        meta = cache.question_meta.get(qp, {"id": Path(qp).name, "path": qp})
        if tag:
            q_tags = meta.get("tags", [])
            if not any(t == tag or t.startswith(tag + "/") for t in q_tags):
                continue
        results.append(meta)

    return results


@router.get("/question/{q_id}")
async def get_question(q_id: str, request: Request) -> dict:
    """Return full question data for *q_id*."""
    cache = _get_cache(request)
    _require_bank(cache)

    # Find the question path by id
    q_path: str | None = None
    for p in cache.questions:
        if Path(p).name == q_id:
            q_path = p
            break

    if q_path is None:
        raise HTTPException(status_code=404, detail=f"题目未找到: {q_id}")

    try:
        data = read.load_question(q_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    # Convert image paths to API URLs for the frontend
    _convert_image_paths(data, cache.root_path or "")
    return data


def _convert_image_paths(data: dict, root: str) -> None:
    """Replace absolute image paths with ``/api/images/…`` URLs."""
    root_path = Path(root)

    def _fix(obj: dict) -> None:
        if obj.get("type") == "image" and obj.get("content"):
            abs_p = Path(obj["content"])
            if abs_p.is_absolute():
                try:
                    rel = abs_p.relative_to(root_path)
                    obj["content"] = f"/api/images/{rel}"
                except ValueError:
                    pass

    if "question" in data:
        _fix(data["question"])
    if "answer" in data:
        _fix(data["answer"])
    for opt in data.get("options", []):
        _fix(opt)


# ---------------------------------------------------------------------------
# Write endpoints
# ---------------------------------------------------------------------------

@router.post("/branch")
async def create_branch(body: BranchCreateRequest, request: Request) -> dict:
    """Create a new branch directory."""
    cache = _get_cache(request)
    _require_bank(cache)
    try:
        new_path = cache.create_branch(body.parent_path, body.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"success": True, "path": new_path}


@router.put("/branch/rename")
async def rename_branch(body: BranchRenameRequest, request: Request) -> dict:
    """Rename a branch directory."""
    cache = _get_cache(request)
    _require_bank(cache)
    try:
        new_path = write.rename_branch(body.old_path, body.new_name)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    cache.refresh()
    return {"success": True, "path": new_path}


@router.post("/tag")
async def create_tag(body: TagRequest, request: Request) -> dict:
    """Create a new tag."""
    cache = _get_cache(request)
    _require_bank(cache)
    try:
        cache.add_tag(body.path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"success": True, "tags": cache.get_tag_tree()}


@router.put("/tag/rename")
async def rename_tag(body: TagRenameRequest, request: Request) -> dict:
    """Rename a tag."""
    cache = _get_cache(request)
    _require_bank(cache)
    try:
        write.rename_tag(cache, body.old_path, body.new_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"success": True, "tags": cache.get_tag_tree()}


@router.delete("/tag")
async def delete_tag(body: TagRequest, request: Request) -> dict:
    """Delete a tag."""
    cache = _get_cache(request)
    _require_bank(cache)
    try:
        cache.delete_tag(body.path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"success": True, "tags": cache.get_tag_tree()}


@router.post("/question")
async def save_question(
    request: Request,
    question_type: str = Form("text"),
    question_content: str = Form(""),
    option_mode: str = Form("text"),
    options_json: str = Form("[]"),
    answer_type: str = Form("text"),
    answer_content: str = Form(""),
    correct_indices_json: str = Form("[]"),
    tags_json: str = Form("[]"),
    branch_path: str = Form(...),
    question_image: UploadFile | None = File(None),
    answer_image: UploadFile | None = File(None),
    options_image: UploadFile | None = File(None),
    option_A: UploadFile | None = File(None),
    option_B: UploadFile | None = File(None),
    option_C: UploadFile | None = File(None),
    option_D: UploadFile | None = File(None),
    option_E: UploadFile | None = File(None),
    option_F: UploadFile | None = File(None),
) -> dict:
    """Save a new question via multipart form data."""
    cache = _get_cache(request)
    _require_bank(cache)

    try:
        options = json.loads(options_json)
        correct_indices = json.loads(correct_indices_json)
        tags = json.loads(tags_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"JSON 解析错误: {exc}")

    question_data = {
        "question_type": question_type,
        "question_content": question_content,
        "option_mode": option_mode,
        "options": options,
        "answer_type": answer_type,
        "answer_content": answer_content,
        "correct_indices": correct_indices,
        "tags": tags,
    }

    # Collect uploaded images
    images: dict[str, bytes] = {}
    upload_map: dict[str, UploadFile | None] = {
        "question_image": question_image,
        "answer_image": answer_image,
        "options_image": options_image,
        "option_A": option_A,
        "option_B": option_B,
        "option_C": option_C,
        "option_D": option_D,
        "option_E": option_E,
        "option_F": option_F,
    }
    for key, upload in upload_map.items():
        if upload is not None and upload.filename:
            images[key] = await upload.read()

    try:
        q_path = write.save_question(branch_path, question_data, images)
    except (FileNotFoundError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    cache.refresh()
    return {"success": True, "path": q_path, "id": Path(q_path).name}


# ---------------------------------------------------------------------------
# Utility endpoints
# ---------------------------------------------------------------------------

@router.post("/screenshot")
async def api_take_screenshot() -> dict:
    """Trigger an interactive macOS screenshot."""
    import asyncio
    path = await asyncio.to_thread(utils.take_screenshot)
    if path is None:
        return {"cancelled": True}
    try:
        image_data = utils.get_image_as_base64(path)
    except FileNotFoundError:
        return {"cancelled": True}
    return {"cancelled": False, "image_data": image_data, "path": path}


@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...)) -> dict:
    """Upload an image and return a URL to serve it."""
    _TMP_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "image.png").suffix or ".png"
    filename = f"{uuid.uuid4().hex[:12]}{ext}"
    dest = _TMP_DIR / filename
    content = await file.read()
    dest.write_bytes(content)

    return {"url": f"/api/images/.tmp/{filename}", "path": str(dest)}


@router.get("/images/{path:path}")
async def serve_image(path: str, request: Request) -> FileResponse:
    """Serve image files from the bank directory or .tmp."""
    cache = _get_cache(request)

    # Check if it's a .tmp path
    if path.startswith(".tmp/"):
        project_root = Path(__file__).resolve().parent.parent
        abs_path = project_root / path
    elif cache.root_path:
        abs_path = Path(cache.root_path) / path
    else:
        raise HTTPException(status_code=400, detail="题库未打开")

    abs_path = abs_path.resolve()

    # Security: ensure the path doesn't escape
    if cache.root_path:
        root_resolved = Path(cache.root_path).resolve()
        project_root = Path(__file__).resolve().parent.parent
        if not (
            str(abs_path).startswith(str(root_resolved))
            or str(abs_path).startswith(str(project_root / ".tmp"))
        ):
            raise HTTPException(status_code=403, detail="禁止访问该路径")

    if not abs_path.exists() or not abs_path.is_file():
        raise HTTPException(status_code=404, detail="图片未找到")

    return FileResponse(abs_path)
