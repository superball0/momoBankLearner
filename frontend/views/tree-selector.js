/**
 * tree-selector.js — 分支 & 标签选择视图
 *
 * 在用户从录入模式点击"保存"后显示，让用户选择目标分支（文件夹）和标签，
 * 然后确认保存题目。
 *
 * 导出: renderTreeSelector(app)
 */

import { api, createEl, showToast } from '/static/tools/utils.js';

// ── 本地状态 ──────────────────────────────────────────────
let selectedBranch = null;   // 选中分支的 path
let selectedTags = [];       // 选中标签 path 的数组
let branchData = null;       // GET /api/branches 返回的树
let tagData = null;          // GET /api/tags 返回的嵌套字典

// DOM 引用
let branchTreeBody = null;
let tagTreeBody = null;
let statusBarEl = null;

// ══════════════════════════════════════════════════════════
//  主入口
// ══════════════════════════════════════════════════════════

/**
 * 渲染分支 & 标签选择视图
 * @param {object} app - 应用实例，需要 app.container / app.state / app.navigate
 */
export function renderTreeSelector(app) {
    // 恢复上次选择（如果有）
    selectedBranch = app.state.selectedBranch || null;
    selectedTags = app.state.selectedTags ? [...app.state.selectedTags] : [];

    const container = app.container;
    container.innerHTML = '';

    const view = createEl('div', { class: 'tree-selector-view view-container' });

    // ── 顶部标题栏 ──────────────────────────────────────
    const header = createEl('div', { class: 'tree-topbar' }, [
        createEl('span', { class: 'title', textContent: '📍 选择题库分支和 Tag' }),
    ]);
    view.appendChild(header);

    // ── 双栏主体 ────────────────────────────────────────
    const content = createEl('div', { class: 'tree-content' });

    // 左侧: 分支目录
    const branchPanel = createEl('div', { class: 'tree-panel' });
    const branchHeader = createEl('div', { class: 'tree-panel-header' }, [
        createEl('h3', { textContent: '📁 分支目录' }),
    ]);
    branchPanel.appendChild(branchHeader);

    branchTreeBody = createEl('div', { class: 'tree-panel-body' });
    branchTreeBody.innerHTML = '<div class="loading-spinner">加载中...</div>';
    branchPanel.appendChild(branchTreeBody);

    // 分支操作按钮
    const branchActions = createEl('div', { class: 'tree-actions' }, [
        createEl('button', {
            class: 'btn btn-sm',
            textContent: '➕ 新建子分支',
            events: { click: () => createBranch(app) },
        }),
        createEl('button', {
            class: 'btn btn-sm',
            textContent: '📝 重命名',
            events: { click: () => renameBranchSelected(app) },
        }),
    ]);
    branchPanel.appendChild(branchActions);
    content.appendChild(branchPanel);

    // 右侧: 标签
    const tagPanel = createEl('div', { class: 'tree-panel' });
    const tagHeader = createEl('div', { class: 'tree-panel-header' }, [
        createEl('h3', { textContent: '🏷️ Tags（可多选）' }),
    ]);
    tagPanel.appendChild(tagHeader);

    tagTreeBody = createEl('div', { class: 'tree-panel-body' });
    tagTreeBody.innerHTML = '<div class="loading-spinner">加载中...</div>';
    tagPanel.appendChild(tagTreeBody);

    // 标签操作按钮
    const tagActions = createEl('div', { class: 'tree-actions' }, [
        createEl('button', {
            class: 'btn btn-sm',
            textContent: '➕ 新建 Tag',
            events: { click: () => createTag(app) },
        }),
        createEl('button', {
            class: 'btn btn-sm',
            textContent: '📝 重命名 Tag',
            events: { click: () => renameTagSelected(app) },
        }),
    ]);
    tagPanel.appendChild(tagActions);
    content.appendChild(tagPanel);

    view.appendChild(content);

    // ── 状态栏 ──────────────────────────────────────────
    statusBarEl = createEl('div', { class: 'status-bar' });
    updateStatusBar();
    view.appendChild(statusBarEl);

    // ── 底部按钮栏 ──────────────────────────────────────
    const bottomBar = createEl('div', { class: 'tree-bottombar' }, [
        createEl('button', {
            class: 'btn btn-ghost',
            textContent: '← 返回编辑',
            events: { click: () => app.navigate('entry') },
        }),
        createEl('button', {
            class: 'btn btn-accent btn-lg',
            textContent: '✅ 确认保存',
            events: { click: () => confirmSave(app) },
        }),
    ]);
    view.appendChild(bottomBar);

    container.appendChild(view);

    // ── 加载数据 ────────────────────────────────────────
    loadBranches(app);
    loadTags(app);
}

