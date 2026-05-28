# Деплой и эксплуатация

## Переменные окружения

Для продакшена в `.env`:

```env
NODE_ENV=production
PORT=3000
SITE_URL=https://your-domain.ru
SESSION_SECRET=<длинная случайная строка>
INITIAL_ADMIN_LOGIN=admin
INITIAL_ADMIN_PASSWORD=<сложный пароль>
```

`SESSION_SECRET` должен быть уникальным и длинным. После первого запуска смените пароль владельца в админке.

## Запуск на сервере

Рекомендуемый вариант для VPS:

```bash
npm ci --omit=dev
npm install -g pm2
pm2 start server.js --name kaspiyskiy-kurier
pm2 save
pm2 startup
```

Домен и SSL лучше закрывать через Nginx:

```nginx
server {
  server_name your-domain.ru www.your-domain.ru;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

SSL можно выпустить через `certbot`.

## Бэкапы

Локально или на сервере:

```powershell
npm run backup
```

Скрипт создаёт папку `backups/<дата>` и копирует:

- `data/news.sqlite`
- архив `uploads.zip`

Для продакшена поставьте ежедневный запуск по расписанию и периодически скачивайте бэкапы с сервера.

## Автопостинг

Код автопостинга готов. Когда появятся токены:

1. Зайдите в `/admin`.
2. Откройте `Настройки`.
3. Включите автопостинг.
4. Заполните:
   - `VK access_token`
   - `VK group_id`
   - `Telegram bot_token`
   - `Telegram chat_id`
5. Опубликуйте тестовую новость и проверьте VK/Telegram.

Если токены пустые, публикация новости не ломается, автопостинг просто пропускается.

## Что уже учтено

- SQLite работает в WAL-режиме.
- Публичные ленты постраничные.
- Поиск использует FTS5, если он доступен в SQLite.
- Загружаемые изображения конвертируются в WebP.
- Сессии хранятся в SQLite, а не в памяти Node.js.
- В админке есть CSRF-защита и ограничение попыток входа.
- Публичные ленты кешируются на короткое время и сбрасываются при изменении контента.
