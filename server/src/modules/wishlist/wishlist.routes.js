const express = require('express');
const { validate, id } = require('../../middleware/validate');
const { requireRole } = require('../../middleware/requireRole');

// API-24 to API-26
function createWishlistRouter({ wishlistService, authGuard }) {
  const router = express.Router();
  const customer = [authGuard, requireRole('customer')];
  const params = { params: { bookId: id.required() } };

  router.get('/', ...customer, async (req, res) => res.json(await wishlistService.getWishlist(req.user.id)));
  router.put('/items/:bookId', ...customer, validate(params), async (req, res) =>
    res.json(await wishlistService.addBook(req.user.id, req.valid.params.bookId))
  );
  router.delete('/items/:bookId', ...customer, validate(params), async (req, res) => {
    await wishlistService.removeBook(req.user.id, req.valid.params.bookId);
    res.status(204).end();
  });
  return router;
}

module.exports = { createWishlistRouter };
