from __future__ import annotations

import json
import re
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.cache import CacheManager


# ---------------------------------------------------------------------------
# Question saving
# ---------------------------------------------------------------------------

_Q_DIR_PATTERN = re.compile(r"^Q(\d{4,})$")


def _next_question_id(branch: Path) -> str:
    """Determine the next Q-number in *branch* (e.g. ``Q0005``)."""
    max_num = 0
    if branch.is_dir():
        for child in branch.iterdir():
            m = _Q_DIR_PATTERN.match(child.name)
            if m:
                max_num = max(max_num, int(m.group(1)))
    return f"Q{max_num + 1:04d}"


def save_question(
    branch_path: str,
    question_data: dict,
    images: dict[str, bytes],
) -> str:
    """Save a new question into *branch_path*.

    Parameters
    ----------
    branch_path:
        The branch directory to create the question in.
    question_data:
        Dict with keys: question_type, question_content, option_mode,
        options, answer_type, answer_content, correct_indices, tags.
    images:
        Mapping from logical name (``question_image``, ``answer_image``,
        ``option_A``, …) to raw image bytes.

    Returns the path to the newly-created question directory.
    """
    branch = Path(branch_path)
    if not branch.is_dir():
        raise FileNotFoundError(f"Branch directory not found: {branch_path}")

    q_id = _next_question_id(branch)
    q_dir = branch / q_id
    q_dir.mkdir(parents=True, exist_ok=False)

    # --- Question stem ---------------------------------------------------
    q_type = question_data.get("question_type", "text")
    if q_type == "text":
        q_content = question_data.get("question_content", "")
        (q_dir / "question.md").write_text(q_content, encoding="utf-8")
    elif q_type == "image" and "question_image" in images:
        _write_image(q_dir / "question.png", images["question_image"])

    # --- Options ----------------------------------------------------------
    option_mode = question_data.get("option_mode", "text")
    options = question_data.get("options", [])

    if option_mode == "text":
        for opt in options:
            label = opt.get("label", "A")
            content = opt.get("content", "")
            (q_dir / f"option_{label}.md").write_text(content, encoding="utf-8")
    elif option_mode == "single_image" and "options_image" in images:
        _write_image(q_dir / "options.png", images["options_image"])
    elif option_mode == "split_images":
        for opt in options:
            label = opt.get("label", "A")
            key = f"option_{label}"
            if key in images:
                _write_image(q_dir / f"option_{label}.png", images[key])

    # --- Answer -----------------------------------------------------------
    a_type = question_data.get("answer_type", "text")
    if a_type == "text":
        a_content = question_data.get("answer_content", "")
        (q_dir / "answer.md").write_text(a_content, encoding="utf-8")
    elif a_type == "image" and "answer_image" in images:
        _write_image(q_dir / "answer.png", images["answer_image"])

    # --- Meta (correct indices + tags) ------------------------------------
    meta = {
        "correct_indices": question_data.get("correct_indices", []),
        "tags": question_data.get("tags", []),
    }
    with (q_dir / "meta.json").open("w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    return str(q_dir)


def _write_image(dest: Path, data: bytes) -> None:
    """Write raw bytes to *dest*."""
    dest.write_bytes(data)


# ---------------------------------------------------------------------------
# Rename helpers
# ---------------------------------------------------------------------------

def rename_branch(old_path: str, new_name: str) -> str:
    """Rename a branch directory. Returns the new absolute path.

    Raises ``ValueError`` if the target already exists.
    """
    src = Path(old_path)
    if not src.is_dir():
        raise FileNotFoundError(f"Branch not found: {old_path}")

    dest = src.parent / new_name
    if dest.exists():
        raise ValueError(f"Target already exists: {dest}")

    src.rename(dest)
    return str(dest)


def rename_tag(cache: CacheManager, old_path: str, new_name: str) -> None:
    """Rename a leaf (or subtree root) in the tag tree.

    *old_path* uses ``'parent/child'`` notation.  The last segment is
    replaced with *new_name*.

    This also updates ``meta.json`` in every question that references the
    old tag path so they stay consistent.
    """
    parts = [p.strip() for p in old_path.split("/") if p.strip()]
    if not parts:
        raise ValueError("Empty tag path")

    # Navigate to the parent node
    node = cache.tags
    for part in parts[:-1]:
        if part not in node:
            raise ValueError(f"Tag path not found: {old_path}")
        node = node[part]

    old_key = parts[-1]
    if old_key not in node:
        raise ValueError(f"Tag not found: {old_path}")

    if new_name in node:
        raise ValueError(f"Tag already exists: {new_name}")

    # Move subtree to new key
    node[new_name] = node.pop(old_key)
    cache.save_tags()

    # Build old and new full paths for meta.json updates
    new_parts = parts[:-1] + [new_name]
    old_prefix = "/".join(parts)
    new_prefix = "/".join(new_parts)

    # Update question meta files
    for q_path in cache.questions:
        meta_file = Path(q_path) / "meta.json"
        if not meta_file.exists():
            continue
        try:
            with meta_file.open("r", encoding="utf-8") as f:
                meta = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue

        tags: list[str] = meta.get("tags", [])
        updated = False
        new_tags: list[str] = []
        for tag in tags:
            if tag == old_prefix or tag.startswith(old_prefix + "/"):
                new_tags.append(new_prefix + tag[len(old_prefix):])
                updated = True
            else:
                new_tags.append(tag)

        if updated:
            meta["tags"] = new_tags
            with meta_file.open("w", encoding="utf-8") as f:
                json.dump(meta, f, ensure_ascii=False, indent=2)
