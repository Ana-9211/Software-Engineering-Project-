const express = require('express');
const { validate, Joi, id, page } = require('../../middleware/validate');
const { requireRole } = require('../../middleware/requireRole');

// API-34, API-35 (customer applies), API-42, API-43 (seller orders), API-50, API-51 (admin decisions)
function createSellerRouters({ sellerService, authGuard }) {
  const seller = express.Router();
  const adminApplications = express.Router();
  const customer = [authGuard, requireRole('customer')];
  const sellerOnly = [authGuard, requireRole('seller')];
  const adminOnly = [authGuard, requireRole('admin')];

  seller.post(
    '/applications',
    ...customer,
    validate({ body: { storeName: Joi.string().trim().min(2).max(100).required(), description: Joi.string().max(1000).allow('') } }),
    async (req, res) => res.status(201).json(await sellerService.apply(req.user.id, req.valid.body))
  );
  seller.get('/applications/me', ...customer, async (req, res) => res.json(await sellerService.getMyApplication(req.user.id)));

  seller.get(
    '/orders',
    ...sellerOnly,
    validate({ query: { status: Joi.string().valid('Placed', 'Packed', 'Shipped', 'Delivered', 'Cancelled'), page } }),
    async (req, res) => res.json(await sellerService.listSellerOrders(req.user.id, req.valid.query.status, req.valid.query.page))
  );
  seller.patch(
    '/orders/:orderId/items/:itemId/status',
    ...sellerOnly,
    validate({
      params: { orderId: id.required(), itemId: id.required() },
      body: { status: Joi.string().valid('Packed', 'Shipped', 'Delivered').required() },
    }),
    async (req, res) =>
      res.json(await sellerService.updateItemStatus(req.user.id, req.valid.params.orderId, req.valid.params.itemId, req.valid.body.status))
  );

  adminApplications.post('/:applicationId/approve', ...adminOnly, validate({ params: { applicationId: id.required() } }), async (req, res) =>
    res.json(await sellerService.decideApplication(req.user.id, req.valid.params.applicationId, 'approve'))
  );
  adminApplications.post(
    '/:applicationId/reject',
    ...adminOnly,
    validate({ params: { applicationId: id.required() }, body: { reason: Joi.string().trim().min(1).max(500).required() } }),
    async (req, res) =>
      res.json(await sellerService.decideApplication(req.user.id, req.valid.params.applicationId, 'reject', req.valid.body.reason))
  );

  return { seller, adminApplications };
}

module.exports = { createSellerRouters };
