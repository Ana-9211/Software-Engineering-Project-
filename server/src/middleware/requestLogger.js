const logger = require('../utils/logger');

// One line per request: method, path (no query string, tokens can appear there), status, duration, user id.
function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info('request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(ms),
      userId: req.user ? String(req.user.id) : undefined,
    });
  });
  next();
}

module.exports = { requestLogger };
