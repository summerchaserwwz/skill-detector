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
const rankBarsElement = document.querySelector('#rankBars');
const rankIntroElement = document.querySelector('#rankIntro');
const heroMetricSkills = document.querySelector('#heroMetricSkills');
const heroMetricCross = document.querySelector('#heroMetricCross');
const heroMetricCategory = document.querySelector('#heroMetricCategory');
const heroMiniSource = document.querySelector('#heroMiniSource');
const heroMiniCategory = document.querySelector('#heroMiniCategory');
const heroMiniProgress = document.querySelector('#heroMiniProgress');

const categoryPalette = {
  '前端与设计': { color: '#7dd3fc', soft: 'rgba(125, 211, 252, 0.12)' },
  'AI Agent 能力增强': { color: '#a78bfa', soft: 'rgba(167, 139, 250, 0.12)' },
  '搜索与信息检索': { color: '#60a5fa', soft: 'rgba(96, 165, 250, 0.12)' },
  '知识库与数据': { color: '#5eead4', soft: 'rgba(94, 234, 212, 0.12)' },
  '通用工具': { color: '#f59e0b', soft: 'rgba(245, 158, 11, 0.12)' },
  '写作与内容处理': { color: '#f472b6', soft: 'rgba(244, 114, 182, 0.12)' },
  '运维与工程效率': { color: '#34d399', soft: 'rgba(52, 211, 153, 0.12)' },
  '协作与系统集成': { color: '#c084fc', soft: 'rgba(192, 132, 252, 0.12)' },
  '多媒体与音视频': { color: '#fb7185', soft: 'rgba(251, 113, 133, 0.12)' },
  '安全与质量': { color: '#f97316', soft: 'rgba(249, 115, 22, 0.12)' },
  '浏览器自动化': { color: '#22c55e', soft: 'rgba(34, 197, 94, 0.12)' },
};

function getCategoryTheme(category = '') {
  return categoryPalette[category] || { color: '#60a5fa', soft: 'rgba(96, 165, 250, 0.12)' };
}

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
    const current = map.get(item.category) || { category: item.category, count: 0, downloads: 0 };
    current.count += 1;
    current.downloads += item.downloads || 0;
    map.set(item.category, current);
  }
  return [...map.values()].sort((a, b) => b.downloads - a.downloads || b.count - a.count);
}

function getFilteredItems() {
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

function buildChineseIntro(item) {
  if (item.chineseIntro) return item.chineseIntro;
  const categoryText = {
    '搜索与信息检索': '适合做搜索、资料发现和能力查找，是偏高频入口型的技能。',
    '写作与内容处理': '适合做改写、总结、润色和内容生成，是偏内容处理的常用技能。',
    '前端与设计': '适合做页面搭建、视觉优化和组件实现，是偏前端设计类技能。',
    '浏览器自动化': '适合网页交互、自动化操作和流程执行，是偏浏览器执行类技能。',
    '知识库与数据': '适合数据库、知识库和结构化数据处理，是偏数据工作流类技能。',
    'AI Agent 能力增强': '适合智能体工作流、自我改进和任务编排，是偏 Agent 增强类技能。',
    '运维与工程效率': '适合脚本、部署和工程自动化，是偏运维效率类技能。',
    '协作与系统集成': '适合连接协作工具与外部服务，是偏系统集成类技能。',
    '多媒体与音视频': '适合图片、音频、视频等内容处理，是偏多媒体类技能。',
    '安全与质量': '适合检测、审查、评测和质量保障，是偏安全质量类技能。',
    '通用工具': '适合放进日常工具箱，帮助你提升通用任务处理效率。',
  };
  return categoryText[item.category] || categoryText['通用工具'];
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
  const sourceItems = state.source === 'all' ? state.items : state.items.filter((item) => item.sourceKey === state.source);
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
    const theme = getCategoryTheme(direction.category);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `language-chip category-chip ${state.category === direction.category ? 'active' : ''}`;
    chip.textContent = `${direction.category} · ${direction.count}`;
    chip.style.setProperty('--chip-color', theme.color);
    chip.style.setProperty('--chip-soft', theme.soft);
    chip.addEventListener('click', () => {
      state.category = direction.category;
      renderPage();
    });
    categoryStrip.appendChild(chip);
  });
}

