const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { db } = require('../db');
const { makeSlug, stripHtml } = require('../utils');
const { getAllSettings, setSettings } = require('../settings');
const { autopost } = require('../autopost');

const router = express.Router();

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ error: 'Требуется авторизация' });
}

function requireOwner(req, res, next) {
  if (req.session && req.session.admin && req.session.admin.role === 'owner') return next();
  return res.status(403).json({ error: 'Доступ только для владельца' });
}

// ─────────────────────────────────────────────
// Uploads
// ─────────────────────────────────────────────

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10);
    const rand = Math.random().toString(36).slice(2, 10);
    cb(null, `${Date.now()}-${rand}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Разрешены только изображения'));
    }
    cb(null, true);
  },
});

router.post('/upload', requireAuth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Ошибка загрузки' });
    if (!req.file) return res.status(400).json({ error: 'Файл не получен' });
    res.json({ ok: true, url: `/uploads/${req.file.filename}` });
  });
});

// ─────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────

router.post('/auth/login', (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) return res.status(400).json({ error: 'Логин и пароль обязательны' });
  const admin = db.prepare('SELECT * FROM admins WHERE login = ?').get(login);
  if (!admin) return res.status(401).json({ error: 'Неверный логин или пароль' });
  if (!bcrypt.compareSync(password, admin.password_hash))
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  req.session.admin = { id: admin.id, login: admin.login, role: admin.role };
  res.json({
    ok: true,
    admin: { id: admin.id, login: admin.login, role: admin.role },
  });
});

router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/auth/me', (req, res) => {
  res.json({ admin: (req.session && req.session.admin) || null });
});

// ─────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────

router.get('/categories', (req, res) => {
  const cats = db
    .prepare('SELECT * FROM categories ORDER BY sort_order ASC, id ASC')
    .all();
  res.json({ categories: cats });
});

router.post('/categories', requireAuth, (req, res) => {
  const { name, slug, sort_order } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Название обязательно' });
  const finalSlug = ensureUniqueCategorySlug(slug || makeSlug(name));
  const info = db
    .prepare('INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?)')
    .run(String(name).trim(), finalSlug, Number(sort_order) || 0);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.put('/categories/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!cat) return res.status(404).json({ error: 'Рубрика не найдена' });
  const { name, slug, sort_order } = req.body || {};
  const newName = name != null ? String(name).trim() : cat.name;
  let newSlug = slug != null ? String(slug).trim() : cat.slug;
  if (!newSlug) newSlug = makeSlug(newName);
  if (newSlug !== cat.slug) newSlug = ensureUniqueCategorySlug(newSlug, id);
  const newOrder = sort_order != null ? Number(sort_order) : cat.sort_order;
  db.prepare(
    'UPDATE categories SET name = ?, slug = ?, sort_order = ? WHERE id = ?'
  ).run(newName, newSlug, newOrder, id);
  res.json({ ok: true });
});

router.delete('/categories/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE news SET category_id = NULL WHERE category_id = ?').run(id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ ok: true });
});

function ensureUniqueCategorySlug(base, excludeId) {
  let slug = makeSlug(base);
  let i = 2;
  const stmt = db.prepare(
    'SELECT id FROM categories WHERE slug = ? AND (? IS NULL OR id != ?)'
  );
  while (stmt.get(slug, excludeId ?? null, excludeId ?? 0)) {
    slug = `${makeSlug(base)}-${i++}`;
  }
  return slug;
}

// ─────────────────────────────────────────────
// News
// ─────────────────────────────────────────────

function ensureUniqueNewsSlug(base, excludeId) {
  let slug = makeSlug(base);
  let i = 2;
  const stmt = db.prepare(
    'SELECT id FROM news WHERE slug = ? AND (? IS NULL OR id != ?)'
  );
  while (stmt.get(slug, excludeId ?? null, excludeId ?? 0)) {
    slug = `${makeSlug(base)}-${i++}`;
  }
  return slug;
}

router.get('/news', requireAuth, (req, res) => {
  const status = req.query.status || '';
  const categoryId = req.query.category_id ? Number(req.query.category_id) : null;
  const q = req.query.q ? String(req.query.q).trim() : '';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const offset = (page - 1) * limit;

  const where = ['1=1'];
  const params = {};
  if (status) {
    where.push('n.status = @status');
    params.status = status;
  }
  if (categoryId) {
    where.push('n.category_id = @categoryId');
    params.categoryId = categoryId;
  }
  if (q) {
    where.push('(n.title LIKE @q OR n.excerpt LIKE @q)');
    params.q = `%${q}%`;
  }
  params.limit = limit;
  params.offset = offset;

  const rows = db
    .prepare(
      `SELECT n.id, n.title, n.slug, n.status, n.is_breaking, n.views,
              n.published_at, n.created_at, n.updated_at, n.cover_image,
              c.name AS category_name, c.id AS category_id
       FROM news n LEFT JOIN categories c ON c.id = n.category_id
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(n.published_at, n.created_at) DESC
       LIMIT @limit OFFSET @offset`
    )
    .all(params);

  const total = db
    .prepare(
      `SELECT COUNT(*) AS c FROM news n WHERE ${where.join(' AND ')}`
    )
    .get(params).c;

  res.json({ news: rows, total, page, limit });
});

router.get('/news/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const n = db
    .prepare(
      `SELECT n.*, c.name AS category_name
       FROM news n LEFT JOIN categories c ON c.id = n.category_id
       WHERE n.id = ?`
    )
    .get(id);
  if (!n) return res.status(404).json({ error: 'Новость не найдена' });
  res.json({ news: n });
});

router.post('/news', requireAuth, async (req, res) => {
  const body = req.body || {};
  const title = String(body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Заголовок обязателен' });

  const slug = ensureUniqueNewsSlug(body.slug || title);
  const content = body.content || '';
  const excerpt = body.excerpt
    ? String(body.excerpt)
    : stripHtml(content).slice(0, 200);
  const coverImage = body.cover_image || null;
  const categoryId = body.category_id ? Number(body.category_id) : null;
  const status = body.status === 'published' ? 'published' : 'draft';
  const isBreaking = body.is_breaking ? 1 : 0;

  let publishedAt = body.published_at || null;
  if (status === 'published' && !publishedAt) {
    publishedAt = new Date().toISOString();
  }

  const info = db
    .prepare(
      `INSERT INTO news
       (title, slug, excerpt, content, cover_image, category_id, author_id,
        status, is_breaking, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(
      title,
      slug,
      excerpt,
      content,
      coverImage,
      categoryId,
      req.session.admin.id,
      status,
      isBreaking,
      publishedAt
    );

  let autopostResult = null;
  if (status === 'published') {
    autopostResult = await autopost(
      { title, slug },
      process.env.SITE_URL || ''
    );
  }

  res.json({ ok: true, id: info.lastInsertRowid, autopost: autopostResult });
});

