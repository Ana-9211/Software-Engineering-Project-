# Unit Test Report

Online Bookstore. Generated 2026-11-11 on commit `9f570ab`. Reproduce with the commands in the last section.

## 1. Summary

| Suite group | Runner | Test files | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|---|---|
| Server (API, services, security, data integrity) | Jest, real MongoDB | 13 | 531 | 531 | 0 | 0 |
| Client (React components and pages) | Vitest | 1 | 28 | 28 | 0 | 0 |
| **Total** | | 14 | **559** | **559** | 0 | 0 |

## 2. Server results per test file

| Test file | Tests | Passed | Failed | Time |
|---|---|---|---|---|
| `server/tests/api/auth.test.js` | 15 | 15 | 0 | 8.8 s |
| `server/tests/api/authorization.test.js` | 244 | 244 | 0 | 3.8 s |
| `server/tests/api/cart.test.js` | 11 | 11 | 0 | 5.7 s |
| `server/tests/api/catalog.test.js` | 37 | 37 | 0 | 4.9 s |
| `server/tests/api/checkout.test.js` | 39 | 39 | 0 | 35.2 s |
| `server/tests/api/media.test.js` | 9 | 9 | 0 | 4.4 s |
| `server/tests/api/notification.test.js` | 5 | 5 | 0 | 3.0 s |
| `server/tests/api/openapi.test.js` | 67 | 67 | 0 | 3.6 s |
| `server/tests/api/review-profile.test.js` | 13 | 13 | 0 | 13.9 s |
| `server/tests/api/security.test.js` | 29 | 29 | 0 | 4.8 s |
| `server/tests/api/seller-admin.test.js` | 30 | 30 | 0 | 12.1 s |
| `server/tests/unit/accountLimiter.test.js` | 5 | 5 | 0 | 0.4 s |
| `server/tests/unit/units.test.js` | 27 | 27 | 0 | 1.4 s |

## 3. Client results per test file

| Test file | Tests | Passed | Failed |
|---|---|---|---|
| `client/src/test/client.test.jsx` | 28 | 28 | 0 |

## 4. Every test case

Grouped by file; each line is the test title from the test source.

### `server/tests/api/auth.test.js`

- PASS: registration and email verification (FR-01, UC-04) registers, emails a link, verifies, then can log in
- PASS: registration and email verification (FR-01, UC-04) accepts any well-formed email address, including internal domains, and refuses malformed ones
- PASS: registration and email verification (FR-01, UC-04) stores only a bcrypt hash and never the password or the token
- PASS: registration and email verification (FR-01, UC-04) rejects a duplicate email and invalid input
- PASS: registration and email verification (FR-01, UC-04) an unknown or reused verification token is rejected
- PASS: registration and email verification (FR-01, UC-04) resend returns the same reply for known and unknown emails
- PASS: login, session and logout (FR-02, UC-05) sets an HttpOnly cookie, /me works, logout invalidates the token
- PASS: login, session and logout (FR-02, UC-05) wrong password and unknown email give the same error
- PASS: login, session and logout (FR-02, UC-05) locks the account for 15 minutes after 5 failures (VFR-07)
- PASS: login, session and logout (FR-02, UC-05) a successful login resets the failure counter
- PASS: login, session and logout (FR-02, UC-05) a suspended user cannot log in and an existing session ends (FR-24)
- PASS: login, session and logout (FR-02, UC-05) an expired session token is refused (60 minutes, FR-02)
- PASS: password reset (FR-03, UC-14) emailed link works once and ends all sessions
- PASS: password reset (FR-03, UC-14) the reset link expires after 30 minutes
- PASS: password reset (FR-03, UC-14) same reply for unknown emails

### `server/tests/api/authorization.test.js`

