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
    let singleOptionImage = null;   // Blob for single_image mode
    let optionsBodyEl = null;       // reference for re-rendering options
    const cleanupFns = [];          // URL.revokeObjectURL, etc.

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

    // ── Footer ───────────────────────────────────────────
    const footer = createEl('div', { class: 'entry-footer' });
    footer.appendChild(createEl('button', {
        class: 'btn btn-accent btn-lg',
        textContent: '💾 保存并选择分类',
        events: { click: handleSave },
    }));
    wrapper.appendChild(footer);

    container.appendChild(wrapper);

    // Global screenshot shortcut: Ctrl+Shift+A
    const _onGlobalKeydown = (e) => {
        if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
            e.preventDefault();
            handleScreenshot();
        }
    };
    document.addEventListener('keydown', _onGlobalKeydown);

    // Store original navigate and clean up listener on navigation
    const _origNavigate = app.navigate.bind(app);
    app.navigate = (view, data) => {
        document.removeEventListener('keydown', _onGlobalKeydown);
        app.navigate = _origNavigate; // restore
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
        for (let i = 0; i < options.length; i++) {
            const row = createEl('div', { class: 'option-row' });

            // Label
            const label = createEl('span', {
                class: 'option-label',
                textContent: OPTION_LABELS[i],
            });
            row.appendChild(label);

            // Textarea
            const textarea = createEl('textarea', {
                class: 'option-input input',
                placeholder: `选项 ${OPTION_LABELS[i]}...`,
                rows: '1',
            });
            textarea.value = options[i].text || '';
            textarea.addEventListener('input', (e) => {
                options[i].text = e.target.value;
                autoResize(textarea);
            });
            row.appendChild(textarea);

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

            // Auto-resize textarea on mount
            requestAnimationFrame(() => autoResize(textarea));
        }

        // Add option button
        if (options.length < MAX_OPTIONS) {
            const addBtn = createEl('button', {
                class: 'btn-add-option',
                textContent: '➕ 增加选项',
                events: {
                    click: () => {
                        options.push({ text: '' });
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

        optionsBodyEl.appendChild(zone);

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

            // Drop zone
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
                annotator.open(blob, (annotatedBlob) => {
                    if (annotatedBlob) {
                        // Insert into the last-focused editor
                        const editor = lastFocusedEditor || questionEditor;
                        if (editor) {
                            editor.insertImage(annotatedBlob);
                            showToast('图片已插入', 'success', 1500);
                        }
                    }
                });
            }
        } catch (err) {
            showToast('截图失败: ' + err.message, 'error');
        }
    }

    // ══════════════════════════════════════════════════════
    // Save
    // ══════════════════════════════════════════════════════
    function handleSave() {
        const qContent = questionEditor.getContent();
        const aContent = answerEditor.getContent();

        if (!qContent.text || !qContent.text.trim()) {
            showToast('请输入题干内容', 'error');
            return;
        }

        // Determine question type based on whether it has images
        const questionType = qContent.images.length > 0 ? 'image' : 'text';
        const answerType = aContent.images.length > 0 ? 'image' : 'text';

        // Build options array for text mode
        const optionList = options.map((opt, i) => ({
            label: OPTION_LABELS[i],
            type: 'text',
            content: opt.text || '',
        }));

        // Build optionImages map for image modes
        const optImgMap = {};
        if (optionMode === 'split_images') {
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

        app.navigate('tree-selector');
    }
}