// ══════════════════════════════════════════════════════════
//  数据加载
// ══════════════════════════════════════════════════════════

async function loadBranches(app) {
    try {
        branchData = await api('GET', '/api/branches');
        renderBranchTree();
    } catch (err) {
        branchTreeBody.innerHTML = '<div class="empty-state">加载分支失败</div>';
    }
}

async function loadTags(app) {
    try {
        tagData = await api('GET', '/api/tags');
        renderTagTree();
    } catch (err) {
        tagTreeBody.innerHTML = '<div class="empty-state">加载标签失败</div>';
    }
}

// ══════════════════════════════════════════════════════════
//  分支树渲染
// ══════════════════════════════════════════════════════════

function renderBranchTree() {
    branchTreeBody.innerHTML = '';
    if (!branchData) return;

    // branchData 可以是单个根节点对象或数组
    if (branchData.children !== undefined) {
        branchTreeBody.appendChild(buildBranchNode(branchData, 0));
    } else if (Array.isArray(branchData)) {
        for (const node of branchData) {
            branchTreeBody.appendChild(buildBranchNode(node, 0));
        }
    }
}

/**
 * 递归构建分支节点
 */
function buildBranchNode(node, depth) {
    const el = createEl('div', { class: 'tree-node' });
    const hasChildren = node.children && node.children.length > 0;
    let expanded = depth < 2; // 默认展开前两层

    // ── 行
    const row = createEl('div', {
        class: `tree-node-row ${selectedBranch === node.path ? 'selected' : ''}`,
    });
    row.style.paddingLeft = `${10 + depth * 20}px`;

    // 箭头
    const arrow = createEl('span', {
        class: `tree-arrow ${hasChildren ? (expanded ? 'expanded' : '') : 'empty'}`,
        textContent: '▶',
    });
    row.appendChild(arrow);

    // 图标
    row.appendChild(createEl('span', { class: 'tree-icon', textContent: '📁' }));

    // 名称
    row.appendChild(createEl('span', { class: 'tree-label', textContent: node.name }));

    // 行内操作（hover 显示）
    const actions = createEl('div', { class: 'tree-node-actions' });
    actions.appendChild(createEl('button', {
        class: 'tree-node-action-btn',
        textContent: '✏',
        title: '重命名',
        events: {
            click: (e) => {
                e.stopPropagation();
                promptRenameBranch(node);
            },
        },
    }));
    actions.appendChild(createEl('button', {
        class: 'tree-node-action-btn',
        textContent: '+',
        title: '新建子分支',
        events: {
            click: (e) => {
                e.stopPropagation();
                promptCreateBranch(node.path);
            },
        },
    }));
    row.appendChild(actions);

    // 点击处理
    row.addEventListener('click', (e) => {
        if (e.target === arrow || e.target.closest('.tree-arrow')) {
            // 展开/折叠
            if (hasChildren) {
                expanded = !expanded;
                arrow.classList.toggle('expanded', expanded);
                childrenEl.style.display = expanded ? 'block' : 'none';
            }
            return;
        }
        // 选中分支
        selectedBranch = node.path;
        // 更新所有行的高亮
        for (const r of branchTreeBody.querySelectorAll('.tree-node-row')) {
            r.classList.remove('selected');
        }
        row.classList.add('selected');
        updateStatusBar();
    });

    el.appendChild(row);

    // ── 子节点容器
    const childrenEl = createEl('div', { class: 'tree-children' });
    childrenEl.style.display = expanded ? 'block' : 'none';
    if (hasChildren) {
        for (const child of node.children) {
            childrenEl.appendChild(buildBranchNode(child, depth + 1));
        }
    }
    el.appendChild(childrenEl);

    return el;
}

