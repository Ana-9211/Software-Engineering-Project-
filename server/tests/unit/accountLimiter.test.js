const express = require('express');
const request = require('supertest');
const { createAccountLimiter } = require('../../src/middleware/rateLimiter');

// VFR-06: failed authentication attempts are limited per account, so spreading guesses over many client
// addresses (as happens behind a multi-layer hosting proxy) does not get around the limit.
function buildApp(limit) {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.post('/login', createAccountLimiter({ limit }), (req, res) => {
    if (req.body.password === 'right') return res.json({ ok: true });
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS' } });
  });
  return app;
}

const wrong = (app, email, ip) => request(app).post('/login').set('X-Forwarded-For', ip).send({ email, password: 'wrong' });

describe('per-account authentication limiter', () => {
  test('blocks the account after the limit even when every attempt comes from a different address', async () => {
    const app = buildApp(3);
    const statuses = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await wrong(app, 'victim@example.com', `203.0.113.${i + 1}`)).status);
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });

  test('treats e-mail case and spacing as the same account', async () => {
    const app = buildApp(2);
    await wrong(app, 'Victim@Example.com', '203.0.113.1');
    await wrong(app, ' victim@example.com ', '203.0.113.2');
    expect((await wrong(app, 'VICTIM@example.com', '203.0.113.3')).status).toBe(429);
  });

  test('does not affect other accounts', async () => {
    const app = buildApp(1);
    await wrong(app, 'a@example.com', '203.0.113.1');
    expect((await wrong(app, 'a@example.com', '203.0.113.1')).status).toBe(429);
    expect((await wrong(app, 'b@example.com', '203.0.113.1')).status).toBe(401);
  });

  test('successful logins are not counted', async () => {
    const app = buildApp(2);
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post('/login').send({ email: 'ok@example.com', password: 'right' });
      expect(res.status).toBe(200);
    }
    expect((await wrong(app, 'ok@example.com', '203.0.113.9')).status).toBe(401);
  });

  test('429 uses the uniform error shape', async () => {
    const app = buildApp(1);
    await wrong(app, 'x@example.com', '203.0.113.1');
    const res = await wrong(app, 'x@example.com', '203.0.113.2');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
