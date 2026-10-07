const { AppError } = require('../utils/AppError');

const SESSION_COOKIE = 'session';

// authGuard (interface I-24): verify the token, load the user, check status and token version.
function createAuthGuard({ tokenService, userService }) {
  return async function authGuard(req, res, next) {
    const token = req.cookies && req.cookies[SESSION_COOKIE];
    if (!token || typeof token !== 'string') throw new AppError('UNAUTHENTICATED', 401, 'Login required');
    const payload = tokenService.verify(token); // throws UNAUTHENTICATED when invalid or expired
    const user = await userService.findAuthUser(payload.sub);
    if (!user || user.tokenVersion !== payload.tv) {
      throw new AppError('UNAUTHENTICATED', 401, 'Session is no longer valid');
    }
    if (user.status === 'suspended') throw new AppError('ACCOUNT_SUSPENDED', 403, 'Your account has been suspended');
    req.user = { id: String(user._id), roles: user.roles, name: user.name, email: user.email, status: user.status };
    return next();
  };
}

module.exports = { createAuthGuard, SESSION_COOKIE };