// ══════════════════════════════════════════════════════════
//  标签树渲染
// ══════════════════════════════════════════════════════════

function renderTagTree() {
    tagTreeBody.innerHTML = '';
    if (!tagData) return;

    for (const [key, val] of Object.entries(tagData)) {
        tagTreeBody.appendChild(buildTagNode(key, val, '', 0));
    }
}

/**
 * 递归构建标签节点（含 checkbox）
 */
function buildTagNode(name, children, parentPath, depth) {
    const path = parentPath ? `${parentPath}/${name}` : name;
    const el = createEl('div', { class: 'tree-node' });
    const childKeys = Object.keys(children || {});
    const hasChildren = childKeys.length > 0;
    let expanded = depth < 2;

    const isChecked = selectedTags.includes(path);

    // ── 行
    const row = createEl('div', {
        class: `tree-node-row ${isChecked ? 'checked' : ''}`,
    });
    row.style.paddingLeft = `${10 + depth * 20}px`;

    // 箭头
    const arrow = createEl('span', {
        class: `tree-arrow ${hasChildren ? (expanded ? 'expanded' : '') : 'empty'}`,
        textContent: '▶',
    });
    row.appendChild(arrow);

    // 复选框
    const checkbox = createEl('span', {
        class: `tree-checkbox ${isChecked ? 'checked' : ''}`,
        textContent: isChecked ? '☑' : '☐',
    });
    row.appendChild(checkbox);

    // 名称
    row.appendChild(createEl('span', { class: 'tree-label', textContent: name }));

    // 行内操作
    const actions = createEl('div', { class: 'tree-node-actions' });
    actions.appendChild(createEl('button', {
        class: 'tree-node-action-btn',
        textContent: '✏',
        title: '重命名',
        events: {
            click: (e) => {
                e.stopPropagation();
                promptRenameTag(path, name);
            },
        },
    }));
    actions.appendChild(createEl('button', {
        class: 'tree-node-action-btn',
        textContent: '+',
        title: '新建子标签',
        events: {
            click: (e) => {
                e.stopPropagation();
                promptCreateTag(path);
            },
        },
    }));
    row.appendChild(actions);

    // 点击处理
    row.addEventListener('click', (e) => {
        if (e.target === arrow || e.target.closest('.tree-arrow')) {
            if (hasChildren) {
                expanded = !expanded;
                arrow.classList.toggle('expanded', expanded);
                childrenEl.style.display = expanded ? 'block' : 'none';
            }
            return;
        }
        // 切换选中状态
        const idx = selectedTags.indexOf(path);
        if (idx >= 0) {
            selectedTags.splice(idx, 1);
        } else {
            selectedTags.push(path);
        }
        const nowChecked = selectedTags.includes(path);
        checkbox.classList.toggle('checked', nowChecked);
        checkbox.textContent = nowChecked ? '☑' : '☐';
        row.classList.toggle('checked', nowChecked);
        updateStatusBar();
    });

    el.appendChild(row);

    // ── 子节点容器
    const childrenEl = createEl('div', { class: 'tree-children' });
    childrenEl.style.display = expanded ? 'block' : 'none';
    if (hasChildren) {
        for (const key of childKeys) {
            childrenEl.appendChild(buildTagNode(key, children[key], path, depth + 1));
        }
    }
    el.appendChild(childrenEl);

    return el;
}

