/**
 * BranchTagPicker — 分支 & 标签选择器组件
 *
 * 用法:
 *   const picker = new BranchTagPicker(container, {
 *       onBranchChange: (path) => { ... },
 *       onTagsChange: (tags) => { ... },
 *   });
 *   await picker.loadData();
 *   picker.getSelectedBranch()  → '/path/to/branch' | null
 *   picker.getSelectedTags()   → ['/tag/path', ...]
 *   picker.setSelectedBranch('/path/to/branch')
 *   picker.setSelectedTags(['/tag/path1', '/tag/path2'])
 */

import { api } from '/static/tools/utils.js';

// ── Inject Styles ────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('branch-tag-picker-styles')) return;
    const s = document.createElement('style');
    s.id = 'branch-tag-picker-styles';
    s.textContent = `
/* ── Picker Container ──────────────────────────────── */
.btp-container {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

/* ── Row ───────────────────────────────────────────── */
.btp-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 36px;
}

.btp-row-label {
    font-size: 14px;
    color: var(--text-secondary);
    white-space: nowrap;
    flex-shrink: 0;
    user-select: none;
}

/* ── Branch Button (looks like input) ──────────────── */
.btp-branch-wrapper {
    position: relative;
    flex: 1;
    min-width: 0;
}

.btp-branch-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 14px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: var(--font);
    font-size: 14px;
    cursor: pointer;
    transition: all var(--transition);
    outline: none;
    text-align: left;
    min-height: 40px;
}

.btp-branch-btn:hover {
    border-color: var(--border-light);
}

.btp-branch-btn:focus {
    border-color: var(--border-focus);
    box-shadow: 0 0 0 3px rgba(83, 52, 131, 0.15);
}

.btp-branch-btn .btp-branch-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.btp-branch-btn .btp-branch-placeholder {
    color: var(--text-dim);
}

.btp-branch-btn .btp-arrow {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-muted);
    margin-left: 8px;
    transition: transform var(--transition);
}

.btp-branch-btn.open .btp-arrow {
    transform: rotate(180deg);
}

/* ── Dropdown Panel ────────────────────────────────── */
.btp-dropdown {
    position: absolute;
    z-index: 200;
    top: calc(100% + 4px);
    left: 0;
    width: 100%;
    background: var(--surface-raised);
    border: 1px solid var(--border-light);
    box-shadow: var(--shadow-lg);
    border-radius: var(--radius-sm);
    max-height: 350px;
    display: flex;
    flex-direction: column;
    animation: btp-fadeIn 0.15s ease;
}

@keyframes btp-fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
}

/* ── Search ────────────────────────────────────────── */
.btp-search {
    width: 100%;
    padding: 8px 12px;
    background: var(--bg);
    border: none;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    font-family: var(--font);
    font-size: 13px;
    outline: none;
    position: sticky;
    top: 0;
    z-index: 1;
    flex-shrink: 0;
}

.btp-search::placeholder {
    color: var(--text-dim);
}

/* ── Tree ──────────────────────────────────────────── */
.btp-tree {
    overflow-y: auto;
    flex: 1;
    padding: 4px 0;
}

.btp-tree-node {
    user-select: none;
}

.btp-tree-node-row {
    display: flex;
    align-items: center;
    min-height: 38px;
    padding: 6px 12px;
    font-size: 14px;
    color: var(--text);
    cursor: pointer;
    transition: background var(--transition);
    gap: 6px;
}

.btp-tree-node-row:hover {
    background: var(--surface-hover);
}

.btp-tree-node-row.selected {
    background: var(--surface-active);
}

.btp-tree-toggle {
    flex-shrink: 0;
    width: 18px;
    font-size: 10px;
    color: var(--text-muted);
    text-align: center;
    transition: transform var(--transition);
    cursor: pointer;
}

.btp-tree-toggle.empty {
    visibility: hidden;
}

.btp-tree-icon {
    flex-shrink: 0;
    font-size: 14px;
}

.btp-tree-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.btp-tree-check {
    flex-shrink: 0;
    font-size: 14px;
    color: var(--success);
    margin-left: auto;
}

.btp-tree-children {
    padding-left: 18px;
}

.btp-tree-children.collapsed {
    display: none;
}

/* ── Tag Chips ─────────────────────────────────────── */
.btp-tags-area {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
}

.btp-tag-chip {
    display: inline-flex;
    align-items: center;
    background: var(--primary);
    color: #fff;
    padding: 4px 10px;
    border-radius: var(--radius-full);
    font-size: 12px;
    white-space: nowrap;
    animation: btp-fadeIn 0.15s ease;
}

.btp-tag-chip-x {
    margin-left: 4px;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity var(--transition);
    font-size: 12px;
    line-height: 1;
}

.btp-tag-chip-x:hover {
    opacity: 1;
}

.btp-tag-add-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border: 1px dashed var(--border-light);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--text-muted);
    font-family: var(--font);
    font-size: 12px;
    cursor: pointer;
    transition: all var(--transition);
    white-space: nowrap;
}

.btp-tag-add-btn:hover {
    border-color: var(--text-muted);
    color: var(--text);
    background: rgba(255, 255, 255, 0.03);
}

/* ── Tag Dropdown ──────────────────────────────────── */
.btp-tag-dropdown-wrapper {
    position: relative;
}

.btp-tag-dropdown {
    position: absolute;
    z-index: 200;
    bottom: calc(100% + 4px);
    left: 0;
    min-width: 240px;
    max-width: 320px;
    background: var(--surface-raised);
    border: 1px solid var(--border-light);
    box-shadow: var(--shadow-lg);
    border-radius: var(--radius-sm);
    max-height: 300px;
    display: flex;
    flex-direction: column;
    animation: btp-fadeIn 0.15s ease;
}
`;
    document.head.appendChild(s);
}

