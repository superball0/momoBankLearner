/**
 * MarkdownEditor — Notion 风格的 WYSIWYG Markdown 编辑器
 *
 * 用法:
 *   const editor = new MarkdownEditor(container, {
 *       placeholder: '输入内容...',
 *       onImagePaste: (blob) => { ... },
 *   });
 *   editor.getContent()   → { text: '...', images: [Blob, ...] }
 *   editor.setContent(text, images)
 *   editor.clear()
 *   editor.insertImage(blob)
 *   editor.focus()
 */

import { createEl, uid } from '/static/tools/utils.js';

// Internal clipboard for cross-editor image copy/paste
let _internalClipboard = null;  // { blob: Blob, timestamp: number }

export class MarkdownEditor {
    /**
     * @param {HTMLElement} container
     * @param {{ placeholder?: string, onImagePaste?: (blob: Blob) => void }} opts
     */
    constructor(container, opts = {}) {
        this.container = container;
        this.opts = opts;
        /** @type {Map<string, Blob>} imageId → Blob */
        this.imageStore = new Map();
        this._destroyed = false;

        this._build();
        this._bindEvents();
    }

    // ── Build DOM ─────────────────────────────────────────
    _build() {
        this.wrapper = createEl('div', { class: 'md-editor' });

        // Toolbar
        this.toolbar = createEl('div', { class: 'md-toolbar' });
        const tools = [
            { label: 'H1', cmd: 'h1' },
            { label: 'H2', cmd: 'h2' },
            { label: 'H3', cmd: 'h3' },
            { type: 'sep' },
            { label: 'B', cmd: 'bold' },
            { type: 'sep' },
            { label: '• 列表', cmd: 'ul' },
            { label: '1. 列表', cmd: 'ol' },
            { type: 'sep' },
            { label: '📷 图片', cmd: 'image' },
        ];

        for (const t of tools) {
            if (t.type === 'sep') {
                this.toolbar.appendChild(createEl('div', { class: 'md-toolbar-sep' }));
            } else {
                const btn = createEl('button', {
                    class: 'md-toolbar-btn',
                    textContent: t.label,
                    dataset: { cmd: t.cmd },
                    events: {
                        mousedown: (e) => {
                            e.preventDefault();
                            this._execToolbar(t.cmd);
                        },
                    },
                });
                if (t.cmd === 'image') {
                    btn.style.width = 'auto';
                    btn.style.padding = '0 10px';
                }
                this.toolbar.appendChild(btn);
            }
        }

        // Editable area
        this.editable = createEl('div', {
            class: 'md-editable',
            contenteditable: 'true',
            dataset: { placeholder: this.opts.placeholder || '输入内容...' },
        });

        this.wrapper.appendChild(this.toolbar);
        this.wrapper.appendChild(this.editable);
        this.container.appendChild(this.wrapper);
    }

    // ── Toolbar commands ──────────────────────────────────
    _execToolbar(cmd) {
        this.editable.focus();
        switch (cmd) {
            case 'h1':
                document.execCommand('formatBlock', false, 'h1');
                break;
            case 'h2':
                document.execCommand('formatBlock', false, 'h2');
                break;
            case 'h3':
                document.execCommand('formatBlock', false, 'h3');
                break;
            case 'bold':
                document.execCommand('bold');
                break;
            case 'ul':
                document.execCommand('insertUnorderedList');
                break;
            case 'ol':
                document.execCommand('insertOrderedList');
                break;
            case 'image':
                this._openFilePicker();
                break;
        }
    }

    _openFilePicker() {
        const input = createEl('input', {
            type: 'file',
            accept: 'image/*',
            style: { display: 'none' },
        });
        input.addEventListener('change', () => {
            if (input.files && input.files[0]) {
                this.insertImage(input.files[0]);
            }
            input.remove();
        });
        document.body.appendChild(input);
        input.click();
    }

