// Wires repositories, services and adapters together (constructor injection, SDD section 2 "Testability").
const { withTransaction } = require('./utils/transaction');

const { userRepository } = require('./modules/user/user.repository');
const { createUserService } = require('./modules/user/user.service');
const { authTokenRepository } = require('./modules/auth/authToken.repository');
const { createTokenService } = require('./modules/auth/token.service');
const { createPasswordService } = require('./modules/auth/password.service');
const { createAuthService } = require('./modules/auth/auth.service');
const { notificationRepository } = require('./modules/notification/notification.repository');
const { createNotificationService } = require('./modules/notification/notification.service');
const { bookRepository } = require('./modules/catalog/book.repository');
const { categoryRepository } = require('./modules/catalog/category.repository');
const { createCatalogService } = require('./modules/catalog/catalog.service');
const { createMediaService } = require('./modules/media/media.service');
const { createInventoryService } = require('./modules/inventory/inventory.service');
const { createBookManagementService } = require('./modules/book-management/bookManagement.service');
const { cartRepository } = require('./modules/cart/cart.repository');
const { createCartService } = require('./modules/cart/cart.service');
const { createWishlistService } = require('./modules/wishlist/wishlist.service');
const { orderRepository } = require('./modules/order/order.repository');
const { createOrderService } = require('./modules/order/order.service');
const { paymentRepository } = require('./modules/payment/payment.repository');
const { createPaymentService } = require('./modules/payment/payment.service');
const { reviewRepository } = require('./modules/review/review.repository');
const { createReviewService } = require('./modules/review/review.service');
const { sellerApplicationRepository } = require('./modules/seller/sellerApplication.repository');
const { createSellerService } = require('./modules/seller/seller.service');
const { createAdminService } = require('./modules/admin/admin.service');
const { createReportingService } = require('./modules/reporting/reporting.service');

function createContainer({ config, clock, gateway, mailer, retryDelaysMs }) {
  const userService = createUserService({ repo: userRepository });
  const tokenService = createTokenService({ config });
  const passwordService = createPasswordService({ config });

  // the order lookup is needed only for retrying failed confirmation emails
  let orderService;
  const notificationService = createNotificationService({
    repo: notificationRepository,
    mailer,
    config,
    clock,
    retryDelaysMs,
    loadOrder: async (orderId) => {
      const order = orderId && (await orderRepository.findById(orderId));
      const user = order && (await userService.findById(order.userId));
      return order && user ? { order: JSON.parse(JSON.stringify(order)), user } : null;
    },
  });

  const authService = createAuthService({ userService, tokenRepo: authTokenRepository, passwordService, tokenService, notificationService, clock, config });

  // Catalog needs review statistics, Review needs Catalog: the statistics function is resolved lazily
  let reviewService;
  const catalogService = createCatalogService({
    bookRepo: bookRepository,
    categoryRepo: categoryRepository,
    reviewStats: (bookId, session) => reviewService.stats(bookId, session),
  });
  const mediaService = createMediaService({ clock, findReferencedImageIds: (ids) => bookRepository.findReferencedImageIds(ids) });
  const inventoryService = createInventoryService({ bookRepo: bookRepository, notificationService, toBook: catalogService.toBook });
  const bookManagementService = createBookManagementService({ bookRepo: bookRepository, catalogService, mediaService, inventoryService });
  const cartService = createCartService({ cartRepo: cartRepository, bookRepo: bookRepository, config });
  const wishlistService = createWishlistService({ bookRepo: bookRepository, catalogService });
  const paymentService = createPaymentService({ repo: paymentRepository, gateway, config, clock });

  orderService = createOrderService({
    repo: orderRepository,
    cartService,
    inventoryService,
    paymentService,
    notificationService,
    userService,
    clock,
    config,
    withTransaction,
  });
  reviewService = createReviewService({
    repo: reviewRepository,
    bookRepo: bookRepository,
    orderRepo: orderRepository,
    catalogService,
    userService,
    withTransaction,
  });
  const sellerService = createSellerService({ repo: sellerApplicationRepository, userService, orderService, clock, withTransaction });
  const adminService = createAdminService({ userService, authService, sellerService, bookManagementService });
  const reportingService = createReportingService({ orderRepo: orderRepository });

  return {
    config,
    clock,
    gateway,
    mailer,
    userService,
    tokenService,
    authService,
    notificationService,
    catalogService,
    mediaService,
    inventoryService,
    bookManagementService,
    cartService,
    wishlistService,
    paymentService,
    orderService,
    reviewService,
    sellerService,
    adminService,
    reportingService,
  };
}

module.exports = { createContainer };
