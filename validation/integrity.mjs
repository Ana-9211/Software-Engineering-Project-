// Phase 4 data-integrity validation: checks the invariants of the design (SDD section 8) on the database of the
// running system after the live validation has run, and tries to break database-level constraints directly.
import { createRequire } from 'node:module';
import path from 'node:path';
import { ROOT, recorder, connectDb, mongoose } from './lib.mjs';

const require = createRequire(import.meta.url);
const models = require(path.join(ROOT, 'server', 'src', 'models'));
const R = recorder('Database and data-integrity validation');
const db = await connectDb();
const col = (n) => db.collection(n);
const count = (n, f = {}) => col(n).countDocuments(f);
const oidStr = (x) => String(x);

R.section('Counts');
const counts = {};
for (const n of ['users', 'auth_tokens', 'categories', 'books', 'carts', 'wishlists', 'orders', 'payments', 'reviews', 'seller_applications', 'notifications', 'fs.files', 'fs.chunks']) counts[n] = await count(n);
R.check('DB-00', 'SDD 8.1', '11 collections plus GridFS exist and hold data from the live run', 'all 13 present', JSON.stringify(counts), Object.keys(counts).length === 13 && counts.users > 0 && counts.books > 0 && counts.orders > 0 && counts.payments > 0 && counts['fs.files'] > 0);
const names = (await db.listCollections().toArray()).map((c) => c.name);
R.check('DB-01', 'SDD 8.1', 'the 11 collections of the data dictionary exist', 'users auth_tokens categories books carts wishlists orders payments reviews seller_applications notifications', names.filter((n) => !n.startsWith('fs.') && !n.startsWith('system.')).sort().join(' '), ['users', 'auth_tokens', 'categories', 'books', 'carts', 'wishlists', 'orders', 'payments', 'reviews', 'seller_applications', 'notifications'].every((n) => names.includes(n)));

R.section('Stock and reservation (FR-30, D-06, VFR-14)');
const books = await col('books').find({}).toArray();
const bad = books.filter((b) => !(b.stock >= 0 && b.reserved >= 0 && b.reserved <= b.stock && Number.isInteger(b.stock) && Number.isInteger(b.reserved)));
R.check('DB-02', 'FR-30', 'every book has integer stock >= 0, reserved >= 0 and reserved <= stock', '0 violations', `${bad.length} violations in ${books.length} books`, bad.length === 0);
const pending = await col('orders').find({ status: 'PendingPayment' }).toArray();
const held = new Map();
for (const o of pending) for (const i of o.items) held.set(oidStr(i.bookId), (held.get(oidStr(i.bookId)) || 0) + i.quantity);
const mismatch = books.filter((b) => (held.get(oidStr(b._id)) || 0) !== b.reserved);
R.check('DB-03', 'D-06', 'reserved equals the units held by open (PendingPayment) orders, for every book', '0 mismatches', `${mismatch.length} mismatches; ${pending.length} open orders`, mismatch.length === 0);
const stuck = await col('orders').countDocuments({ status: 'PendingPayment', reservationExpiresAt: { $lt: new Date(Date.now() - 180000) } });
R.check('DB-04', 'D-06, I-27', 'no unpaid order stays open more than 3 minutes past its expiry (sweeper runs every minute)', '0 stuck', String(stuck), stuck === 0);

