const state = {
  payload: null,
  items: [],
  source: 'all',
  topN: 12,
  query: '',
  category: 'all',
};

const cardsElement = document.querySelector('#cards');
const refreshButton = document.querySelector('#refreshButton');
const heroRefreshButton = document.querySelector('#heroRefreshButton');
const topNSelect = document.querySelector('#topNSelect');
const searchInput = document.querySelector('#searchInput');
const sourceSwitcher = document.querySelector('#sourceSwitcher');
const categoryStrip = document.querySelector('#categoryStrip');
const cardTemplate = document.querySelector('#cardTemplate');
const insightTemplate = document.querySelector('#insightTemplate');
const insightsGrid = document.querySelector('#insightsGrid');
const insightNote = document.querySelector('#insightNote');
const generatedAtElement = document.querySelector('#generatedAt');
const emptyState = document.querySelector('#emptyState');

function formatCompact(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('zh-CN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatTime(value) {
  if (!value) return '未知时间';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadPayload(forceRefresh = false) {
  const targets = forceRefresh
    ? [`/api/leaderboard?source=all&topN=96&maxPerSource=48&ts=${Date.now()}`, './data/leaderboard.json']
    : ['/api/leaderboard?source=all&topN=96&maxPerSource=48', './data/leaderboard.json'];

  for (const url of targets) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) continue;
      const payload = await response.json();
      if (!payload?.items?.length) continue;
      return payload;
    } catch {
      continue;
    }
  }

  throw new Error('加载榜单失败，请稍后再试。');
}

function buildDirections(items) {
  const map = new Map();
  for (const item of items) {
    const current = map.get(item.category) || {
      category: item.category,
      count: 0,
      downloads: 0,
    };
    current.count += 1;
    current.downloads += item.downloads || 0;
    map.set(item.category, current);
  }
  return [...map.values()].sort((a, b) => b.downloads - a.downloads || b.count - a.count);
}

function getVisibleItems() {
  const query = state.query.trim().toLowerCase();
  return state.items
    .filter((item) => (state.source === 'all' ? true : item.sourceKey === state.source))
    .filter((item) => (state.category === 'all' ? true : item.category === state.category))
    .filter((item) => {
      if (!query) return true;
      const haystack = [item.name, item.author, item.category, item.description, item.summary, item.source]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => b.downloads - a.downloads || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, state.topN);
}

function createMetaLink(label, value, href = '', className = '') {
  const element = href ? document.createElement('a') : document.createElement('div');
  element.className = `meta-item ${className}`.trim();
  element.textContent = `${label}：${value}`;
  if (href) {
    element.href = href;
    element.target = '_blank';
    element.rel = 'noreferrer';
  }
  return element;
}

function renderEmpty(message) {
  cardsElement.innerHTML = '';
  emptyState.textContent = message;
  emptyState.classList.remove('hidden');
}

function renderSourceButtons() {
  sourceSwitcher.querySelectorAll('.segment-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.source === state.source);
  });
}

function renderCategoryChips() {
  const sourceItems = state.source === 'all'
    ? state.items
    : state.items.filter((item) => item.sourceKey === state.source);
  const directions = buildDirections(sourceItems);
  categoryStrip.innerHTML = '';

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = `language-chip ${state.category === 'all' ? 'active' : ''}`;
  allChip.textContent = '全部方向';
  allChip.addEventListener('click', () => {
    state.category = 'all';
    renderPage();
  });
  categoryStrip.appendChild(allChip);

  directions.forEach((direction) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `language-chip ${state.category === direction.category ? 'active' : ''}`;
    chip.textContent = `${direction.category} · ${direction.count}`;
    chip.addEventListener('click', () => {
      state.category = direction.category;
      renderPage();
    });
    categoryStrip.appendChild(chip);
  });
}

function renderInsights() {
  const allItems = state.items;
  const sourceItems = state.source === 'all'
    ? allItems
    : allItems.filter((item) => item.sourceKey === state.source);
  const visibleItems = getVisibleItems();
  const directions = buildDirections(sourceItems);
  const sourceCount = new Set(sourceItems.map((item) => item.source)).size;
  const crossCount = sourceItems.filter((item) => item.crossListed).length;
  const topItem = visibleItems[0];

  if (generatedAtElement) {
    generatedAtElement.textContent = `更新于 ${formatTime(state.payload?.generatedAt)}`;
  }

  insightNote.textContent = topItem
    ? `当前展示 ${visibleItems.length} 个技能，热门方向是「${directions[0]?.category || '通用工具'}」，榜首是「${topItem.name}」，下载量约 ${formatCompact(topItem.downloads)}。`
    : '当前没有匹配结果，请切换来源、TopN 或关键词。';

  const cards = [
    {
      title: '规模概览',
      content: `
        <ul class="insight-list">
          <li>当前来源覆盖 <strong>${sourceItems.length}</strong> 个技能</li>
          <li>来源数 <strong>${sourceCount}</strong></li>
          <li>双榜重合 <strong>${crossCount}</strong></li>
        </ul>
      `,
    },
    {
      title: '方向聚类',
      content: `
        <ul class="insight-list">
          ${directions.slice(0, 4).map((item) => `<li>${escapeHtml(item.category)} · <strong>${item.count}</strong></li>`).join('')}
        </ul>
      `,
    },
    {
      title: '当前筛选',
      content: `
        <ul class="insight-list">
          <li>来源：<strong>${state.source === 'all' ? '综合' : state.source}</strong></li>
          <li>TopN：<strong>${state.topN}</strong></li>
          <li>分类：<strong>${escapeHtml(state.category === 'all' ? '全部方向' : state.category)}</strong></li>
        </ul>
      `,
    },
  ];

  insightsGrid.innerHTML = '';
  cards.forEach((item) => {
    const fragment = insightTemplate.content.cloneNode(true);
    fragment.querySelector('.insight-title').textContent = item.title;
    fragment.querySelector('.insight-content').innerHTML = item.content;
    insightsGrid.appendChild(fragment);
  });
}