- PASS: the matrix in the design document has all 61 endpoints
- PASS: access as guest API-01 GET /api/auth/csrf-token
- PASS: access as guest API-02 POST /api/auth/register
- PASS: access as guest API-03 POST /api/auth/verify-email
- PASS: access as guest API-04 POST /api/auth/resend-verification
- PASS: access as guest API-05 POST /api/auth/login
- PASS: access as guest API-06 POST /api/auth/logout
- PASS: access as guest API-07 GET /api/auth/me
- PASS: access as guest API-08 POST /api/auth/forgot-password
- PASS: access as guest API-09 POST /api/auth/reset-password
- PASS: access as guest API-10 GET /api/profile
- PASS: access as guest API-11 PATCH /api/profile
- PASS: access as guest API-12 POST /api/profile/addresses
- PASS: access as guest API-13 PATCH /api/profile/addresses/:addressId
- PASS: access as guest API-14 DELETE /api/profile/addresses/:addressId
- PASS: access as guest API-15 GET /api/books
- PASS: access as guest API-16 GET /api/books/:bookId
- PASS: access as guest API-17 GET /api/books/:bookId/reviews
- PASS: access as guest API-18 GET /api/categories
- PASS: access as guest API-19 GET /api/images/:imageId
- PASS: access as guest API-20 GET /api/cart
- PASS: access as guest API-21 POST /api/cart/items
- PASS: access as guest API-22 PATCH /api/cart/items/:bookId
- PASS: access as guest API-23 DELETE /api/cart/items/:bookId
- PASS: access as guest API-24 GET /api/wishlist
- PASS: access as guest API-25 PUT /api/wishlist/items/:bookId
- PASS: access as guest API-26 DELETE /api/wishlist/items/:bookId
- PASS: access as guest API-27 POST /api/orders
- PASS: access as guest API-28 POST /api/orders/:orderId/payment/confirm
- PASS: access as guest API-30 GET /api/orders
- PASS: access as guest API-31 GET /api/orders/:orderId
- PASS: access as guest API-32 POST /api/orders/:orderId/cancel
- PASS: access as guest API-33 POST /api/books/:bookId/reviews
- PASS: access as guest API-34 POST /api/seller/applications
- PASS: access as guest API-35 GET /api/seller/applications/me
- PASS: access as guest API-36 GET /api/seller/books
- PASS: access as guest API-37 POST /api/seller/books
- PASS: access as guest API-38 PATCH /api/seller/books/:bookId
- PASS: access as guest API-39 DELETE /api/seller/books/:bookId
- PASS: access as guest API-40 PATCH /api/seller/books/:bookId/inventory
- PASS: access as guest API-41 POST /api/seller/uploads/images
- PASS: access as guest API-42 GET /api/seller/orders
- PASS: access as guest API-43 PATCH /api/seller/orders/:orderId/items/:itemId/status
- PASS: access as guest API-44 GET /api/seller/reports/sales
- PASS: access as guest API-45 GET /api/notifications
- PASS: access as guest API-46 PATCH /api/notifications/:notificationId/read
- PASS: access as guest API-47 GET /api/admin/users
- PASS: access as guest API-48 PATCH /api/admin/users/:userId/status
- PASS: access as guest API-49 GET /api/admin/seller-applications
- PASS: access as guest API-50 POST /api/admin/seller-applications/:applicationId/approve
- PASS: access as guest API-51 POST /api/admin/seller-applications/:applicationId/reject
- PASS: access as guest API-52 GET /api/admin/books
- PASS: access as guest API-53 POST /api/admin/books/:bookId/approve
- PASS: access as guest API-54 POST /api/admin/books/:bookId/reject
- PASS: access as guest API-55 POST /api/admin/categories
- PASS: access as guest API-56 PATCH /api/admin/categories/:categoryId
- PASS: access as guest API-57 DELETE /api/admin/categories/:categoryId
- PASS: access as guest API-58 GET /api/admin/reviews
- PASS: access as guest API-59 DELETE /api/admin/reviews/:reviewId
- PASS: access as guest API-60 GET /api/admin/reports/platform
- PASS: access as guest API-61 GET /api/health
- PASS: access as customer API-01 GET /api/auth/csrf-token
- PASS: access as customer API-02 POST /api/auth/register
- PASS: access as customer API-03 POST /api/auth/verify-email
- PASS: access as customer API-04 POST /api/auth/resend-verification
- PASS: access as customer API-05 POST /api/auth/login
- PASS: access as customer API-06 POST /api/auth/logout
- PASS: access as customer API-07 GET /api/auth/me
- PASS: access as customer API-08 POST /api/auth/forgot-password
- PASS: access as customer API-09 POST /api/auth/reset-password
- PASS: access as customer API-10 GET /api/profile
- PASS: access as customer API-11 PATCH /api/profile
- PASS: access as customer API-12 POST /api/profile/addresses
- PASS: access as customer API-13 PATCH /api/profile/addresses/:addressId
- PASS: access as customer API-14 DELETE /api/profile/addresses/:addressId
- PASS: access as customer API-15 GET /api/books
- PASS: access as customer API-16 GET /api/books/:bookId
- PASS: access as customer API-17 GET /api/books/:bookId/reviews
- PASS: access as customer API-18 GET /api/categories
- PASS: access as customer API-19 GET /api/images/:imageId
- PASS: access as customer API-20 GET /api/cart
- PASS: access as customer API-21 POST /api/cart/items
- PASS: access as customer API-22 PATCH /api/cart/items/:bookId
- PASS: access as customer API-23 DELETE /api/cart/items/:bookId
- PASS: access as customer API-24 GET /api/wishlist
- PASS: access as customer API-25 PUT /api/wishlist/items/:bookId
- PASS: access as customer API-26 DELETE /api/wishlist/items/:bookId
- PASS: access as customer API-27 POST /api/orders
- PASS: access as customer API-28 POST /api/orders/:orderId/payment/confirm
- PASS: access as customer API-30 GET /api/orders
- PASS: access as customer API-31 GET /api/orders/:orderId
- PASS: access as customer API-32 POST /api/orders/:orderId/cancel
- PASS: access as customer API-33 POST /api/books/:bookId/reviews
- PASS: access as customer API-34 POST /api/seller/applications
- PASS: access as customer API-35 GET /api/seller/applications/me
- PASS: access as customer API-36 GET /api/seller/books
- PASS: access as customer API-37 POST /api/seller/books
- PASS: access as customer API-38 PATCH /api/seller/books/:bookId
- PASS: access as customer API-39 DELETE /api/seller/books/:bookId
- PASS: access as customer API-40 PATCH /api/seller/books/:bookId/inventory
- PASS: access as customer API-41 POST /api/seller/uploads/images
- PASS: access as customer API-42 GET /api/seller/orders
- PASS: access as customer API-43 PATCH /api/seller/orders/:orderId/items/:itemId/status
- PASS: access as customer API-44 GET /api/seller/reports/sales
- PASS: access as customer API-45 GET /api/notifications
- PASS: access as customer API-46 PATCH /api/notifications/:notificationId/read
- PASS: access as customer API-47 GET /api/admin/users
- PASS: access as customer API-48 PATCH /api/admin/users/:userId/status
- PASS: access as customer API-49 GET /api/admin/seller-applications
- PASS: access as customer API-50 POST /api/admin/seller-applications/:applicationId/approve
- PASS: access as customer API-51 POST /api/admin/seller-applications/:applicationId/reject
- PASS: access as customer API-52 GET /api/admin/books
- PASS: access as customer API-53 POST /api/admin/books/:bookId/approve
- PASS: access as customer API-54 POST /api/admin/books/:bookId/reject
- PASS: access as customer API-55 POST /api/admin/categories
- PASS: access as customer API-56 PATCH /api/admin/categories/:categoryId
- PASS: access as customer API-57 DELETE /api/admin/categories/:categoryId
- PASS: access as customer API-58 GET /api/admin/reviews
- PASS: access as customer API-59 DELETE /api/admin/reviews/:reviewId
- PASS: access as customer API-60 GET /api/admin/reports/platform
- PASS: access as customer API-61 GET /api/health
- PASS: access as seller API-01 GET /api/auth/csrf-token
- PASS: access as seller API-02 POST /api/auth/register
- PASS: access as seller API-03 POST /api/auth/verify-email
- PASS: access as seller API-04 POST /api/auth/resend-verification
- PASS: access as seller API-05 POST /api/auth/login
- PASS: access as seller API-06 POST /api/auth/logout
- PASS: access as seller API-07 GET /api/auth/me
- PASS: access as seller API-08 POST /api/auth/forgot-password
- PASS: access as seller API-09 POST /api/auth/reset-password
- PASS: access as seller API-10 GET /api/profile
- PASS: access as seller API-11 PATCH /api/profile
- PASS: access as seller API-12 POST /api/profile/addresses
- PASS: access as seller API-13 PATCH /api/profile/addresses/:addressId
- PASS: access as seller API-14 DELETE /api/profile/addresses/:addressId
- PASS: access as seller API-15 GET /api/books
- PASS: access as seller API-16 GET /api/books/:bookId
- PASS: access as seller API-17 GET /api/books/:bookId/reviews
- PASS: access as seller API-18 GET /api/categories
- PASS: access as seller API-19 GET /api/images/:imageId
- PASS: access as seller API-20 GET /api/cart
- PASS: access as seller API-21 POST /api/cart/items
- PASS: access as seller API-22 PATCH /api/cart/items/:bookId
- PASS: access as seller API-23 DELETE /api/cart/items/:bookId
- PASS: access as seller API-24 GET /api/wishlist
- PASS: access as seller API-25 PUT /api/wishlist/items/:bookId
- PASS: access as seller API-26 DELETE /api/wishlist/items/:bookId
- PASS: access as seller API-27 POST /api/orders
- PASS: access as seller API-28 POST /api/orders/:orderId/payment/confirm
- PASS: access as seller API-30 GET /api/orders
- PASS: access as seller API-31 GET /api/orders/:orderId
- PASS: access as seller API-32 POST /api/orders/:orderId/cancel
- PASS: access as seller API-33 POST /api/books/:bookId/reviews
- PASS: access as seller API-34 POST /api/seller/applications
- PASS: access as seller API-35 GET /api/seller/applications/me
- PASS: access as seller API-36 GET /api/seller/books
- PASS: access as seller API-37 POST /api/seller/books
- PASS: access as seller API-38 PATCH /api/seller/books/:bookId
- PASS: access as seller API-39 DELETE /api/seller/books/:bookId
- PASS: access as seller API-40 PATCH /api/seller/books/:bookId/inventory
- PASS: access as seller API-41 POST /api/seller/uploads/images
- PASS: access as seller API-42 GET /api/seller/orders
- PASS: access as seller API-43 PATCH /api/seller/orders/:orderId/items/:itemId/status
- PASS: access as seller API-44 GET /api/seller/reports/sales
- PASS: access as seller API-45 GET /api/notifications
- PASS: access as seller API-46 PATCH /api/notifications/:notificationId/read
- PASS: access as seller API-47 GET /api/admin/users
- PASS: access as seller API-48 PATCH /api/admin/users/:userId/status
- PASS: access as seller API-49 GET /api/admin/seller-applications
- PASS: access as seller API-50 POST /api/admin/seller-applications/:applicationId/approve
- PASS: access as seller API-51 POST /api/admin/seller-applications/:applicationId/reject
- PASS: access as seller API-52 GET /api/admin/books
- PASS: access as seller API-53 POST /api/admin/books/:bookId/approve
- PASS: access as seller API-54 POST /api/admin/books/:bookId/reject
- PASS: access as seller API-55 POST /api/admin/categories
- PASS: access as seller API-56 PATCH /api/admin/categories/:categoryId
- PASS: access as seller API-57 DELETE /api/admin/categories/:categoryId
- PASS: access as seller API-58 GET /api/admin/reviews
- PASS: access as seller API-59 DELETE /api/admin/reviews/:reviewId
- PASS: access as seller API-60 GET /api/admin/reports/platform
- PASS: access as seller API-61 GET /api/health
- PASS: access as admin API-01 GET /api/auth/csrf-token
- PASS: access as admin API-02 POST /api/auth/register
- PASS: access as admin API-03 POST /api/auth/verify-email
- PASS: access as admin API-04 POST /api/auth/resend-verification
- PASS: access as admin API-05 POST /api/auth/login
- PASS: access as admin API-06 POST /api/auth/logout
- PASS: access as admin API-07 GET /api/auth/me
- PASS: access as admin API-08 POST /api/auth/forgot-password
- PASS: access as admin API-09 POST /api/auth/reset-password
- PASS: access as admin API-10 GET /api/profile
- PASS: access as admin API-11 PATCH /api/profile
- PASS: access as admin API-12 POST /api/profile/addresses
- PASS: access as admin API-13 PATCH /api/profile/addresses/:addressId
- PASS: access as admin API-14 DELETE /api/profile/addresses/:addressId
- PASS: access as admin API-15 GET /api/books
- PASS: access as admin API-16 GET /api/books/:bookId
- PASS: access as admin API-17 GET /api/books/:bookId/reviews
- PASS: access as admin API-18 GET /api/categories
- PASS: access as admin API-19 GET /api/images/:imageId
- PASS: access as admin API-20 GET /api/cart
- PASS: access as admin API-21 POST /api/cart/items
- PASS: access as admin API-22 PATCH /api/cart/items/:bookId
- PASS: access as admin API-23 DELETE /api/cart/items/:bookId
- PASS: access as admin API-24 GET /api/wishlist
- PASS: access as admin API-25 PUT /api/wishlist/items/:bookId
- PASS: access as admin API-26 DELETE /api/wishlist/items/:bookId
- PASS: access as admin API-27 POST /api/orders
- PASS: access as admin API-28 POST /api/orders/:orderId/payment/confirm
- PASS: access as admin API-30 GET /api/orders
- PASS: access as admin API-31 GET /api/orders/:orderId
- PASS: access as admin API-32 POST /api/orders/:orderId/cancel
- PASS: access as admin API-33 POST /api/books/:bookId/reviews
- PASS: access as admin API-34 POST /api/seller/applications
- PASS: access as admin API-35 GET /api/seller/applications/me
- PASS: access as admin API-36 GET /api/seller/books
- PASS: access as admin API-37 POST /api/seller/books
- PASS: access as admin API-38 PATCH /api/seller/books/:bookId
- PASS: access as admin API-39 DELETE /api/seller/books/:bookId
- PASS: access as admin API-40 PATCH /api/seller/books/:bookId/inventory
- PASS: access as admin API-41 POST /api/seller/uploads/images
- PASS: access as admin API-42 GET /api/seller/orders
- PASS: access as admin API-43 PATCH /api/seller/orders/:orderId/items/:itemId/status
- PASS: access as admin API-44 GET /api/seller/reports/sales
- PASS: access as admin API-45 GET /api/notifications
- PASS: access as admin API-46 PATCH /api/notifications/:notificationId/read
- PASS: access as admin API-47 GET /api/admin/users
- PASS: access as admin API-48 PATCH /api/admin/users/:userId/status
- PASS: access as admin API-49 GET /api/admin/seller-applications
- PASS: access as admin API-50 POST /api/admin/seller-applications/:applicationId/approve
- PASS: access as admin API-51 POST /api/admin/seller-applications/:applicationId/reject
- PASS: access as admin API-52 GET /api/admin/books
- PASS: access as admin API-53 POST /api/admin/books/:bookId/approve
- PASS: access as admin API-54 POST /api/admin/books/:bookId/reject
- PASS: access as admin API-55 POST /api/admin/categories
- PASS: access as admin API-56 PATCH /api/admin/categories/:categoryId
- PASS: access as admin API-57 DELETE /api/admin/categories/:categoryId
- PASS: access as admin API-58 GET /api/admin/reviews
- PASS: access as admin API-59 DELETE /api/admin/reviews/:reviewId
- PASS: access as admin API-60 GET /api/admin/reports/platform
- PASS: access as admin API-61 GET /api/health
- PASS: API-29 webhook accepts nobody without a valid signature
- PASS: an approved seller keeps the customer role: customer endpoints work for a seller account (D-04)
- PASS: an administrator is not a customer or a seller (D-04)

