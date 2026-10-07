const express = require('express');
const { validate, Joi, id, page } = require('../../middleware/validate');
const { requireRole } = require('../../middleware/requireRole');

// API-45, API-46: in-app alerts for sellers (FR-21).
function createNotificationRouter({ notificationService, authGuard }) {
  const router = express.Router();
  const seller = [authGuard, requireRole('seller')];

  router.get('/', ...seller, validate({ query: { unread: Joi.boolean(), page } }), async (req, res) => {
    const { unread, page: p } = req.valid.query;
    res.json(await notificationService.listForUser(req.user.id, { unread }, p));
  });
  router.patch('/:notificationId/read', ...seller, validate({ params: { notificationId: id.required() } }), async (req, res) => {
    res.json(await notificationService.markRead(req.user.id, req.valid.params.notificationId));
  });
  return router;
}

module.exports = { createNotificationRouter };
