const { AppError, notFound } = require('../../utils/AppError');
const logger = require('../../utils/logger');

// BM-11 Admin: user administration (FR-24) plus the listings that need an administrator decision.
function createAdminService({ userService, authService, sellerService, bookManagementService }) {
  return {
    listUsers: (filter, page) => userService.listUsers(filter, page),

    // I-21: suspending ends all sessions of the user (token version) so the block is immediate
    async setUserStatus(adminId, userId, status) {
      if (String(adminId) === String(userId)) {
        throw new AppError('CANNOT_MODIFY_SELF', 409, 'Administrators cannot change their own status');
      }
      const target = await userService.findById(userId);
      if (!target) throw notFound('User not found');
      // reactivating an account that never verified its email must not skip verification (D-05)
      const next = status === 'active' && !target.emailVerifiedAt ? 'pending_verification' : status;
      const user = await userService.setStatus(userId, next);
      if (status === 'suspended') await authService.invalidateSessions(userId);
      logger.audit('user_status_changed', { adminId: String(adminId), userId: String(userId), status: next });
      return user;
    },

    listApplications: (status, page) => sellerService.listApplications(status, page),
    listPendingListings: (status, page) => bookManagementService.listPendingListings(status, page),
  };
}

module.exports = { createAdminService };
