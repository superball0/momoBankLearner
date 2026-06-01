from __future__ import annotations

import json
import re
from pathlib import Path


class CacheManager:
    """Manages question bank directory scanning, branch trees, and tag trees."""

    QUESTION_DIR_PATTERN = re.compile(r"^Q\d{4,}$")

    def __init__(self) -> None:
        self.root_path: str | None = None
        self.branches: dict = {}
        self.tags: dict = {}
        self.questions: list[str] = []
        self.question_meta: dict[str, dict] = {}

    # ------------------------------------------------------------------
    # Root management
    # ------------------------------------------------------------------

    def set_root(self, path: str) -> bool:
        """Set the question bank root directory. Returns True on success."""
        p = Path(path)
        if not p.is_dir():
            return False
        self.root_path = str(p.resolve())
        self.refresh()
        return True

    # ------------------------------------------------------------------
    # Scanning
    # ------------------------------------------------------------------

    def refresh(self) -> None:
        """Rescan the root directory to rebuild branches and questions."""
        if self.root_path is None:
            return

        root = Path(self.root_path)
        self.questions = []
        self.question_meta = {}
        self.branches = self._scan_branch(root)
        self._load_tags()

    def _is_question_dir(self, d: Path) -> bool:
        """Check if a directory is a question directory (Q0001, Q0002…)."""
        if not self.QUESTION_DIR_PATTERN.match(d.name):
            return False
        # Must contain question.md or question.png (or similar image)
        for ext in (".md", ".png", ".jpg", ".jpeg", ".webp"):
            if (d / f"question{ext}").exists():
                return True
        return False

    def _scan_branch(self, directory: Path) -> dict:
        """Recursively scan *directory* and return a branch tree node.

        Question directories are collected into ``self.questions`` and
        ``self.question_meta`` but are **not** included as branches.
        """
        node: dict = {
            "name": directory.name,
            "path": str(directory),
            "children": [],
            "question_count": 0,
        }

        if not directory.is_dir():
            return node

        for child in sorted(directory.iterdir()):
            if not child.is_dir():
                continue
            if child.name.startswith("."):
                continue

            if self._is_question_dir(child):
                q_path = str(child)
                self.questions.append(q_path)
                self.question_meta[q_path] = self._read_question_meta(child)
                node["question_count"] += 1
            else:
                child_node = self._scan_branch(child)
                node["children"].append(child_node)
                node["question_count"] += child_node["question_count"]

        return node

    @staticmethod
    def _read_question_meta(q_dir: Path) -> dict:
        """Read lightweight metadata for a question directory."""
        meta: dict = {"id": q_dir.name, "path": str(q_dir)}

        meta_file = q_dir / "meta.json"
        if meta_file.exists():
            try:
                with meta_file.open("r", encoding="utf-8") as f:
                    meta.update(json.load(f))
            except (json.JSONDecodeError, OSError):
                pass

        return meta

    # ------------------------------------------------------------------
    # Branch tree
    # ------------------------------------------------------------------

    def get_branch_tree(self) -> dict:
        """Return the branch tree dict."""
        return self.branches

    def create_branch(self, parent_path: str, name: str) -> str:
        """Create a new branch (sub-directory) under *parent_path*.

        Returns the absolute path of the newly-created directory.
        Raises ``ValueError`` on invalid input or conflict.
        """
        parent = Path(parent_path)
        if not parent.is_dir():
            raise ValueError(f"Parent path does not exist: {parent_path}")

        new_dir = parent / name
        if new_dir.exists():
            raise ValueError(f"Branch already exists: {new_dir}")

        new_dir.mkdir(parents=True, exist_ok=False)
        self.refresh()
        return str(new_dir)

    def get_questions_in_branch(self, branch_path: str) -> list[str]:
        """Return all question directory paths under *branch_path* (recursively)."""
        prefix = str(Path(branch_path).resolve())
        return [q for q in self.questions if q.startswith(prefix)]

    # ------------------------------------------------------------------
    # Tag tree
    # ------------------------------------------------------------------

    def _tags_file(self) -> Path | None:
        if self.root_path is None:
            return None
        return Path(self.root_path) / "tags.json"

    def _load_tags(self) -> None:
        tags_file = self._tags_file()
        if tags_file is not None and tags_file.exists():
            try:
                with tags_file.open("r", encoding="utf-8") as f:
                    self.tags = json.load(f)
            except (json.JSONDecodeError, OSError):
                self.tags = {}
        else:
            self.tags = {}

    def get_tag_tree(self) -> dict:
        """Return the tag tree dict."""
        return self.tags

    def save_tags(self) -> None:
        """Persist the current tag tree to ``tags.json``."""
        tags_file = self._tags_file()
        if tags_file is None:
            return
        with tags_file.open("w", encoding="utf-8") as f:
            json.dump(self.tags, f, ensure_ascii=False, indent=2)

    def add_tag(self, tag_path: str) -> None:
        """Add a tag using ``'parent/child'`` path notation.

        Intermediate nodes are created as needed.
        """
        parts = [p.strip() for p in tag_path.split("/") if p.strip()]
        if not parts:
            raise ValueError("Empty tag path")

        node = self.tags
        for part in parts:
            if part not in node:
                node[part] = {}
            node = node[part]

        self.save_tags()

    def delete_tag(self, tag_path: str) -> None:
        """Delete a tag (and all its children) at ``'parent/child'`` path."""
        parts = [p.strip() for p in tag_path.split("/") if p.strip()]
        if not parts:
            raise ValueError("Empty tag path")

        node = self.tags
        for part in parts[:-1]:
            if part not in node:
                return  # path doesn't exist, nothing to delete
            node = node[part]

        node.pop(parts[-1], None)
        self.save_tags()
