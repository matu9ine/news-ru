const { escapeHtml, formatDateRu } = require('../utils');
const { getAllSettings } = require('../settings');
const { db } = require('../db');

function renderHeader(settings, activeSlug) {
  const categories = db
    .prepare("SELECT name, slug FROM categories WHERE slug IN ('mnenie', 'cifry-fakty') ORDER BY sort_order ASC, id ASC")
    .all();

  const logoText = escapeHtml(settings.logo_text || settings.site_name || 'Редакция');
  const logoImage = settings.logo_image
    ? `<img src="${escapeHtml(settings.logo_image)}" alt="${logoText}" class="logo-img">`
    : '';

  const today = formatDateRu(new Date(), false);

  const nav = categories
    .map(
      (c) => `<a class="nav-link${activeSlug === c.slug ? ' is-active' : ''}" href="/category/${escapeHtml(c.slug)}">${escapeHtml(c.name)}</a>`
    )
    .join('');

  return `
<a class="skip-link" href="#main">К содержимому</a>
<header class="site-header" id="siteHeader">
  <div class="header-inner container-wide">
    <a class="logo" href="/" aria-label="На главную">
      ${logoImage}
      <span class="logo-text">${logoText}</span>
    </a>
    <nav class="site-nav" aria-label="Рубрики">
      <button class="burger" id="burgerBtn" aria-label="Меню" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <div class="nav-links" id="navLinks">${nav}</div>
    </nav>
    <div class="header-right">
      <button class="icon-btn" id="searchToggle" aria-label="Поиск">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      </button>
      <span class="header-date">${escapeHtml(today)}</span>
    </div>
  </div>
</header>
<div class="search-overlay" id="searchOverlay" hidden>
  <div class="search-overlay-inner">
    <form class="search-form" action="/search" method="GET" role="search">
      <input type="search" name="q" id="searchInput" placeholder="Поиск по архиву" autocomplete="off" aria-label="Поиск по сайту">
      <button type="button" class="icon-btn" id="searchClose" aria-label="Закрыть поиск">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </form>
    <div class="search-results" id="searchResults"></div>
  </div>
</div>`;
}

function renderBreakingBar() {
  return '';
}

function renderFooter(settings) {
  const year = new Date().getFullYear();
  const socials = [
    ['social_vk', 'ВКонтакте'],
    ['social_tg', 'Telegram'],
    ['social_ok', 'Одноклассники'],
    ['social_x', 'X'],
  ]
    .filter(([k]) => settings[k])
    .map(([k, label]) => `<a href="${escapeHtml(settings[k])}" target="_blank" rel="noopener">${label}</a>`)
    .join('');

  const categories = db
    .prepare("SELECT name, slug FROM categories WHERE slug IN ('mnenie', 'cifry-fakty') ORDER BY sort_order ASC, id ASC")
    .all();
  const catLinks = categories
    .map((c) => `<a href="/category/${escapeHtml(c.slug)}">${escapeHtml(c.name)}</a>`)
    .join('');

  return `
<footer class="site-footer">
  <div class="container-wide footer-inner">
    <div class="footer-col">
      <div class="footer-logo">${escapeHtml(settings.logo_text || settings.site_name || 'Редакция')}</div>
      <div class="footer-tagline">${escapeHtml(settings.site_tagline || '')}</div>
    </div>
    <div class="footer-col">
      <div class="footer-head">Рубрики</div>
      <div class="footer-links">${catLinks}</div>
    </div>
    <div class="footer-col">
      <div class="footer-head">Мы в соцсетях</div>
      <div class="footer-links">${socials || '<span class="muted">пока пусто</span>'}</div>
    </div>
  </div>
  <div class="footer-bottom container-wide">
    <span>© ${year} ${escapeHtml(settings.site_name || '')}</span>
    <span class="muted">Все права защищены</span>
  </div>
</footer>`;
}

function renderLayout(opts) {
  const {
    title,
    description,
    canonical,
    ogImage,
    ogType = 'website',
    jsonLd,
    bodyClass = '',
    content,
    activeSlug = '',
    extraHead = '',
  } = opts;

  const settings = getAllSettings();
  const siteName = settings.site_name || 'Редакция';
  const siteUrl = process.env.SITE_URL || '';
  const fullTitle = title
    ? `${title} — ${siteName}`
    : siteName;
  const desc = description || settings.site_tagline || '';
  const canonicalUrl = canonical
    ? canonical.startsWith('http')
      ? canonical
      : `${siteUrl}${canonical}`
    : siteUrl;
  const ogImg = ogImage || '';

  return `<!doctype html>
<html lang="ru" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<link rel="canonical" href="${escapeHtml(canonicalUrl)}">
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">

<meta property="og:site_name" content="${escapeHtml(siteName)}">
<meta property="og:title" content="${escapeHtml(fullTitle)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${escapeHtml(canonicalUrl)}">
<meta property="og:type" content="${escapeHtml(ogType)}">
${ogImg ? `<meta property="og:image" content="${escapeHtml(ogImg)}">` : ''}

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(fullTitle)}">
<meta name="twitter:description" content="${escapeHtml(desc)}">
${ogImg ? `<meta name="twitter:image" content="${escapeHtml(ogImg)}">` : ''}

<link rel="stylesheet" href="/static/style.css?v=nyt-grid-20260528-1">
${extraHead}
${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
</head>
<body class="${escapeHtml(bodyClass)}">
${renderHeader(settings, activeSlug)}
${renderBreakingBar()}
<main id="main" class="site-main">
${content}
</main>
${renderFooter(settings)}
<script src="/static/app.js" defer></script>
</body>
</html>`;
}

module.exports = { renderLayout };
