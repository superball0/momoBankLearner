/**
 * Entry Mode View — 题目录入界面
 *
 * Export: renderEntry(app)
 *
 * app 需要提供:
 *   app.container   — 挂载容器
 *   app.state       — { bankPath, bankName, pendingQuestion, ... }
 *   app.navigate(view, data)
 */

import { api, createEl, blobToBase64, base64ToBlob, showToast } from '/static/tools/utils.js';
import { MarkdownEditor } from '/static/tools/markdown-editor.js';
import { ImageAnnotator } from '/static/tools/image-annotator.js';

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const MAX_OPTIONS = 8;

export function renderEntry(app) {
    const container = app.container;
    container.innerHTML = '';

    // ── Inject extra styles ─────────────────────────────
    injectEntryExtraStyles();

    // ── Local state ──────────────────────────────────────
    let questionEditor = null;
    let answerEditor = null;
    let lastFocusedEditor = null;   // reference to the last-focused MarkdownEditor
    let optionMode = 'text';        // 'text' | 'single_image' | 'split_images'
    let options = [
        { text: '' }, { text: '' }, { text: '' }, { text: '' },
    ];
    let correctIndices = [0];
    let optionImages = {};          // { A: Blob, B: Blob, ... } for split_images
    let optionTypes = ['text', 'text', 'text', 'text']; // per-option: 'text' | 'image'
    let singleOptionImage = null;   // Blob for single_image mode
    let optionsBodyEl = null;       // reference for re-rendering options
    const cleanupFns = [];          // URL.revokeObjectURL, etc.

    // ── Branch / Tag inline state ────────────────────────
    let selectedBranch = null;
    let selectedTags = [];
    let branchData = null;
    let tagData = null;
    let branchDropdownOpen = false;
    let tagDropdownOpen = false;
    let branchSearchText = '';
    let tagSearchText = '';
    let branchSectionEl = null;

    // ── Build layout ─────────────────────────────────────
    const wrapper = createEl('div', { class: 'entry-mode-view view-container' });

    // ── Top bar ──────────────────────────────────────────
    const header = createEl('div', { class: 'entry-header' });
    const backBtn = createEl('button', {
        class: 'btn btn-ghost',
        textContent: '← 返回',
        events: { click: () => app.navigate('mode-select') },
    });
    const title = createEl('span', { class: 'title', textContent: '录入模式' });
    const screenshotBtn = createEl('button', {
        class: 'btn',
        textContent: '📷 截图',
        title: '截图 (Ctrl+Shift+A)',
        events: { click: handleScreenshot },
    });
    header.appendChild(backBtn);
    header.appendChild(title);
    header.appendChild(screenshotBtn);
    wrapper.appendChild(header);

    // ── Body (2-column grid) ─────────────────────────────
    const body = createEl('div', { class: 'entry-body' });

    // ── Left column ──────────────────────────────────────
    const left = createEl('div', { class: 'entry-left' });

    // Question section
    const qSection = createEl('div', { class: 'entry-section entry-section-question' });
    qSection.appendChild(createEl('div', { class: 'section-title', textContent: '题干' }));
    const qEditorContainer = createEl('div', { class: 'editor-container' });
    questionEditor = new MarkdownEditor(qEditorContainer, {
        placeholder: '输入题干...',
    });
    lastFocusedEditor = questionEditor;

    // Track focus
    qEditorContainer.addEventListener('focusin', () => {
        lastFocusedEditor = questionEditor;
    });

    qSection.appendChild(qEditorContainer);
    left.appendChild(qSection);

    // Answer section
    const aSection = createEl('div', { class: 'entry-section entry-section-answer' });
    aSection.appendChild(createEl('div', { class: 'section-title', textContent: '答案' }));
    const aEditorContainer = createEl('div', { class: 'editor-container' });
    answerEditor = new MarkdownEditor(aEditorContainer, {
        placeholder: '输入答案解析...',
    });

    aEditorContainer.addEventListener('focusin', () => {
        lastFocusedEditor = answerEditor;
    });

    aSection.appendChild(aEditorContainer);
    left.appendChild(aSection);

    // Click on images in editors to open annotator
    function setupImageClickHandler(editorContainer, editor) {
        editorContainer.addEventListener('click', (e) => {
            const img = e.target.closest('img');
            if (!img) return;
            e.preventDefault();
            e.stopPropagation();

            // Convert img src to blob
            fetch(img.src)
                .then(r => r.blob())
                .then(blob => {
                    const annotator = new ImageAnnotator();
                    annotator.open(blob, (annotatedBlob) => {
                        if (annotatedBlob) {
                            // Replace the original image
                            const newUrl = URL.createObjectURL(annotatedBlob);
                            img.src = newUrl;
                            // Update the blob in editor's imageStore
                            const imgId = img.dataset.imgId;
                            if (imgId && editor.imageStore) {
                                editor.imageStore.set(imgId, annotatedBlob);
                            }
                            showToast('图片已更新', 'success', 1500);
                        }
                    });
                });
        });
    }

    setupImageClickHandler(qEditorContainer, questionEditor);
    setupImageClickHandler(aEditorContainer, answerEditor);

    body.appendChild(left);

    // ── Right column ─────────────────────────────────────
    const right = createEl('div', { class: 'entry-right' });

    // Options header with mode selector
    const optHeader = createEl('div', { class: 'section-title-row' });
    optHeader.appendChild(createEl('span', { class: 'section-title', textContent: '选项' }));
    optHeader.appendChild(buildOptionModeSelector());
    right.appendChild(optHeader);

    // Options body (re-rendered when mode changes)
    optionsBodyEl = createEl('div', { class: 'options-body' });
    right.appendChild(optionsBodyEl);
    renderOptions();

    body.appendChild(right);
    wrapper.appendChild(body);

    // ── Branch / Tag inline section ──────────────────────
    branchSectionEl = createEl('div', { class: 'entry-branch-tag-section' });
    wrapper.appendChild(branchSectionEl);
    renderBranchTagSection();
    loadBranchesAndTags();

    // ── Footer ───────────────────────────────────────────
    const footer = createEl('div', { class: 'entry-footer' });
    footer.appendChild(createEl('button', {
        class: 'btn btn-accent btn-lg',
        textContent: '💾 保存题目',
        events: { click: handleSave },
    }));
    wrapper.appendChild(footer);

    container.appendChild(wrapper);

    // Expose global insert function for app.js screenshot shortcut
    window.__entryInsertImage = (blob) => {
        const editor = lastFocusedEditor || questionEditor;
        if (editor) editor.insertImage(blob);
    };

    // Check if there's a pending screenshot from global shortcut
    if (app.state.pendingScreenshot) {
        const blob = app.state.pendingScreenshot;
        app.state.pendingScreenshot = null;
        questionEditor.insertImage(blob);
    }

    // Clean up on navigation
    const _origNavigate = app.navigate.bind(app);
    app.navigate = (view, data) => {
        window.__entryInsertImage = null;
        app.navigate = _origNavigate;
        _origNavigate(view, data);
    };

    // ══════════════════════════════════════════════════════
    // Option mode selector
    // ══════════════════════════════════════════════════════
    function buildOptionModeSelector() {
        const group = createEl('div', { class: 'option-mode-group' });
        const modes = [
            { id: 'text', label: '文字' },
            { id: 'single_image', label: '单图' },
            { id: 'split_images', label: '多图' },
        ];

        for (const m of modes) {
            const radio = createEl('label', { class: 'option-mode-radio' });
            const input = createEl('input', {
                type: 'radio',
                name: 'optionMode',
            });
            input.checked = optionMode === m.id;
            input.addEventListener('change', () => {
                optionMode = m.id;
                renderOptions();
            });
            radio.appendChild(input);
            radio.appendChild(document.createTextNode(m.label));
            group.appendChild(radio);
        }

        return group;
    }

    // ══════════════════════════════════════════════════════
    // Render options based on current mode
    // ══════════════════════════════════════════════════════
    function renderOptions() {
        // Revoke old URLs
        for (const fn of cleanupFns) fn();
        cleanupFns.length = 0;

        optionsBodyEl.innerHTML = '';

        switch (optionMode) {
            case 'text':
                renderTextOptions();
                break;
            case 'single_image':
                renderSingleImageOption();
                break;
            case 'split_images':
                renderSplitImageOptions();
                break;
        }
    }

    // ── Text option rows ─────────────────────────────────
    function renderTextOptions() {
        // Ensure optionTypes array matches options length
        while (optionTypes.length < options.length) optionTypes.push('text');

        for (let i = 0; i < options.length; i++) {
            const row = createEl('div', { class: 'option-row' });

            // Label
            const label = createEl('span', {
                class: 'option-label',
                textContent: OPTION_LABELS[i],
            });
            row.appendChild(label);

            if (optionTypes[i] === 'image' && optionImages[OPTION_LABELS[i]]) {
                // ── Image preview mode ───────────────────
                const previewWrap = createEl('div', { class: 'option-image-preview' });
                const url = URL.createObjectURL(optionImages[OPTION_LABELS[i]]);
                cleanupFns.push(() => URL.revokeObjectURL(url));
                const img = createEl('img', { src: url });
                img.style.maxHeight = '120px';
                img.style.borderRadius = '6px';
                img.style.border = '1px solid var(--border-light)';
                previewWrap.appendChild(img);

                // Remove button
                const removeBtn = createEl('button', {
                    class: 'option-img-remove-btn',
                    textContent: '✕',
                    title: '移除图片，恢复文字输入',
                });
                const removeIdx = i;
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    optionTypes[removeIdx] = 'text';
                    delete optionImages[OPTION_LABELS[removeIdx]];
                    renderOptions();
                });
                previewWrap.appendChild(removeBtn);
                row.appendChild(previewWrap);
            } else {
                // ── Text textarea mode ───────────────────
                const textarea = createEl('textarea', {
                    class: 'option-input input',
                    placeholder: `选项 ${OPTION_LABELS[i]}...`,
                    rows: '1',
                });
                textarea.value = options[i].text || '';
                const textIdx = i;
                textarea.addEventListener('input', (e) => {
                    options[textIdx].text = e.target.value;
                    autoResize(textarea);
                });

                // Paste handler: system clipboard first, screenshot blob as fallback
                textarea.addEventListener('paste', (e) => {
                    // 1. System clipboard has image? Use it (normal copy-paste)
                    const items = e.clipboardData?.items;
                    if (items) {
                        for (const item of items) {
                            if (item.type.startsWith('image/')) {
                                e.preventDefault();
                                const blob = item.getAsFile();
                                if (blob) {
                                    optionTypes[textIdx] = 'image';
                                    optionImages[OPTION_LABELS[textIdx]] = blob;
                                    renderOptions();
                                }
                                return;
                            }
                        }
                    }
                    // 2. Fallback: pending screenshot blob
                    if (window.__pendingScreenshotBlob) {
                        e.preventDefault();
                        optionTypes[textIdx] = 'image';
                        optionImages[OPTION_LABELS[textIdx]] = window.__pendingScreenshotBlob;
                        renderOptions();
                        return;
                    }
                    // 3. Text paste - let through normally
                });

                // Drag-and-drop: image file onto textarea converts to image option
                textarea.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    textarea.classList.add('drag-over');
                });
                textarea.addEventListener('dragleave', () => {
                    textarea.classList.remove('drag-over');
                });
                textarea.addEventListener('drop', (e) => {
                    e.preventDefault();
                    textarea.classList.remove('drag-over');
                    const file = e.dataTransfer?.files?.[0];
                    if (file && file.type.startsWith('image/')) {
                        optionImages[OPTION_LABELS[textIdx]] = file;
                        optionTypes[textIdx] = 'image';
                        renderOptions();
                    }
                });

                row.appendChild(textarea);

                // Auto-resize textarea on mount
                requestAnimationFrame(() => autoResize(textarea));
            }

            // ── Screenshot button (camera) per option ────
            const camBtn = createEl('button', {
                class: 'option-cam-btn',
                textContent: '📷',
                title: '截图粘贴到此选项',
            });
            const camIdx = i;
            camBtn.addEventListener('click', async () => {
                try {
                    showToast('正在截图...', 'success', 2000);
                    const result = await api('POST', '/api/screenshot');
                    if (result.cancelled) {
                        showToast('截图已取消', 'error', 1500);
                        return;
                    }
                    if (result.image_data) {
                        const blob = base64ToBlob(result.image_data);
                        optionTypes[camIdx] = 'image';
                        optionImages[OPTION_LABELS[camIdx]] = blob;
                        renderOptions();
                    }
                } catch (err) {
                    showToast('截图失败: ' + err.message, 'error');
                }
            });
            row.appendChild(camBtn);

            // Correct toggle
            const isCorrect = correctIndices.includes(i);
            const toggle = createEl('button', {
                class: `toggle-correct ${isCorrect ? 'active' : ''}`,
                textContent: isCorrect ? '✅' : '○',
                title: '标记为正确答案',
            });
            const idx = i;
            toggle.addEventListener('click', () => {
                toggleCorrect(idx);
                const nowCorrect = correctIndices.includes(idx);
                toggle.classList.toggle('active', nowCorrect);
                toggle.textContent = nowCorrect ? '✅' : '○';
            });
            row.appendChild(toggle);

            optionsBodyEl.appendChild(row);
        }

        // Add option button
        if (options.length < MAX_OPTIONS) {
            const addBtn = createEl('button', {
                class: 'btn-add-option',
                textContent: '➕ 增加选项',
                events: {
                    click: () => {
                        options.push({ text: '' });
                        optionTypes.push('text');
                        renderOptions();
                    },
                },
            });
            optionsBodyEl.appendChild(addBtn);
        }
    }

    // ── Single image option ──────────────────────────────
    function renderSingleImageOption() {
        const zone = createEl('div', {
            class: `image-drop-zone image-drop-zone-large ${singleOptionImage ? 'has-image' : ''}`,
        });

        if (singleOptionImage) {
            const url = URL.createObjectURL(singleOptionImage);
            cleanupFns.push(() => URL.revokeObjectURL(url));
            const img = createEl('img', { src: url });
            zone.appendChild(img);

            // Remove button
            const removeBtn = createEl('button', {
                class: 'image-remove-btn',
                textContent: '✕',
                events: {
                    click: (e) => {
                        e.stopPropagation();
                        singleOptionImage = null;
                        renderOptions();
                    },
                },
            });
            zone.appendChild(removeBtn);
        } else {
            zone.appendChild(createEl('div', { class: 'drop-placeholder' }, [
                createEl('span', { textContent: '📷' }),
                createEl('span', { textContent: '点击或拖拽上传选项图片' }),
            ]));
        }

        // Click to upload
        zone.addEventListener('click', (e) => {
            if (e.target.closest('.image-remove-btn')) return;
            pickImage((blob) => {
                singleOptionImage = blob;
                renderOptions();
            });
        });

        // Drag and drop
        setupDropZone(zone, (blob) => {
            singleOptionImage = blob;
            renderOptions();
        });

        // Paste area - a real textarea that reliably catches paste events
        const pasteArea = createEl('textarea', {
            class: 'single-image-paste-area',
            placeholder: '📋 点击此处后 Cmd+V 粘贴图片，或使用上方拖拽/点击上传',
            rows: '2',
        });
        pasteArea.style.cssText = 'width:100%;resize:none;margin-top:8px;background:var(--bg);border:1px dashed var(--border-light);border-radius:var(--radius-sm);padding:10px;color:var(--text-muted);font-size:13px;text-align:center;cursor:text;';
        pasteArea.addEventListener('paste', (e) => {
            e.preventDefault();
            // 1. System clipboard image
            const items = e.clipboardData?.items;
            if (items) {
                for (const item of items) {
                    if (item.type.startsWith('image/')) {
                        const blob = item.getAsFile();
                        if (blob) {
                            singleOptionImage = blob;
                            renderOptions();
                        }
                        return;
                    }
                }
            }
            // 2. Pending screenshot blob
            if (window.__pendingScreenshotBlob) {
                singleOptionImage = window.__pendingScreenshotBlob;
                renderOptions();
                return;
            }
            showToast('剪贴板中没有图片', 'error', 1500);
        });
        // Prevent typing text
        pasteArea.addEventListener('keydown', (e) => {
            if (!(e.metaKey || e.ctrlKey)) e.preventDefault();
        });

        optionsBodyEl.appendChild(zone);
        optionsBodyEl.appendChild(pasteArea);

        // Correct answer indicators for image mode
        renderImageCorrectToggles();
    }

    // ── Split images option ──────────────────────────────
    function renderSplitImageOptions() {
        const grid = createEl('div', { class: 'image-grid' });

        for (let i = 0; i < 4; i++) {
            const label = OPTION_LABELS[i];
            const cell = createEl('div', { class: 'image-grid-cell' });

            // Label row
            const labelRow = createEl('div', { class: 'image-cell-label' });
            labelRow.appendChild(createEl('span', { textContent: label }));

            // Correct toggle for this option
            const isCorrect = correctIndices.includes(i);
            const toggle = createEl('button', {
                class: `toggle-correct toggle-correct-sm ${isCorrect ? 'active' : ''}`,
                textContent: isCorrect ? '✅' : '○',
            });
            const idx = i;
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleCorrect(idx);
                const nowCorrect = correctIndices.includes(idx);
                toggle.classList.toggle('active', nowCorrect);
                toggle.textContent = nowCorrect ? '✅' : '○';
            });
            labelRow.appendChild(toggle);
            cell.appendChild(labelRow);

            // Drop zone (with paste support)
            const cellLabel = label;
            const cellIdx = i;
            const zone = createEl('div', {
                class: `image-drop-zone ${optionImages[label] ? 'has-image' : ''}`,
            });

            if (optionImages[label]) {
                const url = URL.createObjectURL(optionImages[label]);
                cleanupFns.push(() => URL.revokeObjectURL(url));
                zone.appendChild(createEl('img', { src: url }));

                const removeBtn = createEl('button', {
                    class: 'image-remove-btn',
                    textContent: '✕',
                    events: {
                        click: (e) => {
                            e.stopPropagation();
                            delete optionImages[label];
                            renderOptions();
                        },
                    },
                });
                zone.appendChild(removeBtn);
            } else {
                zone.appendChild(createEl('span', {
                    class: 'drop-placeholder-text',
                    textContent: '点击上传',
                }));
            }

            const lbl = label;
            zone.addEventListener('click', (e) => {
                if (e.target.closest('.image-remove-btn')) return;
                pickImage((blob) => {
                    optionImages[lbl] = blob;
                    renderOptions();
                });
            });

            setupDropZone(zone, (blob) => {
                optionImages[lbl] = blob;
                renderOptions();
            });

            // Paste support (Cmd+V) for multi-image zones
            zone.setAttribute('tabindex', '0');
            zone.addEventListener('paste', (e) => {
                e.preventDefault();
                if (window.__pendingScreenshotBlob) {
                    optionImages[cellLabel] = window.__pendingScreenshotBlob;
                    // Don't clear - allow pasting to multiple locations
                    renderOptions();
                    return;
                }
                const items = e.clipboardData?.items;
                if (!items) return;
                for (const item of items) {
                    if (item.type.startsWith('image/')) {
                        const blob = item.getAsFile();
                        if (blob) {
                            optionImages[cellLabel] = blob;
                            renderOptions();
                        }
                        return;
                    }
                }
            });

            cell.appendChild(zone);
            grid.appendChild(cell);
        }

        optionsBodyEl.appendChild(grid);
    }

    // ── Correct answer toggles for image modes ───────────
    function renderImageCorrectToggles() {
        const row = createEl('div', { class: 'image-correct-row' });
        row.appendChild(createEl('span', {
            class: 'image-correct-label',
            textContent: '正确答案：',
        }));

        const toggles = createEl('div', { class: 'image-correct-toggles' });
        for (let i = 0; i < 4; i++) {
            const isCorrect = correctIndices.includes(i);
            const btn = createEl('button', {
                class: `toggle-correct toggle-correct-labeled ${isCorrect ? 'active' : ''}`,
                textContent: isCorrect ? '✅' : OPTION_LABELS[i],
            });
            const idx = i;
            btn.addEventListener('click', () => {
                toggleCorrect(idx);
                const nowCorrect = correctIndices.includes(idx);
                btn.classList.toggle('active', nowCorrect);
                btn.textContent = nowCorrect ? '✅' : OPTION_LABELS[idx];
            });
            toggles.appendChild(btn);
        }
        row.appendChild(toggles);
        optionsBodyEl.appendChild(row);
    }

    // ══════════════════════════════════════════════════════
    // Helpers
    // ══════════════════════════════════════════════════════

    function toggleCorrect(idx) {
        const pos = correctIndices.indexOf(idx);
        if (pos >= 0) {
            correctIndices.splice(pos, 1);
        } else {
            correctIndices.push(idx);
        }
    }

    function autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }

    function pickImage(callback) {
        const input = createEl('input', {
            type: 'file',
            accept: 'image/*',
            style: { display: 'none' },
        });
        input.addEventListener('change', () => {
            if (input.files && input.files[0]) {
                callback(input.files[0]);
            }
            input.remove();
        });
        document.body.appendChild(input);
        input.click();
    }

    function setupDropZone(zone, onDrop) {
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.add('drag-over');
        });
        zone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('drag-over');
        });
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('drag-over');
            const file = e.dataTransfer?.files?.[0];
            if (file && file.type.startsWith('image/')) {
                onDrop(file);
            }
        });
    }

    // ══════════════════════════════════════════════════════
    // Screenshot
    // ══════════════════════════════════════════════════════
    async function handleScreenshot() {
        try {
            showToast('正在截图，请框选区域...', 'success', 3000);
            const result = await api('POST', '/api/screenshot');

            if (result.cancelled) {
                showToast('截图已取消', 'error', 1500);
                return;
            }

            if (result.image_data) {
                const blob = base64ToBlob(result.image_data);

                // Open annotator
                const annotator = new ImageAnnotator();
                annotator.open(blob, async (annotatedBlob) => {
                    if (annotatedBlob) {
                        // Always store for internal paste handlers
                        window.__pendingScreenshotBlob = annotatedBlob;
                        // Also try system clipboard (may not work in pywebview)
                        try {
                            await navigator.clipboard.write([
                                new ClipboardItem({ [annotatedBlob.type]: annotatedBlob })
                            ]);
                        } catch (_) { /* ignore */ }
                        showToast('📋 已就绪，Cmd+V 粘贴到目标位置', 'success', 2500);
                    }
                });
            }
        } catch (err) {
            showToast('截图失败: ' + err.message, 'error');
        }
    }

    // ══════════════════════════════════════════════════════
    // Branch / Tag inline selector
    // ══════════════════════════════════════════════════════

    async function loadBranchesAndTags() {
        try {
            const [bData, tData] = await Promise.all([
                api('GET', '/api/branches'),
                api('GET', '/api/tags'),
            ]);
            branchData = bData;
            tagData = tData;
            renderBranchTagSection();
        } catch (err) {
            showToast('加载分支/标签失败: ' + err.message, 'error');
        }
    }

    function renderBranchTagSection() {
        if (!branchSectionEl) return;
        branchSectionEl.innerHTML = '';

        const inner = createEl('div', { class: 'entry-bt-inner' });

        // ── Branch selector ──────────────────────────────
        const branchGroup = createEl('div', { class: 'entry-bt-group' });
        branchGroup.appendChild(createEl('span', { class: 'entry-bt-label', textContent: '📁 分支：' }));

        const branchBtnWrap = createEl('div', { class: 'entry-bt-btn-wrap' });
        const branchBtn = createEl('button', {
            class: 'entry-bt-dropdown-btn',
            textContent: selectedBranch || '点击选择分支...',
        });
        if (!selectedBranch) branchBtn.classList.add('placeholder');
        branchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            branchDropdownOpen = !branchDropdownOpen;
            tagDropdownOpen = false;
            renderBranchTagSection();
        });
        branchBtnWrap.appendChild(branchBtn);

        // Branch dropdown
        if (branchDropdownOpen) {
            const dropdown = createEl('div', { class: 'entry-bt-dropdown' });

            // Search
            const searchInput = createEl('input', {
                class: 'entry-bt-search input',
                placeholder: '搜索分支...',
            });
            searchInput.value = branchSearchText;
            searchInput.addEventListener('input', (e) => {
                branchSearchText = e.target.value;
                renderBranchDropdownTree(treeContainer);
            });
            searchInput.addEventListener('click', (e) => e.stopPropagation());
            dropdown.appendChild(searchInput);

            // Tree container
            const treeContainer = createEl('div', { class: 'entry-bt-tree' });
            renderBranchDropdownTree(treeContainer);
            dropdown.appendChild(treeContainer);

            // Bottom link to full tree-selector
            const fullLink = createEl('div', { class: 'entry-bt-full-link' });
            fullLink.textContent = '🔧 打开完整分支管理...';
            fullLink.addEventListener('click', (e) => {
                e.stopPropagation();
                branchDropdownOpen = false;
                // Store pending data before navigating
                storePendingForTreeSelector();
                app.navigate('tree-selector');
            });
            dropdown.appendChild(fullLink);

            branchBtnWrap.appendChild(dropdown);

            // Close on outside click
            requestAnimationFrame(() => {
                const closeHandler = (ev) => {
                    if (!branchBtnWrap.contains(ev.target)) {
                        branchDropdownOpen = false;
                        branchSearchText = '';
                        renderBranchTagSection();
                        document.removeEventListener('click', closeHandler, true);
                    }
                };
                document.addEventListener('click', closeHandler, true);
            });
        }

        branchGroup.appendChild(branchBtnWrap);
        inner.appendChild(branchGroup);

        // ── Tag chips ────────────────────────────────────
        const tagGroup = createEl('div', { class: 'entry-bt-group' });
        tagGroup.appendChild(createEl('span', { class: 'entry-bt-label', textContent: '🏷️ 标签：' }));

        const tagChipWrap = createEl('div', { class: 'entry-bt-chip-wrap' });

        for (const tag of selectedTags) {
            const chip = createEl('span', { class: 'entry-tag-chip' });
            chip.appendChild(document.createTextNode(tag));
            const removeX = createEl('span', { class: 'entry-tag-chip-x', textContent: '✕' });
            const tagToRemove = tag;
            removeX.addEventListener('click', (e) => {
                e.stopPropagation();
                selectedTags = selectedTags.filter(t => t !== tagToRemove);
                renderBranchTagSection();
            });
            chip.appendChild(removeX);
            tagChipWrap.appendChild(chip);
        }

        // +添加 button
        const addTagBtnWrap = createEl('div', { class: 'entry-bt-btn-wrap entry-bt-tag-add-wrap' });
        const addTagBtn = createEl('button', {
            class: 'entry-tag-add-btn',
            textContent: '+ 添加',
        });
        addTagBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            tagDropdownOpen = !tagDropdownOpen;
            branchDropdownOpen = false;
            renderBranchTagSection();
        });
        addTagBtnWrap.appendChild(addTagBtn);

        if (tagDropdownOpen) {
            const dropdown = createEl('div', { class: 'entry-bt-dropdown' });

            // Search
            const searchInput = createEl('input', {
                class: 'entry-bt-search input',
                placeholder: '搜索标签...',
            });
            searchInput.value = tagSearchText;
            searchInput.addEventListener('input', (e) => {
                tagSearchText = e.target.value;
                renderTagDropdownTree(tagTreeCt);
            });
            searchInput.addEventListener('click', (e) => e.stopPropagation());
            dropdown.appendChild(searchInput);

            const tagTreeCt = createEl('div', { class: 'entry-bt-tree' });
            renderTagDropdownTree(tagTreeCt);
            dropdown.appendChild(tagTreeCt);

            addTagBtnWrap.appendChild(dropdown);

            requestAnimationFrame(() => {
                const closeHandler = (ev) => {
                    if (!addTagBtnWrap.contains(ev.target)) {
                        tagDropdownOpen = false;
                        tagSearchText = '';
                        renderBranchTagSection();
                        document.removeEventListener('click', closeHandler, true);
                    }
                };
                document.addEventListener('click', closeHandler, true);
            });
        }

        tagChipWrap.appendChild(addTagBtnWrap);
        tagGroup.appendChild(tagChipWrap);
        inner.appendChild(tagGroup);

        branchSectionEl.appendChild(inner);
    }

    function renderBranchDropdownTree(container) {
        container.innerHTML = '';
        if (!branchData) {
            container.innerHTML = '<div class="loading-spinner" style="padding:16px">加载中...</div>';
            return;
        }
        const filter = branchSearchText.toLowerCase();
        if (branchData.children !== undefined) {
            buildBranchDropdownNode(branchData, 0, container, filter);
        } else if (Array.isArray(branchData)) {
            for (const node of branchData) {
                buildBranchDropdownNode(node, 0, container, filter);
            }
        }
    }

    function buildBranchDropdownNode(node, depth, parentEl, filter) {
        const matchSelf = !filter || node.name.toLowerCase().includes(filter);
        const hasChildren = node.children && node.children.length > 0;

        // Check if any descendant matches
        let childMatch = false;
        if (hasChildren && filter) {
            childMatch = nodeTreeHasMatch(node.children, filter);
        }

        if (!matchSelf && !childMatch) return;

        const row = createEl('div', {
            class: `entry-bt-tree-row ${selectedBranch === node.path ? 'selected' : ''}`,
        });
        row.style.paddingLeft = `${8 + depth * 16}px`;
        row.appendChild(createEl('span', { textContent: '📁 ', style: { fontSize: '12px' } }));
        row.appendChild(createEl('span', { textContent: node.name }));

        row.addEventListener('click', (e) => {
            e.stopPropagation();
            selectedBranch = node.path;
            branchDropdownOpen = false;
            branchSearchText = '';
            renderBranchTagSection();
        });

        parentEl.appendChild(row);

        if (hasChildren) {
            for (const child of node.children) {
                buildBranchDropdownNode(child, depth + 1, parentEl, filter);
            }
        }
    }

    function nodeTreeHasMatch(children, filter) {
        for (const child of children) {
            if (child.name.toLowerCase().includes(filter)) return true;
            if (child.children && child.children.length > 0) {
                if (nodeTreeHasMatch(child.children, filter)) return true;
            }
        }
        return false;
    }

    function renderTagDropdownTree(container) {
        container.innerHTML = '';
        if (!tagData) {
            container.innerHTML = '<div class="loading-spinner" style="padding:16px">加载中...</div>';
            return;
        }
        const filter = tagSearchText.toLowerCase();
        for (const [key, val] of Object.entries(tagData)) {
            buildTagDropdownNode(key, val, '', 0, container, filter);
        }
    }

    function buildTagDropdownNode(name, children, parentPath, depth, parentEl, filter) {
        const path = parentPath ? `${parentPath}/${name}` : name;
        const childKeys = Object.keys(children || {});
        const hasChildren = childKeys.length > 0;
        const matchSelf = !filter || name.toLowerCase().includes(filter);

        let childMatch = false;
        if (hasChildren && filter) {
            childMatch = tagTreeHasMatch(children, filter);
        }

        if (!matchSelf && !childMatch) return;

        const isChecked = selectedTags.includes(path);
        const row = createEl('div', {
            class: `entry-bt-tree-row ${isChecked ? 'checked' : ''}`,
        });
        row.style.paddingLeft = `${8 + depth * 16}px`;

        const checkbox = createEl('span', {
            class: `entry-bt-checkbox ${isChecked ? 'checked' : ''}`,
            textContent: isChecked ? '☑' : '☐',
        });
        row.appendChild(checkbox);
        row.appendChild(createEl('span', { textContent: name }));

        row.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = selectedTags.indexOf(path);
            if (idx >= 0) {
                selectedTags.splice(idx, 1);
            } else {
                selectedTags.push(path);
            }
            renderBranchTagSection();
        });

        parentEl.appendChild(row);

        if (hasChildren) {
            for (const key of childKeys) {
                buildTagDropdownNode(key, children[key], path, depth + 1, parentEl, filter);
            }
        }
    }

    function tagTreeHasMatch(children, filter) {
        for (const [key, val] of Object.entries(children)) {
            if (key.toLowerCase().includes(filter)) return true;
            if (val && Object.keys(val).length > 0) {
                if (tagTreeHasMatch(val, filter)) return true;
            }
        }
        return false;
    }

    function storePendingForTreeSelector() {
        const qContent = questionEditor.getContent();
        const aContent = answerEditor.getContent();
        const questionType = qContent.images.length > 0 ? 'image' : 'text';
        const answerType = aContent.images.length > 0 ? 'image' : 'text';
        const optionList = options.map((opt, i) => ({
            label: OPTION_LABELS[i],
            type: optionTypes[i] || 'text',
            content: opt.text || '',
        }));
        const optImgMap = {};
        if (optionMode === 'text') {
            for (const [label, blob] of Object.entries(optionImages)) {
                optImgMap[label] = blob;
            }
        } else if (optionMode === 'split_images') {
            for (const [label, blob] of Object.entries(optionImages)) {
                optImgMap[label] = blob;
            }
        } else if (optionMode === 'single_image' && singleOptionImage) {
            optImgMap['_single'] = singleOptionImage;
        }
        app.state.pendingQuestion = {
            questionType,
            questionContent: qContent.text,
            questionImages: qContent.images,
            optionMode,
            options: optionList,
            optionImages: optImgMap,
            answerType,
            answerContent: aContent.text,
            answerImages: aContent.images,
            correctIndices: [...correctIndices],
        };
        app.state.selectedBranch = selectedBranch;
        app.state.selectedTags = [...selectedTags];
    }

    // ══════════════════════════════════════════════════════
    // Save (direct, no page navigation)
    // ══════════════════════════════════════════════════════
    async function handleSave() {
        // 1. Validate
        const qContent = questionEditor.getContent();
        const aContent = answerEditor.getContent();

        if (!qContent.text || !qContent.text.trim()) {
            showToast('请输入题干内容', 'error');
            return;
        }
        if (!selectedBranch) {
            showToast('请先选择一个分支', 'error');
            return;
        }

        // 2. Determine types
        const questionType = qContent.images.length > 0 ? 'image' : 'text';
        const answerType = aContent.images.length > 0 ? 'image' : 'text';

        // 3. Build options array
        const optionList = options.map((opt, i) => ({
            label: OPTION_LABELS[i],
            type: optionTypes[i] || 'text',
            content: opt.text || '',
        }));
        // 4. Determine effective option_mode
        // If in 'text' mode but some options have images, use 'split_images'
        let effectiveOptionMode = optionMode;
        if (optionMode === 'text') {
            const hasImageOptions = optionTypes.some(t => t === 'image');
            if (hasImageOptions) {
                effectiveOptionMode = 'split_images';
            }
        }

        // 5. Build FormData (must match backend field names exactly)
        const fd = new FormData();
        fd.append('branch_path', selectedBranch);
        fd.append('question_type', questionType);
        fd.append('question_content', qContent.text || '');
        fd.append('option_mode', effectiveOptionMode);
        fd.append('options_json', JSON.stringify(optionList));
        fd.append('answer_type', answerType);
        fd.append('answer_content', aContent.text || '');
        fd.append('correct_indices_json', JSON.stringify(correctIndices));
        fd.append('tags_json', JSON.stringify(selectedTags));

        // Question image (backend expects single 'question_image')
        if (qContent.images && qContent.images.length > 0) {
            fd.append('question_image', qContent.images[0], 'question.png');
        }
        // Answer image (backend expects single 'answer_image')
        if (aContent.images && aContent.images.length > 0) {
            fd.append('answer_image', aContent.images[0], 'answer.png');
        }
        // Option images
        if (optionMode === 'single_image' && singleOptionImage) {
            fd.append('options_image', singleOptionImage, 'options.png');
        } else {
            // Per-option images: map to option_A, option_B, etc.
            for (const [label, blob] of Object.entries(optionImages)) {
                fd.append(`option_${label}`, blob, `option_${label}.png`);
            }
        }

        // 5. POST
        try {
            const resp = await fetch('/api/question', { method: 'POST', body: fd });
            if (!resp.ok) {
                const text = await resp.text().catch(() => '');
                throw new Error(`${resp.status}: ${text}`);
            }

            showToast('✅ 题目已保存！', 'success');

            // 6. Clear state and reset form
            questionEditor.clear();
            answerEditor.clear();
            options = [{ text: '' }, { text: '' }, { text: '' }, { text: '' }];
            optionTypes = ['text', 'text', 'text', 'text'];
            correctIndices = [0];
            optionImages = {};
            singleOptionImage = null;
            // Keep branch & tags selected for next entry
            renderOptions();
        } catch (err) {
            showToast('保存失败: ' + err.message, 'error');
        }
    }
}

