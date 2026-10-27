# Database and data-integrity validation

43 of 43 checks passed.

| ID | Refs | Check | Expected | Actual | Result |
|---|---|---|---|---|---|
| DB-00 | SDD 8.1 | 11 collections plus GridFS exist and hold data from the live run | all 13 present | {"users":188,"auth_tokens":3,"categories":5,"books":23,"carts":176,"wishlists":1,"orders":37,"payments":37,"reviews":0,"seller_applications":2,"notifications":27,"fs.files":3,"fs.chunks":3} | PASS |
| DB-01 | SDD 8.1 | the 11 collections of the data dictionary exist | users auth_tokens categories books carts wishlists orders payments reviews seller_applications notifications | auth_tokens books carts categories notifications orders payments reviews seller_applications users wishlists | PASS |
| DB-02 | FR-30 | every book has integer stock >= 0, reserved >= 0 and reserved <= stock | 0 violations | 0 violations in 23 books | PASS |
| DB-03 | D-06 | reserved equals the units held by open (PendingPayment) orders, for every book | 0 mismatches | 0 mismatches; 7 open orders | PASS |
| DB-04 | D-06, I-27 | no unpaid order stays open more than 3 minutes past its expiry (sweeper runs every minute) | 0 stuck | 0 | PASS |
| DB-05 | FR-12, D-08 | order totals = subtotal + tax + shipping; line totals = price x quantity; all integers | 0 violations | 0 of 37 orders | PASS |
| DB-06 | D-07 | every order has a valid status | valid | Placed,PaymentFailed,Cancelled,PendingPayment | PASS |
| DB-07 | D-07 | order status equals the lowest status of its non-cancelled items | 0 violations | 0 | PASS |
| DB-08 | FR-13 | every placed order has a placedAt time and a succeeded payment | 0 violations | 0 of 14 | PASS |
| DB-09 | FR-16 | every cancelled order has cancelledAt, all items Cancelled and its payment refunded or refund_pending | 0 violations | 1 cancelled | PASS |
| DB-10 | D-06 | every PaymentFailed order has a failure reason from the allowed list | valid | payment_failed,abandoned,stock_unavailable_refunded | PASS |
| DB-11 | D-06, A-13 | orders that failed for lack of stock after a late payment have a refunded payment | 1 order(s), all refunded | 1 refunded | PASS |
| DB-12 | VFR-08 | no payment document has a card-like field; only gateway references and amounts | 0 card-like keys | 37 payments scanned | PASS |
| DB-13 | FR-13 | payment amount equals the order total | 0 differences | 0 | PASS |
| DB-14 | FR-13 | no gateway payment id is used by two payments | all unique | 16 ids, 16 unique | PASS |
| DB-15 | FR-15 | every order item carries title, ISBN and price snapshots | 0 missing | 0 | PASS |
| DB-16 | SDD 8.2 | every book references an existing seller and category | 0 broken | 0 | PASS |
| DB-17 | SDD 8.2 | every order item references an existing book and seller; the seller owns the book | 0 broken | 0 | PASS |
| DB-18 | FR-08 | carts: one per user, references exist, quantities 1 to 50 | 0 violations | 176 carts | PASS |
| DB-19 | FR-10 | wishlists: one per user, no duplicate books, references exist | 0 violations | 1 wishlists | PASS |
| DB-20 | FR-17, FR-27 | the average rating and review count of every book that has reviews (or none) equals the stored reviews | 0 differences | 0 of 23 books | PASS |
| DB-20b | FR-07 | no book shows an average rating that is not backed by reviews | 0 books | 0 demo-data books show a rating (e.g. -) with 0 reviews: the seed script sets avgRating by hand | PASS |
| DB-21 | FR-17 | one review per user and book; ratings 1 to 5 | 0 violations | 0 reviews | PASS |
| DB-22 | FR-19 | at most one pending application per user | max 1 | 0 | PASS |
| DB-23 | FR-19, D-04 | every approved applicant has roles customer + seller and a seller profile | true | true | PASS |
| DB-24 | VFR-04 | every password is a bcrypt hash with cost >= 10; roles and status values are valid | valid | 188 users | PASS |
| DB-25 | FR-18 | no user has more than 5 addresses | max 5 | 2 | PASS |
| DB-26 | SDD 8.2, FR-03 | notifications never store secret tokens or links | 0 matches | 0 | PASS |
| DB-27 | FR-01, FR-03 | one-time tokens are stored only as 64-character hashes | all sha256 | 3 tokens | PASS |
| DB-28 | D-09 | every GridFS file has chunks, a known type and an owner | 0 violations | 3 files | PASS |
| DB-29 | D-09 | every listing has at most 3 images, all existing and owned by the listing seller | 0 violations | 0 | PASS |
| DB-30 | D-09 | unattached images: those older than 24 hours would be removed by the hourly cleanup (cleanupOrphans) | none older than 24 h | 2 unattached (all uploaded in the last hour); older than 24 h: 0. The deletion itself is covered by the automated test (media.test.js) | PASS |
| DB-31 | SDD 8.2 | the indexes of the data dictionary exist | 0 missing | 0 missing | PASS |
| DB-32 | SDD 8.2 | unique, sparse, partial and TTL flags | users.email unique; payments.gatewayPaymentId unique+sparse; seller_applications.userId unique+partial; auth_tokens.expiresAt TTL 0 | {"e":true,"g":[true,true],"p":[true,true],"t":0} | PASS |
| DB-33 | SDD 8.2 | category names are unique ignoring case (collation strength 2) | strength 2 | {"locale":"en","strength":2} | PASS |
| DB-34 | SDD 8.2 | every index declared in the schemas exists in the database | 0 missing | 0 missing | PASS |
| DB-35 | SDD 8.3, TC-FR-30 | the database refuses stock -1, reserved above stock, and price 0 | all three rejected | rejected (121); rejected (121); rejected (121) | PASS |
| DB-36 | SDD 4.3 | the database refuses duplicate user email, duplicate category name (any case), duplicate seller ISBN, duplicate gateway payment id, duplicate review | all rejected | rejected (11000); rejected (11000); rejected (11000); rejected (11000); rejected (11000) (temporary first review: accepted) | PASS |
| DB-37 | SDD 4.3 | the rejected writes changed nothing | unchanged | stock 25, reserved 0, price 39900 | PASS |
| DB-38 | SDD 8.2 | the books collection has the stock/reserved/price validator | validator present | {"$expr":{"$and":[{"$gte":["$stock",0]},{"$gte":["$reserved",0]},{"$lte":["$rese | PASS |
| DB-39 | TC-VFR-14, SDD 8.4 | a forced failure inside a transaction rolls the whole change back | reserved unchanged | error "forced failure", reserved 0 -> 0 | PASS |
| DB-40 | D-10, VFR-02 | the trigram search query uses the search index (no collection scan) | IXSCAN status_1_searchTrigrams_1, no COLLSCAN | IXSCAN | PASS |
| DB-41 | VFR-02 | the default browse (newest first) is answered from an index without an in-memory sort | IXSCAN, no SORT stage | index order | PASS |
