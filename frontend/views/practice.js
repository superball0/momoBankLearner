/**
 * Practice View — 顺序刷题模式
 *
 * 两个阶段:
 *   1. 选择范围 (分支)
 *   2. 逐题作答
 *
 * 导出: renderPractice(app)
 */

import { api, createEl, showToast } from '/static/tools/utils.js';

// ── CSS 注入 ─────────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('practice-styles')) return;
    const s = document.createElement('style');
    s.id = 'practice-styles';
    s.textContent = `
        /* ── Layout ──────────────────────────────────── */
        .practice-container {
            max-width: 860px;
            margin: 0 auto;
            padding: 24px 20px;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }

        /* ── Header bar ──────────────────────────────── */
        .practice-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 0;
            margin-bottom: 16px;
            border-bottom: 1px solid var(--border);
        }
        .practice-header-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .practice-progress-text {
            font-size: 15px;
            color: var(--text-secondary);
            font-weight: 500;
        }
        .practice-progress-bar {
            flex: 1;
            height: 4px;
            background: var(--border);
            border-radius: 2px;
            margin: 0 16px;
            min-width: 120px;
        }
        .practice-progress-fill {
            height: 100%;
            background: var(--gradient-primary);
            border-radius: 2px;
            transition: width 0.4s ease;
        }

        /* ── Selector page ───────────────────────────── */
        .practice-selector {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 24px;
        }
        .practice-selector h1 {
            font-size: 28px;
            margin: 0;
        }
        .practice-selector-card {
            width: 100%;
            max-width: 500px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 24px;
        }
        .practice-selector-label {
            font-size: 14px;
            color: var(--text-muted);
            margin-bottom: 8px;
            display: block;
        }
        .practice-branch-btn {
            width: 100%;
            padding: 12px 16px;
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            color: var(--text);
            font-size: 14px;
            text-align: left;
            cursor: pointer;
            transition: all var(--transition);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .practice-branch-btn:hover {
            border-color: var(--border-light);
            background: var(--surface-hover);
        }
        .practice-branch-dropdown {
            position: relative;
            margin-bottom: 16px;
        }
        .practice-branch-panel {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            z-index: 200;
            background: var(--surface-raised);
            border: 1px solid var(--border-light);
            border-radius: var(--radius-sm);
            box-shadow: var(--shadow-lg);
            max-height: 350px;
            overflow-y: auto;
            margin-top: 4px;
        }
        .practice-branch-search {
            width: 100%;
            padding: 10px 14px;
            background: var(--bg);
            border: none;
            border-bottom: 1px solid var(--border);
            color: var(--text);
            font-size: 14px;
            outline: none;
            position: sticky;
            top: 0;
            z-index: 1;
            box-sizing: border-box;
        }
        .practice-tree-node {
            padding: 8px 14px;
            font-size: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: background 0.12s;
            user-select: none;
        }
        .practice-tree-node:hover {
            background: var(--surface-hover);
        }
        .practice-tree-node.selected {
            background: var(--surface-active);
            color: var(--accent);
        }
        .practice-tree-arrow {
            width: 16px;
            text-align: center;
            font-size: 10px;
            color: var(--text-dim);
            cursor: pointer;
            flex-shrink: 0;
            transition: transform 0.15s;
        }
        .practice-tree-arrow.expanded {
            transform: rotate(90deg);
        }
        .practice-tree-arrow.empty {
            visibility: hidden;
        }
        .practice-tree-children {
            display: none;
        }
        .practice-tree-children.show {
            display: block;
        }
        .practice-q-count {
            text-align: center;
            font-size: 16px;
            color: var(--text-secondary);
            margin: 12px 0;
        }
        .practice-q-count strong {
            color: var(--accent);
            font-size: 24px;
        }
        .practice-start-row {
            display: flex;
            gap: 12px;
            justify-content: center;
            margin-top: 8px;
        }

        /* ── Question card ───────────────────────────── */
        .practice-card {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        .practice-question {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 20px 24px;
        }
        .practice-question-label {
            font-size: 12px;
            color: var(--text-dim);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
        }
        .practice-question-content {
            font-size: 16px;
            line-height: 1.7;
            color: var(--text);
            word-break: break-word;
        }
        .practice-question-content img {
            max-width: 100%;
            max-height: 400px;
            object-fit: contain;
            border-radius: var(--radius-xs);
            margin: 8px 0;
            cursor: pointer;
        }

        /* ── Options ─────────────────────────────────── */
        .practice-options {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .practice-option {
            display: flex;
            align-items: flex-start;
            gap: 14px;
            padding: 14px 18px;
            background: var(--surface);
            border: 2px solid var(--border);
            border-radius: var(--radius-sm);
            cursor: pointer;
            transition: all 0.2s;
            user-select: none;
        }
        .practice-option:hover:not(.disabled) {
            border-color: var(--border-light);
            background: var(--surface-hover);
        }
        .practice-option.selected {
            border-color: var(--secondary);
            background: rgba(83, 52, 131, 0.1);
        }
        .practice-option.correct {
            border-color: var(--success);
            background: var(--success-dim);
        }
        .practice-option.wrong {
            border-color: var(--accent);
            background: rgba(233, 69, 96, 0.1);
        }
        .practice-option.disabled {
            cursor: default;
            opacity: 0.85;
        }
        .practice-option-label {
            flex-shrink: 0;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            border: 2px solid var(--border-light);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            font-weight: 600;
            color: var(--text-secondary);
            transition: all 0.2s;
        }
        .practice-option.selected .practice-option-label {
            border-color: var(--secondary);
            background: var(--secondary);
            color: #fff;
        }
        .practice-option.correct .practice-option-label {
            border-color: var(--success);
            background: var(--success);
            color: #fff;
        }
        .practice-option.wrong .practice-option-label {
            border-color: var(--accent);
            background: var(--accent);
            color: #fff;
        }
        .practice-option-content {
            flex: 1;
            font-size: 15px;
            line-height: 1.6;
            color: var(--text);
            padding-top: 2px;
        }
        .practice-option-content img {
            max-width: 100%;
            max-height: 200px;
            object-fit: contain;
            border-radius: var(--radius-xs);
        }
        .practice-options-image {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 16px;
            text-align: center;
        }
        .practice-options-image img {
            max-width: 100%;
            max-height: 400px;
            object-fit: contain;
            border-radius: var(--radius-xs);
        }

        /* ── Action buttons ──────────────────────────── */
        .practice-actions {
            display: flex;
            justify-content: center;
            gap: 12px;
            padding: 8px 0;
        }

        /* ── Result banner ───────────────────────────── */
        .practice-result {
            padding: 16px 20px;
            border-radius: var(--radius-sm);
            font-size: 16px;
            font-weight: 600;
            text-align: center;
            animation: slideUp 0.3s ease;
        }
        .practice-result.correct {
            background: var(--success-dim);
            color: var(--success);
            border: 1px solid rgba(74, 222, 128, 0.3);
        }
        .practice-result.wrong {
            background: rgba(233, 69, 96, 0.1);
            color: var(--accent);
            border: 1px solid rgba(233, 69, 96, 0.3);
        }

        /* ── Answer section ──────────────────────────── */
        .practice-answer {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 20px 24px;
            animation: slideUp 0.3s ease;
        }
        .practice-answer-label {
            font-size: 12px;
            color: var(--text-dim);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
        }
        .practice-answer-content {
            font-size: 15px;
            line-height: 1.7;
            color: var(--text-secondary);
        }
        .practice-answer-content img {
            max-width: 100%;
            max-height: 400px;
            object-fit: contain;
            border-radius: var(--radius-xs);
            margin: 8px 0;
        }

        /* ── Summary ─────────────────────────────────── */
        .practice-summary {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 20px;
            text-align: center;
        }
        .practice-summary h1 {
            font-size: 32px;
            margin: 0;
        }
        .practice-summary-stats {
            display: flex;
            gap: 32px;
            margin: 12px 0;
        }
        .practice-stat {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
        }
        .practice-stat-value {
            font-size: 36px;
            font-weight: 700;
        }
        .practice-stat-value.green { color: var(--success); }
        .practice-stat-value.red { color: var(--accent); }
        .practice-stat-value.blue { color: var(--secondary); }
        .practice-stat-label {
            font-size: 13px;
            color: var(--text-muted);
        }

        /* ── Animations ──────────────────────────────── */
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(12px); }
            to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Lightbox ────────────────────────────────── */
        .practice-lightbox {
            position: fixed;
            inset: 0;
            z-index: 9999;
            background: rgba(0,0,0,0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: zoom-out;
            animation: fadeIn 0.2s ease;
        }
        .practice-lightbox img {
            max-width: 95vw;
            max-height: 95vh;
            object-fit: contain;
            border-radius: var(--radius-sm);
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to   { opacity: 1; }
        }
    `;
    document.head.appendChild(s);
}

