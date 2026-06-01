"""
刷题工具 - 缓存管理器
功能：扫描题库根目录，构建内存中的分支树和 Tag 树
"""
import os
import json
from pathlib import Path
from typing import Optional


class CacheManager:
    """管理题库目录结构和 Tag 的缓存"""

    def __init__(self, root_path: Optional[str] = None):
        self.root_path = root_path
        self.branches: dict = {}       # 分支树 {"name": "根", "children": {...}, "questions": [...]}
        self.tags: dict = {}            # Tag树 {"tag名": {"parent": "父tag", "children": {...}}}
        self.questions: list = []       # 所有题目路径列表
        self.question_meta: dict = {}   # {题目路径: meta信息}

    def set_root(self, path: str) -> bool:
        """设置根目录并刷新缓存"""
        if not os.path.isdir(path):
            return False
        self.root_path = path
        self.refresh()
        return True

    def refresh(self):
        """重新扫描根目录，刷新全部缓存"""
        self.branches = {"name": "根", "children": {}, "questions": [], "path": self.root_path}
        self.tags = {}
        self.questions = []
        self.question_meta = {}
        if self.root_path and os.path.isdir(self.root_path):
            self._scan_directory(self.root_path, self.branches)
            self._load_tags()

    def _scan_directory(self, dir_path: str, parent_node: dict):
        """递归扫描目录，构建分支树"""
        try:
            entries = sorted(os.listdir(dir_path))
        except PermissionError:
            return

        for entry in entries:
            full_path = os.path.join(dir_path, entry)
            if entry.startswith('.') or entry.startswith('__'):
                continue

            if os.path.isdir(full_path):
                # 判断是否为题目目录（包含 question.md 或 question.png）
                is_question = (
                    os.path.exists(os.path.join(full_path, "question.md")) or
                    os.path.exists(os.path.join(full_path, "question.png")) or
                    os.path.exists(os.path.join(full_path, "question.jpg")) or
                    os.path.exists(os.path.join(full_path, "question.jpeg"))
                )
                if is_question:
                    self.questions.append(full_path)
                    parent_node.setdefault("questions", []).append(full_path)
                    # 加载 meta
                    meta_path = os.path.join(full_path, "meta.json")
                    if os.path.exists(meta_path):
                        try:
                            with open(meta_path, 'r', encoding='utf-8') as f:
                                self.question_meta[full_path] = json.load(f)
                        except Exception:
                            self.question_meta[full_path] = {"tags": []}
                    else:
                        self.question_meta[full_path] = {"tags": []}
                else:
                    # 普通分支目录
                    child_node = {
                        "name": entry,
                        "children": {},
                        "questions": [],
                        "path": full_path
                    }
                    parent_node.setdefault("children", {})[entry] = child_node
                    self._scan_directory(full_path, child_node)

    def _load_tags(self):
        """加载 tags.json"""
        if not self.root_path:
            return
        tags_path = os.path.join(self.root_path, "tags.json")
        if os.path.exists(tags_path):
            try:
                with open(tags_path, 'r', encoding='utf-8') as f:
                    self.tags = json.load(f)
            except Exception:
                self.tags = {}
        else:
            self.tags = {}

    def save_tags(self):
        """保存 tags.json"""
        if not self.root_path:
            return
        tags_path = os.path.join(self.root_path, "tags.json")
        with open(tags_path, 'w', encoding='utf-8') as f:
            json.dump(self.tags, f, ensure_ascii=False, indent=2)

    def add_tag(self, tag_path: str, parent_path: str = ""):
        """
        添加新 Tag
        tag_path: "实词-词义轻重" 或 "父级/子级"
        parent_path: 父 tag 路径
        """
        parts = tag_path.strip("/").split("/")
        current = self.tags
        for i, part in enumerate(parts):
            if part not in current:
                current[part] = {}
            current = current[part]
        self.save_tags()

    def get_tag_tree(self) -> dict:
        """获取 Tag 树结构（用于 UI 展示）"""
        return self.tags

    def get_branch_tree(self) -> dict:
        """获取分支树结构"""
        return self.branches

    def create_branch(self, parent_path: str, name: str) -> str:
        """在指定父路径下创建新分支目录，返回完整路径"""
        if not self.root_path:
            raise ValueError("未设置根目录")
        full_dir = os.path.join(parent_path, name)
        os.makedirs(full_dir, exist_ok=True)
        self.refresh()
        return full_dir

    def find_branch_node(self, path: str, tree: Optional[dict] = None) -> Optional[dict]:
        """在树中查找指定路径的节点"""
        if tree is None:
            tree = self.branches
        if tree.get("path") == path:
            return tree
        for child in tree.get("children", {}).values():
            result = self.find_branch_node(path, child)
            if result:
                return result
        return None

    def get_all_tags_flat(self) -> list:
        """获取所有 tag 的扁平列表"""
        result = []

        def flatten(tree, prefix=""):
            for name, children in tree.items():
                full = f"{prefix}/{name}" if prefix else name
                result.append(full)
                if children:
                    flatten(children, full)

        flatten(self.tags)
        return result
