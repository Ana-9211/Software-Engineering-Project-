// Phase 4 contract validation: runs the real application (in-memory MongoDB replica set, fake gateway and mailer) through a
// scenario and checks EVERY response against the response schema of docs/sprint-2/openapi.yaml.
// Run: node validation/openapi-contract.cjs   (writes docs/phase-4/evidence/openapi-contract-results.json)
const path = require('path');
const R = path.resolve(__dirname, '..');
const req = (p) => require(path.join(R, p));
process.env.NODE_ENV = 'test';
process.env.BCRYPT_COST = '10';
process.env.LOG_LEVEL = 'silent';
process.env.MAIL_PROVIDER = 'memory';

(async () => {
  const { MongoMemoryReplSet } = req('node_modules/mongodb-memory-server');
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_TEST_URI = rs.getUri();
  const Ajv = req('node_modules/@seriousme/openapi-schema-validator/node_modules/ajv');
  const addFormats = req('node_modules/ajv-formats');
  const yaml = req('node_modules/js-yaml');
  const fs = require('fs');
  const spec = yaml.load(fs.readFileSync(path.join(R, 'docs/sprint-2/openapi.yaml'), 'utf8'));
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema(JSON.parse(JSON.stringify({ $id: 'spec', components: spec.components }).replace(/#\/components/g, 'spec#/components')));

  const T = req('server/tests/helpers/testContext.js');
  const ctx = await T.setup();
  const seen = new Map();
  const problems = [];

  function check(method, template, res) {
    const op = spec.paths[template] && spec.paths[template][method];
    if (!op) { problems.push(`no such operation ${method} ${template}`); return; }
    const def = op.responses[String(res.status)] || op.responses.default;
    const key = `${method.toUpperCase()} ${template} -> ${res.status}`;
    seen.set(key, true);
    if (!def) { problems.push(`${key}: status not documented`); return; }
    const media = def.content && def.content['application/json'];
    if (!media) return;
    const schema = JSON.parse(JSON.stringify(media.schema).replace(/#\/components/g, 'spec#/components'));
    const validate = ajv.compile(schema);
    if (!validate(res.body)) problems.push(`${key}: ${ajv.errorsText(validate.errors, { dataVar: 'body' }).slice(0, 300)}`);
  }
  const call = async (api, method, template, url, body) => {
    const res = method === 'get' || method === 'delete' ? await api[method](url) : await api[method](url, body);
    check(method, template, res);
    return res;
  };

  const addr = { fullName: 'A B', line1: '1 St', city: 'C', state: 'S', postalCode: '123456', country: 'India', phone: '9999999999' };
  const guest = T.client(ctx.app);
  const admin = await T.actor(ctx, { roles: ['admin'] });
  const seller = await T.actor(ctx, { roles: ['customer', 'seller'] });
  const cust = await T.actor(ctx);
  const cat = await T.createCategory('Contract');

  // auth
  check('get', '/api/auth/csrf-token', await guest.get('/api/auth/csrf-token'));
  const email = T.uniqueEmail('c');
  await call(guest, 'post', '/api/auth/register', '/api/auth/register', { name: 'C', email, password: T.PASSWORD });
  await call(guest, 'post', '/api/auth/register', '/api/auth/register', { name: 'C', email, password: T.PASSWORD });
  await call(guest, 'post', '/api/auth/register', '/api/auth/register', { name: '', email: 'x', password: '1' });
  await call(guest, 'post', '/api/auth/resend-verification', '/api/auth/resend-verification', { email });
  await call(guest, 'post', '/api/auth/verify-email', '/api/auth/verify-email', { token: 'a'.repeat(64) });
  await call(guest, 'post', '/api/auth/login', '/api/auth/login', { email, password: T.PASSWORD });
  await call(guest, 'post', '/api/auth/forgot-password', '/api/auth/forgot-password', { email });
  await call(guest, 'post', '/api/auth/reset-password', '/api/auth/reset-password', { token: 'a'.repeat(64), newPassword: 'NewPassword1!' });
  const lg = T.client(ctx.app);
  await call(lg, 'post', '/api/auth/login', '/api/auth/login', { email: cust.user.email, password: T.PASSWORD });
  await call(cust.api, 'get', '/api/auth/me', '/api/auth/me');
  await call(guest, 'post', '/api/auth/login', '/api/auth/login', { email: cust.user.email, password: 'wrongwrong' });
  // profile
  await call(cust.api, 'get', '/api/profile', '/api/profile');
  await call(cust.api, 'patch', '/api/profile', '/api/profile', { name: 'New', phone: '9876543210' });
  const a1 = await call(cust.api, 'post', '/api/profile/addresses', '/api/profile/addresses', { ...addr, label: 'Home' });
  await call(cust.api, 'patch', '/api/profile/addresses/{addressId}', `/api/profile/addresses/${a1.body.id}`, { city: 'X' });
  await call(cust.api, 'get', '/api/profile', '/api/profile');
  // catalog + seller listing + admin approve
  const created = await call(seller.api, 'post', '/api/seller/books', '/api/seller/books', { title: 'Contract Book', author: 'Au', isbn: T.nextIsbn(), price: 10000, categoryId: String(cat._id), language: 'English', stock: 10 });
  await call(seller.api, 'get', '/api/seller/books', '/api/seller/books');
  await call(seller.api, 'patch', '/api/seller/books/{bookId}', `/api/seller/books/${created.body.id}`, { price: 12000 });
  await call(admin.api, 'get', '/api/admin/books', '/api/admin/books');
  await call(admin.api, 'post', '/api/admin/books/{bookId}/approve', `/api/admin/books/${created.body.id}/approve`);
  await call(admin.api, 'post', '/api/admin/books/{bookId}/approve', `/api/admin/books/${created.body.id}/approve`);
  const bid = created.body.id;
  await call(guest, 'get', '/api/books', '/api/books?q=contract');
  await call(guest, 'get', '/api/books/{bookId}', `/api/books/${bid}`);
  await call(guest, 'get', '/api/books/{bookId}', `/api/books/${'a'.repeat(24)}`);
  await call(guest, 'get', '/api/categories', '/api/categories');
  await call(guest, 'get', '/api/books/{bookId}/reviews', `/api/books/${bid}/reviews`);
  await call(seller.api, 'patch', '/api/seller/books/{bookId}/inventory', `/api/seller/books/${bid}/inventory`, { stock: 9, lowStockThreshold: 20 });
  // cart, wishlist
  await call(cust.api, 'post', '/api/cart/items', '/api/cart/items', { bookId: bid, quantity: 2 });
  await call(cust.api, 'patch', '/api/cart/items/{bookId}', `/api/cart/items/${bid}`, { quantity: 3 });
  await call(cust.api, 'get', '/api/cart', '/api/cart');
  await call(cust.api, 'post', '/api/cart/items', '/api/cart/items', { bookId: bid, quantity: 50 });
  await call(cust.api, 'put', '/api/wishlist/items/{bookId}', `/api/wishlist/items/${bid}`);
  await call(cust.api, 'get', '/api/wishlist', '/api/wishlist');
  await call(cust.api, 'delete', '/api/wishlist/items/{bookId}', `/api/wishlist/items/${bid}`);
  // orders
  const co = await call(cust.api, 'post', '/api/orders', '/api/orders', { addressId: a1.body.id });
  const oid = co.body.order.id;
  await call(cust.api, 'get', '/api/orders/{orderId}', `/api/orders/${oid}`);
  await call(cust.api, 'post', '/api/orders/{orderId}/payment/confirm', `/api/orders/${oid}/payment/confirm`, co.body.payment.clientConfig.failurePayment);
  const paid = await call(cust.api, 'post', '/api/orders/{orderId}/payment/confirm', `/api/orders/${oid}/payment/confirm`, co.body.payment.clientConfig.successPayment);
  await call(cust.api, 'get', '/api/orders', '/api/orders');
  // seller fulfilment
  await call(seller.api, 'get', '/api/seller/orders', '/api/seller/orders');
  const itemId = paid.body.items[0].id;
  for (const s of ['Packed', 'Shipped', 'Delivered']) await call(seller.api, 'patch', '/api/seller/orders/{orderId}/items/{itemId}/status', `/api/seller/orders/${oid}/items/${itemId}/status`, { status: s });
  await call(seller.api, 'patch', '/api/seller/orders/{orderId}/items/{itemId}/status', `/api/seller/orders/${oid}/items/${itemId}/status`, { status: 'Packed' });
  // review
  await call(cust.api, 'post', '/api/books/{bookId}/reviews', `/api/books/${bid}/reviews`, { rating: 5, comment: 'ok' });
  await call(cust.api, 'post', '/api/books/{bookId}/reviews', `/api/books/${bid}/reviews`, { rating: 5 });
  await call(guest, 'get', '/api/books/{bookId}/reviews', `/api/books/${bid}/reviews`);
  const rv = await call(admin.api, 'get', '/api/admin/reviews', '/api/admin/reviews');
  await call(admin.api, 'delete', '/api/admin/reviews/{reviewId}', `/api/admin/reviews/${rv.body.items[0].id}`);
  // cancel path
  await cust.api.post('/api/cart/items', { bookId: bid, quantity: 1 });
  const c2 = await cust.api.post('/api/orders', { addressId: a1.body.id });
  await call(cust.api, 'post', '/api/orders/{orderId}/cancel', `/api/orders/${c2.body.order.id}/cancel`);
  await call(cust.api, 'post', '/api/orders/{orderId}/cancel', `/api/orders/${c2.body.order.id}/cancel`);
  // seller application + admin
  await call(cust.api, 'get', '/api/seller/applications/me', '/api/seller/applications/me');
  const ap = await call(cust.api, 'post', '/api/seller/applications', '/api/seller/applications', { storeName: 'Store' });
  await call(cust.api, 'get', '/api/seller/applications/me', '/api/seller/applications/me');
  await call(admin.api, 'get', '/api/admin/seller-applications', '/api/admin/seller-applications');
  await call(admin.api, 'post', '/api/admin/seller-applications/{applicationId}/approve', `/api/admin/seller-applications/${ap.body.id}/approve`);
  await call(admin.api, 'get', '/api/admin/users', '/api/admin/users');
  const victim = await T.createUser(ctx);
  await call(admin.api, 'patch', '/api/admin/users/{userId}/status', `/api/admin/users/${victim._id}/status`, { status: 'suspended' });
  const nc = await call(admin.api, 'post', '/api/admin/categories', '/api/admin/categories', { name: 'Newcat' });
  await call(admin.api, 'patch', '/api/admin/categories/{categoryId}', `/api/admin/categories/${nc.body.id}`, { name: 'Renamed' });
  await call(admin.api, 'delete', '/api/admin/categories/{categoryId}', `/api/admin/categories/${nc.body.id}`);
  const today = new Date().toISOString().slice(0, 10);
  await call(seller.api, 'get', '/api/seller/reports/sales', `/api/seller/reports/sales?from=${today}&to=${today}`);
  await call(admin.api, 'get', '/api/admin/reports/platform', `/api/admin/reports/platform?from=${today}&to=${today}`);
  await call(seller.api, 'get', '/api/notifications', '/api/notifications');
  const nl = await seller.api.get('/api/notifications');
  if (nl.body.items && nl.body.items[0]) await call(seller.api, 'patch', '/api/notifications/{notificationId}/read', `/api/notifications/${nl.body.items[0].id}/read`);
  await call(guest, 'get', '/api/health', '/api/health');
  await call(seller.api, 'delete', '/api/seller/books/{bookId}', `/api/seller/books/${bid}`);
  await call(cust.api, 'post', '/api/auth/logout', '/api/auth/logout');

  // the remaining operations
  const a2 = await call(cust.api, 'post', '/api/profile/addresses', '/api/profile/addresses', { ...addr, label: 'Second' });
  await call(cust.api, 'delete', '/api/profile/addresses/{addressId}', `/api/profile/addresses/${a2.body.id}`);
  const book2 = await call(seller.api, 'post', '/api/seller/books', '/api/seller/books', { title: 'Reject Me', author: 'Au', isbn: T.nextIsbn(), price: 5000, categoryId: String(cat._id), language: 'English', stock: 3 });
  await call(admin.api, 'post', '/api/admin/books/{bookId}/reject', `/api/admin/books/${book2.body.id}/reject`, { reason: 'Not suitable' });
  await call(admin.api, 'post', '/api/admin/books/{bookId}/reject', `/api/admin/books/${book2.body.id}/reject`, { reason: 'again' });
  const applicant = await T.actor(ctx);
  const ap2 = await call(applicant.api, 'post', '/api/seller/applications', '/api/seller/applications', { storeName: 'Reject Store' });
  await call(admin.api, 'post', '/api/admin/seller-applications/{applicationId}/reject', `/api/admin/seller-applications/${ap2.body.id}/reject`, { reason: 'No' });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  const csrf = await seller.api.token();
  const up = await seller.api.agent.post('/api/seller/uploads/images').set('X-CSRF-Token', csrf).attach('file', png, { filename: 'a.png', contentType: 'image/png' });
  check('post', '/api/seller/uploads/images', up);
  const bad = await seller.api.agent.post('/api/seller/uploads/images').set('X-CSRF-Token', csrf).attach('file', Buffer.from('text'), { filename: 'a.png', contentType: 'image/png' });
  check('post', '/api/seller/uploads/images', bad);
  const img = await guest.get(up.body.url.replace('/api/images/', '/api/images/'));
  const imgTemplate = '/api/images/{imageId}';
  seen.set(`GET ${imgTemplate} -> ${img.status}`, true);
  if (img.status !== 200) problems.push(`GET image ${img.status}`);
  const img404 = await guest.get(`/api/images/${'b'.repeat(24)}`);
  check('get', imgTemplate, img404);
  await cust.api.post('/api/cart/items', { bookId: bid, quantity: 1 }).catch(() => {});
  const bk = (await T.createBook(ctx, seller.user, cat._id, { title: 'Cart Delete', stock: 5 }));
  await cust.api.post('/api/cart/items', { bookId: String(bk._id), quantity: 1 });
  await call(cust.api, 'delete', '/api/cart/items/{bookId}', `/api/cart/items/${bk._id}`);
  const raw = JSON.stringify({ event: 'payment.failed', gatewayOrderId: 'unknown' });
  const wh = await guest.agent.post('/api/payments/webhook').set('Content-Type', 'application/json').set('X-Gateway-Signature', ctx.gateway.signWebhook(raw)).send(raw);
  check('post', '/api/payments/webhook', wh);
  const wh2 = await guest.agent.post('/api/payments/webhook').set('Content-Type', 'application/json').set('X-Gateway-Signature', 'bad').send(raw);
  check('post', '/api/payments/webhook', wh2);

  console.log('responses checked:', seen.size, 'distinct (operation, status) pairs');
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'ALL RESPONSES MATCH THE OPENAPI SCHEMAS');
  const covered = new Set([...seen.keys()].map((k) => k.split(' -> ')[0]));
  console.log('operations exercised:', covered.size, 'of 61');
  const all = [];
  for (const [p, item] of Object.entries(spec.paths)) for (const m of ['get', 'post', 'put', 'patch', 'delete']) if (item[m]) all.push(`${m.toUpperCase()} ${p}`);
  const missing = all.filter((o) => !covered.has(o));
  console.log('not exercised:', missing.join(' | ') || 'none');
  require('fs').writeFileSync(path.join(R, 'docs/phase-4/evidence/openapi-contract-results.json'), JSON.stringify({ responsesChecked: seen.size, operationsExercised: covered.size, operationsTotal: all.length, notExercised: missing, mismatches: problems, pairs: [...seen.keys()].sort() }, null, 1));
  await T.teardown(ctx);
  await rs.stop();
})().catch((e) => { console.error(e); process.exit(1); });
