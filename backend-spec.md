# ТЗ — Бэкенд для работы админ-панели

Документ описывает серверную часть, которая обеспечивает работу админки: авторизацию, CRUD-операции, загрузку файлов, настройки и автопостинг.

---

## 1. Архитектура

### 1.1. Стек

| Слой | Технология |
|------|------------|
| Рантайм | Node.js 18+ |
| HTTP-фреймворк | Express 4 |
| БД | SQLite (библиотека `better-sqlite3`, синхронный драйвер) |
| Сессии | `express-session` (MemoryStore) |
| Хэш паролей | `bcryptjs` |
| Загрузка файлов | `multer` (v2) |
| Slug | `slugify` + собственная кириллическая транслитерация |
| Переменные окружения | `dotenv` |

### 1.2. Принципы

- Админка — SPA на ванильном JS. Общается с бэкендом через REST (`/api/*`).
- Публичная часть — server-side rendering (собирается в виде строк).
- Все защищённые эндпоинты требуют сессионную cookie.
- БД — один файл `data/news.sqlite`, миграции и сид запускаются при старте.

---

## 2. Структура БД

### 2.1. `admins`
| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INTEGER PK | |
| `login` | TEXT UNIQUE | логин |
| `password_hash` | TEXT | bcrypt-хэш |
| `role` | TEXT | `owner` \| `editor` |
| `created_at` | TEXT | ISO |

### 2.2. `categories`
| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INTEGER PK | |
| `name` | TEXT | название |
| `slug` | TEXT UNIQUE | url-идентификатор |
| `sort_order` | INTEGER | порядок отображения |
| `created_at` | TEXT | |

### 2.3. `news`
| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INTEGER PK | |
| `title` | TEXT | заголовок |
| `slug` | TEXT UNIQUE | |
| `excerpt` | TEXT | краткое описание |
| `content` | TEXT | HTML из WYSIWYG |
| `cover_image` | TEXT | URL обложки |
| `category_id` | INTEGER FK | → categories.id |
| `author_id` | INTEGER FK | → admins.id |
| `status` | TEXT | `draft` \| `published` |
| `is_breaking` | INTEGER | 0/1 — срочная |
| `views` | INTEGER | счётчик просмотров |
| `published_at` | TEXT | ISO, ставится при публикации |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

Индексы: `(status, published_at DESC)`, `(category_id)`.

### 2.4. `settings` (key-value)
Ключи: `site_name`, `site_tagline`, `logo_text`, `logo_image`, `social_vk`, `social_tg`, `social_ok`, `social_x`, `vk_access_token`, `vk_group_id`, `tg_bot_token`, `tg_chat_id`, `autopost_enabled`.

---

## 3. Авторизация

### 3.1. Модель

- Сессии в cookie (`express-session`), httpOnly, sameSite=lax, TTL 7 дней.
- Пароли только в виде bcrypt-хэша (10 rounds).
- Роли:
  - `owner` — полный доступ + управление администраторами;
  - `editor` — всё кроме управления администраторами.

### 3.2. Первичный админ

При первом старте, если в `admins` пусто, создаётся админ из переменных окружения:
```
INITIAL_ADMIN_LOGIN=admin
INITIAL_ADMIN_PASSWORD=admin123
```

### 3.3. Middleware

| Middleware | Поведение |
|------------|-----------|
| `requireAuth` | 401, если нет `req.session.admin` |
| `requireOwner` | 403, если роль не `owner` |

---

## 4. REST API

Все ответы — JSON. Ошибки — `{ "error": "<сообщение>" }` + HTTP статус.

### 4.1. Auth

| Метод | Путь | Авторизация | Описание |
|-------|------|-------------|----------|
| POST | `/api/auth/login` | — | `{ login, password }` → `{ ok, admin }` или 401 |
| POST | `/api/auth/logout` | — | завершает сессию |
| GET  | `/api/auth/me` | — | `{ admin }` или `{ admin: null }` |

### 4.2. Categories

| Метод | Путь | Авторизация |
|-------|------|-------------|
| GET | `/api/categories` | public |
| POST | `/api/categories` | auth |
| PUT | `/api/categories/:id` | auth |
| DELETE | `/api/categories/:id` | auth |

Поля: `name`, `slug` (авто из name), `sort_order`.

### 4.3. News

| Метод | Путь | Авторизация | Описание |
|-------|------|-------------|----------|
| GET | `/api/news` | auth | фильтры: `status`, `category_id`, `q`, `page`, `limit` |
| GET | `/api/news/:id` | auth | |
| POST | `/api/news` | auth | создание |
| PUT | `/api/news/:id` | auth | обновление |
| DELETE | `/api/news/:id` | auth | |

Поля при создании/обновлении: `title`, `slug`, `excerpt`, `content`, `cover_image`, `category_id`, `status`, `is_breaking`, `published_at`.