### `server/tests/api/cart.test.js`

- PASS: cart (FR-08, FR-09, FR-12, UC-06) an empty cart has a zero summary
- PASS: cart (FR-08, FR-09, FR-12, UC-06) add, add again (quantities combine), change and remove
- PASS: cart (FR-08, FR-09, FR-12, UC-06) summary: tax is rounded half up, shipping is the flat fee, total adds up to 2 decimals (FR-12)
- PASS: cart (FR-08, FR-09, FR-12, UC-06) rejects a quantity above the available stock with a message (FR-09)
- PASS: cart (FR-08, FR-09, FR-12, UC-06) units held by other open checkouts are not available to the cart (stock minus reserved)
- PASS: cart (FR-08, FR-09, FR-12, UC-06) a cart does not reserve stock (D-06)
- PASS: cart (FR-08, FR-09, FR-12, UC-06) validation: quantity range, book id, unknown fields; unavailable books
- PASS: cart (FR-08, FR-09, FR-12, UC-06) the cart persists across sessions (FR-08)
- PASS: cart (FR-08, FR-09, FR-12, UC-06) one customer cannot see another customer's cart
- PASS: wishlist (FR-10, UC-07) add is idempotent, list, remove
- PASS: wishlist (FR-10, UC-07) unknown or hidden books cannot be added; wishlists are private