// ── Helper: flatten a tag tree into path strings ─────────
function flattenTagTree(obj, prefix = '') {
    const result = [];
    for (const [key, val] of Object.entries(obj)) {
        const path = prefix ? `${prefix}/${key}` : key;
        result.push(path);
        if (val && typeof val === 'object' && Object.keys(val).length > 0) {
            result.push(...flattenTagTree(val, path));
        }
    }
    return result;
}

// ── Helper: build a display label from a tag path ────────
function tagLabel(path) {
    const parts = path.split('/');
    return parts[parts.length - 1];
}

// ═══════════════════════════════════════════════════════════
//  BranchTagPicker
// ═══════════════════════════════════════════════════════════
export class BranchTagPicker {
    /**
     * @param {HTMLElement} containerEl
     * @param {{ onBranchChange?: (path: string|null) => void, onTagsChange?: (tags: string[]) => void }} options
     */
    constructor(containerEl, options = {}) {
        injectStyles();

        this.containerEl = containerEl;
        this.onBranchChange = options.onBranchChange || null;
        this.onTagsChange = options.onTagsChange || null;

        /** @type {object|null} raw branch tree from API */
        this._branchTree = null;
        /** @type {string[]} all available tag paths */
        this._allTags = [];
        /** @type {object|null} raw tag tree from API */
        this._tagTree = null;

        /** @type {string|null} currently selected branch path */
        this._selectedBranch = null;
        /** @type {string[]} currently selected tag paths */
        this._selectedTags = [];

        /** @type {boolean} */
        this._branchDropdownOpen = false;
        this._tagDropdownOpen = false;

        /** @type {Function|null} bound outside-click handler */
        this._outsideClickHandler = null;
        this._tagOutsideClickHandler = null;

        this._build();
    }

