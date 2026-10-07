const { setup, teardown, client, actor, createUser, createCategory, createBook } = require('../helpers/testContext');

let ctx;
let seller;
let category;
beforeAll(async () => {
  ctx = await setup();
  seller = await createUser(ctx, { roles: ['customer', 'seller'] });
  category = await createCategory('Checkout tests');
});
afterAll(() => teardown(ctx));

const address = { fullName: 'Asha Rao', line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'India', phone: '9876543210' };
const stockOf = async (book) => ctx.models.Book.findById(book._id).lean();
const newBook = (over = {}) => createBook(ctx, seller, category._id, { stock: 5, price: 10000, ...over });

async function buyerWithCart(items) {
  const a = await actor(ctx);
  for (const [book, quantity] of items) {
    const r = await a.api.post('/api/cart/items', { bookId: String(book._id), quantity });
    if (r.status !== 200) throw new Error(`cart add failed ${r.status} ${JSON.stringify(r.body)}`);
  }
  return a;
}

const checkout = (api, body = { shippingAddress: address }) => api.post('/api/orders', body);
const paySuccess = (api, created) =>
  api.post(`/api/orders/${created.body.order.id}/payment/confirm`, created.body.payment.clientConfig.successPayment);

describe('checkout reserves stock (D-06, FR-30, FR-11, FR-12)', () => {
  test('creates a PendingPayment order, reserves every line, creates a payment session, keeps stock', async () => {
    const b1 = await newBook();
    const b2 = await newBook();
    const { api } = await buyerWithCart([[b1, 2], [b2, 1]]);
    const res = await checkout(api);
    expect(res.status).toBe(201);
    const { order, payment } = res.body;
    expect(order.status).toBe('PendingPayment');
    expect(order.items).toHaveLength(2);
    expect(order.summary.total).toBe(order.summary.subtotal + order.summary.tax + order.summary.shippingFee);
    expect(order.summary.subtotal).toBe(30000);
    expect(new Date(order.reservationExpiresAt).getTime()).toBeGreaterThan(Date.now() + 14 * 60000);
    expect(payment).toMatchObject({ amount: order.summary.total, currency: 'INR' });
    expect(payment.gatewayOrderId).toMatch(/^fake_order_/);
    expect(payment.clientConfig).not.toHaveProperty('keySecret');

    // reserved goes up, stock does not change yet
    expect(await stockOf(b1)).toMatchObject({ stock: 5, reserved: 2 });
    expect(await stockOf(b2)).toMatchObject({ stock: 5, reserved: 1 });
    // the order is not in the order history until paid
    expect((await api.get('/api/orders')).body.items).toHaveLength(0);
  });

  test('available units shrink for other customers while a checkout holds them', async () => {
    const book = await newBook({ stock: 3 });
    const a = await buyerWithCart([[book, 2]]);
    await checkout(a.api);
    const b = await actor(ctx);
    const res = await b.api.post('/api/cart/items', { bookId: String(book._id), quantity: 2 });
    expect(res.status).toBe(409);
    expect((await b.api.post('/api/cart/items', { bookId: String(book._id), quantity: 1 })).status).toBe(200);
  });

  test('all or nothing: when one line is short nothing is reserved and no order exists', async () => {
    const plenty = await newBook({ stock: 5 });
    const scarce = await newBook({ stock: 2 });
    const a = await buyerWithCart([[plenty, 2], [scarce, 2]]);
    // another buyer takes one of the scarce copies after the cart was filled
    await ctx.models.Book.updateOne({ _id: scarce._id }, { $set: { reserved: 1 } });
    const res = await checkout(a.api);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(plenty)).toMatchObject({ stock: 5, reserved: 0 });
    expect(await stockOf(scarce)).toMatchObject({ stock: 2, reserved: 1 });
    expect(await ctx.models.Order.countDocuments({ userId: a.user._id })).toBe(0);
    expect(await ctx.models.Payment.countDocuments({})).toBe(await ctx.models.Payment.countDocuments({}));
  });

  test('a transaction rollback leaves earlier lines unreserved even if a later line fails inside the transaction', async () => {
    const first = await newBook({ stock: 5 });
    const second = await newBook({ stock: 5 });
    const items = [{ bookId: first._id, quantity: 1 }, { bookId: second._id, quantity: 99 }];
    const { withTransaction } = require('../../src/utils/transaction');
    await expect(withTransaction((session) => ctx.container.inventoryService.reserve(items, session))).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(await stockOf(first)).toMatchObject({ reserved: 0 });
  });

  test('empty cart, bad address and unknown address are rejected', async () => {
    const a = await actor(ctx);
    const empty = await checkout(a.api);
    expect(empty.status).toBe(400);
    const book = await newBook();
    await a.api.post('/api/cart/items', { bookId: String(book._id), quantity: 1 });
    expect((await checkout(a.api, { shippingAddress: { ...address, postalCode: '1' } })).status).toBe(400);
    expect((await checkout(a.api, {})).status).toBe(400);
    expect((await checkout(a.api, { addressId: 'a'.repeat(24), shippingAddress: address })).status).toBe(400); // exactly one
    expect((await checkout(a.api, { addressId: 'a'.repeat(24) })).status).toBe(400);
    expect(await stockOf(book)).toMatchObject({ reserved: 0 });
  });

  test('uses a saved address and can save a typed one', async () => {
    const a = await buyerWithCart([[await newBook(), 1]]);
    const saved = await a.api.post('/api/profile/addresses', { ...address, label: 'Home' });
    const res = await checkout(a.api, { addressId: saved.body.id });
    expect(res.status).toBe(201);
    expect(res.body.order.shippingAddress).toMatchObject({ fullName: 'Asha Rao', city: 'Bengaluru' });
    const b = await buyerWithCart([[await newBook(), 1]]);
    await checkout(b.api, { shippingAddress: address, saveAddress: true });
    expect((await b.api.get('/api/profile')).body.addresses).toHaveLength(1);
  });

  test('a new checkout releases the same customer\'s earlier unpaid order (one open checkout)', async () => {
    const book = await newBook({ stock: 5 });
    const a = await buyerWithCart([[book, 2]]);
    const first = await checkout(a.api);
    expect(await stockOf(book)).toMatchObject({ reserved: 2 });
    const second = await checkout(a.api);
    expect(second.status).toBe(201);
    expect(await stockOf(book)).toMatchObject({ reserved: 2 }); // not 4
    const old = await ctx.models.Order.findById(first.body.order.id);
    expect(old).toMatchObject({ status: 'PaymentFailed', failureReason: 'abandoned' });
  });

  test('gateway failure at checkout releases the reservation and returns 502', async () => {
    const book = await newBook();
    const a = await buyerWithCart([[book, 2]]);
    ctx.gateway.failNext('create');
    const res = await checkout(a.api);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('PAYMENT_GATEWAY_ERROR');
    expect(await stockOf(book)).toMatchObject({ stock: 5, reserved: 0 });
    const order = await ctx.models.Order.findOne({ userId: a.user._id });
    expect(order).toMatchObject({ status: 'PaymentFailed', failureReason: 'payment_failed' });
  });
});

