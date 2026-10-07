const { AppError, notFound } = require('../../utils/AppError');
const { toPage } = require('../../utils/pagination');
const { buildSearchFields, textCondition, escapeRegex } = require('./search');

const PAGE_SIZE = 20; // FR-04

// Public book shape (openapi Book). Stock details are only shown to the owner and administrators.
function toBook(b, { detailed = false } = {}) {
  const available = Math.max(0, b.stock - b.reserved);
  const out = {
    id: String(b._id),
    sellerId: String(b.sellerId),
    title: b.title,
    author: b.author,
    isbn: b.isbn,
    price: b.price,
    description: b.description,
    categoryId: String(b.categoryId),
    language: b.language,
    imageUrls: (b.imageIds || []).map((i) => `/api/images/${i}`),
    available,
    stockStatus: available > 0 ? 'In stock' : 'Out of stock',
    status: b.status,
    avgRating: b.avgRating,
    reviewCount: b.reviewCount,
  };
  if (detailed) {
    out.stock = b.stock;
    out.reserved = b.reserved;
    out.lowStockThreshold = b.lowStockThreshold;
    out.rejectionReason = b.rejectionReason;
    out.createdAt = b.createdAt;
  }
  return out;
}

// BM-03 Catalog
function createCatalogService({ bookRepo, categoryRepo, reviewStats }) {
  return {
    toBook,
    buildSearchFields,

    // FR-04, FR-05, FR-06: only approved listings, always answered from an index (VFR-02)
    async listBooks(query) {
      const { q, category, minPrice, maxPrice, minRating, language, sort, page } = query;
      if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
        throw new AppError('VALIDATION_ERROR', 400, 'minPrice must not be above maxPrice', [{ field: 'minPrice', issue: 'above maxPrice' }]);
      }
      const filter = { status: 'approved' };
      const text = textCondition(q);
      if (text) Object.assign(filter, text);
      if (category) filter.categoryId = category;
      if (minPrice !== undefined || maxPrice !== undefined) {
        filter.price = {};
        if (minPrice !== undefined) filter.price.$gte = minPrice;
        if (maxPrice !== undefined) filter.price.$lte = maxPrice;
      }
      if (minRating !== undefined) filter.avgRating = { $gte: minRating }; // A-12
      if (language) filter.language = new RegExp(`^${escapeRegex(language)}$`, 'i');
      const { items, totalItems } = await bookRepo.search(filter, sort || 'newest', page, PAGE_SIZE);
      return toPage(items.map((b) => toBook(b)), page, PAGE_SIZE, totalItems);
    },

    async getBook(bookId) {
      const book = await bookRepo.findApprovedById(bookId);
      if (!book) throw notFound('Book not found');
      return toBook(book);
    },

    async listCategories() {
      const categories = await categoryRepo.list();
      return categories.map((c) => ({ id: String(c._id), name: c.name }));
    },

    categoryExists: async (id) => Boolean(await categoryRepo.findById(id)),

    // I-15: after a review is added or removed
    async recalculateRating(bookId, session) {
      const { avgRating, reviewCount } = await reviewStats(bookId, session);
      await bookRepo.setRating(bookId, avgRating, reviewCount, { session });
      return { avgRating, reviewCount };
    },

    async createCategory(name) {
      const c = await categoryRepo.create(name);
      return { id: String(c._id), name: c.name };
    },

    async renameCategory(id, name) {
      const c = await categoryRepo.rename(id, name);
      if (!c) throw notFound('Category not found');
      return { id: String(c._id), name: c.name };
    },

    async deleteCategory(id) {
      const c = await categoryRepo.findById(id);
      if (!c) throw notFound('Category not found');
      if ((await bookRepo.countByCategory(id)) > 0) {
        throw new AppError('CATEGORY_IN_USE', 409, 'Books still use this category');
      }
      await categoryRepo.remove(id);
    },
  };
}

module.exports = { createCatalogService, toBook, PAGE_SIZE };
