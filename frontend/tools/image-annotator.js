/**
 * ImageAnnotator — Canvas 图片标注工具 (模态)
 *
 * 用法:
 *   const annotator = new ImageAnnotator();
 *   annotator.open(imageBlob, (resultBlob) => {
 *       // resultBlob: 标注后的图片 Blob, 或 null (取消)
 *   });
 */

import { createEl, uid } from '/static/tools/utils.js';

function pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx, projY = y1 + t * dy;
    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

const COLORS = [
    { name: '红', value: '#e94560' },
    { name: '蓝', value: '#3b82f6' },
    { name: '绿', value: '#4ade80' },
    { name: '黄', value: '#fbbf24' },
    { name: '白', value: '#ffffff' },
    { name: '黑', value: '#1a1a2e' },
];

const TEXT_SIZES = [14, 18, 22, 28, 36];
const RECT_WIDTHS = [2, 3, 4, 5];

export class ImageAnnotator {
    constructor() {
        /** @type {Array<{type: string, id: string, [key: string]: any}>} */
        this.annotations = [];
        this.currentTool = 'select';
        this.currentColor = COLORS[0].value;
        this.currentTextSize = 22;
        this.currentRectWidth = 3;
        this.selectedAnnotation = null;
        this.callback = null;

        // Image data
        this.originalImage = null;
        this.displayScale = 1;

        // Drag state
        this._dragging = false;
        this._dragStart = null;
        this._dragAnnotation = null;
        this._drawingRect = null;
        this._drawingArrow = null;

        // DOM references
        this.overlay = null;
        this.canvas = null;
        this.ctx = null;
    }

    /**
     * Open the annotator modal
     * @param {Blob} imageBlob
     * @param {(resultBlob: Blob|null) => void} callback
     */
    open(imageBlob, callback) {
        this.callback = callback;
        this.annotations = [];
        this.selectedAnnotation = null;
        this.currentTool = 'select';

        this._loadImage(imageBlob).then(() => {
            this._buildUI();
            this._bindCanvasEvents();
            this._render();
        });
    }

