const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    title: { type: String, required: true, minlength: 1, maxlength: 200, trim: true },
    author: { type: String, required: true, minlength: 1, maxlength: 150, trim: true },
    // normalised: digits (and a final X for ISBN-10), no hyphens
    isbn: { type: String, required: true },
    // minor currency units
    price: { type: Number, required: true, min: 1, validate: Number.isInteger },
    description: { type: String, maxlength: 5000, default: '' },
    categoryId: { type: mongoose.Schema.Types.ObjectId, required: true },
    language: { type: String, required: true, minlength: 2, maxlength: 30 },
    imageIds: { type: [mongoose.Schema.Types.ObjectId], default: [], validate: (v) => v.length <= 3 },
    stock: { type: Number, required: true, min: 0, validate: Number.isInteger },
    reserved: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger },
    lowStockThreshold: { type: Number, required: true, min: 0, default: 5 },
    status: { type: String, required: true, enum: ['pending', 'approved', 'rejected', 'removed'], default: 'pending' },
    rejectionReason: String,
    avgRating: { type: Number, required: true, default: 0 },
    reviewCount: { type: Number, required: true, default: 0 },
    // derived search fields (D-10); never accepted from clients, never returned by the API
    titleLower: { type: String, required: true },
    authorLower: { type: String, required: true },
    searchText: { type: String, required: true },
    searchTrigrams: { type: [String], required: true },
  },
  { timestamps: true }
);

bookSchema.index({ sellerId: 1, isbn: 1 }, { unique: true });
bookSchema.index({ status: 1, categoryId: 1, price: 1 });
bookSchema.index({ status: 1, price: 1 });
bookSchema.index({ status: 1, createdAt: -1 });
bookSchema.index({ status: 1, avgRating: -1 });
bookSchema.index({ status: 1, searchTrigrams: 1 });
bookSchema.index({ status: 1, titleLower: 1 });
bookSchema.index({ status: 1, authorLower: 1 });
bookSchema.index({ isbn: 1 });
bookSchema.index({ sellerId: 1, status: 1 });

module.exports = mongoose.model('Book', bookSchema, 'books');