    // ── Events ────────────────────────────────────────────
    _bindEvents() {
        // Input event for markdown shortcuts
        this._onInput = (e) => {
            if (this._destroyed) return;
            this._handleMarkdownShortcuts();
        };
        this.editable.addEventListener('input', this._onInput);

        // Keydown for Enter / Backspace special handling
        this._onKeydown = (e) => {
            if (this._destroyed) return;
            if (e.key === 'Enter') {
                this._handleEnter(e);
            } else if (e.key === 'Backspace') {
                this._handleBackspace(e);
            }
        };
        this.editable.addEventListener('keydown', this._onKeydown);

        // Paste handler
        this._onPaste = (e) => {
            if (this._destroyed) return;
            this._handlePaste(e);
        };
        this.editable.addEventListener('paste', this._onPaste);

        // Right-click on images: copy to clipboard
        this._onContextMenu = (e) => {
            const img = e.target.closest('img');
            if (!img) return;
            e.preventDefault();
            this._showImageContextMenu(e, img);
        };
        this.editable.addEventListener('contextmenu', this._onContextMenu);

        // Copy: include images as blobs
        this._onCopy = (e) => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed) return;
            // Check if selection contains an image
            const range = sel.getRangeAt(0);
            const frag = range.cloneContents();
            const imgs = frag.querySelectorAll('img');
            if (imgs.length === 0) return; // default text copy is fine
            // For single image selection, copy as image
            if (imgs.length === 1 && !frag.textContent.trim()) {
                e.preventDefault();
                const imgEl = this.editable.querySelector(`img[data-img-id="${imgs[0].dataset.imgId}"]`);
                if (imgEl) this._copyImageToClipboard(imgEl);
            }
        };
        this.editable.addEventListener('copy', this._onCopy);
    }

    /** Show context menu for image right-click */
    _showImageContextMenu(e, img) {
        // Remove existing menu
        document.querySelectorAll('.md-context-menu').forEach(m => m.remove());

        const menu = createEl('div', { class: 'md-context-menu' });
        menu.style.position = 'fixed';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';

        const copyBtn = createEl('div', {
            class: 'md-context-item',
            textContent: '📋 复制图片',
            events: {
                click: () => {
                    this._copyImageToClipboard(img);
                    menu.remove();
                },
            },
        });
        menu.appendChild(copyBtn);

        const deleteBtn = createEl('div', {
            class: 'md-context-item md-context-danger',
            textContent: '🗑 删除图片',
            events: {
                click: () => {
                    const imgId = img.dataset.imgId;
                    if (imgId) this.imageStore.delete(imgId);
                    if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
                    img.remove();
                    menu.remove();
                },
            },
        });
        menu.appendChild(deleteBtn);

        document.body.appendChild(menu);

        // Close on click outside
        const closeMenu = (ev) => {
            if (!menu.contains(ev.target)) {
                menu.remove();
                document.removeEventListener('mousedown', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
    }

    /** Copy image element to clipboard (internal + system) */
    async _copyImageToClipboard(img) {
        try {
            const imgId = img.dataset.imgId;
            let blob = imgId ? this.imageStore.get(imgId) : null;
            if (!blob) {
                const resp = await fetch(img.src);
                blob = await resp.blob();
            }

            // Always store in internal clipboard (works reliably)
            _internalClipboard = { blob: blob, timestamp: Date.now() };

            // Try system clipboard too (may fail in pywebview)
            try {
                const bitmap = await createImageBitmap(blob);
                const canvas = document.createElement('canvas');
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                canvas.getContext('2d').drawImage(bitmap, 0, 0);
                canvas.toBlob(async (pngBlob) => {
                    try {
                        await navigator.clipboard.write([
                            new ClipboardItem({ 'image/png': pngBlob }),
                        ]);
                    } catch (_) { /* ignore */ }
                }, 'image/png');
            } catch (_) { /* ignore */ }

            const { showToast } = await import('/static/tools/utils.js');
            showToast('图片已复制，可粘贴到其他编辑器', 'success', 1500);
        } catch (err) {
            console.error('Copy image failed:', err);
        }
    }

    // ── Markdown shortcuts ────────────────────────────────
    _handleMarkdownShortcuts() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        let node = range.startContainer;

        // Get text content of current line
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;

            // # Heading shortcuts at start of line
            const headingMatch = text.match(/^(#{1,3})\s/);
            if (headingMatch) {
                const level = headingMatch[1].length;
                const tag = `h${level}`;
                const remaining = text.slice(headingMatch[0].length);

                // Find the parent block
                let block = node.parentElement;
                while (block && block !== this.editable && !this._isBlockEl(block)) {
                    block = block.parentElement;
                }

                // Replace with heading
                const heading = createEl(tag, {}, [remaining]);
                if (block && block !== this.editable) {
                    block.replaceWith(heading);
                } else {
                    node.textContent = '';
                    const newTextNode = document.createTextNode(remaining);
                    document.execCommand('formatBlock', false, tag);
                    // Re-select
                    const newSel = window.getSelection();
                    if (newSel && newSel.rangeCount) {
                        const newRange = newSel.getRangeAt(0);
                        const container = newRange.startContainer;
                        if (container.nodeType === Node.TEXT_NODE) {
                            container.textContent = remaining;
                            const r = document.createRange();
                            r.setStart(container, remaining.length);
                            r.collapse(true);
                            newSel.removeAllRanges();
                            newSel.addRange(r);
                        }
                    }
                }
                return;
            }

            // Bold: **text** → <strong>text</strong>
            const boldMatch = text.match(/\*\*(.+?)\*\*/);
            if (boldMatch) {
                const before = text.slice(0, boldMatch.index);
                const inner = boldMatch[1];
                const after = text.slice(boldMatch.index + boldMatch[0].length);

                const parent = node.parentNode;
                const frag = document.createDocumentFragment();
                if (before) frag.appendChild(document.createTextNode(before));
                frag.appendChild(createEl('strong', {}, [inner]));
                if (after) frag.appendChild(document.createTextNode(after));

                parent.replaceChild(frag, node);

                // Move cursor after the strong
                const newSel = window.getSelection();
                const afterNode = parent.childNodes[parent.childNodes.length - 1];
                if (afterNode) {
                    const r = document.createRange();
                    if (afterNode.nodeType === Node.TEXT_NODE) {
                        r.setStart(afterNode, 0);
                    } else {
                        r.setStartAfter(afterNode);
                    }
                    r.collapse(true);
                    newSel.removeAllRanges();
                    newSel.addRange(r);
                }
                return;
            }

            // Unordered list: "- " at start
            if (text.match(/^-\s$/)) {
                node.textContent = '';
                document.execCommand('insertUnorderedList');
                return;
            }

            // Ordered list: "1. " at start
            if (text.match(/^1\.\s$/)) {
                node.textContent = '';
                document.execCommand('insertOrderedList');
                return;
            }
        }
    }

    _isBlockEl(el) {
        const blocks = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE'];
        return blocks.includes(el.tagName);
    }

    // ── Enter handling ────────────────────────────────────
    _handleEnter(e) {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        let block = range.startContainer;
        if (block.nodeType === Node.TEXT_NODE) block = block.parentElement;

        // Find closest block
        while (block && block !== this.editable && !this._isBlockEl(block)) {
            block = block.parentElement;
        }

        if (!block || block === this.editable) return;

        // In an empty list item → exit list
        if (block.tagName === 'LI' && !block.textContent.trim()) {
            e.preventDefault();
            const list = block.parentElement;
            const p = createEl('p');
            p.appendChild(createEl('br'));
            list.after(p);
            block.remove();
            if (!list.children.length) list.remove();

            // Move cursor to new p
            const r = document.createRange();
            r.setStart(p, 0);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
            return;
        }

        // In a heading → exit to paragraph
        if (['H1', 'H2', 'H3'].includes(block.tagName)) {
            // Check if cursor is at end
            const r = range.cloneRange();
            r.selectNodeContents(block);
            r.setStart(range.endContainer, range.endOffset);
            if (!r.toString().trim()) {
                e.preventDefault();
                const p = createEl('p');
                p.appendChild(createEl('br'));
                block.after(p);
                const newRange = document.createRange();
                newRange.setStart(p, 0);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
            }
        }
    }

    // ── Backspace handling ─────────────────────────────────
    _handleBackspace(e) {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        if (!range.collapsed) return;

        let block = range.startContainer;
        if (block.nodeType === Node.TEXT_NODE) {
            // Only trigger if cursor is at position 0
            if (range.startOffset !== 0) return;
            block = block.parentElement;
        }

        while (block && block !== this.editable && !this._isBlockEl(block)) {
            block = block.parentElement;
        }

        if (!block || block === this.editable) return;

        // If heading with cursor at start → convert to p
        if (['H1', 'H2', 'H3'].includes(block.tagName)) {
            e.preventDefault();
            document.execCommand('formatBlock', false, 'p');
        }
    }

    // ── Paste handling ────────────────────────────────────
    _handlePaste(e) {
        // 1. Check internal clipboard first (from right-click copy)
        if (_internalClipboard && (Date.now() - _internalClipboard.timestamp < 300000)) {
            const items = e.clipboardData?.items;
            // If system clipboard has no image, use internal
            let hasSystemImage = false;
            if (items) {
                for (const item of items) {
                    if (item.type.startsWith('image/')) {
                        hasSystemImage = true;
                        break;
                    }
                }
            }
            if (!hasSystemImage) {
                e.preventDefault();
                this.insertImage(_internalClipboard.blob);
                _internalClipboard = null;
                const { showToast } = { showToast: (msg) => {} };
                import('/static/tools/utils.js').then(m => m.showToast('图片已粘贴', 'success', 1000));
                return;
            }
        }

        const items = e.clipboardData?.items;
        if (!items) return;

        // 2. Check system clipboard for images
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const blob = item.getAsFile();
                if (blob) {
                    this.insertImage(blob);
                    if (this.opts.onImagePaste) {
                        this.opts.onImagePaste(blob);
                    }
                }
                return;
            }
        }

        // 3. For text paste, clean to plain text
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    }

    // ── Public API ────────────────────────────────────────

    /**
     * Insert an image into the editor at cursor position
     * @param {Blob} blob
     */
    insertImage(blob) {
        const id = 'img_' + uid();
        this.imageStore.set(id, blob);
        const url = URL.createObjectURL(blob);

        this.editable.focus();
        const img = createEl('img', {
            src: url,
            dataset: { imgId: id },
            draggable: 'false',
        });

        // Insert at cursor
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(img);

            // Move cursor after image
            const r = document.createRange();
            r.setStartAfter(img);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
        } else {
            this.editable.appendChild(img);
        }

        // Add paragraph after image for continued typing
        if (!img.nextSibling || img.nextSibling.nodeName === 'IMG') {
            const p = createEl('p');
            p.appendChild(createEl('br'));
            img.after(p);
        }
    }

    /**
     * Get content as markdown text + image blobs
     * @returns {{ text: string, images: Blob[] }}
     */
    getContent() {
        const images = [];
        let imgIndex = 0;

        const walk = (node) => {
            let result = '';

            if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) return '';

            const tag = node.tagName;

            if (tag === 'IMG') {
                const imgId = node.dataset.imgId;
                const blob = imgId ? this.imageStore.get(imgId) : null;
                if (blob) {
                    images.push(blob);
                    result += `![img_${imgIndex}](embedded)`;
                    imgIndex++;
                }
                return result;
            }

            // Recurse children
            let inner = '';
            for (const child of node.childNodes) {
                inner += walk(child);
            }

            switch (tag) {
                case 'H1': return `# ${inner}\n`;
                case 'H2': return `## ${inner}\n`;
                case 'H3': return `### ${inner}\n`;
                case 'STRONG': case 'B': return `**${inner}**`;
                case 'EM': case 'I': return `*${inner}*`;
                case 'UL': return inner;
                case 'OL': return inner;
                case 'LI': {
                    const parent = node.parentElement;
                    if (parent?.tagName === 'OL') {
                        const idx = Array.from(parent.children).indexOf(node) + 1;
                        return `${idx}. ${inner}\n`;
                    }
                    return `- ${inner}\n`;
                }
                case 'P': case 'DIV': return inner + '\n';
                case 'BR': return '\n';
                default: return inner;
            }
        };

        let text = '';
        for (const child of this.editable.childNodes) {
            text += walk(child);
        }

        // Clean up excess newlines
        text = text.replace(/\n{3,}/g, '\n\n').trim();

        return { text, images };
    }

    /**
     * Set editor content
     * @param {string} text — markdown text
     * @param {Blob[]} images
     */
    setContent(text, images = []) {
        this.clear();
        // Simple: just set as text for now
        // A full markdown→HTML parser is beyond scope; set as plain text with images
        const lines = text.split('\n');
        let imgIdx = 0;

        for (const line of lines) {
            const imgMatch = line.match(/!\[img_(\d+)\]\(embedded\)/);
            if (imgMatch && images[imgIdx]) {
                this.insertImage(images[imgIdx]);
                imgIdx++;
                continue;
            }

            // Headings
            if (line.startsWith('### ')) {
                this.editable.appendChild(createEl('h3', {}, [line.slice(4)]));
            } else if (line.startsWith('## ')) {
                this.editable.appendChild(createEl('h2', {}, [line.slice(3)]));
            } else if (line.startsWith('# ')) {
                this.editable.appendChild(createEl('h1', {}, [line.slice(2)]));
            } else if (line.startsWith('- ')) {
                // Simple list item
                let ul = this.editable.lastElementChild;
                if (!ul || ul.tagName !== 'UL') {
                    ul = createEl('ul');
                    this.editable.appendChild(ul);
                }
                ul.appendChild(createEl('li', {}, [line.slice(2)]));
            } else if (line.match(/^\d+\.\s/)) {
                let ol = this.editable.lastElementChild;
                if (!ol || ol.tagName !== 'OL') {
                    ol = createEl('ol');
                    this.editable.appendChild(ol);
                }
                ol.appendChild(createEl('li', {}, [line.replace(/^\d+\.\s/, '')]));
            } else if (line.trim()) {
                const p = createEl('p', {}, [line]);
                this.editable.appendChild(p);
            }
        }
    }

    /**
     * Clear all content
     */
    clear() {
        // Revoke object URLs
        for (const img of this.editable.querySelectorAll('img')) {
            if (img.src.startsWith('blob:')) {
                URL.revokeObjectURL(img.src);
            }
        }
        this.imageStore.clear();
        this.editable.innerHTML = '';
    }

    /**
     * Focus the editor
     */
    focus() {
        this.editable.focus();
    }

    /**
     * Clean up resources
     */
    destroy() {
        this._destroyed = true;
        this.editable.removeEventListener('input', this._onInput);
        this.editable.removeEventListener('keydown', this._onKeydown);
        this.editable.removeEventListener('paste', this._onPaste);
        this.clear();
    }
}
