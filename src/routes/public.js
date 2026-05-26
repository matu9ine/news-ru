const express = require('express');
const { db } = require('../db');
const { renderLayout } = require('../views/layout');
const {
  escapeHtml,
  stripHtml,
  formatDateRu,
  timeAgo,
  readingTime,
} = require('../utils');
const { getAllSettings } = require('../settings');

const router = express.Router();

// ─────────────────────────────────────────────
// Хелперы выборки
// ─────────────────────────────────────────────

function getPublishedNews(filters = {}) {
  const { categoryId, limit = 20, offset = 0, excludeId } = filters;
  const where = ["n.status = 'published'"];
  const params = {};
  if (categoryId != null) {
    where.push('n.category_id = @categoryId');
    params.categoryId = categoryId;
  }
  if (excludeId != null) {
    where.push('n.id != @excludeId');
    params.excludeId = excludeId;
  }
  params.limit = limit;
  params.offset = offset;
  const sql = `
    SELECT n.*, c.name AS category_name, c.slug AS category_slug
    FROM news n
    LEFT JOIN categories c ON c.id = n.category_id
    WHERE ${where.join(' AND ')}
    ORDER BY n.published_at DESC
    LIMIT @limit OFFSET @offset
  `;
  return db.prepare(sql).all(params);
}

function getPopular(limit = 5) {
  return db
    .prepare(
      `SELECT n.id, n.title, n.slug, n.views, c.slug AS category_slug, c.name AS category_name
       FROM news n LEFT JOIN categories c ON c.id = n.category_id
       WHERE n.status = 'published'
       ORDER BY n.views DESC, n.published_at DESC
       LIMIT ?`
    )
    .all(limit);
}

