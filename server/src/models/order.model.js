const mongoose = require('mongoose');

const FULFILMENT = ['Placed', 'Packed', 'Shipped', 'Delivered', 'Cancelled'];
const ORDER_STATUS = ['PendingPayment', 'PaymentFailed', ...FULFILMENT];

// Titles, ISBNs, prices and the address are copied at order time so history never changes.
const orderItemSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, required: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  titleSnapshot: { type: String, required: true },
  isbnSnapshot: { type: String, required: true },
  unitPrice: { type: Number, required: true, min: 0, validate: Number.isInteger },
  quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
  lineTotal: { type: Number, required: true, min: 0, validate: Number.isInteger },
  fulfilmentStatus: { type: String, required: true, enum: FULFILMENT, default: 'Placed' },
});

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    items: { type: [orderItemSchema], required: true },
    shippingAddress: {
      fullName: String,
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
      phone: String,
    },
    subtotal: { type: Number, required: true, validate: Number.isInteger },
    tax: { type: Number, required: true, validate: Number.isInteger },
    shippingFee: { type: Number, required: true, validate: Number.isInteger },
    total: { type: Number, required: true, validate: Number.isInteger },
    status: { type: String, required: true, enum: ORDER_STATUS },
    paymentId: mongoose.Schema.Types.ObjectId,
    reservationExpiresAt: Date,
    failureReason: { type: String, enum: ['payment_failed', 'abandoned', 'expired', 'stock_unavailable_refunded'] },
    placedAt: Date,
    cancelledAt: Date,
  },
  { timestamps: true }
);

orderSchema.pre('validate', function checkTotal() {
  if (this.total !== this.subtotal + this.tax + this.shippingFee) {
    this.invalidate('total', 'order total must equal subtotal + tax + shippingFee');
  }
});

orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ userId: 1, placedAt: -1 });
orderSchema.index({ 'items.sellerId': 1, placedAt: -1 });
orderSchema.index({ status: 1, placedAt: -1 });
orderSchema.index({ status: 1, reservationExpiresAt: 1 });

module.exports = mongoose.model('Order', orderSchema, 'orders');
module.exports.FULFILMENT = FULFILMENT;
