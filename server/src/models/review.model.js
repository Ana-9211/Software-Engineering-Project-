const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    bookId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
    comment: { type: String, maxlength: 2000, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

reviewSchema.index({ bookId: 1, userId: 1 }, { unique: true });
reviewSchema.index({ bookId: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema, 'reviews');
