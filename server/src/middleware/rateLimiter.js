const rateLimit = require('express-rate-limit');

// 429 RATE_LIMITED in the uniform error shape. Stricter limits are used on authentication endpoints.
function createRateLimiter({ windowMs = 15 * 60 * 1000, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later', details: [] } });
    },
  });
}

module.exports = { createRateLimiter };
