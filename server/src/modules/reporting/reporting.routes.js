const express = require('express');
const { validate, dateOnly } = require('../../middleware/validate');
const { requireRole } = require('../../middleware/requireRole');

const range = { query: { from: dateOnly.required(), to: dateOnly.required() } };

// API-44 (seller sales report) and API-60 (administrator platform report)
function createReportingRouters({ reportingService, authGuard }) {
  const seller = express.Router();
  const admin = express.Router();

  seller.get('/sales', authGuard, requireRole('seller'), validate(range), async (req, res) =>
    res.json(await reportingService.salesReport(req.user.id, req.valid.query.from, req.valid.query.to))
  );
  admin.get('/platform', authGuard, requireRole('admin'), validate(range), async (req, res) =>
    res.json(await reportingService.platformReport(req.valid.query.from, req.valid.query.to))
  );
  return { seller, admin };
}

module.exports = { createReportingRouters };