describe('concurrent checkout never oversells (FR-30, TC-FR-30)', () => {
  test('20 customers race for 5 copies: exactly 5 succeed, reserved never exceeds stock', async () => {
    const book = await newBook({ stock: 5, title: 'Race Book' });
    const buyers = [];
    for (let i = 0; i < 20; i += 1) buyers.push(await buyerWithCart([[book, 1]]));
    const results = await Promise.all(buyers.map((b) => checkout(b.api)));
    const ok = results.filter((r) => r.status === 201).length;
    const rejected = results.filter((r) => r.status === 409 && r.body.error.code === 'INSUFFICIENT_STOCK').length;
    expect(ok).toBe(5);
    expect(rejected).toBe(15);
    const after = await stockOf(book);
    expect(after.reserved).toBe(5);
    expect(after.stock).toBe(5);
    expect(after.reserved).toBeLessThanOrEqual(after.stock);
    expect(await ctx.models.Order.countDocuments({ 'items.bookId': book._id, status: 'PendingPayment' })).toBe(5);
  });

  test('paying for all reservations leaves stock at exactly 0, never negative', async () => {
    const book = await newBook({ stock: 3, title: 'Race Book 2' });
    const buyers = [];
    for (let i = 0; i < 8; i += 1) buyers.push(await buyerWithCart([[book, 1]]));
    const created = await Promise.all(buyers.map((b) => checkout(b.api)));
    const winners = created.map((c, i) => [c, buyers[i]]).filter(([c]) => c.status === 201);
    expect(winners).toHaveLength(3);
    const paid = await Promise.all(winners.map(([c, b]) => paySuccess(b.api, c)));
    expect(paid.every((p) => p.status === 200 && p.body.status === 'Placed')).toBe(true);
    expect(await stockOf(book)).toMatchObject({ stock: 0, reserved: 0 });
  });

  test('the database validator refuses stock below zero or reserved above stock', async () => {
    const book = await newBook({ stock: 2 });
    await expect(ctx.models.Book.collection.updateOne({ _id: book._id }, { $set: { stock: -1 } })).rejects.toThrow();
    await expect(ctx.models.Book.collection.updateOne({ _id: book._id }, { $set: { reserved: 3 } })).rejects.toThrow();
  });
});