function renderCards() {
  const items = getVisibleItems();
  cardsElement.innerHTML = '';

  if (!items.length) {
    renderEmpty('没有匹配结果，试试切换来源、TopN 或关键词。');
    return;
  }

  emptyState.classList.add('hidden');
  const maxDownloads = Math.max(...items.map((item) => item.downloads || 0), 1);

  items.forEach((item, index) => {
    const fragment = cardTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.card');
    const previewSourceBadge = fragment.querySelector('.preview-source-badge');
    const previewCategoryBadge = fragment.querySelector('.preview-category-badge');
    const previewProgressFill = fragment.querySelector('.preview-progress-fill');
    const repoLink = fragment.querySelector('.repo-link');
    const rank = fragment.querySelector('.rank');
    const badge = fragment.querySelector('.stars-today');
    const what = fragment.querySelector('.summary-what');
    const who = fragment.querySelector('.summary-who');
    const highlight = fragment.querySelector('.summary-highlight');
    const metaGrid = fragment.querySelector('.meta-grid');
    const topics = fragment.querySelector('.topics');

    previewSourceBadge.textContent = item.source;
    previewCategoryBadge.textContent = item.category;
    previewProgressFill.style.width = `${Math.max(16, ((item.downloads || 0) / maxDownloads) * 100)}%`;

    rank.textContent = `第 ${index + 1} 名`;
    repoLink.href = item.link;
    repoLink.textContent = item.name;
    badge.textContent = `${formatCompact(item.downloads)} 下载`;

    what.textContent = item.description || item.summary || '暂无介绍';
    who.textContent = `作者：${item.author || 'Unknown'} · 来源：${item.source}`;
    highlight.textContent = item.crossListed
      ? `双榜上榜 · ${item.crossSources.join(' / ')}`
      : `分类：${item.category}`;

    metaGrid.appendChild(createMetaLink('分类', item.category));
    metaGrid.appendChild(createMetaLink('作者', item.author || 'Unknown'));
    metaGrid.appendChild(createMetaLink('总下载', formatCompact(item.downloads)));
    metaGrid.appendChild(createMetaLink('全部安装', formatCompact(item.installsAllTime)));
    if (item.installsCurrent != null) {
      metaGrid.appendChild(createMetaLink('当前安装', formatCompact(item.installsCurrent)));
    }
    if (item.stars != null) {
      metaGrid.appendChild(createMetaLink('Stars', formatCompact(item.stars)));
    }
    if (item.updatedAt) {
      metaGrid.appendChild(createMetaLink('更新时间', formatTime(item.updatedAt)));
    }
    metaGrid.appendChild(createMetaLink('链接', '打开原页', item.link, 'meta-link'));

    const tags = [];
    if (item.crossListed) tags.push('双榜上榜');
    if (item.sourceKey === 'clawhub') tags.push('ClawHub');
    if (item.sourceKey === 'skillssh') tags.push('Skills.sh');
    tags.push(item.category);

    tags.forEach((tag) => {
      const pill = document.createElement('span');
      pill.className = 'topic-pill';
      pill.textContent = tag;
      topics.appendChild(pill);
    });

    card.addEventListener('click', (event) => {
      if (event.target.closest('a, button, input, select, option')) return;
      window.open(item.link, '_blank', 'noopener,noreferrer');
    });

    cardsElement.appendChild(fragment);
  });
}

function renderPage() {
  renderSourceButtons();
  renderCategoryChips();
  renderInsights();
  renderCards();
}

async function loadData(forceRefresh = false) {
  if (refreshButton) refreshButton.disabled = true;
  if (heroRefreshButton) heroRefreshButton.disabled = true;
  renderEmpty('正在加载最新技能榜…');

  try {
    state.payload = await loadPayload(forceRefresh);
    state.items = state.payload.items || [];
    renderPage();
  } catch (error) {
    renderEmpty(`加载失败：${error.message || '请稍后重试'}`);
  } finally {
    if (refreshButton) refreshButton.disabled = false;
    if (heroRefreshButton) heroRefreshButton.disabled = false;
  }
}

refreshButton?.addEventListener('click', () => loadData(true));
heroRefreshButton?.addEventListener('click', () => loadData(true));

topNSelect?.addEventListener('change', (event) => {
  state.topN = Number(event.target.value || '12');
  renderPage();
});

searchInput?.addEventListener('input', (event) => {
  state.query = event.target.value || '';
  renderPage();
});

sourceSwitcher?.querySelectorAll('.segment-button').forEach((button) => {
  button.addEventListener('click', () => {
    state.source = button.dataset.source;
    state.category = 'all';
    renderPage();
  });
});

loadData(false);
