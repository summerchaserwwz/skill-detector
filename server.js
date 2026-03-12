const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const cheerio = require('cheerio');

const PORT = Number(process.env.PORT || 3216);
const PUBLIC_DIR = path.join(__dirname, 'public');
const CACHE_TTL_MS = 30 * 60 * 1000;
const USER_AGENT = 'skill-detector/1.0 (+https://github.com)';
const SKILLS_SH_URL = 'https://skills.sh';
const CLAWHUB_SITE_URL = 'https://clawhub.ai';
const CLAWHUB_API_URL = 'https://wry-manatee-359.convex.site/api/v1';
const cache = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function normalizeSpace(value = '') {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateText(value = '', maxLength = 160) {
  const text = normalizeSpace(value);
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function createErrorPayload(message, statusCode = 500) {
  return {
    ok: false,
    statusCode,
    message,
    items: [],
    directions: [],
    sources: {},
    generatedAt: new Date().toISOString(),
  };
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 25000);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: options.accept || 'text/html,application/json;q=0.9,*/*;q=0.8',
        ...options.headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`${response.status} ${response.statusText} for ${url}: ${body.slice(0, 120)}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, options = {}) {
  const text = await fetchText(url, {
    ...options,
    accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
  });
  return JSON.parse(text);
}

async function mapLimit(items, limit, iteratee) {
  const results = new Array(items.length);
  let index = 0;

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await iteratee(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

function pickMeaningfulParagraph(candidates = []) {
  return (
    candidates
      .map((item) => normalizeSpace(item))
      .find(
        (item) =>
          item.length >= 24 &&
          !/^\$\s*npx\s+skills/i.test(item) &&
          !/^SKILL\.md$/i.test(item) &&
          !/^(Skills|Audits|Docs)\b/.test(item),
      ) || ''
  );
}

function normalizeSkillKey(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
}

function inferCategory(item) {
  const text = [
    item.name,
    item.author,
    item.publisher,
    item.description,
    item.summary,
    item.slug,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const rules = [
    { pattern: /(search|find|retriev|browser|crawl|scrap|web search|query|discover|lookup)/, label: '搜索与信息检索' },
    { pattern: /(summar|write|wechat|draft|translate|humaniz|content|article|blog|copywriting)/, label: '写作与内容处理' },
    { pattern: /(frontend|ui|ux|design|figma|react|vue|css|tailwind|landing page|component)/, label: '前端与设计' },
    { pattern: /(browser automation|playwright|puppeteer|selenium|headless|web automation|agent browser)/, label: '浏览器自动化' },
    { pattern: /(memory|knowledge|ontology|vector|rag|database|postgres|mysql|sql|storage)/, label: '知识库与数据' },
    { pattern: /(self-improv|reflection|proactive|agent|llm|assistant|copilot|prompt|eval|reasoning)/, label: 'AI Agent 能力增强' },
    { pattern: /(deploy|docker|kubernetes|terraform|devops|ci|cd|ops|cloud|infrastructure)/, label: '运维与工程效率' },
    { pattern: /(slack|discord|telegram|github|jira|calendar|notion|trello|sonos|weather|integration)/, label: '协作与系统集成' },
    { pattern: /(audio|voice|speech|tts|video|image|ocr)/, label: '多媒体与音视频' },
    { pattern: /(security|audit|review|vetter|compliance|malware|scan|test|debug)/, label: '安全与质量' },
  ];

  return rules.find((rule) => rule.pattern.test(text))?.label || '通用工具';
}

function inferChineseIntro(item) {
  const rawText = normalizeSpace(item.description || item.summary || '');
  if (/[\u4e00-\u9fa5]/.test(rawText)) {
    return truncateText(rawText, 72);
  }

  const categoryText = {
    '搜索与信息检索': '一个偏搜索、发现和检索的技能，适合帮你快速找到资料、能力或可安装的技能。',
    '写作与内容处理': '一个偏写作、总结和内容处理的技能，适合做整理、改写、摘要和文档输出。',
    '前端与设计': '一个偏前端页面与设计规范的技能，适合做界面搭建、视觉优化和组件实现。',
    '浏览器自动化': '一个偏浏览器自动化的技能，适合网页操作、表单填写、抓取和 UI 流程执行。',
    '知识库与数据': '一个偏知识库、数据库或结构化数据处理的技能，适合记忆、检索和数据工作流。',
    'AI Agent 能力增强': '一个偏 Agent 能力增强的技能，适合自我改进、任务编排、反思和智能体工作流。',
    '运维与工程效率': '一个偏工程效率和运维流程的技能，适合部署、自动化、脚本和基础设施工作。',
    '协作与系统集成': '一个偏外部系统集成的技能，适合连接协作工具、业务系统和第三方服务。',
    '多媒体与音视频': '一个偏多媒体处理的技能，适合语音、图片、视频和其他内容生成场景。',
    '安全与质量': '一个偏安全和质量保障的技能，适合评测、审查、检测和问题发现。',
    '通用工具': '一个通用型技能，适合放进常用工具箱，帮助你提升日常 Agent 工作效率。',
  };

  return truncateText(categoryText[item.category] || categoryText['通用工具'], 72);
}

function inferVerticalDomain(item) {
  const text = [
    item.name,
    item.author,
    item.publisher,
    item.description,
    item.summary,
    item.slug,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const rules = [
    { pattern: /(stock|stocks|finance|financial|crypto|trading|portfolio|investment|dividend|earnings|yahoo finance|quant)/, label: '金融投资' },
    { pattern: /(medical|medicine|health|healthcare|clinical|doctor|patient|hospital|biotech|pharma)/, label: '医疗健康' },
    { pattern: /(legal|law|contract|compliance|policy|regulation|gdpr|privacy)/, label: '法律合规' },
    { pattern: /(sales|marketing|seo|ads|growth|brand|campaign|crm|shopify|ecommerce|commerce)/, label: '营销与商业' },
    { pattern: /(education|learning|course|teach|school|student|training|curriculum)/, label: '教育培训' },
    { pattern: /(research|science|scientific|paper|academic|lab|experiment)/, label: '科研学术' },
    { pattern: /(github|gitlab|slack|discord|notion|jira|calendar|gmail|google workspace|docs|drive|trello)/, label: '办公协作' },
    { pattern: /(code|dev|developer|engineering|frontend|backend|react|next|vue|typescript|python|docker|kubernetes)/, label: '开发工程' },
    { pattern: /(image|video|audio|voice|tts|speech|music|media|youtube)/, label: '内容媒体' },
  ];

  return rules.find((rule) => rule.pattern.test(text))?.label || '通用场景';
}

function buildClusterSummary(items, field) {
  const map = new Map();
  for (const item of items) {
    const key = item[field] || '未分类';
    const current = map.get(key) || {
      label: key,
      count: 0,
      downloads: 0,
      sources: new Set(),
    };
    current.count += 1;
    current.downloads += item.downloads || 0;
    current.sources.add(item.source);
    map.set(key, current);
  }

  return [...map.values()]
    .map((entry) => ({
      label: entry.label,
      count: entry.count,
      downloads: entry.downloads,
      sources: [...entry.sources],
    }))
    .sort((a, b) => b.downloads - a.downloads || b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));
}

function buildDirectionSummary(items) {
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
    .sort((a, b) => b.downloads - a.downloads || b.count - a.count || a.category.localeCompare(b.category, 'zh-CN'));
}

function enrichCrossListed(items) {
  const keyMap = new Map();
  for (const item of items) {
    const key = normalizeSkillKey(item.name || item.slug);
    if (!keyMap.has(key)) keyMap.set(key, []);
    keyMap.get(key).push(item.source);
  }

  return items.map((item) => {
    const key = normalizeSkillKey(item.name || item.slug);
    const sources = [...new Set(keyMap.get(key) || [])];
    return {
      ...item,
      crossListed: sources.length > 1,
      crossSources: sources,
    };
  });
}

function withProgress(items) {
  const maxDownloads = Math.max(...items.map((item) => item.downloads || 0), 1);
  return items.map((item) => ({
    ...item,
    progress: clamp((Math.log10((item.downloads || 0) + 1) / Math.log10(maxDownloads + 1)) * 100),
  }));
}

function getCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.createdAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setCache(key, value) {
  cache.set(key, { createdAt: Date.now(), value });
  return value;
}

function parseSkillsShIndex(html) {
  const normalized = html.replace(/\\"/g, '"').replace(/\\u0026/g, '&');
  const seen = new Set();
  const items = [];

  for (const match of normalized.matchAll(/"source":"([^"]+)","skillId":"([^"]+)","name":"([^"]+)","installs":(\d+)/g)) {
    const publisher = match[1];
    const slug = match[2];
    const name = match[3];
    const downloads = Number(match[4] || 0);
    const id = `skillssh:${publisher}:${slug}`;

    if (seen.has(id)) continue;
    seen.add(id);

    items.push({
      id,
      slug,
      name,
      source: 'Skills.sh',
      sourceKey: 'skillssh',
      author: publisher.split('/')[0] || publisher,
      publisher,
      link: `${SKILLS_SH_URL}/${publisher}/${slug}`,
      downloads,
      installsAllTime: downloads,
      installsCurrent: null,
      stars: null,
      summary: '',
      description: '',
      updatedAt: null,
    });
  }

  return items.sort((a, b) => b.downloads - a.downloads);
}

async function enrichSkillsShItem(item) {
  try {
    const html = await fetchText(item.link);
    const $ = cheerio.load(html);
    const paragraphs = [
      ...$('.prose p').map((_, el) => $(el).text()).get(),
      ...$('main p').map((_, el) => $(el).text()).get(),
    ];
    const description = pickMeaningfulParagraph(paragraphs);
    const heading = normalizeSpace($('main h1').first().text()) || item.name;

    return {
      ...item,
      name: heading || item.name,
      summary: truncateText(description, 130),
      description: truncateText(description, 220),
    };
  } catch (error) {
    return {
      ...item,
      summary: item.summary || '来自 Skills.sh 的高下载技能。',
      description: item.description || '来自 Skills.sh 的高下载技能。',
      detailError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchSkillsShLeaderboard(limit = 48) {
  const cacheKey = `skillssh:${limit}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const html = await fetchText(SKILLS_SH_URL);
  const list = parseSkillsShIndex(html).slice(0, limit);
  const enriched = await mapLimit(list, 6, enrichSkillsShItem);

  const result = enriched
    .map((item) => ({
      ...item,
      category: inferCategory(item),
      domain: inferVerticalDomain(item),
      chineseIntro: inferChineseIntro({ ...item, category: inferCategory(item) }),
    }))
    .sort((a, b) => b.downloads - a.downloads);

  return setCache(cacheKey, result);
}

async function enrichClawhubItem(item) {
  try {
    const detail = await fetchJson(`${CLAWHUB_API_URL}/skills/${item.slug}`);
    const handle = detail.owner?.handle || detail.owner?.displayName || item.author || 'unknown';
    return {
      ...item,
      author: handle,
      ownerHandle: detail.owner?.handle || null,
      ownerDisplayName: detail.owner?.displayName || null,
      link: detail.owner?.handle ? `${CLAWHUB_SITE_URL}/${detail.owner.handle}/${item.slug}` : item.link,
      description: truncateText(detail.skill?.summary || item.description, 220),
      summary: truncateText(detail.skill?.summary || item.summary, 130),
      updatedAt: formatDateTime(detail.skill?.updatedAt || item.updatedAt),
      installsAllTime: detail.skill?.stats?.installsAllTime ?? item.installsAllTime,
      installsCurrent: detail.skill?.stats?.installsCurrent ?? item.installsCurrent,
      stars: detail.skill?.stats?.stars ?? item.stars,
      moderation: detail.moderation || null,
    };
  } catch (error) {
    return {
      ...item,
      detailError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchClawhubLeaderboard(limit = 48) {
  const cacheKey = `clawhub:${limit}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const payload = await fetchJson(`${CLAWHUB_API_URL}/skills?sort=downloads&limit=${limit}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  const list = (payload.items || []).map((item) => ({
    id: `clawhub:${item.slug}`,
    slug: item.slug,
    name: item.displayName || item.slug,
    source: 'ClawHub',
    sourceKey: 'clawhub',
    author: '',
    publisher: item.slug,
    link: `${CLAWHUB_SITE_URL}/${item.slug}`,
    downloads: item.stats?.downloads || 0,
    installsAllTime: item.stats?.installsAllTime ?? null,
    installsCurrent: item.stats?.installsCurrent ?? null,
    stars: item.stats?.stars ?? null,
    summary: truncateText(item.summary || '', 130),
    description: truncateText(item.summary || '', 220),
    updatedAt: formatDateTime(item.updatedAt),
  }));

  const enriched = await mapLimit(list, 6, enrichClawhubItem);
  const result = enriched
    .map((item) => ({
      ...item,
      category: inferCategory(item),
      domain: inferVerticalDomain(item),
      chineseIntro: inferChineseIntro({ ...item, category: inferCategory(item) }),
    }))
    .sort((a, b) => b.downloads - a.downloads);

  return setCache(cacheKey, result);
}

function filterBySource(items, source) {
  if (!source || source === 'all') return items;
  const sourceKey = source.toLowerCase();
  return items.filter((item) => item.sourceKey === sourceKey);
}

async function getLeaderboardData(options = {}) {
  const source = String(options.source || 'all').toLowerCase();
  const requestedTopN = Number(options.topN || 100);
  const maxPerSource = Math.max(requestedTopN, Number(options.maxPerSource || 100));
  const topN = clamp(requestedTopN, 1, maxPerSource * 2);

  const [clawhubItems, skillsShItems] = await Promise.all([
    fetchClawhubLeaderboard(maxPerSource),
    fetchSkillsShLeaderboard(maxPerSource),
  ]);

  const allItems = enrichCrossListed(withProgress([...clawhubItems, ...skillsShItems]))
    .sort((a, b) => b.downloads - a.downloads || a.name.localeCompare(b.name, 'zh-CN'));

  const visibleItems = filterBySource(allItems, source).slice(0, topN);
  const directions = buildDirectionSummary(filterBySource(allItems, source));
  const domains = buildClusterSummary(filterBySource(allItems, source), 'domain');

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    source,
    topN,
    maxPerSource,
    items: visibleItems,
    directions,
    domains,
    sources: {
      all: {
        count: allItems.length,
        downloads: allItems.reduce((sum, item) => sum + (item.downloads || 0), 0),
      },
      clawhub: {
        count: clawhubItems.length,
        downloads: clawhubItems.reduce((sum, item) => sum + (item.downloads || 0), 0),
      },
      skillssh: {
        count: skillsShItems.length,
        downloads: skillsShItems.reduce((sum, item) => sum + (item.downloads || 0), 0),
      },
    },
  };
}

async function serveStaticFile(requestPath, response) {
  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath;
  const safePath = path.normalize(normalizedPath).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=600',
    });
    response.end(file);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not Found');
  }
}

