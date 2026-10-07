const { AppError, notFound } = require('../../utils/AppError');
const { toPage } = require('../../utils/pagination');
const { isbnDigits } = require('../catalog/search');

const PAGE_SIZE = 20;

// BM-16 Book Management: seller listings, ownership, and the admin decision on a listing.
function createBookManagementService({ bookRepo, catalogService, mediaService, inventoryService }) {
  async function assertCategory(categoryId) {
    if (!(await catalogService.categoryExists(categoryId))) {
      throw new AppError('VALIDATION_ERROR', 400, 'Unknown category', [{ field: 'categoryId', issue: 'category does not exist' }]);
    }
  }

  const view = (b) => catalogService.toBook(b, { detailed: true });

  return {
    // FR-20, FR-25: a new listing is pending until an administrator approves it
    async createListing(sellerId, dto) {
      await assertCategory(dto.categoryId);
      await mediaService.assertImagesOwned(sellerId, dto.imageIds);
      const isbn = isbnDigits(dto.isbn);
      const searchFields = catalogService.buildSearchFields(dto.title, dto.author, isbn); // I-28
      const book = await bookRepo.create({
        sellerId,
        title: dto.title,
        author: dto.author,
        isbn,
        price: dto.price,
        description: dto.description || '',
        categoryId: dto.categoryId,
        language: dto.language,
        imageIds: dto.imageIds || [],
        stock: dto.stock,
        reserved: 0,
        lowStockThreshold: dto.lowStockThreshold === undefined ? 5 : dto.lowStockThreshold,
        status: 'pending',
        ...searchFields,
      });
      await inventoryService.evaluateLowStock(book);
      return view(book);
    },

    // stock is only changed through the inventory endpoint; the approval status is unchanged (D-11)
    async updateListing(sellerId, bookId, dto) {
      const current = await bookRepo.findOwned(sellerId, bookId);
      if (!current) throw notFound('Listing not found');
      if (dto.categoryId) await assertCategory(dto.categoryId);
      if (dto.imageIds) await mediaService.assertImagesOwned(sellerId, dto.imageIds);

      const set = { ...dto };
      if (dto.title !== undefined || dto.author !== undefined) {
        Object.assign(set, catalogService.buildSearchFields(dto.title ?? current.title, dto.author ?? current.author, current.isbn));
      }
      const updated = await bookRepo.updateOwned(sellerId, bookId, { $set: set });
      if (!updated) throw notFound('Listing not found');
      return view(updated);
    },

    // the listing is kept with status removed so order history and reviews stay intact
    async removeListing(sellerId, bookId) {
      const updated = await bookRepo.updateOwned(sellerId, bookId, { $set: { status: 'removed' } });
      if (!updated) throw notFound('Listing not found');
    },

    async listOwnListings(sellerId, status, page) {
      const { items, totalItems } = await bookRepo.listOwn(sellerId, status, page, PAGE_SIZE);
      return toPage(items.map(view), page, PAGE_SIZE, totalItems);
    },

    // used by AdminService (API-52)
    async listPendingListings(status, page) {
      const { items, totalItems } = await bookRepo.listByStatus(status || 'pending', page, PAGE_SIZE);
      return toPage(items.map(view), page, PAGE_SIZE, totalItems);
    },

    // I-20, API-53 and API-54: only a pending listing can be decided
    async decideListing(adminId, bookId, decision, reason) {
      const update =
        decision === 'approve'
          ? { $set: { status: 'approved' }, $unset: { rejectionReason: 1 } }
          : { $set: { status: 'rejected', rejectionReason: reason } };
      const book = await bookRepo.decide(bookId, update);
      if (!book) {
        const exists = await bookRepo.findById(bookId);
        if (!exists) throw notFound('Listing not found');
        throw new AppError('NOT_PENDING', 409, 'This listing has already been decided');
      }
      return view(book);
    },
  };
}

module.exports = { createBookManagementService };
