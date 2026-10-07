const { AppError } = require('../../utils/AppError');

// BM-05 Wishlist (FR-10)
function createWishlistService({ repo, bookRepo, catalogService }) {
  async function view(wishlist) {
    const ids = wishlist ? wishlist.bookIds : [];
    const books = ids.length ? await bookRepo.findByIds(ids) : [];
    // hidden or removed books are not shown
    return { items: books.filter((b) => b.status === 'approved').map((b) => catalogService.toBook(b)) };
  }

  return {
    async getWishlist(userId) {
      return view(await repo.find(userId));
    },
    async addBook(userId, bookId) {
      const book = await bookRepo.findApprovedById(bookId);
      if (!book) throw new AppError('BOOK_NOT_FOUND', 404, 'This book is not available');
      return view(await repo.add(userId, bookId));
    },
    async removeBook(userId, bookId) {
      await repo.remove(userId, bookId);
    },
  };
}

module.exports = { createWishlistService };
