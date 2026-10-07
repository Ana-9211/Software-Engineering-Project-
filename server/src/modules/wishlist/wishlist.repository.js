const { Wishlist } = require('../../models');

const wishlistRepository = {
  find: (userId) => Wishlist.findOne({ userId }),
  // $addToSet makes adding idempotent and prevents duplicates
  add: (userId, bookId) =>
    Wishlist.findOneAndUpdate({ userId }, { $addToSet: { bookIds: bookId } }, { upsert: true, new: true, setDefaultsOnInsert: true }),
  remove: (userId, bookId) => Wishlist.updateOne({ userId }, { $pull: { bookIds: bookId } }),
};

module.exports = { wishlistRepository };
