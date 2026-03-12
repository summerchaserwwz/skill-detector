const state = {
  payload: null,
  items: [],
  source: 'all',
  topN: 12,
  query: '',
  category: 'all',
};

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const accentPalette = ['#EB6A3D', '#9A72D2', '#4C79C7', '#56B88A', '#D5A443', '#77C7E6', '#F28B82', '#7A8DF6'];

function formatCompact(value) {
  if (value == null) return '—';
  return numberFormatter.format(value);
}

function formatDate(value) {
  if (!value) return '未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';
  return dateFormatter.format(date);
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
      sources: new Set(),
    };
    current.count += 1;
    current.downloads += item.downloads || 0;
    current.sources.add(item.source);
    map.set(item.category, current);
  }

  return [...map.values()]
    .map((entry) => ({
      category: entry.category,
      count: entry.count,
      downloads: entry.downloads,
      sources: [...entry.sources],
    }))
    .sort((a, b) => b.downloads - a.downloads || b.count - a.count);
}

function getFilteredItems() {
  const query = state.query.trim().toLowerCase();

  return state.items
    .filter((item) => (state.source === 'all' ? true : item.sourceKey === state.source))
    .filter((item) => (state.category === 'all' ? true : item.category === state.category))
    .filter((item) => {
      if (!query) return true;
      const haystack = [item.name, item.author, item.category, item.description, item.source, item.publisher]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => b.downloads - a.downloads || a.name.localeCompare(b.name, 'zh-CN'));
}

function renderSignals() {
  const strip = document.querySelector('#signalStrip');
  const dominant = buildDirections(state.items)[0];
  const crossListedCount = state.items.filter((item) => item.crossListed).length;
  const totalDownloads = state.items.reduce((sum, item) => sum + (item.downloads || 0), 0);

  const blocks = [
    { label: '收录技能', value: `${state.items.length}` },
    { label: '双榜重合', value: `${crossListedCount}` },
    { label: '累计下载', value: formatCompact(totalDownloads) },
  ];

  strip.innerHTML = blocks
    .map(
      (block) => `
        <div class="signal-card panel">
          <div class="signal-label">${escapeHtml(block.label)}</div>
          <div class="signal-value">${escapeHtml(block.value)}</div>
        </div>`,
    )
    .join('');

  document.querySelector('#dominantCategory').textContent = dominant?.category || '通用工具';
  document.querySelector('#lastUpdated').textContent = formatDate(state.payload?.generatedAt);
}

function renderOverview(filteredItems) {
  const overview = document.querySelector('#overview');
  const template = document.querySelector('#metricTemplate');
  overview.innerHTML = '';

  const metrics = [
    {
      label: '当前展示',
      value: `${Math.min(state.topN, filteredItems.length)} / ${filteredItems.length}`,
      note: '已按来源、分类和关键词过滤',
    },
    {
      label: '当前总下载',
      value: formatCompact(filteredItems.reduce((sum, item) => sum + (item.downloads || 0), 0)),
      note: '按当前筛选后的结果汇总',
    },
    {
      label: '热门方向',
      value: buildDirections(filteredItems)[0]?.category || '通用工具',
      note: '依据名称与简介自动归类',
    },
    {
      label: '双榜技能',
      value: `${filteredItems.filter((item) => item.crossListed).length}`,
      note: '在两个来源中都出现过',
    },
  ];

  metrics.forEach((metric) => {
    const fragment = template.content.cloneNode(true);
    fragment.querySelector('.metric-label').textContent = metric.label;
    fragment.querySelector('.metric-value').textContent = metric.value;
    fragment.querySelector('.metric-note').textContent = metric.note;
    overview.appendChild(fragment);
  });
}

function renderCategories() {
  const container = document.querySelector('#categoryStrip');
  const directions = buildDirections(
    state.source === 'all' ? state.items : state.items.filter((item) => item.sourceKey === state.source),
  );

  container.innerHTML = '';

  const allButton = document.createElement('button');
  allButton.className = `chip ${state.category === 'all' ? 'is-active' : ''}`;
  allButton.textContent = '全部方向';
  allButton.addEventListener('click', () => {
    state.category = 'all';
    render();
  });
  container.appendChild(allButton);

  directions.forEach((direction) => {
    const button = document.createElement('button');
    button.className = `chip ${state.category === direction.category ? 'is-active' : ''}`;
    button.innerHTML = `<span>${escapeHtml(direction.category)}</span><strong>${direction.count}</strong>`;
    button.addEventListener('click', () => {
      state.category = direction.category;
      render();
    });
    container.appendChild(button);
  });
}

function renderLeaderboard(filteredItems) {
  const list = document.querySelector('#leaderboardList');
  const template = document.querySelector('#leaderboardTemplate');
  const visibleItems = filteredItems.slice(0, Math.min(state.topN, filteredItems.length));
  const maxDownloads = Math.max(...visibleItems.map((item) => item.downloads || 0), 1);

  list.innerHTML = '';

  visibleItems.forEach((item, index) => {
    const fragment = template.content.cloneNode(true);
    const color = accentPalette[index % accentPalette.length];
    const article = fragment.querySelector('.leader-row');
    article.style.setProperty('--accent', color);
    fragment.querySelector('.leader-rank').textContent = `#${index + 1}`;
    fragment.querySelector('.leader-title').textContent = item.name;
    fragment.querySelector('.leader-meta').textContent = `${item.author || 'Unknown'} · ${item.source} · ${item.category}`;
    fragment.querySelector('.leader-value').textContent = formatCompact(item.downloads);
    const bar = fragment.querySelector('.leader-progress-bar');
    bar.style.width = `${Math.max(18, (item.downloads / maxDownloads) * 100)}%`;
    bar.style.background = `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 78%, white))`;
    list.appendChild(fragment);
  });

  document.querySelector('#leaderboardMeta').textContent = `显示前 ${Math.min(state.topN, filteredItems.length)} 个技能`;
}

function renderDirections(filteredItems) {
  const grid = document.querySelector('#directionGrid');
  const template = document.querySelector('#directionTemplate');
  grid.innerHTML = '';

  buildDirections(filteredItems)
    .slice(0, 8)
    .forEach((direction, index) => {
      const fragment = template.content.cloneNode(true);
      const card = fragment.querySelector('.direction-card');
      card.style.setProperty('--accent', accentPalette[index % accentPalette.length]);
      fragment.querySelector('.direction-title').textContent = direction.category;
      fragment.querySelector('.direction-badge').textContent = `${direction.count} 个`;
      fragment.querySelector('.direction-metrics').innerHTML = `
        <span>下载量 ${escapeHtml(formatCompact(direction.downloads))}</span>
        <span>来源 ${escapeHtml(direction.sources.join(' / '))}</span>
      `;
      grid.appendChild(fragment);
    });
}

function renderCards(filteredItems) {
  const cards = document.querySelector('#cards');
  const emptyState = document.querySelector('#emptyState');
  const template = document.querySelector('#cardTemplate');
  const visibleItems = filteredItems.slice(0, Math.min(state.topN, filteredItems.length));
  const maxDownloads = Math.max(...visibleItems.map((item) => item.downloads || 0), 1);

  cards.innerHTML = '';
  emptyState.classList.toggle('hidden', visibleItems.length > 0);

  visibleItems.forEach((item, index) => {
    const fragment = template.content.cloneNode(true);
    const color = accentPalette[index % accentPalette.length];
    const article = fragment.querySelector('.skill-card');
    article.style.setProperty('--accent', color);

    const badges = [];
    if (item.crossListed) badges.push('<span class="badge badge-highlight">双榜上榜</span>');
    badges.push(`<span class="badge">${escapeHtml(item.source)}</span>`);
    badges.push(`<span class="badge">${escapeHtml(item.category)}</span>`);

    fragment.querySelector('.skill-rank').textContent = `#${index + 1}`;
    fragment.querySelector('.skill-badges').innerHTML = badges.join('');
    fragment.querySelector('.skill-link').href = item.link;
    fragment.querySelector('.skill-title').textContent = item.name;
    fragment.querySelector('.skill-downloads').textContent = formatCompact(item.downloads);
    fragment.querySelector('.skill-author').textContent = `${item.author || 'Unknown'} · ${item.publisher || item.source}`;
    fragment.querySelector('.skill-description').textContent = item.description || item.summary || '暂无介绍';
    fragment.querySelector('.skill-stats').innerHTML = `
      <span>下载 ${escapeHtml(formatCompact(item.downloads))}</span>
      <span>Stars ${escapeHtml(formatCompact(item.stars))}</span>
      <span>安装 ${escapeHtml(formatCompact(item.installsAllTime))}</span>
    `;
    fragment.querySelector('.skill-tags').innerHTML = [
      item.installsCurrent != null ? `<span class="tiny-tag">当前安装 ${escapeHtml(formatCompact(item.installsCurrent))}</span>` : '',
      item.updatedAt ? `<span class="tiny-tag">更新于 ${escapeHtml(formatDate(item.updatedAt))}</span>` : '',
    ].join('');

    const bar = fragment.querySelector('.skill-inline-bar-fill');
    bar.style.width = `${Math.max(20, (item.downloads / maxDownloads) * 100)}%`;
    bar.style.background = `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 78%, white))`;

    cards.appendChild(fragment);
  });
}

function renderSourceSwitchers() {
  document.querySelectorAll('#sourceSwitcher .segment').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.source === state.source);
  });
}

