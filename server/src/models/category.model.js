const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  { name: { type: String, required: true, minlength: 1, maxlength: 60, trim: true } },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// unique ignoring case (collation strength 2)
categorySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.model('Category', categorySchema, 'categories');