### `server/tests/api/catalog.test.js`

- PASS: search helpers (D-10) normalise lowercases, strips accents and collapses spaces
- PASS: search helpers (D-10) buildSearchFields derives the four fields
- PASS: search helpers (D-10) 3+ character queries use $all on trigrams, 1-2 character queries use prefixes
- PASS: search helpers (D-10) regex characters in the query are escaped
- PASS: browse, pagination and details (FR-04, FR-07, UC-01, UC-03) lists only approved books, 20 per page, with paging fields
- PASS: browse, pagination and details (FR-04, FR-07, UC-01, UC-03) never exposes derived search fields or private stock numbers
- PASS: browse, pagination and details (FR-04, FR-07, UC-01, UC-03) book details; pending, removed and unknown books are 404
- PASS: browse, pagination and details (FR-04, FR-07, UC-01, UC-03) shows Out of stock when no unit is available (stock minus reserved)
- PASS: search (FR-05, UC-02, A-14) partial, case-insensitive match anywhere in the title
- PASS: search (FR-05, UC-02, A-14) matches the author
- PASS: search (FR-05, UC-02, A-14) matches the ISBN, also with hyphens and fragments
- PASS: search (FR-05, UC-02, A-14) ignores accents
- PASS: search (FR-05, UC-02, A-14) 1 and 2 character queries match prefixes of title or author
- PASS: search (FR-05, UC-02, A-14) no match gives an empty page, not an error
- PASS: search (FR-05, UC-02, A-14) trigrams must appear in order: the words reversed do not match
- PASS: search (FR-05, UC-02, A-14) regex metacharacters are matched literally
- PASS: search (FR-05, UC-02, A-14) the search uses the trigram index, not a collection scan
- PASS: filters and sorting (FR-06) category filter
- PASS: filters and sorting (FR-06) price range is inclusive and in minor units
- PASS: filters and sorting (FR-06) minRating means average rating greater than or equal to the value (A-12)
- PASS: filters and sorting (FR-06) language filter is case-insensitive
- PASS: filters and sorting (FR-06) sorting by price and rating
- PASS: filters and sorting (FR-06) sorting by newest puts the latest created first
- PASS: filters and sorting (FR-06) search combined with a filter
- PASS: filters and sorting (FR-06) invalid query parameters are rejected
- PASS: filters and sorting (FR-06) NoSQL operator injection in the query string is rejected
- PASS: categories (API-18) lists categories alphabetically
- PASS: listings: create, edit, remove (FR-20, FR-25, UC-16) a new listing is pending and not visible in the catalog; search fields are generated by the server
- PASS: listings: create, edit, remove (FR-20, FR-25, UC-16) clients cannot send search fields, status, reserved or a seller id
- PASS: listings: create, edit, remove (FR-20, FR-25, UC-16) validates ISBN check digit, price, stock and category
- PASS: listings: create, edit, remove (FR-20, FR-25, UC-16) the same seller cannot reuse an ISBN, another seller can (D-11)
- PASS: listings: create, edit, remove (FR-20, FR-25, UC-16) editing the title regenerates the search fields, the approval status stays
- PASS: listings: create, edit, remove (FR-20, FR-25, UC-16) stock, status and isbn cannot be changed through the edit endpoint
- PASS: listings: create, edit, remove (FR-20, FR-25, UC-16) a seller cannot see, edit or remove another seller's listing (ownership)
- PASS: listings: create, edit, remove (FR-20, FR-25, UC-16) removing a listing keeps the record with status removed and hides it from the catalog
- PASS: listings: create, edit, remove (FR-20, FR-25, UC-16) own listings show stock details to the owner and can be filtered by status
- PASS: catalogue total cache (VFR-02) with a TTL the total is reused for the same filter while the items stay current; with TTL 0 it is exact

