const express = require('express');
const { validate, Joi, id, page } = require('../../middleware/validate');
const { requireRole } = require('../../middleware/requireRole');

// API-47, API-48, API-49 (administrator only)
function createAdminRouter({ adminService, authGuard }) {
  const router = express.Router();
  const adminOnly = [authGuard, requireRole('admin')];

  router.get(
    '/users',
    ...adminOnly,
    validate({
      query: {
        role: Joi.string().valid('customer', 'seller', 'admin'),
        status: Joi.string().valid('pending_verification', 'active', 'suspended'),
        q: Joi.string().trim().min(1).max(100),
        page,
      },
    }),
    async (req, res) => res.json(await adminService.listUsers(req.valid.query, req.valid.query.page))
  );
  router.patch(
    '/users/:userId/status',
    ...adminOnly,
    validate({ params: { userId: id.required() }, body: { status: Joi.string().valid('active', 'suspended').required() } }),
    async (req, res) => res.json(await adminService.setUserStatus(req.user.id, req.valid.params.userId, req.valid.body.status))
  );
  router.get(
    '/seller-applications',
    ...adminOnly,
    validate({ query: { status: Joi.string().valid('pending', 'approved', 'rejected'), page } }),
    async (req, res) => res.json(await adminService.listApplications(req.valid.query.status, req.valid.query.page))
  );
  return router;
}

module.exports = { createAdminRouter };
