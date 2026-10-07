const mongoose = require('mongoose');

// Gateway references only. No field may hold a card number, expiry or security code (VFR-08);
// strict mode drops any unknown field.
const paymentSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    gateway: { type: String, required: true },
    gatewayOrderId: { type: String, required: true },
    gatewayPaymentId: String,
    amount: { type: Number, required: true, min: 0, validate: Number.isInteger },
    currency: { type: String, required: true },
    status: { type: String, required: true, enum: ['created', 'succeeded', 'failed', 'refund_pending', 'refunded'], default: 'created' },
    refund: {
      gatewayRefundId: String,
      amount: Number,
      requestedAt: Date,
      completedAt: Date,
    },
  },
  { timestamps: true, strict: true }
);

paymentSchema.index({ orderId: 1 }, { unique: true });
paymentSchema.index({ gatewayOrderId: 1 }, { unique: true });
paymentSchema.index({ gatewayPaymentId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Payment', paymentSchema, 'payments');
