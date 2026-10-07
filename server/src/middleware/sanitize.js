const { AppError } = require('../utils/AppError');

// Rejects request objects with keys that start with "$" or contain "." (NoSQL injection, VFR-06).
function hasBadKey(value, depth = 0) {
  if (depth > 10) return true;
  if (Array.isArray(value)) return value.some((v) => hasBadKey(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => k.startsWith('$') || k.includes('.') || hasBadKey(v, depth + 1));
  }
  return false;
}

function sanitize(req, res, next) {
  if (hasBadKey(req.body) || hasBadKey(req.query) || hasBadKey(req.params)) {
    return next(new AppError('VALIDATION_ERROR', 400, 'Request contains forbidden characters in field names', [
      { field: '*', issue: 'field names must not start with $ or contain .' },
    ]));
  }
  return next();
}

module.exports = { sanitize, hasBadKey };
