const { AuthToken } = require('../../models');

const authTokenRepository = {
  create: (data) => AuthToken.create(data),

  // Consume atomically: only a token that is unused and unexpired matches, and it is marked used in the
  // same operation, so a token can never be accepted twice (FR-03: "can be used once").
  consume: (tokenHash, type, now) =>
    AuthToken.findOneAndUpdate(
      { tokenHash, type, usedAt: null, expiresAt: { $gt: now } },
      { $set: { usedAt: now } },
      { new: true }
    ),

  invalidateOpen: (userId, type, now) => AuthToken.updateMany({ userId, type, usedAt: null }, { $set: { usedAt: now } }),
};

module.exports = { authTokenRepository };
