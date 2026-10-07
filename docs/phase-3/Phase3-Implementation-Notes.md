# Online Bookstore: Phase 3 Implementation Notes

Status: implementation draft for team review. Phase 1 and Phase 2 documents are unchanged and remain the source of truth. Identifiers (FR, VFR, UC, BM, FM, API, S, D, A) are the Phase 1 and Phase 2 identifiers. Only tests that were actually executed are listed as results (section 6).

## 1. How to run it

Requirements: Node.js 20 or newer (developed on Node 24). MongoDB must run as a **replica set** because checkout uses transactions.

```
npm install                      # installs server and client (npm workspaces)
cp .env.example server/.env      # then set JWT_SECRET and CSRF_SECRET
npm run dev:db                   # local single-node replica set on port 27017 (keeps data in .mongo-data/)
npm run seed:demo                # categories, a demo seller, a demo customer, 12 books
ADMIN_EMAIL=admin@bookstore.local ADMIN_PASSWORD='choose-a-password' npm run seed:admin
npm run dev:server               # API on http://localhost:5000
npm run dev:client               # web app on http://localhost:5173 (proxies /api to port 5000)
```

Single-origin run, as deployed (D-02): `npm run build`, set `CLIENT_DIST=../client/dist` in `server/.env`, then `npm start`; Express serves the API and the React build on port 5000.

Other databases: set `MONGODB_URI` to any replica set (Docker image `mongo --replSet`, or MongoDB Atlas).

Demo accounts (password `Password123!`): `seller@bookstore.local` (customer and seller), `customer@bookstore.local`. The email provider is TBD, so the console mailer prints emails, including verification and reset links, to the server console; nothing is delivered. The payment provider is TBD, so the payment page uses a clearly labelled test gateway.

Checks: `npm test` (server, 516 tests), `npm run test:client` (23 tests), `npm run lint`, `node e2e/e2e.mjs` (browser walkthrough, needs the server running and Edge or Chrome; see the header of that file).

## 2. Structure

```
server/src   config, middleware (authGuard, requireRole, validate, csrfProtection, sanitize, rateLimiter,
             errorHandler, requestLogger, helmetConfig), models (11 collections), db, adapters (payment, mail),
             modules/<module> (see the table below), container.js (wiring), app.js, server.js
server/scripts  dev-db, seed-admin, seed-demo-data, validate-openapi, bench-search
server/tests    unit/ and api/ (Jest, supertest, in-memory MongoDB replica set)
client/src      api (ApiClient, endpoints), auth (AuthContext, guards), components, modules (per FM), styles.css
e2e/            browser walkthrough (playwright-core, axe-core)
```

Layout of `server/src/modules`. The layers are `routes` (HTTP, validation, role check), `service` (rules) and `repository` (database access). The Phase 2 layout lists a controller and a repository for every module; the code does **not** follow that for every module, so the table shows what exists:

| Module | routes | controller | service | repository | Notes |
|---|---|---|---|---|---|
| auth | yes | yes | yes (`auth`, `token`, `password`) | `authToken.repository.js` | |
| user | yes | yes | yes | yes | |
| catalog | yes | no | yes | `book.repository.js`, `category.repository.js` | `book.repository.js` is shared by catalog, book-management and inventory (Phase 2 names a BookRepository for each); `search.js` holds the search rules |
| cart | yes | no | yes | yes | |
| wishlist | yes | no | yes | yes | |
| order | yes | no | yes | yes | `orderStatusPolicy.js` |
| payment | yes (webhook) | no | yes | yes | provider code is in `adapters/payment` |
| review | yes | no | yes | yes | |
| seller | yes | no | yes | `sellerApplication.repository.js` | fulfilment calls the order service |
| notification | yes | no | yes | yes | `emailTemplates.js`; provider code is in `adapters/mail` |
| book-management | yes | no | yes | uses catalog `book.repository.js` | |
| inventory | yes | no | yes | uses catalog `book.repository.js` | has no controller of its own, as in Phase 2 |
| admin | yes | no | yes | none | calls other services only |
| reporting | yes | no | yes | uses `order.repository.js` | |
| media | yes | no | yes | none | see deviation below |
| platform | yes (health) | no | none | none | the cross-cutting middleware is in `server/src/middleware` |

In modules without a controller file the handler functions sit in `*.routes.js` and only call the service (no rules in them). Deviations from the Phase 2 layering convention (services reach the database only through repositories, I-03), which Phase 2 was not edited to hide:

- **media** (`media.service.js`) talks to GridFS through the Mongoose connection directly. GridFS is not a Mongoose model, and Phase 2 8.6 puts all image storage behind this service (`saveImage`, `streamImage`), so the storage stays hidden behind one boundary, but it is not a separate repository file.
- **platform** (`health.routes.js`) pings the database connection directly because that is the whole purpose of the health check.
- The wishlist service used the Mongoose model directly in the first Phase 3 version; it now has a `wishlist.repository.js` like the other modules.

## 3. Module and screen coverage

| Module | Where | API |
|---|---|---|
| BM-01 Authentication | `server/src/modules/auth` | API-02 to API-09 |
| BM-02 User and Profile | `modules/user` | API-10 to API-14 |
| BM-03 Catalog (search D-10) | `modules/catalog` (`search.js`, `book.repository.js`) | API-15, 16, 18, 55 to 57 |
| BM-04 Cart | `modules/cart` | API-20 to API-23 |
| BM-05 Wishlist | `modules/wishlist` | API-24 to API-26 |
| BM-06 Order | `modules/order` | API-27, 28, 30 to 32 |
| BM-07 Payment | `modules/payment`, `adapters/payment` | API-29 |
| BM-08 Review | `modules/review` | API-17, 33, 58, 59 |
| BM-09 Seller | `modules/seller` | API-34, 35, 42, 43, 50, 51 |
| BM-10 Inventory (D-06) | `modules/inventory` | API-40 |
| BM-11 Admin | `modules/admin` | API-47 to 49, 52 |
| BM-12 Reporting | `modules/reporting` | API-44, 60 |
| BM-13 Notification | `modules/notification`, `adapters/mail` | API-45, 46 |
| BM-14 Media (GridFS) | `modules/media` | API-19, 41 |
| BM-15 Platform and Security | `middleware`, `modules/platform`, `config` | API-01, 61 |
| BM-16 Book Management | `modules/book-management` | API-36 to 39, 53, 54 |

Frontend: FM-01 `modules/auth`, FM-02 `modules/catalog`, FM-03 `modules/cart`, FM-04 `modules/wishlist`, FM-05 `modules/checkout`, FM-06 `modules/orders`, FM-07 `modules/reviews`, FM-08 `modules/profile`, FM-09 `modules/seller`, FM-10 `modules/admin`, FM-11 `auth/`, `api/`, `components/`. Routes in `client/src/App.jsx` follow screens S-01 to S-30.

## 4. Requirement traceability (FR to use case, module, API/UI, code, test)

Test files are in `server/tests/api` unless noted. `E2E` is `e2e/e2e.mjs`; `CT` is `client/src/test/client.test.jsx`.