    /**
     * Load image from blob
     */
    _loadImage(blob) {
        return new Promise((resolve) => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                this.originalImage = img;
                this._imageUrl = url;

                // Calculate display size (fit in viewport)
                const maxW = window.innerWidth - 100;
                const maxH = window.innerHeight - 200;
                this.displayScale = Math.min(1, maxW / img.width, maxH / img.height);
                this.displayW = Math.round(img.width * this.displayScale);
                this.displayH = Math.round(img.height * this.displayScale);

                resolve();
            };
            img.src = url;
        });
    }

    // ── Build UI ──────────────────────────────────────────
    _buildUI() {
        this.overlay = createEl('div', { class: 'annotator-overlay' });

        // Toolbar
        const toolbar = this._buildToolbar();
        this.overlay.appendChild(toolbar);

        // Canvas wrapper
        const canvasWrap = createEl('div', { class: 'annotator-canvas-wrap' });
        const dpr = window.devicePixelRatio || 1;
        this.canvas = createEl('canvas', {
            width: Math.round(this.displayW * dpr),
            height: Math.round(this.displayH * dpr),
        });
        this.canvas.style.width = this.displayW + 'px';
        this.canvas.style.height = this.displayH + 'px';
        this.ctx = this.canvas.getContext('2d');
        this.ctx.scale(dpr, dpr);
        this.dpr = dpr;
        canvasWrap.appendChild(this.canvas);
        this.canvasWrap = canvasWrap;
        this.overlay.appendChild(canvasWrap);

        document.body.appendChild(this.overlay);

        // Prevent body scroll
        document.body.style.overflow = 'hidden';

        // Keyboard shortcuts: Enter = confirm, Escape = cancel
        this._onKeyDown = (e) => {
            if (e.key === 'Enter' && !this._textPanel) {
                e.preventDefault();
                this._confirm();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                if (this._textPanel) {
                    this._removeTextPanel();
                } else {
                    this._cancel();
                }
            } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedAnnotation) {
                this.annotations = this.annotations.filter(a => a !== this.selectedAnnotation);
                this.selectedAnnotation = null;
                this._render();
            }
        };
        document.addEventListener('keydown', this._onKeyDown);
    }

    _buildToolbar() {
        const toolbar = createEl('div', { class: 'annotator-toolbar' });

        // Tools
        const tools = [
            { id: 'select', label: '↖ 选择' },
            { id: 'text', label: '✎ 文字' },
            { id: 'rect', label: '□ 矩形框' },
            { id: 'arrow', label: '→ 箭头' },
        ];

        for (const t of tools) {
            const btn = createEl('button', {
                class: `annotator-tool-btn ${this.currentTool === t.id ? 'active' : ''}`,
                textContent: t.label,
                dataset: { tool: t.id },
                events: {
                    click: () => this._setTool(t.id),
                },
            });
            toolbar.appendChild(btn);
        }

        toolbar.appendChild(createEl('div', { class: 'annotator-sep' }));

        // Colors
        for (const c of COLORS) {
            const btn = createEl('button', {
                class: `annotator-color-btn ${this.currentColor === c.value ? 'active' : ''}`,
                dataset: { color: c.value },
                title: c.name,
                events: {
                    click: () => this._setColor(c.value),
                },
            });
            btn.style.background = c.value;
            toolbar.appendChild(btn);
        }

        toolbar.appendChild(createEl('div', { class: 'annotator-sep' }));

        // Size selector
        this.sizeSelect = createEl('select', {
            class: 'annotator-size-select',
            events: {
                change: (e) => {
                    const val = parseInt(e.target.value);
                    if (this.currentTool === 'text') {
                        this.currentTextSize = val;
                    } else {
                        this.currentRectWidth = val;
                    }
                },
            },
        });
        this._updateSizeOptions();
        toolbar.appendChild(this.sizeSelect);

        toolbar.appendChild(createEl('div', { class: 'annotator-sep' }));

        // Confirm / Cancel
        toolbar.appendChild(createEl('button', {
            class: 'annotator-tool-btn',
            textContent: '✅ 确认',
            style: { color: '#4ade80' },
            events: { click: () => this._confirm() },
        }));

        toolbar.appendChild(createEl('button', {
            class: 'annotator-tool-btn',
            textContent: '❌ 取消',
            style: { color: '#e94560' },
            events: { click: () => this._cancel() },
        }));

        this.toolbarEl = toolbar;
        return toolbar;
    }

    _updateSizeOptions() {
        this.sizeSelect.innerHTML = '';
        const sizes = this.currentTool === 'text' ? TEXT_SIZES : RECT_WIDTHS;
        const current = this.currentTool === 'text' ? this.currentTextSize : this.currentRectWidth;
        const label = this.currentTool === 'text' ? '字号' : '线宽';

        for (const s of sizes) {
            const opt = createEl('option', {
                value: s,
                textContent: `${label} ${s}`,
            });
            if (s === current) opt.selected = true;
            this.sizeSelect.appendChild(opt);
        }
    }

    _setTool(toolId) {
        this.currentTool = toolId;
        this._removeTextPanel();

        // Update active states
        for (const btn of this.toolbarEl.querySelectorAll('.annotator-tool-btn[data-tool]')) {
            btn.classList.toggle('active', btn.dataset.tool === toolId);
        }

        // Update cursor
        this.canvas.style.cursor = toolId === 'select' ? 'default' : 'crosshair';

        this._updateSizeOptions();
    }

    _setColor(color) {
        this.currentColor = color;
        for (const btn of this.toolbarEl.querySelectorAll('.annotator-color-btn')) {
            btn.classList.toggle('active', btn.dataset.color === color);
        }
    }

    // ── Canvas Events ─────────────────────────────────────
    _bindCanvasEvents() {
        this._onMouseDown = (e) => this._handleMouseDown(e);
        this._onMouseMove = (e) => this._handleMouseMove(e);
        this._onMouseUp = (e) => this._handleMouseUp(e);

        this.canvas.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mousemove', this._onMouseMove);
        window.addEventListener('mouseup', this._onMouseUp);
    }

    _getCanvasPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    }

    _handleMouseDown(e) {
        const pos = this._getCanvasPos(e);

        if (this.currentTool === 'select') {
            // Check if clicking on an annotation
            const hit = this._hitTest(pos);
            this.selectedAnnotation = hit;
            if (hit) {
                this._dragging = true;
                this._dragAnnotation = hit;
                this._dragStart = { x: pos.x, y: pos.y, ox: 0, oy: 0 };
                if (hit.type === 'text') {
                    this._dragStart.ox = hit.x;
                    this._dragStart.oy = hit.y;
                } else if (hit.type === 'rect') {
                    this._dragStart.ox = hit.x1;
                    this._dragStart.oy = hit.y1;
                    this._dragStart.ox2 = hit.x2;
                    this._dragStart.oy2 = hit.y2;
                } else if (hit.type === 'arrow') {
                    this._dragStart.ox = hit.x1;
                    this._dragStart.oy = hit.y1;
                    this._dragStart.ox2 = hit.x2;
                    this._dragStart.oy2 = hit.y2;
                }
            }
            this._render();
        } else if (this.currentTool === 'text') {
            this._showTextPanel(pos);
        } else if (this.currentTool === 'rect') {
            this._drawingRect = {
                x1: pos.x, y1: pos.y,
                x2: pos.x, y2: pos.y,
            };
            this._dragging = true;
        } else if (this.currentTool === 'arrow') {
            this._drawingArrow = {
                x1: pos.x, y1: pos.y,
                x2: pos.x, y2: pos.y,
            };
            this._dragging = true;
        }
    }

    _handleMouseMove(e) {
        if (!this._dragging) return;
        const pos = this._getCanvasPos(e);

        if (this.currentTool === 'select' && this._dragAnnotation) {
            const dx = pos.x - this._dragStart.x;
            const dy = pos.y - this._dragStart.y;

            if (this._dragAnnotation.type === 'text') {
                this._dragAnnotation.x = this._dragStart.ox + dx;
                this._dragAnnotation.y = this._dragStart.oy + dy;
            } else if (this._dragAnnotation.type === 'rect') {
                this._dragAnnotation.x1 = this._dragStart.ox + dx;
                this._dragAnnotation.y1 = this._dragStart.oy + dy;
                this._dragAnnotation.x2 = this._dragStart.ox2 + dx;
                this._dragAnnotation.y2 = this._dragStart.oy2 + dy;
            } else if (this._dragAnnotation.type === 'arrow') {
                const dx = pos.x - this._dragStart.x;
                const dy = pos.y - this._dragStart.y;
                this._dragAnnotation.x1 = this._dragStart.ox + dx;
                this._dragAnnotation.y1 = this._dragStart.oy + dy;
                this._dragAnnotation.x2 = this._dragStart.ox2 + dx;
                this._dragAnnotation.y2 = this._dragStart.oy2 + dy;
            }
            this._render();
        } else if (this.currentTool === 'rect' && this._drawingRect) {
            this._drawingRect.x2 = pos.x;
            this._drawingRect.y2 = pos.y;
            this._render();
            // Draw preview rect
            this.ctx.strokeStyle = this.currentColor;
            this.ctx.lineWidth = this.currentRectWidth;
            const r = this._drawingRect;
            this.ctx.strokeRect(
                Math.min(r.x1, r.x2), Math.min(r.y1, r.y2),
                Math.abs(r.x2 - r.x1), Math.abs(r.y2 - r.y1),
            );
        } else if (this.currentTool === 'arrow' && this._drawingArrow) {
            this._drawingArrow.x2 = pos.x;
            this._drawingArrow.y2 = pos.y;
            this._render();
            // Draw preview arrow
            this._drawArrow(this.ctx, this._drawingArrow.x1, this._drawingArrow.y1,
                this._drawingArrow.x2, this._drawingArrow.y2,
                this.currentColor, this.currentRectWidth);
        }
    }

    _handleMouseUp(e) {
        if (this.currentTool === 'rect' && this._drawingRect) {
            const r = this._drawingRect;
            const w = Math.abs(r.x2 - r.x1);
            const h = Math.abs(r.y2 - r.y1);
            if (w > 5 && h > 5) {
                this.annotations.push({
                    type: 'rect',
                    id: uid(),
                    x1: Math.min(r.x1, r.x2),
                    y1: Math.min(r.y1, r.y2),
                    x2: Math.max(r.x1, r.x2),
                    y2: Math.max(r.y1, r.y2),
                    color: this.currentColor,
                    width: this.currentRectWidth,
                });
            }
            this._drawingRect = null;
            this._render();
        }

        if (this.currentTool === 'arrow' && this._drawingArrow) {
            const a = this._drawingArrow;
            const dist = Math.sqrt((a.x2 - a.x1) ** 2 + (a.y2 - a.y1) ** 2);
            if (dist > 10) {
                this.annotations.push({
                    type: 'arrow',
                    id: uid(),
                    x1: a.x1, y1: a.y1,
                    x2: a.x2, y2: a.y2,
                    color: this.currentColor,
                    width: this.currentRectWidth,
                });
            }
            this._drawingArrow = null;
            this._render();
        }

        this._dragging = false;
        this._dragAnnotation = null;
        this._dragStart = null;
    }

    // ── Hit test ──────────────────────────────────────────
    _hitTest(pos) {
        // Reverse order → topmost first
        for (let i = this.annotations.length - 1; i >= 0; i--) {
            const a = this.annotations[i];
            if (a.type === 'text') {
                // Approximate text bounding box
                this.ctx.font = `${a.size}px Inter, sans-serif`;
                const metrics = this.ctx.measureText(a.text);
                const tw = metrics.width;
                const th = a.size;
                if (pos.x >= a.x && pos.x <= a.x + tw &&
                    pos.y >= a.y - th && pos.y <= a.y) {
                    return a;
                }
            } else if (a.type === 'rect') {
                const margin = 8;
                if (pos.x >= a.x1 - margin && pos.x <= a.x2 + margin &&
                    pos.y >= a.y1 - margin && pos.y <= a.y2 + margin) {
                    return a;
                }
            } else if (a.type === 'arrow') {
                // Check distance from point to line segment
                const dist = pointToSegmentDist(pos.x, pos.y, a.x1, a.y1, a.x2, a.y2);
                if (dist < 10) return a;
            }
        }
        return null;
    }

    // ── Text panel ────────────────────────────────────────
    _showTextPanel(pos) {
        this._removeTextPanel();

        const panel = createEl('div', { class: 'annotator-text-panel' });

        // Position near click point
        const canvasRect = this.canvas.getBoundingClientRect();
        panel.style.left = (canvasRect.left + pos.x + 10) + 'px';
        panel.style.top = (canvasRect.top + pos.y - 10) + 'px';
        panel.style.position = 'fixed';

        const input = createEl('input', {
            type: 'text',
            placeholder: '输入标注文字...',
        });
        panel.appendChild(input);

        // Color options
        const colorRow = createEl('div', { class: 'annotator-text-options' });
        for (const c of COLORS) {
            const btn = createEl('button', {
                class: `annotator-color-btn ${this.currentColor === c.value ? 'active' : ''}`,
                dataset: { color: c.value },
                events: {
                    click: () => {
                        this.currentColor = c.value;
                        for (const b of colorRow.querySelectorAll('.annotator-color-btn')) {
                            b.classList.toggle('active', b.dataset.color === c.value);
                        }
                    },
                },
            });
            btn.style.background = c.value;
            btn.style.width = '20px';
            btn.style.height = '20px';
            colorRow.appendChild(btn);
        }
        panel.appendChild(colorRow);

        // Size
        const sizeRow = createEl('div', { class: 'annotator-text-options' });
        const sizeSelect = createEl('select', { class: 'annotator-size-select' });
        for (const s of TEXT_SIZES) {
            const opt = createEl('option', { value: s, textContent: `字号 ${s}` });
            if (s === this.currentTextSize) opt.selected = true;
            sizeSelect.appendChild(opt);
        }
        sizeSelect.addEventListener('change', (e) => {
            this.currentTextSize = parseInt(e.target.value);
        });
        sizeRow.appendChild(sizeSelect);
        panel.appendChild(sizeRow);

        // Actions
        const actions = createEl('div', { class: 'annotator-text-actions' });
        actions.appendChild(createEl('button', {
            class: 'btn btn-sm btn-primary',
            textContent: '添加',
            events: {
                click: () => {
                    const text = input.value.trim();
                    if (text) {
                        this.annotations.push({
                            type: 'text',
                            id: uid(),
                            x: pos.x,
                            y: pos.y,
                            text,
                            color: this.currentColor,
                            size: this.currentTextSize,
                        });
                        this._render();
                    }
                    this._removeTextPanel();
                },
            },
        }));
        actions.appendChild(createEl('button', {
            class: 'btn btn-sm btn-ghost',
            textContent: '取消',
            events: {
                click: () => this._removeTextPanel(),
            },
        }));
        panel.appendChild(actions);

        document.body.appendChild(panel);
        this._textPanel = panel;
        input.focus();

        // Enter to confirm
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const text = input.value.trim();
                if (text) {
                    this.annotations.push({
                        type: 'text',
                        id: uid(),
                        x: pos.x,
                        y: pos.y,
                        text,
                        color: this.currentColor,
                        size: this.currentTextSize,
                    });
                    this._render();
                }
                this._removeTextPanel();
            } else if (e.key === 'Escape') {
                this._removeTextPanel();
            }
        });
    }

    _removeTextPanel() {
        if (this._textPanel) {
            this._textPanel.remove();
            this._textPanel = null;
        }
    }

    // ── Render ────────────────────────────────────────────
    _render() {
        const { ctx, canvas } = this;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw image
        if (this.originalImage) {
            ctx.drawImage(this.originalImage, 0, 0, this.displayW, this.displayH);
        }

        // Draw annotations
        for (const a of this.annotations) {
            if (a.type === 'rect') {
                ctx.strokeStyle = a.color;
                ctx.lineWidth = a.width;
                ctx.strokeRect(a.x1, a.y1, a.x2 - a.x1, a.y2 - a.y1);

                // Selected indicator
                if (this.selectedAnnotation === a) {
                    ctx.setLineDash([5, 3]);
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(a.x1 - 3, a.y1 - 3, (a.x2 - a.x1) + 6, (a.y2 - a.y1) + 6);
                    ctx.setLineDash([]);
                }
            } else if (a.type === 'arrow') {
                this._drawArrow(ctx, a.x1, a.y1, a.x2, a.y2, a.color, a.width);
                // Selected indicator
                if (this.selectedAnnotation === a) {
                    ctx.setLineDash([3, 3]);
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(a.x1, a.y1, 5, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(a.x2, a.y2, 5, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            } else if (a.type === 'text') {
                ctx.font = `bold ${a.size}px Inter, -apple-system, PingFang SC, sans-serif`;
                ctx.fillStyle = a.color;
                ctx.textBaseline = 'alphabetic';

                // Text shadow for readability
                ctx.shadowColor = 'rgba(0,0,0,0.6)';
                ctx.shadowBlur = 4;
                ctx.shadowOffsetX = 1;
                ctx.shadowOffsetY = 1;
                ctx.fillText(a.text, a.x, a.y);
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;

                // Selected indicator
                if (this.selectedAnnotation === a) {
                    const metrics = ctx.measureText(a.text);
                    ctx.setLineDash([3, 3]);
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(a.x - 2, a.y - a.size, metrics.width + 4, a.size + 4);
                    ctx.setLineDash([]);
                }
            }
        }
    }

    // ── Confirm / Cancel ──────────────────────────────────
    _confirm() {
        // Create offscreen canvas at original resolution
        const offCanvas = document.createElement('canvas');
        offCanvas.width = this.originalImage.width;
        offCanvas.height = this.originalImage.height;
        const ctx = offCanvas.getContext('2d');

        // Draw original image
        ctx.drawImage(this.originalImage, 0, 0);

        // Scale factor from display to original
        const scale = 1 / this.displayScale;

        // Draw annotations at original resolution
        for (const a of this.annotations) {
            if (a.type === 'rect') {
                ctx.strokeStyle = a.color;
                ctx.lineWidth = a.width * scale;
                ctx.strokeRect(
                    a.x1 * scale, a.y1 * scale,
                    (a.x2 - a.x1) * scale, (a.y2 - a.y1) * scale,
                );
            } else if (a.type === 'arrow') {
                this._drawArrow(ctx, a.x1 * scale, a.y1 * scale,
                    a.x2 * scale, a.y2 * scale, a.color, a.width * scale);
            } else if (a.type === 'text') {
                const fontSize = Math.round(a.size * scale);
                ctx.font = `bold ${fontSize}px Inter, -apple-system, PingFang SC, sans-serif`;
                ctx.fillStyle = a.color;
                ctx.textBaseline = 'alphabetic';
                ctx.shadowColor = 'rgba(0,0,0,0.6)';
                ctx.shadowBlur = 4 * scale;
                ctx.shadowOffsetX = scale;
                ctx.shadowOffsetY = scale;
                ctx.fillText(a.text, a.x * scale, a.y * scale);
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
            }
        }

        offCanvas.toBlob((blob) => {
            this._close();
            if (this.callback) this.callback(blob);
        }, 'image/png');
    }

    _cancel() {
        this._close();
        if (this.callback) this.callback(null);
    }

    _close() {
        this._removeTextPanel();

        if (this._imageUrl) {
            URL.revokeObjectURL(this._imageUrl);
            this._imageUrl = null;
        }

        // Remove event listeners
        if (this.canvas) {
            this.canvas.removeEventListener('mousedown', this._onMouseDown);
        }
        window.removeEventListener('mousemove', this._onMouseMove);
        window.removeEventListener('mouseup', this._onMouseUp);

        // Remove overlay
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }

        document.body.style.overflow = '';
        document.removeEventListener('keydown', this._onKeyDown);
        this.annotations = [];
        this.selectedAnnotation = null;
        this.originalImage = null;
    }

    _drawArrow(ctx, x1, y1, x2, y2, color, width) {
        const headLen = Math.max(15, width * 5);
        const angle = Math.atan2(y2 - y1, x2 - x1);

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';

        // Line
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    }
}
