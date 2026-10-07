const jwt = require('jsonwebtoken');
const { AppError } = require('../../utils/AppError');

// Signed session token (D-03): 60 minutes (FR-02), carries the user id and the token version.
function createTokenService({ config }) {
  return {
    sign(user) {
      return jwt.sign({ sub: String(user._id), tv: user.tokenVersion }, config.jwtSecret, {
        algorithm: 'HS256',
        expiresIn: config.sessionMinutes * 60,
      });
    },
    verify(token) {
      try {
        return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
      } catch {
        throw new AppError('UNAUTHENTICATED', 401, 'Session is invalid or has expired');
      }
    },
  };
}

module.exports = { createTokenService };
