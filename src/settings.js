const { db } = require('./db');

const ALLOWED_KEYS = new Set([
  'site_name',
  'site_tagline',
  'logo_text',
  'logo_image',
  'social_vk',
  'social_tg',
  'social_ok',
  'social_x',
  'vk_access_token',
  'vk_group_id',
  'tg_bot_token',
  'tg_chat_id',
  'autopost_enabled',
]);

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const r of rows) result[r.key] = r.value ?? '';
  return result;
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
}

function setSettings(patch) {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction((entries) => {
    for (const [k, v] of entries) {
      if (!ALLOWED_KEYS.has(k)) continue;
      stmt.run(k, v == null ? '' : String(v));
    }
  });
  tx(Object.entries(patch || {}));
  return getAllSettings();
}

module.exports = { getAllSettings, getSetting, setSettings, ALLOWED_KEYS };