| FR | UC | Module | API / screen | Code | Test |
|---|---|---|---|---|---|
| FR-01 | UC-04, 25 | BM-01, BM-13 | API-02 to 04; S-03, S-04 | `auth.service.js`, `notification.service.js` | auth, notification, CT, E2E |
| FR-02 | UC-05 | BM-01 | API-05 to 07; S-05 | `auth.service.js`, `token.service.js`, `authGuard.js` | auth, units, E2E |
| FR-03 | UC-14, 25 | BM-01 | API-08, 09; S-06, S-07 | `auth.service.js` | auth |
| FR-04 | UC-01 | BM-03 | API-15; S-01 | `catalog.service.js` | catalog, E2E |
| FR-05 | UC-02 | BM-03 | API-15; S-01 | `search.js` | catalog, security, E2E |
| FR-06 | UC-02 | BM-03 | API-15, 18; S-01 | `catalog.service.js` | catalog, E2E |
| FR-07 | UC-03 | BM-03, BM-14 | API-16, 17, 19; S-02 | `catalog.service.js`, `media.service.js` | catalog, media, E2E |
| FR-08 | UC-06 | BM-04 | API-20 to 23; S-08 | `cart.service.js` | cart, E2E |
| FR-09 | UC-06 | BM-04, BM-10 | API-21, 22 | `cart.service.js` | cart, E2E |
| FR-10 | UC-07 | BM-05 | API-24 to 26; S-09 | `wishlist.service.js` | cart, E2E |
| FR-11 | UC-08 | BM-06 | API-27; S-10 | `order.service.js` | checkout, E2E |
| FR-12 | UC-08 | BM-04, BM-06 | API-20, 27 | `utils/money.js` | units, cart, E2E |
| FR-13 | UC-08, 09 | BM-06, BM-07 | API-27, 28, 29; S-11 | `order.service.js`, `payment.service.js` | checkout, E2E |
| FR-14 | UC-08, 25 | BM-06, BM-13 | API-28; S-12 | `notification.service.js` | checkout, notification, E2E |
| FR-15 | UC-10 | BM-06 | API-30, 31; S-13, S-14 | `order.service.js` | checkout, seller-admin, E2E |
| FR-16 | UC-11 | BM-06, BM-07, BM-10 | API-32; S-14 | `order.service.js` | checkout, E2E |
| FR-17 | UC-12 | BM-08 | API-17, 33; S-15 | `review.service.js` | review-profile, E2E |
| FR-18 | UC-13 | BM-02 | API-10 to 14; S-16 | `user.service.js` | review-profile, E2E |
| FR-19 | UC-15, 21 | BM-09 | API-34, 35, 50, 51; S-17, S-26 | `seller.service.js` | seller-admin, E2E |
| FR-20 | UC-16 | BM-16, BM-14 | API-36 to 39, 41; S-19, S-20 | `bookManagement.service.js` | catalog, media, E2E |
| FR-21 | UC-17 | BM-10, BM-13 | API-40, 45, 46; S-18, S-21 | `inventory.service.js` | seller-admin, E2E |
| FR-22 | UC-18 | BM-09 | API-42, 43; S-22 | `order.service.js` (`applyItemStatus`) | seller-admin, E2E |
| FR-23 | UC-19 | BM-12 | API-44; S-23 | `reporting.service.js` | seller-admin, E2E |
| FR-24 | UC-05, 20 | BM-01, BM-02, BM-11 | API-05, 47, 48; S-25 | `admin.service.js` | auth, seller-admin, E2E |
| FR-25 | UC-21 | BM-09, BM-11, BM-16 | API-49 to 54; S-26 | `bookManagement.service.js` | seller-admin, E2E |
| FR-26 | UC-23 | BM-03 | API-55 to 57; S-28 | `catalog.service.js` | seller-admin, E2E |
| FR-27 | UC-22 | BM-08 | API-58, 59; S-27 | `review.service.js` | review-profile |
| FR-28 | UC-24 | BM-12 | API-60; S-29 | `reporting.service.js` | seller-admin, E2E |
| FR-29 | UC-05 to 24 | BM-01, BM-15 | all; S-30 | `requireRole.js`, `guards.jsx` | authorization (244 cases), CT, E2E |
| FR-30 | UC-08 | BM-06, BM-10 | API-27, 28 | `inventory.service.js`, `book.repository.js` | checkout (concurrency) |

| VFR | Implementation | Verified by |
|---|---|---|
| VFR-04 | bcrypt cost from `BCRYPT_COST`, minimum 10, `password.service.js` | auth, units |
| VFR-05 | Secure cookies and HSTS in production mode, HTTPS ends at the host | config test only; TLS itself is not tested (hosting TBD) |
| VFR-06 | validation, `sanitize.js`, CSRF double submit, CSP, rate limits | security, authorization; the OWASP ZAP baseline scan was NOT run |
| VFR-07 | lockout, `auth.service.js` | auth |
| VFR-08 | no card fields anywhere, log redaction | security, units |
| VFR-09 | `GET /api/health`, sweeper | security (health); uptime monitor and 99% availability not measured |
| VFR-10 | responsive CSS 360 to 1920 px | E2E (no sideways scroll at 360 and 1920); the 6-step purchase count is by design (A-06), not timed |
| VFR-11 | semantic HTML, labels, contrast | E2E axe-core WCAG 2 A/AA, no serious or critical violations; Lighthouse was NOT run |
| VFR-13 | Jest coverage, ESLint | section 6 |
| VFR-14 | transactions for reserve, confirm, release, cancel, review, approval | checkout, review-profile, seller-admin; the daily backup is a hosting task, not done |
| VFR-15 | `openapi.yaml` unchanged; routes compared with it | openapi test (61 of 61) |

VFR-01, VFR-02 and VFR-03 are not validated; the local measurement in section 6 is indicative only. VFR-12 (browsers) was checked only in Microsoft Edge.

## 5. Implementation decisions and assumptions

These fill gaps without changing Phase 1 or the approved design. Items marked **refinement** differ in detail from a Phase 2 table and are listed so the team can decide whether to update Phase 2.

