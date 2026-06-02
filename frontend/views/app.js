import { renderHome } from './home.js';
import { renderModeSelect } from './mode-select.js';
import { renderEntry } from './entry.js';
import { renderTreeSelector } from './tree-selector.js';
import { renderPractice } from './practice.js';
import { api, base64ToBlob, showToast } from '/static/tools/utils.js';
import { ImageAnnotator } from '/static/tools/image-annotator.js';

class App {
    constructor() {
        this.container = document.getElementById('app');
        this.state = {
            currentView: 'home',
            bankPath: null,
            bankName: null,
            questionCount: 0,
            pendingQuestion: null,
            pendingScreenshot: null,  // Blob from global screenshot
        };
        this._injectTransitionStyles();
        this._bindGlobalShortcut();
        this.navigate('home');
    }

    navigate(view, data = {}) {
        // Merge data into state
        Object.assign(this.state, data);
        this.state.currentView = view;

        // Fade out then render new view
        this.container.classList.add('view-exit');
        setTimeout(() => {
            this.container.innerHTML = '';
            switch(view) {
                case 'home': renderHome(this); break;
                case 'mode-select': renderModeSelect(this); break;
                case 'entry': renderEntry(this); break;
                case 'tree-selector': renderTreeSelector(this); break;
                case 'practice': renderPractice(this); break;
            }
            this.container.classList.remove('view-exit');
            this.container.classList.add('view-enter');
            setTimeout(() => this.container.classList.remove('view-enter'), 300);
        }, 150);
    }



    /** Global screenshot shortcut: Ctrl+Shift+A — works on ALL pages */
    _bindGlobalShortcut() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
                e.preventDefault();
                this._globalScreenshot();
            }
        });
    }

    async _globalScreenshot() {
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
                        // If already on entry page, insert directly
                        if (this.state.currentView === 'entry' && window.__entryInsertImage) {
                            window.__entryInsertImage(annotatedBlob);
                            showToast('图片已插入', 'success', 1500);
                        } else {
                            // Store and navigate to entry (entry.js will pick it up)
                            this.state.pendingScreenshot = annotatedBlob;
                            if (this.state.bankPath) {
                                this.navigate('entry');
                                showToast('截图已保存，已跳转到录入页', 'success', 2000);
                            } else {
                                showToast('截图已保存，请先打开题库', 'success', 2000);
                            }
                        }
                    }
                });
            }
        } catch (err) {
            showToast('截图失败: ' + err.message, 'error');
        }
    }

    /** Inject CSS transition classes for view switching */
    _injectTransitionStyles() {
        if (document.getElementById('app-transition-styles')) return;
        const style = document.createElement('style');
        style.id = 'app-transition-styles';
        style.textContent = `
            .view-exit {
                opacity: 0;
                transform: translateY(8px);
                transition: opacity 0.15s ease-out, transform 0.15s ease-out;
            }
            .view-enter {
                animation: viewFadeIn 0.3s ease-out forwards;
            }
            @keyframes viewFadeIn {
                from {
                    opacity: 0;
                    transform: translateY(8px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// Initialize app
window.__app = new App();

