# Branch Coverage Report

Online Bookstore. Generated 2026-11-11 on commit `9f570ab`. Reproduce with the commands in the last section.

Scope as in the Code Coverage Report. A branch is each side of an `if`, a ternary, `&&`/`||` or a `switch` case.

## 1. Total

| Branches covered | Branches total | Percent |
|---|---|---|
| 683 | 848 | **80.54%** |

## 2. Per module

| Module | Covered | Total | Percent |
|---|---|---|---|
| `server/src/adapters` | 21 | 31 | 67.74% |
| `server/src/app.js` | 9 | 19 | 47.37% |
| `server/src/config` | 62 | 65 | 95.38% |
| `server/src/container.js` | 2 | 10 | 20.00% |
| `server/src/db` | 0 | 0 | n/a |
| `server/src/middleware` | 90 | 98 | 91.84% |
| `server/src/models` | 1 | 2 | 50.00% |
| `server/src/modules/admin` | 10 | 10 | 100.00% |
| `server/src/modules/auth` | 31 | 35 | 88.57% |
| `server/src/modules/book-management` | 40 | 46 | 86.96% |
| `server/src/modules/cart` | 35 | 42 | 83.33% |
| `server/src/modules/catalog` | 76 | 93 | 81.72% |
| `server/src/modules/inventory` | 13 | 20 | 65.00% |
| `server/src/modules/media` | 45 | 49 | 91.84% |
| `server/src/modules/notification` | 11 | 23 | 47.83% |
| `server/src/modules/order` | 95 | 116 | 81.90% |
| `server/src/modules/payment` | 14 | 25 | 56.00% |
| `server/src/modules/platform` | 3 | 6 | 50.00% |
| `server/src/modules/reporting` | 13 | 14 | 92.86% |
| `server/src/modules/review` | 22 | 29 | 75.86% |
| `server/src/modules/seller` | 22 | 25 | 88.00% |
| `server/src/modules/user` | 40 | 50 | 80.00% |
| `server/src/modules/wishlist` | 6 | 6 | 100.00% |
| `server/src/utils` | 22 | 34 | 64.71% |

## 3. Per file, lowest first (files that contain branches)

| File | Covered | Total | Percent |
|---|---|---|---|
| `server/src/utils/clock.js` | 0 | 1 | 0.00% |
| `server/src/utils/ids.js` | 0 | 3 | 0.00% |
| `server/src/container.js` | 2 | 10 | 20.00% |
| `server/src/adapters/mail/index.js` | 1 | 3 | 33.33% |
| `server/src/modules/auth/auth.routes.js` | 1 | 3 | 33.33% |
| `server/src/utils/AppError.js` | 1 | 3 | 33.33% |
| `server/src/modules/notification/notification.service.js` | 8 | 19 | 42.10% |
| `server/src/modules/order/order.repository.js` | 6 | 13 | 46.15% |
| `server/src/modules/payment/payment.service.js` | 7 | 15 | 46.66% |
| `server/src/app.js` | 9 | 19 | 47.36% |
| `server/src/adapters/mail/mailSenders.js` | 3 | 6 | 50.00% |
| `server/src/adapters/payment/index.js` | 1 | 2 | 50.00% |
| `server/src/middleware/helmetConfig.js` | 2 | 4 | 50.00% |
| `server/src/models/order.model.js` | 1 | 2 | 50.00% |
| `server/src/modules/payment/payment.routes.js` | 1 | 2 | 50.00% |
| `server/src/modules/platform/health.routes.js` | 3 | 6 | 50.00% |
| `server/src/modules/seller/sellerApplication.repository.js` | 4 | 7 | 57.14% |
| `server/src/modules/cart/cart.repository.js` | 3 | 5 | 60.00% |
| `server/src/modules/review/review.repository.js` | 11 | 17 | 64.70% |
| `server/src/modules/inventory/inventory.service.js` | 13 | 20 | 65.00% |
| `server/src/utils/logger.js` | 4 | 6 | 66.66% |
| `server/src/modules/catalog/book.repository.js` | 21 | 31 | 67.74% |
| `server/src/middleware/requireRole.js` | 3 | 4 | 75.00% |
| `server/src/modules/catalog/category.repository.js` | 3 | 4 | 75.00% |
| `server/src/modules/notification/notification.repository.js` | 3 | 4 | 75.00% |
| `server/src/modules/payment/payment.repository.js` | 6 | 8 | 75.00% |
| `server/src/modules/user/user.service.js` | 24 | 31 | 77.41% |
| `server/src/utils/redact.js` | 15 | 19 | 78.94% |
| `server/src/adapters/payment/fakeGateway.js` | 16 | 20 | 80.00% |
| `server/src/modules/book-management/bookManagement.service.js` | 28 | 34 | 82.35% |
| `server/src/middleware/httpsRedirect.js` | 5 | 6 | 83.33% |
| `server/src/modules/user/user.repository.js` | 15 | 18 | 83.33% |
| `server/src/modules/catalog/search.js` | 16 | 19 | 84.21% |
| `server/src/modules/order/order.service.js` | 83 | 97 | 85.56% |
| `server/src/modules/cart/cart.service.js` | 32 | 37 | 86.48% |
| `server/src/middleware/rateLimiter.js` | 9 | 10 | 90.00% |
| `server/src/modules/media/media.service.js` | 39 | 43 | 90.69% |
| `server/src/middleware/validate.js` | 11 | 12 | 91.66% |
| `server/src/modules/review/review.service.js` | 11 | 12 | 91.66% |
| `server/src/modules/catalog/catalog.service.js` | 36 | 39 | 92.30% |
| `server/src/middleware/errorHandler.js` | 13 | 14 | 92.85% |
| `server/src/modules/reporting/reporting.service.js` | 13 | 14 | 92.85% |
| `server/src/modules/auth/auth.service.js` | 30 | 32 | 93.75% |
| `server/src/middleware/sanitize.js` | 16 | 17 | 94.11% |
| `server/src/config/index.js` | 62 | 65 | 95.38% |
| `server/src/middleware/authGuard.js` | 12 | 12 | 100.00% |
| `server/src/middleware/csrfProtection.js` | 17 | 17 | 100.00% |
| `server/src/middleware/requestLogger.js` | 2 | 2 | 100.00% |
| `server/src/modules/admin/admin.service.js` | 10 | 10 | 100.00% |
| `server/src/modules/book-management/bookManagement.routes.js` | 12 | 12 | 100.00% |
| `server/src/modules/media/media.routes.js` | 6 | 6 | 100.00% |
| `server/src/modules/order/orderStatusPolicy.js` | 6 | 6 | 100.00% |
| `server/src/modules/seller/seller.service.js` | 18 | 18 | 100.00% |
| `server/src/modules/user/user.routes.js` | 1 | 1 | 100.00% |
| `server/src/modules/wishlist/wishlist.service.js` | 6 | 6 | 100.00% |
| `server/src/utils/money.js` | 2 | 2 | 100.00% |

## 4. Reading the figures

The lowest files are mostly defensive guards that the public API cannot reach, such as fallbacks for missing configuration and default values in small helpers. No branch coverage target is set in the SRS. The payment service has the largest functional gap; the payment flow is covered end to end by the live checks in the System Validation Report.

## 5. How to reproduce

Same command as the Code Coverage Report. Branch figures are in the "% Branch" column of the text report and in `server/coverage/lcov-report`.