router.put('/news/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM news WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Новость не найдена' });

  const body = req.body || {};
  const title = body.title != null ? String(body.title).trim() : existing.title;
  if (!title) return res.status(400).json({ error: 'Заголовок обязателен' });

  let slug = body.slug != null ? String(body.slug).trim() : existing.slug;
  if (!slug) slug = makeSlug(title);
  if (slug !== existing.slug) slug = ensureUniqueNewsSlug(slug, id);

  const content = body.content != null ? body.content : existing.content;
  const excerpt =
    body.excerpt != null
      ? String(body.excerpt)
      : existing.excerpt || stripHtml(content || '').slice(0, 200);

  const coverImage =
    body.cover_image !== undefined ? body.cover_image || null : existing.cover_image;
  const categoryId =
    body.category_id !== undefined
      ? body.category_id
        ? Number(body.category_id)
        : null
      : existing.category_id;
  const status = body.status === 'published' ? 'published' : body.status === 'draft' ? 'draft' : existing.status;
  const isBreaking =
    body.is_breaking !== undefined ? (body.is_breaking ? 1 : 0) : existing.is_breaking;

  let publishedAt =
    body.published_at !== undefined ? body.published_at || null : existing.published_at;
  if (status === 'published' && !publishedAt) {
    publishedAt = new Date().toISOString();
  }

  db.prepare(
    `UPDATE news SET
       title = ?, slug = ?, excerpt = ?, content = ?, cover_image = ?,
       category_id = ?, status = ?, is_breaking = ?, published_at = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    title,
    slug,
    excerpt,
    content,
    coverImage,
    categoryId,
    status,
    isBreaking,
    publishedAt,
    id
  );

  let autopostResult = null;
  const becamePublished = existing.status !== 'published' && status === 'published';
  if (becamePublished) {
    autopostResult = await autopost(
      { title, slug },
      process.env.SITE_URL || ''
    );
  }

  res.json({ ok: true, id, autopost: autopostResult });
});

router.delete('/news/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM news WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// Public live-search
// ─────────────────────────────────────────────

router.get('/public/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ results: [] });
  const like = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT n.id, n.title, n.slug, n.published_at, c.name AS category_name, c.slug AS category_slug
       FROM news n LEFT JOIN categories c ON c.id = n.category_id
       WHERE n.status = 'published' AND (n.title LIKE ? OR n.excerpt LIKE ?)
       ORDER BY n.published_at DESC
       LIMIT 10`
    )
    .all(like, like);
  res.json({ results: rows });
});

