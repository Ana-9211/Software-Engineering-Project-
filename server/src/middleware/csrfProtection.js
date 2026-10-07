const crypto = require('crypto');
const config = require('../config');
const { AppError } = require('../utils/AppError');

// Double-submit CSRF token (D-03). GET /api/auth/csrf-token returns a random token and sets a cookie
// holding "token.signature". Every state-changing request must send the token in X-CSRF-Token;
// the server checks the cookie signature and that header and cookie carry the same token.
const COOKIE = 'csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const sign = (token) => crypto.createHmac('sha256', config.csrfSecret).update(token).digest('hex');

function issueCsrfToken(res) {
  const token = crypto.randomBytes(24).toString('hex');
  res.cookie(COOKIE, `${token}.${sign(token)}`, {
    httpOnly: false,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
  });
  return token;
}

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const header = req.get('X-CSRF-Token');
  const cookie = req.cookies && req.cookies[COOKIE];
  if (!header || !cookie || typeof cookie !== 'string') {
    return next(new AppError('CSRF_INVALID', 403, 'Missing CSRF token'));
  }
  const [token, signature] = cookie.split('.');
  if (!token || !signature || !safeEqual(signature, sign(token)) || !safeEqual(token, header)) {
    return next(new AppError('CSRF_INVALID', 403, 'Invalid CSRF token'));
  }
  return next();
}

module.exports = { csrfProtection, issueCsrfToken, CSRF_COOKIE: COOKIE };
