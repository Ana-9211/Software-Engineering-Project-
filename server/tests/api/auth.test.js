const { setup, teardown, client, createUser, login, uniqueEmail, PASSWORD } = require('../helpers/testContext');

let ctx;
beforeAll(async () => { ctx = await setup(); });
afterAll(() => teardown(ctx));

const tokenFrom = (mail) => /token=([a-f0-9]+)/.exec(mail.text)[1];

describe('registration and email verification (FR-01, UC-04)', () => {
  test('registers, emails a link, verifies, then can log in', async () => {
    const api = client(ctx.app);
    const email = uniqueEmail('reg');
    const res = await api.post('/api/auth/register', { name: 'Reg User', email, password: PASSWORD });
    expect(res.status).toBe(201);
    await ctx.container.notificationService.flush();
    const mail = ctx.mailer.last(email);
    expect(mail.subject).toMatch(/verify/i);

    // login is refused until the email is verified (D-05)
    let login1 = await api.post('/api/auth/login', { email, password: PASSWORD });
    expect(login1.status).toBe(403);
    expect(login1.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const verify = await api.post('/api/auth/verify-email', { token: tokenFrom(mail) });
    expect(verify.status).toBe(200);
    login1 = await api.post('/api/auth/login', { email, password: PASSWORD });
    expect(login1.status).toBe(200);
    expect(login1.body).toMatchObject({ email, roles: ['customer'], status: 'active' });
    expect(login1.body.passwordHash).toBeUndefined();
  });

  test('accepts any well-formed email address, including internal domains, and refuses malformed ones', async () => {
    const api = client(ctx.app);
    const ok = await api.post('/api/auth/register', { name: 'Local', email: `person${Date.now()}@bookstore.local`, password: PASSWORD });
    expect(ok.status).toBe(201);
    for (const email of ['plainaddress', '@no-local-part.com', 'two@@example.com', 'spaces in@example.com', 'a@b']) {
      const res = await api.post('/api/auth/register', { name: 'Bad', email, password: PASSWORD });
      expect(res.status).toBe(400);
    }
  });

  test('stores only a bcrypt hash and never the password or the token', async () => {
    const email = uniqueEmail('hash');
    await client(ctx.app).post('/api/auth/register', { name: 'Hash', email, password: PASSWORD });
    const user = await ctx.models.User.findOne({ email });
    expect(user.passwordHash).toMatch(/^\$2[aby]\$(\d\d)\$/);
    expect(Number(/^\$2[aby]\$(\d\d)\$/.exec(user.passwordHash)[1])).toBeGreaterThanOrEqual(10);
    expect(user.passwordHash).not.toContain(PASSWORD);
    await ctx.container.notificationService.flush();
    const stored = JSON.stringify(await ctx.models.Notification.find({ userId: user._id }).lean());
    expect(stored).not.toMatch(/token=/);
    const tokenDoc = await ctx.models.AuthToken.findOne({ userId: user._id });
    expect(tokenDoc.tokenHash).toHaveLength(64);
  });

  test('rejects a duplicate email and invalid input', async () => {
    const api = client(ctx.app);
    const email = uniqueEmail('dup');
    expect((await api.post('/api/auth/register', { name: 'A', email, password: PASSWORD })).status).toBe(201);
    const dup = await api.post('/api/auth/register', { name: 'B', email: email.toUpperCase(), password: PASSWORD });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');

    const short = await api.post('/api/auth/register', { name: 'C', email: uniqueEmail(), password: 'short' });
    expect(short.status).toBe(400);
    expect(short.body.error.code).toBe('VALIDATION_ERROR');
    expect(short.body.error.details[0].field).toBe('password');

    const extra = await api.post('/api/auth/register', { name: 'C', email: uniqueEmail(), password: PASSWORD, roles: ['admin'] });
    expect(extra.status).toBe(400); // unknown fields are rejected, so nobody can register as admin
  });

  test('an unknown or reused verification token is rejected', async () => {
    const api = client(ctx.app);
    const bad = await api.post('/api/auth/verify-email', { token: 'a'.repeat(64) });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('TOKEN_INVALID_OR_EXPIRED');

    const email = uniqueEmail('reuse');
    await api.post('/api/auth/register', { name: 'R', email, password: PASSWORD });
    await ctx.container.notificationService.flush();
    const token = tokenFrom(ctx.mailer.last(email));
    expect((await api.post('/api/auth/verify-email', { token })).status).toBe(200);
    expect((await api.post('/api/auth/verify-email', { token })).status).toBe(400);
  });

  test('resend returns the same reply for known and unknown emails', async () => {
    const api = client(ctx.app);
    const known = uniqueEmail('known');
    await api.post('/api/auth/register', { name: 'K', email: known, password: PASSWORD });
    const a = await api.post('/api/auth/resend-verification', { email: known });
    const b = await api.post('/api/auth/resend-verification', { email: 'nobody@example.com' });
    expect(a.status).toBe(200);
    expect(a.body).toEqual(b.body);
  });
});

describe('login, session and logout (FR-02, UC-05)', () => {
  test('sets an HttpOnly cookie, /me works, logout invalidates the token', async () => {
    const user = await createUser(ctx);
    const api = client(ctx.app);
    const res = await api.post('/api/auth/login', { email: user.email, password: PASSWORD });
    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('session='));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=3600/);

    const sessionCookie = cookie.split(';')[0];
    expect((await api.get('/api/auth/me')).body.email).toBe(user.email);

    expect((await api.post('/api/auth/logout')).status).toBe(200);
    // the old token must stop working even if a client keeps it
    const replay = await client(ctx.app).agent.get('/api/auth/me').set('Cookie', sessionCookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('wrong password and unknown email give the same error', async () => {
    const user = await createUser(ctx);
    const api = client(ctx.app);
    const wrong = await api.post('/api/auth/login', { email: user.email, password: 'WrongPassword1' });
    const unknown = await api.post('/api/auth/login', { email: 'nobody@example.com', password: 'WrongPassword1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('locks the account for 15 minutes after 5 failures (VFR-07)', async () => {
    const user = await createUser(ctx);
    const api = client(ctx.app);
    for (let i = 0; i < 5; i += 1) {
      const r = await api.post('/api/auth/login', { email: user.email, password: 'WrongPassword1' });
      expect(r.status).toBe(401);
    }
    const locked = await api.post('/api/auth/login', { email: user.email, password: PASSWORD });
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);

    ctx.clock.advanceMinutes(16);
    const again = await api.post('/api/auth/login', { email: user.email, password: PASSWORD });
    expect(again.status).toBe(200);
  });

  test('a successful login resets the failure counter', async () => {
    const user = await createUser(ctx);
    const api = client(ctx.app);
    for (let i = 0; i < 4; i += 1) await api.post('/api/auth/login', { email: user.email, password: 'WrongPassword1' });
    expect((await api.post('/api/auth/login', { email: user.email, password: PASSWORD })).status).toBe(200);
    for (let i = 0; i < 4; i += 1) await api.post('/api/auth/login', { email: user.email, password: 'WrongPassword1' });
    expect((await api.post('/api/auth/login', { email: user.email, password: PASSWORD })).status).toBe(200);
  });

  test('a suspended user cannot log in and an existing session ends (FR-24)', async () => {
    const user = await createUser(ctx);
    const api = await login(ctx, user);
    expect((await api.get('/api/auth/me')).status).toBe(200);
    await ctx.models.User.updateOne({ _id: user._id }, { $set: { status: 'suspended' } });
    const me = await api.get('/api/auth/me');
    expect(me.status).toBe(403);
    expect(me.body.error.code).toBe('ACCOUNT_SUSPENDED');
    const again = await client(ctx.app).post('/api/auth/login', { email: user.email, password: PASSWORD });
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  test('an expired session token is refused (60 minutes, FR-02)', async () => {
    const user = await createUser(ctx);
    const jwt = require('jsonwebtoken');
    const config = require('../../src/config');
    const expired = jwt.sign({ sub: String(user._id), tv: 0 }, config.jwtSecret, { expiresIn: -10 });
    const res = await client(ctx.app).agent.get('/api/auth/me').set('Cookie', `session=${expired}`);
    expect(res.status).toBe(401);
    const forged = jwt.sign({ sub: String(user._id), tv: 0 }, 'another-secret');
    expect((await client(ctx.app).agent.get('/api/auth/me').set('Cookie', `session=${forged}`)).status).toBe(401);
  });
});

describe('password reset (FR-03, UC-14)', () => {
  test('emailed link works once and ends all sessions', async () => {
    const user = await createUser(ctx);
    const loggedIn = await login(ctx, user);
    const api = client(ctx.app);
    expect((await api.post('/api/auth/forgot-password', { email: user.email })).status).toBe(200);
    await ctx.container.notificationService.flush();
    const token = tokenFrom(ctx.mailer.last(user.email));

    const reset = await api.post('/api/auth/reset-password', { token, newPassword: 'NewPassword456!' });
    expect(reset.status).toBe(200);
    expect((await loggedIn.get('/api/auth/me')).status).toBe(401); // old session invalidated
    expect((await api.post('/api/auth/reset-password', { token, newPassword: 'Another789!' })).status).toBe(400); // single use
    expect((await api.post('/api/auth/login', { email: user.email, password: PASSWORD })).status).toBe(401);
    expect((await api.post('/api/auth/login', { email: user.email, password: 'NewPassword456!' })).status).toBe(200);
  });

  test('the reset link expires after 30 minutes', async () => {
    const user = await createUser(ctx);
    const api = client(ctx.app);
    await api.post('/api/auth/forgot-password', { email: user.email });
    await ctx.container.notificationService.flush();
    const token = tokenFrom(ctx.mailer.last(user.email));
    ctx.clock.advanceMinutes(31);
    const res = await api.post('/api/auth/reset-password', { token, newPassword: 'NewPassword456!' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOKEN_INVALID_OR_EXPIRED');
  });

  test('same reply for unknown emails', async () => {
    const api = client(ctx.app);
    const a = await api.post('/api/auth/forgot-password', { email: 'nobody@example.com' });
    const b = await api.post('/api/auth/forgot-password', { email: (await createUser(ctx)).email });
    expect(a.status).toBe(200);
    expect(a.body).toEqual(b.body);
  });
});