// ─────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────

router.get('/settings', requireAuth, (req, res) => {
  res.json({ settings: getAllSettings() });
});

router.put('/settings', requireAuth, (req, res) => {
  const updated = setSettings(req.body || {});
  res.json({ ok: true, settings: updated });
});

// ─────────────────────────────────────────────
// Admins (owner only)
// ─────────────────────────────────────────────

router.get('/admins', requireAuth, requireOwner, (req, res) => {
  const admins = db
    .prepare('SELECT id, login, role, created_at FROM admins ORDER BY id ASC')
    .all();
  res.json({ admins });
});

router.post('/admins', requireAuth, requireOwner, (req, res) => {
  const { login, password, role } = req.body || {};
  if (!login || !password) return res.status(400).json({ error: 'Логин и пароль обязательны' });
  const exists = db.prepare('SELECT id FROM admins WHERE login = ?').get(login);
  if (exists) return res.status(400).json({ error: 'Логин уже занят' });
  const finalRole = role === 'owner' ? 'owner' : 'editor';
  const hash = bcrypt.hashSync(String(password), 10);
  const info = db
    .prepare('INSERT INTO admins (login, password_hash, role) VALUES (?, ?, ?)')
    .run(String(login).trim(), hash, finalRole);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.put('/admins/:id', requireAuth, requireOwner, (req, res) => {
  const id = Number(req.params.id);
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(id);
  if (!admin) return res.status(404).json({ error: 'Админ не найден' });

  const { login, password, role } = req.body || {};
  const newLogin = login != null ? String(login).trim() : admin.login;
  const newRole = role === 'owner' ? 'owner' : role === 'editor' ? 'editor' : admin.role;

  // Защита: нельзя убрать последнего owner
  if (admin.role === 'owner' && newRole !== 'owner') {
    const owners = db.prepare("SELECT COUNT(*) AS c FROM admins WHERE role = 'owner'").get().c;
    if (owners <= 1) return res.status(400).json({ error: 'Нельзя убрать роль у последнего владельца' });
  }

  if (newLogin !== admin.login) {
    const exists = db.prepare('SELECT id FROM admins WHERE login = ? AND id != ?').get(newLogin, id);
    if (exists) return res.status(400).json({ error: 'Логин уже занят' });
  }

  if (password) {
    const hash = bcrypt.hashSync(String(password), 10);
    db.prepare('UPDATE admins SET login = ?, password_hash = ?, role = ? WHERE id = ?')
      .run(newLogin, hash, newRole, id);
  } else {
    db.prepare('UPDATE admins SET login = ?, role = ? WHERE id = ?').run(newLogin, newRole, id);
  }

  res.json({ ok: true });
});

router.delete('/admins/:id', requireAuth, requireOwner, (req, res) => {
  const id = Number(req.params.id);
  if (req.session.admin.id === id)
    return res.status(400).json({ error: 'Нельзя удалить самого себя' });
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(id);
  if (!admin) return res.status(404).json({ error: 'Админ не найден' });
  if (admin.role === 'owner') {
    const owners = db.prepare("SELECT COUNT(*) AS c FROM admins WHERE role = 'owner'").get().c;
    if (owners <= 1) return res.status(400).json({ error: 'Нельзя удалить последнего владельца' });
  }
  db.prepare('DELETE FROM admins WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
