const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const compression = require('compression');

const defaultConfig = require('./config');
const { systemClock } = require('./utils/clock');
const { createGateway } = require('./adapters/payment');
const { createMailer } = require('./adapters/mail');
const { createContainer } = require('./container');

const { helmetConfig } = require('./middleware/helmetConfig');
const { requestLogger } = require('./middleware/requestLogger');
const { createRateLimiter } = require('./middleware/rateLimiter');
const { sanitize } = require('./middleware/sanitize');
const { csrfProtection } = require('./middleware/csrfProtection');
const { createAuthGuard } = require('./middleware/authGuard');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const { createAuthController } = require('./modules/auth/auth.controller');
const { createAuthRouter } = require('./modules/auth/auth.routes');
const { createUserController } = require('./modules/user/user.controller');
const { createUserRouter } = require('./modules/user/user.routes');
const { createCatalogRouters } = require('./modules/catalog/catalog.routes');
const { createMediaRouters } = require('./modules/media/media.routes');
const { createBookManagementRouters } = require('./modules/book-management/bookManagement.routes');
const { createInventoryRouter } = require('./modules/inventory/inventory.routes');
const { createCartRouter } = require('./modules/cart/cart.routes');
const { createWishlistRouter } = require('./modules/wishlist/wishlist.routes');
const { createOrderRouter } = require('./modules/order/order.routes');
const { createPaymentRouter } = require('./modules/payment/payment.routes');
const { createReviewRouters } = require('./modules/review/review.routes');
const { createSellerRouters } = require('./modules/seller/seller.routes');
const { createReportingRouters } = require('./modules/reporting/reporting.routes');
const { createNotificationRouter } = require('./modules/notification/notification.routes');
const { createAdminRouter } = require('./modules/admin/admin.routes');
const { createHealthRouter } = require('./modules/platform/health.routes');

// Builds the Express application. Adapters and the clock can be replaced (tests use a fake gateway,
// a memory mailer and a fake clock).
function createApp(overrides = {}) {
  const config = overrides.config || defaultConfig;
  const clock = overrides.clock || systemClock;
  const gateway = overrides.gateway || createGateway(config);
  const mailer = overrides.mailer || createMailer(config);
  const container = createContainer({ config, clock, gateway, mailer, retryDelaysMs: overrides.retryDelaysMs });

  const authGuard = createAuthGuard({ tokenService: container.tokenService, userService: container.userService });
  const authLimiter = createRateLimiter({ limit: config.rateLimitAuth });
  const globalLimiter = createRateLimiter({ limit: config.rateLimitGlobal });

  const app = express();
  app.disable('x-powered-by');
  if (config.isProd) app.set('trust proxy', 1); // TLS ends at the hosting platform
  app.use(helmetConfig);
  app.use(compression());
  app.use(requestLogger);
  app.use(cookieParser());
  app.use('/api', globalLimiter);

  // The payment webhook is signed over the raw body and is not called by a browser: it comes before the
  // JSON parser and the CSRF check.
  app.use('/api/payments', createPaymentRouter({ orderService: container.orderService }));

  app.use(express.json({ limit: '100kb' }));
  app.use('/api', sanitize);
  app.use('/api', csrfProtection);

  const authController = createAuthController({ authService: container.authService, config });
  app.use('/api/auth', createAuthRouter({ controller: authController, authGuard, authLimiter }));

  const userController = createUserController({ userService: container.userService });
  app.use('/api/profile', createUserRouter({ controller: userController, authGuard }));

  const catalog = createCatalogRouters({ catalogService: container.catalogService, authGuard });
  const reviews = createReviewRouters({ reviewService: container.reviewService, authGuard });
  const media = createMediaRouters({ mediaService: container.mediaService, authGuard });
  const bookManagement = createBookManagementRouters({
    bookManagementService: container.bookManagementService,
    adminService: container.adminService,
    authGuard,
  });
  const sellers = createSellerRouters({ sellerService: container.sellerService, authGuard });
  const reports = createReportingRouters({ reportingService: container.reportingService, authGuard });

  app.use('/api/books/:bookId/reviews', reviews.bookReviews);
  app.use('/api/books', catalog.publicBooks);
  app.use('/api/categories', catalog.categories);
  app.use('/api/images', media.images);

  app.use('/api/cart', createCartRouter({ cartService: container.cartService, authGuard }));
  app.use('/api/wishlist', createWishlistRouter({ wishlistService: container.wishlistService, authGuard }));
  app.use('/api/orders', createOrderRouter({ orderService: container.orderService, authGuard }));

  app.use('/api/seller/books', bookManagement.seller);
  app.use('/api/seller/books', createInventoryRouter({ inventoryService: container.inventoryService, authGuard }));
  app.use('/api/seller/uploads', media.sellerUploads);
  app.use('/api/seller/reports', reports.seller);
  app.use('/api/seller', sellers.seller);
  app.use('/api/notifications', createNotificationRouter({ notificationService: container.notificationService, authGuard }));

  app.use('/api/admin/seller-applications', sellers.adminApplications);
  app.use('/api/admin/books', bookManagement.admin);
  app.use('/api/admin/categories', catalog.adminCategories);
  app.use('/api/admin/reviews', reviews.admin);
  app.use('/api/admin/reports', reports.admin);
  app.use('/api/admin', createAdminRouter({ adminService: container.adminService, authGuard }));

  app.use('/api/health', createHealthRouter());
  app.use('/api', notFoundHandler);

  // single-origin deployment (D-02): Express also serves the React build
  const dist = config.clientDist && path.resolve(config.clientDist);
  if (dist && fs.existsSync(dist)) {
    app.use(express.static(dist, { maxAge: '1y', index: false, setHeaders: (res, file) => file.endsWith('.html') && res.setHeader('Cache-Control', 'no-cache') }));
    app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return { app, container };
}

module.exports = { createApp };
