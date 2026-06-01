import { api } from '/static/tools/utils.js';

/**
 * Render the home page view.
 * @param {object} app - App instance with container, state, navigate()
 */
export function renderHome(app) {
  const container = app.container;
  container.innerHTML = '';

  // --- Page wrapper ---
  const page = document.createElement('div');
  page.className = 'page-center';

  // --- Title ---
  const title = document.createElement('h1');
  title.className = 'title';
  title.textContent = '📚 行测刷题工具';
  page.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'subtitle';
  subtitle.textContent = '高效备考，轻松刷题 — 选择或新建你的题库开始练习';
  page.appendChild(subtitle);

  // --- Button row ---
  const btnRow = document.createElement('div');
  btnRow.className = 'btn-row';

  // -- "打开题库" card --
  const openCard = document.createElement('div');
  openCard.className = 'card';

  const openBtn = document.createElement('button');
  openBtn.className = 'btn btn-primary';
  openBtn.textContent = '📂 打开题库';

  const openForm = document.createElement('div');
  openForm.style.display = 'none';
  openForm.style.marginTop = '12px';

  const openInput = document.createElement('input');
  openInput.className = 'input';
  openInput.type = 'text';
  openInput.placeholder = '输入或粘贴题库文件夹路径…';

  const openConfirm = document.createElement('button');
  openConfirm.className = 'btn btn-primary';
  openConfirm.style.marginTop = '8px';
  openConfirm.textContent = '✅ 确认打开';

  openForm.appendChild(openInput);
  openForm.appendChild(openConfirm);

  openBtn.addEventListener('click', () => {
    const isVisible = openForm.style.display !== 'none';
    openForm.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
      openInput.value = '';
      openInput.focus();
    }
  });

  openConfirm.addEventListener('click', async () => {
    const path = openInput.value.trim();
    if (!path) {
      openInput.focus();
      return;
    }
    try {
      openConfirm.disabled = true;
      openConfirm.textContent = '⏳ 打开中…';
      await api('POST', '/api/bank/open', { path });
      app.navigate('mode-select', { path });
    } catch (err) {
      alert('打开题库失败：' + (err.message || err));
    } finally {
      openConfirm.disabled = false;
      openConfirm.textContent = '✅ 确认打开';
    }
  });

  openCard.appendChild(openBtn);
  openCard.appendChild(openForm);

  // -- "新建题库" card --
  const newCard = document.createElement('div');
  newCard.className = 'card';

  const newBtn = document.createElement('button');
  newBtn.className = 'btn btn-secondary';
  newBtn.textContent = '🆕 新建题库';

  const newForm = document.createElement('div');
  newForm.style.display = 'none';
  newForm.style.marginTop = '12px';

  const newInput = document.createElement('input');
  newInput.className = 'input';
  newInput.type = 'text';
  newInput.placeholder = '输入父文件夹路径…';

  const newHint = document.createElement('p');
  newHint.className = 'subtitle';
  newHint.style.fontSize = '13px';
  newHint.style.margin = '6px 0';
  newHint.textContent = '将在该路径下自动创建 /根 文件夹';

  const newConfirm = document.createElement('button');
  newConfirm.className = 'btn btn-secondary';
  newConfirm.style.marginTop = '4px';
  newConfirm.textContent = '✅ 确认创建';

  newForm.appendChild(newInput);
  newForm.appendChild(newHint);
  newForm.appendChild(newConfirm);

  newBtn.addEventListener('click', () => {
    const isVisible = newForm.style.display !== 'none';
    newForm.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
      newInput.value = '';
      newInput.focus();
    }
  });

  newConfirm.addEventListener('click', async () => {
    const parentPath = newInput.value.trim();
    if (!parentPath) {
      newInput.focus();
      return;
    }
    const fullPath = parentPath.replace(/\/+$/, '') + '/根';
    try {
      newConfirm.disabled = true;
      newConfirm.textContent = '⏳ 创建中…';
      await api('POST', '/api/bank/open', { path: fullPath });
      app.navigate('mode-select', { path: fullPath });
    } catch (err) {
      alert('创建题库失败：' + (err.message || err));
    } finally {
      newConfirm.disabled = false;
      newConfirm.textContent = '✅ 确认创建';
    }
  });

  newCard.appendChild(newBtn);
  newCard.appendChild(newForm);

  btnRow.appendChild(openCard);
  btnRow.appendChild(newCard);
  page.appendChild(btnRow);

  // --- Separator ---
  const separator = document.createElement('hr');
  separator.className = 'separator';
  page.appendChild(separator);

  // --- Recent section ---
  const recentHeader = document.createElement('h3');
  recentHeader.textContent = '最近使用：';
  recentHeader.style.marginBottom = '12px';
  page.appendChild(recentHeader);

  const recentList = document.createElement('ul');
  recentList.className = 'recent-list';

  const loadingItem = document.createElement('li');
  loadingItem.className = 'recent-item';
  loadingItem.textContent = '⏳ 加载中…';
  recentList.appendChild(loadingItem);

  page.appendChild(recentList);
  container.appendChild(page);

  // --- Fetch recent history ---
  loadRecentHistory(recentList, app);
}

/**
 * Load recent bank history from the API and populate the list.
 * @param {HTMLUListElement} listEl
 * @param {object} app
 */
async function loadRecentHistory(listEl, app) {
  try {
    const data = await api('GET', '/api/history');
    listEl.innerHTML = '';

    const items = Array.isArray(data) ? data : (data.history || []);

    if (items.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'recent-item';
      emptyItem.style.cursor = 'default';
      emptyItem.textContent = '暂无最近使用的题库';
      listEl.appendChild(emptyItem);
      return;
    }

    for (const entry of items) {
      const path = typeof entry === 'string' ? entry : entry.path;
      const li = document.createElement('li');
      li.className = 'recent-item';
      li.textContent = '📁 ' + path;
      li.title = path;

      li.addEventListener('click', async () => {
        try {
          li.style.opacity = '0.5';
          li.style.pointerEvents = 'none';
          await api('POST', '/api/bank/open', { path });
          app.navigate('mode-select', { path });
        } catch (err) {
          alert('打开题库失败：' + (err.message || err));
          li.style.opacity = '1';
          li.style.pointerEvents = 'auto';
        }
      });

      listEl.appendChild(li);
    }
  } catch (err) {
    listEl.innerHTML = '';
    const errorItem = document.createElement('li');
    errorItem.className = 'recent-item';
    errorItem.style.cursor = 'default';
    errorItem.textContent = '⚠️ 加载历史记录失败';
    listEl.appendChild(errorItem);
  }
}
