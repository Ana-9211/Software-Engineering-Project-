const { AppError } = require('../utils/AppError');

// requireRole('seller') lets a caller through when their role list contains any of the given roles
// (FR-29, matrix in SDD 6.6). The role list comes from the database via authGuard, not from the token.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError('UNAUTHENTICATED', 401, 'Login required'));
    if (!req.user.roles.some((r) => roles.includes(r))) {
      return next(new AppError('FORBIDDEN', 403, 'You do not have permission to use this function'));
    }
    return next();
  };
}

module.exports = { requireRole };
