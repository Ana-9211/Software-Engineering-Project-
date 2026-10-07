const { Cart } = require('../../models');

const opts = (session) => (session ? { session } : {});

const cartRepository = {
  findByUser: (userId) => Cart.findOne({ userId }),

  // one cart per user (unique index): create it on first use
  getOrCreate: (userId) => Cart.findOneAndUpdate({ userId }, { $setOnInsert: { userId, items: [] } }, { upsert: true, new: true }),

  async setQuantity(userId, bookId, quantity) {
    const updated = await Cart.updateOne({ userId, 'items.bookId': bookId }, { $set: { 'items.$.quantity': quantity } });
    if (updated.matchedCount === 0) {
      await Cart.updateOne({ userId, 'items.bookId': { $ne: bookId } }, { $push: { items: { bookId, quantity } } });
    }
    return Cart.findOne({ userId });
  },

  async removeItem(userId, bookId) {
    const r = await Cart.updateOne({ userId, 'items.bookId': bookId }, { $pull: { items: { bookId } } });
    return r.modifiedCount === 1;
  },

  clear: (userId, { session } = {}) => Cart.updateOne({ userId }, { $set: { items: [] } }, opts(session)),
};

module.exports = { cartRepository };
