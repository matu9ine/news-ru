(function () {
  'use strict';

  // ─── Sticky header: is-scrolled ─────────────────
  const header = document.getElementById('siteHeader');
  if (header) {
    let scrolled = false;
    const onScroll = () => {
      const y = window.scrollY;
      // Гистерезис: добавляем при >30, убираем при <5
      if (!scrolled && y > 30) {
        scrolled = true;
        header.classList.add('is-scrolled');
      } else if (scrolled && y < 5) {
        scrolled = false;
        header.classList.remove('is-scrolled');
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ─── Burger menu ───────────────────────────────
  const burger = document.getElementById('burgerBtn');
  const navLinks = document.getElementById('navLinks');
  if (burger && navLinks) {
    burger.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(isOpen));
    });
    // Закрытие при клике на ссылку
    navLinks.addEventListener('click', (e) => {
      if (e.target.closest('.nav-link')) {
        navLinks.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ─── Search overlay ────────────────────────────
  const searchToggle = document.getElementById('searchToggle');
  const searchOverlay = document.getElementById('searchOverlay');
  const searchClose = document.getElementById('searchClose');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');

  function openSearch() {
    if (!searchOverlay) return;
    searchOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => searchInput && searchInput.focus(), 50);
  }
  function closeSearch() {
    if (!searchOverlay) return;
    searchOverlay.hidden = true;
    document.body.style.overflow = '';
    if (searchResults) searchResults.innerHTML = '';
    if (searchInput) searchInput.value = '';
  }

  if (searchToggle) searchToggle.addEventListener('click', openSearch);
  if (searchClose) searchClose.addEventListener('click', closeSearch);
  if (searchOverlay) {
    searchOverlay.addEventListener('click', (e) => {
      if (e.target === searchOverlay) closeSearch();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchOverlay && !searchOverlay.hidden) closeSearch();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openSearch();
    }
  });

  // ─── Live search ────────────────────────────────
  if (searchInput && searchResults) {
    let debounceTimer = null;
    let abortCtrl = null;
    const escapeHtml = (s) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim();
      clearTimeout(debounceTimer);
      if (!q) {
        searchResults.innerHTML = '';
        return;
      }
      debounceTimer = setTimeout(async () => {
        try {
          if (abortCtrl) abortCtrl.abort();
          abortCtrl = new AbortController();
          const res = await fetch(
            '/api/public/search?q=' + encodeURIComponent(q),
            { signal: abortCtrl.signal }
          );
          const data = await res.json();
          const list = data.results || [];
          if (!list.length) {
            searchResults.innerHTML =
              '<div class="search-empty">Ничего не найдено</div>';
            return;
          }
          searchResults.innerHTML = list
            .map(
              (n) =>
                '<a class="search-result" href="/news/' +
                escapeHtml(n.slug) +
                '">' +
                '<div class="search-result-title">' +
                escapeHtml(n.title) +
                '</div>' +
                '<div class="search-result-meta">' +
                escapeHtml(n.category_name || '') +
                '</div></a>'
            )
            .join('');
        } catch (err) {
          if (err.name === 'AbortError') return;
          searchResults.innerHTML =
            '<div class="search-empty">Ошибка запроса</div>';
        }
      }, 200);
    });
  }
})();
