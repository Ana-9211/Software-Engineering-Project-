const helmet = require('helmet');
const config = require('../config');

// Features the application never uses are switched off for every origin (Permissions-Policy).
const PERMISSIONS_POLICY = [
  'accelerometer', 'autoplay', 'camera', 'display-capture', 'geolocation', 'gyroscope', 'magnetometer',
  'microphone', 'midi', 'payment', 'usb', 'xr-spatial-tracking',
].map((feature) => `${feature}=()`).join(', ');

// Security headers: CSP limits scripts, styles, fonts and frames (XSS), HSTS for HTTPS-only (VFR-05).
// Every source is 'self': the React build is one script and one stylesheet from the same origin, and
// no component uses an inline style attribute or a third-party font, so no wildcard or 'unsafe-inline'
// is needed (TASK-07, DEF-07).
const helmetConfig = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      ...(config.isProd ? { upgradeInsecureRequests: [] } : {}),
    },
  },
  hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  crossOriginEmbedderPolicy: { policy: 'require-corp' },
});

// helmet has no Permissions-Policy option
function permissionsPolicy(req, res, next) {
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
  next();
}

module.exports = { helmetConfig, permissionsPolicy };
