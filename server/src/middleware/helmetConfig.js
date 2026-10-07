const helmet = require('helmet');
const config = require('../config');

// Security headers: CSP limits scripts and frames (XSS), HSTS for HTTPS-only (VFR-05).
const helmetConfig = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: config.isProd ? [] : null,
    },
  },
  hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
});

module.exports = { helmetConfig };