1. **Libraries (D-15).** `bcryptjs` (pure JavaScript, same bcrypt algorithm) instead of the native `bcrypt` package, to avoid native builds on student machines. Express 5, Mongoose 8, Joi, helmet, express-rate-limit, multer, jsonwebtoken. `nodemailer` was not added because no real mail adapter exists yet.
2. **Phase 3 implementation refinement: `_id` appended to the sort indexes.** The indexes `{status, price}`, `{status, createdAt}`, `{status, avgRating}` and `{status, categoryId, price}` listed in Phase 2 (SDD 4.4.3 and 8.2) were extended: `_id` is appended (and `createdAt` is included in the rating index), and the API sorts by the same keys. The reason is deterministic, stable pagination: records with equal price, rating or timestamp are ordered by `_id`, so a record is never repeated or skipped between pages, and MongoDB can answer that order from the index instead of sorting every match in memory. It does not change the API contract, the page size, the filters or any requirement; it is an implementation refinement relative to the exact index list in Phase 2. Phase 2 was not edited. Effect measured on 10,000 books: a plain browse page went from about 1.4 s (in-memory sort) to about 24 ms (one request at a time).
3. **Refinement: books returned to the public.** `stock` and `reserved` are only returned to the owner and administrators; the public book has `available` (stock minus reserved) and `stockStatus`.
4. **Suspension response.** Suspending a user increases the token version, so the suspended user's open session gets 401 (not 403) on the next request; a login attempt gets 403 `ACCOUNT_SUSPENDED`.
5. **Reactivation (D-05).** Reactivating an account that never verified its email returns it to `pending_verification`, so an administrator cannot skip verification by accident.
6. **Low-stock alert (D-12, I-13).** "Once per crossing" is implemented as: one unread low-stock alert per book; a new one is created only after the seller has read the previous one. Alerts are evaluated when stock is set, when a listing is created and when a sale finalises.
7. **Late payment (D-06).** If the reservation expired and the stock is gone, the payment is refunded and the order stays `PaymentFailed` with `failureReason = stock_unavailable_refunded`; the API answers 409 `ORDER_FAILED_REFUNDED`.
8. **Test gateway.** `clientConfig` of the fake gateway contains a ready "success" and "failure" payment so the browser can simulate the hosted payment form. It exists only in `adapters/payment/fakeGateway.js`; a real provider adapter replaces it by implementing the same four methods.
9. **Seller order views (API-42, API-43).** They return only the seller's own items plus shipping name and address; unpaid orders are never shown. The OpenAPI `Order` schema requires a `summary`, so each seller response carries a `summary` built from that seller's own items only: `subtotal` is the sum of the seller's lines, `tax` uses the same rate and rounding as the customer order, `shippingFee` is 0 because the flat fee belongs to the whole order and is not split between sellers, and `total` is their sum. It never contains another seller's amounts, the order total or the shipping fee; tests check this with two sellers in one order.
10. **ISBN.** Stored without hyphens (digits, final X for ISBN-10). The unique index `{sellerId, isbn}` also covers removed listings, so a removed listing's ISBN cannot be reused by the same seller.
11. **Currency and prices.** Defaults `INR`, 5 % tax, flat 49.00 shipping (A-03, TBD). All are environment variables.
12. **Email address check.** The format is validated but the list of public top-level domains is not, so internal domains such as `.local` work.
13. **Production configuration guard.** With `NODE_ENV=production` the server refuses to start unless `PAYMENT_PROVIDER` and `MAIL_PROVIDER` are set explicitly (besides the secrets and the database URI), so the fake gateway and the console mailer can no longer be picked up by accident. In development and test they remain the defaults. The course demonstration may still name them explicitly (`PAYMENT_PROVIDER=fake`, `MAIL_PROVIDER=console`); the server then logs a warning at start-up. No real payment or email provider exists yet.

## 6. Test evidence (executed)

Environment: one Windows 11 laptop, Node 24.11, MongoDB 7.0.24 replica set (mongodb-memory-server for the tests, a local single-node replica set for the browser walkthrough and the benchmark). Database, API server, browser and load generator all ran on the same machine.

| Check | Command | Result |
|---|---|---|
| Server tests | `npm test` | 12 suites, 516 tests passed, 0 failed |
| Server coverage | `npm run test:coverage -w server` | statements 94.41 %, branches 80.31 %, functions 95.96 %, lines 96.43 % (VFR-13 asks for 70 % lines) |
| Client tests | `npm run test:client` | 1 file, 23 tests passed |
| Lint | `npm run lint` | 0 errors, 0 warnings |
| Browser walkthrough | `node e2e/e2e.mjs` | 41 of 41 steps passed (Microsoft Edge only, real server and database) |
| OpenAPI | `openapi.test.js` | document valid; 61 route handlers, none missing, none extra |
| Access matrix | `authorization.test.js` | 244 cases generated from the SDD role table passed |
| Concurrent reservation | `checkout.test.js` | 20 customers for 5 copies: exactly 5 succeed, reserved never above stock, stock never negative |
| Dependency audit | `npm audit --omit=dev` | 0 vulnerabilities in runtime dependencies. `npm audit` also reports advisories in the development-only test tools Jest and Vitest (not shipped); not upgraded because that needs breaking major versions |