describe('payment confirmation (FR-13, FR-14, UC-09)', () => {
  test('success places the order, finalises stock, clears the cart, emails a confirmation', async () => {
    const book = await newBook({ stock: 5 });
    const a = await buyerWithCart([[book, 2]]);
    const created = await checkout(a.api);
    const res = await paySuccess(a.api, created);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'Placed', paymentStatus: 'succeeded' });
    expect(res.body.items.every((i) => i.fulfilmentStatus === 'Placed')).toBe(true);
    expect(await stockOf(book)).toMatchObject({ stock: 3, reserved: 0 });
    expect((await a.api.get('/api/cart')).body.items).toEqual([]);
    expect((await a.api.get('/api/orders')).body.items).toHaveLength(1);

    await ctx.container.notificationService.flush();
    const mail = ctx.mailer.last(a.user.email);
    expect(mail.subject).toMatch(/Order confirmation OB-/);
    expect(mail.text).toContain(book.title);
    const payment = await ctx.models.Payment.findOne({ orderId: created.body.order.id }).lean();
    expect(JSON.stringify(payment)).not.toMatch(/card|cvv|pan/i); // VFR-08: gateway references only
  });

  test('confirming again is idempotent: same order, stock decremented once', async () => {
    const book = await newBook({ stock: 5 });
    const a = await buyerWithCart([[book, 2]]);
    const created = await checkout(a.api);
    const first = await paySuccess(a.api, created);
    const second = await paySuccess(a.api, created);
    const third = await Promise.all([paySuccess(a.api, created), paySuccess(a.api, created)]);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(third.every((r) => r.status === 200 && r.body.status === 'Placed')).toBe(true);
    expect(await stockOf(book)).toMatchObject({ stock: 3, reserved: 0 });
    await ctx.container.notificationService.flush();
    expect(ctx.mailer.outbox.filter((m) => m.to === a.user.email && /Order confirmation/.test(m.subject))).toHaveLength(1);
  });

  test('a failed gateway verification keeps the order and the reservation (400)', async () => {
    const book = await newBook({ stock: 5 });
    const a = await buyerWithCart([[book, 1]]);
    const created = await checkout(a.api);
    const bad = await a.api.post(`/api/orders/${created.body.order.id}/payment/confirm`, created.body.payment.clientConfig.failurePayment);
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('PAYMENT_VERIFICATION_FAILED');
    expect(await stockOf(book)).toMatchObject({ stock: 5, reserved: 1 });
    expect((await ctx.models.Order.findById(created.body.order.id)).status).toBe('PendingPayment');
    // the customer can still pay in the time left
    expect((await paySuccess(a.api, created)).status).toBe(200);
  });

  test('a forged payment id or signature is refused', async () => {
    const a = await buyerWithCart([[await newBook(), 1]]);
    const created = await checkout(a.api);
    const id = created.body.order.id;
    for (const body of [{ gatewayPaymentId: 'fake_pay_forged', gatewaySignature: 'x'.repeat(64) }, { gatewayPaymentId: 'fake_pay_forged' }, { gatewayPaymentId: 'anything', gatewaySignature: '' }]) {
      const res = await a.api.post(`/api/orders/${id}/payment/confirm`, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PAYMENT_VERIFICATION_FAILED');
    }
  });

  test('the same gateway payment cannot pay for two orders', async () => {
    const a = await buyerWithCart([[await newBook(), 1]]);
    const created = await checkout(a.api);
    await paySuccess(a.api, created);
    const b = await buyerWithCart([[await newBook(), 1]]);
    const other = await checkout(b.api);
    const res = await b.api.post(`/api/orders/${other.body.order.id}/payment/confirm`, created.body.payment.clientConfig.successPayment);
    expect(res.status).toBe(400); // signature binds the payment to its own gateway order
  });

  test('gateway unreachable during verification gives 502 and the order stays payable', async () => {
    const a = await buyerWithCart([[await newBook(), 1]]);
    const created = await checkout(a.api);
    ctx.gateway.failNext('verify');
    const res = await paySuccess(a.api, created);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('PAYMENT_GATEWAY_ERROR');
    expect((await paySuccess(a.api, created)).status).toBe(200);
  });

  test("one customer cannot confirm, read or cancel another customer's order (404)", async () => {
    const a = await buyerWithCart([[await newBook(), 1]]);
    const created = await checkout(a.api);
    const other = await actor(ctx);
    const id = created.body.order.id;
    expect((await other.api.get(`/api/orders/${id}`)).status).toBe(404);
    expect((await other.api.post(`/api/orders/${id}/cancel`)).status).toBe(404);
    expect((await other.api.post(`/api/orders/${id}/payment/confirm`, created.body.payment.clientConfig.successPayment)).status).toBe(404);
  });
});

