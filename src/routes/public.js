const express = require('express');
const { db } = require('../db');
const { renderLayout } = require('../views/layout');
const { escapeHtml, stripHtml, formatDateRu, readingTime } = require('../utils');
const { getAllSettings } = require('../settings');
const { getPublicCache, setPublicCache } = require('../cache');

const router = express.Router();
const PAGE_SIZE = 24;

function siteBase(req) {
  return (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

function fullNewsUrl(req, slug) {
  return `${siteBase(req)}/news/${slug}`;
}

function getPublishedNews(filters = {}) {
  const { categoryId, limit = 30, offset = 0, excludeId } = filters;
  const where = ["n.status = 'published'"];
  const params = { limit, offset };
  if (categoryId != null) {
    where.push('n.category_id = @categoryId');
    params.categoryId = categoryId;
  }
  if (excludeId != null) {
    where.push('n.id != @excludeId');
    params.excludeId = excludeId;
  }
  return db.prepare(`
    SELECT n.*, c.name AS category_name, c.slug AS category_slug
    FROM news n
    LEFT JOIN categories c ON c.id = n.category_id
    WHERE ${where.join(' AND ')}
    ORDER BY n.published_at DESC, n.id DESC
    LIMIT @limit OFFSET @offset
  `).all(params);
}

function countPublishedNews(filters = {}) {
  const { categoryId } = filters;
  const where = ["n.status = 'published'"];
  const params = {};
  if (categoryId != null) {
    where.push('n.category_id = @categoryId');
    params.categoryId = categoryId;
  }
  return db.prepare(`
    SELECT COUNT(*) AS c
    FROM news n
    WHERE ${where.join(' AND ')}
  `).get(params).c;
}

function pageFromReq(req) {
  return Math.max(1, Number(req.query.page) || 1);
}

function renderPagination(req, total, page, limit) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return '';
  const makeUrl = (p) => {
    const params = new URLSearchParams(req.query);
    if (p <= 1) params.delete('page');
    else params.set('page', String(p));
    const qs = params.toString();
    return `${req.path}${qs ? `?${qs}` : ''}`;
  };
  return `
<nav class="pagination" aria-label="Постраничная навигация">
  ${page > 1 ? `<a href="${escapeHtml(makeUrl(page - 1))}">Назад</a>` : '<span>Назад</span>'}
  <strong>${page} / ${pages}</strong>
  ${page < pages ? `<a href="${escapeHtml(makeUrl(page + 1))}">Дальше</a>` : '<span>Дальше</span>'}
</nav>`;
}

function sendCached(req, res, html, ttlMs = 30000) {
  setPublicCache(req, html, ttlMs);
  res.send(html);
}

function escapeFtsQuery(q) {
  return String(q || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `"${part.replace(/"/g, '""')}"`)
    .join(' ');
}

function searchNews(q, limit, offset) {
  const ftsQuery = escapeFtsQuery(q);
  if (!ftsQuery) return { rows: [], total: 0 };
  try {
    const params = { ftsQuery, limit, offset };
    const rows = db.prepare(`
      SELECT n.*, c.name AS category_name, c.slug AS category_slug
      FROM news_fts f
      JOIN news n ON n.id = f.rowid
      LEFT JOIN categories c ON c.id = n.category_id
      WHERE news_fts MATCH @ftsQuery AND n.status = 'published'
      ORDER BY bm25(news_fts), n.published_at DESC
      LIMIT @limit OFFSET @offset
    `).all(params);
    const total = db.prepare(`
      SELECT COUNT(*) AS c
      FROM news_fts f
      JOIN news n ON n.id = f.rowid
      WHERE news_fts MATCH @ftsQuery AND n.status = 'published'
    `).get(params).c;
    return { rows, total };
  } catch (_) {
    const like = `%${q}%`;
    const rows = db.prepare(`
      SELECT n.*, c.name AS category_name, c.slug AS category_slug
      FROM news n
      LEFT JOIN categories c ON c.id = n.category_id
      WHERE n.status = 'published'
        AND (n.title LIKE ? OR n.excerpt LIKE ? OR n.content LIKE ? OR n.author_name LIKE ?)
      ORDER BY n.published_at DESC, n.id DESC
      LIMIT ? OFFSET ?
    `).all(like, like, like, like, limit, offset);
    const total = db.prepare(`
      SELECT COUNT(*) AS c
      FROM news n
      WHERE n.status = 'published'
        AND (n.title LIKE ? OR n.excerpt LIKE ? OR n.content LIKE ? OR n.author_name LIKE ?)
    `).get(like, like, like, like).c;
    return { rows, total };
  }
}

function getCategoryBySlug(slug) {
  return db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
}

function getAllCategories() {
  return db
    .prepare('SELECT * FROM categories ORDER BY sort_order ASC, id ASC')
    .all();
}

function newsCard(n, opts = {}) {
  const date = formatDateRu(n.published_at || n.created_at, true);
  const excerpt = n.excerpt ? stripHtml(n.excerpt).slice(0, 220) : '';
  const isOpinion = opts.opinion || n.category_slug === 'mnenie';
  const authorName = n.author_name || '';
  const authorTitle = n.author_title || '';
  const authorPhoto = n.author_photo || '';

  const author = isOpinion && authorName
    ? `<div class="card-author">
        ${authorPhoto ? `<img src="${escapeHtml(authorPhoto)}" alt="${escapeHtml(authorName)}" loading="lazy">` : ''}
        <div>
          <div class="card-author-name">${escapeHtml(authorName)}</div>
          ${authorTitle ? `<div class="card-author-title">${escapeHtml(authorTitle)}</div>` : ''}
        </div>
      </div>`
    : '';

  return `
<article class="news-row">
  ${n.cover_image ? `<a class="news-row-media" href="/news/${escapeHtml(n.slug)}"><img src="${escapeHtml(n.cover_image)}" alt="${escapeHtml(n.title)}" loading="lazy"></a>` : ''}
  <div class="news-row-body">
    <div class="news-row-meta">
      <time datetime="${escapeHtml(n.published_at || n.created_at || '')}">${escapeHtml(date)}</time>
      ${n.category_name ? `<span class="meta-sep">/</span><a href="/category/${escapeHtml(n.category_slug)}">${escapeHtml(n.category_name)}</a>` : ''}
    </div>
    <h2 class="news-row-title"><a href="/news/${escapeHtml(n.slug)}">${escapeHtml(n.title)}</a></h2>
    ${excerpt ? `<p class="news-row-excerpt">${escapeHtml(excerpt)}</p>` : ''}
    ${author}
  </div>
</article>`;
}

function frontCard(n, variant = 'text') {
  if (!n) return '';
  const date = formatDateRu(n.published_at || n.created_at, false);
  const excerpt = n.excerpt ? stripHtml(n.excerpt).slice(0, variant === 'lead' ? 260 : 150) : '';
  const media = n.cover_image
    ? `<a class="front-card-media" href="/news/${escapeHtml(n.slug)}"><img src="${escapeHtml(n.cover_image)}" alt="${escapeHtml(n.title)}" loading="lazy"></a>`
    : '';
  return `
<article class="front-card front-card-${variant}">
  ${(variant === 'lead' || variant === 'image' || variant === 'feature') ? media : ''}
  <div class="front-card-body">
    <div class="front-card-meta">
      ${n.category_name ? `<a href="/category/${escapeHtml(n.category_slug)}">${escapeHtml(n.category_name)}</a>` : ''}
      <span>${escapeHtml(date)}</span>
    </div>
    <h2 class="front-card-title"><a href="/news/${escapeHtml(n.slug)}">${escapeHtml(n.title)}</a></h2>
    ${excerpt && variant !== 'mini' ? `<p class="front-card-excerpt">${escapeHtml(excerpt)}</p>` : ''}
  </div>
</article>`;
}

function renderFrontIssue(items) {
  if (!items.length) return '<div class="empty"><p>Новостей пока нет.</p></div>';
  const lead = items[0];
  const left = items.slice(1, 4);
  const right = items.slice(4, 7);
  const river = items.slice(7, 15);
  const rail = items.slice(15, 21);
  const bottom = items.slice(21, 24);

  return `
<section class="front-issue" aria-label="Главные новости">
  <div class="front-top">
    <div class="front-column front-column-left">
      ${left.map((n) => frontCard(n, 'text')).join('')}
    </div>
    <div class="front-lead">
      ${frontCard(lead, 'lead')}
    </div>
    <div class="front-column front-column-right">
      ${right.map((n, index) => frontCard(n, index === 0 ? 'image' : 'mini')).join('')}
    </div>
  </div>
</section>

<section class="front-river" aria-label="Новости дня">
  <div class="front-river-main">
    ${river.map((n, index) => frontCard(n, index % 3 === 0 ? 'feature' : 'text')).join('')}
  </div>
  <aside class="front-river-rail" aria-label="Коротко">
    <h2 class="front-section-title">Коротко</h2>
    ${rail.map((n) => frontCard(n, 'mini')).join('')}
  </aside>
</section>

${bottom.length ? `
<section class="front-strip" aria-label="Ещё материалы">
  ${bottom.map((n) => frontCard(n, 'image')).join('')}
</section>` : ''}`;
}

function searchArchiveBlock(q = '') {
  return `
<section class="archive-search" aria-label="Поиск по архиву">
  <form action="/search" method="GET" role="search">
    <label for="archive-q">Поиск по архиву</label>
    <div class="archive-search-row">
      <input id="archive-q" type="search" name="q" value="${escapeHtml(q)}" placeholder="Введите тему, фамилию или дату">
      <button type="submit">Найти</button>
    </div>
  </form>
</section>`;
}

function shareButtons(req, n) {
  const url = fullNewsUrl(req, n.slug);
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(n.title);
  const links = [
    ['VK', `https://vk.com/share.php?url=${encodedUrl}&title=${encodedTitle}`],
    ['Telegram', `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`],
    ['WhatsApp', `https://api.whatsapp.com/send?text=${encodedTitle}%20${encodedUrl}`],
    ['OK', `https://connect.ok.ru/offer?url=${encodedUrl}&title=${encodedTitle}`],
  ];
  return `
<section class="share-block" aria-label="Поделиться новостью">
  <div class="share-title">Поделиться</div>
  <div class="share-links">
    ${links.map(([label, href]) => `<a class="share-link" href="${href}" target="_blank" rel="noopener">${label}</a>`).join('')}
  </div>
</section>`;
}

router.get('/', (req, res) => {
  const cached = getPublicCache(req);
  if (cached) return res.send(cached);
  const page = pageFromReq(req);
  const offset = (page - 1) * PAGE_SIZE;
  const items = getPublishedNews({ limit: PAGE_SIZE, offset });
  const total = countPublishedNews();
  const isFrontPage = page === 1;
  const content = `
<div class="container-wide">
  <header class="front-head">
    <h1>${isFrontPage ? 'Главные новости' : 'Лента новостей'}</h1>
  </header>
  ${searchArchiveBlock()}
  ${isFrontPage
      ? renderFrontIssue(items)
      : `<section class="chronology">${items.length ? items.map((n) => newsCard(n)).join('') : '<div class="empty"><p>Новостей пока нет.</p></div>'}</section>`}
  ${renderPagination(req, total, page, PAGE_SIZE)}
</div>`;

  sendCached(req, res, renderLayout({
    title: '',
    description: 'Хронологическая лента новостей.',
    canonical: '/',
    content,
  }));
});

router.get('/category/:slug', (req, res) => {
  const cached = getPublicCache(req);
  if (cached) return res.send(cached);
  const cat = getCategoryBySlug(req.params.slug);
  if (!cat) return res.status(404).send(renderNotFound());

  const page = pageFromReq(req);
  const offset = (page - 1) * PAGE_SIZE;
  const items = getPublishedNews({ categoryId: cat.id, limit: PAGE_SIZE, offset });
  const total = countPublishedNews({ categoryId: cat.id });
  const isOpinion = cat.slug === 'mnenie';
  const content = `
<div class="container-wide">
  <header class="page-head">
    <div class="breadcrumbs"><a href="/">Главная</a><span>/</span><span>${escapeHtml(cat.name)}</span></div>
    <h1 class="page-title">${escapeHtml(cat.name)}</h1>
  </header>
  ${searchArchiveBlock()}
  <section class="chronology">
    ${items.length ? items.map((n) => newsCard(n, { opinion: isOpinion })).join('') : '<div class="empty"><p>В этой рубрике пока нет публикаций.</p></div>'}
  </section>
  ${renderPagination(req, total, page, PAGE_SIZE)}
</div>`;

  sendCached(req, res, renderLayout({
    title: cat.name,
    description: `Публикации рубрики ${cat.name}`,
    canonical: `/category/${cat.slug}`,
    activeSlug: cat.slug,
    content,
  }));
});

router.get('/news/:slug', (req, res) => {
  const n = db.prepare(`
    SELECT n.*, c.name AS category_name, c.slug AS category_slug
    FROM news n
    LEFT JOIN categories c ON c.id = n.category_id
    WHERE n.slug = ? AND n.status = 'published'
  `).get(req.params.slug);
  if (!n) return res.status(404).send(renderNotFound());

  db.prepare('UPDATE news SET views = views + 1 WHERE id = ?').run(n.id);

  const settings = getAllSettings();
  const canonical = `/news/${n.slug}`;
  const fullUrl = fullNewsUrl(req, n.slug);
  const minutes = readingTime(n.content || n.excerpt || '');
  const authorName = n.author_name || 'Редакция';
  const authorTitle = n.author_title || '';

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: n.title,
    description: n.excerpt || stripHtml(n.content || '').slice(0, 200),
    image: n.cover_image || undefined,
    author: { '@type': 'Person', name: authorName },
    datePublished: n.published_at || n.created_at,
    dateModified: n.updated_at || n.published_at || n.created_at,
    mainEntityOfPage: fullUrl,
    publisher: {
      '@type': 'Organization',
      name: settings.site_name || 'Редакция',
    },
  });

  const content = `
<article class="article container-text">
  <header class="article-head">
    <div class="breadcrumbs">
      <a href="/">Главная</a>
      ${n.category_name ? `<span>/</span><a href="/category/${escapeHtml(n.category_slug)}">${escapeHtml(n.category_name)}</a>` : ''}
    </div>
    <h1 class="article-title">${escapeHtml(n.title)}</h1>
    ${n.excerpt ? `<p class="article-lead">${escapeHtml(stripHtml(n.excerpt))}</p>` : ''}
    <div class="article-meta">
      <time datetime="${escapeHtml(n.published_at || n.created_at || '')}">${escapeHtml(formatDateRu(n.published_at || n.created_at, true))}</time>
      <span>${minutes} мин чтения</span>
    </div>
    <div class="article-author">
      ${n.author_photo ? `<img src="${escapeHtml(n.author_photo)}" alt="${escapeHtml(authorName)}">` : ''}
      <div>
        <div class="article-author-name">Автор: ${escapeHtml(authorName)}</div>
        ${authorTitle ? `<div class="article-author-title">${escapeHtml(authorTitle)}</div>` : ''}
      </div>
    </div>
  </header>
  ${n.cover_image ? `<figure class="article-cover"><img src="${escapeHtml(n.cover_image)}" alt="${escapeHtml(n.title)}"></figure>` : ''}
  <div class="article-body">${n.content || ''}</div>
  ${shareButtons(req, n)}
</article>`;

  res.send(renderLayout({
    title: n.title,
    description: n.excerpt || stripHtml(n.content || '').slice(0, 160),
    canonical,
    ogImage: n.cover_image,
    ogType: 'article',
    jsonLd,
    activeSlug: n.category_slug || '',
    content,
  }));
});