function renderHeroOverview(allItems, visibleItems, directions) {
  const topItem = visibleItems[0];
  const crossCount = allItems.filter((item) => item.crossListed).length;

  if (generatedAtElement) {
    generatedAtElement.textContent = `更新于 ${formatTime(state.payload?.generatedAt)}`;
  }

  if (heroMetricSkills) heroMetricSkills.textContent = `${allItems.length}`;
  if (heroMetricCross) heroMetricCross.textContent = `${crossCount}`;
  if (heroMetricCategory) heroMetricCategory.textContent = directions[0]?.category || '通用工具';

  if (heroMiniSource) {
    heroMiniSource.textContent = state.source === 'all' ? '聚合' : state.source === 'clawhub' ? 'ClawHub' : 'Skills.sh';
  }
  if (heroMiniCategory) {
    heroMiniCategory.textContent = state.category === 'all' ? directions[0]?.category || '全部方向' : state.category;
  }
  if (heroMiniProgress) {
    heroMiniProgress.style.width = `${topItem ? Math.max(22, Math.min(100, (topItem.downloads / Math.max(...visibleItems.map((item) => item.downloads || 0), 1)) * 100)) : 28}%`;
  }
}

function renderInsights() {
  const allItems = state.source === 'all' ? state.items : state.items.filter((item) => item.sourceKey === state.source);
  const visibleItems = getFilteredItems();
  const directions = buildDirections(allItems);
  const topItem = visibleItems[0];
  const sourceCount = new Set(allItems.map((item) => item.source)).size;
  const crossCount = allItems.filter((item) => item.crossListed).length;

  renderHeroOverview(allItems, visibleItems, directions);

  insightNote.textContent = topItem
    ? `当前展示 ${visibleItems.length} 个技能，热门方向是「${directions[0]?.category || '通用工具'}」，榜首是「${topItem.name}」，下载量约 ${formatCompact(topItem.downloads)}。`
    : '当前没有匹配结果，请切换来源、TopN 或关键词。';

  const cards = [
    {
      title: '规模概览',
      tone: 'blue',
      content: `
        <ul class="insight-list">
          <li>当前来源覆盖 <strong>${allItems.length}</strong> 个技能</li>
          <li>来源数 <strong>${sourceCount}</strong></li>
          <li>双榜重合 <strong>${crossCount}</strong></li>
        </ul>
      `,
    },
    {
      title: '方向聚类',
      tone: 'green',
      content: `
        <ul class="insight-list">
          ${directions.slice(0, 4).map((item) => `<li>${escapeHtml(item.category)} · <strong>${item.count}</strong></li>`).join('')}
        </ul>
      `,
    },
    {
      title: '当前筛选',
      tone: 'gold',
      content: `
        <ul class="insight-list">
          <li>来源：<strong>${state.source === 'all' ? '聚合' : state.source}</strong></li>
          <li>TopN：<strong>${state.topN}</strong></li>
          <li>分类：<strong>${escapeHtml(state.category === 'all' ? '全部方向' : state.category)}</strong></li>
        </ul>
      `,
    },
  ];

  insightsGrid.innerHTML = '';
  cards.forEach((item) => {
    const fragment = insightTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.insight-card');
    card.dataset.tone = item.tone;
    fragment.querySelector('.insight-title').textContent = item.title;
    fragment.querySelector('.insight-content').innerHTML = item.content;
    insightsGrid.appendChild(fragment);
  });
}

function renderRankBars() {
  const items = getFilteredItems().slice(0, 6);
  rankBarsElement.innerHTML = '';

  if (!items.length) {
    rankIntroElement.textContent = '当前筛选下暂无可展示的下载排行。';
    return;
  }

  const maxDownloads = Math.max(...items.map((item) => item.downloads || 0), 1);
  const scopeText = state.category === 'all' ? '总榜' : `分类榜 · ${state.category}`;
  rankIntroElement.textContent = `当前展示 ${scopeText} Top ${items.length}，按下载量降序排列。`;

  items.forEach((item, index) => {
    const theme = getCategoryTheme(item.category);
    const row = document.createElement('article');
    row.className = 'rank-bar-card';
    row.style.setProperty('--rank-color', theme.color);
    row.innerHTML = `
      <div class="rank-bar-index">#${index + 1}</div>
      <div class="rank-bar-main">
        <div class="rank-bar-head">
          <div class="rank-bar-title-wrap">
            <a class="rank-bar-title" href="${item.link}" target="_blank" rel="noreferrer">${escapeHtml(item.name)}</a>
            <div class="rank-bar-desc">${escapeHtml(buildChineseIntro(item))}</div>
          </div>
          <div class="rank-bar-value">${escapeHtml(formatCompact(item.downloads))}</div>
        </div>
        <div class="rank-bar-track"><div class="rank-bar-fill" style="width:${Math.max(14, ((item.downloads || 0) / maxDownloads) * 100)}%"></div></div>
      </div>
    `;
    rankBarsElement.appendChild(row);
  });
}

