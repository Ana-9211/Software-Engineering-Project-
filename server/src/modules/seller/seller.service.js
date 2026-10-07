const { AppError, notFound } = require('../../utils/AppError');
const { toPage } = require('../../utils/pagination');
const logger = require('../../utils/logger');

const PAGE_SIZE = 20;

const toApplication = (a, applicantName) => ({
  id: String(a._id),
  userId: String(a.userId),
  applicantName,
  storeName: a.storeName,
  description: a.description,
  status: a.status,
  rejectionReason: a.rejectionReason,
  createdAt: a.createdAt,
  decidedAt: a.decidedAt,
});

// BM-09 Seller: applications (FR-19, FR-25) and fulfilment of own order items (FR-22).
function createSellerService({ repo, userService, orderService, clock, withTransaction }) {
  return {
    async apply(userId, dto) {
      const user = await userService.findById(userId);
      if (user.roles.includes('seller')) throw new AppError('ALREADY_SELLER', 409, 'You are already a seller');
      const created = await repo.create({ userId, storeName: dto.storeName, description: dto.description || '' });
      return toApplication(created, user.name);
    },

    async getMyApplication(userId) {
      const a = await repo.findLatestByUser(userId);
      if (!a) throw notFound('No application submitted');
      return toApplication(a);
    },

    async listApplications(status, page) {
      const { items, totalItems } = await repo.listByStatus(status || 'pending', page, PAGE_SIZE);
      const names = await userService.namesByIds(items.map((a) => a.userId));
      return toPage(items.map((a) => toApplication(a, names.get(String(a.userId)))), page, PAGE_SIZE, totalItems);
    },

    // I-20, I-19: approving gives the applicant the seller role in the same transaction
    async decideApplication(adminId, applicationId, decision, reason) {
      const now = clock.now();
      const decided = await withTransaction(async (session) => {
        const update =
          decision === 'approve'
            ? { $set: { status: 'approved', decidedBy: adminId, decidedAt: now } }
            : { $set: { status: 'rejected', decidedBy: adminId, decidedAt: now, rejectionReason: reason } };
        const app = await repo.decide(applicationId, update, { session });
        if (!app) return null;
        if (decision === 'approve') {
          await userService.grantRole(app.userId, 'seller', { storeName: app.storeName, description: app.description, approvedAt: now }, { session });
        }
        return app;
      });
      if (!decided) {
        const exists = await repo.findById(applicationId);
        if (!exists) throw notFound('Application not found');
        throw new AppError('NOT_PENDING', 409, 'This application has already been decided');
      }
      logger.audit(`seller_application_${decision}`, { adminId: String(adminId), applicationId: String(applicationId) });
      return toApplication(decided);
    },

    // FulfilmentService (I-18)
    listSellerOrders: (sellerId, status, page) => orderService.listSellerOrders(sellerId, status, page),
    updateItemStatus: (sellerId, orderId, itemId, status) => orderService.applyItemStatus(orderId, itemId, sellerId, status),
  };
}

module.exports = { createSellerService };
