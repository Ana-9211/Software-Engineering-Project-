const express = require('express');
const { validate, Joi, id } = require('../../middleware/validate');
const { requireRole } = require('../../middleware/requireRole');

// API-40 PATCH /api/seller/books/:bookId/inventory (mounted under /api/seller/books)
function createInventoryRouter({ inventoryService, authGuard }) {
  const router = express.Router();
  router.patch(
    '/:bookId/inventory',
    authGuard,
    requireRole('seller'),
    validate({
      params: { bookId: id.required() },
      body: Joi.object({
        stock: Joi.number().integer().min(0).max(100000),
        lowStockThreshold: Joi.number().integer().min(0).max(100000),
      }).min(1),
    }),
    async (req, res) => res.json(await inventoryService.setStock(req.user.id, req.valid.params.bookId, req.valid.body))
  );
  return router;
}

module.exports = { createInventoryRouter };