function render() {
  const filteredItems = getFilteredItems();
  renderSignals();
  renderSourceSwitchers();
  renderOverview(filteredItems);
  renderCategories();
  renderLeaderboard(filteredItems);
  renderDirections(filteredItems);
  renderCards(filteredItems);
}

function bindEvents() {
  document.querySelector('#refreshButton').addEventListener('click', async () => {
    const button = document.querySelector('#refreshButton');
    button.disabled = true;
    button.textContent = '刷新中…';
    try {
      state.payload = await loadPayload(true);
      state.items = state.payload.items || [];
      render();
    } catch (error) {
      alert(error instanceof Error ? error.message : '刷新失败');
    } finally {
      button.disabled = false;
      button.textContent = '刷新榜单';
    }
  });

  document.querySelectorAll('#sourceSwitcher .segment').forEach((button) => {
    button.addEventListener('click', () => {
      state.source = button.dataset.source;
      state.category = 'all';
      render();
    });
  });

  document.querySelector('#topNSelect').addEventListener('change', (event) => {
    state.topN = Number(event.target.value) || 12;
    render();
  });

  document.querySelector('#searchInput').addEventListener('input', (event) => {
    state.query = event.target.value || '';
    render();
  });
}

async function bootstrap() {
  try {
    state.payload = await loadPayload(false);
    state.items = state.payload.items || [];
    bindEvents();
    render();
  } catch (error) {
    document.querySelector('#cards').innerHTML = `<div class="empty-state">${escapeHtml(error instanceof Error ? error.message : '加载失败')}</div>`;
  }
}

bootstrap();
