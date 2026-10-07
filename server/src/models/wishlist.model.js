const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    bookIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

wishlistSchema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.model('Wishlist', wishlistSchema, 'wishlists');
