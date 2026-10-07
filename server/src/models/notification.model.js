const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    channel: { type: String, required: true, enum: ['email', 'in_app'] },
    type: { type: String, required: true, enum: ['email_verification', 'password_reset', 'order_confirmation', 'low_stock'] },
    subject: { type: String, required: true },
    // ids only; secret tokens are never stored
    payload: mongoose.Schema.Types.Mixed,
    status: { type: String, required: true, enum: ['queued', 'sent', 'failed'], default: 'queued' },
    attempts: { type: Number, required: true, default: 0 },
    lastError: String,
    sentAt: Date,
    readAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ userId: 1, channel: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('Notification', notificationSchema, 'notifications');
