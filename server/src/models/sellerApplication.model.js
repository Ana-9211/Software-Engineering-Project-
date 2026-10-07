const mongoose = require('mongoose');

const sellerApplicationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    storeName: { type: String, required: true, minlength: 2, maxlength: 100, trim: true },
    description: { type: String, maxlength: 1000, default: '' },
    status: { type: String, required: true, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    rejectionReason: String,
    decidedBy: mongoose.Schema.Types.ObjectId,
    decidedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// at most one pending application per user
sellerApplicationSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
sellerApplicationSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('SellerApplication', sellerApplicationSchema, 'seller_applications');