router.get('/search', (req, res) => {
  const cached = getPublicCache(req);
  if (cached) return res.send(cached);
  const q = String(req.query.q || '').trim();
  const page = pageFromReq(req);
  const offset = (page - 1) * PAGE_SIZE;
  let results = [];
  let total = 0;
  if (q) {
    const found = searchNews(q, PAGE_SIZE, offset);
    results = found.rows;
    total = found.total;
  }

  const content = `
<div class="container-wide">
  <header class="page-head">
    <h1 class="page-title">Поиск</h1>
  </header>
  ${searchArchiveBlock(q)}
  ${q ? `<p class="search-note">По запросу «${escapeHtml(q)}» найдено: ${total}</p>` : ''}
  <section class="chronology">
    ${results.map((n) => newsCard(n)).join('')}
  </section>
  ${q ? renderPagination(req, total, page, PAGE_SIZE) : ''}
</div>`;

  sendCached(req, res, renderLayout({
    title: q ? `Поиск: ${q}` : 'Поиск',
    description: 'Поиск по архиву новостей.',
    canonical: '/search',
    content,
  }));
});

router.get('/robots.txt', (req, res) => {
  const base = siteBase(req);
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n'));
});

router.get('/sitemap.xml', (req, res) => {
  const cached = getPublicCache(req);
  if (cached) return res.type('application/xml').send(cached);
  const base = siteBase(req);
  const cats = getAllCategories();
  const news = db.prepare(
    "SELECT slug, updated_at, published_at FROM news WHERE status = 'published' ORDER BY published_at DESC"
  ).all();

  const urls = [
    { loc: `${base}/`, changefreq: 'hourly', priority: '1.0' },
    ...cats.map((c) => ({ loc: `${base}/category/${c.slug}`, changefreq: 'daily', priority: '0.7' })),
    ...news.map((n) => ({
      loc: `${base}/news/${n.slug}`,
      lastmod: (n.updated_at || n.published_at || '').split(' ')[0] || undefined,
      changefreq: 'daily',
      priority: '0.8',
    })),
  ];

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) =>
      `  <url>\n` +
      `    <loc>${escapeHtml(u.loc)}</loc>\n` +
      (u.lastmod ? `    <lastmod>${escapeHtml(u.lastmod)}</lastmod>\n` : '') +
      `    <changefreq>${u.changefreq}</changefreq>\n` +
      `    <priority>${u.priority}</priority>\n` +
      `  </url>`
    ).join('\n') +
    '\n</urlset>\n';

  setPublicCache(req, xml, 10 * 60 * 1000);
  res.type('application/xml').send(xml);
});

function renderNotFound() {
  return renderLayout({
    title: 'Страница не найдена',
    description: 'Страница не найдена',
    canonical: '/',
    content: `
<div class="container-wide empty-page">
  <h1 class="page-title">404</h1>
  <p class="muted">Страница не найдена или удалена.</p>
  <a class="btn-primary" href="/">На главную</a>
</div>`,
  });
}

router.use((req, res) => {
  res.status(404).send(renderNotFound());
});

module.exports = router;
