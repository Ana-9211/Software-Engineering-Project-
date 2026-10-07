const { Review } = require('../../models');
const { AppError } = require('../../utils/AppError');

const opts = (session) => (session ? { session } : {});

const reviewRepository = {
  async create(data, { session } = {}) {
    try {
      const [doc] = await Review.create([data], opts(session));
      return doc;
    } catch (err) {
      if (err && err.code === 11000) throw new AppError('ALREADY_REVIEWED', 409, 'You have already reviewed this book');
      throw err;
    }
  },

  findById: (id) => Review.findById(id),
  deleteById: (id, { session } = {}) => Review.findByIdAndDelete(id, opts(session)),

  async listForBook(bookId, page, pageSize) {
    const filter = { bookId };
    const [items, totalItems] = await Promise.all([
      Review.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      Review.countDocuments(filter),
    ]);
    return { items, totalItems };
  },

  async listAll({ bookId, maxRating }, page, pageSize) {
    const filter = {};
    if (bookId) filter.bookId = bookId;
    if (maxRating) filter.rating = { $lte: maxRating };
    const [items, totalItems] = await Promise.all([
      Review.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      Review.countDocuments(filter),
    ]);
    return { items, totalItems };
  },

  async stats(bookId, { session } = {}) {
    const rows = await Review.aggregate([
      { $match: { bookId } },
      { $group: { _id: '$bookId', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]).session(session || null);
    if (rows.length === 0) return { avgRating: 0, reviewCount: 0 };
    return { avgRating: Math.round(rows[0].avg * 100) / 100, reviewCount: rows[0].count };
  },
};

module.exports = { reviewRepository };