Автоповедение:
- Slug — из `title` через транслитерацию + `slugify`. Уникальность обеспечивается суффиксом `-2`, `-3`, ...
- `excerpt` — если пустой, берутся первые 200 символов `stripHtml(content)`.
- `published_at` — ставится автоматически при публикации, если не задан.
- При переходе в `published` (и при создании со статусом `published`) — вызывается автопостинг.

Ответ при создании/обновлении:
```json
{
  "ok": true,
  "id": 123,
  "autopost": {
    "vk": { "ok": true, "id": 12345 },
    "tg": { "ok": false, "skipped": true, "reason": "tg not configured" }
  }
}
```

### 4.4. Uploads

| Метод | Путь | Авторизация |
|-------|------|-------------|
| POST | `/api/upload` | auth, `multipart/form-data`, поле `file` |

- Принимаются только изображения (`mimetype` начинается с `image/`).
- Лимит: 10 MB.
- Имя файла: `{timestamp}-{rand}.{ext}`.
- Папка: `uploads/`, раздаётся как статика на `/uploads/...`.
- Ответ: `{ ok: true, url: "/uploads/...ext" }`.

### 4.5. Settings

| Метод | Путь | Авторизация |
|-------|------|-------------|
| GET | `/api/settings` | auth |
| PUT | `/api/settings` | auth |

PUT принимает только известный список ключей (whitelist) — остальное игнорируется.

### 4.6. Admins (только owner)

| Метод | Путь |
|-------|------|
| GET | `/api/admins` |
| POST | `/api/admins` |
| PUT | `/api/admins/:id` |
| DELETE | `/api/admins/:id` |

Правила:
- Нельзя удалить самого себя.
- Нельзя удалить последнего `owner`.
- Пароль при PUT — только если пришёл в теле.

---

## 5. Автопостинг

### 5.1. Триггеры

- `POST /api/news` со `status = 'published'`.
- `PUT /api/news/:id` с переходом `draft → published`.

### 5.2. Логика

```
url = SITE_URL + "/news/" + slug
text = title + "\n\n" + url
```

Если `autopost_enabled != '1'` — обе сети пропускаются.

### 5.3. ВКонтакте

Запрос: `GET https://api.vk.com/method/wall.post`

Параметры:
- `owner_id` = `-{vk_group_id}` (минус в начале)
- `from_group=1`
- `message` = текст
- `attachments` = url (VK сам превратит в карточку со ссылкой)
- `access_token` = `vk_access_token`
- `v=5.199`

Результат: `{ ok: true, id }` или `{ ok: false, error }` / `{ ok: false, skipped: true }`.

### 5.4. Telegram

Запрос: `POST https://api.telegram.org/bot{token}/sendMessage`

Тело:
```json
{
  "chat_id": "{tg_chat_id}",
  "text": "<b>{title}</b>\n\n{url}",
  "parse_mode": "HTML",
  "disable_web_page_preview": false
}
```

### 5.5. Поведение при ошибках

- Ошибка автопостинга не ломает сохранение новости.
- Результат возвращается клиенту в поле `autopost`.
- Админка показывает статус: «отправлено» / «пропущено (не настроено)» / «ошибка — причина».

---

## 6. Безопасность

- Все пароли — только bcrypt.
- Сессия — httpOnly cookie.
- Экранирование HTML в `layout.js` и шаблонах публичной части (функция `escapeHtml`).
- Контент из WYSIWYG считается доверенным (редактирует админ). Для антифишинга в проде желательно прогонять через sanitizer — вне текущего ТЗ.
- Multer проверяет `mimetype image/*` и ограничивает размер.
- `/admin` и `/api` закрыты от индексации в `robots.txt`.

---

## 7. Переменные окружения

```
PORT=3000
SITE_URL=http://localhost:3000
SESSION_SECRET=...
INITIAL_ADMIN_LOGIN=admin
INITIAL_ADMIN_PASSWORD=admin123
```

Все VK/Telegram-секреты хранятся в БД (таблица `settings`) и настраиваются через админку.

---

## 8. Структура проекта (серверная часть)

```
server.js                 — точка входа, init Express, сессии, роуты
src/
  db.js                   — инициализация БД, миграции, сиды
  utils.js                — slug, экранирование, даты
  settings.js             — работа с key-value настройками
  autopost.js             — VK + Telegram
  routes/
    api.js                — REST API
    public.js             — публичные страницы + robots/sitemap
    admin.js              — отдача SPA-оболочки админки
  views/
    layout.js             — HTML-layout публичной части
```

---

## 9. Критерии приёмки (бэкенд)

- [ ] Сервер стартует по `npm start`, слушает порт из `.env`.
- [ ] При пустой БД создаётся админ и 5 стандартных рубрик.
- [ ] Авторизация работает, неверный пароль → 401.
- [ ] Эндпоинты `/api/news` защищены от неавторизованных.
- [ ] Создание новости со `status=published` триггерит автопостинг.
- [ ] При пустых токенах автопостинг корректно пропускается (`skipped: true`).
- [ ] Upload принимает только изображения, лимит 10 MB.
- [ ] Slug для кириллического заголовка получается читаемым (транслит).
- [ ] Нельзя удалить последнего owner и самого себя.