### `server/tests/api/checkout.test.js`

- PASS: checkout reserves stock (D-06, FR-30, FR-11, FR-12) creates a PendingPayment order, reserves every line, creates a payment session, keeps stock
- PASS: checkout reserves stock (D-06, FR-30, FR-11, FR-12) available units shrink for other customers while a checkout holds them
- PASS: checkout reserves stock (D-06, FR-30, FR-11, FR-12) all or nothing: when one line is short nothing is reserved and no order exists
- PASS: checkout reserves stock (D-06, FR-30, FR-11, FR-12) a transaction rollback leaves earlier lines unreserved even if a later line fails inside the transaction
- PASS: checkout reserves stock (D-06, FR-30, FR-11, FR-12) empty cart, bad address and unknown address are rejected
- PASS: checkout reserves stock (D-06, FR-30, FR-11, FR-12) uses a saved address and can save a typed one
- PASS: checkout reserves stock (D-06, FR-30, FR-11, FR-12) a new checkout releases the same customer's earlier unpaid order (one open checkout)
- PASS: checkout reserves stock (D-06, FR-30, FR-11, FR-12) a customer who holds the last copies can restart the checkout (DEF-01)
- PASS: checkout reserves stock (D-06, FR-30, FR-11, FR-12) restart is refused beyond held plus free units and keeps the earlier hold (DEF-01, FR-30)
- PASS: checkout reserves stock (D-06, FR-30, FR-11, FR-12) a failed address or gateway error on restart leaves the earlier checkout open (DEF-01)
- PASS: checkout reserves stock (D-06, FR-30, FR-11, FR-12) two simultaneous restarts by the same customer end with exactly one open checkout (DEF-01)
- PASS: checkout reserves stock (D-06, FR-30, FR-11, FR-12) gateway failure at checkout releases the reservation and returns 502
- PASS: concurrent checkout never oversells (FR-30, TC-FR-30) 20 customers race for 5 copies: exactly 5 succeed, reserved never exceeds stock
- PASS: concurrent checkout never oversells (FR-30, TC-FR-30) paying for all reservations leaves stock at exactly 0, never negative
- PASS: concurrent checkout never oversells (FR-30, TC-FR-30) the database validator refuses stock below zero or reserved above stock
- PASS: payment confirmation (FR-13, FR-14, UC-09) success places the order, finalises stock, clears the cart, emails a confirmation
- PASS: payment confirmation (FR-13, FR-14, UC-09) confirming again is idempotent: same order, stock decremented once
- PASS: payment confirmation (FR-13, FR-14, UC-09) a failed gateway verification keeps the order and the reservation (400)
- PASS: payment confirmation (FR-13, FR-14, UC-09) a forged payment id or signature is refused
- PASS: payment confirmation (FR-13, FR-14, UC-09) the same gateway payment cannot pay for two orders
- PASS: payment confirmation (FR-13, FR-14, UC-09) gateway unreachable during verification gives 502 and the order stays payable
- PASS: payment confirmation (FR-13, FR-14, UC-09) one customer cannot confirm, read or cancel another customer's order (404)
- PASS: recovering a payment page after a reload (existing contract only) GET order has no payment session, but a new checkout from the stored address replaces the open one
- PASS: release: payment failure, abandoned checkout and expiry cancelling an unpaid order releases the reservation without a refund
- PASS: release: payment failure, abandoned checkout and expiry expiry sweeper releases only expired reservations, once, and is safe to repeat (I-27)
- PASS: release: payment failure, abandoned checkout and expiry concurrent sweeper runs release the units only once
- PASS: release: payment failure, abandoned checkout and expiry webhook payment.failed releases the reservation
- PASS: late payment after expiry (A-13, D-06) stock still free: the order is re-reserved and placed
- PASS: late payment after expiry (A-13, D-06) stock gone: the payment is refunded and the order fails, nothing is oversold
- PASS: cancelling a placed order (FR-16, UC-11) restores stock and refunds the payment
- PASS: cancelling a placed order (FR-16, UC-11) cancelling twice does not restore stock twice
- PASS: cancelling a placed order (FR-16, UC-11) a failed refund leaves the order cancelled and the payment refund_pending (A-05)
- PASS: cancelling a placed order (FR-16, UC-11) a Packed order can still be cancelled, a Shipped one cannot
- PASS: order history keeps snapshots (FR-15) editing or removing a listing does not change past orders
- PASS: order history keeps snapshots (FR-15) order list is paged 10 per page, newest first, own orders only
- PASS: webhook signature (API-29, I-25) a wrong or missing signature is refused and changes nothing
- PASS: webhook signature (API-29, I-25) a signed payment.succeeded event places the order, a replay changes nothing
- PASS: webhook signature (API-29, I-25) an event for an unknown gateway order is ignored
- PASS: webhook signature (API-29, I-25) the webhook needs no CSRF token and no session

### `server/tests/api/media.test.js`

- PASS: GridFS image upload and download (D-09, FR-20, FR-07) stores a JPEG and a PNG and streams them back with cache headers
- PASS: GridFS image upload and download (D-09, FR-20, FR-07) the type is decided from the bytes, not the file name or declared type
- PASS: GridFS image upload and download (D-09, FR-20, FR-07) a file larger than 2 MB is refused with 413
- PASS: GridFS image upload and download (D-09, FR-20, FR-07) a missing file field is refused
- PASS: GridFS image upload and download (D-09, FR-20, FR-07) only sellers can upload; guests and customers are refused
- PASS: GridFS image upload and download (D-09, FR-20, FR-07) unknown image id is 404, malformed id is 400
- PASS: images on listings (max 3, owned by the seller) a listing can use up to 3 own images; the first is the cover
- PASS: images on listings (max 3, owned by the seller) another seller's image, an unknown image and duplicate ids are refused
- PASS: cleanup of unattached images (D-09 orphans) deletes old unused images, keeps attached and recent ones

