const express = require('express');
const { validate, Joi, id, page } = require('../../middleware/validate');
const { requireRole } = require('../../middleware/requireRole');

// API-17 and API-33 live under /api/books/:bookId/reviews; API-58 and API-59 under /api/admin/reviews
function createReviewRouters({ reviewService, authGuard }) {
  const bookReviews = express.Router({ mergeParams: true });
  const admin = express.Router();

  bookReviews.get('/', validate({ params: { bookId: id.required() }, query: { page } }), async (req, res) =>
    res.json(await reviewService.listReviews(req.valid.params.bookId, req.valid.query.page))
  );
  bookReviews.post(
    '/',
    authGuard,
    requireRole('customer'),
    validate({
      params: { bookId: id.required() },
      body: { rating: Joi.number().integer().min(1).max(5).required(), comment: Joi.string().max(2000).allow('') },
    }),
    async (req, res) => res.status(201).json(await reviewService.createReview(req.user.id, req.valid.params.bookId, req.valid.body))
  );

  const adminOnly = [authGuard, requireRole('admin')];
  admin.get(
    '/',
    ...adminOnly,
    validate({ query: { bookId: id, maxRating: Joi.number().integer().min(1).max(5), page } }),
    async (req, res) => res.json(await reviewService.listAllReviews(req.valid.query, req.valid.query.page))
  );
  admin.delete('/:reviewId', ...adminOnly, validate({ params: { reviewId: id.required() } }), async (req, res) => {
    await reviewService.deleteReview(req.valid.params.reviewId);
    res.status(204).end();
  });

  return { bookReviews, admin };
}

module.exports = { createReviewRouters };
