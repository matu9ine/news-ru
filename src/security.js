const crypto = require('crypto');

const loginAttempts = new Map();

function clientKey(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function rateLimitLogin(req, res, next) {
  const key = clientKey(req);
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 8;
  const entry = loginAttempts.get(key) || { count: 0, resetAt: now + windowMs };

  if (entry.resetAt <= now) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }

  if (entry.count >= maxAttempts) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Слишком много попыток входа. Попробуйте позже.' });
  }

  entry.count += 1;
  loginAttempts.set(key, entry);
  next();
}

function clearLoginAttempts(req) {
  loginAttempts.delete(clientKey(req));
}

function ensureCsrfToken(req) {
  if (!req.session) return '';
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  return req.session.csrfToken;
}

function requireCsrf(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.path === '/auth/login') {
    return next();
  }
  const expected = req.session && req.session.csrfToken;
  const received = req.get('x-csrf-token');
  if (!expected || !received || expected !== received) {
    return res.status(403).json({ error: 'Сессия устарела. Обновите страницу и повторите действие.' });
  }
  next();
}

function sanitizeHtml(html) {
  if (!html) return '';
  let safe = String(html);
  safe = safe.replace(/<script[\s\S]*?<\/script>/gi, '');
  safe = safe.replace(/<style[\s\S]*?<\/style>/gi, '');
  safe = safe.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
  safe = safe.replace(/<object[\s\S]*?<\/object>/gi, '');
  safe = safe.replace(/<embed[\s\S]*?<\/embed>/gi, '');
  safe = safe.replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '');
  safe = safe.replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"');
  safe = safe.replace(/\sstyle\s*=\s*(".*?"|'.*?')/gi, '');
  return safe;
}

module.exports = {
  rateLimitLogin,
  clearLoginAttempts,
  ensureCsrfToken,
  requireCsrf,
  sanitizeHtml,
};
