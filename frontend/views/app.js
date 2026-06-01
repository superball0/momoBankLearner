import { renderHome } from './home.js';
import { renderModeSelect } from './mode-select.js';
import { renderEntry } from './entry.js';
import { renderTreeSelector } from './tree-selector.js';

class App {
    constructor() {
        this.container = document.getElementById('app');
        this.state = {
            currentView: 'home',
            bankPath: null,
            bankName: null,
            questionCount: 0,
            pendingQuestion: null,  // data collected from entry mode
        };
        this._injectTransitionStyles();
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
                case 'practice': this._renderPractice(); break;
            }
            this.container.classList.remove('view-exit');
            this.container.classList.add('view-enter');
            setTimeout(() => this.container.classList.remove('view-enter'), 300);
        }, 150);
    }

    _renderPractice() {
        this.container.innerHTML = `
            <div class="page-center">
                <h1>🧠 刷题模式</h1>
                <p class="text-muted">刷题功能将在后续版本中实现</p>
                <p class="text-muted">计划支持：按分支/Tag筛选 · 限时刷题 · 错题本 · 随机模式</p>
                <button class="btn btn-secondary" onclick="window.__app.navigate('mode-select')">← 返回</button>
            </div>
        `;
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
