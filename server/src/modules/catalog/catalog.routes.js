const express = require('express');
const { validate, Joi, id, page } = require('../../middleware/validate');
const { requireRole } = require('../../middleware/requireRole');

// API-15, API-16, API-18 (public) and API-55 to API-57 (administrator, categories)
function createCatalogRouters({ catalogService, authGuard }) {
  const publicBooks = express.Router();
  const categories = express.Router();
  const adminCategories = express.Router();

  publicBooks.get(
    '/',
    validate({
      query: {
        q: Joi.string().trim().min(1).max(100),
        category: id,
        minPrice: Joi.number().integer().min(0),
        maxPrice: Joi.number().integer().min(0),
        minRating: Joi.number().integer().min(1).max(5),
        language: Joi.string().trim().min(2).max(30),
        sort: Joi.string().valid('newest', 'price_asc', 'price_desc', 'rating_desc'),
        page,
      },
    }),
    async (req, res) => res.json(await catalogService.listBooks(req.valid.query))
  );
  publicBooks.get('/:bookId', validate({ params: { bookId: id.required() } }), async (req, res) =>
    res.json(await catalogService.getBook(req.valid.params.bookId))
  );

  categories.get('/', async (req, res) => res.json(await catalogService.listCategories()));

  const admin = [authGuard, requireRole('admin')];
  const nameBody = { name: Joi.string().trim().min(1).max(60).required() };
  adminCategories.post('/', ...admin, validate({ body: nameBody }), async (req, res) =>
    res.status(201).json(await catalogService.createCategory(req.valid.body.name))
  );
  adminCategories.patch('/:categoryId', ...admin, validate({ params: { categoryId: id.required() }, body: nameBody }), async (req, res) =>
    res.json(await catalogService.renameCategory(req.valid.params.categoryId, req.valid.body.name))
  );
  adminCategories.delete('/:categoryId', ...admin, validate({ params: { categoryId: id.required() } }), async (req, res) => {
    await catalogService.deleteCategory(req.valid.params.categoryId);
    res.status(204).end();
  });

  return { publicBooks, categories, adminCategories };
}

module.exports = { createCatalogRouters };
