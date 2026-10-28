const rateLimit = require('express-rate-limit');

// 429 RATE_LIMITED in the uniform error shape. Stricter limits are used on authentication endpoints.
function limitedHandler(req, res) {
  res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later', details: [] } });
}

function createRateLimiter({ windowMs = 15 * 60 * 1000, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: limitedHandler,
  });
}

// Counts failed attempts per account (the e-mail in the request body), not per address. Behind a hosting
// platform with several proxy layers the client address can vary between requests, so a per-address limit
// alone lets an attacker spread guesses over many "addresses". Successful requests are not counted, so a
// real user who logs in normally is never throttled by this limiter.
function createAccountLimiter({ windowMs = 15 * 60 * 1000, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const email = req.body && typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      return email ? `account:${email}` : `ip:${rateLimit.ipKeyGenerator ? rateLimit.ipKeyGenerator(req.ip) : req.ip}`;
    },
    handler: limitedHandler,
  });
}

module.exports = { createRateLimiter, createAccountLimiter };