async function readStaticPayloadFallback(source = 'all', topN = 100) {
  const fileMap = {
    all: 'leaderboard.json',
    clawhub: 'clawhub.json',
    skillssh: 'skillssh.json',
  };

  const fileName = fileMap[source] || fileMap.all;
  const filePath = path.join(PUBLIC_DIR, 'data', fileName);
  const raw = await fs.readFile(filePath, 'utf8');
  const payload = JSON.parse(raw);

  return {
    ...payload,
    source,
    topN,
    fallback: true,
    fallbackReason: 'remote-rate-limited',
    items: (payload.items || []).slice(0, topN),
  };
}

function parseNumberParam(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, `http://${request.headers.host || `localhost:${PORT}`}`);

      if (requestUrl.pathname === '/api/leaderboard') {
        const source = requestUrl.searchParams.get('source') || 'all';
        const topN = parseNumberParam(requestUrl.searchParams.get('topN'), 100);
        const maxPerSource = parseNumberParam(requestUrl.searchParams.get('maxPerSource'), 100);
        let payload;

        try {
          payload = await getLeaderboardData({ source, topN, maxPerSource });
        } catch (error) {
          payload = await readStaticPayloadFallback(source, topN);
          payload.warning = error instanceof Error ? error.message : String(error);
        }

        response.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
        response.end(JSON.stringify(payload, null, 2));
        return;
      }

      await serveStaticFile(requestUrl.pathname, response);
    } catch (error) {
      const payload = createErrorPayload(error instanceof Error ? error.message : 'Unexpected error');
      response.writeHead(payload.statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify(payload, null, 2));
    }
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`Skill Detector running at http://localhost:${PORT}`);
  });
}

module.exports = {
  createServer,
  getLeaderboardData,
  fetchClawhubLeaderboard,
  fetchSkillsShLeaderboard,
};
