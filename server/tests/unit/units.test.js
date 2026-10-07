const { computeSummary } = require('../../src/utils/money');
const { deriveOrderStatus, isValidTransition, canCancel } = require('../../src/modules/order/orderStatusPolicy');
const { createFakeClock } = require('../../src/utils/clock');
const { validIsbn } = require('../../src/modules/book-management/bookManagement.routes');
const { detectImageType } = require('../../src/modules/media/media.service');
const { hasBadKey } = require('../../src/middleware/sanitize');
const { createTokenService } = require('../../src/modules/auth/token.service');
const { createPasswordService } = require('../../src/modules/auth/password.service');
const { FakeGateway } = require('../../src/adapters/payment/fakeGateway');
const { build } = require('../../src/config');

const pricing = { taxRatePercent: 5, shippingFlatFee: 4900 };

describe('price summary (FR-12, D-08)', () => {
  test.each([
    [[], { subtotal: 0, tax: 0, shippingFee: 0, total: 0 }],
    [[{ unitPrice: 10000, quantity: 1 }], { subtotal: 10000, tax: 500, shippingFee: 4900, total: 15400 }],
    [[{ unitPrice: 999, quantity: 3 }], { subtotal: 2997, tax: 150, shippingFee: 4900, total: 8047 }], // 149.85 -> 150
    [[{ unitPrice: 10, quantity: 1 }], { subtotal: 10, tax: 1, shippingFee: 4900, total: 4911 }], // 0.5 rounds half up
    [[{ unitPrice: 9, quantity: 1 }], { subtotal: 9, tax: 0, shippingFee: 4900, total: 4909 }], // 0.45 rounds down
  ])('%j', (lines, expected) => {
    expect(computeSummary(lines, pricing)).toEqual(expected);
  });
});

describe('order status policy (D-07)', () => {
  const items = (...s) => s.map((fulfilmentStatus) => ({ fulfilmentStatus }));
  test('status is the lowest status of the non-cancelled items', () => {
    expect(deriveOrderStatus(items('Placed', 'Packed'))).toBe('Placed');
    expect(deriveOrderStatus(items('Shipped', 'Delivered'))).toBe('Shipped');
    expect(deriveOrderStatus(items('Delivered', 'Delivered'))).toBe('Delivered');
    expect(deriveOrderStatus(items('Cancelled', 'Packed'))).toBe('Packed');
    expect(deriveOrderStatus(items('Cancelled', 'Cancelled'))).toBe('Cancelled');
  });
  test('only the next step is a valid transition', () => {
    expect(isValidTransition('Placed', 'Packed')).toBe(true);
    expect(isValidTransition('Packed', 'Shipped')).toBe(true);
    expect(isValidTransition('Shipped', 'Delivered')).toBe(true);
    for (const [a, b] of [['Placed', 'Shipped'], ['Packed', 'Placed'], ['Delivered', 'Shipped'], ['Cancelled', 'Packed'], ['Placed', 'Delivered']]) {
      expect(isValidTransition(a, b)).toBe(false);
    }
  });
  test('cancellation rule (FR-16)', () => {
    expect(canCancel({ status: 'PendingPayment', items: items('Placed') })).toBe(true);
    expect(canCancel({ status: 'Placed', items: items('Placed', 'Packed') })).toBe(true);
    expect(canCancel({ status: 'Packed', items: items('Packed') })).toBe(true);
    expect(canCancel({ status: 'Shipped', items: items('Shipped') })).toBe(false);
    expect(canCancel({ status: 'Packed', items: items('Packed', 'Shipped') })).toBe(false);
    expect(canCancel({ status: 'Delivered', items: items('Delivered') })).toBe(false);
    expect(canCancel({ status: 'Cancelled', items: items('Cancelled') })).toBe(false);
    expect(canCancel({ status: 'PaymentFailed', items: items('Placed') })).toBe(false);
  });
});

describe('ISBN validation (D-11, API-37)', () => {
  const helpers = { error: (code) => ({ code }) };
  test.each(['9780747532699', '978-0-7475-3269-9', '0306406152', '0-306-40615-2', '080442957X'])('%s is valid', (v) => {
    expect(validIsbn(v, helpers)).toBe(v);
  });
  test.each(['9780747532690', '0306406153', '12345', '', 'abcdefghij', '97807475326999'])('%s is invalid', (v) => {
    expect(validIsbn(v, helpers)).toEqual({ code: 'any.invalid' });
  });
});

