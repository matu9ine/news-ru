const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'news.sqlite');
const db = new Database(DB_FILE);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('temp_store = MEMORY');
db.pragma('busy_timeout = 5000');

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'editor',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      excerpt TEXT,
      content TEXT,
      cover_image TEXT,
      author_name TEXT,
      author_title TEXT,
      author_photo TEXT,
      category_id INTEGER,
      author_id INTEGER,
      status TEXT NOT NULL DEFAULT 'draft',
      is_breaking INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (author_id) REFERENCES admins(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_news_status_pub ON news(status, published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_news_category_status_pub ON news(category_id, status, published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_news_author_status_pub ON news(author_id, status, published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_news_slug ON news(slug);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  const columns = [
    ['author_name', 'TEXT'],
    ['author_title', 'TEXT'],
    ['author_photo', 'TEXT'],
  ];
  for (const [name, type] of columns) {
    if (!columnExists('news', name)) db.exec(`ALTER TABLE news ADD COLUMN ${name} ${type}`);
  }
}

function seed() {
  // Дефолтные настройки
  const defaults = {
    site_name: 'Каспийский курьер',
    site_tagline: 'Деловая хроника региона',
    logo_text: 'Каспийский курьер',
    logo_image: '',
    social_vk: '',
    social_tg: '',
    social_ok: '',
    social_x: '',
    vk_access_token: '',
    vk_group_id: '',
    tg_bot_token: '',
    tg_chat_id: '',
    autopost_enabled: '0',
  };
  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [k, v] of Object.entries(defaults)) insertSetting.run(k, v);
  db.prepare("UPDATE settings SET value = ? WHERE key = 'site_name' AND value = 'Цифровая редакция'")
    .run(defaults.site_name);
  db.prepare("UPDATE settings SET value = ? WHERE key = 'site_tagline' AND value = 'Холодная премиальная редакция'")
    .run(defaults.site_tagline);
  db.prepare("UPDATE settings SET value = ? WHERE key = 'logo_text' AND value = 'Цифровая редакция'")
    .run(defaults.logo_text);

  const upsertCat = db.prepare(
    'INSERT OR IGNORE INTO categories (name, slug, sort_order) VALUES (?, ?, ?)'
  );
  upsertCat.run('Мнение', 'mnenie', 10);
  upsertCat.run('Цифры/факты', 'cifry-fakty', 20);

  // Дефолтные рубрики для новой базы
  const catCount = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
  if (catCount === 0) {
    const stmt = db.prepare(
      'INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?)'
    );
    const defaultCats = [
      ['Мнение', 'mnenie', 10],
      ['Цифры/факты', 'cifry-fakty', 20],
    ];
    for (const c of defaultCats) stmt.run(...c);
  }

  // Первичный админ
  const adminCount = db.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
  if (adminCount === 0) {
    const login = process.env.INITIAL_ADMIN_LOGIN || 'admin';
    const pass = process.env.INITIAL_ADMIN_PASSWORD || 'admin123';
    const hash = bcrypt.hashSync(pass, 10);
    db.prepare(
      'INSERT INTO admins (login, password_hash, role) VALUES (?, ?, ?)'
    ).run(login, hash, 'owner');
    console.log(`[db] Создан первичный admin: ${login}`);
  }
}

function init() {
  migrate();
  seed();
}

module.exports = { db, init };
