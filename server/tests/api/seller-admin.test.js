const { setup, teardown, client, actor, createUser, login, createCategory, createBook, nextIsbn } = require('../helpers/testContext');

let ctx;
let admin;
let category;
beforeAll(async () => {
  ctx = await setup();
  admin = await actor(ctx, { roles: ['admin'] });
  category = await createCategory('Seller admin tests');
});
afterAll(() => teardown(ctx));

describe('seller application and approval (FR-19, FR-25, UC-15, UC-21, D-04)', () => {
  test('a customer applies; the seller role is only active after approval and the customer role is kept', async () => {
    const c = await actor(ctx);
    expect((await c.api.get('/api/seller/applications/me')).status).toBe(404); // none yet
    const apply = await c.api.post('/api/seller/applications', { storeName: 'Dusty Pages', description: 'Used books' });
    expect(apply.status).toBe(201);
    expect(apply.body).toMatchObject({ status: 'pending', storeName: 'Dusty Pages' });
    expect((await c.api.get('/api/seller/applications/me')).body.status).toBe('pending');

    // not a seller yet
    expect((await c.api.get('/api/seller/books')).status).toBe(403);
    expect((await c.api.get('/api/auth/me')).body.roles).toEqual(['customer']);

    const approved = await admin.api.post(`/api/admin/seller-applications/${apply.body.id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('approved');

    // the role takes effect on the very next request, without logging in again
    expect((await c.api.get('/api/auth/me')).body.roles.sort()).toEqual(['customer', 'seller']);
    expect((await c.api.get('/api/seller/books')).status).toBe(200);
    expect((await c.api.get('/api/cart')).status).toBe(200); // still a customer (D-04)
    const user = await ctx.models.User.findById(c.user._id);
    expect(user.sellerProfile.storeName).toBe('Dusty Pages');
  });

  test('one pending application per user; sellers cannot apply again; decisions are final', async () => {
    const c = await actor(ctx);
    const first = await c.api.post('/api/seller/applications', { storeName: 'Store One' });
    const dup = await c.api.post('/api/seller/applications', { storeName: 'Store Two' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('APPLICATION_EXISTS');
    expect((await admin.api.post(`/api/admin/seller-applications/${first.body.id}/approve`)).status).toBe(200);
    const again = await admin.api.post(`/api/admin/seller-applications/${first.body.id}/approve`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('NOT_PENDING');
    expect((await admin.api.post(`/api/admin/seller-applications/${first.body.id}/reject`, { reason: 'late' })).status).toBe(409);
    const already = await c.api.post('/api/seller/applications', { storeName: 'Store Three' });
    expect(already.status).toBe(409);
    expect(already.body.error.code).toBe('ALREADY_SELLER');
  });

  test('rejection needs a reason, keeps the customer role and lets the user apply again', async () => {
    const c = await actor(ctx);
    const app = await c.api.post('/api/seller/applications', { storeName: 'Rejected Store' });
    expect((await admin.api.post(`/api/admin/seller-applications/${app.body.id}/reject`, {})).status).toBe(400);
    const rejected = await admin.api.post(`/api/admin/seller-applications/${app.body.id}/reject`, { reason: 'Incomplete details' });
    expect(rejected.status).toBe(200);
    const mine = await c.api.get('/api/seller/applications/me');
    expect(mine.body).toMatchObject({ status: 'rejected', rejectionReason: 'Incomplete details' });
    expect((await c.api.get('/api/auth/me')).body.roles).toEqual(['customer']);
    expect((await c.api.post('/api/seller/applications', { storeName: 'Second Try' })).status).toBe(201);
  });

  test('administrators list applications by status (default pending)', async () => {
    const c = await actor(ctx);
    await c.api.post('/api/seller/applications', { storeName: 'Listed Store' });
    const res = await admin.api.get('/api/admin/seller-applications');
    expect(res.status).toBe(200);
    expect(res.body.items.every((a) => a.status === 'pending')).toBe(true);
    expect(res.body.items.some((a) => a.storeName === 'Listed Store')).toBe(true);
    expect((await admin.api.get('/api/admin/seller-applications?status=bogus')).status).toBe(400);
  });

  test('application input is validated; unknown ids are 404', async () => {
    const c = await actor(ctx);
    expect((await c.api.post('/api/seller/applications', { storeName: 'x' })).status).toBe(400);
    expect((await c.api.post('/api/seller/applications', { storeName: 'Fine Name', role: 'seller' })).status).toBe(400);
    expect((await admin.api.post(`/api/admin/seller-applications/${'a'.repeat(24)}/approve`)).status).toBe(404);
  });
});

describe('listing approval (FR-25, UC-21)', () => {
  let seller;
  const payload = () => ({ title: 'Approval Book', author: 'A. Author', isbn: nextIsbn(), price: 9900, categoryId: String(category._id), language: 'English', stock: 4 });
  beforeAll(async () => { seller = await actor(ctx, { roles: ['customer', 'seller'] }); });

  test('admin sees pending listings, approves one and it appears in the catalog; rejection needs a reason', async () => {
    const created = (await seller.api.post('/api/seller/books', payload())).body;
    const pending = await admin.api.get('/api/admin/books');
    expect(pending.body.items.some((b) => b.id === created.id)).toBe(true);
    expect((await client(ctx.app).get(`/api/books/${created.id}`)).status).toBe(404);

    expect((await admin.api.post(`/api/admin/books/${created.id}/approve`)).status).toBe(200);
    expect((await client(ctx.app).get(`/api/books/${created.id}`)).status).toBe(200);
    expect((await admin.api.post(`/api/admin/books/${created.id}/approve`)).body.error.code).toBe('NOT_PENDING');

    const other = (await seller.api.post('/api/seller/books', payload())).body;
    expect((await admin.api.post(`/api/admin/books/${other.id}/reject`, {})).status).toBe(400);
    const rejected = await admin.api.post(`/api/admin/books/${other.id}/reject`, { reason: 'Wrong category' });
    expect(rejected.body).toMatchObject({ status: 'rejected', rejectionReason: 'Wrong category' });
    expect((await client(ctx.app).get(`/api/books/${other.id}`)).status).toBe(404);
    const own = await seller.api.get('/api/seller/books?status=rejected');
    expect(own.body.items.find((b) => b.id === other.id).rejectionReason).toBe('Wrong category');
    expect((await admin.api.get('/api/admin/books?status=approved')).body.items.some((b) => b.id === created.id)).toBe(true);
    expect((await admin.api.post(`/api/admin/books/${'c'.repeat(24)}/approve`)).status).toBe(404);
  });
});

describe('inventory and low-stock alerts (FR-21, UC-17)', () => {
  let seller;
  let book;
  beforeAll(async () => {
    seller = await actor(ctx, { roles: ['customer', 'seller'] });
    book = await createBook(ctx, seller.user, category._id, { stock: 10, lowStockThreshold: 3 });
  });

  test('updates stock and threshold and shows available units and stock status', async () => {
    const res = await seller.api.patch(`/api/seller/books/${book._id}/inventory`, { stock: 20, lowStockThreshold: 4 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ stock: 20, reserved: 0, available: 20, stockStatus: 'In stock', lowStockThreshold: 4 });
  });

  test('stock 0 marks the listing Out of stock', async () => {
    const b = await createBook(ctx, seller.user, category._id, { stock: 3 });
    const res = await seller.api.patch(`/api/seller/books/${b._id}/inventory`, { stock: 0 });
    expect(res.body).toMatchObject({ stock: 0, available: 0, stockStatus: 'Out of stock' });
    expect((await client(ctx.app).get(`/api/books/${b._id}`)).body.stockStatus).toBe('Out of stock');
  });

  test('stock cannot go below the units reserved by open checkouts', async () => {
    const b = await createBook(ctx, seller.user, category._id, { stock: 10, reserved: 4 });
    const bad = await seller.api.patch(`/api/seller/books/${b._id}/inventory`, { stock: 3 });
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe('STOCK_BELOW_RESERVED');
    expect((await seller.api.patch(`/api/seller/books/${b._id}/inventory`, { stock: 4 })).status).toBe(200);
  });

  test('validation: at least one field, integers in range', async () => {
    for (const body of [{}, { stock: -1 }, { stock: 1.5 }, { stock: 100001 }, { lowStockThreshold: -1 }, { price: 5 }]) {
      expect((await seller.api.patch(`/api/seller/books/${book._id}/inventory`, body)).status).toBe(400);
    }
  });

  test('an in-app alert is created once when stock falls to the threshold, can be listed and marked read', async () => {
    const fresh = await actor(ctx, { roles: ['customer', 'seller'] });
    const b = await createBook(ctx, fresh.user, category._id, { stock: 10, lowStockThreshold: 5, title: 'Alert Book' });
    await fresh.api.patch(`/api/seller/books/${b._id}/inventory`, { stock: 4 });
    await fresh.api.patch(`/api/seller/books/${b._id}/inventory`, { stock: 3 }); // still low: no second alert
    const list = await fresh.api.get('/api/notifications');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ type: 'low_stock', readAt: null });
    expect(list.body.items[0].subject).toMatch(/Alert Book/);

    const read = await fresh.api.patch(`/api/notifications/${list.body.items[0].id}/read`);
    expect(read.status).toBe(200);
    expect(read.body.readAt).toBeTruthy();
    expect((await fresh.api.get('/api/notifications?unread=true')).body.items).toHaveLength(0);
    await fresh.api.patch(`/api/seller/books/${b._id}/inventory`, { stock: 2 }); // new crossing after the alert was read
    expect((await fresh.api.get('/api/notifications?unread=true')).body.items).toHaveLength(1);
  });

  test("alerts are private to the seller (404 for someone else's notification)", async () => {
    const a = await actor(ctx, { roles: ['customer', 'seller'] });
    const b = await actor(ctx, { roles: ['customer', 'seller'] });
    const bk = await createBook(ctx, a.user, category._id, { stock: 10, lowStockThreshold: 20 });
    await a.api.patch(`/api/seller/books/${bk._id}/inventory`, { stock: 5 });
    const alert = (await a.api.get('/api/notifications')).body.items[0];
    expect((await b.api.patch(`/api/notifications/${alert.id}/read`)).status).toBe(404);
    expect((await b.api.get('/api/notifications')).body.items).toHaveLength(0);
  });

  test('a sale that brings available units to the threshold alerts the seller', async () => {
    const s = await actor(ctx, { roles: ['customer', 'seller'] });
    const b = await createBook(ctx, s.user, category._id, { stock: 6, lowStockThreshold: 4 });
    const buyer = await actor(ctx);
    await buyer.api.post('/api/cart/items', { bookId: String(b._id), quantity: 3 });
    const created = await buyer.api.post('/api/orders', { shippingAddress: { fullName: 'A B', line1: '1 St', city: 'C', state: 'S', postalCode: '123456', country: 'India', phone: '9999999999' } });
    await buyer.api.post(`/api/orders/${created.body.order.id}/payment/confirm`, created.body.payment.clientConfig.successPayment);
    const alerts = (await s.api.get('/api/notifications')).body.items;
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('low_stock');
  });
});

describe('seller orders and fulfilment (FR-22, FR-15, UC-18, D-07)', () => {
  let s1;
  let s2;
  let buyer;
  let b1;
  let b2;
  let orderId;
  const address = { fullName: 'Ravi Kumar', line1: '5 Park Street', city: 'Kolkata', state: 'WB', postalCode: '700016', country: 'India', phone: '9123456780' };

  beforeAll(async () => {
    s1 = await actor(ctx, { roles: ['customer', 'seller'] });
    s2 = await actor(ctx, { roles: ['customer', 'seller'] });
    buyer = await actor(ctx);
    b1 = await createBook(ctx, s1.user, category._id, { title: 'Seller One Book', price: 10000 });
    b2 = await createBook(ctx, s2.user, category._id, { title: 'Seller Two Book', price: 20000 });
    await buyer.api.post('/api/cart/items', { bookId: String(b1._id), quantity: 1 });
    await buyer.api.post('/api/cart/items', { bookId: String(b2._id), quantity: 2 });
    const created = await buyer.api.post('/api/orders', { shippingAddress: address });
    orderId = created.body.order.id;
    await buyer.api.post(`/api/orders/${orderId}/payment/confirm`, created.body.payment.clientConfig.successPayment);
  });

  test('each seller sees only their own items, plus the shipping name and address', async () => {
    const r1 = await s1.api.get('/api/seller/orders');
    expect(r1.status).toBe(200);
    expect(r1.body.items).toHaveLength(1);
    expect(r1.body.items[0].items.map((i) => i.title)).toEqual(['Seller One Book']);
    expect(r1.body.items[0].shippingAddress).toMatchObject({ fullName: 'Ravi Kumar', city: 'Kolkata' });
    expect(JSON.stringify(r1.body)).not.toContain('Seller Two Book');
    const r2 = await s2.api.get('/api/seller/orders');
    expect(r2.body.items[0].items.map((i) => i.title)).toEqual(['Seller Two Book']);
    // nothing about the buyer's account is exposed
    expect(JSON.stringify(r1.body)).not.toContain(buyer.user.email);
  });

  test('the order summary is worked out from the seller own items only, nothing of another seller leaks (OpenAPI Order.summary)', async () => {
    const hasNumber = (body, numbers) => numbers.filter((n) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(JSON.stringify(body)));
    // order: seller one 1 x 100.00, seller two 2 x 200.00; order totals: subtotal 50000, tax 2500, shipping 4900, total 57400
    const r1 = await s1.api.get('/api/seller/orders');
    const r2 = await s2.api.get('/api/seller/orders');
    const o1 = r1.body.items.find((o) => o.id === orderId);
    const o2 = r2.body.items.find((o) => o.id === orderId);
    expect(o1.summary).toEqual({ subtotal: 10000, tax: 500, shippingFee: 0, total: 10500 });
    expect(o2.summary).toEqual({ subtotal: 40000, tax: 2000, shippingFee: 0, total: 42000 });
    for (const v of Object.values(o1.summary)) expect(Number.isInteger(v)).toBe(true);
    // seller one never sees seller two amounts, the order total, the order subtotal or the shipping fee
    expect(hasNumber(r1.body, [20000, 40000, 42000, 50000, 2500, 4900, 57400])).toEqual([]);
    expect(hasNumber(r2.body, [10000, 10500, 50000, 2500, 4900, 57400])).toEqual([]);
    // the customer still sees the full order summary
    const full = (await buyer.api.get(`/api/orders/${orderId}`)).body;
    expect(full.summary).toEqual({ subtotal: 50000, tax: 2500, shippingFee: 4900, total: 57400 });
    // the seller summary adds up
    expect(o1.summary.total).toBe(o1.summary.subtotal + o1.summary.tax + o1.summary.shippingFee);
  });

  test('status moves one step at a time; the order status is the lowest item status', async () => {
    const order = await ctx.models.Order.findById(orderId);
    const item1 = order.items.find((i) => String(i.sellerId) === String(s1.user._id))._id;
    const item2 = order.items.find((i) => String(i.sellerId) === String(s2.user._id))._id;
    const move = (api, item, status) => api.patch(`/api/seller/orders/${orderId}/items/${item}/status`, { status });

    expect((await move(s1.api, item1, 'Shipped')).body.error.code).toBe('INVALID_STATUS_TRANSITION'); // skipping a step
    expect((await move(s1.api, item1, 'Packed')).status).toBe(200);
    const customerView = async () => (await buyer.api.get(`/api/orders/${orderId}`)).body;
    expect((await customerView()).status).toBe('Placed'); // seller two has not packed yet
    expect((await move(s2.api, item2, 'Packed')).status).toBe(200);
    expect((await customerView()).status).toBe('Packed');
    await move(s1.api, item1, 'Shipped');
    await move(s1.api, item1, 'Delivered');
    expect((await customerView()).status).toBe('Packed'); // lowest active item status
    await move(s2.api, item2, 'Shipped');
    await move(s2.api, item2, 'Delivered');
    const final = await customerView();
    expect(final.status).toBe('Delivered');
    expect(final.items.map((i) => i.fulfilmentStatus)).toEqual(['Delivered', 'Delivered']);
    expect((await move(s1.api, item1, 'Packed')).body.error.code).toBe('INVALID_STATUS_TRANSITION'); // no going back
  });

  test("a seller cannot change another seller's item (404) or an unknown item", async () => {
    const order = await ctx.models.Order.findById(orderId);
    const item1 = order.items.find((i) => String(i.sellerId) === String(s1.user._id))._id;
    const res = await s2.api.patch(`/api/seller/orders/${orderId}/items/${item1}/status`, { status: 'Packed' });
    expect(res.status).toBe(404);
    expect((await s1.api.patch(`/api/seller/orders/${orderId}/items/${'d'.repeat(24)}/status`, { status: 'Packed' })).status).toBe(404);
    expect((await s1.api.patch(`/api/seller/orders/${'d'.repeat(24)}/items/${item1}/status`, { status: 'Packed' })).status).toBe(404);
    expect((await s1.api.patch(`/api/seller/orders/${orderId}/items/${item1}/status`, { status: 'Placed' })).status).toBe(400);
    expect((await buyer.api.patch(`/api/seller/orders/${orderId}/items/${item1}/status`, { status: 'Packed' })).status).toBe(403);
  });

  test('status filter and unpaid orders: sellers never see unpaid checkouts', async () => {
    const unpaidBook = await createBook(ctx, s1.user, category._id, { title: 'Unpaid Item' });
    const b = await actor(ctx);
    await b.api.post('/api/cart/items', { bookId: String(unpaidBook._id), quantity: 1 });
    await b.api.post('/api/orders', { shippingAddress: address });
    const all = await s1.api.get('/api/seller/orders');
    expect(JSON.stringify(all.body)).not.toContain('Unpaid Item');
    const delivered = await s1.api.get('/api/seller/orders?status=Delivered');
    expect(delivered.body.items).toHaveLength(1);
    const packed = await s1.api.get('/api/seller/orders?status=Packed');
    expect(packed.body.items).toHaveLength(0);
    expect((await s1.api.get('/api/seller/orders?status=bogus')).status).toBe(400);
  });

  test('the status update response has the same seller-scoped summary and shows no other seller data', async () => {
    // its own order, so the other tests of this group keep their data
    const buyer2 = await actor(ctx);
    await buyer2.api.post('/api/cart/items', { bookId: String(b1._id), quantity: 1 });
    await buyer2.api.post('/api/cart/items', { bookId: String(b2._id), quantity: 2 });
    const created = await buyer2.api.post('/api/orders', { shippingAddress: address });
    const oid = created.body.order.id;
    await buyer2.api.post(`/api/orders/${oid}/payment/confirm`, created.body.payment.clientConfig.successPayment);
    const items = (await ctx.models.Order.findById(oid)).items;
    const itemTwo = items.find((i) => String(i.sellerId) === String(s2.user._id))._id;
    const itemOne = items.find((i) => String(i.sellerId) === String(s1.user._id))._id;

    const res = await s2.api.patch(`/api/seller/orders/${oid}/items/${itemTwo}/status`, { status: 'Packed' });
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ subtotal: 40000, tax: 2000, shippingFee: 0, total: 42000 });
    expect(res.body.items.map((i) => i.title)).toEqual(['Seller Two Book']);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('Seller One Book');
    for (const n of [10000, 10500, 50000, 2500, 4900, 57400]) expect(new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(text)).toBe(false);
    // not their item: still 404 with no order data
    const denied = await s2.api.patch(`/api/seller/orders/${oid}/items/${itemOne}/status`, { status: 'Packed' });
    expect(denied.status).toBe(404);
    expect(denied.body.summary).toBeUndefined();
    expect(denied.body.items).toBeUndefined();
  });
});

describe('user administration (FR-24, UC-20)', () => {
  test('suspend ends the session at once; reactivate lets the user log in again', async () => {
    const c = await actor(ctx);
    expect((await c.api.get('/api/auth/me')).status).toBe(200);
    const res = await admin.api.patch(`/api/admin/users/${c.user._id}/status`, { status: 'suspended' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('suspended');
    expect((await c.api.get('/api/auth/me')).status).toBe(401); // token version was increased: the old session is dead
    const loginTry = await client(ctx.app).post('/api/auth/login', { email: c.user.email, password: ctx.PASSWORD });
    expect(loginTry.body.error.code).toBe('ACCOUNT_SUSPENDED');
    const back = await admin.api.patch(`/api/admin/users/${c.user._id}/status`, { status: 'active' });
    expect(back.body.status).toBe('active');
    expect((await login(ctx, c.user)).get).toBeTruthy();
  });

  test('administrators cannot suspend themselves; unknown users are 404; bad status is 400', async () => {
    const self = await admin.api.patch(`/api/admin/users/${admin.user._id}/status`, { status: 'suspended' });
    expect(self.status).toBe(409);
    expect(self.body.error.code).toBe('CANNOT_MODIFY_SELF');
    expect((await admin.api.patch(`/api/admin/users/${'e'.repeat(24)}/status`, { status: 'suspended' })).status).toBe(404);
    expect((await admin.api.patch(`/api/admin/users/${admin.user._id}/status`, { status: 'pending_verification' })).status).toBe(400);
  });

  test('reactivating a never-verified account does not skip email verification', async () => {
    const u = await createUser(ctx, { status: 'pending_verification' });
    await admin.api.patch(`/api/admin/users/${u._id}/status`, { status: 'suspended' });
    const res = await admin.api.patch(`/api/admin/users/${u._id}/status`, { status: 'active' });
    expect(res.body.status).toBe('pending_verification');
  });

  test('lists users with filters and never returns password data', async () => {
    await createUser(ctx, { name: 'Findable Person', email: 'findable.person@example.com' });
    const res = await admin.api.get('/api/admin/users?q=findable');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ name: 'Findable Person', roles: ['customer'], status: 'active' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenVersion|\$2[aby]\$/);
    const admins = await admin.api.get('/api/admin/users?role=admin');
    expect(admins.body.items.every((u) => u.roles.includes('admin'))).toBe(true);
    expect((await admin.api.get('/api/admin/users?role=root')).status).toBe(400);
    expect((await admin.api.get('/api/admin/users?status=gone')).status).toBe(400);
  });
});

describe('category management (FR-26, UC-23)', () => {
  test('add, rename, duplicate names ignoring case, delete', async () => {
    const created = await admin.api.post('/api/admin/categories', { name: 'Poetry' });
    expect(created.status).toBe(201);
    const dup = await admin.api.post('/api/admin/categories', { name: 'poetry' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CATEGORY_EXISTS');
    const renamed = await admin.api.patch(`/api/admin/categories/${created.body.id}`, { name: 'Modern Poetry' });
    expect(renamed.body.name).toBe('Modern Poetry');
    const clash = await admin.api.patch(`/api/admin/categories/${created.body.id}`, { name: category.name.toUpperCase() });
    expect(clash.status).toBe(409);
    expect((await admin.api.delete(`/api/admin/categories/${created.body.id}`)).status).toBe(204);
    expect((await admin.api.delete(`/api/admin/categories/${created.body.id}`)).status).toBe(404);
    expect((await admin.api.post('/api/admin/categories', { name: '' })).status).toBe(400);
    expect((await admin.api.post('/api/admin/categories', { name: 'x'.repeat(61) })).status).toBe(400);
  });

  test('a category used by books cannot be deleted', async () => {
    const used = await admin.api.post('/api/admin/categories', { name: 'In Use' });
    const s = await createUser(ctx, { roles: ['customer', 'seller'] });
    await createBook(ctx, s, used.body.id);
    const res = await admin.api.delete(`/api/admin/categories/${used.body.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CATEGORY_IN_USE');
  });
});

describe('reports (FR-23, FR-28, UC-19, UC-24)', () => {
  let s;
  let buyer;
  const today = new Date().toISOString().slice(0, 10);
  const address = { fullName: 'R P', line1: '9 Lane', city: 'Pune', state: 'MH', postalCode: '411001', country: 'India', phone: '9000000000' };

  beforeAll(async () => {
    s = await actor(ctx, { roles: ['customer', 'seller'] });
    const other = await createUser(ctx, { roles: ['customer', 'seller'] });
    buyer = await actor(ctx);
    const mine = await createBook(ctx, s.user, category._id, { title: 'Report Mine', price: 10000, stock: 50 });
    const theirs = await createBook(ctx, other, category._id, { title: 'Report Theirs', price: 5000, stock: 50 });
    const buy = async (items) => {
      for (const [b, q] of items) await buyer.api.post('/api/cart/items', { bookId: String(b._id), quantity: q });
      const c = await buyer.api.post('/api/orders', { shippingAddress: address });
      await buyer.api.post(`/api/orders/${c.body.order.id}/payment/confirm`, c.body.payment.clientConfig.successPayment);
      return c.body.order.id;
    };
    await buy([[mine, 2], [theirs, 1]]);
    const second = await buy([[mine, 1]]);
    await buyer.api.post(`/api/orders/${second}/cancel`); // cancelled orders are not revenue
  });

  test('seller sales report counts only the seller own, non-cancelled items', async () => {
    const res = await s.api.get(`/api/seller/reports/sales?from=${today}&to=${today}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ from: today, to: today, orderCount: 1, unitsSold: 2, revenue: 20000 });
    expect(res.body.byBook).toEqual([{ bookId: expect.any(String), title: 'Report Mine', units: 2, revenue: 20000 }]);
  });

  test('an empty range reports zeros', async () => {
    const res = await s.api.get('/api/seller/reports/sales?from=2020-01-01&to=2020-01-31');
    expect(res.body).toMatchObject({ orderCount: 0, unitsSold: 0, revenue: 0, byBook: [] });
  });

  test('platform report: orders, revenue and the best sellers', async () => {
    const res = await admin.api.get(`/api/admin/reports/platform?from=${today}&to=${today}`);
    expect(res.status).toBe(200);
    expect(res.body.orderCount).toBeGreaterThanOrEqual(1);
    expect(res.body.revenue).toBeGreaterThan(0);
    expect(res.body.topBooks.length).toBeLessThanOrEqual(10);
    expect(res.body.topBooks[0].units).toBeGreaterThanOrEqual(res.body.topBooks[res.body.topBooks.length - 1].units);
    expect(res.body.topBooks.find((b) => b.title === 'Report Mine').units).toBe(2);
  });

  test('platform top list is limited to 10 books', async () => {
    const owner = await createUser(ctx, { roles: ['customer', 'seller'] });
    const b = await actor(ctx);
    for (let i = 0; i < 12; i += 1) {
      const book = await createBook(ctx, owner, category._id, { title: `Top ${i}`, price: 100 + i, stock: 5 });
      await b.api.post('/api/cart/items', { bookId: String(book._id), quantity: 1 });
    }
    const c = await b.api.post('/api/orders', { shippingAddress: address });
    await b.api.post(`/api/orders/${c.body.order.id}/payment/confirm`, c.body.payment.clientConfig.successPayment);
    const res = await admin.api.get(`/api/admin/reports/platform?from=${today}&to=${today}`);
    expect(res.body.topBooks).toHaveLength(10);
  });

  test('invalid ranges: from after to, impossible dates, more than 366 days, bad format', async () => {
    for (const q of ['from=2026-02-10&to=2026-02-01', 'from=2026-02-30&to=2026-03-01', 'from=2024-01-01&to=2025-01-02']) {
      const sellerRes = await s.api.get(`/api/seller/reports/sales?${q}`);
      expect(sellerRes.status).toBe(400);
      expect(sellerRes.body.error.code).toBe('INVALID_DATE_RANGE');
      expect((await admin.api.get(`/api/admin/reports/platform?${q}`)).body.error.code).toBe('INVALID_DATE_RANGE');
    }
    expect((await s.api.get('/api/seller/reports/sales?from=2025-01-01&to=2025-12-31')).status).toBe(200); // 365 days is fine
    expect((await s.api.get('/api/seller/reports/sales?from=yesterday&to=today')).body.error.code).toBe('VALIDATION_ERROR');
    expect((await s.api.get('/api/seller/reports/sales')).status).toBe(400);
  });
});
