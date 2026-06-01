from __future__ import annotations

import json
import re
from pathlib import Path


# ---------------------------------------------------------------------------
# Question loading
# ---------------------------------------------------------------------------

def _detect_content(directory: Path, prefix: str) -> dict:
    """Detect content type and value for a given file prefix in *directory*.

    Looks for ``{prefix}.md`` (text) or ``{prefix}.png/.jpg/.jpeg/.webp`` (image).
    Returns ``{'type': 'text'|'image', 'content': str}``.
    """
    md_file = directory / f"{prefix}.md"
    if md_file.exists():
        try:
            return {"type": "text", "content": md_file.read_text(encoding="utf-8")}
        except OSError:
            pass

    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        img_file = directory / f"{prefix}{ext}"
        if img_file.exists():
            return {"type": "image", "content": str(img_file)}

    return {"type": "text", "content": ""}


def _detect_option_mode(q_dir: Path) -> str:
    """Determine option mode: 'text', 'single_image', or 'split_images'."""
    # Check for options image (single combined image)
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        if (q_dir / f"options{ext}").exists():
            return "single_image"

    # Check for individual option images (option_A.png, option_B.png, …)
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        if (q_dir / f"option_A{ext}").exists():
            return "split_images"

    return "text"


def _load_options(q_dir: Path, option_mode: str) -> list[dict]:
    """Load options based on the detected option mode."""
    options: list[dict] = []

    if option_mode == "single_image":
        content = _detect_content(q_dir, "options")
        options.append({"label": "ALL", **content})
        return options

    if option_mode == "split_images":
        for label in "ABCDEFGH":
            content = _detect_content(q_dir, f"option_{label}")
            if content["content"]:
                options.append({"label": label, **content})
        return options

    # text mode – try option_A.md, option_B.md, …
    for label in "ABCDEFGH":
        content = _detect_content(q_dir, f"option_{label}")
        if content["content"]:
            options.append({"label": label, **content})

    # Fallback: try options.md with line-by-line parsing  (A. xxx / B. xxx)
    if not options:
        options_md = q_dir / "options.md"
        if options_md.exists():
            try:
                text = options_md.read_text(encoding="utf-8")
                pattern = re.compile(r"^([A-H])[.、)]\s*(.*)", re.MULTILINE)
                for m in pattern.finditer(text):
                    options.append({
                        "label": m.group(1),
                        "type": "text",
                        "content": m.group(2).strip(),
                    })
            except OSError:
                pass

    return options


def load_question(q_dir: str) -> dict:
    """Load a question from its directory path.

    Returns a dict with keys: id, path, question, options, answer,
    correct_indices, tags, option_mode.
    """
    d = Path(q_dir)
    if not d.is_dir():
        raise FileNotFoundError(f"Question directory not found: {q_dir}")

    question = _detect_content(d, "question")
    answer = _detect_content(d, "answer")
    option_mode = _detect_option_mode(d)
    options = _load_options(d, option_mode)

    # Correct answer indices from meta.json
    correct_indices: list[int] = []
    tags: list[str] = []

    meta_file = d / "meta.json"
    if meta_file.exists():
        try:
            with meta_file.open("r", encoding="utf-8") as f:
                meta = json.load(f)
            correct_indices = meta.get("correct_indices", [])
            tags = meta.get("tags", [])
        except (json.JSONDecodeError, OSError):
            pass

    return {
        "id": d.name,
        "path": str(d),
        "question": question,
        "options": options,
        "answer": answer,
        "correct_indices": correct_indices,
        "tags": tags,
        "option_mode": option_mode,
    }


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

_HISTORY_FILE = Path(__file__).resolve().parent.parent / ".history.json"
_MAX_HISTORY = 20


def load_history() -> list[str]:
    """Load recent bank paths from ``.history.json``."""
    if not _HISTORY_FILE.exists():
        return []
    try:
        with _HISTORY_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return [str(p) for p in data]
    except (json.JSONDecodeError, OSError):
        pass
    return []


def save_history(path: str) -> None:
    """Add *path* to the front of the history list (dedup & cap)."""
    history = load_history()
    resolved = str(Path(path).resolve())

    # Remove duplicates
    history = [h for h in history if h != resolved]
    history.insert(0, resolved)
    history = history[:_MAX_HISTORY]

    with _HISTORY_FILE.open("w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)
