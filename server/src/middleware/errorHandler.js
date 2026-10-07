const { AppError } = require('../utils/AppError');
const logger = require('../utils/logger');

// Converts every error to the uniform body { error: { code, message, details } } (SDD 6.1).
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    if (err.status === 423 && err.retryAfterSeconds) res.set('Retry-After', String(err.retryAfterSeconds));
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details || [] } });
  }
  // body-parser problems: malformed JSON or body too large
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON', details: [] } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'VALIDATION_ERROR', message: 'Request body is too large', details: [] } });
  }
  // unknown errors never leak internals
  logger.error('unhandled error', { path: req.path, method: req.method, error: err.message, stack: err.stack });
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', details: [] } });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found', details: [] } });
}

module.exports = { errorHandler, notFoundHandler };
