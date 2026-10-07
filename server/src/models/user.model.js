const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, maxlength: 30, default: '' },
    fullName: { type: String, required: true, minlength: 1, maxlength: 100 },
    line1: { type: String, required: true, minlength: 1, maxlength: 150 },
    line2: { type: String, maxlength: 150, default: '' },
    city: { type: String, required: true, minlength: 1, maxlength: 80 },
    state: { type: String, required: true, minlength: 1, maxlength: 80 },
    postalCode: { type: String, required: true, minlength: 3, maxlength: 12 },
    country: { type: String, required: true, minlength: 2, maxlength: 60 },
    phone: { type: String, required: true, minlength: 7, maxlength: 15 },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, minlength: 1, maxlength: 100, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    roles: {
      type: [{ type: String, enum: ['customer', 'seller', 'admin'] }],
      default: ['customer'],
      validate: (v) => v.length > 0,
    },
    status: { type: String, required: true, enum: ['pending_verification', 'active', 'suspended'], default: 'pending_verification' },
    emailVerifiedAt: Date,
    phone: { type: String, minlength: 7, maxlength: 15 },
    addresses: { type: [addressSchema], default: [] },
    sellerProfile: {
      storeName: String,
      description: String,
      approvedAt: Date,
    },
    failedLoginCount: { type: Number, required: true, default: 0 },
    lockUntil: Date,
    tokenVersion: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ roles: 1, status: 1 });

module.exports = mongoose.model('User', userSchema, 'users');
