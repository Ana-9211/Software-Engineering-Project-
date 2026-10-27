// VFR-05: in production every request must use HTTPS. TLS ends at the hosting platform, which tells the
// application the original protocol (X-Forwarded-Proto; `trust proxy` makes it req.secure). Plain-HTTP
// requests are redirected to the same address over HTTPS. The health check is exempt because platform
// probes run inside the platform's network over plain HTTP.
function httpsRedirect(req, res, next) {
  if (req.secure || req.path === '/api/health') return next();
  const host = req.get('host');
  if (!host) return res.status(400).end();
  return res.redirect(308, `https://${host}${req.originalUrl}`);
}

module.exports = { httpsRedirect };
