const express = require('express');

// API-29 POST /api/payments/webhook. Mounted BEFORE the JSON parser and the CSRF check: the signature is
// computed over the raw bytes, and the gateway (not a browser) calls this endpoint.
function createPaymentRouter({ orderService }) {
  const router = express.Router();
  router.post('/webhook', express.raw({ type: '*/*', limit: '100kb' }), async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    await orderService.handleGatewayEvent(raw, req.get('X-Gateway-Signature'));
    res.json({ received: true });
  });
  return router;
}

module.exports = { createPaymentRouter };
