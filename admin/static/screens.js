/* Экраны админки — подключаются после admin.js */
(function () {
  'use strict';

  const el = window.__adminEl;
  const api = window.__adminApi;
  const toast = window.__adminToast;
  const state = window.__adminState;
  const navigate = window.__adminNavigate;
  const escapeHtml = window.__adminEscape;
  const render = window.__adminRender;

  const screens = {};
  window.__adminScreens = screens;

  // ─── Helpers ──────────────────────────────────

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  }

  function categoryOptions(selectedId) {
    const opts = [el('option', { value: '' }, '— без рубрики —')];
    for (const c of state.categories) {
      const o = el('option', { value: String(c.id) }, c.name);
      if (String(selectedId) === String(c.id)) o.selected = true;
      opts.push(o);
    }
    return opts;
  }

  function stripDangerousHtml(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    tpl.content.querySelectorAll('script, iframe, object, embed, style').forEach((node) => node.remove());
    tpl.content.querySelectorAll('*').forEach((node) => {
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || '').trim().toLowerCase();
        if (name.startsWith('on') || name === 'style') node.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src') && value.startsWith('javascript:')) node.removeAttribute(attr.name);
      }
    });
    return tpl.innerHTML;
  }

  // ─── Экран: список новостей ─────────────────────

  screens.news = async function (content) {
    const head = el('div', { class: 'page-head' },
      el('h2', {}, 'Новости'),
      el('div', { class: 'page-actions' },
        el('a', { class: 'btn btn-primary', href: '/admin/news/new', 'data-link': '/news/new' }, '+ Новая новость')
      )
    );
    content.appendChild(head);

    const toolbar = el('div', { class: 'toolbar' });
    const searchInput = el('input', { type: 'search', placeholder: 'Поиск по заголовку' });
    const statusSel = el('select', {},
      el('option', { value: '' }, 'Все статусы'),
      el('option', { value: 'published' }, 'Опубликованные'),
      el('option', { value: 'draft' }, 'Черновики'),
    );
    const catSel = el('select', {}, [el('option', { value: '' }, 'Все рубрики'), ...state.categories.map(c => el('option', { value: String(c.id) }, c.name))]);
    toolbar.appendChild(searchInput);
    toolbar.appendChild(statusSel);
    toolbar.appendChild(catSel);
    content.appendChild(toolbar);

    const panel = el('div', { class: 'panel' });
    content.appendChild(panel);

    let debounceT;
    let page = 1;
    const limit = 25;
    const loadAndRender = async () => {
      panel.innerHTML = '<div class="empty-state">Загрузка…</div>';
      const params = new URLSearchParams();
      if (searchInput.value) params.set('q', searchInput.value);
      if (statusSel.value) params.set('status', statusSel.value);
      if (catSel.value) params.set('category_id', catSel.value);
      params.set('page', String(page));
      params.set('limit', String(limit));
      try {
        const data = await api('GET', '/api/news?' + params.toString());
        renderTable(panel, data.news || [], {
          total: data.total || 0,
          page: data.page || page,
          limit: data.limit || limit,
          reload: loadAndRender,
          onPage: (nextPage) => {
            page = nextPage;
            loadAndRender();
          },
        });
      } catch (err) {
        panel.innerHTML = '';
        panel.appendChild(el('div', { class: 'alert alert-error' }, err.message));
      }
    };
    const resetAndLoad = () => { page = 1; loadAndRender(); };
    const debounced = () => { clearTimeout(debounceT); debounceT = setTimeout(resetAndLoad, 200); };
    searchInput.addEventListener('input', debounced);
    statusSel.addEventListener('change', resetAndLoad);
    catSel.addEventListener('change', resetAndLoad);

    loadAndRender();
  };

  function renderTable(panel, rows, meta) {
    panel.innerHTML = '';
    if (!rows.length) {
      panel.appendChild(el('div', { class: 'empty-state' }, 'Ничего не найдено. Создайте первую новость.'));
      return;
    }
    const table = el('table', { class: 'table' });
    const thead = el('thead', {}, el('tr', {},
      el('th', {}, 'Обложка'),
      el('th', {}, 'Заголовок'),
      el('th', {}, 'Рубрика'),
      el('th', {}, 'Статус'),
      el('th', {}, 'Просмотры'),
      el('th', {}, 'Дата'),
      el('th', {}, '')
    ));
    table.appendChild(thead);
    const tbody = el('tbody');
    for (const n of rows) {
      const tr = el('tr');
      tr.appendChild(el('td', {}, n.cover_image
        ? el('img', { class: 'thumb', src: n.cover_image, alt: '' })
        : el('div', { class: 'thumb' })));
      tr.appendChild(el('td', {}, el('a', {
        'data-link': `/news/edit/${n.id}`,
        href: `/admin/news/edit/${n.id}`,
        style: 'font-weight: 500;'
      }, n.title)));
      tr.appendChild(el('td', {}, n.category_name || '—'));
      const statusTd = el('td');
      statusTd.appendChild(el('span', {
        class: 'badge ' + (n.status === 'published' ? 'badge-published' : 'badge-draft')
      }, n.status === 'published' ? 'Опубликовано' : 'Черновик'));
      tr.appendChild(statusTd);
      tr.appendChild(el('td', {}, String(n.views || 0)));
      tr.appendChild(el('td', {}, fmtDate(n.published_at || n.created_at)));
      const actions = el('div', { class: 'actions' });
      actions.appendChild(el('a', { class: 'btn btn-sm', href: `/admin/news/edit/${n.id}`, 'data-link': `/news/edit/${n.id}` }, 'Открыть'));
      if (state.me.role === 'owner') {
        actions.appendChild(el('button', {
          class: 'btn btn-sm btn-danger',
          onclick: async () => {
            if (!confirm(`Удалить новость «${n.title}»?`)) return;
            try {
              await api('DELETE', `/api/news/${n.id}`);
              toast('Новость удалена');
              meta.reload();
            } catch (e) { toast(e.message, 'err'); }
          },
        }, 'Удалить'));
      }
      tr.appendChild(el('td', {}, actions));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    panel.appendChild(table);
    const pages = Math.max(1, Math.ceil((meta.total || 0) / (meta.limit || 25)));
    const pager = el('div', { class: 'admin-pagination' },
      el('button', {
        class: 'btn btn-sm',
        disabled: meta.page <= 1,
        onclick: () => meta.onPage(Math.max(1, meta.page - 1)),
      }, 'Назад'),
      el('span', {}, `${meta.page} / ${pages} · всего ${meta.total || rows.length}`),
      el('button', {
        class: 'btn btn-sm',
        disabled: meta.page >= pages,
        onclick: () => meta.onPage(Math.min(pages, meta.page + 1)),
      }, 'Дальше')
    );
    panel.appendChild(pager);
  }

  // ─── Экран: редактирование новости ─────────────

  screens.newsEdit = async function (content, route) {
    let news = null;
    if (route.id) {
      try {
        const data = await api('GET', `/api/news/${route.id}`);
        news = data.news;
      } catch (err) {
        content.appendChild(el('div', { class: 'alert alert-error' }, err.message));
        return;
      }
    }

    const head = el('div', { class: 'page-head' },
      el('h2', {}, news ? 'Редактирование новости' : 'Новая новость'),
      el('div', { class: 'page-actions' },
        el('a', { class: 'btn', href: '/admin/news', 'data-link': '/news' }, '← К списку'),
      )
    );
    content.appendChild(head);

    const autopostBox = el('div');
    content.appendChild(autopostBox);

    const grid = el('div', { class: 'form-grid' });
    const main = el('div', { class: 'form-main' });
    const side = el('div', { class: 'form-side' });
    grid.appendChild(main);
    grid.appendChild(side);
    content.appendChild(grid);

    // Main: title, slug, excerpt, content editor
    const titleInput = el('input', { type: 'text', placeholder: 'Заголовок новости', value: news?.title || '' });
    titleInput.className = 'title-input';
    main.appendChild(el('div', { class: 'field' }, el('label', {}, 'Заголовок'), titleInput));

    const slugInput = el('input', { type: 'text', placeholder: 'auto', value: news?.slug || '' });
    main.appendChild(el('div', { class: 'field' },
      el('label', {}, 'Slug'),
      slugInput,
      el('div', { class: 'hint' }, 'Пусто — сгенерируется из заголовка')
    ));

    const excerptInput = el('textarea', { rows: '3', placeholder: 'Краткое описание (если пусто — возьмётся из начала текста)' });
    excerptInput.value = news?.excerpt || '';
    main.appendChild(el('div', { class: 'field' }, el('label', {}, 'Краткое описание'), excerptInput));

    // WYSIWYG
    const editor = buildEditor(news?.content || '');
    main.appendChild(el('div', { class: 'field' }, el('label', {}, 'Текст новости'), editor.node));

    // Side
    // Cover
    const coverPicker = buildCoverPicker(news?.cover_image || '');
    side.appendChild(el('div', {}, el('h3', {}, 'Обложка'), coverPicker.node));

    const authorNameInput = el('input', { type: 'text', placeholder: 'Имя автора', value: news?.author_name || state.me.login || '' });
    const authorTitleInput = el('input', { type: 'text', placeholder: 'Должность / краткое описание', value: news?.author_title || '' });
    const authorPhotoPicker = buildCoverPicker(news?.author_photo || '');
    side.appendChild(el('div', { class: 'field' }, el('label', {}, 'Автор'), authorNameInput));
    side.appendChild(el('div', { class: 'field' }, el('label', {}, 'Должность автора'), authorTitleInput));
    side.appendChild(el('div', {}, el('h3', {}, 'Фото автора'), authorPhotoPicker.node));

    // Category
    const catSel = el('select', {}, ...categoryOptions(news?.category_id));
    side.appendChild(el('div', { class: 'field' }, el('label', {}, 'Рубрика'), catSel));

    // Status
    const statusSel = el('select', {},
      el('option', { value: 'draft' }, 'Черновик'),
      el('option', { value: 'published' }, 'Опубликовано')
    );
    statusSel.value = news?.status || 'draft';
    side.appendChild(el('div', { class: 'field' }, el('label', {}, 'Статус'), statusSel));

    // Breaking
    const breakingInput = el('input', { type: 'checkbox' });
    if (news?.is_breaking) breakingInput.checked = true;

    // Published at
    const pubDateInput = el('input', { type: 'datetime-local' });
    if (news?.published_at) {
      const d = new Date(news.published_at);
      if (!isNaN(d)) {
        const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        pubDateInput.value = iso;
      }
    }
    side.appendChild(el('div', { class: 'field' },
      el('label', {}, 'Дата публикации'),
      pubDateInput,
      el('div', { class: 'hint' }, 'Оставьте пустым для автоматической даты при публикации')
    ));

    const saveDraftBtn = el('button', { class: 'btn btn-full' }, 'Сохранить черновик');
    const publishBtn = el('button', { class: 'btn btn-primary btn-full' }, 'Опубликовать');
    const previewBtn = el('button', { class: 'btn btn-full' }, 'Предпросмотр');
    side.appendChild(saveDraftBtn);
    side.appendChild(publishBtn);
    side.appendChild(previewBtn);

    if (news?.id) {
      const viewLink = el('a', {
        class: 'btn btn-full',
        href: `/news/${news.slug}`,
        target: '_blank',
        rel: 'noopener'
      }, 'Открыть на сайте ↗');
      side.appendChild(viewLink);
    }

    async function saveNews(statusOverride, clickedBtn) {
      clickedBtn.disabled = true;
      const originalText = clickedBtn.textContent;
      clickedBtn.textContent = 'Сохранение…';
      autopostBox.innerHTML = '';

      const payload = {
        title: titleInput.value.trim(),
        slug: slugInput.value.trim(),
        excerpt: excerptInput.value,
        content: editor.getHTML(),
        cover_image: coverPicker.getUrl() || null,
        author_name: authorNameInput.value.trim(),
        author_title: authorTitleInput.value.trim(),
        author_photo: authorPhotoPicker.getUrl() || null,
        category_id: catSel.value || null,
        status: statusOverride || statusSel.value,
        is_breaking: breakingInput.checked,
        published_at: pubDateInput.value ? new Date(pubDateInput.value).toISOString() : null,
      };

      if (!payload.title) {
        toast('Введите заголовок', 'err');
        clickedBtn.disabled = false;
        clickedBtn.textContent = originalText;
        return;
      }

      try {
        let resp;
        if (news?.id) {
          resp = await api('PUT', `/api/news/${news.id}`, payload);
        } else {
          resp = await api('POST', '/api/news', payload);
        }
        toast('Сохранено');

        if (resp.autopost) renderAutopostStatus(autopostBox, resp.autopost);

        if (!news?.id && resp.id) {
          window.history.replaceState({}, '', `/admin/news/edit/${resp.id}`);
          // Перерендер, чтобы подгрузить актуальные данные
          render();
          return;
        }
      } catch (err) {
        toast(err.message, 'err');
      } finally {
        clickedBtn.disabled = false;
        clickedBtn.textContent = originalText;
      }
    }

    saveDraftBtn.addEventListener('click', () => saveNews('draft', saveDraftBtn));
    publishBtn.addEventListener('click', () => saveNews('published', publishBtn));
    previewBtn.addEventListener('click', () => openPreview({
      title: titleInput.value.trim(),
      excerpt: excerptInput.value,
      content: editor.getHTML(),
      cover: coverPicker.getUrl(),
      author: authorNameInput.value.trim(),
      authorTitle: authorTitleInput.value.trim(),
    }));
  };

  function openPreview(data) {
    const w = window.open('', '_blank');
    if (!w) return toast('Браузер заблокировал окно предпросмотра', 'err');
    w.document.write(`<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(data.title || 'Предпросмотр')}</title>
<style>
body{margin:0;background:#fff;color:#222;font-family:Arial,Helvetica,sans-serif}
main{max-width:720px;margin:36px auto;padding:0 16px}
h1{font-family:Georgia,"Times New Roman",serif;font-size:42px;line-height:1.08;margin:0 0 14px;color:#111}
.lead{font-family:Georgia,"Times New Roman",serif;font-size:21px;line-height:1.42;color:#4d4d4d;margin:0 0 16px}
.meta{border-top:1px solid #d9d9d9;border-bottom:1px solid #d9d9d9;padding:12px 0;margin:0 0 24px;color:#666;font-size:13px}
img.cover{width:100%;max-height:500px;object-fit:cover;margin:0 0 24px}
.body{font-family:Georgia,"Times New Roman",serif;font-size:20px;line-height:1.72}
.body p{margin:0 0 21px}.body blockquote{background:#f7f7f5;border-left:4px solid #111;margin:28px 0;padding:18px 20px}
.body table{width:100%;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:15px}.body td,.body th{border:1px solid #d9d9d9;padding:10px}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(data.title || 'Без заголовка')}</h1>
${data.excerpt ? `<p class="lead">${escapeHtml(data.excerpt)}</p>` : ''}
<div class="meta">Автор: ${escapeHtml(data.author || 'Редакция')}${data.authorTitle ? ` / ${escapeHtml(data.authorTitle)}` : ''}</div>
${data.cover ? `<img class="cover" src="${escapeHtml(data.cover)}" alt="">` : ''}
<div class="body">${stripDangerousHtml(data.content)}</div>
</main>
</body>
</html>`);
    w.document.close();
  }

  function renderAutopostStatus(container, ap) {
    const box = el('div', { class: 'autopost-status' });
    box.appendChild(el('div', { style: 'font-weight:600; margin-bottom:4px;' }, 'Автопостинг'));
    const renderRow = (name, result) => {
      const row = el('div', { class: 'autopost-row' });
      row.appendChild(el('span', { class: 'name' }, name));
      if (!result) {
        row.appendChild(el('span', { class: 'skipped' }, 'не вызван'));
      } else if (result.ok) {
        row.appendChild(el('span', { class: 'ok' }, '✓ отправлено' + (result.id ? ` (id ${result.id})` : '')));
      } else if (result.skipped) {
        row.appendChild(el('span', { class: 'skipped' }, '— пропущено: ' + (result.reason || '')));
      } else {
        row.appendChild(el('span', { class: 'err' }, '✕ ошибка: ' + (result.error || '')));
      }
      box.appendChild(row);
    };
    renderRow('VK', ap.vk);
    renderRow('TG', ap.tg);
    container.innerHTML = '';
    container.appendChild(box);
  }

  // ─── Cover picker ──────────────────────────────

  function buildCoverPicker(initialUrl) {
    let url = initialUrl || '';
    const node = el('div', { class: 'cover-picker' });
    const preview = el('div', { class: 'cover-preview' });
    node.appendChild(preview);
    const urlInput = el('input', { type: 'url', placeholder: 'URL изображения', value: url });
    const actions = el('div', { class: 'cover-actions' });
    const uploadBtn = el('label', { class: 'btn btn-sm' }, 'Загрузить файл');
    const fileInput = el('input', { type: 'file', accept: 'image/*', style: 'display:none;' });
    uploadBtn.appendChild(fileInput);
    const clearBtn = el('button', { class: 'btn btn-sm btn-ghost', type: 'button' }, 'Очистить');
    actions.appendChild(uploadBtn);
    actions.appendChild(clearBtn);
    node.appendChild(urlInput);
    node.appendChild(actions);

    function update(newUrl) {
      url = newUrl || '';
      urlInput.value = url;
      preview.innerHTML = '';
      if (url) preview.appendChild(el('img', { src: url, alt: '' }));
      else preview.appendChild(el('span', {}, 'Нет обложки'));
    }
    update(url);

    urlInput.addEventListener('input', () => update(urlInput.value));
    clearBtn.addEventListener('click', () => update(''));
    fileInput.addEventListener('change', async () => {
      if (!fileInput.files || !fileInput.files[0]) return;
      const fd = new FormData();
      fd.append('file', fileInput.files[0]);
      try {
        const resp = await api('POST', '/api/upload', fd, true);
        update(resp.url);
        toast('Файл загружен');
      } catch (e) { toast(e.message, 'err'); }
      fileInput.value = '';
    });

    return { node, getUrl: () => url };
  }

  // ─── WYSIWYG ───────────────────────────────────

  function buildEditor(initialHTML) {
    const wrap = el('div', { class: 'editor' });
    const toolbar = el('div', { class: 'editor-toolbar' });
    const content = el('div', {
      class: 'editor-content',
      contenteditable: 'true',
      'data-placeholder': 'Начните писать…',
    });
    content.innerHTML = initialHTML || '';

    const btn = (label, cmd, arg, extraClass) => {
      const b = el('button', { class: 'editor-btn' + (extraClass ? ' ' + extraClass : ''), type: 'button', title: label }, label);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => {
        document.execCommand(cmd, false, arg);
        content.focus();
      });
      return b;
    };

    toolbar.appendChild(btn('Ж', 'bold', null, 'b'));
    toolbar.appendChild(btn('К', 'italic', null, 'i'));
    toolbar.appendChild(btn('П', 'underline', null, 'u'));
    toolbar.appendChild(el('span', { class: 'editor-sep' }));
    toolbar.appendChild(btn('H2', 'formatBlock', 'H2'));
    toolbar.appendChild(btn('H3', 'formatBlock', 'H3'));
    toolbar.appendChild(btn('¶', 'formatBlock', 'P'));
    toolbar.appendChild(btn('❝', 'formatBlock', 'BLOCKQUOTE'));
    toolbar.appendChild(el('span', { class: 'editor-sep' }));
    toolbar.appendChild(btn('• Список', 'insertUnorderedList'));
    toolbar.appendChild(btn('1. Список', 'insertOrderedList'));
    toolbar.appendChild(el('span', { class: 'editor-sep' }));

    const tableBtn = el('button', { class: 'editor-btn', type: 'button', title: 'Таблица' }, 'Таблица');
    tableBtn.addEventListener('mousedown', (e) => e.preventDefault());
    tableBtn.addEventListener('click', () => {
      document.execCommand('insertHTML', false,
        '<table><thead><tr><th>Показатель</th><th>Значение</th></tr></thead><tbody><tr><td></td><td></td></tr><tr><td></td><td></td></tr></tbody></table><p><br></p>'
      );
      content.focus();
    });
    toolbar.appendChild(tableBtn);

    const linkBtn = el('button', { class: 'editor-btn', type: 'button', title: 'Ссылка' }, '🔗');
    linkBtn.addEventListener('mousedown', (e) => e.preventDefault());
    linkBtn.addEventListener('click', () => {
      const url = prompt('URL ссылки:', 'https://');
      if (!url) return;
      document.execCommand('createLink', false, url);
    });
    toolbar.appendChild(linkBtn);

    const unlinkBtn = el('button', { class: 'editor-btn', type: 'button', title: 'Убрать ссылку' }, '⛓');
    unlinkBtn.addEventListener('mousedown', (e) => e.preventDefault());
    unlinkBtn.addEventListener('click', () => document.execCommand('unlink'));
    toolbar.appendChild(unlinkBtn);

    toolbar.appendChild(el('span', { class: 'editor-sep' }));

    const imgBtn = el('button', { class: 'editor-btn', type: 'button', title: 'Изображение' }, '🖼');
    imgBtn.addEventListener('mousedown', (e) => e.preventDefault());
    imgBtn.addEventListener('click', () => {
      const choice = prompt('Вставьте URL картинки или оставьте пустым, чтобы загрузить файл:', '');
      if (choice === null) return;
      if (choice.trim()) {
        document.execCommand('insertImage', false, choice.trim());
      } else {
        const fileInput = el('input', { type: 'file', accept: 'image/*', style: 'display:none;' });
        document.body.appendChild(fileInput);
        fileInput.addEventListener('change', async () => {
          if (fileInput.files && fileInput.files[0]) {
            const fd = new FormData();
            fd.append('file', fileInput.files[0]);
            try {
              const resp = await api('POST', '/api/upload', fd, true);
              document.execCommand('insertImage', false, resp.url);
            } catch (e) { toast(e.message, 'err'); }
          }
          fileInput.remove();
        });
        fileInput.click();
      }
    });
    toolbar.appendChild(imgBtn);

    const clearBtn = el('button', { class: 'editor-btn', type: 'button', title: 'Очистить форматирование' }, '⌫');
    clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
    clearBtn.addEventListener('click', () => document.execCommand('removeFormat'));
    toolbar.appendChild(clearBtn);

    // Сохраняем табличную структуру при вставке из редакторов.
    content.addEventListener('paste', (e) => {
      e.preventDefault();
      const clip = e.clipboardData || window.clipboardData;
      const html = clip.getData('text/html');
      const text = clip.getData('text');
      document.execCommand(html ? 'insertHTML' : 'insertText', false, html || text);
    });

    wrap.appendChild(toolbar);
    wrap.appendChild(content);
    return {
      node: wrap,
      getHTML: () => content.innerHTML.trim(),
    };
  }

  // ─── Экран: рубрики ────────────────────────────

  screens.categories = async function (content) {
    content.appendChild(el('div', { class: 'page-head' }, el('h2', {}, 'Рубрики')));

    const panel = el('div', { class: 'panel' });
    content.appendChild(panel);

    // Форма добавления
    const addBar = el('div', { class: 'toolbar', style: 'margin-bottom:16px;' });
    const nameI = el('input', { type: 'text', placeholder: 'Название' });
    const slugI = el('input', { type: 'text', placeholder: 'slug (auto)' });
    const orderI = el('input', { type: 'number', placeholder: 'Порядок', value: '0', style: 'width:90px;' });
    const addBtn = el('button', { class: 'btn btn-primary' }, '+ Добавить');
    addBar.appendChild(nameI);
    addBar.appendChild(slugI);
    addBar.appendChild(orderI);
    addBar.appendChild(addBtn);
    content.insertBefore(addBar, panel);

    const reload = async () => {
      await (async () => {
        try {
          const data = await api('GET', '/api/categories');
          state.categories = data.categories || [];
        } catch (_) {}
      })();
      drawCats();
    };

    addBtn.addEventListener('click', async () => {
      if (!nameI.value.trim()) return toast('Введите название', 'err');
      try {
        await api('POST', '/api/categories', {
          name: nameI.value.trim(),
          slug: slugI.value.trim(),
          sort_order: Number(orderI.value) || 0,
        });
        nameI.value = ''; slugI.value = ''; orderI.value = '0';
        toast('Рубрика создана');
        reload();
      } catch (e) { toast(e.message, 'err'); }
    });

    function drawCats() {
      panel.innerHTML = '';
      if (!state.categories.length) {
        panel.appendChild(el('div', { class: 'empty-state' }, 'Пока нет рубрик'));
        return;
      }
      const table = el('table', { class: 'table' });
      table.appendChild(el('thead', {}, el('tr', {},
        el('th', {}, 'Название'),
        el('th', {}, 'Slug'),
        el('th', {}, 'Порядок'),
        el('th', {}, '')
      )));
      const tbody = el('tbody');
      for (const c of state.categories) {
        const nI = el('input', { type: 'text', value: c.name, style: 'width:100%;' });
        const sI = el('input', { type: 'text', value: c.slug, style: 'width:100%;' });
        const oI = el('input', { type: 'number', value: String(c.sort_order ?? 0), style: 'width:80px;' });
        const saveB = el('button', { class: 'btn btn-sm btn-primary' }, 'Сохранить');
        const delB = el('button', { class: 'btn btn-sm btn-danger' }, 'Удалить');
        saveB.addEventListener('click', async () => {
          try {
            await api('PUT', `/api/categories/${c.id}`, {
              name: nI.value.trim(),
              slug: sI.value.trim(),
              sort_order: Number(oI.value) || 0,
            });
            toast('Сохранено');
            reload();
          } catch (e) { toast(e.message, 'err'); }
        });
        delB.addEventListener('click', async () => {
          if (!confirm(`Удалить рубрику «${c.name}»? Новости в ней останутся без рубрики.`)) return;
          try {
            await api('DELETE', `/api/categories/${c.id}`);
            toast('Удалено');
            reload();
          } catch (e) { toast(e.message, 'err'); }
        });
        const actions = el('div', { class: 'actions' }, saveB, delB);
        const tr = el('tr', {},
          el('td', {}, nI),
          el('td', {}, sI),
          el('td', {}, oI),
          el('td', {}, actions)
        );
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      panel.appendChild(table);
    }

    drawCats();
  };

  // ─── Экран: админы ─────────────────────────────

  screens.admins = async function (content) {
    if (state.me.role !== 'owner') {
      content.appendChild(el('div', { class: 'empty-state' }, 'Управление доступно только владельцу'));
      return;
    }
    content.appendChild(el('div', { class: 'page-head' }, el('h2', {}, 'Администраторы')));

    const addBar = el('div', { class: 'toolbar' });
    const loginI = el('input', { type: 'text', placeholder: 'Логин' });
    const passI = el('input', { type: 'password', placeholder: 'Пароль' });
    const roleI = el('select', {},
      el('option', { value: 'author' }, 'Автор'),
      el('option', { value: 'owner' }, 'Владелец'),
    );
    const addBtn = el('button', { class: 'btn btn-primary' }, '+ Добавить');
    addBar.appendChild(loginI);
    addBar.appendChild(passI);
    addBar.appendChild(roleI);
    addBar.appendChild(addBtn);
    content.appendChild(addBar);

    const panel = el('div', { class: 'panel' });
    content.appendChild(panel);

    async function reload() {
      panel.innerHTML = '<div class="empty-state">Загрузка…</div>';
      try {
        const data = await api('GET', '/api/admins');
        drawAdmins(data.admins || []);
      } catch (err) {
        panel.innerHTML = '';
        panel.appendChild(el('div', { class: 'alert alert-error' }, err.message));
      }
    }

    addBtn.addEventListener('click', async () => {
      if (!loginI.value.trim() || !passI.value) return toast('Логин и пароль обязательны', 'err');
      try {
        await api('POST', '/api/admins', {
          login: loginI.value.trim(),
          password: passI.value,
          role: roleI.value,
        });
        loginI.value = ''; passI.value = ''; roleI.value = 'author';
        toast('Админ создан');
        reload();
      } catch (e) { toast(e.message, 'err'); }
    });

    function drawAdmins(rows) {
      panel.innerHTML = '';
      const table = el('table', { class: 'table' });
      table.appendChild(el('thead', {}, el('tr', {},
        el('th', {}, 'Логин'),
        el('th', {}, 'Новый пароль'),
        el('th', {}, 'Роль'),
        el('th', {}, 'Создан'),
        el('th', {}, '')
      )));
      const tbody = el('tbody');
      for (const a of rows) {
        const lI = el('input', { type: 'text', value: a.login, style: 'width:100%;' });
        const pI = el('input', { type: 'password', placeholder: '— не менять —', style: 'width:100%;' });
        const rI = el('select', {},
          el('option', { value: 'author' }, 'Автор'),
          el('option', { value: 'owner' }, 'Владелец'),
        );
        rI.value = a.role === 'owner' ? 'owner' : 'author';
        const saveB = el('button', { class: 'btn btn-sm btn-primary' }, 'Сохранить');
        const delB = el('button', { class: 'btn btn-sm btn-danger' }, 'Удалить');
        if (a.id === state.me.id) delB.disabled = true;
        saveB.addEventListener('click', async () => {
          const payload = { login: lI.value.trim(), role: rI.value };
          if (pI.value) payload.password = pI.value;
          try {
            await api('PUT', `/api/admins/${a.id}`, payload);
            toast('Сохранено');
            pI.value = '';
            reload();
          } catch (e) { toast(e.message, 'err'); }
        });
        delB.addEventListener('click', async () => {
          if (!confirm(`Удалить администратора «${a.login}»?`)) return;
          try {
            await api('DELETE', `/api/admins/${a.id}`);
            toast('Удалено');
            reload();
          } catch (e) { toast(e.message, 'err'); }
        });
        tbody.appendChild(el('tr', {},
          el('td', {}, lI),
          el('td', {}, pI),
          el('td', {}, rI),
          el('td', {}, fmtDate(a.created_at)),
          el('td', {}, el('div', { class: 'actions' }, saveB, delB))
        ));
      }
      table.appendChild(tbody);
      panel.appendChild(table);
    }

    reload();
  };

  // ─── Экран: настройки ─────────────────────────

  screens.settings = async function (content) {
    content.appendChild(el('div', { class: 'page-head' }, el('h2', {}, 'Настройки сайта')));
    let data;
    try {
      data = await api('GET', '/api/settings');
    } catch (err) {
      content.appendChild(el('div', { class: 'alert alert-error' }, err.message));
      return;
    }
    const s = data.settings || {};

    const sections = el('div', { class: 'settings-sections' });
    content.appendChild(sections);

    // Поля
    const inputs = {};
    const mkField = (key, label, opts = {}) => {
      const i = opts.textarea
        ? el('textarea', { rows: '2' })
        : el('input', { type: opts.type || 'text', placeholder: opts.placeholder || '' });
      i.value = s[key] || '';
      inputs[key] = i;
      return el('div', { class: 'field' }, el('label', {}, label), i, opts.hint ? el('div', { class: 'hint' }, opts.hint) : null);
    };

    // ─ Общее ─
    const gen = el('div', { class: 'settings-section' });
    gen.appendChild(el('h3', {}, 'Общее'));
    gen.appendChild(el('div', { class: 'desc' }, 'Название сайта, слоган и логотип'));
    gen.appendChild(el('div', { class: 'fields-row' },
      mkField('site_name', 'Название сайта'),
      mkField('site_tagline', 'Слоган')
    ));
    gen.appendChild(mkField('logo_text', 'Текст логотипа'));

    // logo image
    const logoPicker = buildCoverPicker(s.logo_image || '');
    gen.appendChild(el('div', { class: 'field' }, el('label', {}, 'Изображение логотипа'), logoPicker.node));

    sections.appendChild(gen);

    // ─ Соцсети ─
    const soc = el('div', { class: 'settings-section' });
    soc.appendChild(el('h3', {}, 'Соцсети'));
    soc.appendChild(el('div', { class: 'desc' }, 'Ссылки на официальные страницы'));
    soc.appendChild(el('div', { class: 'fields-row' },
      mkField('social_vk', 'ВКонтакте', { placeholder: 'https://vk.com/...' }),
      mkField('social_tg', 'Telegram', { placeholder: 'https://t.me/...' })
    ));
    soc.appendChild(el('div', { class: 'fields-row' },
      mkField('social_ok', 'Одноклассники', { placeholder: 'https://ok.ru/...' }),
      mkField('social_x', 'X (Twitter)', { placeholder: 'https://x.com/...' })
    ));
    sections.appendChild(soc);

    // ─ Автопостинг ─
    const ap = el('div', { class: 'settings-section' });
    ap.appendChild(el('h3', {}, 'Автопостинг'));
    ap.appendChild(el('div', { class: 'desc' }, 'Отправка опубликованных новостей в VK и Telegram'));

    const enI = el('input', { type: 'checkbox' });
    if (s.autopost_enabled === '1') enI.checked = true;
    ap.appendChild(el('div', { class: 'field' },
      el('label', { class: 'checkbox-row' }, enI, el('span', {}, 'Включить автопостинг'))
    ));

    ap.appendChild(el('div', { class: 'fields-row' },
      mkField('vk_access_token', 'VK access_token'),
      mkField('vk_group_id', 'VK group_id', { hint: 'Число без знака минус' })
    ));
    ap.appendChild(el('div', { class: 'fields-row' },
      mkField('tg_bot_token', 'Telegram bot_token'),
      mkField('tg_chat_id', 'Telegram chat_id', { hint: '@channelname или -100...' })
    ));
    sections.appendChild(ap);

    const actions = el('div', { style: 'margin-top: 16px; display: flex; gap: 8px; justify-content: flex-end;' });
    const saveBtn = el('button', { class: 'btn btn-primary' }, 'Сохранить настройки');
    actions.appendChild(saveBtn);
    sections.appendChild(actions);

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      const payload = {};
      for (const [k, i] of Object.entries(inputs)) payload[k] = i.value;
      payload.logo_image = logoPicker.getUrl();
      payload.autopost_enabled = enI.checked ? '1' : '0';
      try {
        await api('PUT', '/api/settings', payload);
        toast('Настройки сохранены');
      } catch (e) { toast(e.message, 'err'); }
      saveBtn.disabled = false;
    });
  };

})();


// Запуск после регистрации всех экранов
if (typeof window.__adminRender === 'function') window.__adminRender();