// ══════════════════════════════════════════════════════════
//  状态栏
// ══════════════════════════════════════════════════════════

function updateStatusBar() {
    if (!statusBarEl) return;
    statusBarEl.innerHTML = '';

    const branchText = selectedBranch || '未选择';
    const tagsText = selectedTags.length > 0 ? selectedTags.join(', ') : '未选择';

    statusBarEl.appendChild(
        createEl('span', { class: 'status-bar-item' }, [
            createEl('strong', { textContent: '分支: ' }),
            createEl('span', {
                textContent: branchText,
                style: { color: selectedBranch ? 'var(--text)' : 'var(--text-dim)' },
            }),
        ]),
    );

    statusBarEl.appendChild(
        createEl('span', { class: 'status-bar-sep', textContent: '|' }),
    );

    statusBarEl.appendChild(
        createEl('span', { class: 'status-bar-item' }, [
            createEl('strong', { textContent: 'Tags: ' }),
            createEl('span', {
                textContent: tagsText,
                style: { color: selectedTags.length ? 'var(--text)' : 'var(--text-dim)' },
            }),
        ]),
    );
}

// ══════════════════════════════════════════════════════════
//  分支 CRUD
// ══════════════════════════════════════════════════════════

async function createBranch(app) {
    const parentPath = selectedBranch || '';
    await promptCreateBranch(parentPath);
}

async function promptCreateBranch(parentPath) {
    const name = prompt('输入新分支名称:');
    if (!name) return;
    try {
        await api('POST', '/api/branch', { parent_path: parentPath, name });
        await loadBranches();
        showToast('分支已创建', 'success');
    } catch (err) {
        showToast('创建分支失败: ' + err.message, 'error');
    }
}

async function renameBranchSelected(app) {
    if (!selectedBranch) {
        showToast('请先选择一个分支', 'error');
        return;
    }
    // 从 path 中提取当前名称
    const parts = selectedBranch.split('/');
    const oldName = parts[parts.length - 1] || selectedBranch;
    const newName = prompt('输入新名称:', oldName);
    if (!newName || newName === oldName) return;
    try {
        await api('PUT', '/api/branch/rename', {
            old_path: selectedBranch,
            new_name: newName,
        });
        // 更新选中路径
        parts[parts.length - 1] = newName;
        selectedBranch = parts.join('/');
        await loadBranches();
        updateStatusBar();
        showToast('已重命名', 'success');
    } catch (err) {
        showToast('重命名失败: ' + err.message, 'error');
    }
}

async function promptRenameBranch(node) {
    const newName = prompt('输入新名称:', node.name);
    if (!newName || newName === node.name) return;
    try {
        await api('PUT', '/api/branch/rename', {
            old_path: node.path,
            new_name: newName,
        });
        // 如果重命名的是当前选中的分支，更新选中路径
        if (selectedBranch === node.path) {
            const parts = node.path.split('/');
            parts[parts.length - 1] = newName;
            selectedBranch = parts.join('/');
            updateStatusBar();
        }
        await loadBranches();
        showToast('已重命名', 'success');
    } catch (err) {
        showToast('重命名失败: ' + err.message, 'error');
    }
}

// ══════════════════════════════════════════════════════════
//  标签 CRUD
// ══════════════════════════════════════════════════════════

async function createTag(app) {
    // 如果有选中的 tag 就作为父级
    const parentPath = selectedTags.length > 0
        ? selectedTags[selectedTags.length - 1]
        : '';
    await promptCreateTag(parentPath);
}

async function promptCreateTag(parentPath) {
    const name = prompt('输入新标签名称:');
    if (!name) return;
    const path = parentPath ? `${parentPath}/${name}` : name;
    try {
        await api('POST', '/api/tag', { path });
        await loadTags();
        showToast('标签已创建', 'success');
    } catch (err) {
        showToast('创建标签失败: ' + err.message, 'error');
    }
}