    // ── Build DOM ─────────────────────────────────────────
    _build() {
        this._wrapper = document.createElement('div');
        this._wrapper.className = 'btp-container';

        // ── Branch row ──
        const branchRow = document.createElement('div');
        branchRow.className = 'btp-row';

        const branchLabel = document.createElement('span');
        branchLabel.className = 'btp-row-label';
        branchLabel.textContent = '📁 分支:';

        this._branchWrapper = document.createElement('div');
        this._branchWrapper.className = 'btp-branch-wrapper';

        this._branchBtn = document.createElement('button');
        this._branchBtn.className = 'btp-branch-btn';
        this._branchBtn.type = 'button';
        this._branchBtn.innerHTML = `
            <span class="btp-branch-text btp-branch-placeholder">选择分支...</span>
            <span class="btp-arrow">▼</span>
        `;
        this._branchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleBranchDropdown();
        });

        this._branchWrapper.appendChild(this._branchBtn);
        branchRow.appendChild(branchLabel);
        branchRow.appendChild(this._branchWrapper);

        // ── Tag row ──
        const tagRow = document.createElement('div');
        tagRow.className = 'btp-row';

        const tagLabel_ = document.createElement('span');
        tagLabel_.className = 'btp-row-label';
        tagLabel_.textContent = '🏷 Tags:';

        this._tagsArea = document.createElement('div');
        this._tagsArea.className = 'btp-tags-area';

        this._tagAddWrapper = document.createElement('div');
        this._tagAddWrapper.className = 'btp-tag-dropdown-wrapper';

        this._tagAddBtn = document.createElement('button');
        this._tagAddBtn.className = 'btp-tag-add-btn';
        this._tagAddBtn.type = 'button';
        this._tagAddBtn.textContent = '+ 添加';
        this._tagAddBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleTagDropdown();
        });

        this._tagAddWrapper.appendChild(this._tagAddBtn);
        this._tagsArea.appendChild(this._tagAddWrapper);

        tagRow.appendChild(tagLabel_);
        tagRow.appendChild(this._tagsArea);

        this._wrapper.appendChild(branchRow);
        this._wrapper.appendChild(tagRow);
        this.containerEl.appendChild(this._wrapper);
    }

    // ── Data Loading ──────────────────────────────────────
    /**
     * Fetch branches and tags from API
     */
    async loadData() {
        const [branches, tags] = await Promise.all([
            api('GET', '/api/branches'),
            api('GET', '/api/tags'),
        ]);
        this._branchTree = branches;
        this._tagTree = tags;
        this._allTags = flattenTagTree(tags);
    }

    // ══════════════════════════════════════════════════════
    //  Branch Dropdown
    // ══════════════════════════════════════════════════════

    _toggleBranchDropdown() {
        if (this._branchDropdownOpen) {
            this._closeBranchDropdown();
        } else {
            this._openBranchDropdown();
        }
    }

    _openBranchDropdown() {
        if (this._branchDropdownOpen) return;
        this._branchDropdownOpen = true;
        this._branchBtn.classList.add('open');

        // Close tag dropdown if open
        this._closeTagDropdown();

        const dropdown = document.createElement('div');
        dropdown.className = 'btp-dropdown';

        // Search
        const search = document.createElement('input');
        search.className = 'btp-search';
        search.type = 'text';
        search.placeholder = '🔍 搜索分支...';
        search.addEventListener('input', () => {
            this._renderBranchTree(treeContainer, search.value.trim().toLowerCase());
        });
        search.addEventListener('click', (e) => e.stopPropagation());

        // Tree container
        const treeContainer = document.createElement('div');
        treeContainer.className = 'btp-tree';

        dropdown.appendChild(search);
        dropdown.appendChild(treeContainer);
        this._branchWrapper.appendChild(dropdown);
        this._branchDropdown = dropdown;

        this._renderBranchTree(treeContainer, '');

        // Focus search
        requestAnimationFrame(() => search.focus());

        // Outside click
        this._outsideClickHandler = (e) => {
            if (!this._branchWrapper.contains(e.target)) {
                this._closeBranchDropdown();
            }
        };
        // Delay to prevent the current click from immediately closing
        setTimeout(() => {
            document.addEventListener('click', this._outsideClickHandler, true);
        }, 0);
    }

    _closeBranchDropdown() {
        if (!this._branchDropdownOpen) return;
        this._branchDropdownOpen = false;
        this._branchBtn.classList.remove('open');

        if (this._branchDropdown) {
            this._branchDropdown.remove();
            this._branchDropdown = null;
        }
        if (this._outsideClickHandler) {
            document.removeEventListener('click', this._outsideClickHandler, true);
            this._outsideClickHandler = null;
        }
    }

    /**
     * Render tree into container, filtered by query
     */
    _renderBranchTree(container, query) {
        container.innerHTML = '';
        if (!this._branchTree) {
            container.textContent = '暂无数据';
            return;
        }

        const tree = this._branchTree;
        // The root node itself might be the top-level; render its children
        if (tree.children && Object.keys(tree.children).length > 0) {
            for (const [, child] of Object.entries(tree.children)) {
                const el = this._buildTreeNode(child, query, 0);
                if (el) container.appendChild(el);
            }
        } else {
            // Maybe the tree IS the root with a path — render it directly
            const el = this._buildTreeNode(tree, query, 0);
            if (el) container.appendChild(el);
        }

        if (!container.children.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding: 12px; text-align: center; color: var(--text-dim); font-size: 13px;';
            empty.textContent = '无匹配结果';
            container.appendChild(empty);
        }
    }

    /**
     * Build a single tree node element. Returns null if filtered out.
     */
    _buildTreeNode(node, query, depth) {
        const hasChildren = node.children && typeof node.children === 'object' && Object.keys(node.children).length > 0;
        const nameMatch = !query || node.name.toLowerCase().includes(query);

        // Recursively build children
        let childEls = [];
        if (hasChildren) {
            for (const [, child] of Object.entries(node.children)) {
                const el = this._buildTreeNode(child, query, depth + 1);
                if (el) childEls.push(el);
            }
        }

        // If query active: show only if name matches OR any child matches
        if (query && !nameMatch && childEls.length === 0) {
            return null;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'btp-tree-node';

        // Row
        const row = document.createElement('div');
        row.className = 'btp-tree-node-row';
        row.style.paddingLeft = `${12 + depth * 18}px`;

        if (this._selectedBranch === node.path) {
            row.classList.add('selected');
        }

        // Toggle arrow
        const toggle = document.createElement('span');
        toggle.className = 'btp-tree-toggle' + (hasChildren ? '' : ' empty');
        // If searching and has matching children, default expanded
        const startExpanded = query ? true : false;
        toggle.textContent = hasChildren ? (startExpanded ? '▼' : '▶') : '';

        // Icon
        const icon = document.createElement('span');
        icon.className = 'btp-tree-icon';
        icon.textContent = '📁';

        // Label
        const label = document.createElement('span');
        label.className = 'btp-tree-label';
        label.textContent = node.name;

        // Check mark
        const check = document.createElement('span');
        check.className = 'btp-tree-check';
        check.textContent = this._selectedBranch === node.path ? '✓' : '';

        row.appendChild(toggle);
        row.appendChild(icon);
        row.appendChild(label);
        row.appendChild(check);

        // Children container
        let childrenDiv = null;
        if (hasChildren && childEls.length > 0) {
            childrenDiv = document.createElement('div');
            childrenDiv.className = 'btp-tree-children' + (startExpanded ? '' : ' collapsed');
            for (const cel of childEls) {
                childrenDiv.appendChild(cel);
            }
        }

        // Toggle click
        if (hasChildren && childrenDiv) {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const collapsed = childrenDiv.classList.toggle('collapsed');
                toggle.textContent = collapsed ? '▶' : '▼';
            });
        }

        // Row click — select this branch
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            // If it has children, also toggle
            if (hasChildren && childrenDiv) {
                const collapsed = childrenDiv.classList.toggle('collapsed');
                toggle.textContent = collapsed ? '▶' : '▼';
            }
            this._selectBranch(node.path, node.name);
        });

        wrapper.appendChild(row);
        if (childrenDiv) wrapper.appendChild(childrenDiv);

        return wrapper;
    }

    _selectBranch(path, name) {
        this._selectedBranch = path;

        // Update button text
        const textSpan = this._branchBtn.querySelector('.btp-branch-text');
        textSpan.textContent = this._getBranchDisplayName(path);
        textSpan.classList.remove('btp-branch-placeholder');

        this._closeBranchDropdown();

        if (this.onBranchChange) {
            this.onBranchChange(path);
        }
    }

    /**
     * Get a human-readable display name from a branch path.
     * Walks the tree to build "parent / child / grandchild" style.
     */
    _getBranchDisplayName(path) {
        if (!path || !this._branchTree) return path || '';

        const parts = [];
        const _find = (node) => {
            if (node.path === path) {
                parts.push(node.name);
                return true;
            }
            if (node.children) {
                for (const [, child] of Object.entries(node.children)) {
                    if (_find(child)) {
                        parts.unshift(node.name);
                        return true;
                    }
                }
            }
            return false;
        };

        _find(this._branchTree);

        // Remove root name if it's something like "根"
        if (parts.length > 1 && parts[0] === this._branchTree.name) {
            parts.shift();
        }
        return parts.join(' / ') || path;
    }

    // ══════════════════════════════════════════════════════
    //  Tag Dropdown
    // ══════════════════════════════════════════════════════

    _toggleTagDropdown() {
        if (this._tagDropdownOpen) {
            this._closeTagDropdown();
        } else {
            this._openTagDropdown();
        }
    }

    _openTagDropdown() {
        if (this._tagDropdownOpen) return;
        this._tagDropdownOpen = true;

        // Close branch dropdown if open
        this._closeBranchDropdown();

        const dropdown = document.createElement('div');
        dropdown.className = 'btp-tag-dropdown';

        // Search
        const search = document.createElement('input');
        search.className = 'btp-search';
        search.type = 'text';
        search.placeholder = '🔍 搜索标签...';
        search.addEventListener('input', () => {
            this._renderTagTree(treeContainer, search.value.trim().toLowerCase());
        });
        search.addEventListener('click', (e) => e.stopPropagation());

        // Tree
        const treeContainer = document.createElement('div');
        treeContainer.className = 'btp-tree';

        dropdown.appendChild(search);
        dropdown.appendChild(treeContainer);
        this._tagAddWrapper.appendChild(dropdown);
        this._tagDropdownEl = dropdown;

        this._renderTagTree(treeContainer, '');

        requestAnimationFrame(() => search.focus());

        // Outside click
        this._tagOutsideClickHandler = (e) => {
            if (!this._tagAddWrapper.contains(e.target)) {
                this._closeTagDropdown();
            }
        };
        setTimeout(() => {
            document.addEventListener('click', this._tagOutsideClickHandler, true);
        }, 0);
    }

    _closeTagDropdown() {
        if (!this._tagDropdownOpen) return;
        this._tagDropdownOpen = false;

        if (this._tagDropdownEl) {
            this._tagDropdownEl.remove();
            this._tagDropdownEl = null;
        }
        if (this._tagOutsideClickHandler) {
            document.removeEventListener('click', this._tagOutsideClickHandler, true);
            this._tagOutsideClickHandler = null;
        }
    }

    _renderTagTree(container, query) {
        container.innerHTML = '';
        if (!this._tagTree || Object.keys(this._tagTree).length === 0) {
            container.textContent = '暂无标签';
            return;
        }

        for (const [key, val] of Object.entries(this._tagTree)) {
            const el = this._buildTagNode(key, val, query, 0, key);
            if (el) container.appendChild(el);
        }

        if (!container.children.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding: 12px; text-align: center; color: var(--text-dim); font-size: 13px;';
            empty.textContent = '无匹配结果';
            container.appendChild(empty);
        }
    }

    /**
     * Build a tag tree node. tagPath accumulates the full path.
     */
    _buildTagNode(name, children, query, depth, tagPath) {
        const hasChildren = children && typeof children === 'object' && Object.keys(children).length > 0;
        const nameMatch = !query || name.toLowerCase().includes(query);

        let childEls = [];
        if (hasChildren) {
            for (const [childName, childVal] of Object.entries(children)) {
                const el = this._buildTagNode(childName, childVal, query, depth + 1, `${tagPath}/${childName}`);
                if (el) childEls.push(el);
            }
        }

        if (query && !nameMatch && childEls.length === 0) {
            return null;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'btp-tree-node';

        const row = document.createElement('div');
        row.className = 'btp-tree-node-row';
        row.style.paddingLeft = `${12 + depth * 18}px`;

        const isSelected = this._selectedTags.includes(tagPath);
        if (isSelected) row.classList.add('selected');

        const toggle = document.createElement('span');
        toggle.className = 'btp-tree-toggle' + (hasChildren ? '' : ' empty');
        const startExpanded = !!query;
        toggle.textContent = hasChildren ? (startExpanded ? '▼' : '▶') : '';

        const icon = document.createElement('span');
        icon.className = 'btp-tree-icon';
        icon.textContent = '🏷';

        const label = document.createElement('span');
        label.className = 'btp-tree-label';
        label.textContent = name;

        const check = document.createElement('span');
        check.className = 'btp-tree-check';
        check.textContent = isSelected ? '✓' : '';

        row.appendChild(toggle);
        row.appendChild(icon);
        row.appendChild(label);
        row.appendChild(check);

        let childrenDiv = null;
        if (hasChildren && childEls.length > 0) {
            childrenDiv = document.createElement('div');
            childrenDiv.className = 'btp-tree-children' + (startExpanded ? '' : ' collapsed');
            for (const cel of childEls) {
                childrenDiv.appendChild(cel);
            }
        }

        if (hasChildren && childrenDiv) {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const collapsed = childrenDiv.classList.toggle('collapsed');
                toggle.textContent = collapsed ? '▶' : '▼';
            });
        }

        // Click row — toggle tag selection
        row.addEventListener('click', (e) => {
            e.stopPropagation();

            // If it has children, also toggle expand
            if (hasChildren && childrenDiv) {
                const collapsed = childrenDiv.classList.toggle('collapsed');
                toggle.textContent = collapsed ? '▶' : '▼';
            }

            // Toggle selection
            const idx = this._selectedTags.indexOf(tagPath);
            if (idx >= 0) {
                this._selectedTags.splice(idx, 1);
                row.classList.remove('selected');
                check.textContent = '';
            } else {
                this._selectedTags.push(tagPath);
                row.classList.add('selected');
                check.textContent = '✓';
            }
            this._renderTagChips();

            if (this.onTagsChange) {
                this.onTagsChange([...this._selectedTags]);
            }
        });

        wrapper.appendChild(row);
        if (childrenDiv) wrapper.appendChild(childrenDiv);

        return wrapper;
    }

    // ── Tag Chips ─────────────────────────────────────────

    _renderTagChips() {
        // Remove existing chips (keep the add button wrapper)
        const existing = this._tagsArea.querySelectorAll('.btp-tag-chip');
        existing.forEach((el) => el.remove());

        // Insert chips before the add button
        for (const tagPath of this._selectedTags) {
            const chip = document.createElement('span');
            chip.className = 'btp-tag-chip';

            const text = document.createElement('span');
            text.textContent = tagLabel(tagPath);

            const x = document.createElement('span');
            x.className = 'btp-tag-chip-x';
            x.textContent = '✕';
            x.addEventListener('click', (e) => {
                e.stopPropagation();
                this._removeTag(tagPath);
            });

            chip.appendChild(text);
            chip.appendChild(x);

            // Insert before the add wrapper
            this._tagsArea.insertBefore(chip, this._tagAddWrapper);
        }
    }

    _removeTag(tagPath) {
        const idx = this._selectedTags.indexOf(tagPath);
        if (idx >= 0) {
            this._selectedTags.splice(idx, 1);
            this._renderTagChips();
            if (this.onTagsChange) {
                this.onTagsChange([...this._selectedTags]);
            }
        }
    }

    // ══════════════════════════════════════════════════════
    //  Public API
    // ══════════════════════════════════════════════════════

    /**
     * Get currently selected branch path
     * @returns {string|null}
     */
    getSelectedBranch() {
        return this._selectedBranch;
    }

    /**
     * Get currently selected tag paths
     * @returns {string[]}
     */
    getSelectedTags() {
        return [...this._selectedTags];
    }

    /**
     * Set the selected branch
     * @param {string|null} path
     */
    setSelectedBranch(path) {
        this._selectedBranch = path;
        const textSpan = this._branchBtn.querySelector('.btp-branch-text');
        if (path) {
            textSpan.textContent = this._getBranchDisplayName(path);
            textSpan.classList.remove('btp-branch-placeholder');
        } else {
            textSpan.textContent = '选择分支...';
            textSpan.classList.add('btp-branch-placeholder');
        }
    }

    /**
     * Set the selected tags
     * @param {string[]} tags
     */
    setSelectedTags(tags) {
        this._selectedTags = [...tags];
        this._renderTagChips();
    }
}