### Search benchmark (development machine only)

`node server/scripts/bench-search.js`: 10,000 approved books, a mix of 10 browse, search and filter requests against `GET /api/books`, 0 % errors in every run. It is a development-machine measurement. It is **not** the formal performance test (PT-01, PT-06), says nothing about a deployed system, and does **not** validate VFR-01, VFR-02 or VFR-03.

| Scenario | What it is | Results (repeated runs) |
|---|---|---|
| Normal load | 100 simulated users, each pausing 1 second between requests | p95 392 ms in the first run; later runs p95 889, 496, 512 and 500 ms (p50 158 to 308 ms) |
| Saturation | 100 simultaneous requests, no pause | p95 821 ms and 925 ms (p50 477 and 539 ms) |
| One request at a time | no concurrency | about 12 to 77 ms per request type (about 24 ms for a browse page) |

Reading: individual queries are fast and use the indexes (a test checks for an index scan and no collection scan). Under 100 users the p95 on this machine is around the 500 ms limit and varies from run to run; the load generator, API server and database compete for the same CPU, so the numbers are noisy. The limit is therefore neither shown to be met nor shown to be missed. The real test needs a deployed environment and a separate load tool.

### NOT RUN

These were not run, so there is no result for them: **OWASP ZAP baseline scan, Lighthouse (performance and accessibility score), k6/JMeter load tests, Firefox, Chrome and Safari cross-browser testing (only Edge was used), TLS checks, backup and restore, uptime monitoring.** The axe-core check in the browser walkthrough is an automated accessibility rule check, not a Lighthouse score. The CSRF, injection, access control, upload and header checks are automated tests in `security.test.js` and `authorization.test.js`, not a ZAP scan.

## 7. Known limitations and technical debt

- No real payment or email provider, hosting, or HTTPS (all TBD in Phase 2).
- **Payment page after a fresh visit.** The payment session (`clientConfig`) is returned only by `POST /api/orders` (API-27). `GET /api/orders/:orderId` (API-31) returns the order, the reservation expiry and the address, but not the payment session, so the approved contract cannot rebuild it. A normal page reload keeps working because the browser keeps the session in the history entry. If the page is opened without it (new tab, saved link), the screen shows a **Restart payment** button. It calls the existing API-27 with the address stored on the order; the contract already says an earlier unpaid order of the same customer is closed and its reservation released, and the cart is unchanged until payment, so the customer gets a new order and a new payment session with the same items. If someone else took the last copy in between, the customer gets the normal `INSUFFICIENT_STOCK` message. No endpoint was added. A cleaner fix (not done, needs a contract change) would be to return the payment session in API-31 for an order that is still `PendingPayment`, or to add a "get payment session" endpoint. Covered by a server test (`checkout.test.js`), a client test and a browser step.
- **Unattached images.** Uploaded images that never get attached to a listing are now removed by `MediaService.cleanupOrphans()`: images older than 24 hours that no listing references (removed listings still count as references) are deleted from GridFS. It runs once an hour inside the web service (like the reservation sweeper) and needs no new endpoint. Limit: an image uploaded and then left unsaved for more than 24 hours is deleted, and the seller must upload it again. Covered by a test in `media.test.js`.
- **Payment captured but order not placed (rare).** If a customer cancels an unpaid order in one tab and the gateway's "payment succeeded" notice arrives afterwards, the order stays closed (`ORDER_NOT_PAYABLE`) and the captured payment is not refunded automatically. The Phase 2 pseudo-code has the same gap. It cannot happen with the fake gateway in a normal run; it must be closed (refund on that path) before a real provider is connected.
- Editing a listing in the web app finds it by paging through `GET /api/seller/books` because the API has no single-listing endpoint.
- A removed listing keeps its ISBN reserved for that seller (unique index `{sellerId, isbn}`).
- Failed token emails (verification, reset) are retried three times in the process but cannot be rebuilt later because the link is not stored; the user can ask for a new link.
- Refund failures stay `refund_pending` with no retry screen (A-05).
- Logout ends all sessions of the user (D-14).
- Startup order fix found during this audit: on an existing database, the automatic index builds could still be running when the books validator was applied, and MongoDB refused to start the server. `initDatabase` now waits for the index builds first.
