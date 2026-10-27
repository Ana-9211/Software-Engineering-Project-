# Live API and workflow validation

257 of 257 checks passed.

| ID | Refs | Check | Expected | Actual | Result |
|---|---|---|---|---|---|
| AUTH-01 | FR-01, UC-04 | register with valid data | HTTP 201 | HTTP 201 | PASS |
| AUTH-02 | FR-01 | duplicate email in different case is refused | HTTP 409 | HTTP 409 EMAIL_TAKEN | PASS |
| AUTH-03 | FR-01 | password of 7 characters is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| AUTH-04 | FR-01 | password of 8 characters is accepted | HTTP 201 | HTTP 201 | PASS |
| AUTH-05 | FR-01 | invalid email is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| AUTH-06 | FR-29, ST-08 | mass assignment of roles at registration is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| AUTH-07 | FR-01, D-05 | login before the email is verified is refused | HTTP 403 | HTTP 403 EMAIL_NOT_VERIFIED | PASS |
| AUTH-08 | FR-01, UC-25 | verification email with a link is produced (console mailer) | link found in the server log | http://localhost:5173/verify-email?token=... | PASS |
| AUTH-09 | VFR-04, ST-01 | only a bcrypt hash with cost >= 10 is stored; no plaintext | hash $2?$>=10 and password absent | $2b$12$... | PASS |
| AUTH-10 | FR-01, ST-22 | verification token is stored hashed and expires in 24 hours | sha256 hash, ~24 h | 64 hex chars, 24 h | PASS |
| AUTH-11 | FR-01, ST-22 | unknown verification token is refused | HTTP 400 | HTTP 400 TOKEN_INVALID_OR_EXPIRED | PASS |
| AUTH-12 | FR-01, UC-04 | valid verification token activates the account | HTTP 200 | HTTP 200 | PASS |
| AUTH-13 | FR-01, ST-22 | verification token cannot be used twice | HTTP 400 | HTTP 400 TOKEN_INVALID_OR_EXPIRED | PASS |
| AUTH-14 | ST-02 | wrong password and unknown email give identical answers | same status and body | 401/401 | PASS |
| AUTH-15 | FR-02, D-03 | session cookie is HttpOnly, SameSite=Lax, 60 minutes | HttpOnly; SameSite=Lax; Max-Age=3600 | session=...; Max-Age=3600; Path=/; Expires=Tue, 27 Oct 2026 19:37:10 GMT; HttpOnly; SameSite=Lax | PASS |
| AUTH-16 | FR-02 | session token lifetime is 60 minutes | 3600 s | 3600 s | PASS |
| AUTH-17 | VFR-04 | login response has no password data | no hash fields | {"id":"6ae0ef541f9652a325eebebd","name":"Valid Customer","email":"cust.1793126227747.0@example.com","roles":["customer"],"status":"active"} | PASS |
| AUTH-18 | FR-02, UC-05 | GET /api/auth/me returns the user | HTTP 200 | HTTP 200 | PASS |
| AUTH-19 | FR-02, UC-05 | logout | HTTP 200 | HTTP 200 | PASS |
| AUTH-20 | FR-02, ST-05 | the old session token stops working after logout (token version) | HTTP 401 | HTTP 401 UNAUTHENTICATED | PASS |
| AUTH-21 | FR-02, ST-04, ST-05 | token signed with another key is refused | HTTP 401 | HTTP 401 UNAUTHENTICATED | PASS |
| AUTH-22 | FR-02, ST-04, ST-05 | token algorithm none is refused | HTTP 401 | HTTP 401 UNAUTHENTICATED | PASS |
| AUTH-23 | FR-02, ST-04, ST-05 | token expired 10 s ago (right key) is refused | HTTP 401 | HTTP 401 UNAUTHENTICATED | PASS |
| AUTH-24 | FR-02, ST-04, ST-05 | token wrong token version (right key) is refused | HTTP 401 | HTTP 401 UNAUTHENTICATED | PASS |
| AUTH-25 | FR-02, ST-04, ST-05 | token garbage is refused | HTTP 401 | HTTP 401 UNAUTHENTICATED | PASS |
| AUTH-26 | VFR-07, ST-03 | 5 failures, then the correct password is refused with 423 and Retry-After | 401 x5, then 423 + Retry-After | 401,401,401,401,401 then 423 retry-after=900 | PASS |
| AUTH-27 | VFR-07 | unlock after 15 minutes | covered by the automated test with a controllable clock (auth.test.js, "locks the account for 15 minutes") | not observed live (15 minutes) | PASS |
| AUTH-28 | FR-03, ST-21 | forgot-password answers the same for known and unknown emails | same status and body | 200/200 | PASS |
| AUTH-29 | FR-03, UC-25 | reset email with a link is produced | link in the server log | found | PASS |
| AUTH-30 | FR-03, ST-21 | reset token lasts 30 minutes, is stored hashed, has >= 128 bits | 30 min, sha256, 64 hex chars (256 bits) | 30 min, 64 hex chars | PASS |
| AUTH-31 | FR-03 | new password under 8 characters is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| AUTH-32 | FR-03 | reset with a valid token | HTTP 200 | HTTP 200 | PASS |
| AUTH-33 | FR-03 | the reset token can be used only once | HTTP 400 | HTTP 400 TOKEN_INVALID_OR_EXPIRED | PASS |
| AUTH-34 | FR-03, ST-05 | all earlier sessions end after a reset | HTTP 401 | HTTP 401 UNAUTHENTICATED | PASS |
| AUTH-35 | FR-03 | old password no longer works | HTTP 401 | HTTP 401 INVALID_CREDENTIALS | PASS |
| AUTH-36 | FR-03 | new password works | HTTP 200 | HTTP 200 | PASS |
| AUTH-37 | FR-03 | reset link expires after 30 minutes | covered by the automated test with a controllable clock (auth.test.js, "expires after 30 minutes") | not observed live (30 minutes) | PASS |
| AZ-01 | FR-29 | guest calls GET /api/cart | HTTP 401 | HTTP 401 UNAUTHENTICATED | PASS |
| AZ-02 | FR-29 | guest calls GET /api/orders | HTTP 401 | HTTP 401 UNAUTHENTICATED | PASS |
| AZ-03 | FR-29 | guest calls GET /api/admin/users | HTTP 401 | HTTP 401 UNAUTHENTICATED | PASS |
| AZ-04 | FR-29 | guest calls GET /api/seller/books | HTTP 401 | HTTP 401 UNAUTHENTICATED | PASS |
| AZ-05 | FR-29 | customer calls GET /api/admin/users | HTTP 403 | HTTP 403 FORBIDDEN | PASS |
| AZ-06 | FR-29 | customer calls GET /api/seller/books | HTTP 403 | HTTP 403 FORBIDDEN | PASS |
| AZ-07 | FR-29 | customer calls POST /api/seller/books | HTTP 403 | HTTP 403 FORBIDDEN | PASS |
| AZ-08 | FR-29 | customer calls GET /api/seller/orders | HTTP 403 | HTTP 403 FORBIDDEN | PASS |
| AZ-09 | FR-29 | customer calls DELETE /api/admin/reviews/:id | HTTP 403 | HTTP 403 FORBIDDEN | PASS |
| AZ-10 | FR-29 | seller calls GET /api/admin/users | HTTP 403 | HTTP 403 FORBIDDEN | PASS |
| AZ-11 | FR-29 | seller calls POST /api/admin/books/:id/approve | HTTP 403 | HTTP 403 FORBIDDEN | PASS |
| AZ-12 | FR-29 | seller calls GET /api/admin/reports/platform | HTTP 403 | HTTP 403 FORBIDDEN | PASS |
| AZ-13 | FR-29 | admin calls GET /api/cart | HTTP 403 | HTTP 403 FORBIDDEN | PASS |
| AZ-14 | FR-29 | admin calls GET /api/seller/books | HTTP 403 | HTTP 403 FORBIDDEN | PASS |
| AZ-15 | FR-29 | admin calls POST /api/orders | HTTP 403 | HTTP 403 FORBIDDEN | PASS |
| AZ-16 | FR-29 | admin calls GET /api/profile | HTTP 403 | HTTP 403 FORBIDDEN | PASS |
| AZ-17 | ST-31, D-04 | seller account may use customer endpoints (cart) | HTTP 200 | HTTP 200 | PASS |
| AZ-18 | ST-31, D-04 | seller account may use seller endpoints (own listings) | HTTP 200 | HTTP 200 | PASS |
| AZ-19 | ST-07, FR-20 | seller edits another seller listing | HTTP 404 | HTTP 404 NOT_FOUND | PASS |
| AZ-20 | ST-07, FR-20 | seller removes another seller listing | HTTP 404 | HTTP 404 NOT_FOUND | PASS |
| AZ-21 | ST-07, FR-21 | seller changes another seller inventory | HTTP 404 | HTTP 404 NOT_FOUND | PASS |
| AZ-22 | ST-07 | the other seller data was not changed | price 25000, stock 10 | {"_id":"6ae0ef591f9652a325eebf1c","price":25000,"stock":10,"status":"approved"} | PASS |
| AZ-23 | ST-07, FR-18 | customer edits another customer's address | HTTP 404 | HTTP 404 NOT_FOUND | PASS |
| AZ-24 | ST-07, FR-18 | customer deletes another customer's address | HTTP 404 | HTTP 404 NOT_FOUND | PASS |
| AZ-25 | ST-08 | profile update with extra field "roles" is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| AZ-26 | ST-08 | profile update with extra field "status" is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| AZ-27 | ST-08 | profile update with extra field "passwordHash" is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| AZ-28 | ST-08 | profile update with extra field "email" is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| AZ-29 | ST-08 | profile update with extra field "tokenVersion" is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| AZ-30 | ST-08 | the user roles are unchanged after the mass-assignment attempts | customer | customer | PASS |
| AZ-31 | ST-08 | listing with client-supplied sellerId is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| AZ-32 | ST-08 | listing with client-supplied status approved is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| AZ-33 | ST-08 | listing with client-supplied reserved is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| AZ-34 | ST-08 | listing with client-supplied searchText is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| CAT-01 | FR-04 | catalog page size is 20 and only approved listings appear | pageSize 20, items <= 20, all approved | pageSize 20, 14 items, 14 total | PASS |
| CAT-02 | FR-04 | a page beyond the last page is empty, not an error | 200 with no items | HTTP 200, 0 items | PASS |
| CAT-03 | FR-05, A-14 | partial match, case-insensitive, middle of a word | 'lpha b' finds Validation Alpha Book | ["Validation Alpha Book"] | PASS |
| CAT-04 | FR-05 | search by author | 'fixture auth' finds the fixture books | 2 | PASS |
| CAT-05 | FR-05 | search by ISBN fragment and by hyphenated ISBN | finds Alpha | [1,1] | PASS |
| CAT-06 | FR-05 | 1 and 2 character queries use prefix mode | 'va' finds titles starting with Va | 2 | PASS |
| CAT-07 | FR-05, ST-10 | regex and operator characters are matched as text | no result, no error | [200,200,200,200] | PASS |
| CAT-08 | ST-10 | query longer than 100 characters is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| CAT-09 | FR-06 | filter by category, price range, minimum rating, language; sort by price | each filter narrows the result | [6,4,0,0] | PASS |
| CAT-10 | FR-06 | price_asc sorts ascending | sorted | 19900,24900,25000,25000,29900,35000 | PASS |
| CAT-11 | FR-06, TC-API | invalid query "sort=cheapest" is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| CAT-12 | FR-06, TC-API | invalid query "minRating=9" is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| CAT-13 | FR-06, TC-API | invalid query "page=0" is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| CAT-14 | FR-06, TC-API | invalid query "minPrice=-1" is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| CAT-15 | FR-06, TC-API | invalid query "category=zz" is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| CAT-16 | FR-06, TC-API | invalid query "unknown=1" is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| CAT-17 | ST-09 | operator injection "category[$ne]=x" in the query string | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| CAT-18 | ST-09 | operator injection "q[$regex]=.*" in the query string | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| CAT-19 | ST-09 | operator injection "q[$where]=1" in the query string | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| CAT-20 | FR-07, UC-03 | book details contain title, author, ISBN, price, description, images, stock status, rating | all fields present | id,sellerId,title,author,isbn,price,description,categoryId,language,imageUrls,available,stockStatus,status,avgRating,reviewCount | PASS |
| CAT-21 | FR-07 | the public book shows no private stock numbers or search fields | no stock/reserved/searchText | none | PASS |
| CAT-22 | FR-25, FR-07 | a pending listing is not visible (404) | HTTP 404 | HTTP 404 NOT_FOUND | PASS |
| CAT-23 | TC-API-16 | unknown id is 404 | HTTP 404 | HTTP 404 NOT_FOUND | PASS |
| CAT-24 | TC-API-16 | malformed id is 400 | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| CART-01 | FR-08 | add to cart | line with quantity 2 | {"q":2,"total":50000} | PASS |
| CART-02 | FR-08 | adding the same book again combines the quantities | quantity 3 | 3 | PASS |
| CART-03 | FR-12 | summary: subtotal, 5 % tax rounded, flat shipping, total | 75000 + 3750 + 4900 = 83650 | {"subtotal":75000,"tax":3750,"shippingFee":4900,"total":83650} | PASS |
| CART-04 | FR-09 | quantity above available stock (3 + 8 > 10) is refused with a message | HTTP 409 | HTTP 409 INSUFFICIENT_STOCK | PASS |
| CART-05 | FR-09 | the refusal message states the available number | message contains 'available' | Only 10 copies are available | PASS |
| CART-06 | FR-09 | update to a quantity above stock is refused | HTTP 409 | HTTP 409 INSUFFICIENT_STOCK | PASS |
| CART-7 | FR-08 | quantity 0 is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| CART-8 | FR-08 | quantity 51 is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| CART-9 | FR-08 | quantity 1.5 is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| CART-10 | FR-08 | unapproved book cannot be added | HTTP 404 | HTTP 404 BOOK_NOT_FOUND | PASS |
| CART-11 | FR-08 | removing a book that is not in the cart | HTTP 404 | HTTP 404 ITEM_NOT_IN_CART | PASS |
| CART-12 | FR-08 | the cart persists across logout and login | quantity 3 still there | 3 | PASS |
| CART-13 | D-06 | the cart does not reserve stock | reserved 0 | 0 | PASS |
| CART-14 | FR-10 | wishlist add | HTTP 200 | HTTP 200 | PASS |
| CART-15 | FR-10 | adding twice keeps one entry | 1 item | 1 | PASS |
| CART-16 | FR-10 | wishlist remove | HTTP 204 | HTTP 204 | PASS |
| CART-17 | FR-10 | removing an absent book is harmless | HTTP 204 | HTTP 204 | PASS |
| CART-18 | FR-10 | unapproved book cannot be wishlisted | HTTP 404 | HTTP 404 BOOK_NOT_FOUND | PASS |
| ORD-01 | FR-11 | checkout without an address is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| ORD-02 | FR-11 | both addressId and shippingAddress is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| ORD-03 | FR-11 | another user's / unknown address is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| ORD-04 | ST-18 | client-supplied total/price is refused (the server computes totals) | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| ORD-05 | FR-30, D-06, UC-08 | checkout creates a PendingPayment order and a payment session | HTTP 201 | HTTP 201 | PASS |
| ORD-06 | ST-18, FR-12 | the order uses the current price (300.00 x 3), computed by the server | subtotal 90000, tax 4500, shipping 4900, total 99400 | {"subtotal":90000,"tax":4500,"shippingFee":4900,"total":99400} | PASS |
| ORD-07 | D-06, FR-30 | stock is reserved, not yet decremented | stock 10, reserved 3 | stock 10, reserved 3 | PASS |
| ORD-08 | D-06 | reservation expiry is set (1 minute in this validation run) | about 60 s ahead | 60 s | PASS |
| ORD-09 | FR-15 | a PendingPayment order is not in the order history | 0 orders | 0 | PASS |
| ORD-10 | FR-13, ST-17 | a payment the gateway does not confirm is refused | HTTP 400 | HTTP 400 PAYMENT_VERIFICATION_FAILED | PASS |
| ORD-11 | FR-13 | the order stays PendingPayment and the reservation is kept | reserved 3 | reserved 3 | PASS |
| ORD-12 | ST-17, VFR-08 | forged payment id and signature are refused | HTTP 400 | HTTP 400 PAYMENT_VERIFICATION_FAILED | PASS |
| ORD-13 | VFR-08, ST-16 | card fields in the request are refused, not stored | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| ORD-14 | ST-07 | another customer cannot confirm this order | HTTP 404 | HTTP 404 NOT_FOUND | PASS |
| ORD-15 | FR-13, FR-30 | three simultaneous confirmations place the order once (idempotent) | all 200 Placed; stock 7, reserved 0 | 200,200,200; {"_id":"6ae0ef591f9652a325eebf1c","stock":7,"reserved":0} | PASS |
| ORD-16 | FR-14, UC-25 | exactly one order confirmation email | 1 email | 1 | PASS |
| ORD-17 | VFR-08 | the payment record has gateway references only | no card-like field | ["_id","orderId","gateway","gatewayOrderId","amount","currency","status","createdAt","updatedAt","__v","gatewayPaymentId"] | PASS |
| ORD-18 | FR-13 | the cart is cleared after payment | empty | 0 | PASS |
| ORD-19 | FR-15, UC-10 | order history shows the placed order with status Placed | 1 order, Placed | 1 orders, Placed | PASS |
| ORD-20 | ST-07, FR-15 | another customer cannot read this order | HTTP 404 | HTTP 404 NOT_FOUND | PASS |
| ORD-21 | ST-07, FR-16 | another customer cannot cancel this order | HTTP 404 | HTTP 404 NOT_FOUND | PASS |
| ORD-22 | ST-17 | webhook without a signature | HTTP 401 | HTTP 401 INVALID_SIGNATURE | PASS |
| ORD-23 | ST-17 | webhook with a signature for a different body | HTTP 401 | HTTP 401 INVALID_SIGNATURE | PASS |
| ORD-24 | ST-17 | the refused webhooks changed nothing | reserved 1 for Beta | reserved 1 | PASS |
| ORD-25 | FR-13, I-25 | signed payment.failed webhook is accepted | HTTP 200 | HTTP 200 | PASS |
| ORD-26 | D-06 | a failed payment releases the reservation | reserved 0, order PaymentFailed | reserved 0, PaymentFailed | PASS |
| ORD-27 | ST-17 | replaying the same webhook changes nothing | 200, reserved still 0 | HTTP 200, reserved 0 | PASS |
| ORD-28 | FR-13 | a closed (PaymentFailed, not expired) order cannot be paid | HTTP 409 | HTTP 409 ORDER_NOT_PAYABLE | PASS |
| ORD-29 | FR-16, D-06 | cancelling an unpaid order releases the reservation and makes no refund | PaymentFailed, reserved 0, refundStatus none | PaymentFailed, reserved 0, none | PASS |
| ORD-30 | FR-16 | cancelling twice is refused | HTTP 409 | HTTP 409 ORDER_NOT_CANCELLABLE | PASS |
| ORD-31 | FR-16 | cancelling a Placed order restores stock and refunds | Cancelled, refunded, stock +5 | Cancelled, refunded, stock 5 -> 10 | PASS |
| ORD-32 | FR-16 | the payment is marked refunded | refunded | refunded | PASS |
| ORD-33 | FR-30, D-06 | checkout when one of two lines is short is refused | HTTP 409 | HTTP 409 INSUFFICIENT_STOCK | PASS |
| ORD-34 | FR-30, VFR-14 | nothing is reserved for the other line (all or nothing) and no order exists | Alpha reserved unchanged (0), 0 orders | Alpha reserved 0, 0 orders | PASS |
| ORD-35 | FR-30 | multi-item checkout reserves every line | two lines; Alpha +2, Scarce 2 reserved | 2 lines; Alpha +2, Scarce 2 | PASS |
| ORD-36 | D-06 | a new checkout releases the same customer earlier unpaid order (one open checkout) | earlier order PaymentFailed / abandoned; its units released | PaymentFailed / abandoned; Scarce reserved 0 | PASS |
| ORD-37 | D-06, FR-30 | re-starting the checkout while the customer's own open checkout holds the last copies succeeds (the earlier order is replaced) | 201 | HTTP 201 | PASS |
| EXP-01 | D-06, I-27 | an unpaid reservation expires and the sweeper releases it | PaymentFailed / expired, reserved 0 | PaymentFailed/expired, reserved 0, after 95 s | PASS |
| EXP-02 | D-06 | the second expired order is released too | expired, reserved 0 | expired, reserved 0 | PASS |
| EXP-03 | A-13, D-06 | late payment with stock still free re-reserves and places the order | Placed; stock 0, reserved 0 | 200 Placed; {"_id":"6ae0ef5b1f9652a325eec159","stock":0,"reserved":0} | PASS |
| EXP-04 | A-13, D-06 | late payment when the stock is gone is refunded and the order fails (409 ORDER_FAILED_REFUNDED) | 409; payment refunded; stock 0; not oversold | 409 ORDER_FAILED_REFUNDED; payment refunded; {"_id":"6ae0ef5b1f9652a325eec17c","stock":0,"reserved":0} | PASS |
| CON-01a | FR-30, ST-19 | 20 buyers race for 5 copies: exactly 5 reservations, the rest told before payment | 5 x 201, 15 x 409, 0 x 5xx, reserved 5 | 5 x 201, 15 x 409, 0 x 5xx, reserved 5 | PASS |
| CON-01b | FR-30, VFR-14 | after payment, cancellation and abandonment the counts are consistent and never negative | stock 3, reserved 1 | stock 3, reserved 1 | PASS |
| CON-02a | FR-30, ST-19 | 50 buyers race for 10 copies: exactly 10 reservations, the rest told before payment | 10 x 201, 40 x 409, 0 x 5xx, reserved 10 | 10 x 201, 40 x 409, 0 x 5xx, reserved 10 | PASS |
| CON-02b | FR-30, VFR-14 | after payment, cancellation and abandonment the counts are consistent and never negative | stock 6, reserved 3 | stock 6, reserved 3 | PASS |
| CON-03a | FR-30, ST-19 | 100 buyers race for 10 copies: exactly 10 reservations, the rest told before payment | 10 x 201, 90 x 409, 0 x 5xx, reserved 10 | 10 x 201, 90 x 409, 0 x 5xx, reserved 10 | PASS |
| CON-03b | FR-30, VFR-14 | after payment, cancellation and abandonment the counts are consistent and never negative | stock 6, reserved 3 | stock 6, reserved 3 | PASS |
| SEL-01 | FR-19 | a customer cannot use seller endpoints before approval | HTTP 403 | HTTP 403 FORBIDDEN | PASS |
| SEL-02 | FR-19, UC-15 | seller application | HTTP 201 | HTTP 201 | PASS |
| SEL-03 | FR-19 | a second pending application is refused | HTTP 409 | HTTP 409 APPLICATION_EXISTS | PASS |
| SEL-04 | FR-19 | a customer cannot approve applications | HTTP 403 | HTTP 403 FORBIDDEN | PASS |
| SEL-05 | FR-25, UC-21 | administrator approves the application | HTTP 200 | HTTP 200 | PASS |
| SEL-06 | FR-25 | approving again is refused | HTTP 409 | HTTP 409 NOT_PENDING | PASS |
| SEL-07 | FR-19, D-04 | the approved seller keeps the customer role and the seller role takes effect at once | customer + seller | customer+seller | PASS |
| SEL-08 | FR-19, D-04 | the new seller can still use the cart | HTTP 200 | HTTP 200 | PASS |
| SEL-09 | FR-20, UC-16 | create a listing | HTTP 201 | HTTP 201 | PASS |
| SEL-10 | FR-25 | a pending listing is not in the catalog | HTTP 404 | HTTP 404 NOT_FOUND | PASS |
| SEL-11 | FR-20 | listing with invalid ISBN check digit is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| SEL-12 | FR-20 | listing with price 0 is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| SEL-13 | FR-20 | listing with negative stock is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| SEL-14 | FR-20 | listing with empty title is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| SEL-15 | FR-20 | listing with unknown category is refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| SEL-16 | D-11 | the same seller cannot reuse an ISBN | HTTP 409 | HTTP 409 ISBN_EXISTS_FOR_SELLER | PASS |
| IMG-01 | FR-20, D-09 | upload a PNG | HTTP 201 | HTTP 201 | PASS |
| IMG-02 | FR-20 | upload a JPEG | HTTP 201 | HTTP 201 | PASS |
| IMG-03 | ST-24 | a script renamed to .png is refused | HTTP 400 | HTTP 400 INVALID_FILE | PASS |
| IMG-04 | ST-24 | an SVG with script is refused | HTTP 400 | HTTP 400 INVALID_FILE | PASS |
| IMG-05 | ST-24 | a Windows executable renamed to .jpg is refused | HTTP 400 | HTTP 400 INVALID_FILE | PASS |
| IMG-06 | ST-24 | a file name with path traversal is stored under a server-made name | HTTP 201 | HTTP 201 | PASS |
| IMG-07 | ST-24, D-09 | a file over 2 MB is refused with 413 | HTTP 413 | HTTP 413 FILE_TOO_LARGE | PASS |
| IMG-08 | FR-20 | customer (not a seller) cannot upload | HTTP 403 | HTTP 403 FORBIDDEN | PASS |
| IMG-09 | FR-07, D-09 | the image downloads with the right type and long cache headers | 200 image/png public max-age=31536000 | 200 image/png public, max-age=31536000, immutable | PASS |
| IMG-10 | D-09 | files are in GridFS (fs.files) with the seller as owner and no client file name | every file has metadata.ownerId and a server-made name | 3 files | PASS |
| IMG-11 | D-09 | a listing can have at most 3 images | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| IMG-12 | ST-07 | another seller's image cannot be attached | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| IMG-13 | FR-20 | attach an own image to the listing | HTTP 200 | HTTP 200 | PASS |
| SEL-17 | FR-25, UC-21 | administrator approves the listing | HTTP 200 | HTTP 200 | PASS |
| SEL-18 | FR-25, FR-05 | the approved listing appears in the catalog search with its image | 1 result with imageUrls | 1 result(s), 1 image(s) | PASS |
| SEL-19 | VFR-06 | HTML in the description is returned as plain text data | literal <b> in JSON | <b>Bold</b> text | PASS |
| SEL-20 | FR-21, UC-17 | inventory update shows available and in-stock status | stock 3, available 3 | {"stock":3,"available":3,"status":"In stock"} | PASS |
| SEL-21 | FR-21, D-12 | a low-stock alert exists once the stock is at or below the threshold (4) | one unread alert | 1 alert(s) | PASS |
| SEL-22 | FR-21 | mark the alert as read | HTTP 200 | HTTP 200 | PASS |
| SEL-23 | ST-07 | another seller cannot read this seller's alert | HTTP 404 | HTTP 404 NOT_FOUND | PASS |
| SEL-24 | FR-22, UC-18 | the seller sees only own items of a mixed order, with the shipping address | 1 own item + shipping name | 1 item(s): Seller Journey Book; ship to Val Idator | PASS |
| SEL-25 | ST-07 | the seller view contains no other seller title and no order total | absent | absent | PASS |
| SEL-26 | FR-22 | skipping a step (Placed to Shipped) is refused | HTTP 409 | HTTP 409 INVALID_STATUS_TRANSITION | PASS |
| SEL-27 | FR-22 | customer cannot change fulfilment status | HTTP 403 | HTTP 403 FORBIDDEN | PASS |
| SEL-28 | ST-07 | another seller cannot change this seller's item | HTTP 404 | HTTP 404 NOT_FOUND | PASS |
| SEL-29 | FR-22 | Placed to Packed | HTTP 200 | HTTP 200 | PASS |
| SEL-30 | D-07 | order status is the lowest item status: the other seller's item is still Placed | Placed | Placed | PASS |
| SEL-31 | FR-22 | Packed to Shipped | HTTP 200 | HTTP 200 | PASS |
| SEL-32 | FR-16 | a customer cannot cancel once an item has shipped | HTTP 409 | HTTP 409 ORDER_NOT_CANCELLABLE | PASS |
| SEL-33 | FR-22 | Shipped to Delivered | HTTP 200 | HTTP 200 | PASS |
| SEL-34 | FR-22 | going back from Delivered is refused | HTTP 409 | HTTP 409 INVALID_STATUS_TRANSITION | PASS |
| SEL-35 | FR-23, UC-19 | sales report counts the seller own items only | orders 1, units 2, revenue 39900 | {"o":1,"u":2,"r":39900} | PASS |
| SEL-36 | FR-23 | report range longer than 366 days is refused | HTTP 400 | HTTP 400 INVALID_DATE_RANGE | PASS |
| SEL-37 | FR-23 | report with from after to is refused | HTTP 400 | HTTP 400 INVALID_DATE_RANGE | PASS |
| REV-01 | FR-17, ST-20 | review without a delivered purchase is refused | HTTP 403 | HTTP 403 NOT_ELIGIBLE | PASS |
| REV-02 | FR-17 | rating 0 and 6 are refused | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| REV-03 | FR-17, UC-12 | review after delivery | HTTP 201 | HTTP 201 | PASS |
| REV-04 | FR-17 | the book average rating is updated | avgRating 4, reviewCount 1 | {"a":4,"c":1} | PASS |
| REV-05 | ST-20 | a second review of the same book is refused | HTTP 409 | HTTP 409 ALREADY_REVIEWED | PASS |
| REV-06 | ST-11, VFR-06 | the review comment is returned as inert JSON text | literal text | <img src=x onerror=alert(1)> | PASS |
| ADM-01 | FR-24, UC-20 | user list with search; no password data | found, no hash | 1 user(s) | PASS |
| ADM-02 | FR-24 | administrator suspends a user | HTTP 200 | HTTP 200 | PASS |
| ADM-03 | FR-24, ST-29 | the suspended user session stops working at once | HTTP 401 | HTTP 401 UNAUTHENTICATED | PASS |
| ADM-04 | FR-24, ST-29 | the suspended user cannot log in | HTTP 403 | HTTP 403 ACCOUNT_SUSPENDED | PASS |
| ADM-05 | FR-24 | reactivation | HTTP 200 | HTTP 200 | PASS |
| ADM-06 | FR-24 | the user can log in again | HTTP 200 | HTTP 200 | PASS |
| ADM-07 | FR-24, ST-29 | administrator cannot suspend themselves | HTTP 409 | HTTP 409 CANNOT_MODIFY_SELF | PASS |
| ADM-08 | FR-25 | rejection needs a reason | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| ADM-09 | FR-25 | administrator rejects with a reason | HTTP 200 | HTTP 200 | PASS |
| ADM-10 | FR-19 | the rejected applicant stays a customer and sees the reason | customer, rejected, reason | ["customer","rejected"] | PASS |
| ADM-11 | FR-25 | administrator rejects a listing with a reason | HTTP 200 | HTTP 200 | PASS |
| ADM-12 | FR-25 | a decided listing cannot be decided again | HTTP 409 | HTTP 409 NOT_PENDING | PASS |
| ADM-13 | FR-26, UC-23 | add a category | HTTP 201 | HTTP 201 | PASS |
| ADM-14 | FR-26 | duplicate name in another case is refused | HTTP 409 | HTTP 409 CATEGORY_EXISTS | PASS |
| ADM-15 | FR-26 | rename | HTTP 200 | HTTP 200 | PASS |
| ADM-16 | FR-26 | a category with books cannot be deleted | HTTP 409 | HTTP 409 CATEGORY_IN_USE | PASS |
| ADM-17 | FR-26 | delete an unused category | HTTP 204 | HTTP 204 | PASS |
| ADM-18 | FR-27, UC-22 | administrator lists reviews of a book | 1 review | 1 | PASS |
| ADM-19 | FR-27 | administrator removes the review | HTTP 204 | HTTP 204 | PASS |
| ADM-20 | FR-27 | the average rating is recalculated | avgRating 0, count 0 | {"a":0,"c":0} | PASS |
| ADM-21 | FR-27 | customers cannot remove reviews | HTTP 403 | HTTP 403 FORBIDDEN | PASS |
| ADM-22 | FR-28, UC-24 | platform report has order count, revenue and at most 10 top books | orders > 0, revenue > 0, topBooks <= 10 | {"o":14,"rev":572495,"top":8} | PASS |
| ADM-23 | FR-28 | invalid report range is refused | HTTP 400 | HTTP 400 INVALID_DATE_RANGE | PASS |
| ERR-01 | ST-23 | malformed JSON | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| ERR-02 | TC-API | missing required fields name the field | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| ERR-03 | ST-23 | oversized JSON body | HTTP 413 | HTTP 413 VALIDATION_ERROR | PASS |
| ERR-04 | ST-23 | deeply nested object with operator keys | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| ERR-05 | ST-09 | NoSQL operator objects as credentials | HTTP 400 | HTTP 400 VALIDATION_ERROR | PASS |
| ERR-06 | TC-API | unknown API route gives the uniform error body | 404 NOT_FOUND | 404 {"error":{"code":"NOT_FOUND","message":"Route not found","details":[]}} | PASS |
| ERR-07 | TC-API | CSRF header missing on a state-changing call | HTTP 403 | HTTP 403 CSRF_INVALID | PASS |
| ERR-08 | ST-13 | wrong CSRF token | HTTP 403 | HTTP 403 CSRF_INVALID | PASS |
| ERR-09 | ST-13 | cookie only (cross-site form post): no header | HTTP 403 | HTTP 403 CSRF_INVALID | PASS |
| ERR-10 | ST-13 | CSRF also applies to PATCH, PUT and DELETE | HTTP 403 | HTTP 403 CSRF_INVALID | PASS |
| ERR-11 | ST-28 | error bodies contain no stack trace or file path | none | none | PASS |
| SEC-01 | ST-15 | security headers present: CSP, nosniff, frame protection, referrer policy, no X-Powered-By | all present | content-security-policy:y x-content-type-options:y x-frame-options:y referrer-policy:y x-powered-by:absent | PASS |
| SEC-02 | ST-11, VFR-06 | CSP: scripts only from 'self', no inline scripts, no framing, no plugins | script-src 'self'; frame-ancestors 'none'; object-src 'none' | default-src 'self';script-src 'self';script-src-attr 'none';style-src 'self';font-src 'self';img-src 'self' data:;connect-src 'self';form-action 'self';base-uri 'self';frame-ancestors 'none';object-src 'none' | PASS |
| SEC-03 | VFR-08, VFR-04, ST-01 | the request log contains no passwords, tokens, cookies, card numbers or query strings | none of the test secrets | 1035 request lines scanned | PASS |
| SEC-04 | VFR-08 | no password or card number appears anywhere in the structured log | absent | checked | PASS |
| SEC-05 | ST-30, FR-24 | audit entries (login failure, lockout, role change, suspension, refund) are logged with ids | audit:* lines present | audit:login_failed,audit:account_locked,audit:password_reset,audit:refund,audit:seller_application_approve,audit:user_status_changed,audit:seller_application_reject | PASS |
| SEC-06 | ST-27, VFR-04 | no .env file or secret is tracked in git | only .env.example | .env.example | PASS |
| HLT-01 | VFR-09, API-61 | GET /api/health with the database up | 200 { status ok, db up } | 200 {"status":"ok","db":"up","uptimeSeconds":153,"time":"2026-10-27T18:39:23.187Z"} | PASS |