### `server/tests/api/notification.test.js`

- PASS: email sending with retries (D-12, FR-01, FR-14) a failing mailer is retried and the email is eventually sent
- PASS: email sending with retries (D-12, FR-01, FR-14) after 3 failed attempts the notification is marked failed and nothing throws
- PASS: email sending with retries (D-12, FR-01, FR-14) a registration still succeeds when the mail provider is down
- PASS: email sending with retries (D-12, FR-01, FR-14) the email body escapes HTML in names
- PASS: email sending with retries (D-12, FR-01, FR-14) the console mailer prints the email and delivers nothing

### `server/tests/api/openapi.test.js`

- PASS: the OpenAPI document is valid OpenAPI 3 and lists 61 operations
- PASS: the application defines exactly 61 route handlers: none missing, none extra
- PASS: get /api/auth/csrf-token is implemented
- PASS: post /api/auth/register is implemented
- PASS: post /api/auth/verify-email is implemented
- PASS: post /api/auth/resend-verification is implemented
- PASS: post /api/auth/login is implemented
- PASS: post /api/auth/logout is implemented
- PASS: get /api/auth/me is implemented
- PASS: post /api/auth/forgot-password is implemented
- PASS: post /api/auth/reset-password is implemented
- PASS: get /api/profile is implemented
- PASS: patch /api/profile is implemented
- PASS: post /api/profile/addresses is implemented
- PASS: patch /api/profile/addresses/{addressId} is implemented
- PASS: delete /api/profile/addresses/{addressId} is implemented
- PASS: get /api/books is implemented
- PASS: get /api/books/{bookId} is implemented
- PASS: get /api/books/{bookId}/reviews is implemented
- PASS: post /api/books/{bookId}/reviews is implemented
- PASS: get /api/categories is implemented
- PASS: get /api/images/{imageId} is implemented
- PASS: get /api/cart is implemented
- PASS: post /api/cart/items is implemented
- PASS: patch /api/cart/items/{bookId} is implemented
- PASS: delete /api/cart/items/{bookId} is implemented
- PASS: get /api/wishlist is implemented
- PASS: put /api/wishlist/items/{bookId} is implemented
- PASS: delete /api/wishlist/items/{bookId} is implemented
- PASS: get /api/orders is implemented
- PASS: post /api/orders is implemented
- PASS: post /api/orders/{orderId}/payment/confirm is implemented
- PASS: post /api/payments/webhook is implemented
- PASS: get /api/orders/{orderId} is implemented
- PASS: post /api/orders/{orderId}/cancel is implemented
- PASS: post /api/seller/applications is implemented
- PASS: get /api/seller/applications/me is implemented
- PASS: get /api/seller/books is implemented
- PASS: post /api/seller/books is implemented
- PASS: patch /api/seller/books/{bookId} is implemented
- PASS: delete /api/seller/books/{bookId} is implemented
- PASS: patch /api/seller/books/{bookId}/inventory is implemented
- PASS: post /api/seller/uploads/images is implemented
- PASS: get /api/seller/orders is implemented
- PASS: patch /api/seller/orders/{orderId}/items/{itemId}/status is implemented
- PASS: get /api/seller/reports/sales is implemented
- PASS: get /api/notifications is implemented
- PASS: patch /api/notifications/{notificationId}/read is implemented
- PASS: get /api/admin/users is implemented
- PASS: patch /api/admin/users/{userId}/status is implemented
- PASS: get /api/admin/seller-applications is implemented
- PASS: post /api/admin/seller-applications/{applicationId}/approve is implemented
- PASS: post /api/admin/seller-applications/{applicationId}/reject is implemented
- PASS: get /api/admin/books is implemented
- PASS: post /api/admin/books/{bookId}/approve is implemented
- PASS: post /api/admin/books/{bookId}/reject is implemented
- PASS: post /api/admin/categories is implemented
- PASS: patch /api/admin/categories/{categoryId} is implemented
- PASS: delete /api/admin/categories/{categoryId} is implemented
- PASS: get /api/admin/reviews is implemented
- PASS: delete /api/admin/reviews/{reviewId} is implemented
- PASS: get /api/admin/reports/platform is implemented
- PASS: get /api/health is implemented
- PASS: documented success status codes: 201 for creation, 204 for deletes
- PASS: uniform error body on unknown routes
- PASS: the payment webhook 200 response matches its schema (WebhookAck), not Message
- PASS: the Sprint 2 contract differs from the approved Phase 2 file only in the webhook schema

### `server/tests/api/review-profile.test.js`

- PASS: ratings and reviews (FR-17, FR-27, UC-12, UC-22) only customers with a delivered order can review; the average rating is updated
- PASS: ratings and reviews (FR-17, FR-27, UC-12, UC-22) a customer who never bought the book, or has not received it, cannot review
- PASS: ratings and reviews (FR-17, FR-27, UC-12, UC-22) one review per customer per book, also under concurrent requests
- PASS: ratings and reviews (FR-17, FR-27, UC-12, UC-22) validation: rating integer 1-5, comment up to 2000 characters, unknown fields
- PASS: ratings and reviews (FR-17, FR-27, UC-12, UC-22) comments are stored as plain text and returned unchanged (escaped by the UI)
- PASS: ratings and reviews (FR-17, FR-27, UC-12, UC-22) public list is newest first, 10 per page
- PASS: ratings and reviews (FR-17, FR-27, UC-12, UC-22) an administrator lists and removes reviews; the rating is recalculated
- PASS: ratings and reviews (FR-17, FR-27, UC-12, UC-22) customers and sellers cannot moderate or delete reviews, and cannot remove someone else's
- PASS: profile and addresses (FR-18, UC-13) view and update profile; the email cannot be changed
- PASS: profile and addresses (FR-18, UC-13) add, edit and delete addresses; the first becomes the default
- PASS: profile and addresses (FR-18, UC-13) at most 5 addresses, also under concurrent requests
- PASS: profile and addresses (FR-18, UC-13) addresses are private: another customer's address id is 404
- PASS: profile and addresses (FR-18, UC-13) required fields and lengths are validated