async function renameTagSelected(app) {
    if (selectedTags.length === 0) {
        showToast('请先选择一个标签', 'error');
        return;
    }
    const oldPath = selectedTags[selectedTags.length - 1];
    const parts = oldPath.split('/');
    const oldName = parts[parts.length - 1];
    const newName = prompt('输入新名称:', oldName);
    if (!newName || newName === oldName) return;
    try {
        await api('PUT', '/api/tag/rename', {
            old_path: oldPath,
            new_name: newName,
        });
        // 更新 selectedTags 中相关路径
        selectedTags = selectedTags.map((t) => {
            if (t === oldPath || t.startsWith(oldPath + '/')) {
                const p = oldPath.split('/');
                p[p.length - 1] = newName;
                const newBase = p.join('/');
                return t === oldPath ? newBase : newBase + t.slice(oldPath.length);
            }
            return t;
        });
        await loadTags();
        updateStatusBar();
        showToast('已重命名', 'success');
    } catch (err) {
        showToast('重命名失败: ' + err.message, 'error');
    }
}

async function promptRenameTag(oldPath, oldName) {
    const newName = prompt('输入新名称:', oldName);
    if (!newName || newName === oldName) return;
    try {
        await api('PUT', '/api/tag/rename', {
            old_path: oldPath,
            new_name: newName,
        });
        // 更新 selectedTags
        selectedTags = selectedTags.map((t) => {
            if (t === oldPath || t.startsWith(oldPath + '/')) {
                const parts = oldPath.split('/');
                parts[parts.length - 1] = newName;
                const newBase = parts.join('/');
                return t === oldPath ? newBase : newBase + t.slice(oldPath.length);
            }
            return t;
        });
        await loadTags();
        updateStatusBar();
        showToast('已重命名', 'success');
    } catch (err) {
        showToast('重命名失败: ' + err.message, 'error');
    }
}

// ══════════════════════════════════════════════════════════
//  确认保存
// ══════════════════════════════════════════════════════════

async function confirmSave(app) {
    // 1. 验证
    if (!selectedBranch) {
        showToast('请先选择一个分支', 'error');
        return;
    }

    const pq = app.state.pendingQuestion;
    if (!pq) {
        showToast('没有待保存的题目数据', 'error');
        return;
    }

    // 2. 构建 FormData
    const fd = new FormData();
    fd.append('branch_path', selectedBranch);
    fd.append('question_type', pq.questionType || '');
    fd.append('question_content', pq.questionContent || '');
    fd.append('option_mode', pq.optionMode || 'text');
    fd.append('options_json', JSON.stringify(pq.options || []));
    fd.append('answer_type', pq.answerType || '');
    fd.append('answer_content', pq.answerContent || '');
    fd.append('correct_indices', JSON.stringify(pq.correctIndices || []));
    fd.append('tags', JSON.stringify(selectedTags));

    // 附加图片文件
    if (pq.questionImages) {
        pq.questionImages.forEach((blob, i) => {
            fd.append('question_images', blob, `q_img_${i}.png`);
        });
    }
    if (pq.answerImages) {
        pq.answerImages.forEach((blob, i) => {
            fd.append('answer_images', blob, `a_img_${i}.png`);
        });
    }

    // 3. POST
    try {
        const resp = await fetch('/api/question', { method: 'POST', body: fd });
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`${resp.status}: ${text}`);
        }

        // 4. 成功
        showToast('✅ 题目已保存！', 'success');

        // 5. 清理
        app.state.pendingQuestion = null;
        selectedBranch = null;
        selectedTags = [];

        // 6. 返回录入模式
        app.navigate('entry');
    } catch (err) {
        showToast('保存失败: ' + err.message, 'error');
    }
}