// ══════════════════════════════════════════════════════════
// CSS injection for entry extras
// ══════════════════════════════════════════════════════════
function injectEntryExtraStyles() {
    if (document.getElementById('entry-extra-styles')) return;
    const style = document.createElement('style');
    style.id = 'entry-extra-styles';
    style.textContent = `
        /* ── Section hint ─────────────────────────────── */
        .section-hint {
            font-size: 12px;
            color: var(--text-muted);
            font-weight: 400;
            margin-left: auto;
        }
        /* ── Option image preview ──────────────────────── */
        .option-image-preview {
            flex: 1;
            min-width: 0;
            position: relative;
            display: inline-flex;
            align-items: flex-start;
            gap: 6px;
        }

        .option-image-preview img {
            max-height: 120px;
            max-width: 100%;
            object-fit: contain;
        }

        .option-img-remove-btn {
            position: absolute;
            top: 2px;
            right: 2px;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            border: none;
            background: rgba(233, 69, 96, 0.85);
            color: #fff;
            font-size: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.15s;
        }

        .option-img-remove-btn:hover {
            background: var(--accent-hover);
        }

        /* ── Camera button per option ──────────────────── */
        .option-cam-btn {
            flex-shrink: 0;
            width: 28px;
            height: 28px;
            border-radius: var(--radius-xs);
            border: 1px solid var(--border);
            background: transparent;
            color: var(--text-muted);
            font-size: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all var(--transition);
            margin-top: 2px;
        }

        .option-cam-btn:hover {
            background: rgba(255, 255, 255, 0.06);
            border-color: var(--border-light);
            color: var(--text);
        }

        /* ── Image drop zones (single/multi image modes) ── */
        .image-drop-zone {
            border: 2px dashed var(--border-light);
            border-radius: var(--radius-sm);
            padding: 16px;
            text-align: center;
            cursor: pointer;
            transition: all var(--transition);
            position: relative;
            min-height: 60px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255,255,255,0.02);
        }
        .image-drop-zone:hover {
            border-color: var(--accent);
            background: rgba(233, 69, 96, 0.05);
        }
        .image-drop-zone.has-image {
            border-style: solid;
            border-color: var(--border);
            padding: 8px;
        }
        .image-drop-zone img {
            max-width: 100%;
            max-height: 250px;
            object-fit: contain;
            border-radius: var(--radius-xs);
        }
        .image-drop-zone-large {
            min-height: 120px;
        }
        .image-drop-zone-large img {
            max-height: 350px;
        }
        .drop-placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            color: var(--text-muted);
            font-size: 13px;
        }
        .drop-placeholder span:first-child {
            font-size: 28px;
        }
        .drop-placeholder-text {
            color: var(--text-muted);
            font-size: 12px;
        }

        /* ── Image remove button ──────────────────────── */
        .image-remove-btn {
            position: absolute;
            top: 6px;
            right: 6px;
            width: 26px;
            height: 26px;
            border-radius: 50%;
            border: none;
            background: rgba(233, 69, 96, 0.9);
            color: #fff;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
            transition: all 0.15s;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
        .image-remove-btn:hover {
            background: #e94560;
            transform: scale(1.15);
        }

        /* ── Branch / Tag inline section ───────────────── */
        .entry-branch-tag-section {
            padding: 12px 16px;
            border-top: 1px solid var(--border);
            flex-shrink: 0;
        }

        .entry-bt-inner {
            display: flex;
            gap: 24px;
            align-items: flex-start;
            flex-wrap: wrap;
        }

        .entry-bt-group {
            display: flex;
            align-items: flex-start;
            gap: 8px;
        }

        .entry-bt-label {
            font-size: 13px;
            font-weight: 600;
            color: var(--text-secondary);
            white-space: nowrap;
            line-height: 30px;
        }

        /* ── Dropdown button ───────────────────────────── */
        .entry-bt-btn-wrap {
            position: relative;
        }

        .entry-bt-dropdown-btn {
            padding: 5px 14px;
            font-size: 13px;
            font-family: var(--font);
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-xs);
            color: var(--text);
            cursor: pointer;
            transition: all var(--transition);
            white-space: nowrap;
            max-width: 260px;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .entry-bt-dropdown-btn.placeholder {
            color: var(--text-dim);
        }

        .entry-bt-dropdown-btn:hover {
            border-color: var(--border-light);
            background: var(--surface-hover);
        }

        /* ── Dropdown panel ────────────────────────────── */
        .entry-bt-dropdown {
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            min-width: 280px;
            max-width: 360px;
            background: var(--surface-raised);
            border: 1px solid var(--border-light);
            border-radius: var(--radius-sm);
            box-shadow: var(--shadow-lg);
            z-index: 100;
            animation: fadeIn 0.12s ease;
            display: flex;
            flex-direction: column;
        }

        .entry-bt-search {
            margin: 8px;
            font-size: 13px;
        }

        .entry-bt-tree {
            max-height: 300px;
            overflow-y: auto;
            padding: 4px 0;
        }

        .entry-bt-tree-row {
            display: flex;
            align-items: center;
            gap: 6px;
            height: 40px;
            padding: 0 12px;
            font-size: 13px;
            cursor: pointer;
            transition: background 0.15s;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .entry-bt-tree-row:hover {
            background: var(--surface-hover);
        }

        .entry-bt-tree-row.selected {
            background: var(--surface-active);
            color: var(--accent);
        }

        .entry-bt-tree-row.checked {
            background: var(--success-dim);
        }

        .entry-bt-checkbox {
            font-size: 14px;
            width: 18px;
            text-align: center;
            flex-shrink: 0;
        }

        .entry-bt-checkbox.checked {
            color: var(--success);
        }

        .entry-bt-full-link {
            padding: 10px 12px;
            font-size: 12px;
            color: var(--text-muted);
            cursor: pointer;
            border-top: 1px solid var(--border);
            transition: all 0.15s;
        }

        .entry-bt-full-link:hover {
            color: var(--text);
            background: rgba(255, 255, 255, 0.03);
        }

        /* ── Tag chips ─────────────────────────────────── */
        .entry-bt-chip-wrap {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            align-items: center;
        }

        .entry-tag-chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 3px 10px;
            background: var(--surface-active);
            border-radius: var(--radius-full);
            font-size: 12px;
            color: var(--text-secondary);
            white-space: nowrap;
        }

        .entry-tag-chip-x {
            cursor: pointer;
            color: var(--text-dim);
            font-size: 11px;
            margin-left: 2px;
            transition: color 0.15s;
        }

        .entry-tag-chip-x:hover {
            color: var(--accent);
        }

        .entry-bt-tag-add-wrap {
            display: inline-block;
        }

        .entry-tag-add-btn {
            padding: 3px 10px;
            font-size: 12px;
            font-family: var(--font);
            background: transparent;
            border: 1px dashed var(--border-light);
            border-radius: var(--radius-full);
            color: var(--text-muted);
            cursor: pointer;
            transition: all var(--transition);
        }

        .entry-tag-add-btn:hover {
            border-color: var(--text-muted);
            color: var(--text);
            background: rgba(255, 255, 255, 0.03);
        }
    `;
    document.head.appendChild(style);
}
