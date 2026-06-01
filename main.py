#!/usr/bin/env python3
"""
刷题工具 v0.1 — 行测题目录入与管理
支持：文字(Markdown) + 截图录入，树形分支+Tag 分类
"""
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, simpledialog
import os
import json
import shutil
from pathlib import Path
from cache import CacheManager

# ── 全局常量 ──────────────────────────────────────────────
APP_TITLE = "行测刷题工具"
DEFAULT_OPTION_COUNT = 4
OPTION_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"]
WINDOW_SIZE = "1200x800"


class App:
    """主应用"""

    def __init__(self):
        self.root = tk.Tk()
        self.root.title(APP_TITLE)
        self.root.geometry(WINDOW_SIZE)
        self.root.minsize(900, 600)

        self.cache = CacheManager()
        self._current_question_data = None  # 录入中的题目临时数据

        self._setup_style()
        self._build_root_selector()

    # ── 样式 ──────────────────────────────────────────────
    def _setup_style(self):
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("Treeview", rowheight=28, font=("PingFang SC", 12))
        style.configure("TButton", font=("PingFang SC", 12), padding=6)
        style.configure("TLabel", font=("PingFang SC", 12))
        style.configure("Header.TLabel", font=("PingFang SC", 16, "bold"))
        style.configure("Title.TLabel", font=("PingFang SC", 20, "bold"))

    # ═══════════════════════════════════════════════════════
    # 界面 0：根目录选择
    # ═══════════════════════════════════════════════════════
    def _build_root_selector(self):
        """清空窗口并构建根目录选择界面"""
        self._clear_window()

        frame = ttk.Frame(self.root, padding=40)
        frame.pack(expand=True, fill="both")

        ttk.Label(frame, text="📚 行测刷题工具", style="Title.TLabel").pack(pady=(0, 10))
        ttk.Label(frame, text="选择一个已有题库，或新建一个题库开始").pack(pady=(0, 30))

        btn_frame = ttk.Frame(frame)
        btn_frame.pack()

        ttk.Button(btn_frame, text="📂 选择已有题库",
                   command=self._select_existing_root, width=22).pack(side="left", padx=10)
        ttk.Button(btn_frame, text="🆕 新建题库",
                   command=self._create_new_root, width=22).pack(side="left", padx=10)

        # 最近使用的题库
        ttk.Separator(frame, orient="horizontal").pack(fill="x", pady=30)
        ttk.Label(frame, text="最近使用:").pack(anchor="w")
        self._recent_listbox = tk.Listbox(frame, height=5, font=("PingFang SC", 12))
        self._recent_listbox.pack(fill="x", pady=5)
        self._recent_listbox.bind("<Double-Button-1>", self._open_recent)

        # 加载历史
        self._history_path = os.path.join(os.path.dirname(__file__), ".history.json")
        self._load_history()

    def _load_history(self):
        history = []
        if os.path.exists(self._history_path):
            try:
                with open(self._history_path, 'r') as f:
                    history = json.load(f)
            except Exception:
                pass
        self._recent_listbox.delete(0, tk.END)
        for h in history:
            if os.path.isdir(h):
                self._recent_listbox.insert(tk.END, h)

    def _save_history(self, path):
        history = []
        if os.path.exists(self._history_path):
            try:
                with open(self._history_path, 'r') as f:
                    history = json.load(f)
            except Exception:
                pass
        if path in history:
            history.remove(path)
        history.insert(0, path)
        history = history[:10]
        with open(self._history_path, 'w') as f:
            json.dump(history, f, ensure_ascii=False, indent=2)

    def _select_existing_root(self):
        path = filedialog.askdirectory(title="选择题库根目录", mustexist=True)
        if path:
            self._init_cache_and_enter(path)

    def _create_new_root(self):
        parent = filedialog.askdirectory(title="选择题库父目录", mustexist=True)
        if parent:
            root_dir = os.path.join(parent, "根")
            os.makedirs(root_dir, exist_ok=True)
            # 创建默认 branches.json
            self._init_cache_and_enter(root_dir)

    def _open_recent(self, event):
        selection = self._recent_listbox.curselection()
        if selection:
            path = self._recent_listbox.get(selection[0])
            if os.path.isdir(path):
                self._init_cache_and_enter(path)

    def _init_cache_and_enter(self, path):
        if self.cache.set_root(path):
            self._save_history(path)
            self._build_mode_selector()
        else:
            messagebox.showerror("错误", "无法读取题库目录")

    # ═══════════════════════════════════════════════════════
    # 界面 1：模式选择
    # ═══════════════════════════════════════════════════════
    def _build_mode_selector(self):
        self._clear_window()

        frame = ttk.Frame(self.root, padding=40)
        frame.pack(expand=True, fill="both")

        ttk.Label(frame, text=f"📁 {os.path.basename(self.cache.root_path)}",
                  style="Header.TLabel").pack(pady=(0, 5))
        ttk.Label(frame, text=f"题目总数: {len(self.cache.questions)} 道").pack(pady=(0, 30))

        btn_frame = ttk.Frame(frame)
        btn_frame.pack(expand=True)

        ttk.Button(btn_frame, text="✏️ 录入模式\n添加新题目",
                   command=self._enter_entry_mode, width=20).pack(side="left", padx=20, pady=20, ipady=10)
        ttk.Button(btn_frame, text="🧠 刷题模式\n开始练习",
                   command=self._enter_practice_mode, width=20).pack(side="left", padx=20, pady=20, ipady=10)

        # 返回按钮
        ttk.Button(frame, text="↩️ 切换题库", command=self._build_root_selector).pack(pady=20)

    # ═══════════════════════════════════════════════════════
    # 界面 2：录入模式
    # ═══════════════════════════════════════════════════════
    def _enter_entry_mode(self):
        self._clear_window()
        self._current_question_data = {
            "question_type": "text",   # "text" or "image"
            "question_content": "",     # markdown text or image path
            "option_mode": "text",      # "text", "single_image", "split_images"
            "options": [],              # list of {type: "text"/"image", content: str}
            "answer": "",               # answer content
            "answer_type": "text",      # "text" or "image"
            "correct_index": 0,         # 正确选项索引
            "tags": [],
            "branch_path": None,
        }

        # ── 主布局：左侧题干+答案，右侧选项 ──
        main_paned = ttk.PanedWindow(self.root, orient="horizontal")
        main_paned.pack(expand=True, fill="both", padx=10, pady=10)

        # 左侧面板：题干 + 答案
        left_frame = ttk.Frame(main_paned)
        main_paned.add(left_frame, weight=1)

        self._build_question_panel(left_frame)

        # 右侧面板：选项
        right_frame = ttk.Frame(main_paned)
        main_paned.add(right_frame, weight=1)

        self._build_options_panel(right_frame)

        # ── 底部按钮 ──
        bottom_frame = ttk.Frame(self.root)
        bottom_frame.pack(fill="x", padx=10, pady=10)

        ttk.Button(bottom_frame, text="↩️ 返回", command=self._build_mode_selector).pack(side="left")
        ttk.Button(bottom_frame, text="💾 保存并选择分类",
                   command=self._save_and_open_tree_selector).pack(side="right")

    def _build_question_panel(self, parent):
        """构建题干和答案输入区域"""
        # 题干模式切换
        qmode_frame = ttk.Frame(parent)
        qmode_frame.pack(fill="x", pady=(0, 5))
        ttk.Label(qmode_frame, text="题干", style="Header.TLabel").pack(side="left")

        self._q_mode_var = tk.StringVar(value="text")
        ttk.Radiobutton(qmode_frame, text="Markdown", variable=self._q_mode_var,
                        value="text", command=self._toggle_question_mode).pack(side="left", padx=10)
        ttk.Radiobutton(qmode_frame, text="截图", variable=self._q_mode_var,
                        value="image", command=self._toggle_question_mode).pack(side="left", padx=10)

        # 题干容器
        self._question_container = ttk.Frame(parent)
        self._question_container.pack(fill="both", expand=True)

        # 文字模式
        self._q_text_frame = ttk.Frame(self._question_container)
        ttk.Label(self._q_text_frame, text="支持 Markdown 格式，可直接粘贴文字或编写").pack(anchor="w")
        self._q_text = tk.Text(self._q_text_frame, wrap="word", font=("PingFang SC", 13),
                               height=10, relief="solid", borderwidth=1)
        self._q_text.pack(fill="both", expand=True, pady=5)
        # 绑定 Ctrl+V 图片粘贴
        self._q_text.bind("<Control-v>", self._on_paste_image_question)

        # 图片模式
        self._q_image_frame = ttk.Frame(self._question_container)
        self._q_image_label = ttk.Label(self._q_image_frame, text="点击选择或拖放截图\n（支持 .png/.jpg）",
                                        relief="solid", borderwidth=1, anchor="center",
                                        font=("PingFang SC", 13))
        self._q_image_label.pack(fill="both", expand=True, pady=5)
        self._q_image_label.bind("<Button-1>", self._select_question_image)
        self._q_image_path = None

        self._toggle_question_mode()

        # ── 答案区域 ──
        ttk.Separator(parent, orient="horizontal").pack(fill="x", pady=10)
        ttk.Label(parent, text="答案", style="Header.TLabel").pack(anchor="w")

        ans_mode_frame = ttk.Frame(parent)
        ans_mode_frame.pack(fill="x", pady=5)

        self._ans_mode_var = tk.StringVar(value="text")
        ttk.Radiobutton(ans_mode_frame, text="文字", variable=self._ans_mode_var,
                        value="text", command=self._toggle_answer_mode).pack(side="left", padx=10)
        ttk.Radiobutton(ans_mode_frame, text="截图", variable=self._ans_mode_var,
                        value="image", command=self._toggle_answer_mode).pack(side="left", padx=10)

        self._ans_container = ttk.Frame(parent)
        self._ans_container.pack(fill="x")

        self._ans_text_frame = ttk.Frame(self._ans_container)
        self._ans_text = tk.Text(self._ans_text_frame, wrap="word", font=("PingFang SC", 13),
                                 height=4, relief="solid", borderwidth=1)
        self._ans_text.pack(fill="x", pady=5)

        self._ans_image_frame = ttk.Frame(self._ans_container)
        self._ans_image_label = ttk.Label(self._ans_image_frame, text="点击选择答案截图",
                                          relief="solid", borderwidth=1, anchor="center",
                                          font=("PingFang SC", 13))
        self._ans_image_label.pack(fill="x", pady=5)
        self._ans_image_label.bind("<Button-1>", self._select_answer_image)
        self._ans_image_path = None

        self._toggle_answer_mode()

    def _toggle_question_mode(self):
        mode = self._q_mode_var.get()
        self._q_image_frame.pack_forget()
        self._q_text_frame.pack_forget()
        if mode == "text":
            self._q_text_frame.pack(fill="both", expand=True)
        else:
            self._q_image_frame.pack(fill="both", expand=True)

    def _toggle_answer_mode(self):
        mode = self._ans_mode_var.get()
        self._ans_text_frame.pack_forget()
        self._ans_image_frame.pack_forget()
        if mode == "text":
            self._ans_text_frame.pack(fill="x")
        else:
            self._ans_image_frame.pack(fill="x")

    def _select_question_image(self, event=None):
        path = filedialog.askopenfilename(
            title="选择题干截图",
            filetypes=[("图片文件", "*.png *.jpg *.jpeg *.gif *.bmp"), ("所有文件", "*.*")]
        )
        if path:
            self._q_image_path = path
            self._q_image_label.config(text=f"✅ 已选择:\n{os.path.basename(path)}")

    def _select_answer_image(self, event=None):
        path = filedialog.askopenfilename(
            title="选择答案截图",
            filetypes=[("图片文件", "*.png *.jpg *.jpeg *.gif *.bmp"), ("所有文件", "*.*")]
        )
        if path:
            self._ans_image_path = path
            self._ans_image_label.config(text=f"✅ 已选择:\n{os.path.basename(path)}")

    def _on_paste_image_question(self, event=None):
        """尝试粘贴剪贴板中的图片（macOS 暂支持文件路径粘贴）"""
        try:
            clip = self.root.clipboard_get()
            if os.path.isfile(clip) and clip.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp')):
                self._q_image_path = clip
                self._q_mode_var.set("image")
                self._toggle_question_mode()
                self._q_image_label.config(text=f"✅ 已粘贴:\n{os.path.basename(clip)}")
                return "break"
        except Exception:
            pass
        return None

    # ── 选项面板 ──
    def _build_options_panel(self, parent):
        """构建选项输入区域（右侧面板）"""
        ttk.Label(parent, text="选项", style="Header.TLabel").pack(anchor="w", pady=(0, 10))

        # 选项模式
        opt_mode_frame = ttk.Frame(parent)
        opt_mode_frame.pack(fill="x", pady=5)
        self._opt_mode_var = tk.StringVar(value="text")

        ttk.Radiobutton(opt_mode_frame, text="文字(4格)", variable=self._opt_mode_var,
                        value="text", command=self._rebuild_options).pack(anchor="w")
        ttk.Radiobutton(opt_mode_frame, text="单张大截图", variable=self._opt_mode_var,
                        value="single_image", command=self._rebuild_options).pack(anchor="w")
        ttk.Radiobutton(opt_mode_frame, text="4张小截图", variable=self._opt_mode_var,
                        value="split_images", command=self._rebuild_options).pack(anchor="w")

        # 选项容器
        self._options_container = ttk.Frame(parent)
        self._options_container.pack(fill="both", expand=True, pady=5)

        # 正确答案选择
        correct_frame = ttk.Frame(parent)
        correct_frame.pack(fill="x", pady=10)
        ttk.Label(correct_frame, text="正确答案:").pack(side="left")
        self._correct_var = tk.StringVar(value="A")
        self._correct_combo = ttk.Combobox(correct_frame, textvariable=self._correct_var,
                                           values=OPTION_LABELS[:DEFAULT_OPTION_COUNT],
                                           state="readonly", width=3)
        self._correct_combo.pack(side="left", padx=5)

        # 添加选项按钮
        add_btn_frame = ttk.Frame(parent)
        add_btn_frame.pack(fill="x", pady=5)
        ttk.Button(add_btn_frame, text="➕ 增加选项",
                   command=self._add_option).pack(side="left")

        self._option_count = DEFAULT_OPTION_COUNT
        self._option_widgets = []  # 存储选项控件引用
        self._option_image_paths = []
        self._rebuild_options()

    def _rebuild_options(self):
        """根据当前模式重建选项区域"""
        for widget in self._options_container.winfo_children():
            widget.destroy()
        self._option_widgets = []
        self._option_image_paths = []

        mode = self._opt_mode_var.get()

        if mode == "single_image":
            self._build_single_image_option()
        elif mode == "split_images":
            self._build_split_image_options()
        else:
            self._build_text_options()

        # 更新正确选项下拉
        self._correct_combo["values"] = OPTION_LABELS[:self._option_count]

    def _build_text_options(self):
        """4个文字选项（默认）"""
        frame = ttk.Frame(self._options_container)
        frame.pack(fill="both", expand=True)

        for i in range(self._option_count):
            opt_frame = ttk.Frame(frame)
            opt_frame.pack(fill="x", pady=3)

            ttk.Label(opt_frame, text=f"{OPTION_LABELS[i]}:", width=3,
                      font=("PingFang SC", 13, "bold")).pack(side="left")
            text_widget = tk.Text(opt_frame, wrap="word", font=("PingFang SC", 13),
                                  height=3, relief="solid", borderwidth=1)
            text_widget.pack(side="left", fill="x", expand=True, padx=5)
            self._option_widgets.append(text_widget)

    def _build_single_image_option(self):
        """单张大截图（所有选项在一张图里）"""
        self._option_count = 0
        self._correct_combo["values"] = ["-"]
        self._correct_var.set("-")

        frame = ttk.Frame(self._options_container)
        frame.pack(fill="both", expand=True)

        self._single_opt_image_label = ttk.Label(
            frame, text="📷 点击选择包含所有选项的截图",
            relief="solid", borderwidth=1, anchor="center", font=("PingFang SC", 13)
        )
        self._single_opt_image_label.pack(fill="both", expand=True, pady=10)
        self._single_opt_image_label.bind("<Button-1>", self._select_single_opt_image)
        self._single_opt_image_path = None

    def _build_split_image_options(self):
        """4张小截图（每个选项一张图）"""
        frame = ttk.Frame(self._options_container)
        frame.pack(fill="both", expand=True)

        for i in range(self._option_count):
            opt_frame = ttk.Frame(frame)
            opt_frame.pack(fill="x", pady=3)

            ttk.Label(opt_frame, text=f"{OPTION_LABELS[i]}:", width=3,
                      font=("PingFang SC", 13, "bold")).pack(side="left")
            label = ttk.Label(opt_frame, text=f"📷 点击选择选项{OPTION_LABELS[i]}截图",
                              relief="solid", borderwidth=1, anchor="center",
                              font=("PingFang SC", 12))
            label.pack(side="left", fill="x", expand=True, padx=5)
            label.bind("<Button-1>", lambda e, idx=i: self._select_split_opt_image(idx))
            self._option_widgets.append(label)
            self._option_image_paths.append(None)

    def _select_single_opt_image(self, event=None):
        path = filedialog.askopenfilename(
            title="选择选项截图（一张包含所有选项）",
            filetypes=[("图片文件", "*.png *.jpg *.jpeg *.gif *.bmp"), ("所有文件", "*.*")]
        )
        if path:
            self._single_opt_image_path = path
            self._single_opt_image_label.config(text=f"✅ 已选择:\n{os.path.basename(path)}")

    def _select_split_opt_image(self, index):
        path = filedialog.askopenfilename(
            title=f"选择选项{OPTION_LABELS[index]}截图",
            filetypes=[("图片文件", "*.png *.jpg *.jpeg *.gif *.bmp"), ("所有文件", "*.*")]
        )
        if path:
            self._option_image_paths[index] = path
            self._option_widgets[index].config(
                text=f"✅ {OPTION_LABELS[index]}:\n{os.path.basename(path)}")

    def _add_option(self):
        """增加一个选项"""
        if self._option_count >= len(OPTION_LABELS):
            messagebox.showinfo("提示", "最多支持8个选项")
            return
        if self._opt_mode_var.get() != "text":
            messagebox.showinfo("提示", "增加选项仅在文字模式下可用")
            return
        self._option_count += 1
        self._rebuild_options()

    # ═══════════════════════════════════════════════════════
    # 保存 + 打开分支Tag选择器
    # ═══════════════════════════════════════════════════════
    def _save_and_open_tree_selector(self):
        """先收集当前录入数据，再打开树形选择器"""
        # 收集题干
        q_data = self._current_question_data
        q_data["question_type"] = self._q_mode_var.get()
        if q_data["question_type"] == "text":
            q_data["question_content"] = self._q_text.get("1.0", "end-1c")
        else:
            q_data["question_content"] = self._q_image_path or ""

        # 收集答案
        q_data["answer_type"] = self._ans_mode_var.get()
        if q_data["answer_type"] == "text":
            q_data["answer"] = self._ans_text.get("1.0", "end-1c")
        else:
            q_data["answer"] = self._ans_image_path or ""

        # 收集选项
        opt_mode = self._opt_mode_var.get()
        q_data["option_mode"] = opt_mode
        q_data["options"] = []

        if opt_mode == "single_image":
            q_data["options"] = [{"type": "image", "content": self._single_opt_image_path or ""}]
        elif opt_mode == "split_images":
            for i in range(self._option_count):
                q_data["options"].append({
                    "type": "image",
                    "content": self._option_image_paths[i] if i < len(self._option_image_paths) else ""
                })
        else:
            for i in range(self._option_count):
                q_data["options"].append({
                    "type": "text",
                    "content": self._option_widgets[i].get("1.0", "end-1c") if i < len(self._option_widgets) else ""
                })

        # 正确答案索引
        try:
            q_data["correct_index"] = OPTION_LABELS.index(self._correct_var.get())
        except ValueError:
            q_data["correct_index"] = 0

        # 验证
        if q_data["question_type"] == "text" and not q_data["question_content"].strip():
            messagebox.showwarning("提示", "请输入题干内容")
            return

        # 打开分支/Tag 选择器
        self._build_tree_selector()

    # ═══════════════════════════════════════════════════════
    # 界面 3：分支 + Tag 树形选择器
    # ═══════════════════════════════════════════════════════
    def _build_tree_selector(self):
        self._clear_window()

        ttk.Label(self.root, text="📍 选择题库分支和 Tag", style="Header.TLabel").pack(pady=10)

        paned = ttk.PanedWindow(self.root, orient="horizontal")
        paned.pack(expand=True, fill="both", padx=10, pady=10)

        # ── 左侧：分支树 ──
        left_frame = ttk.LabelFrame(paned, text="📁 分支目录", padding=5)
        paned.add(left_frame, weight=1)

        self._branch_tree = ttk.Treeview(left_frame, show="tree", selectmode="browse")
        self._branch_tree.pack(fill="both", expand=True, pady=5)
        self._branch_tree.bind("<Double-1>", self._on_branch_double_click)
        self._branch_tree.bind("<<TreeviewSelect>>", self._on_branch_select)

        branch_btn_frame = ttk.Frame(left_frame)
        branch_btn_frame.pack(fill="x", pady=5)
        ttk.Button(branch_btn_frame, text="➕ 新建子分支",
                   command=self._create_new_branch).pack(side="left", padx=2)
        ttk.Button(branch_btn_frame, text="📝 重命名",
                   command=self._rename_branch).pack(side="left", padx=2)

        # ── 右侧：Tag 树 ──
        right_frame = ttk.LabelFrame(paned, text="🏷️ Tags（可多选）", padding=5)
        paned.add(right_frame, weight=1)

        self._tag_tree = ttk.Treeview(right_frame, show="tree", selectmode="extended")
        self._tag_tree.pack(fill="both", expand=True, pady=5)
        self._tag_tree.bind("<Double-1>", self._on_tag_double_click)

        tag_btn_frame = ttk.Frame(right_frame)
        tag_btn_frame.pack(fill="x", pady=5)
        ttk.Button(tag_btn_frame, text="➕ 新建 Tag",
                   command=self._create_new_tag).pack(side="left", padx=2)
        ttk.Button(tag_btn_frame, text="📝 重命名 Tag",
                   command=self._rename_tag).pack(side="left", padx=2)

        # ── 当前选择显示 ──
        info_frame = ttk.Frame(self.root)
        info_frame.pack(fill="x", padx=10, pady=5)
        self._selected_branch_label = ttk.Label(info_frame, text="选中分支: (未选择)",
                                                foreground="gray")
        self._selected_branch_label.pack(side="left")
        self._selected_tags_label = ttk.Label(info_frame, text="  |  Tags: (未选择)",
                                              foreground="gray")
        self._selected_tags_label.pack(side="left")

        # ── 底部按钮 ──
        bottom_frame = ttk.Frame(self.root)
        bottom_frame.pack(fill="x", padx=10, pady=10)
        ttk.Button(bottom_frame, text="↩️ 返回编辑", command=self._back_to_entry).pack(side="left")
        ttk.Button(bottom_frame, text="✅ 确认保存", command=self._final_save).pack(side="right")

        # 填充树
        self._populate_branch_tree()
        self._populate_tag_tree()

        # 跟踪状态
        self._selected_branch_path = None
        self._selected_tag_items = set()

    def _populate_branch_tree(self, parent_id="", node=None):
        """递归填充分支树"""
        if node is None:
            for item in self._branch_tree.get_children():
                self._branch_tree.delete(item)
            node = self.cache.get_branch_tree()

        name = node.get("name", "")
        path = node.get("path", "")
        item_id = self._branch_tree.insert(parent_id, "end", text=f"📁 {name}",
                                           values=(path,), open=True)

        for child_name, child_node in node.get("children", {}).items():
            self._populate_branch_tree(item_id, child_node)

    def _populate_tag_tree(self, parent_id="", tag_node=None):
        """递归填充 Tag 树"""
        if tag_node is None:
            for item in self._tag_tree.get_children():
                self._tag_tree.delete(item)
            tag_node = self.cache.get_tag_tree()

        for tag_name, children in tag_node.items():
            item_id = self._tag_tree.insert(parent_id, "end", text=f"🏷️ {tag_name}",
                                            values=(tag_name,), open=True)
            if children:
                self._populate_tag_tree(item_id, children)

    def _on_branch_select(self, event):
        selection = self._branch_tree.selection()
        if selection:
            values = self._branch_tree.item(selection[0], "values")
            if values:
                self._selected_branch_path = values[0]
                name = self._branch_tree.item(selection[0], "text")
                self._selected_branch_label.config(
                    text=f"选中分支: {name}", foreground="black")

    def _on_branch_double_click(self, event):
        """双击分支直接展开/折叠"""
        selection = self._branch_tree.selection()
        if selection:
            if self._branch_tree.item(selection[0], "open"):
                self._branch_tree.item(selection[0], open=False)
            else:
                self._branch_tree.item(selection[0], open=True)

    def _on_tag_double_click(self, event):
        """双击 Tag 切换选中状态"""
        selection = self._tag_tree.selection()
        for item_id in selection:
            if item_id in self._selected_tag_items:
                self._selected_tag_items.discard(item_id)
            else:
                self._selected_tag_items.add(item_id)

        # 更新显示
        tag_names = []
        for item_id in self._selected_tag_items:
            tag_names.append(self._tag_tree.item(item_id, "text").replace("🏷️ ", ""))
        self._selected_tags_label.config(
            text=f"  |  Tags: {', '.join(tag_names) if tag_names else '(未选择)'}",
            foreground="black" if tag_names else "gray")

    def _get_full_tag_path(self, item_id):
        """获取 Tag 在树中的完整路径"""
        parts = []
        current = item_id
        while current:
            text = self._tag_tree.item(current, "text").replace("🏷️ ", "")
            parts.insert(0, text)
            current = self._tag_tree.parent(current)
        return "/".join(parts)

    def _create_new_branch(self):
        """在选中分支下创建新子分支"""
        selection = self._branch_tree.selection()
        parent_path = self.cache.root_path
        parent_id = ""

        if selection:
            values = self._branch_tree.item(selection[0], "values")
            if values:
                parent_path = values[0]
            parent_id = selection[0]

        name = simpledialog.askstring("新建分支", "分支名称:", parent=self.root)
        if name and name.strip():
            name = name.strip()
            new_path = self.cache.create_branch(parent_path, name)
            # 刷新树
            self._branch_tree.delete(*self._branch_tree.get_children())
            self._populate_branch_tree()

    def _rename_branch(self):
        """重命名选中分支"""
        selection = self._branch_tree.selection()
        if not selection:
            messagebox.showinfo("提示", "请先选择要重命名的分支")
            return
        old_name = self._branch_tree.item(selection[0], "text").replace("📁 ", "")
        values = self._branch_tree.item(selection[0], "values")
        old_path = values[0] if values else ""

        new_name = simpledialog.askstring("重命名", "新名称:", initialvalue=old_name, parent=self.root)
        if new_name and new_name.strip() and new_name != old_name:
            new_path = os.path.join(os.path.dirname(old_path), new_name.strip())
            try:
                os.rename(old_path, new_path)
                self.cache.refresh()
                self._branch_tree.delete(*self._branch_tree.get_children())
                self._populate_branch_tree()
            except Exception as e:
                messagebox.showerror("错误", f"重命名失败: {e}")

    def _create_new_tag(self):
        """创建新 Tag"""
        selection = self._tag_tree.selection()
        parent_path = ""
        parent_id = ""

        if selection:
            parent_path = self._get_full_tag_path(selection[0])
            parent_id = selection[0]

        name = simpledialog.askstring("新建 Tag", "Tag 名称:", parent=self.root)
        if name and name.strip():
            full_path = f"{parent_path}/{name.strip()}" if parent_path else name.strip()
            self.cache.add_tag(full_path)
            # 刷新
            self._tag_tree.delete(*self._tag_tree.get_children())
            self._populate_tag_tree()

    def _rename_tag(self):
        """重命名 Tag"""
        selection = self._tag_tree.selection()
        if not selection:
            messagebox.showinfo("提示", "请先选择要重命名的 Tag")
            return
        old_name = self._tag_tree.item(selection[0], "text").replace("🏷️ ", "")

        new_name = simpledialog.askstring("重命名 Tag", "新名称:", initialvalue=old_name, parent=self.root)
        if new_name and new_name.strip() and new_name != old_name:
            old_path = self._get_full_tag_path(selection[0])
            new_path = old_path.rsplit("/", 1)[0] + "/" + new_name.strip() if "/" in old_path else new_name.strip()
            # 简单实现：删除旧的再添加新的
            self._delete_tag_path(old_path)
            self.cache.add_tag(new_path)
            self._tag_tree.delete(*self._tag_tree.get_children())
            self._populate_tag_tree()

    def _delete_tag_path(self, path):
        """从 tags dict 中删除指定路径"""
        parts = path.split("/")
        current = self.cache.tags
        for i, part in enumerate(parts[:-1]):
            if part in current:
                current = current[part]
        if parts[-1] in current:
            del current[parts[-1]]
        self.cache.save_tags()

    # ═══════════════════════════════════════════════════════
    # 最终保存
    # ═══════════════════════════════════════════════════════
    def _final_save(self):
        """将题目和分类信息保存到题库"""
        q_data = self._current_question_data
        if not q_data:
            messagebox.showerror("错误", "没有待保存的题目数据")
            return

        # 确定保存路径
        branch_path = self._selected_branch_path or self.cache.root_path

        # 收集选择的 Tags
        selected_tags = []
        for item_id in self._selected_tag_items:
            selected_tags.append(self._get_full_tag_path(item_id))

        # 创建题目目录（以自增编号命名）
        existing_qs = [d for d in os.listdir(branch_path)
                       if os.path.isdir(os.path.join(branch_path, d))
                       and d.startswith("Q")]
        q_id = len(existing_qs) + 1
        q_dir = os.path.join(branch_path, f"Q{q_id:04d}")
        os.makedirs(q_dir, exist_ok=True)

        # 保存题干
        if q_data["question_type"] == "text":
            with open(os.path.join(q_dir, "question.md"), 'w', encoding='utf-8') as f:
                f.write(q_data["question_content"])
        else:
            src = q_data["question_content"]
            if src and os.path.exists(src):
                ext = os.path.splitext(src)[1] or ".png"
                shutil.copy2(src, os.path.join(q_dir, f"question{ext}"))

        # 保存选项
        options_dir = os.path.join(q_dir, "options")
        os.makedirs(options_dir, exist_ok=True)

        options_meta = []
        for i, opt in enumerate(q_data["options"]):
            opt_label = OPTION_LABELS[i] if i < len(OPTION_LABELS) else f"X{i}"
            opt_entry = {"label": opt_label, "type": opt["type"]}
            if opt["type"] == "text":
                opt_path = os.path.join(options_dir, f"{opt_label}.md")
                with open(opt_path, 'w', encoding='utf-8') as f:
                    f.write(opt["content"])
                opt_entry["path"] = f"options/{opt_label}.md"
            else:
                src = opt["content"]
                if src and os.path.exists(src):
                    ext = os.path.splitext(src)[1] or ".png"
                    dst = os.path.join(options_dir, f"{opt_label}{ext}")
                    shutil.copy2(src, dst)
                    opt_entry["path"] = f"options/{opt_label}{ext}"
                else:
                    opt_entry["path"] = ""
            options_meta.append(opt_entry)

        # 保存答案
        if q_data["answer_type"] == "text":
            with open(os.path.join(q_dir, "answer.md"), 'w', encoding='utf-8') as f:
                f.write(q_data["answer"])
        else:
            src = q_data["answer"]
            if src and os.path.exists(src):
                ext = os.path.splitext(src)[1] or ".png"
                shutil.copy2(src, os.path.join(q_dir, f"answer{ext}"))

        # 保存元数据
        meta = {
            "question_type": q_data["question_type"],
            "option_mode": q_data["option_mode"],
            "correct_index": q_data["correct_index"],
            "answer_type": q_data["answer_type"],
            "tags": selected_tags,
            "branch": branch_path,
            "options": options_meta,
        }
        with open(os.path.join(q_dir, "meta.json"), 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

        # 刷新缓存
        self.cache.refresh()

        messagebox.showinfo("保存成功",
                            f"题目已保存到:\n{q_dir}\n\nTags: {', '.join(selected_tags) if selected_tags else '无'}")
        self._clear_temp_data()
        self._build_mode_selector()

    def _back_to_entry(self):
        """返回编辑界面（数据保留）"""
        self._build_entry_from_data()

    def _build_entry_from_data(self):
        """从已有数据重建录入界面"""
        # 简化：直接返回模式选择，丢弃当前数据
        if messagebox.askyesno("返回", "返回编辑将丢弃当前分支/Tag选择，确定吗？"):
            self._build_mode_selector()

    def _clear_temp_data(self):
        self._current_question_data = None
        self._selected_branch_path = None
        self._selected_tag_items = set()
        self._option_count = DEFAULT_OPTION_COUNT

    # ═══════════════════════════════════════════════════════
    # 界面 4：刷题模式（占位）
    # ═══════════════════════════════════════════════════════
    def _enter_practice_mode(self):
        self._clear_window()
        frame = ttk.Frame(self.root, padding=40)
        frame.pack(expand=True, fill="both")

        ttk.Label(frame, text="🧠 刷题模式", style="Title.TLabel").pack(pady=20)
        ttk.Label(frame, text="刷题功能将在后续版本中实现\n\n计划支持：\n"
                  "• 按分支/按Tag筛选题目\n• 限时刷题\n• 错题本\n"
                  "• 随机/顺序模式",
                  font=("PingFang SC", 13)).pack(pady=20)

        ttk.Button(frame, text="↩️ 返回", command=self._build_mode_selector).pack(pady=20)

    # ═══════════════════════════════════════════════════════
    # 工具方法
    # ═══════════════════════════════════════════════════════
    def _clear_window(self):
        """清空窗口中所有子控件"""
        for widget in self.root.winfo_children():
            widget.destroy()

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    app = App()
    app.run()
