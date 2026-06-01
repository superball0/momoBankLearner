/**
 * Mode Selection View
 * Shown after opening a question bank. Lets user choose between
 * entry mode (add questions) and practice mode (study).
 */

/**
 * @param {object} app
 * @param {HTMLElement} app.container
 * @param {object} app.state - { bankPath, bankName, questionCount }
 * @param {function} app.navigate
 */
export function renderModeSelect(app) {
  const { container, state } = app;
  const { bankName, questionCount } = state;

  // Root wrapper
  const page = document.createElement('div');
  page.className = 'page-center';

  // Header: bank name
  const title = document.createElement('h1');
  title.className = 'title';
  title.textContent = `📁 ${bankName}`;
  page.appendChild(title);

  // Question count
  const subtitle = document.createElement('p');
  subtitle.className = 'subtitle text-muted';
  subtitle.textContent = `题目总数: ${questionCount} 道`;
  page.appendChild(subtitle);

  // Card row
  const cardRow = document.createElement('div');
  cardRow.className = 'card-row';

  // --- Entry mode card ---
  const entryCard = createModeCard({
    icon: '✏️',
    title: '录入模式',
    desc: '添加新题目',
    onClick: () => app.navigate('entry'),
  });
  cardRow.appendChild(entryCard);

  // --- Practice mode card ---
  const practiceCard = createModeCard({
    icon: '🧠',
    title: '刷题模式',
    desc: '开始练习',
    onClick: () => app.navigate('practice'),
  });
  cardRow.appendChild(practiceCard);

  page.appendChild(cardRow);

  // Back button
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-secondary';
  backBtn.textContent = '↩️ 切换题库';
  backBtn.addEventListener('click', () => app.navigate('home'));
  page.appendChild(backBtn);

  container.appendChild(page);
}

/**
 * Create a mode card element.
 * @param {object} opts
 * @param {string} opts.icon - Emoji icon
 * @param {string} opts.title - Card title
 * @param {string} opts.desc - Card description
 * @param {function} opts.onClick - Click handler
 * @returns {HTMLElement}
 */
function createModeCard({ icon, title, desc, onClick }) {
  const card = document.createElement('div');
  card.className = 'mode-card';
  card.tabIndex = 0;
  card.role = 'button';

  const iconEl = document.createElement('div');
  iconEl.className = 'mode-card-icon';
  iconEl.textContent = icon;
  card.appendChild(iconEl);

  const titleEl = document.createElement('div');
  titleEl.className = 'mode-card-title';
  titleEl.textContent = title;
  card.appendChild(titleEl);

  const descEl = document.createElement('div');
  descEl.className = 'mode-card-desc';
  descEl.textContent = desc;
  card.appendChild(descEl);

  card.addEventListener('click', onClick);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  });

  return card;
}
