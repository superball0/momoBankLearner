/**
 * 工具函数模块
 * 提供 API 调用、DOM 操作、Blob 转换等通用能力
 */

const API_BASE = '';

/**
 * 统一 API 请求包装器
 * @param {'GET'|'POST'|'PUT'|'DELETE'} method
 * @param {string} path  — 以 / 开头的 API 路径
 * @param {object|FormData|null} body
 * @returns {Promise<any>}
 */
export async function api(method, path, body = null) {
    const opts = {
        method,
        headers: {},
    };

    if (body !== null) {
        if (body instanceof FormData) {
            opts.body = body;
            // 不设 Content-Type, 让浏览器自动加 boundary
        } else {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
    }

    const resp = await fetch(`${API_BASE}${path}`, opts);
    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`API ${method} ${path} → ${resp.status}: ${text}`);
    }

    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
        return resp.json();
    }
    return resp.text();
}

/**
 * 快捷创建 DOM 元素
 * @param {string} tag
 * @param {object} attrs — class, id, textContent, innerHTML, style, events, ...
 * @param {(Element|string)[]} children
 * @returns {HTMLElement}
 */
export function createEl(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);

    for (const [key, val] of Object.entries(attrs)) {
        if (key === 'class' || key === 'className') {
            if (Array.isArray(val)) {
                el.classList.add(...val.filter(Boolean));
            } else if (val) {
                el.className = val;
            }
        } else if (key === 'style' && typeof val === 'object') {
            Object.assign(el.style, val);
        } else if (key === 'events') {
            for (const [evt, handler] of Object.entries(val)) {
                el.addEventListener(evt, handler);
            }
        } else if (key === 'dataset') {
            Object.assign(el.dataset, val);
        } else if (key === 'textContent') {
            el.textContent = val;
        } else if (key === 'innerHTML') {
            el.innerHTML = val;
        } else {
            el.setAttribute(key, val);
        }
    }

    for (const child of children) {
        if (typeof child === 'string') {
            el.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            el.appendChild(child);
        }
    }

    return el;
}

/**
 * Blob → base64 data URL
 */
export function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * base64 data URL → Blob
 */
export function base64ToBlob(base64) {
    // 支持带 data:...;base64, 前缀和纯 base64
    let data = base64;
    let mime = 'image/png';

    if (base64.startsWith('data:')) {
        const parts = base64.split(',');
        mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
        data = parts[1];
    }

    const byteString = atob(data);
    const arr = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
        arr[i] = byteString.charCodeAt(i);
    }
    return new Blob([arr], { type: mime });
}

/**
 * 显示一个 toast 通知
 */
export function showToast(message, type = 'success', duration = 2500) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = createEl('div', { class: `toast ${type}`, textContent: message });
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * 生成唯一 ID
 */
export function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