### `server/tests/api/security.test.js`

- PASS: CSRF protection (VFR-06, TC-VFR-06) state-changing requests without the header are refused with 403 CSRF_INVALID
- PASS: CSRF protection (VFR-06, TC-VFR-06) a token that does not match the cookie, or a forged cookie, is refused
- PASS: CSRF protection (VFR-06, TC-VFR-06) safe methods do not need a token; PUT, PATCH and DELETE do
- PASS: injection (VFR-06) NoSQL operators in a login body cannot bypass authentication
- PASS: injection (VFR-06) keys starting with $ or containing a dot are rejected anywhere in the body
- PASS: injection (VFR-06) a search for operators or a regex is treated as plain text
- PASS: injection (VFR-06) a user id from the body is never trusted: mass-assignment of roles, status and ids is refused
- PASS: XSS and output handling (VFR-06) stored text comes back as JSON data, not HTML, and the CSP forbids inline scripts
- PASS: XSS and output handling (VFR-06) CSP has no wildcard or unsafe-inline source and the extra headers are set (TASK-07, DEF-07, DEF-08)
- PASS: XSS and output handling (VFR-06) security headers are present and the server does not announce itself
- PASS: XSS and output handling (VFR-06) production mode turns on Secure cookies (HTTPS only, VFR-05)
- PASS: sensitive data (VFR-04, VFR-08) no response contains password hashes, token data or lock counters
- PASS: sensitive data (VFR-04, VFR-08) errors never leak internals or stack traces
- PASS: sensitive data (VFR-04, VFR-08) malformed JSON and oversized bodies get clean errors
- PASS: sensitive data (VFR-04, VFR-08) the log redaction removes passwords, tokens, cookies, card fields and secrets (VFR-08)
- PASS: sensitive data (VFR-04, VFR-08) the request log never contains the query string or cookies
- PASS: sensitive data (VFR-04, VFR-08) payment records hold gateway references only, never card fields (VFR-08)
- PASS: rate limiting and abuse (VFR-06) the limiter answers 429 RATE_LIMITED after the limit and uses the uniform error shape
- PASS: rate limiting and abuse (VFR-06) authentication endpoints use a stricter limiter than the rest of the API
- PASS: configuration contract (SDD 7.2) a missing required variable stops start-up with a clear message
- PASS: configuration contract (SDD 7.2) production refuses to start without an explicit payment and email provider (no silent fake fallback)
- PASS: configuration contract (SDD 7.2) production starts when both providers are named explicitly (the course demonstration names the fake ones)
- PASS: configuration contract (SDD 7.2) an unknown provider name is refused when the adapters are created
- PASS: configuration contract (SDD 7.2) development and test keep working with the defaults (fake gateway, console mailer)
- PASS: configuration contract (SDD 7.2) bcrypt cost below 10 is refused (VFR-04)
- PASS: configuration contract (SDD 7.2) documented defaults: 15 minute reservation, 60 minute session
- PASS: health and availability (VFR-09, API-61) reports ok when the database answers
- PASS: HTTPS redirect in production (VFR-05) plain HTTP is redirected (308) to the same address over HTTPS, query string kept
- PASS: HTTPS redirect in production (VFR-05) requests that arrived over HTTPS pass through, and the health probe is exempt

### `server/tests/api/seller-admin.test.js`

