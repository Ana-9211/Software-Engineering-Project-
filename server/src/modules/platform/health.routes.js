const express = require('express');
const mongoose = require('mongoose');

// API-61 GET /api/health: used by the uptime monitor (VFR-09). It checks the database, so a service
// that is up but cut off from its database counts as unavailable.
function createHealthRouter() {
  const router = express.Router();
  const startedAt = Date.now();

  router.get('/', async (req, res) => {
    let dbUp = false;
    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.db.admin().ping();
        dbUp = true;
      }
    } catch {
      dbUp = false;
    }
    const body = {
      status: 'ok',
      db: dbUp ? 'up' : 'down',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      time: new Date().toISOString(),
    };
    if (dbUp) return res.json(body);
    return res.status(503).json({ ...body, error: { code: 'UNHEALTHY', message: 'Database check failed', details: [] } });
  });
  return router;
}

module.exports = { createHealthRouter };
