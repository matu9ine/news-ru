# Что реализовано

Документ фиксирует фактическое состояние проекта — какие функции есть, какие файлы за что отвечают, какие ручки и как работают.

---

## 1. Публичная часть

### 1.1. Страницы

| URL | Описание |
|-----|----------|
| `/` | Главная: hero, лента, «срочные», «популярное», карточки рубрик |
| `/category/:slug` | Страница рубрики: заголовок + лента рубрики |
| `/news/:slug` | Страница новости: обложка, текст, «Читайте также», schema.org `NewsArticle` |
| `/search?q=...` | Страница поиска + форма |
| `/robots.txt` | `Allow: /`, закрыты `/admin` и `/api`, ссылка на sitemap |
| `/sitemap.xml` | Главная, все рубрики, все опубликованные новости |

### 1.2. Компоненты интерфейса

- **Sticky header** с логотипом, рубриками, датой, иконкой поиска.
- **Раскрывающийся поиск** с live-подсказками (`/api/public/search`).
- **Бегущая строка срочных новостей** — красная полоса, CSS-анимация.
- **Hero-новость** — сетка 2/3 + 1/3, hover-zoom картинки.
- **Лента** — hover: сдвиг вправо + красная полоса слева.
- **Сайдбар «Популярное»** — топ-5 по `views`, sticky.
- **Карточки рубрик** — по 3 последние новости каждой.
- **Адаптив**: 3 → 2 → 1 колонка; на мобилке — бургер-меню, увеличенные зоны клика; hero меняет порядок (текст перед картинкой).

### 1.3. SEO

- `<title>`, `meta description`, canonical.
- OpenGraph: `og:title`, `og:description`, `og:image`, `og:site_name`, `og:type=article`.
- Twitter: `summary_large_image`.
- JSON-LD `NewsArticle` на странице новости (headline, description, datePublished, image, publisher).

### 1.4. Ассеты

- `public/static/style.css` — вся публичная вёрстка в одном файле (CSS-переменные, минимализм).
- `public/static/app.js` — бургер, раскрытие поиска, live-поиск с debounce.
- `public/static/favicon.svg` — красный квадрат + буква «N».

---

## 2. Админка (SPA)

Точка входа: `/admin` → отдаёт `admin/index.html`. Роутинг и UI — `admin/static/admin.js`. Стили — `admin/static/admin.css`.

### 2.1. Маршруты SPA

| URL | Экран |
|-----|-------|
| `/admin/login` | Форма входа |
| `/admin/news` | Список новостей + фильтры |
| `/admin/news/new` | Создание новости |
| `/admin/news/edit/:id` | Редактирование |
| `/admin/categories` | Список + inline-редактирование рубрик |
| `/admin/admins` | Управление администраторами (только owner) |
| `/admin/settings` | Настройки сайта + автопостинга |

### 2.2. Новости — экран редактирования

- Поля: заголовок, краткое описание, контент (WYSIWYG), обложка, рубрика, статус, «срочная», slug, дата публикации.
- Обложка: загрузка файла (через `/api/upload`) или ручной URL.
- После сохранения показывается статус автопостинга (VK / Telegram: отправлено / пропущено / ошибка).
- При создании новой новости после сохранения URL меняется на `/admin/news/edit/:id`.

### 2.3. WYSIWYG-редактор

Собственный, на `contenteditable`, без сторонних библиотек.

Кнопки:
- **Жирный / Курсив / Подчёркнутый** (`execCommand bold|italic|underline`).
- **H2 / H3 / абзац / цитата** (`formatBlock`).
- **Маркированный / нумерованный список**.
- **Ссылка** (prompt для URL) и **убрать ссылку**.
- **Изображение** — либо загрузка через `/api/upload`, либо вставка URL.
- **Очистить форматирование**.
- Paste без форматирования (чистый текст).

### 2.4. Рубрики

- Добавление (название, slug, порядок).
- Inline-редактирование в таблице.
- Удаление (с confirm).

### 2.5. Администраторы (только owner)

- Добавление (логин, пароль, роль).
- Inline-редактирование (включая смену пароля).
- Удаление с защитой: нельзя удалить себя и нельзя удалить последнего owner.
- Если зашёл не owner — показывается сообщение «Управление доступно только владельцу».

### 2.6. Настройки

- **Общее**: название, слоган, текст логотипа, изображение логотипа (с загрузкой).
- **Соцсети**: VK, TG, OK, X (ссылки).
- **Автопостинг**: чекбокс вкл/выкл, токены VK (access token + group id), токены Telegram (bot token + chat id).

---

## 3. Бэкенд — фактическая реализация

### 3.1. Файлы

```
server.js                 — стартует Express, init БД, подключает роуты
src/db.js                 — SQLite + миграции + сиды
src/utils.js              — makeSlug (с транслитом), escapeHtml, stripHtml, formatDateRu
src/settings.js           — getAllSettings / setSettings
src/autopost.js           — postToVK, postToTelegram, autopost
src/routes/api.js         — все REST-эндпоинты
src/routes/public.js      — публичные страницы
src/routes/admin.js       — отдаёт admin/index.html для /admin/*
src/views/layout.js       — layout публичной части (header, footer, seo-мета)
```

### 3.2. БД (SQLite)

