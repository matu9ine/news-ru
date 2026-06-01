const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

function resolveProjectPath(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return path.isAbsolute(raw) ? raw : path.join(ROOT_DIR, raw);
}

const DATA_DIR = resolveProjectPath(process.env.DATA_DIR, path.join(ROOT_DIR, 'data'));
const UPLOADS_DIR = resolveProjectPath(process.env.UPLOADS_DIR, path.join(ROOT_DIR, 'uploads'));

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  UPLOADS_DIR,
};