R.section('Orders and payments (FR-12, FR-13, VFR-08, VFR-14)');
const orders = await col('orders').find({}).toArray();
const payments = new Map((await col('payments').find({}).toArray()).map((p) => [oidStr(p.orderId), p]));
const arith = orders.filter((o) => o.total !== o.subtotal + o.tax + o.shippingFee || o.items.some((i) => i.lineTotal !== i.unitPrice * i.quantity) || o.subtotal !== o.items.reduce((s, i) => s + i.lineTotal, 0));
R.check('DB-05', 'FR-12, D-08', 'order totals = subtotal + tax + shipping; line totals = price x quantity; all integers', '0 violations', `${arith.length} of ${orders.length} orders`, arith.length === 0 && orders.every((o) => [o.subtotal, o.tax, o.shippingFee, o.total].every(Number.isInteger)));
const statuses = new Set(['PendingPayment', 'PaymentFailed', 'Placed', 'Packed', 'Shipped', 'Delivered', 'Cancelled']);
R.check('DB-06', 'D-07', 'every order has a valid status', 'valid', [...new Set(orders.map((o) => o.status))].join(), orders.every((o) => statuses.has(o.status)));
const rank = { Placed: 0, Packed: 1, Shipped: 2, Delivered: 3 };
const derived = orders.filter((o) => ['Placed', 'Packed', 'Shipped', 'Delivered'].includes(o.status)).filter((o) => {
  const active = o.items.filter((i) => i.fulfilmentStatus !== 'Cancelled');
  const low = active.reduce((m, i) => (rank[i.fulfilmentStatus] < rank[m] ? i.fulfilmentStatus : m), active[0].fulfilmentStatus);
  return low !== o.status;
});
R.check('DB-07', 'D-07', 'order status equals the lowest status of its non-cancelled items', '0 violations', String(derived.length), derived.length === 0);
const placed = orders.filter((o) => ['Placed', 'Packed', 'Shipped', 'Delivered'].includes(o.status));
R.check('DB-08', 'FR-13', 'every placed order has a placedAt time and a succeeded payment', '0 violations', `${placed.filter((o) => !o.placedAt || !payments.get(oidStr(o._id)) || payments.get(oidStr(o._id)).status !== 'succeeded').length} of ${placed.length}`, placed.every((o) => o.placedAt && payments.get(oidStr(o._id)) && payments.get(oidStr(o._id)).status === 'succeeded'));
const cancelled = orders.filter((o) => o.status === 'Cancelled');
R.check('DB-09', 'FR-16', 'every cancelled order has cancelledAt, all items Cancelled and its payment refunded or refund_pending', '0 violations', `${cancelled.length} cancelled`, cancelled.every((o) => o.cancelledAt && o.items.every((i) => i.fulfilmentStatus === 'Cancelled') && ['refunded', 'refund_pending'].includes((payments.get(oidStr(o._id)) || {}).status)));
const failed = orders.filter((o) => o.status === 'PaymentFailed');
R.check('DB-10', 'D-06', 'every PaymentFailed order has a failure reason from the allowed list', 'valid', [...new Set(failed.map((o) => o.failureReason))].join(), failed.every((o) => ['payment_failed', 'abandoned', 'expired', 'stock_unavailable_refunded'].includes(o.failureReason)));
const refundedFail = failed.filter((o) => o.failureReason === 'stock_unavailable_refunded');
R.check('DB-11', 'D-06, A-13', 'orders that failed for lack of stock after a late payment have a refunded payment', `${refundedFail.length} order(s), all refunded`, `${refundedFail.filter((o) => (payments.get(oidStr(o._id)) || {}).status === 'refunded').length} refunded`, refundedFail.every((o) => (payments.get(oidStr(o._id)) || {}).status === 'refunded'));
const pay = [...payments.values()];
R.check('DB-12', 'VFR-08', 'no payment document has a card-like field; only gateway references and amounts', '0 card-like keys', `${pay.length} payments scanned`, !pay.some((p) => /card|cvv|cvc|pan|expiry|number/i.test(Object.keys(p).join(' ') + Object.keys(p.refund || {}).join(' '))));
R.check('DB-13', 'FR-13', 'payment amount equals the order total', '0 differences', String(pay.filter((p) => { const o = orders.find((x) => oidStr(x._id) === oidStr(p.orderId)); return !o || o.total !== p.amount; }).length), pay.every((p) => { const o = orders.find((x) => oidStr(x._id) === oidStr(p.orderId)); return o && o.total === p.amount; }));
const ids = pay.map((p) => p.gatewayPaymentId).filter(Boolean);
R.check('DB-14', 'FR-13', 'no gateway payment id is used by two payments', 'all unique', `${ids.length} ids, ${new Set(ids).size} unique`, ids.length === new Set(ids).size);
const snap = orders.filter((o) => o.items.some((i) => !i.titleSnapshot || !i.isbnSnapshot || i.unitPrice === undefined));
R.check('DB-15', 'FR-15', 'every order item carries title, ISBN and price snapshots', '0 missing', String(snap.length), snap.length === 0 && orders.every((o) => o.shippingAddress && o.shippingAddress.fullName));

