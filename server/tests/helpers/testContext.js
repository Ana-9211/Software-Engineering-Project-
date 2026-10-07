const mongoose = require('mongoose');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const http = require('http');

const { createApp } = require('../../src/app');
const { initDatabase } = require('../../src/db/connect');
const models = require('../../src/models');
const { FakeGateway } = require('../../src/adapters/payment/fakeGateway');
const { MemoryMailSender } = require('../../src/adapters/mail/mailSenders');
const { createFakeClock } = require('../../src/utils/clock');
const config = require('../../src/config');

const PASSWORD = 'Password123!';
let passwordHash;

// One database per test file; the application is built with a fake gateway, a memory mailer and a fake clock.
async function setup() {
  const dbName = `t_${crypto.randomBytes(6).toString('hex')}`;
  const base = process.env.MONGO_TEST_URI.replace(/\/\?/, '/?');
  const uri = base.replace('/?', `/${dbName}?`);
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  await initDatabase();

  const gateway = new FakeGateway({ keySecret: config.payment.keySecret, webhookSecret: config.payment.webhookSecret });
  const mailer = new MemoryMailSender();
  const clock = createFakeClock(new Date());
  const { app, container } = createApp({ gateway, mailer, clock, retryDelaysMs: [0, 0, 0] });
  passwordHash = passwordHash || bcrypt.hashSync(PASSWORD, 10);

  const server = http.createServer(app).listen(0);
  return { app: server, rawApp: app, server, container, gateway, mailer, clock, models, passwordHash, PASSWORD };
}

async function teardown(ctx) {
  if (ctx && ctx.server) await new Promise((r) => ctx.server.close(r));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

// supertest agent that keeps cookies and sends the CSRF header on every state-changing request
function client(app) {
  const agent = request.agent(app);
  let csrf;
  async function token() {
    if (!csrf) csrf = (await agent.get('/api/auth/csrf-token')).body.csrfToken;
    return csrf;
  }
  const api = { agent, token };
  for (const method of ['get', 'head']) api[method] = (url) => agent[method](url);
  for (const method of ['post', 'put', 'patch', 'delete']) {
    api[method] = async (url, body) => {
      const csrfToken = await token(); // fetched first so the CSRF cookie is already in the agent
      const req = agent[method](url).set('X-CSRF-Token', csrfToken);
      return body === undefined ? req : req.send(body);
    };
  }
  api.resetCsrf = () => { csrf = undefined; };
  return api;
}

let counter = 0;
const uniqueEmail = (prefix = 'user') => `${prefix}${Date.now()}${counter++}@example.com`;

// creates an active user directly in the database (no registration flow)
async function createUser(ctx, { roles = ['customer'], status = 'active', name = 'Test User', email, extra = {} } = {}) {
  return models.User.create({
    name,
    email: email || uniqueEmail(),
    passwordHash: ctx.passwordHash,
    roles,
    status,
    emailVerifiedAt: status === 'pending_verification' ? undefined : new Date(),
    ...extra,
  });
}

async function login(ctx, user, password = PASSWORD) {
  const api = client(ctx.app);
  const res = await api.post('/api/auth/login', { email: user.email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return api;
}

// logged-in client for a freshly created user
async function actor(ctx, options) {
  const user = await createUser(ctx, options);
  const api = await login(ctx, user);
  return { user, api };
}

let isbnCounter = 0;
// valid ISBN-13 starting with 978
function nextIsbn() {
  const body = `978${String(100000000 + isbnCounter++).slice(0, 9)}`;
  const sum = [...body].reduce((s, c, i) => s + Number(c) * (i % 2 === 0 ? 1 : 3), 0);
  return body + ((10 - (sum % 10)) % 10);
}

async function createCategory(name = `Category ${counter++}`) {
  return models.Category.create({ name });
}

// creates an approved book directly (with search fields); optional overrides
async function createBook(ctx, seller, categoryId, overrides = {}) {
  const { buildSearchFields } = require('../../src/modules/catalog/search');
  const title = overrides.title || `Book ${counter++}`;
  const author = overrides.author || 'Some Author';
  const isbn = overrides.isbn || nextIsbn();
  return models.Book.create({
    sellerId: seller._id,
    title,
    author,
    isbn,
    price: 10000,
    description: 'A test book',
    categoryId,
    language: 'English',
    stock: 10,
    reserved: 0,
    status: 'approved',
    ...buildSearchFields(title, author, isbn),
    ...overrides,
  });
}

module.exports = { setup, teardown, client, createUser, login, actor, createCategory, createBook, nextIsbn, uniqueEmail, PASSWORD };
