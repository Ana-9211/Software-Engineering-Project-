const express = require('express');
const { validate, Joi, id, page } = require('../../middleware/validate');
const { requireRole } = require('../../middleware/requireRole');
const { isbnDigits } = require('../catalog/search');

// ISBN-10 or ISBN-13 with a valid check digit; hyphens and spaces are allowed on input
function validIsbn(value, helpers) {
  const d = isbnDigits(value);
  if (/^\d{13}$/.test(d)) {
    const sum = [...d.slice(0, 12)].reduce((s, ch, i) => s + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
    return (10 - (sum % 10)) % 10 === Number(d[12]) ? value : helpers.error('any.invalid');
  }
  if (/^\d{9}[\dX]$/.test(d)) {
    const sum = [...d].reduce((s, ch, i) => s + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0);
    return sum % 11 === 0 ? value : helpers.error('any.invalid');
  }
  return helpers.error('any.invalid');
}

const isbn = Joi.string().custom(validIsbn).messages({ 'any.invalid': 'isbn must be a valid ISBN-10 or ISBN-13' });
const listingFields = {
  title: Joi.string().trim().min(1).max(200),
  author: Joi.string().trim().min(1).max(150),
  price: Joi.number().integer().min(1),
  description: Joi.string().max(5000).allow(''),
  categoryId: id,
  language: Joi.string().trim().min(2).max(30),
  imageIds: Joi.array().items(id).max(3),
};
const required = (schema) => schema.required();

// API-36 to API-39 (seller listings) and API-52 to API-54 (admin decisions on listings)
function createBookManagementRouters({ bookManagementService, adminService, authGuard }) {
  const seller = express.Router();
  const admin = express.Router();
  const sellerOnly = [authGuard, requireRole('seller')];
  const adminOnly = [authGuard, requireRole('admin')];

  seller.get(
    '/',
    ...sellerOnly,
    validate({ query: { status: Joi.string().valid('pending', 'approved', 'rejected', 'removed'), page } }),
    async (req, res) => res.json(await bookManagementService.listOwnListings(req.user.id, req.valid.query.status, req.valid.query.page))
  );
  seller.post(
    '/',
    ...sellerOnly,
    validate({
      body: {
        title: required(listingFields.title),
        author: required(listingFields.author),
        isbn: required(isbn),
        price: required(listingFields.price),
        description: listingFields.description,
        categoryId: required(listingFields.categoryId),
        language: required(listingFields.language),
        stock: Joi.number().integer().min(0).max(100000).required(),
        lowStockThreshold: Joi.number().integer().min(0).max(100000),
        imageIds: listingFields.imageIds,
      },
    }),
    async (req, res) => res.status(201).json(await bookManagementService.createListing(req.user.id, req.valid.body))
  );
  seller.patch(
    '/:bookId',
    ...sellerOnly,
    validate({ params: { bookId: id.required() }, body: listingFields }),
    async (req, res) => res.json(await bookManagementService.updateListing(req.user.id, req.valid.params.bookId, req.valid.body))
  );
  seller.delete('/:bookId', ...sellerOnly, validate({ params: { bookId: id.required() } }), async (req, res) => {
    await bookManagementService.removeListing(req.user.id, req.valid.params.bookId);
    res.status(204).end();
  });

  admin.get(
    '/',
    ...adminOnly,
    validate({ query: { status: Joi.string().valid('pending', 'approved', 'rejected', 'removed'), page } }),
    async (req, res) => res.json(await adminService.listPendingListings(req.valid.query.status, req.valid.query.page))
  );
  admin.post('/:bookId/approve', ...adminOnly, validate({ params: { bookId: id.required() } }), async (req, res) =>
    res.json(await bookManagementService.decideListing(req.user.id, req.valid.params.bookId, 'approve'))
  );
  admin.post(
    '/:bookId/reject',
    ...adminOnly,
    validate({ params: { bookId: id.required() }, body: { reason: Joi.string().trim().min(1).max(500).required() } }),
    async (req, res) =>
      res.json(await bookManagementService.decideListing(req.user.id, req.valid.params.bookId, 'reject', req.valid.body.reason))
  );

  return { seller, admin };
}

module.exports = { createBookManagementRouters, validIsbn };
