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
    CREATE INDEX IF NOT EXISTS idx_news_category ON news(category_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

function seed() {
  // Дефолтные настройки
  const defaults = {
    site_name: 'Цифровая редакция',
    site_tagline: 'Холодная премиальная редакция',
    logo_text: 'Цифровая редакция',
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

  // Дефолтные рубрики
  const catCount = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
  if (catCount === 0) {
    const stmt = db.prepare(
      'INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?)'
    );
    const defaultCats = [
      ['Политика', 'politika', 1],
      ['Общество', 'obshchestvo', 2],
      ['Технологии', 'tehnologii', 3],
      ['Экономика', 'ekonomika', 4],
      ['Мир', 'mir', 5],
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
