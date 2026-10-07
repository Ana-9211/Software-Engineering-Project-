const express = require('express');
const { validate, Joi, id } = require('../../middleware/validate');
const { requireRole } = require('../../middleware/requireRole');

const quantity = Joi.number().integer().min(1).max(50);

// API-20 to API-23. The cart belongs to the logged-in customer; no cart id is ever taken from the request.
function createCartRouter({ cartService, authGuard }) {
  const router = express.Router();
  const customer = [authGuard, requireRole('customer')];

  router.get('/', ...customer, async (req, res) => res.json(await cartService.getCart(req.user.id)));
  router.post(
    '/items',
    ...customer,
    validate({ body: { bookId: id.required(), quantity: quantity.required() } }),
    async (req, res) => res.json(await cartService.addItem(req.user.id, req.valid.body.bookId, req.valid.body.quantity))
  );
  router.patch(
    '/items/:bookId',
    ...customer,
    validate({ params: { bookId: id.required() }, body: { quantity: quantity.required() } }),
    async (req, res) => res.json(await cartService.updateItem(req.user.id, req.valid.params.bookId, req.valid.body.quantity))
  );
  router.delete('/items/:bookId', ...customer, validate({ params: { bookId: id.required() } }), async (req, res) =>
    res.json(await cartService.removeItem(req.user.id, req.valid.params.bookId))
  );
  return router;
}

module.exports = { createCartRouter };