Файл `data/news.sqlite` создаётся автоматически при первом запуске. При старте:

- Создаются таблицы: `admins`, `categories`, `news`, `settings`.
- Создаются индексы на `news.status + published_at` и `news.category_id`.
- В `settings` записываются дефолтные значения (название сайта и т. п.), если их ещё нет.
- Если нет ни одной рубрики — создаются 5 стандартных (Политика, Общество, Технологии, Экономика, Мир).
- Если нет ни одного админа — создаётся из `INITIAL_ADMIN_LOGIN` / `INITIAL_ADMIN_PASSWORD` (роль `owner`).

### 3.3. REST API — все эндпоинты

**Auth**
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET  /api/auth/me`

**Categories**
- `GET    /api/categories` (public)
- `POST   /api/categories` (auth)
- `PUT    /api/categories/:id` (auth)
- `DELETE /api/categories/:id` (auth)

**News**
- `GET    /api/news` (auth) — с фильтрами `status`, `category_id`, `q`, `page`, `limit`
- `GET    /api/news/:id` (auth)
- `POST   /api/news` (auth) — автопостинг если `status=published`
- `PUT    /api/news/:id` (auth) — автопостинг если был `draft`, стал `published`
- `DELETE /api/news/:id` (auth)

**Public search**
- `GET /api/public/search?q=...` — для live-поиска в шапке

**Uploads**
- `POST /api/upload` (auth, multipart)

**Settings**
- `GET /api/settings` (auth)
- `PUT /api/settings` (auth) — whitelist ключей

**Admins (только owner)**
- `GET    /api/admins`
- `POST   /api/admins`
- `PUT    /api/admins/:id`
- `DELETE /api/admins/:id`

### 3.4. Slug и транслитерация

`makeSlug()` пропускает текст через собственную кириллическую транслитерацию (а → a, ж → zh, щ → shch, ...) и далее через `slugify` с `strict: true`. Уникальность slug в `news` обеспечивается `ensureUniqueSlug()` — при коллизии добавляется суффикс `-2`, `-3` и т. д.

### 3.5. Автопостинг

Функция `autopost(news, siteUrl)` в `src/autopost.js`:
- Формирует `url = siteUrl + /news/ + slug`.
- В параллели вызывает `postToVK` и `postToTelegram` через `Promise.all`.
- Если токены/ids пустые — возвращает `{ ok: false, skipped: true, reason }`.
- Ошибки не ломают сохранение новости — возвращаются клиенту в поле `autopost` ответа.

**VK**: `GET https://api.vk.com/method/wall.post` с `owner_id=-{group_id}`, `from_group=1`, `attachments=url`.

**Telegram**: `POST https://api.telegram.org/bot{token}/sendMessage` с `parse_mode=HTML`, текст `<b>title</b>\n\nurl`.

### 3.6. Загрузка файлов

- Multer, `diskStorage`, папка `uploads/`.
- Имя: `{Date.now()}-{rand}.{ext}`.
- Фильтр: только `image/*`.
- Лимит: 10 MB.
- Раздаётся Express-ом как `/uploads/*`.

---

## 4. Конфигурация и запуск

```bash
npm install
cp .env.example .env      # настроить, если нужно
npm start                 # http://localhost:3000
```

Админка: `http://localhost:3000/admin`.
Первичный вход: `admin` / `admin123` (задаётся в `.env`).

---

## 5. Известные особенности / что вне ТЗ

- **Санитизация HTML из WYSIWYG**: контент сохраняется как есть. Админ — доверенный пользователь. Для публичного сайта в проде стоит добавить `sanitize-html` в `POST /api/news`.
- **MemoryStore сессий**: `express-session` в дефолтной конфигурации теряет сессии при рестарте. Для прод-нагрузки — заменить на Redis/файловый store.
- **Rate-limiting и brute-force защита** не реализованы. Если админка открыта в интернете — добавить `express-rate-limit` на `/api/auth/login`.
- **Часовой пояс**: даты в БД — ISO UTC; на публичной части форматируются через `toLocaleString` браузера.
- **Фильтр по дате** в рубрике из ТЗ (пункт «Доп» для страницы рубрики) — не реализован в текущей версии. Лента рубрики сортируется по `published_at DESC`, лимит 50 записей.

---

## 6. Критерии приёмки — статус

| Требование из ТЗ | Статус |
|------------------|--------|
| Главная: hero, лента, срочные, популярное, блоки рубрик | ✅ |
| Страница рубрики | ✅ |
| Страница новости + читайте также | ✅ |
| Поиск (страница + live) | ✅ |
| Адаптив (3/2/1 колонки, бургер) | ✅ |
| Админка: CRUD новостей + WYSIWYG | ✅ |
| Админка: CRUD рубрик | ✅ |
| Админка: управление админами + роли | ✅ |
| Настройки сайта: название, логотип, соцсети | ✅ |
| Автопостинг VK | ✅ |
| Автопостинг Telegram | ✅ |
| SEO: title, description, OpenGraph, schema.org | ✅ |
| robots.txt, sitemap.xml | ✅ |
| Favicon SVG | ✅ |
| Начальные новости | ⬜ (по ТЗ — не создавать) |
| Фильтр по дате на странице рубрики | ⬜ (не реализован) |
