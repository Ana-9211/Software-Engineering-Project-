const { AppError, notFound } = require('../../utils/AppError');
const { toPage } = require('../../utils/pagination');

const PAGE_SIZE = 10; // API-17
const ADMIN_PAGE_SIZE = 20;

// BM-08 Review (FR-17, FR-27)
function createReviewService({ repo, bookRepo, orderRepo, catalogService, userService, withTransaction }) {
  async function toReviews(reviews) {
    const names = await userService.namesByIds(reviews.map((r) => r.userId));
    return reviews.map((r) => ({
      id: String(r._id),
      bookId: String(r.bookId),
      userName: names.get(String(r.userId)) || 'Reader',
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
    }));
  }

  return {
    stats: (bookId, session) => repo.stats(bookId, { session }),

    // the customer must have a Delivered item for this book (I-14); one review per customer per book
    async createReview(userId, bookId, dto) {
      const book = await bookRepo.findApprovedById(bookId);
      if (!book) throw notFound('Book not found');
      if (!(await orderRepo.hasDeliveredItem(userId, book._id))) {
        throw new AppError('NOT_ELIGIBLE', 403, 'You can only review books you have purchased and received');
      }
      const review = await withTransaction(async (session) => {
        const created = await repo.create({ bookId: book._id, userId, rating: dto.rating, comment: dto.comment || '' }, { session });
        await catalogService.recalculateRating(book._id, session); // I-15
        return created;
      });
      return (await toReviews([review]))[0];
    },

    async listReviews(bookId, page) {
      const book = await bookRepo.findApprovedById(bookId);
      if (!book) throw notFound('Book not found');
      const { items, totalItems } = await repo.listForBook(book._id, page, PAGE_SIZE);
      return toPage(await toReviews(items), page, PAGE_SIZE, totalItems);
    },

    async listAllReviews(filter, page) {
      const { items, totalItems } = await repo.listAll(filter, page, ADMIN_PAGE_SIZE);
      return toPage(await toReviews(items), page, ADMIN_PAGE_SIZE, totalItems);
    },

    async deleteReview(reviewId) {
      await withTransaction(async (session) => {
        const removed = await repo.deleteById(reviewId, { session });
        if (!removed) throw notFound('Review not found');
        await catalogService.recalculateRating(removed.bookId, session);
      });
    },
  };
}

module.exports = { createReviewService };
