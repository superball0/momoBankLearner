from __future__ import annotations

import base64
import subprocess
import uuid
from pathlib import Path


# Directory for temporary screenshot files (under project root)
_TMP_DIR = Path(__file__).resolve().parent.parent / ".tmp"


def take_screenshot() -> str | None:
    """Use macOS ``screencapture -i`` for an interactive screenshot.

    Returns the path to the captured image, or ``None`` if the user
    cancelled the capture.
    """
    _TMP_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"screenshot_{uuid.uuid4().hex[:8]}.png"
    dest = _TMP_DIR / filename

    result = subprocess.run(
        ["screencapture", "-i", str(dest)],
        capture_output=True,
        timeout=120,
    )

    # screencapture exits 0 even when cancelled, but won't create the file
    if result.returncode != 0 or not dest.exists() or dest.stat().st_size == 0:
        dest.unlink(missing_ok=True)
        return None

    return str(dest)


def get_image_as_base64(image_path: str) -> str:
    """Convert an image file to a ``data:image/…;base64,…`` URL string."""
    p = Path(image_path)
    if not p.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    suffix = p.suffix.lower().lstrip(".")
    mime_map = {
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "webp": "image/webp",
        "gif": "image/gif",
    }
    mime = mime_map.get(suffix, "image/png")

    raw = p.read_bytes()
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{b64}"