function getCategoryById(id) {
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

function getCategoryBySlug(slug) {
  return db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
}

function getAllCategories() {
  return db
    .prepare('SELECT * FROM categories ORDER BY sort_order ASC, id ASC')
    .all();
}

// ─────────────────────────────────────────────
// Компоненты карточек
// ─────────────────────────────────────────────

function newsCard(n, variant = 'default') {
  const date = formatDateRu(n.published_at || n.created_at, false);
  const cat = n.category_name
    ? `<a class="card-category" href="/category/${escapeHtml(n.category_slug)}">${escapeHtml(n.category_name)}</a>`
    : '';
  const excerpt = n.excerpt ? stripHtml(n.excerpt).slice(0, 180) : '';
  const img = n.cover_image
    ? `<a class="card-media" href="/news/${escapeHtml(n.slug)}"><img src="${escapeHtml(n.cover_image)}" alt="${escapeHtml(n.title)}" loading="lazy"></a>`
    : '';
  const breaking = n.is_breaking
    ? '<span class="tag tag-breaking">Важно</span>'
    : '';

  if (variant === 'compact') {
    return `
<article class="card card-compact">
  <div class="card-body">
    <div class="card-meta">${cat}<span class="dot">·</span><time>${escapeHtml(date)}</time></div>
    <h3 class="card-title"><a href="/news/${escapeHtml(n.slug)}">${escapeHtml(n.title)}</a></h3>
  </div>
</article>`;
  }

  return `
<article class="card card-row">
  ${img}
  <div class="card-body">
    <div class="card-meta">${cat}${breaking}<span class="dot">·</span><time>${escapeHtml(date)}</time></div>
    <h3 class="card-title"><a href="/news/${escapeHtml(n.slug)}">${escapeHtml(n.title)}</a></h3>
    ${excerpt ? `<p class="card-excerpt">${escapeHtml(excerpt)}</p>` : ''}
  </div>
</article>`;
}

// ─────────────────────────────────────────────
// Главная
// ─────────────────────────────────────────────

router.get('/', (req, res) => {
  const all = getPublishedNews({ limit: 30 });
  const hero = all[0];
  const secondary = all.slice(1, 4);
  const feed = all.slice(4);
  const popular = getPopular(5);
  const categories = getAllCategories();

  // Блок «Карточки рубрик» — по 3 новости на рубрику
  const categoryBlocks = categories
    .map((cat) => {
      const items = getPublishedNews({ categoryId: cat.id, limit: 3 });
      if (!items.length) return '';
      const cards = items.map((n) => newsCard(n, 'compact')).join('');
      return `
<section class="cat-block">
  <div class="cat-block-head">
    <h2 class="section-title"><a href="/category/${escapeHtml(cat.slug)}">${escapeHtml(cat.name)}</a></h2>
    <a class="section-more" href="/category/${escapeHtml(cat.slug)}">Все материалы →</a>
  </div>
  <div class="cat-block-items">${cards}</div>
</section>`;
    })
    .join('');

  const heroBlock = hero
    ? `
<section class="hero">
  <article class="hero-main">
    ${hero.cover_image
        ? `<a class="hero-media" href="/news/${escapeHtml(hero.slug)}"><img src="${escapeHtml(hero.cover_image)}" alt="${escapeHtml(hero.title)}"></a>`
        : ''}
    <div class="hero-body">
      <div class="hero-meta">
        ${hero.category_name ? `<a class="hero-category" href="/category/${escapeHtml(hero.category_slug)}">${escapeHtml(hero.category_name)}</a>` : ''}
        ${hero.is_breaking ? '<span class="tag tag-breaking">Важно</span>' : ''}
      </div>
      <h1 class="hero-title"><a href="/news/${escapeHtml(hero.slug)}">${escapeHtml(hero.title)}</a></h1>
      ${hero.excerpt ? `<p class="hero-lead">${escapeHtml(stripHtml(hero.excerpt).slice(0, 240))}</p>` : ''}
      <div class="hero-footer">
        <time>${escapeHtml(formatDateRu(hero.published_at || hero.created_at, false))}</time>
      </div>
    </div>
  </article>
  <div class="hero-side">
    ${secondary.map((n) => newsCard(n, 'compact')).join('')}
  </div>
</section>`
    : '<section class="empty"><p>Новостей пока нет. Опубликуйте первые материалы в админке.</p></section>';

  const feedBlock = feed.length
    ? `
<section class="feed-section">
  <h2 class="section-title">Лента</h2>
  <div class="feed">${feed.map((n) => newsCard(n)).join('')}</div>
</section>`
    : '';

  const sidebar = `
<aside class="sidebar">
  <section class="side-block">
    <h3 class="side-title">Популярное</h3>
    <ol class="popular-list">
      ${popular
        .map(
          (n, i) => `
<li>
  <span class="popular-num">${i + 1}</span>
  <a href="/news/${escapeHtml(n.slug)}">${escapeHtml(n.title)}</a>
</li>`
        )
        .join('')}
    </ol>
  </section>
</aside>`;

  const content = `
<div class="container-wide">
  ${heroBlock}
  <div class="layout-2col">
    <div>
      ${feedBlock}
      ${categoryBlocks}
    </div>
    ${sidebar}
  </div>
</div>`;

  res.send(
    renderLayout({
      title: '',
      description: 'Актуальные новости дня: политика, общество, технологии, экономика, мир.',
      canonical: '/',
      content,
    })
  );
});

// ─────────────────────────────────────────────
// Страница рубрики
// ─────────────────────────────────────────────

router.get('/category/:slug', (req, res) => {
  const cat = getCategoryBySlug(req.params.slug);
  if (!cat) return res.status(404).send(renderNotFound());

  const items = getPublishedNews({ categoryId: cat.id, limit: 50 });
  const popular = getPopular(5);

  const content = `
<div class="container-wide">
  <header class="page-head">
    <div class="breadcrumbs"><a href="/">Главная</a><span>→</span><span>${escapeHtml(cat.name)}</span></div>
    <h1 class="page-title">${escapeHtml(cat.name)}</h1>
  </header>
  <div class="layout-2col">
    <div>
      ${items.length
          ? `<div class="feed">${items.map((n) => newsCard(n)).join('')}</div>`
          : '<div class="empty"><p>В этой рубрике ещё нет опубликованных материалов.</p></div>'}
    </div>
    <aside class="sidebar">
      <section class="side-block">
        <h3 class="side-title">Популярное</h3>
        <ol class="popular-list">
          ${popular.map((n, i) => `<li><span class="popular-num">${i + 1}</span><a href="/news/${escapeHtml(n.slug)}">${escapeHtml(n.title)}</a></li>`).join('')}
        </ol>
      </section>
    </aside>
  </div>
</div>`;

  res.send(
    renderLayout({
      title: cat.name,
      description: `Все новости рубрики «${cat.name}»`,
      canonical: `/category/${cat.slug}`,
      activeSlug: cat.slug,
      content,
    })
  );
});

// ─────────────────────────────────────────────
// Страница новости
// ─────────────────────────────────────────────

router.get('/news/:slug', (req, res) => {
  const n = db
    .prepare(
      `SELECT n.*, c.name AS category_name, c.slug AS category_slug
       FROM news n LEFT JOIN categories c ON c.id = n.category_id
       WHERE n.slug = ? AND n.status = 'published'`
    )
    .get(req.params.slug);
  if (!n) return res.status(404).send(renderNotFound());

  // Счётчик просмотров
  db.prepare('UPDATE news SET views = views + 1 WHERE id = ?').run(n.id);

  const related = getPublishedNews({
    categoryId: n.category_id,
    limit: 3,
    excludeId: n.id,
  });

  const settings = getAllSettings();
  const siteUrl = process.env.SITE_URL || '';
  const canonical = `/news/${n.slug}`;
  const fullUrl = `${siteUrl}${canonical}`;
  const minutes = readingTime(n.content || n.excerpt || '');

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: n.title,
    description: n.excerpt || stripHtml(n.content || '').slice(0, 200),
    image: n.cover_image || undefined,
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
      <span>→</span>
      ${n.category_name ? `<a href="/category/${escapeHtml(n.category_slug)}">${escapeHtml(n.category_name)}</a>` : ''}
    </div>
    ${n.category_name ? `<div class="article-category">${escapeHtml(n.category_name)}</div>` : ''}
    <h1 class="article-title">${escapeHtml(n.title)}</h1>
    ${n.excerpt ? `<p class="article-lead">${escapeHtml(stripHtml(n.excerpt))}</p>` : ''}
    <div class="article-meta">
      <time>${escapeHtml(formatDateRu(n.published_at || n.created_at, true))}</time>
      <span class="dot">·</span>
      <span>~${minutes} мин чтения</span>
      ${n.is_breaking ? '<span class="tag tag-breaking">Важно</span>' : ''}
    </div>
  </header>
  ${n.cover_image
      ? `<figure class="article-cover"><img src="${escapeHtml(n.cover_image)}" alt="${escapeHtml(n.title)}"></figure>`
      : ''}
  <div class="article-body">${n.content || ''}</div>
  <div class="article-actions">
    <a class="btn-back" href="${n.category_slug ? `/category/${escapeHtml(n.category_slug)}` : '/'}">← Назад</a>
  </div>
</article>

${related.length ? `
<section class="container-wide related-section">
  <h2 class="section-title">Читайте также</h2>
  <div class="related-grid">
    ${related.map((r) => newsCard(r, 'compact')).join('')}
  </div>
</section>` : ''}
`;

  res.send(
    renderLayout({
      title: n.title,
      description: n.excerpt || stripHtml(n.content || '').slice(0, 160),
      canonical,
      ogImage: n.cover_image,
      ogType: 'article',
      jsonLd,
      activeSlug: n.category_slug || '',
      content,
    })
  );
});

// ─────────────────────────────────────────────
// Поиск
// ─────────────────────────────────────────────

router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  let results = [];
  if (q) {
    const like = `%${q}%`;
    results = db
      .prepare(
        `SELECT n.*, c.name AS category_name, c.slug AS category_slug
         FROM news n LEFT JOIN categories c ON c.id = n.category_id
         WHERE n.status = 'published' AND (n.title LIKE ? OR n.excerpt LIKE ? OR n.content LIKE ?)
         ORDER BY n.published_at DESC
         LIMIT 50`
      )
      .all(like, like, like);
  }

  const content = `
<div class="container-wide">
  <header class="page-head">
    <h1 class="page-title">Поиск</h1>
    <form class="page-search" action="/search" method="GET">
      <input type="search" name="q" value="${escapeHtml(q)}" placeholder="Ваш запрос" autofocus>
      <button type="submit" class="btn-primary">Найти</button>
    </form>
    ${q ? `<p class="muted">По запросу «${escapeHtml(q)}» ${results.length ? 'найдено материалов: ' + results.length : 'ничего не найдено'}</p>` : ''}
  </header>
  <div class="feed">
    ${results.map((n) => newsCard(n)).join('')}
  </div>
</div>`;

  res.send(
    renderLayout({
      title: q ? `Поиск: ${q}` : 'Поиск',
      description: 'Поиск по новостям редакции',
      canonical: '/search',
      content,
    })
  );
});

// ─────────────────────────────────────────────
// robots.txt
// ─────────────────────────────────────────────

router.get('/robots.txt', (req, res) => {
  const siteUrl = process.env.SITE_URL || '';
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /api',
      `Sitemap: ${siteUrl.replace(/\/+$/, '')}/sitemap.xml`,
      '',
    ].join('\n')
  );
});

// ─────────────────────────────────────────────
// sitemap.xml
// ─────────────────────────────────────────────

router.get('/sitemap.xml', (req, res) => {
  const siteUrl = (process.env.SITE_URL || '').replace(/\/+$/, '');
  const cats = getAllCategories();
  const news = db
    .prepare(
      "SELECT slug, updated_at, published_at FROM news WHERE status = 'published' ORDER BY published_at DESC"
    )
    .all();

  const urls = [];
  urls.push({ loc: `${siteUrl}/`, changefreq: 'hourly', priority: '1.0' });
  for (const c of cats) {
    urls.push({
      loc: `${siteUrl}/category/${c.slug}`,
      changefreq: 'hourly',
      priority: '0.8',
    });
  }
  for (const n of news) {
    urls.push({
      loc: `${siteUrl}/news/${n.slug}`,
      lastmod: (n.updated_at || n.published_at || '').split(' ')[0] || undefined,
      changefreq: 'daily',
      priority: '0.7',
    });
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n` +
          `    <loc>${escapeHtml(u.loc)}</loc>\n` +
          (u.lastmod ? `    <lastmod>${escapeHtml(u.lastmod)}</lastmod>\n` : '') +
          `    <changefreq>${u.changefreq}</changefreq>\n` +
          `    <priority>${u.priority}</priority>\n` +
          `  </url>`
      )
      .join('\n') +
    `\n</urlset>\n`;

  res.type('application/xml').send(xml);
});

// ─────────────────────────────────────────────
// 404
// ─────────────────────────────────────────────

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
