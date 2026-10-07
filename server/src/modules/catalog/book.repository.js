const { Book } = require('../../models');
const { AppError } = require('../../utils/AppError');

const opts = (session) => (session ? { session } : {});

// Fields the catalogue list never needs; the derived search fields are never sent to clients.
const HIDE_SEARCH = '-titleLower -authorLower -searchText -searchTrigrams';

const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: 1 },
  rating_desc: { avgRating: -1, createdAt: -1, _id: 1 },
};

// BookRepository: used by Catalog (BM-03), Book Management (BM-16) and Inventory (BM-10).
const bookRepository = {
  async search(filter, sort, page, pageSize) {
    const [items, totalItems] = await Promise.all([
      Book.find(filter).select(HIDE_SEARCH).sort(SORTS[sort] || SORTS.newest).skip((page - 1) * pageSize).limit(pageSize),
      Book.countDocuments(filter),
    ]);
    return { items, totalItems };
  },

  findById: (id, { session } = {}) => Book.findById(id).select(HIDE_SEARCH).session(session || null),
  findApprovedById: (id) => Book.findOne({ _id: id, status: 'approved' }).select(HIDE_SEARCH),
  findByIds: (ids) => Book.find({ _id: { $in: ids } }).select(HIDE_SEARCH),
  findOwned: (sellerId, id) => Book.findOne({ _id: id, sellerId, status: { $ne: 'removed' } }).select(HIDE_SEARCH),

  async create(data) {
    try {
      return await Book.create(data);
    } catch (err) {
      if (err && err.code === 11000) {
        throw new AppError('ISBN_EXISTS_FOR_SELLER', 409, 'You already have a listing with this ISBN');
      }
      throw err;
    }
  },

  // owner filter in the query: another seller's book is never loaded
  updateOwned: (sellerId, id, update) =>
    Book.findOneAndUpdate({ _id: id, sellerId, status: { $ne: 'removed' } }, update, { new: true }).select(HIDE_SEARCH),

  async listOwn(sellerId, status, page, pageSize) {
    const filter = { sellerId };
    if (status) filter.status = status; // without a status filter every status is listed (API-36)
    const [items, totalItems] = await Promise.all([
      Book.find(filter).select(HIDE_SEARCH).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      Book.countDocuments(filter),
    ]);
    return { items, totalItems };
  },

  async listByStatus(status, page, pageSize) {
    const [items, totalItems] = await Promise.all([
      Book.find({ status }).select(HIDE_SEARCH).sort({ createdAt: 1, _id: 1 }).skip((page - 1) * pageSize).limit(pageSize),
      Book.countDocuments({ status }),
    ]);
    return { items, totalItems };
  },

  // only a pending listing can be decided
  decide: (id, update) => Book.findOneAndUpdate({ _id: id, status: 'pending' }, update, { new: true }).select(HIDE_SEARCH),

  countByCategory: (categoryId) => Book.countDocuments({ categoryId }),

  setRating: (id, avgRating, reviewCount, { session } = {}) =>
    Book.updateOne({ _id: id }, { $set: { avgRating, reviewCount } }, opts(session)),

  // ---- stock reservation (D-06). available = stock - reserved. Every method is one conditional update. ----

  // true only when available units are enough; the check and the change are one atomic step
  async reserve(bookId, quantity, { session } = {}) {
    const r = await Book.updateOne(
      { _id: bookId, status: 'approved', $expr: { $gte: [{ $subtract: ['$stock', '$reserved'] }, quantity] } },
      { $inc: { reserved: quantity } },
      opts(session)
    );
    return r.modifiedCount === 1;
  },

  // payment confirmed: the units leave stock and the reservation
  finalize: (bookId, quantity, { session } = {}) =>
    Book.findOneAndUpdate(
      { _id: bookId, reserved: { $gte: quantity }, stock: { $gte: quantity } },
      { $inc: { stock: -quantity, reserved: -quantity } },
      { new: true, ...opts(session) }
    ),

  async release(bookId, quantity, { session } = {}) {
    const r = await Book.updateOne({ _id: bookId, reserved: { $gte: quantity } }, { $inc: { reserved: -quantity } }, opts(session));
    return r.modifiedCount === 1;
  },

  restore: (bookId, quantity, { session } = {}) => Book.updateOne({ _id: bookId }, { $inc: { stock: quantity } }, opts(session)),

  // stock may not go below the units reserved by open checkouts
  setStockOwned: (sellerId, bookId, update, minStockIsReserved) => {
    const filter = { _id: bookId, sellerId, status: { $ne: 'removed' } };
    if (minStockIsReserved && update.$set && update.$set.stock !== undefined) {
      filter.$expr = { $gte: [update.$set.stock, '$reserved'] };
    }
    return Book.findOneAndUpdate(filter, update, { new: true }).select(HIDE_SEARCH);
  },
};

module.exports = { bookRepository, SORTS };
