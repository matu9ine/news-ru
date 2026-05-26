# Цифровая редакция

Новостной сайт с админ-панелью. Публичная часть + админка на Node.js + SQLite, без фреймворков на фронте.

## Запуск

```bash
npm install
cp .env.example .env     # при необходимости отредактируйте
npm start
```

- Публичная часть: http://localhost:3000
- Админка: http://localhost:3000/admin
- Первичный вход: `admin` / `admin123` (меняется в `.env`)

При первом запуске автоматически создаются:

- БД `data/news.sqlite`
- Пять стандартных рубрик (Политика, Общество, Технологии, Экономика, Мир)
- Админ-владелец из `INITIAL_ADMIN_LOGIN` / `INITIAL_ADMIN_PASSWORD`

## Что внутри

Публичная часть (`/`):
- главная с hero, лентой, популярным, блоками по рубрикам, бегущей строкой срочных
- страница рубрики `/category/:slug`
- страница новости `/news/:slug` с schema.org NewsArticle
- поиск `/search` + live-поиск в шапке
- адаптив 3 → 2 → 1 колонка, бургер на мобиле
- SEO: title, description, OpenGraph, Twitter card, canonical
- `robots.txt`, `sitemap.xml`, `favicon.svg`

Админка (`/admin`):
- вход, роли owner / editor
- CRUD новостей с WYSIWYG-редактором и загрузкой обложек
- CRUD рубрик
- управление администраторами (только owner)
- настройки сайта (название, логотип, соцсети)
- настройки автопостинга VK и Telegram

Автопостинг при публикации новости:
- `wall.post` в VK
- `sendMessage` в Telegram
- если токены пустые — шаг пропускается без ошибки

## Структура

```
server.js                 точка входа
src/
  db.js                   SQLite + миграции + сиды
  utils.js                slug, транслит, escapeHtml, даты
  settings.js             работа с настройками
  autopost.js             VK + Telegram
  routes/
    api.js                REST API
    public.js             публичные страницы, robots, sitemap
    admin.js              отдача SPA-оболочки админки
  views/
    layout.js             общий HTML-шаблон публички
public/static/            публичные стили, JS, favicon
admin/                    HTML + JS + CSS админки
data/                     SQLite (создаётся при старте)
uploads/                  загруженные изображения
```

## Переменные окружения

```
PORT=3000
SITE_URL=http://localhost:3000
SESSION_SECRET=<секрет для сессий>
INITIAL_ADMIN_LOGIN=admin
INITIAL_ADMIN_PASSWORD=admin123
```

Токены VK и Telegram задаются через админку, не в `.env`.

## Примечания

- WYSIWYG сохраняет HTML как есть. Админ — доверенный пользователь. В проде имеет смысл подключить `sanitize-html` в `POST /api/news`.
- Сессии хранятся в `MemoryStore` и теряются при рестарте. Для прод-нагрузки — замените на файловый store или Redis.
- Rate-limiting на логин не реализован. Для публичного интернета добавьте `express-rate-limit` на `/api/auth/login`.
# news-ru
# news-ru
# news-ru
