const express = require('express');
const request = require('supertest');
const { setup, teardown, client, actor, createUser, createCategory, createBook, PASSWORD } = require('../helpers/testContext');
const { createRateLimiter } = require('../../src/middleware/rateLimiter');
const { errorHandler } = require('../../src/middleware/errorHandler');

let ctx;
beforeAll(async () => { ctx = await setup(); });
afterAll(() => teardown(ctx));

describe('CSRF protection (VFR-06, TC-VFR-06)', () => {
  test('state-changing requests without the header are refused with 403 CSRF_INVALID', async () => {
    const u = await createUser(ctx);
    const api = client(ctx.app);
    await api.post('/api/auth/login', { email: u.email, password: PASSWORD });
    const res = await api.agent.post('/api/cart/items').send({ bookId: 'a'.repeat(24), quantity: 1 }); // no X-CSRF-Token
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  test('a token that does not match the cookie, or a forged cookie, is refused', async () => {
    const agent = request.agent(ctx.app);
    const real = (await agent.get('/api/auth/csrf-token')).body.csrfToken;
    const wrongHeader = await agent.post('/api/auth/forgot-password').set('X-CSRF-Token', 'x'.repeat(48)).send({ email: 'a@b.com' });
    expect(wrongHeader.status).toBe(403);
    const forgedCookie = await request(ctx.app)
      .post('/api/auth/forgot-password')
      .set('Cookie', `csrf=${'b'.repeat(48)}.${'c'.repeat(64)}`)
      .set('X-CSRF-Token', 'b'.repeat(48))
      .send({ email: 'a@b.com' });
    expect(forgedCookie.status).toBe(403);
    const onlyHeader = await request(ctx.app).post('/api/auth/forgot-password').set('X-CSRF-Token', real).send({ email: 'a@b.com' });
    expect(onlyHeader.status).toBe(403); // the attacker's site can read neither the cookie nor a matching token
    const ok = await agent.post('/api/auth/forgot-password').set('X-CSRF-Token', real).send({ email: 'a@b.com' });
    expect(ok.status).toBe(200);
  });

  test('safe methods do not need a token; PUT, PATCH and DELETE do', async () => {
    const u = await actor(ctx);
    for (const [method, url] of [['put', `/api/wishlist/items/${'a'.repeat(24)}`], ['patch', '/api/profile'], ['delete', `/api/wishlist/items/${'a'.repeat(24)}`]]) {
      const res = await u.api.agent[method](url).send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_INVALID');
    }
    expect((await u.api.agent.get('/api/profile')).status).toBe(200);
  });
});

describe('injection (VFR-06)', () => {
  test('NoSQL operators in a login body cannot bypass authentication', async () => {
    const u = await createUser(ctx);
    const api = client(ctx.app);
    for (const body of [
      { email: { $ne: null }, password: { $ne: null } },
      { email: u.email, password: { $gt: '' } },
      { email: { $regex: '.*' }, password: PASSWORD },
    ]) {
      const res = await api.post('/api/auth/login', body);
      expect(res.status).toBe(400);
      expect(res.headers['set-cookie'] || []).not.toEqual(expect.arrayContaining([expect.stringMatching(/^session=/)]));
    }
  });

  test('keys starting with $ or containing a dot are rejected anywhere in the body', async () => {
    const u = await actor(ctx);
    expect((await u.api.patch('/api/profile', { name: 'x', '$set': { roles: ['admin'] } })).status).toBe(400);
    expect((await u.api.patch('/api/profile', { 'roles.0': 'admin' })).status).toBe(400);
    expect((await u.api.agent.get('/api/orders?page[$gt]=0')).status).toBe(400);
    expect((await u.api.get('/api/auth/me')).body.roles).toEqual(['customer']);
  });

  test('a search for operators or a regex is treated as plain text', async () => {
    const seller = await createUser(ctx, { roles: ['customer', 'seller'] });
    const cat = await createCategory('Sec');
    await createBook(ctx, seller, cat._id, { title: 'Plain Title', author: 'Plain Author' });
    for (const q of ['.*', '^Plain', '(?i)plain', 'Plain|Title', '\\', '[a-z]+', "'; db.dropDatabase(); //"]) {
      const res = await client(ctx.app).get(`/api/books?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
    }
    expect((await client(ctx.app).get('/api/books?q=plain')).body.items).toHaveLength(1);
  });

  test('a user id from the body is never trusted: mass-assignment of roles, status and ids is refused', async () => {
    const api = client(ctx.app);
    const res = await api.post('/api/auth/register', { name: 'Mallory', email: 'mallory@example.com', password: PASSWORD, roles: ['admin'], status: 'active' });
    expect(res.status).toBe(400);
    expect(await ctx.models.User.countDocuments({ email: 'mallory@example.com' })).toBe(0);
  });
});

describe('XSS and output handling (VFR-06)', () => {
  test('stored text comes back as JSON data, not HTML, and the CSP forbids inline scripts', async () => {
    const u = await actor(ctx, { name: 'Normal' });
    await u.api.patch('/api/profile', { name: '<script>alert(1)</script>' });
    const res = await u.api.get('/api/profile');
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.name).toBe('<script>alert(1)</script>');
    const csp = res.headers['content-security-policy'];
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/object-src 'none'/);
  });

  test('security headers are present and the server does not announce itself', async () => {
    const res = await client(ctx.app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['referrer-policy']).toBeDefined();
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  test('production mode turns on Secure cookies (HTTPS only, VFR-05)', () => {
    const { build } = require('../../src/config');
    const prod = build({ NODE_ENV: 'production', MONGODB_URI: 'x', JWT_SECRET: 'x', CSRF_SECRET: 'x', PAYMENT_PROVIDER: 'fake', MAIL_PROVIDER: 'console' });
    expect(prod.cookieSecure).toBe(true);
    expect(prod.isProd).toBe(true);
  });
});

describe('sensitive data (VFR-04, VFR-08)', () => {
  const FORBIDDEN = /passwordHash|\$2[aby]\$|tokenVersion|tokenHash|failedLoginCount|lockUntil|cardNumber|cvv/i;

  test('no response contains password hashes, token data or lock counters', async () => {
    const u = await actor(ctx);
    const admin = await actor(ctx, { roles: ['admin'] });
    for (const [api, url] of [[u.api, '/api/auth/me'], [u.api, '/api/profile'], [admin.api, '/api/admin/users'], [admin.api, '/api/admin/seller-applications']]) {
      const res = await api.get(url);
      expect(JSON.stringify(res.body)).not.toMatch(FORBIDDEN);
    }
    const login = await client(ctx.app).post('/api/auth/login', { email: u.user.email, password: PASSWORD });
    expect(JSON.stringify(login.body)).not.toMatch(FORBIDDEN);
  });

  test('errors never leak internals or stack traces', async () => {
    const original = ctx.container.userService.getProfile;
    ctx.container.userService.getProfile = async () => { throw new Error('secret connection string mongodb://user:pass@host'); };
    const u = await actor(ctx);
    const res = await u.api.get('/api/profile');
    ctx.container.userService.getProfile = original;
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', details: [] } });
    expect(JSON.stringify(res.body)).not.toMatch(/mongodb|stack|pass@/i);
  });

  test('malformed JSON and oversized bodies get clean errors', async () => {
    const agent = request.agent(ctx.app);
    const token = (await agent.get('/api/auth/csrf-token')).body.csrfToken;
    const bad = await agent.post('/api/auth/login').set('X-CSRF-Token', token).set('Content-Type', 'application/json').send('{"email": ');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    const big = await agent.post('/api/auth/login').set('X-CSRF-Token', token).send({ email: 'a@b.com', password: 'x'.repeat(200 * 1024) });
    expect(big.status).toBe(413);
  });

  test('the log redaction removes passwords, tokens, cookies, card fields and secrets (VFR-08)', () => {
    const { redact } = require('../../src/utils/redact');
    const out = redact({
      password: 'p', newPassword: 'p2', token: 't', authorization: 'Bearer x', cookie: 'session=1', cardNumber: '4111', cvv: '123',
      clientSecret: 's', gatewaySignature: 'sig', nested: { Password: 'p', ok: 'visible', list: [{ resetToken: 'r', name: 'n' }] },
    });
    expect(JSON.stringify(out)).not.toMatch(/"p"|"p2"|"t"|Bearer|session=1|4111|"123"|"s"|"sig"|"r"/);
    expect(out.nested.ok).toBe('visible');
    expect(out.nested.list[0].name).toBe('n');
  });

  test('the request log never contains the query string or cookies', async () => {
    const logger = require('../../src/utils/logger');
    const lines = [];
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((l) => { lines.push(String(l)); return true; });
    const config = require('../../src/config');
    const previous = config.logLevel;
    config.logLevel = 'info';
    try {
      const u = await actor(ctx);
      await u.api.get('/api/books?q=secrettoken123');
      logger.info('manual', { password: 'hunter2', cookie: 'session=abc' });
    } finally {
      config.logLevel = previous;
      spy.mockRestore();
    }
    const text = lines.join('');
    expect(text).toContain('"message":"request"');
    expect(text).not.toMatch(/secrettoken123|hunter2|session=abc/);
  });

  test('payment records hold gateway references only, never card fields (VFR-08)', async () => {
    const paths = Object.keys(ctx.models.Payment.schema.paths);
    expect(paths.filter((p) => /card|cvv|cvc|pan|expiry/i.test(p))).toEqual([]);
    const seller = await createUser(ctx, { roles: ['customer', 'seller'] });
    const cat = await createCategory('PayData');
    const book = await createBook(ctx, seller, cat._id);
    const buyer = await actor(ctx);
    await buyer.api.post('/api/cart/items', { bookId: String(book._id), quantity: 1 });
    const created = await buyer.api.post('/api/orders', { shippingAddress: { fullName: 'A B', line1: '1 St', city: 'C', state: 'S', postalCode: '123456', country: 'India', phone: '9999999999' } });
    await buyer.api.post(`/api/orders/${created.body.order.id}/payment/confirm`, { ...created.body.payment.clientConfig.successPayment, cardNumber: '4111111111111111' }).then((r) => {
      expect(r.status).toBe(400); // card fields are refused as unknown input
    });
    const payment = await ctx.models.Payment.findOne({ orderId: created.body.order.id }).lean();
    expect(JSON.stringify(payment)).not.toMatch(/4111/);
  });
});

describe('rate limiting and abuse (VFR-06)', () => {
  test('the limiter answers 429 RATE_LIMITED after the limit and uses the uniform error shape', async () => {
    const app = express();
    app.use(createRateLimiter({ limit: 3 }));
    app.get('/x', (req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push(await request(app).get('/x'));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 429, 429]);
    expect(results[3].body.error.code).toBe('RATE_LIMITED');
  });

  test('authentication endpoints use a stricter limiter than the rest of the API', () => {
    const { build } = require('../../src/config');
    const prod = build({ NODE_ENV: 'development', MONGODB_URI: 'x', JWT_SECRET: 'x', CSRF_SECRET: 'x' });
    expect(prod.rateLimitAuth).toBeLessThan(prod.rateLimitGlobal);
  });
});

describe('configuration contract (SDD 7.2)', () => {
  const { build } = require('../../src/config');
  test('a missing required variable stops start-up with a clear message', () => {
    expect(() => build({ NODE_ENV: 'production' })).toThrow(/MONGODB_URI, JWT_SECRET, CSRF_SECRET/);
    expect(() => build({ NODE_ENV: 'development', MONGODB_URI: 'x', JWT_SECRET: 'x' })).toThrow(/CSRF_SECRET/);
  });
  const prodBase = { NODE_ENV: 'production', MONGODB_URI: 'x', JWT_SECRET: 'x', CSRF_SECRET: 'x' };
  test('production refuses to start without an explicit payment and email provider (no silent fake fallback)', () => {
    expect(() => build(prodBase)).toThrow(/PAYMENT_PROVIDER, MAIL_PROVIDER/);
    expect(() => build({ ...prodBase, PAYMENT_PROVIDER: 'fake' })).toThrow(/MAIL_PROVIDER/);
    expect(() => build({ ...prodBase, MAIL_PROVIDER: 'console' })).toThrow(/PAYMENT_PROVIDER/);
    expect(() => build({ ...prodBase, PAYMENT_PROVIDER: '', MAIL_PROVIDER: '' })).toThrow(/PAYMENT_PROVIDER/);
  });
  test('production starts when both providers are named explicitly (the course demonstration names the fake ones)', () => {
    const c = build({ ...prodBase, PAYMENT_PROVIDER: 'fake', MAIL_PROVIDER: 'console' });
    expect(c.payment.provider).toBe('fake');
    expect(c.mail.provider).toBe('console');
  });
  test('an unknown provider name is refused when the adapters are created', () => {
    const { createGateway } = require('../../src/adapters/payment');
    const { createMailer } = require('../../src/adapters/mail');
    expect(() => createGateway({ payment: { provider: 'stripe' } })).toThrow(/Unknown PAYMENT_PROVIDER/);
    expect(() => createMailer({ mail: { provider: 'sendgrid' } })).toThrow(/Unknown MAIL_PROVIDER/);
  });
  test('development and test keep working with the defaults (fake gateway, console mailer)', () => {
    for (const env of ['development', 'test']) {
      const c = build({ NODE_ENV: env, MONGODB_URI: 'x', JWT_SECRET: 'x', CSRF_SECRET: 'x' });
      expect(c.payment.provider).toBe('fake');
      expect(c.mail.provider).toBe('console');
    }
  });
  test('bcrypt cost below 10 is refused (VFR-04)', () => {
    expect(() => build({ NODE_ENV: 'test', BCRYPT_COST: '8' })).toThrow(/BCRYPT_COST/);
    expect(build({ NODE_ENV: 'test' }).bcryptCost).toBe(12);
  });
  test('documented defaults: 15 minute reservation, 60 minute session', () => {
    const c = build({ NODE_ENV: 'test' });
    expect(c.reservationMinutes).toBe(15);
    expect(c.sessionMinutes).toBe(60);
  });
});

describe('health and availability (VFR-09, API-61)', () => {
  test('reports ok when the database answers', async () => {
    const res = await client(ctx.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });
});
