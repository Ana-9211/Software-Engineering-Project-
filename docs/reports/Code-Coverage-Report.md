# Code Coverage Report

Online Bookstore. Generated 2026-11-11 on commit `9f570ab`. Reproduce with the commands in the last section.

Scope: server source (`server/src/**/*.js`, excluding `src/server.js`, the process entry point). Target from the SRS (VFR-13): line coverage of 70% or more.

## 1. Totals

| Metric | Covered | Total | Percent | Target | Result |
|---|---|---|---|---|---|
| Statements | 1938 | 2054 | 94.35% | none set | n/a |
| Lines | 1742 | 1808 | 96.34% | 70% | PASS |
| Functions | 484 | 505 | 95.84% | none set | n/a |
| Branches | 683 | 848 | 80.54% | none set | n/a |

## 2. Per file

| File | Statements | Lines | Functions | Branches |
|---|---|---|---|---|
| `server/src/adapters/mail/index.js` | 66.66% | 66.66% | 100.00% | 33.33% |
| `server/src/adapters/mail/mailSenders.js` | 100.00% | 100.00% | 100.00% | 50.00% |
| `server/src/adapters/payment/fakeGateway.js` | 95.55% | 97.56% | 100.00% | 80.00% |
| `server/src/adapters/payment/index.js` | 80.00% | 80.00% | 100.00% | 50.00% |
| `server/src/app.js` | 94.00% | 95.91% | 33.33% | 47.36% |
| `server/src/config/index.js` | 92.59% | 100.00% | 100.00% | 95.38% |
| `server/src/container.js` | 94.44% | 94.33% | 75.00% | 20.00% |
| `server/src/db/connect.js` | 72.22% | 66.66% | 66.66% | 100.00% |
| `server/src/middleware/authGuard.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/middleware/csrfProtection.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/middleware/errorHandler.js` | 93.75% | 100.00% | 100.00% | 92.85% |
| `server/src/middleware/helmetConfig.js` | 100.00% | 100.00% | 100.00% | 50.00% |
| `server/src/middleware/httpsRedirect.js` | 85.71% | 100.00% | 100.00% | 83.33% |
| `server/src/middleware/rateLimiter.js` | 100.00% | 100.00% | 100.00% | 90.00% |
| `server/src/middleware/requestLogger.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/middleware/requireRole.js` | 88.88% | 100.00% | 100.00% | 75.00% |
| `server/src/middleware/sanitize.js` | 92.85% | 100.00% | 100.00% | 94.11% |
| `server/src/middleware/validate.js` | 100.00% | 100.00% | 100.00% | 91.66% |
| `server/src/models/authToken.model.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/models/book.model.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/models/cart.model.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/models/category.model.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/models/index.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/models/notification.model.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/models/order.model.js` | 93.33% | 93.33% | 100.00% | 50.00% |
| `server/src/models/payment.model.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/models/review.model.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/models/sellerApplication.model.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/models/user.model.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/models/wishlist.model.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/admin/admin.routes.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/admin/admin.service.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/auth/auth.controller.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/auth/auth.routes.js` | 94.73% | 94.73% | 66.66% | 33.33% |
| `server/src/modules/auth/auth.service.js` | 98.66% | 100.00% | 100.00% | 93.75% |
| `server/src/modules/auth/authToken.repository.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/auth/password.service.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/auth/token.service.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/book-management/bookManagement.routes.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/book-management/bookManagement.service.js` | 95.65% | 100.00% | 100.00% | 82.35% |
| `server/src/modules/cart/cart.repository.js` | 100.00% | 100.00% | 100.00% | 60.00% |
| `server/src/modules/cart/cart.routes.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/cart/cart.service.js` | 97.14% | 98.24% | 100.00% | 86.48% |
| `server/src/modules/catalog/book.repository.js` | 96.55% | 98.11% | 100.00% | 67.74% |
| `server/src/modules/catalog/catalog.routes.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/catalog/catalog.service.js` | 98.36% | 100.00% | 100.00% | 92.30% |
| `server/src/modules/catalog/category.repository.js` | 94.11% | 93.75% | 100.00% | 75.00% |
| `server/src/modules/catalog/search.js` | 86.66% | 86.95% | 100.00% | 84.21% |
| `server/src/modules/inventory/inventory.routes.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/inventory/inventory.service.js` | 81.25% | 83.78% | 90.90% | 65.00% |
| `server/src/modules/media/media.routes.js` | 96.15% | 100.00% | 83.33% | 100.00% |
| `server/src/modules/media/media.service.js` | 96.77% | 97.95% | 90.90% | 90.69% |
| `server/src/modules/notification/emailTemplates.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/notification/notification.repository.js` | 82.35% | 86.66% | 75.00% | 75.00% |
| `server/src/modules/notification/notification.routes.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/notification/notification.service.js` | 73.33% | 77.58% | 80.00% | 42.10% |
| `server/src/modules/order/order.repository.js` | 100.00% | 100.00% | 100.00% | 46.15% |
| `server/src/modules/order/order.routes.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/order/order.service.js` | 92.93% | 96.07% | 100.00% | 85.56% |
| `server/src/modules/order/orderStatusPolicy.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/payment/payment.repository.js` | 92.30% | 90.90% | 88.88% | 75.00% |
| `server/src/modules/payment/payment.routes.js` | 100.00% | 100.00% | 100.00% | 50.00% |
| `server/src/modules/payment/payment.service.js` | 84.44% | 85.36% | 100.00% | 46.66% |
| `server/src/modules/platform/health.routes.js` | 88.23% | 87.50% | 100.00% | 50.00% |
| `server/src/modules/reporting/reporting.routes.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/reporting/reporting.service.js` | 100.00% | 100.00% | 100.00% | 92.85% |
| `server/src/modules/review/review.repository.js` | 92.85% | 95.65% | 85.71% | 64.70% |
| `server/src/modules/review/review.routes.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/review/review.service.js` | 100.00% | 100.00% | 100.00% | 91.66% |
| `server/src/modules/seller/seller.routes.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/seller/seller.service.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/seller/sellerApplication.repository.js` | 93.75% | 92.85% | 100.00% | 57.14% |
| `server/src/modules/user/user.controller.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/user/user.repository.js` | 93.75% | 96.42% | 100.00% | 83.33% |
| `server/src/modules/user/user.routes.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/user/user.service.js` | 93.42% | 100.00% | 100.00% | 77.41% |
| `server/src/modules/wishlist/wishlist.repository.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/wishlist/wishlist.routes.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/modules/wishlist/wishlist.service.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/utils/AppError.js` | 100.00% | 100.00% | 100.00% | 33.33% |
| `server/src/utils/clock.js` | 75.00% | 85.71% | 60.00% | 0.00% |
| `server/src/utils/ids.js` | 90.90% | 100.00% | 75.00% | 0.00% |
| `server/src/utils/logger.js` | 92.30% | 91.66% | 83.33% | 66.66% |
| `server/src/utils/money.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/utils/pagination.js` | 100.00% | 100.00% | 100.00% | 100.00% |
| `server/src/utils/redact.js` | 80.95% | 100.00% | 100.00% | 78.94% |
| `server/src/utils/transaction.js` | 100.00% | 100.00% | 100.00% | 100.00% |

## 3. Lowest line coverage

| File | Lines |
|---|---|
| `server/src/adapters/mail/index.js` | 66.66% |
| `server/src/db/connect.js` | 66.66% |
| `server/src/modules/notification/notification.service.js` | 77.58% |
| `server/src/adapters/payment/index.js` | 80.00% |
| `server/src/modules/inventory/inventory.service.js` | 83.78% |
| `server/src/modules/payment/payment.service.js` | 85.36% |
| `server/src/utils/clock.js` | 85.71% |
| `server/src/modules/notification/notification.repository.js` | 86.66% |

## 4. Reading the figures

Coverage is measured by Jest (Istanbul) while the 531 server tests run against a real MongoDB instance. It covers the server only. The client has 28 component tests and is exercised end to end by `e2e/e2e.mjs` (41 steps); neither is part of these percentages.

## 5. How to reproduce

```
cd server
npx jest --runInBand --coverage
```

The HTML report is written to `server/coverage/lcov-report/index.html`.