- PASS: seller application and approval (FR-19, FR-25, UC-15, UC-21, D-04) a customer applies; the seller role is only active after approval and the customer role is kept
- PASS: seller application and approval (FR-19, FR-25, UC-15, UC-21, D-04) one pending application per user; sellers cannot apply again; decisions are final
- PASS: seller application and approval (FR-19, FR-25, UC-15, UC-21, D-04) rejection needs a reason, keeps the customer role and lets the user apply again
- PASS: seller application and approval (FR-19, FR-25, UC-15, UC-21, D-04) administrators list applications by status (default pending)
- PASS: seller application and approval (FR-19, FR-25, UC-15, UC-21, D-04) application input is validated; unknown ids are 404
- PASS: listing approval (FR-25, UC-21) admin sees pending listings, approves one and it appears in the catalog; rejection needs a reason
- PASS: inventory and low-stock alerts (FR-21, UC-17) updates stock and threshold and shows available units and stock status
- PASS: inventory and low-stock alerts (FR-21, UC-17) stock 0 marks the listing Out of stock
- PASS: inventory and low-stock alerts (FR-21, UC-17) stock cannot go below the units reserved by open checkouts
- PASS: inventory and low-stock alerts (FR-21, UC-17) validation: at least one field, integers in range
- PASS: inventory and low-stock alerts (FR-21, UC-17) an in-app alert is created once when stock falls to the threshold, can be listed and marked read
- PASS: inventory and low-stock alerts (FR-21, UC-17) alerts are private to the seller (404 for someone else's notification)
- PASS: inventory and low-stock alerts (FR-21, UC-17) a sale that brings available units to the threshold alerts the seller
- PASS: seller orders and fulfilment (FR-22, FR-15, UC-18, D-07) each seller sees only their own items, plus the shipping name and address
- PASS: seller orders and fulfilment (FR-22, FR-15, UC-18, D-07) the order summary is worked out from the seller own items only, nothing of another seller leaks (OpenAPI Order.summary)
- PASS: seller orders and fulfilment (FR-22, FR-15, UC-18, D-07) status moves one step at a time; the order status is the lowest item status
- PASS: seller orders and fulfilment (FR-22, FR-15, UC-18, D-07) a seller cannot change another seller's item (404) or an unknown item
- PASS: seller orders and fulfilment (FR-22, FR-15, UC-18, D-07) status filter and unpaid orders: sellers never see unpaid checkouts
- PASS: seller orders and fulfilment (FR-22, FR-15, UC-18, D-07) the status update response has the same seller-scoped summary and shows no other seller data
- PASS: user administration (FR-24, UC-20) suspend ends the session at once; reactivate lets the user log in again
- PASS: user administration (FR-24, UC-20) administrators cannot suspend themselves; unknown users are 404; bad status is 400
- PASS: user administration (FR-24, UC-20) reactivating a never-verified account does not skip email verification
- PASS: user administration (FR-24, UC-20) lists users with filters and never returns password data
- PASS: category management (FR-26, UC-23) add, rename, duplicate names ignoring case, delete
- PASS: category management (FR-26, UC-23) a category used by books cannot be deleted
- PASS: reports (FR-23, FR-28, UC-19, UC-24) seller sales report counts only the seller own, non-cancelled items
- PASS: reports (FR-23, FR-28, UC-19, UC-24) an empty range reports zeros
- PASS: reports (FR-23, FR-28, UC-19, UC-24) platform report: orders, revenue and the best sellers
- PASS: reports (FR-23, FR-28, UC-19, UC-24) platform top list is limited to 10 books
- PASS: reports (FR-23, FR-28, UC-19, UC-24) invalid ranges: from after to, impossible dates, more than 366 days, bad format

### `server/tests/unit/accountLimiter.test.js`

- PASS: per-account authentication limiter blocks the account after the limit even when every attempt comes from a different address
- PASS: per-account authentication limiter treats e-mail case and spacing as the same account
- PASS: per-account authentication limiter does not affect other accounts
- PASS: per-account authentication limiter successful logins are not counted
- PASS: per-account authentication limiter 429 uses the uniform error shape

### `server/tests/unit/units.test.js`

- PASS: price summary (FR-12, D-08) []
- PASS: price summary (FR-12, D-08) [{"unitPrice":10000,"quantity":1}]
- PASS: price summary (FR-12, D-08) [{"unitPrice":999,"quantity":3}]
- PASS: price summary (FR-12, D-08) [{"unitPrice":10,"quantity":1}]
- PASS: price summary (FR-12, D-08) [{"unitPrice":9,"quantity":1}]
- PASS: order status policy (D-07) status is the lowest status of the non-cancelled items
- PASS: order status policy (D-07) only the next step is a valid transition
- PASS: order status policy (D-07) cancellation rule (FR-16)
- PASS: ISBN validation (D-11, API-37) 9780747532699 is valid
- PASS: ISBN validation (D-11, API-37) 978-0-7475-3269-9 is valid
- PASS: ISBN validation (D-11, API-37) 0306406152 is valid
- PASS: ISBN validation (D-11, API-37) 0-306-40615-2 is valid
- PASS: ISBN validation (D-11, API-37) 080442957X is valid
- PASS: ISBN validation (D-11, API-37) 9780747532690 is invalid
- PASS: ISBN validation (D-11, API-37) 0306406153 is invalid
- PASS: ISBN validation (D-11, API-37) 12345 is invalid
- PASS: ISBN validation (D-11, API-37)  is invalid
- PASS: ISBN validation (D-11, API-37) abcdefghij is invalid
- PASS: ISBN validation (D-11, API-37) 97807475326999 is invalid
- PASS: image signature check (D-09) recognises JPEG and PNG only, by their first bytes
- PASS: request sanitising (VFR-06) finds $ keys and dotted keys at any depth
- PASS: session token (FR-02) carries user id and token version and lasts 60 minutes
- PASS: session token (FR-02) rejects garbage, unsigned tokens and tokens signed with another key
- PASS: password hashing (VFR-04) uses bcrypt with a different salt each time and the configured cost
- PASS: fake payment gateway honours the adapter contract (SDD 7.2) createPayment, verifyPayment, verifyWebhook, refund
- PASS: fake payment gateway honours the adapter contract (SDD 7.2) no card data in any request or response shape
- PASS: fake clock advances on demand

### Client

- PASS: ApiClient (I-01) sends cookies, adds the CSRF header to state-changing requests only
- PASS: ApiClient (I-01) turns an error body into an ApiError with field errors
- PASS: ApiClient (I-01) fetches a new CSRF token once when the server refuses the old one
- PASS: ApiClient (I-01) reports an expired session so the app can go back to guest mode
- PASS: ApiClient (I-01) 204 gives null and uploads use FormData without a JSON content type
- PASS: money and form helpers (D-08) minor units are shown with two decimals only on display
- PASS: money and form helpers (D-08) prices typed by users convert to integers or are refused
- PASS: money and form helpers (D-08) password and email checks mirror the API rules (FR-01)
- PASS: money and form helpers (D-08) address validation reports every missing required field
- PASS: role-aware navigation (Architecture 6.1) guest
- PASS: role-aware navigation (Architecture 6.1) customer can apply to become a seller
- PASS: role-aware navigation (Architecture 6.1) seller keeps every customer entry and gains the seller dashboard (D-04)
- PASS: role-aware navigation (Architecture 6.1) administrator sees only the admin dashboard entries
- PASS: route guards (FM-11, FR-29) guests are sent to the login screen
- PASS: route guards (FM-11, FR-29) a user without the role sees access denied
- PASS: route guards (FM-11, FR-29) a user with the role sees the screen
- PASS: shared components pagination moves between pages and hides itself for a single page
- PASS: shared components star rating is readable by screen readers
- PASS: shared components status badge shows readable text
- PASS: shared components review text is shown as text, never as HTML (XSS, VFR-06)
- PASS: register form (FR-01, UC-04) shows field messages and does not call the API for invalid input
- PASS: register form (FR-01, UC-04) shows the check-your-email message after a successful registration
- PASS: payment page after a reload (S-11) without the payment session it offers to restart from the stored address
- PASS: error, loading and retry states (S-23, S-24, S-29; TASK-05) S-24: the dashboard shows an error with Try again and recovers; counts are not faked
- PASS: error, loading and retry states (S-23, S-24, S-29; TASK-05) S-29 platform report: failure shows the error and Try again; no stale or fake success; retry works
- PASS: error, loading and retry states (S-23, S-24, S-29; TASK-05) S-23 sales report: failure shows the error and Try again; no stale or fake success; retry works
- PASS: error, loading and retry states (S-23, S-24, S-29; TASK-05) the report shows a loading state and ignores a second submit while loading (no duplicate request)
- PASS: error, loading and retry states (S-23, S-24, S-29; TASK-05) an invalid date range is explained without calling the API and without a retry button

## 5. How to reproduce

```
npm ci
npm test                # server
npm run test:client     # client
```
