/* ══════════════════════════════════════════════
   Админка SPA — ванильный JS, без фреймворков
   ══════════════════════════════════════════════ */

(function () {
  'use strict';

  // ─── Утилиты ──────────────────────────────────

  const $app = document.getElementById('app');

  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'html') node.innerHTML = v;
      else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)));
      else node.appendChild(c);
    }
    return node;
  };

  const escapeHtml = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  async function api(method, url, body, isForm) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      if (isForm) opts.body = body;
      else {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ─── Toasts ───────────────────────────────────

  function toast(message, type = 'ok') {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) {
      wrap = el('div', { class: 'toast-wrap' });
      document.body.appendChild(wrap);
    }
    const t = el('div', { class: `toast ${type === 'err' ? 'err' : ''}` }, message);
    wrap.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transition = 'opacity 200ms';
      setTimeout(() => t.remove(), 220);
    }, 3500);
  }

  // ─── Маршрутизация (hash-based внутри /admin) ──

  function getRoute() {
    const path = window.location.pathname.replace(/^\/admin\/?/, '').replace(/\/+$/, '');
    if (!path) return { name: 'news' };
    const parts = path.split('/');
    if (parts[0] === 'login') return { name: 'login' };
    if (parts[0] === 'news') {
      if (parts[1] === 'new') return { name: 'newsEdit', id: null };
      if (parts[1] === 'edit' && parts[2]) return { name: 'newsEdit', id: Number(parts[2]) };
      return { name: 'news' };
    }
    if (parts[0] === 'categories') return { name: 'categories' };
    if (parts[0] === 'admins') return { name: 'admins' };
    if (parts[0] === 'settings') return { name: 'settings' };
    return { name: 'news' };
  }

  function navigate(path) {
    window.history.pushState({}, '', `/admin${path}`);
    render();
  }

  window.addEventListener('popstate', () => render());

  // Перехват клика по внутренним ссылкам вида data-link
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-link]');
    if (a) {
      e.preventDefault();
      navigate(a.getAttribute('data-link'));
    }
  });

  // ─── Состояние ─────────────────────────────────

  const state = {
    me: null,
    categories: [],
  };

  async function loadCategories() {
    const data = await api('GET', '/api/categories');
    state.categories = data.categories || [];
  }

  // ─── Render entry ──────────────────────────────

  async function render() {
    const route = getRoute();

    // Авторизация
    if (!state.me) {
      try {
        const data = await api('GET', '/api/auth/me');
        state.me = data.admin || null;
      } catch (_) { state.me = null; }
    }

    if (!state.me) {
      renderLogin();
      return;
    }

    if (route.name === 'login') {
      navigate('/news');
      return;
    }

    // Подгружаем категории один раз (нужны в разных экранах)
    if (!state.categories.length) {
      try { await loadCategories(); } catch (_) {}
    }

    renderLayout(route);
  }

  // ─── Экран логина ──────────────────────────────

  function renderLogin() {
    $app.className = '';
    $app.innerHTML = '';
    const wrap = el('div', { class: 'login-wrap' });
    const card = el('div', { class: 'login-card' });
    const errorBox = el('div');
    const form = el('form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.innerHTML = '';
      const fd = new FormData(form);
      try {
        const data = await api('POST', '/api/auth/login', {
          login: fd.get('login'),
          password: fd.get('password'),
        });
        state.me = data.admin;
        navigate('/news');
      } catch (err) {
        errorBox.appendChild(el('div', { class: 'alert alert-error' }, err.message));
      }
    });

    form.appendChild(el('div', { class: 'field' },
      el('label', {}, 'Логин'),
      el('input', { type: 'text', name: 'login', required: 'required', autofocus: 'autofocus' })
    ));
    form.appendChild(el('div', { class: 'field' },
      el('label', {}, 'Пароль'),
      el('input', { type: 'password', name: 'password', required: 'required' })
    ));
    form.appendChild(el('button', { class: 'btn btn-primary btn-full', type: 'submit' }, 'Войти'));

    card.appendChild(el('h1', {}, 'Админ-панель'));
    card.appendChild(el('div', { class: 'sub' }, 'Войдите, чтобы управлять сайтом'));
    card.appendChild(errorBox);
    card.appendChild(form);
    wrap.appendChild(card);
    $app.appendChild(wrap);
  }

  // ─── Общий лэйаут с сайдбаром ──────────────────

  function renderLayout(route) {
    $app.className = '';
    $app.innerHTML = '';

    const layout = el('div', { class: 'layout' });
    layout.appendChild(renderSidebar(route));

    const content = el('main', { class: 'content' });
    layout.appendChild(content);
    $app.appendChild(layout);

    const screens = window.__adminScreens || {};
    const fn = screens[route.name];
    if (typeof fn === 'function') fn(content, route);
    else content.appendChild(el('div', { class: 'empty-state' }, 'Экран не найден'));
  }

  function renderSidebar(route) {
    const sidebar = el('aside', { class: 'sidebar' });
    sidebar.appendChild(el('div', { class: 'sidebar-logo' },
      el('span', { class: 'dot' }),
      el('span', {}, 'Редакция')
    ));
    const nav = el('nav', { class: 'nav' });
    const items = [
      { key: 'news', label: 'Новости', path: '/news', icon: iconDoc() },
      { key: 'categories', label: 'Рубрики', path: '/categories', icon: iconFolder(), ownerOnly: true },
      { key: 'admins', label: 'Админы', path: '/admins', icon: iconUsers(), ownerOnly: true },
      { key: 'settings', label: 'Настройки', path: '/settings', icon: iconGear(), ownerOnly: true },
    ];
    for (const it of items) {
      if (it.ownerOnly && state.me.role !== 'owner') continue;
      const active = (route.name === it.key) || (it.key === 'news' && route.name === 'newsEdit');
      const node = el('a', {
        class: 'nav-item' + (active ? ' active' : ''),
        href: `/admin${it.path}`,
        'data-link': it.path,
      }, it.icon, el('span', {}, it.label));
      nav.appendChild(node);
    }
    sidebar.appendChild(nav);

    const footer = el('div', { class: 'sidebar-user' });
    footer.appendChild(el('div', {},
      el('div', { class: 'user-name' }, state.me.login),
      el('div', { class: 'muted' }, state.me.role === 'owner' ? 'Владелец' : 'Автор')
    ));
    footer.appendChild(el('button', {
      class: 'btn btn-ghost btn-sm',
      onclick: async () => {
        await api('POST', '/api/auth/logout');
        state.me = null;
        navigate('/login');
      },
    }, 'Выйти'));
    sidebar.appendChild(footer);

    return sidebar;
  }

  // ─── Иконки ────────────────────────────────────

  function svgIcon(path) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', path);
    svg.appendChild(p);
    return svg;
  }
  function iconDoc() { return svgIcon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h1'); }
  function iconFolder() { return svgIcon('M4 4h5l2 3h9a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1z'); }
  function iconUsers() { return svgIcon('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'); }
  function iconGear() { return svgIcon('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'); }

  // экспортируем render для вызова из экранов
  window.__adminRender = render;
  window.__adminApi = api;
  window.__adminEl = el;
  window.__adminState = state;
  window.__adminToast = toast;
  window.__adminNavigate = navigate;
  window.__adminEscape = escapeHtml;

  // старт — откладываем, чтобы screens.js успел зарегистрировать экраны
  // (оба скрипта defer, но render() инициируется из screens.js в конце)
})();