R.section('References, ownership and consistency');
const userIds = new Set((await col('users').find({}, { projection: { _id: 1 } }).toArray()).map((u) => oidStr(u._id)));
const bookIds = new Set(books.map((b) => oidStr(b._id)));
const catIds = new Set((await col('categories').find({}).toArray()).map((c) => oidStr(c._id)));
R.check('DB-16', 'SDD 8.2', 'every book references an existing seller and category', '0 broken', String(books.filter((b) => !userIds.has(oidStr(b.sellerId)) || !catIds.has(oidStr(b.categoryId))).length), books.every((b) => userIds.has(oidStr(b.sellerId)) && catIds.has(oidStr(b.categoryId))));
R.check('DB-17', 'SDD 8.2', 'every order item references an existing book and seller; the seller owns the book', '0 broken', String(orders.flatMap((o) => o.items).filter((i) => !bookIds.has(oidStr(i.bookId)) || oidStr(books.find((b) => oidStr(b._id) === oidStr(i.bookId)).sellerId) !== oidStr(i.sellerId)).length), orders.flatMap((o) => o.items).every((i) => bookIds.has(oidStr(i.bookId)) && oidStr(books.find((b) => oidStr(b._id) === oidStr(i.bookId)).sellerId) === oidStr(i.sellerId)));
const carts = await col('carts').find({}).toArray();
R.check('DB-18', 'FR-08', 'carts: one per user, references exist, quantities 1 to 50', '0 violations', `${carts.length} carts`, carts.every((c) => userIds.has(oidStr(c.userId)) && c.items.every((i) => bookIds.has(oidStr(i.bookId)) && i.quantity >= 1 && i.quantity <= 50)) && new Set(carts.map((c) => oidStr(c.userId))).size === carts.length);
const wl = await col('wishlists').find({}).toArray();
R.check('DB-19', 'FR-10', 'wishlists: one per user, no duplicate books, references exist', '0 violations', `${wl.length} wishlists`, wl.every((w) => w.bookIds.every((b) => bookIds.has(oidStr(b))) && new Set(w.bookIds.map(oidStr)).size === w.bookIds.length) && new Set(wl.map((w) => oidStr(w.userId))).size === wl.length);
const reviews = await col('reviews').find({}).toArray();
const byBook = new Map();
for (const rv of reviews) byBook.set(oidStr(rv.bookId), [...(byBook.get(oidStr(rv.bookId)) || []), rv.rating]);
const isSeedRating = (b) => !(byBook.get(oidStr(b._id)) || []).length && b.reviewCount === 0 && b.avgRating > 0;
const calc = (b) => { const list = byBook.get(oidStr(b._id)) || []; return list.length ? Math.round((list.reduce((x, y) => x + y, 0) / list.length) * 100) / 100 : 0; };
const ratingBad = books.filter((b) => !isSeedRating(b) && (b.reviewCount !== (byBook.get(oidStr(b._id)) || []).length || Math.abs(b.avgRating - calc(b)) > 0.001));
R.check('DB-20', 'FR-17, FR-27', 'the average rating and review count of every book that has reviews (or none) equals the stored reviews', '0 differences', `${ratingBad.length} of ${books.length - books.filter(isSeedRating).length} books`, ratingBad.length === 0);
const seedRated = books.filter(isSeedRating);
R.check('DB-20b', 'FR-07', 'no book shows an average rating that is not backed by reviews', '0 books', `${seedRated.length} demo-data books show a rating (e.g. ${seedRated[0] ? seedRated[0].avgRating : '-'}) with 0 reviews: the seed script sets avgRating by hand`, seedRated.length === 0);
R.check('DB-21', 'FR-17', 'one review per user and book; ratings 1 to 5', '0 violations', `${reviews.length} reviews`, new Set(reviews.map((x) => `${x.bookId}:${x.userId}`)).size === reviews.length && reviews.every((x) => x.rating >= 1 && x.rating <= 5));
const apps = await col('seller_applications').find({}).toArray();
const pendingPerUser = apps.filter((a) => a.status === 'pending').reduce((m, a) => m.set(oidStr(a.userId), (m.get(oidStr(a.userId)) || 0) + 1), new Map());
R.check('DB-22', 'FR-19', 'at most one pending application per user', 'max 1', String(Math.max(0, ...pendingPerUser.values())), Math.max(0, ...pendingPerUser.values()) <= 1);
const approvedUsers = apps.filter((a) => a.status === 'approved').map((a) => oidStr(a.userId));
const sellersOk = (await col('users').find({ _id: { $in: approvedUsers.map((x) => new mongoose.Types.ObjectId(x)) } }).toArray()).every((u) => u.roles.includes('seller') && u.roles.includes('customer') && u.sellerProfile && u.sellerProfile.storeName);
R.check('DB-23', 'FR-19, D-04', 'every approved applicant has roles customer + seller and a seller profile', 'true', String(sellersOk), sellersOk);
const users = await col('users').find({}).toArray();
R.check('DB-24', 'VFR-04', 'every password is a bcrypt hash with cost >= 10; roles and status values are valid', 'valid', `${users.length} users`, users.every((u) => /^\$2[aby]\$(\d\d)\$/.test(u.passwordHash) && Number(u.passwordHash.slice(4, 6)) >= 10 && u.roles.every((r) => ['customer', 'seller', 'admin'].includes(r)) && ['pending_verification', 'active', 'suspended'].includes(u.status)));
R.check('DB-25', 'FR-18', 'no user has more than 5 addresses', 'max 5', String(Math.max(...users.map((u) => u.addresses.length))), users.every((u) => u.addresses.length <= 5));
const notif = await col('notifications').find({}).toArray();
R.check('DB-26', 'SDD 8.2, FR-03', 'notifications never store secret tokens or links', '0 matches', String(notif.filter((n) => /token=|http:\/\/|https:\/\//.test(JSON.stringify(n))).length), !notif.some((n) => /token=|http:\/\/|https:\/\//.test(JSON.stringify(n))));
const tokens = await col('auth_tokens').find({}).toArray();
R.check('DB-27', 'FR-01, FR-03', 'one-time tokens are stored only as 64-character hashes', 'all sha256', `${tokens.length} tokens`, tokens.every((t) => /^[a-f0-9]{64}$/.test(t.tokenHash)));

R.section('Images (GridFS) and cleanup (D-09)');
const files = await col('fs.files').find({}).toArray();
const chunkFiles = new Set((await col('fs.chunks').distinct('files_id')).map(oidStr));
R.check('DB-28', 'D-09', 'every GridFS file has chunks, a known type and an owner', '0 violations', `${files.length} files`, files.every((f) => chunkFiles.has(oidStr(f._id)) && ['image/jpeg', 'image/png'].includes(f.metadata.contentType) && userIds.has(f.metadata.ownerId) && f.length <= 2 * 1024 * 1024));
const fileById = new Map(files.map((f) => [oidStr(f._id), f]));
const refBad = books.filter((b) => (b.imageIds || []).length > 3 || (b.imageIds || []).some((i) => !fileById.has(oidStr(i)) || fileById.get(oidStr(i)).metadata.ownerId !== oidStr(b.sellerId)));
R.check('DB-29', 'D-09', 'every listing has at most 3 images, all existing and owned by the listing seller', '0 violations', String(refBad.length), refBad.length === 0);
const referenced = new Set(books.flatMap((b) => (b.imageIds || []).map(oidStr)));
const unattached = files.filter((f) => !referenced.has(oidStr(f._id)));
R.check('DB-30', 'D-09', 'unattached images: those older than 24 hours would be removed by the hourly cleanup (cleanupOrphans)', 'none older than 24 h', `${unattached.length} unattached (all uploaded in the last hour); older than 24 h: ${unattached.filter((f) => Date.now() - f.uploadDate > 86400000).length}. The deletion itself is covered by the automated test (media.test.js)`, unattached.every((f) => Date.now() - f.uploadDate <= 86400000));

R.section('Indexes, uniqueness and validators (SDD 8.2, 8.4)');
const expectIdx = {
  users: ['email_1'], auth_tokens: ['tokenHash_1', 'expiresAt_1'], categories: ['name_1'], books: ['sellerId_1_isbn_1', 'status_1_searchTrigrams_1', 'status_1_titleLower_1', 'status_1_authorLower_1', 'isbn_1', 'sellerId_1_status_1'],
  carts: ['userId_1'], wishlists: ['userId_1'], orders: ['orderNumber_1', 'items.sellerId_1_placedAt_-1', 'status_1_reservationExpiresAt_1'], payments: ['orderId_1', 'gatewayOrderId_1', 'gatewayPaymentId_1'], reviews: ['bookId_1_userId_1'], seller_applications: ['userId_1'], notifications: ['userId_1_channel_1_readAt_1_createdAt_-1'],
};
const missing = [];
for (const [c, list] of Object.entries(expectIdx)) {
  const have = (await col(c).indexes()).map((i) => i.name);
  for (const n of list) if (!have.includes(n)) missing.push(`${c}.${n}`);
}
R.check('DB-31', 'SDD 8.2', 'the indexes of the data dictionary exist', '0 missing', missing.join(',') || '0 missing', missing.length === 0);
const uniq = async (c, name) => (await col(c).indexes()).find((i) => i.name === name);
R.check('DB-32', 'SDD 8.2', 'unique, sparse, partial and TTL flags', 'users.email unique; payments.gatewayPaymentId unique+sparse; seller_applications.userId unique+partial; auth_tokens.expiresAt TTL 0', JSON.stringify({ e: (await uniq('users', 'email_1')).unique, g: [(await uniq('payments', 'gatewayPaymentId_1')).unique, (await uniq('payments', 'gatewayPaymentId_1')).sparse], p: [(await uniq('seller_applications', 'userId_1')).unique, Boolean((await uniq('seller_applications', 'userId_1')).partialFilterExpression)], t: (await uniq('auth_tokens', 'expiresAt_1')).expireAfterSeconds }), (await uniq('users', 'email_1')).unique && (await uniq('payments', 'gatewayPaymentId_1')).unique && (await uniq('payments', 'gatewayPaymentId_1')).sparse && (await uniq('seller_applications', 'userId_1')).unique && (await uniq('auth_tokens', 'expiresAt_1')).expireAfterSeconds === 0);
const catIdx = await uniq('categories', 'name_1');
R.check('DB-33', 'SDD 8.2', 'category names are unique ignoring case (collation strength 2)', 'strength 2', JSON.stringify(catIdx.collation && { locale: catIdx.collation.locale, strength: catIdx.collation.strength }), catIdx.unique && catIdx.collation.strength === 2);
const idxMissingFromSchemas = [];
for (const m of Object.values(models)) {
  const have = (await col(m.collection.collectionName).indexes()).map((i) => JSON.stringify(i.key));
  for (const [key] of m.schema.indexes()) if (!have.includes(JSON.stringify(key))) idxMissingFromSchemas.push(`${m.collection.collectionName}:${JSON.stringify(key)}`);
}
R.check('DB-34', 'SDD 8.2', 'every index declared in the schemas exists in the database', '0 missing', idxMissingFromSchemas.join(';') || '0 missing', idxMissingFromSchemas.length === 0);
// direct write attempts that must be rejected by the database itself
const reject = async (fn) => { try { await fn(); return 'accepted'; } catch (e) { return `rejected (${e.code || e.name})`; } };
const someBook = books[0];
const victimUser = users[0];
const t1 = await reject(() => col('books').updateOne({ _id: someBook._id }, { $set: { stock: -1 } }));
const t2 = await reject(() => col('books').updateOne({ _id: someBook._id }, { $set: { reserved: someBook.stock + 1 } }));
const t3 = await reject(() => col('books').updateOne({ _id: someBook._id }, { $set: { price: 0 } }));
const t4 = await reject(() => col('users').insertOne({ ...victimUser, _id: new mongoose.Types.ObjectId() }));
const someCat = await col('categories').findOne({});
const t5 = await reject(() => col('categories').insertOne({ name: someCat.name.toUpperCase() }));
const t6 = await reject(() => col('books').insertOne({ ...someBook, _id: new mongoose.Types.ObjectId() }));
const anyPay = await col('payments').findOne({ gatewayPaymentId: { $ne: null } });
const t7 = await reject(() => col('payments').insertOne({ ...anyPay, _id: new mongoose.Types.ObjectId(), orderId: new mongoose.Types.ObjectId(), gatewayOrderId: 'dup-test' }));
// a temporary review is inserted (it is allowed), then a second one for the same user and book must be rejected
const tmpReview = { bookId: someBook._id, userId: victimUser._id, rating: 3, comment: 'integrity check', createdAt: new Date() };
const t8first = await reject(() => col('reviews').insertOne({ ...tmpReview }));
const t8 = await reject(() => col('reviews').insertOne({ ...tmpReview, _id: new mongoose.Types.ObjectId() }));
await col('reviews').deleteMany({ comment: 'integrity check' });
R.check('DB-35', 'SDD 8.3, TC-FR-30', 'the database refuses stock -1, reserved above stock, and price 0', 'all three rejected', `${t1}; ${t2}; ${t3}`, [t1, t2, t3].every((t) => t.startsWith('rejected')));
R.check('DB-36', 'SDD 4.3', 'the database refuses duplicate user email, duplicate category name (any case), duplicate seller ISBN, duplicate gateway payment id, duplicate review', 'all rejected', [t4, t5, t6, t7, t8].join('; ') + ` (temporary first review: ${t8first})`, [t4, t5, t6, t7, t8].every((t) => t.startsWith('rejected')));
const after = await col('books').findOne({ _id: someBook._id });
R.check('DB-37', 'SDD 4.3', 'the rejected writes changed nothing', 'unchanged', `stock ${after.stock}, reserved ${after.reserved}, price ${after.price}`, after.stock === someBook.stock && after.reserved === someBook.reserved && after.price === someBook.price);
const opts = (await db.listCollections({ name: 'books' }).toArray())[0].options;
R.check('DB-38', 'SDD 8.2', 'the books collection has the stock/reserved/price validator', 'validator present', JSON.stringify(opts.validator).slice(0, 80), Boolean(opts.validator && opts.validator.$expr));
// transaction rollback: force a failure inside a multi-document transaction
const s1 = await mongoose.startSession();
let rolled = 'no error';
const beforeReserved = (await col('books').findOne({ _id: someBook._id })).reserved;
try {
  await s1.withTransaction(async () => {
    await col('books').updateOne({ _id: someBook._id }, { $inc: { reserved: 1 } }, { session: s1 });
    throw new Error('forced failure');
  });
} catch (e) { rolled = e.message; }
await s1.endSession();
const afterReserved = (await col('books').findOne({ _id: someBook._id })).reserved;
R.check('DB-39', 'TC-VFR-14, SDD 8.4', 'a forced failure inside a transaction rolls the whole change back', 'reserved unchanged', `error "${rolled}", reserved ${beforeReserved} -> ${afterReserved}`, rolled === 'forced failure' && beforeReserved === afterReserved);
const plan = await models.Book.find({ status: 'approved', searchTrigrams: { $all: ['har', 'arr', 'rry'] } }).explain('queryPlanner');
R.check('DB-40', 'D-10, VFR-02', 'the trigram search query uses the search index (no collection scan)', 'IXSCAN status_1_searchTrigrams_1, no COLLSCAN', /IXSCAN/.test(JSON.stringify(plan.queryPlanner.winningPlan)) ? 'IXSCAN' : 'other', /IXSCAN/.test(JSON.stringify(plan.queryPlanner.winningPlan)) && !/COLLSCAN/.test(JSON.stringify(plan.queryPlanner.winningPlan)) && /status_1_searchTrigrams_1/.test(JSON.stringify(plan.queryPlanner.winningPlan)));
const plan2 = await models.Book.find({ status: 'approved' }).sort({ createdAt: -1, _id: -1 }).limit(20).explain('queryPlanner');
R.check('DB-41', 'VFR-02', 'the default browse (newest first) is answered from an index without an in-memory sort', 'IXSCAN, no SORT stage', /SORT"/.test(JSON.stringify(plan2.queryPlanner.winningPlan)) ? 'has SORT stage' : 'index order', /IXSCAN/.test(JSON.stringify(plan2.queryPlanner.winningPlan)) && !/"stage":"SORT"/.test(JSON.stringify(plan2.queryPlanner.winningPlan)));

const sum = R.save('integrity-results');
await mongoose.disconnect();
process.exit(sum.fail ? 1 : 0);