function renderCards() {
  const items = getFilteredItems();
  cardsElement.innerHTML = '';

  if (!items.length) {
    renderEmpty('没有匹配结果，试试切换来源、TopN 或关键词。');
    return;
  }

  emptyState.classList.add('hidden');
  const maxDownloads = Math.max(...items.map((item) => item.downloads || 0), 1);

  items.forEach((item, index) => {
    const theme = getCategoryTheme(item.category);
    const fragment = cardTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.card');
    const previewLink = fragment.querySelector('.preview-link');
    const previewSourceBadge = fragment.querySelector('.preview-source-badge');
    const previewCategoryBadge = fragment.querySelector('.preview-category-badge');
    const previewProgressFill = fragment.querySelector('.preview-progress-fill');
    const repoLink = fragment.querySelector('.repo-link');
    const rank = fragment.querySelector('.rank');
    const badge = fragment.querySelector('.stars-today');
    const what = fragment.querySelector('.summary-what');
    const zh = fragment.querySelector('.summary-zh');
    const who = fragment.querySelector('.summary-who');
    const highlight = fragment.querySelector('.summary-highlight');
    const metaGrid = fragment.querySelector('.meta-grid');
    const topics = fragment.querySelector('.topics');

    card.style.setProperty('--card-accent', theme.color);
    card.style.setProperty('--card-accent-soft', theme.soft);

    previewLink.href = item.link;
    previewSourceBadge.textContent = item.source;
    previewCategoryBadge.textContent = item.category;
    previewSourceBadge.style.setProperty('--badge-color', theme.color);
    previewSourceBadge.style.setProperty('--badge-soft', theme.soft);
    previewCategoryBadge.style.setProperty('--badge-color', theme.color);
    previewCategoryBadge.style.setProperty('--badge-soft', 'rgba(255,255,255,0.08)');
    fragment.querySelector('.preview-copy-title').textContent = item.name;
    fragment.querySelector('.preview-copy-subtitle').textContent = buildChineseIntro(item);
    previewProgressFill.style.width = `${Math.max(16, ((item.downloads || 0) / maxDownloads) * 100)}%`;
    previewProgressFill.style.background = `linear-gradient(90deg, ${theme.color}, color-mix(in srgb, ${theme.color} 70%, white))`;

    rank.textContent = `第 ${index + 1} 名`;
    repoLink.href = item.link;
    repoLink.textContent = item.name;
    badge.textContent = `${formatCompact(item.downloads)} 下载`;

    what.textContent = buildChineseIntro(item);
    zh.textContent = item.description || item.summary || '暂无英文原始介绍';
    who.innerHTML = `作者：<a class="inline-link" href="${item.link}" target="_blank" rel="noreferrer">${escapeHtml(item.author || 'Unknown')}</a> · 来源：${escapeHtml(item.source)}`;
    highlight.textContent = item.crossListed
      ? `双榜上榜 · ${item.crossSources.join(' / ')}`
      : `分类：${item.category}`;

    metaGrid.appendChild(createMetaLink('分类', item.category));
    metaGrid.appendChild(createMetaLink('作者', item.author || 'Unknown'));
    metaGrid.appendChild(createMetaLink('总下载', formatCompact(item.downloads)));
    metaGrid.appendChild(createMetaLink('全部安装', formatCompact(item.installsAllTime)));
    if (item.installsCurrent != null) metaGrid.appendChild(createMetaLink('当前安装', formatCompact(item.installsCurrent)));
    if (item.stars != null) metaGrid.appendChild(createMetaLink('Stars', formatCompact(item.stars)));
    metaGrid.appendChild(createMetaLink('链接', '打开原页', item.link, 'meta-link'));

    const tags = [];
    if (item.crossListed) tags.push('双榜上榜');
    tags.push(item.source);
    tags.push(item.category);

    tags.forEach((tag) => {
      const pill = document.createElement('span');
      pill.className = 'topic-pill';
      pill.textContent = tag;
      pill.style.setProperty('--topic-color', theme.color);
      pill.style.setProperty('--topic-soft', theme.soft);
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
  renderRankBars();
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
