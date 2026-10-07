const mongoose = require('mongoose');

const authTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, required: true, enum: ['email_verification', 'password_reset'] },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

authTokenSchema.index({ tokenHash: 1 }, { unique: true });
authTokenSchema.index({ userId: 1, type: 1 });
// TTL clean-up; validity is also checked in code
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AuthToken', authTokenSchema, 'auth_tokens');
