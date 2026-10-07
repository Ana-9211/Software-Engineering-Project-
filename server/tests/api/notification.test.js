const { setup, teardown, client, createUser, uniqueEmail } = require('../helpers/testContext');

let ctx;
beforeAll(async () => { ctx = await setup(); });
afterAll(() => teardown(ctx));

describe('email sending with retries (D-12, FR-01, FR-14)', () => {
  test('a failing mailer is retried and the email is eventually sent', async () => {
    const user = await createUser(ctx, { email: uniqueEmail('retry') });
    ctx.mailer.failNext(2);
    await ctx.container.notificationService.sendVerificationEmail(user, 'a'.repeat(64));
    await ctx.container.notificationService.flush();
    const record = await ctx.models.Notification.findOne({ userId: user._id });
    expect(record).toMatchObject({ channel: 'email', type: 'email_verification', status: 'sent', attempts: 3 });
    expect(ctx.mailer.last(user.email).text).toContain('a'.repeat(64));
    expect(JSON.stringify(record)).not.toContain('a'.repeat(64)); // the token is not stored
  });

  test('after 3 failed attempts the notification is marked failed and nothing throws', async () => {
    const user = await createUser(ctx, { email: uniqueEmail('fail') });
    ctx.mailer.failNext(3);
    await expect(ctx.container.notificationService.sendPasswordResetEmail(user, 'b'.repeat(64))).resolves.toBeUndefined();
    await ctx.container.notificationService.flush();
    const record = await ctx.models.Notification.findOne({ userId: user._id });
    expect(record).toMatchObject({ status: 'failed', attempts: 3 });
    expect(record.lastError).toMatch(/memory mailer failure/);
  });

  test('a registration still succeeds when the mail provider is down', async () => {
    ctx.mailer.failNext(3);
    const res = await client(ctx.app).post('/api/auth/register', { name: 'Mail Down', email: uniqueEmail('down'), password: 'Password123!' });
    expect(res.status).toBe(201);
    await ctx.container.notificationService.flush();
  });

  test('the email body escapes HTML in names', async () => {
    const user = await createUser(ctx, { name: '<b>Bold</b>', email: uniqueEmail('html') });
    await ctx.container.notificationService.sendPasswordResetEmail(user, 'c'.repeat(64));
    await ctx.container.notificationService.flush();
    const mail = ctx.mailer.last(user.email);
    expect(mail.html).not.toContain('<b>Bold</b>');
    expect(mail.html).toContain('&lt;b&gt;');
  });

  test('the console mailer prints the email and delivers nothing', async () => {
    const { ConsoleMailSender } = require('../../src/adapters/mail/mailSenders');
    const lines = [];
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((l) => { lines.push(String(l)); return true; });
    const result = await new ConsoleMailSender({ from: 'x' }).send({ to: 'a@b.com', subject: 'Hi', text: 'Body' });
    spy.mockRestore();
    expect(result.providerMessageId).toMatch(/^console_/);
    expect(lines.join('')).toMatch(/not delivered/);
  });
});