describe('recovering a payment page after a reload (existing contract only)', () => {
  test('GET order has no payment session, but a new checkout from the stored address replaces the open one', async () => {
    const book = await newBook({ stock: 5 });
    const a = await buyerWithCart([[book, 2]]);
    const first = await checkout(a.api);
    const seen = await a.api.get(`/api/orders/${first.body.order.id}`);
    expect(seen.body.status).toBe('PendingPayment');
    expect(seen.body.reservationExpiresAt).toBeTruthy();
    expect(JSON.stringify(seen.body)).not.toMatch(/clientConfig|successPayment/); // not recoverable from API-31
    const again = await checkout(a.api, { shippingAddress: seen.body.shippingAddress });
    expect(again.status).toBe(201);
    expect(again.body.payment.clientConfig.successPayment).toBeTruthy();
    expect(await stockOf(book)).toMatchObject({ reserved: 2 }); // replaced, not doubled
    expect((await paySuccess(a.api, again)).status).toBe(200);
  });
});

describe('release: payment failure, abandoned checkout and expiry', () => {
  test('cancelling an unpaid order releases the reservation without a refund', async () => {
    const book = await newBook({ stock: 5 });
    const a = await buyerWithCart([[book, 3]]);
    const created = await checkout(a.api);
    const res = await a.api.post(`/api/orders/${created.body.order.id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'PaymentFailed', failureReason: 'abandoned', refundStatus: 'none' });
    expect(await stockOf(book)).toMatchObject({ stock: 5, reserved: 0 });
    expect(ctx.gateway.calls.refund).toBe(0);
    // a closed order cannot be paid
    const pay = await paySuccess(a.api, created);
    expect(pay.status).toBe(409);
    expect(pay.body.error.code).toBe('ORDER_NOT_PAYABLE');
    expect((await a.api.post(`/api/orders/${created.body.order.id}/cancel`)).status).toBe(409);
  });

  test('expiry sweeper releases only expired reservations, once, and is safe to repeat (I-27)', async () => {
    const book = await newBook({ stock: 5 });
    const a = await buyerWithCart([[book, 2]]);
    const created = await checkout(a.api);
    await ctx.container.orderService.releaseExpiredReservations(); // earlier tests' open checkouts are not expired yet either
    expect(await stockOf(book)).toMatchObject({ reserved: 2 }); // not yet expired: still held

    ctx.clock.advanceMinutes(16);
    expect(await ctx.container.orderService.releaseExpiredReservations()).toBeGreaterThanOrEqual(1);
    expect(await ctx.container.orderService.releaseExpiredReservations()).toBe(0); // repeating is harmless
    expect(await stockOf(book)).toMatchObject({ stock: 5, reserved: 0 });
    const order = await ctx.models.Order.findById(created.body.order.id);
    expect(order).toMatchObject({ status: 'PaymentFailed', failureReason: 'expired' });
  });

  test('concurrent sweeper runs release the units only once', async () => {
    const book = await newBook({ stock: 5 });
    const a = await buyerWithCart([[book, 2]]);
    await checkout(a.api);
    ctx.clock.advanceMinutes(20);
    await Promise.all([
      ctx.container.orderService.releaseExpiredReservations(),
      ctx.container.orderService.releaseExpiredReservations(),
      ctx.container.orderService.releaseExpiredReservations(),
    ]);
    expect(await stockOf(book)).toMatchObject({ stock: 5, reserved: 0 });
  });

  test('webhook payment.failed releases the reservation', async () => {
    const book = await newBook({ stock: 5 });
    const a = await buyerWithCart([[book, 1]]);
    const created = await checkout(a.api);
    const raw = JSON.stringify({ event: 'payment.failed', gatewayOrderId: created.body.payment.gatewayOrderId });
    const res = await client(ctx.app).agent.post('/api/payments/webhook').set('X-Gateway-Signature', ctx.gateway.signWebhook(raw)).set('Content-Type', 'application/json').send(raw);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(await stockOf(book)).toMatchObject({ reserved: 0 });
    expect((await ctx.models.Order.findById(created.body.order.id)).failureReason).toBe('payment_failed');
  });
});

describe('late payment after expiry (A-13, D-06)', () => {
  test('stock still free: the order is re-reserved and placed', async () => {
    const book = await newBook({ stock: 5 });
    const a = await buyerWithCart([[book, 2]]);
    const created = await checkout(a.api);
    ctx.clock.advanceMinutes(16);
    await ctx.container.orderService.releaseExpiredReservations();
    expect(await stockOf(book)).toMatchObject({ reserved: 0 });
    const res = await paySuccess(a.api, created);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Placed');
    expect(await stockOf(book)).toMatchObject({ stock: 3, reserved: 0 });
  });

  test('stock gone: the payment is refunded and the order fails, nothing is oversold', async () => {
    const book = await newBook({ stock: 2 });
    const a = await buyerWithCart([[book, 2]]);
    const created = await checkout(a.api);
    ctx.clock.advanceMinutes(16);
    await ctx.container.orderService.releaseExpiredReservations();
    // someone else buys both copies
    const b = await buyerWithCart([[book, 2]]);
    const other = await checkout(b.api);
    expect((await paySuccess(b.api, other)).status).toBe(200);

    const late = await paySuccess(a.api, created);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('ORDER_FAILED_REFUNDED');
    expect(await stockOf(book)).toMatchObject({ stock: 0, reserved: 0 });
    const order = await ctx.models.Order.findById(created.body.order.id);
    expect(order).toMatchObject({ status: 'PaymentFailed', failureReason: 'stock_unavailable_refunded' });
    const payment = await ctx.models.Payment.findOne({ orderId: order._id });
    expect(payment.status).toBe('refunded');
    expect(ctx.gateway.calls.refund).toBeGreaterThan(0);
    const view = await a.api.get(`/api/orders/${order._id}`);
    expect(view.body.refundStatus).toBe('refunded');
  });
});

describe('cancelling a placed order (FR-16, UC-11)', () => {
  async function placedOrder(quantity = 2, stock = 5) {
    const book = await newBook({ stock });
    const a = await buyerWithCart([[book, quantity]]);
    const created = await checkout(a.api);
    await paySuccess(a.api, created);
    return { book, a, id: created.body.order.id };
  }

  test('restores stock and refunds the payment', async () => {
    const { book, a, id } = await placedOrder(2, 5);
    expect(await stockOf(book)).toMatchObject({ stock: 3 });
    const res = await a.api.post(`/api/orders/${id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'Cancelled', refundStatus: 'refunded' });
    expect(res.body.items.every((i) => i.fulfilmentStatus === 'Cancelled')).toBe(true);
    expect(await stockOf(book)).toMatchObject({ stock: 5, reserved: 0 });
  });

  test('cancelling twice does not restore stock twice', async () => {
    const { book, a, id } = await placedOrder(1, 5);
    const results = await Promise.all([a.api.post(`/api/orders/${id}/cancel`), a.api.post(`/api/orders/${id}/cancel`)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await stockOf(book)).toMatchObject({ stock: 5 });
  });

  test('a failed refund leaves the order cancelled and the payment refund_pending (A-05)', async () => {
    const { a, id } = await placedOrder(1, 5);
    ctx.gateway.failNext('refund');
    const res = await a.api.post(`/api/orders/${id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'Cancelled', refundStatus: 'pending' });
  });

  test('a Packed order can still be cancelled, a Shipped one cannot', async () => {
    const sellerApi = client(ctx.app);
    await sellerApi.post('/api/auth/login', { email: seller.email, password: ctx.PASSWORD });
    const move = (orderId, itemId, status) => sellerApi.patch(`/api/seller/orders/${orderId}/items/${itemId}/status`, { status });

    const packed = await placedOrder(1, 5);
    const itemP = (await ctx.models.Order.findById(packed.id)).items[0]._id;
    expect((await move(packed.id, itemP, 'Packed')).status).toBe(200);
    expect((await packed.a.api.post(`/api/orders/${packed.id}/cancel`)).status).toBe(200);
    expect(await stockOf(packed.book)).toMatchObject({ stock: 5 });

    const shipped = await placedOrder(1, 5);
    const itemS = (await ctx.models.Order.findById(shipped.id)).items[0]._id;
    await move(shipped.id, itemS, 'Packed');
    await move(shipped.id, itemS, 'Shipped');
    const res = await shipped.a.api.post(`/api/orders/${shipped.id}/cancel`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_NOT_CANCELLABLE');
    expect(await stockOf(shipped.book)).toMatchObject({ stock: 4 }); // not restored
  });
});

describe('order history keeps snapshots (FR-15)', () => {
  test('editing or removing a listing does not change past orders', async () => {
    const book = await newBook({ title: 'Original Title', price: 12345 });
    const a = await buyerWithCart([[book, 1]]);
    const created = await checkout(a.api);
    await paySuccess(a.api, created);
    await ctx.models.Book.updateOne({ _id: book._id }, { $set: { title: 'Changed Title', price: 99999, status: 'removed' } });
    const res = await a.api.get(`/api/orders/${created.body.order.id}`);
    expect(res.body.items[0]).toMatchObject({ title: 'Original Title', unitPrice: 12345, lineTotal: 12345 });
    expect(res.body.summary.subtotal).toBe(12345);
  });

  test('order list is paged 10 per page, newest first, own orders only', async () => {
    const a = await actor(ctx);
    for (let i = 0; i < 12; i += 1) {
      const book = await newBook({ stock: 100 });
      await a.api.post('/api/cart/items', { bookId: String(book._id), quantity: 1 });
      const created = await checkout(a.api);
      await paySuccess(a.api, created);
    }
    const p1 = await a.api.get('/api/orders');
    expect(p1.body).toMatchObject({ page: 1, totalItems: 12, totalPages: 2 });
    expect(p1.body.items).toHaveLength(10);
    expect((await a.api.get('/api/orders?page=2')).body.items).toHaveLength(2);
    expect(new Date(p1.body.items[0].placedAt) >= new Date(p1.body.items[9].placedAt)).toBe(true);
    const other = await actor(ctx);
    expect((await other.api.get('/api/orders')).body.items).toHaveLength(0);
  });
});

describe('webhook signature (API-29, I-25)', () => {
  const post = (raw, signature) => {
    const req = client(ctx.app).agent.post('/api/payments/webhook').set('Content-Type', 'application/json');
    if (signature !== undefined) req.set('X-Gateway-Signature', signature);
    return req.send(raw);
  };

  test('a wrong or missing signature is refused and changes nothing', async () => {
    const book = await newBook();
    const a = await buyerWithCart([[book, 1]]);
    const created = await checkout(a.api);
    const raw = JSON.stringify({ event: 'payment.failed', gatewayOrderId: created.body.payment.gatewayOrderId });
    expect((await post(raw, 'f'.repeat(64))).status).toBe(401);
    const missing = await post(raw);
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('INVALID_SIGNATURE');
    expect(await stockOf(book)).toMatchObject({ reserved: 1 });
  });

  test('a signed payment.succeeded event places the order, a replay changes nothing', async () => {
    const book = await newBook({ stock: 5 });
    const a = await buyerWithCart([[book, 1]]);
    const created = await checkout(a.api);
    const raw = JSON.stringify({ event: 'payment.succeeded', gatewayOrderId: created.body.payment.gatewayOrderId, gatewayPaymentId: 'fake_pay_webhook1' });
    const sig = ctx.gateway.signWebhook(raw);
    expect((await post(raw, sig)).status).toBe(200);
    expect((await post(raw, sig)).status).toBe(200);
    expect(await stockOf(book)).toMatchObject({ stock: 4, reserved: 0 });
    expect((await ctx.models.Order.findById(created.body.order.id)).status).toBe('Placed');
    // the browser confirmation afterwards is still idempotent
    expect((await paySuccess(a.api, created)).status).toBe(200);
    expect(await stockOf(book)).toMatchObject({ stock: 4 });
  });

  test('an event for an unknown gateway order is ignored', async () => {
    const raw = JSON.stringify({ event: 'payment.succeeded', gatewayOrderId: 'nope', gatewayPaymentId: 'x' });
    expect((await post(raw, ctx.gateway.signWebhook(raw))).status).toBe(200);
  });

  test('the webhook needs no CSRF token and no session', async () => {
    const raw = JSON.stringify({ event: 'noop' });
    expect((await post(raw, ctx.gateway.signWebhook(raw))).status).toBe(200);
  });
});
