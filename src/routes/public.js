const express = require('express');
const { db } = require('../db');
const { renderLayout } = require('../views/layout');
const { escapeHtml, stripHtml, formatDateRu, readingTime } = require('../utils');
const { getAllSettings } = require('../settings');

const router = express.Router();

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
  const items = getPublishedNews({ limit: 50 });
  const content = `
<div class="container-wide">
  <header class="front-head">
    <h1>Лента новостей</h1>
  </header>
  ${searchArchiveBlock()}
  <section class="chronology">
    ${items.length ? items.map((n) => newsCard(n)).join('') : '<div class="empty"><p>Новостей пока нет.</p></div>'}
  </section>
</div>`;

  res.send(renderLayout({
    title: '',
    description: 'Хронологическая лента новостей.',
    canonical: '/',
    content,
  }));
});

router.get('/category/:slug', (req, res) => {
  const cat = getCategoryBySlug(req.params.slug);
  if (!cat) return res.status(404).send(renderNotFound());

  const items = getPublishedNews({ categoryId: cat.id, limit: 50 });
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
</div>`;

  res.send(renderLayout({
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
  const q = String(req.query.q || '').trim();
  let results = [];
  if (q) {
    const like = `%${q}%`;
    results = db.prepare(`
      SELECT n.*, c.name AS category_name, c.slug AS category_slug
      FROM news n
      LEFT JOIN categories c ON c.id = n.category_id
      WHERE n.status = 'published'
        AND (n.title LIKE ? OR n.excerpt LIKE ? OR n.content LIKE ? OR n.author_name LIKE ?)
      ORDER BY n.published_at DESC, n.id DESC
      LIMIT 50
    `).all(like, like, like, like);
  }

  const content = `
<div class="container-wide">
  <header class="page-head">
    <h1 class="page-title">Поиск</h1>
  </header>
  ${searchArchiveBlock(q)}
  ${q ? `<p class="search-note">По запросу «${escapeHtml(q)}» найдено: ${results.length}</p>` : ''}
  <section class="chronology">
    ${results.map((n) => newsCard(n)).join('')}
  </section>
</div>`;

  res.send(renderLayout({
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
