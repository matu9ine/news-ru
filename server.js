require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const { init: initDb } = require('./src/db');
const { SQLiteSessionStore } = require('./src/session-store');

initDb();

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use(
  session({
    name: 'editorial.sid',
    secret: process.env.SESSION_SECRET || 'dev-secret',
    store: new SQLiteSessionStore(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// Статика
app.use('/static', express.static(path.join(__dirname, 'public', 'static'), { maxAge: '7d' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '30d' }));
app.use('/admin/static', express.static(path.join(__dirname, 'admin', 'static'), { maxAge: '7d' }));

// API
app.use('/api', require('./src/routes/api'));

// Админ SPA
app.use('/admin', require('./src/routes/admin'));

// Публичная часть + robots/sitemap + 404 (в самом конце)
app.use('/', require('./src/routes/public'));

// Общий обработчик ошибок
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (req.path.startsWith('/api')) {
    return res.status(500).json({ error: err.message || 'Внутренняя ошибка' });
  }
  res.status(500).send('Внутренняя ошибка сервера');
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
  console.log(`[admin]  http://localhost:${PORT}/admin`);
});