// ══════════════════════════════════════════════════════════
//  Main export
// ══════════════════════════════════════════════════════════

export function renderPractice(app) {
    injectStyles();
    const { container } = app;

    // State
    let branchData = null;
    let selectedBranch = null; // { name, path }
    let questionIds = [];      // [{id, path, ...}]
    let currentIndex = 0;
    let currentQuestion = null;
    let selectedOptions = [];  // indices the user picked
    let answered = false;
    let correctCount = 0;
    let wrongCount = 0;

    // Start with selector
    loadBranches();

    // ── Load branches ────────────────────────────────────
    async function loadBranches() {
        try {
            branchData = await api('GET', '/api/branches');
            renderSelector();
        } catch (err) {
            showToast('加载分支失败: ' + err.message, 'error');
        }
    }

    // ── Selector page ────────────────────────────────────
    function renderSelector() {
        container.innerHTML = '';
        const page = createEl('div', { class: 'practice-container' });
        const sel = createEl('div', { class: 'practice-selector' });

        sel.appendChild(createEl('h1', { textContent: '🧠 选择练习范围' }));

        const card = createEl('div', { class: 'practice-selector-card' });

        // Branch dropdown
        card.appendChild(createEl('span', { class: 'practice-selector-label', textContent: '📁 选择分支' }));
        const dropdown = createEl('div', { class: 'practice-branch-dropdown' });
        const btn = createEl('button', { class: 'practice-branch-btn' });
        btn.innerHTML = selectedBranch
            ? `<span>${selectedBranch.name}</span><span style="color:var(--text-dim)">▼</span>`
            : `<span style="color:var(--text-muted)">点击选择分支...</span><span style="color:var(--text-dim)">▼</span>`;
        dropdown.appendChild(btn);
        card.appendChild(dropdown);

        // Question count
        const countEl = createEl('div', { class: 'practice-q-count' });
        if (selectedBranch) {
            countEl.innerHTML = `共 <strong>${questionIds.length}</strong> 道题`;
        }
        card.appendChild(countEl);

        // Action buttons
        const actions = createEl('div', { class: 'practice-start-row' });
        const startBtn = createEl('button', {
            class: 'btn btn-primary btn-lg',
            textContent: '🚀 开始刷题',
        });
        startBtn.disabled = !selectedBranch || questionIds.length === 0;
        startBtn.addEventListener('click', () => {
            currentIndex = 0;
            correctCount = 0;
            wrongCount = 0;
            loadQuestion(0);
        });
        actions.appendChild(startBtn);

        const backBtn = createEl('button', {
            class: 'btn btn-ghost',
            textContent: '← 返回',
            events: { click: () => app.navigate('mode-select') },
        });
        actions.appendChild(backBtn);
        card.appendChild(actions);

        sel.appendChild(card);
        page.appendChild(sel);
        container.appendChild(page);

        // Dropdown click
        let panelOpen = false;
        btn.addEventListener('click', () => {
            if (panelOpen) {
                closePanel();
            } else {
                openPanel();
            }
        });

        let panel = null;
        function openPanel() {
            if (panel) panel.remove();
            panelOpen = true;
            panel = createEl('div', { class: 'practice-branch-panel' });

            const search = createEl('input', {
                class: 'practice-branch-search',
                placeholder: '🔍 搜索分支...',
                type: 'text',
            });
            panel.appendChild(search);

            const treeWrap = createEl('div');
            renderBranchNodes(treeWrap, branchData, 0, '');
            panel.appendChild(treeWrap);

            search.addEventListener('input', () => {
                const q = search.value.trim().toLowerCase();
                treeWrap.innerHTML = '';
                renderBranchNodes(treeWrap, branchData, 0, q);
            });

            dropdown.appendChild(panel);

            // Close on outside click
            setTimeout(() => {
                document.addEventListener('click', onOutsideClick, true);
            }, 0);

            search.focus();
        }

        function closePanel() {
            if (panel) { panel.remove(); panel = null; }
            panelOpen = false;
            document.removeEventListener('click', onOutsideClick, true);
        }

        function onOutsideClick(e) {
            if (!dropdown.contains(e.target)) {
                closePanel();
            }
        }

        function renderBranchNodes(parent, node, depth, filter) {
            if (!node) return false;

            const children = Array.isArray(node.children) ? node.children : [];
            const nameMatch = !filter || node.name.toLowerCase().includes(filter);

            // Render children first to know if any match
            const childContainer = createEl('div', { class: 'practice-tree-children' });
            let anyChildMatch = false;
            for (const child of children) {
                if (renderBranchNodes(childContainer, child, depth + 1, filter)) {
                    anyChildMatch = true;
                }
            }

            if (!nameMatch && !anyChildMatch) return false;

            const row = createEl('div', {
                class: `practice-tree-node ${selectedBranch && selectedBranch.path === node.path ? 'selected' : ''}`,
            });
            row.style.paddingLeft = `${12 + depth * 24}px`;

            const hasKids = children.length > 0;
            const arrow = createEl('span', {
                class: `practice-tree-arrow ${hasKids ? (filter || depth < 1 ? 'expanded' : '') : 'empty'}`,
                textContent: '▶',
            });
            row.appendChild(arrow);
            row.appendChild(createEl('span', { textContent: '📁 ' + node.name }));

            if (node.question_count > 0) {
                row.appendChild(createEl('span', {
                    style: { marginLeft: 'auto', fontSize: '12px', color: 'var(--text-dim)' },
                    textContent: `${node.question_count}题`,
                }));
            }

            // Click arrow → toggle
            arrow.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!hasKids) return;
                const isExpanded = childContainer.classList.contains('show');
                childContainer.classList.toggle('show', !isExpanded);
                arrow.classList.toggle('expanded', !isExpanded);
            });

            // Click row → select
            row.addEventListener('click', async () => {
                selectedBranch = { name: node.name, path: node.path };
                // Load question list
                try {
                    questionIds = await api('GET', `/api/questions?branch_path=${encodeURIComponent(node.path)}`);
                } catch (err) {
                    questionIds = [];
                }
                closePanel();
                renderSelector(); // re-render with count
            });

            parent.appendChild(row);

            if (hasKids) {
                if (filter || depth < 1) childContainer.classList.add('show');
                parent.appendChild(childContainer);
            }

            return true;
        }
    }

    // ── Load a question ──────────────────────────────────
    async function loadQuestion(idx) {
        if (idx >= questionIds.length) {
            renderSummary();
            return;
        }
        currentIndex = idx;
        selectedOptions = [];
        answered = false;

        try {
            const qId = questionIds[idx].id;
            currentQuestion = await api('GET', `/api/question/${qId}`);
            renderQuestion();
        } catch (err) {
            showToast('加载题目失败: ' + err.message, 'error');
        }
    }

    // ── Render question ──────────────────────────────────
    function renderQuestion() {
        container.innerHTML = '';
        const page = createEl('div', { class: 'practice-container' });

        // Header with progress
        const header = createEl('div', { class: 'practice-header' });
        const left = createEl('div', { class: 'practice-header-left' });
        left.appendChild(createEl('span', {
            class: 'practice-progress-text',
            textContent: `${currentIndex + 1} / ${questionIds.length}`,
        }));
        header.appendChild(left);

        const bar = createEl('div', { class: 'practice-progress-bar' });
        const fill = createEl('div', { class: 'practice-progress-fill' });
        fill.style.width = `${((currentIndex + 1) / questionIds.length) * 100}%`;
        bar.appendChild(fill);
        header.appendChild(bar);

        header.appendChild(createEl('button', {
            class: 'btn btn-ghost btn-sm',
            textContent: '✕ 退出',
            events: { click: () => renderSelector() },
        }));

        page.appendChild(header);

        // Question card
        const card = createEl('div', { class: 'practice-card' });
        const q = currentQuestion;

        // Question stem
        const qSection = createEl('div', { class: 'practice-question' });
        qSection.appendChild(createEl('div', { class: 'practice-question-label', textContent: '题目' }));
        const qContent = createEl('div', { class: 'practice-question-content' });
        if (q.question.type === 'image') {
            const img = createEl('img', { src: q.question.content });
            img.addEventListener('click', () => openLightbox(q.question.content));
            qContent.appendChild(img);
        } else {
            qContent.innerHTML = renderMarkdown(q.question.content);
            // Make images clickable
            for (const img of qContent.querySelectorAll('img')) {
                img.addEventListener('click', () => openLightbox(img.src));
            }
        }
        qSection.appendChild(qContent);
        card.appendChild(qSection);

        // Options
        const optMode = q.option_mode || 'text';
        if (optMode === 'single_image') {
            // Single image for all options
            const wrap = createEl('div', { class: 'practice-options-image' });
            const img = createEl('img', { src: q.options[0]?.content || '' });
            img.addEventListener('click', () => openLightbox(img.src));
            wrap.appendChild(img);
            card.appendChild(wrap);

            // Still need option buttons for selecting answer
            const optWrap = createEl('div', { class: 'practice-options' });
            const labels = ['A', 'B', 'C', 'D'];
            for (let i = 0; i < 4; i++) {
                const opt = createOptionButton(labels[i], labels[i], i);
                optWrap.appendChild(opt);
            }
            card.appendChild(optWrap);
        } else {
            // text or split_images
            const optWrap = createEl('div', { class: 'practice-options' });
            for (let i = 0; i < q.options.length; i++) {
                const o = q.options[i];
                const opt = createOptionButton(o.label, o.content, i, o.type);
                optWrap.appendChild(opt);
            }
            card.appendChild(optWrap);
        }

        // Confirm button
        const actions = createEl('div', { class: 'practice-actions' });
        const confirmBtn = createEl('button', {
            class: 'btn btn-primary btn-lg',
            textContent: '✅ 确认答案',
        });
        confirmBtn.addEventListener('click', () => handleConfirm(card, actions));
        actions.appendChild(confirmBtn);
        card.appendChild(actions);

        page.appendChild(card);
        container.appendChild(page);
    }

    // ── Create an option button ──────────────────────────
    function createOptionButton(label, content, index, type) {
        const opt = createEl('div', { class: 'practice-option', dataset: { index } });

        const labelEl = createEl('div', { class: 'practice-option-label', textContent: label });
        opt.appendChild(labelEl);

        const contentEl = createEl('div', { class: 'practice-option-content' });
        if (type === 'image') {
            const img = createEl('img', { src: content });
            img.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(content); });
            contentEl.appendChild(img);
        } else {
            contentEl.innerHTML = renderMarkdown(content);
        }
        opt.appendChild(contentEl);

        opt.addEventListener('click', () => {
            if (answered) return;
            toggleOption(index);
        });

        return opt;
    }

    function toggleOption(idx) {
        const isMulti = currentQuestion.correct_indices.length > 1;
        if (isMulti) {
            const pos = selectedOptions.indexOf(idx);
            if (pos >= 0) selectedOptions.splice(pos, 1);
            else selectedOptions.push(idx);
        } else {
            selectedOptions = [idx];
        }
        updateOptionStyles();
    }

    function updateOptionStyles() {
        const opts = container.querySelectorAll('.practice-option');
        opts.forEach((el) => {
            const idx = parseInt(el.dataset.index);
            el.classList.toggle('selected', selectedOptions.includes(idx));
        });
    }

    // ── Confirm answer ───────────────────────────────────
    function handleConfirm(card, actionsEl) {
        if (selectedOptions.length === 0) {
            showToast('请先选择一个答案', 'error', 1500);
            return;
        }

        answered = true;
        const correctSet = new Set(currentQuestion.correct_indices);
        const isCorrect = selectedOptions.length === correctSet.size &&
            selectedOptions.every(i => correctSet.has(i));

        if (isCorrect) correctCount++;
        else wrongCount++;

        // Update option styles
        const opts = container.querySelectorAll('.practice-option');
        opts.forEach((el) => {
            const idx = parseInt(el.dataset.index);
            el.classList.add('disabled');
            el.classList.remove('selected');

            if (correctSet.has(idx)) {
                el.classList.add('correct');
            } else if (selectedOptions.includes(idx)) {
                el.classList.add('wrong');
            }
        });

        // Result banner
        const correctLabels = currentQuestion.correct_indices
            .map(i => String.fromCharCode(65 + i))
            .join('');
        const result = createEl('div', {
            class: `practice-result ${isCorrect ? 'correct' : 'wrong'}`,
            textContent: isCorrect
                ? '✅ 回答正确！'
                : `❌ 回答错误，正确答案是 ${correctLabels}`,
        });
        card.appendChild(result);

        // Answer section
        const q = currentQuestion;
        if (q.answer && q.answer.content) {
            const ansSection = createEl('div', { class: 'practice-answer' });
            ansSection.appendChild(createEl('div', { class: 'practice-answer-label', textContent: '答案解析' }));
            const ansContent = createEl('div', { class: 'practice-answer-content' });
            if (q.answer.type === 'image') {
                const img = createEl('img', { src: q.answer.content });
                img.addEventListener('click', () => openLightbox(q.answer.content));
                ansContent.appendChild(img);
            } else {
                ansContent.innerHTML = renderMarkdown(q.answer.content);
                for (const img of ansContent.querySelectorAll('img')) {
                    img.addEventListener('click', () => openLightbox(img.src));
                }
            }
            ansSection.appendChild(ansContent);
            card.appendChild(ansSection);
        }

        // Replace confirm button with next button
        actionsEl.innerHTML = '';
        const isLast = currentIndex + 1 >= questionIds.length;
        const nextBtn = createEl('button', {
            class: 'btn btn-primary btn-lg',
            textContent: isLast ? '📊 查看总结' : '下一题 →',
        });
        nextBtn.addEventListener('click', () => loadQuestion(currentIndex + 1));
        actionsEl.appendChild(nextBtn);

        // Scroll to result
        result.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // ── Summary page ─────────────────────────────────────
    function renderSummary() {
        container.innerHTML = '';
        const page = createEl('div', { class: 'practice-container' });
        const summary = createEl('div', { class: 'practice-summary' });

        summary.appendChild(createEl('h1', { textContent: '🎉 练习完成！' }));

        const stats = createEl('div', { class: 'practice-summary-stats' });

        const total = correctCount + wrongCount;
        const addStat = (value, label, cls) => {
            const stat = createEl('div', { class: 'practice-stat' });
            stat.appendChild(createEl('div', { class: `practice-stat-value ${cls}`, textContent: String(value) }));
            stat.appendChild(createEl('div', { class: 'practice-stat-label', textContent: label }));
            stats.appendChild(stat);
        };

        addStat(total, '总题数', 'blue');
        addStat(correctCount, '正确', 'green');
        addStat(wrongCount, '错误', 'red');
        addStat(total > 0 ? Math.round((correctCount / total) * 100) + '%' : '-', '正确率',
            correctCount / total >= 0.7 ? 'green' : 'red');

        summary.appendChild(stats);

        const actions = createEl('div', { class: 'practice-start-row' });
        actions.appendChild(createEl('button', {
            class: 'btn btn-primary btn-lg',
            textContent: '🔄 再来一次',
            events: { click: () => { currentIndex = 0; correctCount = 0; wrongCount = 0; loadQuestion(0); } },
        }));
        actions.appendChild(createEl('button', {
            class: 'btn btn-ghost',
            textContent: '← 换个范围',
            events: { click: () => { selectedBranch = null; questionIds = []; renderSelector(); } },
        }));
        actions.appendChild(createEl('button', {
            class: 'btn btn-ghost',
            textContent: '🏠 返回首页',
            events: { click: () => app.navigate('mode-select') },
        }));
        summary.appendChild(actions);

        page.appendChild(summary);
        container.appendChild(page);
    }

    // ── Lightbox ─────────────────────────────────────────
    function openLightbox(src) {
        const lb = createEl('div', { class: 'practice-lightbox' });
        lb.appendChild(createEl('img', { src }));
        lb.addEventListener('click', () => lb.remove());
        document.addEventListener('keydown', function onKey(e) {
            if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', onKey); }
        });
        document.body.appendChild(lb);
    }

    // ── Simple markdown renderer ─────────────────────────
    function renderMarkdown(text) {
        if (!text) return '';
        // Handle images: ![alt](url) or bare image URLs
        let html = text
            .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>');

        // Paragraphs
        html = html.split('\n\n').map(p => `<p>${p.trim()}</p>`).join('');
        html = html.replace(/\n/g, '<br>');
        return html;
    }
}
