const { AppError, notFound } = require('../../utils/AppError');

// BM-10 Inventory: the only place that changes stock and reserved (D-06).
// available = stock - reserved. Each change is one conditional update on one book document,
// so two buyers can never both take the last copy; several lines run in one transaction (session).
function createInventoryService({ bookRepo, notificationService, toBook }) {
  const byBookId = (items) => [...items].sort((a, b) => String(a.bookId).localeCompare(String(b.bookId)));

  const insufficient = (bookId, available) =>
    new AppError('INSUFFICIENT_STOCK', 409, 'Not enough copies are available', [
      { field: String(bookId), issue: `only ${Math.max(0, available)} available` },
    ]);

  const service = {
    // I-06: used by the cart before a quantity is accepted
    async checkAvailability(items) {
      for (const item of items) {
        const book = await bookRepo.findApprovedById(item.bookId);
        if (!book) throw notFound('Book not found');
        const available = book.stock - book.reserved;
        if (item.quantity > available) throw insufficient(item.bookId, available);
      }
      return { ok: true };
    },

    // I-09: all lines or none. A failure throws, which aborts the surrounding transaction.
    async reserve(items, session) {
      for (const item of byBookId(items)) {
        const ok = await bookRepo.reserve(item.bookId, item.quantity, { session });
        if (!ok) {
          const book = await bookRepo.findById(item.bookId, { session });
          throw insufficient(item.bookId, book ? book.stock - book.reserved : 0);
        }
      }
    },

    // at payment confirmation: stock and reserved both go down. Returns the updated books so
    // low-stock alerts can be sent after the commit.
    async finalizeReservation(items, session) {
      const updated = [];
      for (const item of byBookId(items)) {
        const book = await bookRepo.finalize(item.bookId, item.quantity, { session });
        if (!book) throw new AppError('INTERNAL_ERROR', 500, 'Reservation could not be finalised');
        updated.push(book);
      }
      return updated;
    },

    // payment failed, unpaid order cancelled, or the reservation expired
    async releaseReservation(items, session) {
      for (const item of byBookId(items)) await bookRepo.release(item.bookId, item.quantity, { session });
    },

    // a Placed or Packed order was cancelled: the units go back on the shelf
    async restore(items, session) {
      for (const item of byBookId(items)) await bookRepo.restore(item.bookId, item.quantity, { session });
    },

    // I-13: alert the seller once when available units reach the threshold
    async evaluateLowStock(book) {
      if (book.stock - book.reserved <= book.lowStockThreshold) await notificationService.notifyLowStock(book);
    },

    // API-40 (I-17): owner filter, never below the reserved units (STOCK_BELOW_RESERVED)
    async setStock(sellerId, bookId, { stock, lowStockThreshold }) {
      const set = {};
      if (stock !== undefined) set.stock = stock;
      if (lowStockThreshold !== undefined) set.lowStockThreshold = lowStockThreshold;
      const book = await bookRepo.setStockOwned(sellerId, bookId, { $set: set }, true);
      if (!book) {
        const owned = await bookRepo.findOwned(sellerId, bookId);
        if (!owned) throw notFound('Listing not found');
        throw new AppError('STOCK_BELOW_RESERVED', 409, 'New stock is lower than the units reserved by open checkouts');
      }
      await service.evaluateLowStock(book);
      return toBook(book, { detailed: true });
    },
  };
  return service;
}

module.exports = { createInventoryService };