describe('image signature check (D-09)', () => {
  test('recognises JPEG and PNG only, by their first bytes', () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg');
    expect(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(detectImageType(Buffer.from('<svg>'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // truncated PNG signature
  });
});

describe('request sanitising (VFR-06)', () => {
  test('finds $ keys and dotted keys at any depth', () => {
    expect(hasBadKey({ a: { b: { $gt: 1 } } })).toBe(true);
    expect(hasBadKey({ list: [{ 'x.y': 1 }] })).toBe(true);
    expect(hasBadKey({ ok: { fine: [1, 'two', { three: 3 }] } })).toBe(false);
    expect(hasBadKey(null)).toBe(false);
  });
});

describe('session token (FR-02)', () => {
  const config = build({ NODE_ENV: 'test' });
  const svc = createTokenService({ config });
  test('carries user id and token version and lasts 60 minutes', () => {
    const token = svc.sign({ _id: 'abc', tokenVersion: 3 });
    const payload = svc.verify(token);
    expect(payload).toMatchObject({ sub: 'abc', tv: 3 });
    expect(payload.exp - payload.iat).toBe(3600);
  });
  test('rejects garbage, unsigned tokens and tokens signed with another key', () => {
    expect(() => svc.verify('not-a-token')).toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
    const jwt = require('jsonwebtoken');
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: 'x', tv: 0 })).toString('base64url');
    expect(() => svc.verify(`${header}.${body}.`)).toThrow();
    expect(() => svc.verify(jwt.sign({ sub: 'x', tv: 0 }, 'wrong-secret'))).toThrow();
  });
});

describe('password hashing (VFR-04)', () => {
  test('uses bcrypt with a different salt each time and the configured cost', async () => {
    const svc = createPasswordService({ config: build({ NODE_ENV: 'test', BCRYPT_COST: '10' }) });
    const a = await svc.hash('Secret123!');
    const b = await svc.hash('Secret123!');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^\$2[aby]\$10\$/);
    expect(await svc.compare('Secret123!', a)).toBe(true);
    expect(await svc.compare('secret123!', a)).toBe(false);
  });
});

describe('fake payment gateway honours the adapter contract (SDD 7.2)', () => {
  const gw = new FakeGateway({ keySecret: 'k', webhookSecret: 'w' });
  test('createPayment, verifyPayment, verifyWebhook, refund', async () => {
    const created = await gw.createPayment(15400, 'INR', 'OB-1');
    expect(created.gatewayOrderId).toMatch(/^fake_order_/);
    const ok = created.clientConfig.successPayment;
    const bad = created.clientConfig.failurePayment;
    expect(await gw.verifyPayment(created.gatewayOrderId, ok.gatewayPaymentId, ok.gatewaySignature)).toBe(true);
    expect(await gw.verifyPayment(created.gatewayOrderId, bad.gatewayPaymentId, bad.gatewaySignature)).toBe(false);
    expect(await gw.verifyPayment('other_order', ok.gatewayPaymentId, ok.gatewaySignature)).toBe(false);
    expect(await gw.verifyPayment(created.gatewayOrderId, ok.gatewayPaymentId, 'bad')).toBe(false);
    const raw = Buffer.from('{"event":"payment.failed"}');
    expect(gw.verifyWebhook(raw, gw.signWebhook(raw))).toEqual({ event: 'payment.failed' });
    expect(() => gw.verifyWebhook(raw, 'nope')).toThrow(expect.objectContaining({ name: 'SignatureError' }));
    expect(await gw.refund('fake_pay_1', 100)).toMatchObject({ status: 'processed' });
  });
  test('no card data in any request or response shape', async () => {
    const created = await gw.createPayment(100, 'INR', 'ref');
    expect(JSON.stringify(created)).not.toMatch(/card|cvv|expiry/i);
  });
});

describe('fake clock', () => {
  test('advances on demand', () => {
    const c = createFakeClock(new Date('2026-01-01T00:00:00Z'));
    c.advanceMinutes(15);
    expect(c.now().toISOString()).toBe('2026-01-01T00:15:00.000Z');
  });
});
