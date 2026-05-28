const publicCache = new Map();

function cacheKey(req) {
  return `${req.method}:${req.originalUrl}`;
}

function getPublicCache(req) {
  if (req.method !== 'GET') return null;
  const item = publicCache.get(cacheKey(req));
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    publicCache.delete(cacheKey(req));
    return null;
  }
  return item.html;
}

function setPublicCache(req, html, ttlMs = 30000) {
  if (req.method !== 'GET') return;
  publicCache.set(cacheKey(req), {
    html,
    expiresAt: Date.now() + ttlMs,
  });
}

function clearPublicCache() {
  publicCache.clear();
}

module.exports = {
  getPublicCache,
  setPublicCache,
  clearPublicCache,
};
