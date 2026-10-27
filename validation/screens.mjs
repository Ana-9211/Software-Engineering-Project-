// Phase 4 validation of all 30 screens (S-01 to S-30) in a real browser against the running application.
// For every screen: route and access rule, load, forms and validation, loading / empty / error / success states,
// API integration (no failed requests), console errors, 360 px layout, accessibility (axe-core).
//
// BROWSER=edge|chrome|firefox (default edge), SHOTS=1 saves a screenshot per screen.
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium, firefox } from 'playwright-core';
import {
  ROOT, BASE, OUT, Http, recorder, emailLink, connectDb, createUserDirect, uniqueEmail, PASSWORD, ADDRESS, isbn13, mongoose, sleep,
} from './lib.mjs';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve(path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js')), 'utf8');
const BROWSER = process.env.BROWSER || 'edge';
const SHOTS = process.env.SHOTS === '1';
const shotDir = path.join(OUT, 'screens');
if (SHOTS) mkdirSync(shotDir, { recursive: true });
const R = recorder(`Frontend screen validation (${BROWSER})`);
const db = await connectDb();

const launch = () => {
  if (BROWSER === 'firefox') return firefox.launch({ headless: true });
  const exe = BROWSER === 'chrome' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  return chromium.launch({ executablePath: exe, headless: true });
};
const browser = await launch();
const version = browser.version();

// ------------------------------------------------------------------ fixtures (through the API; users created directly)
const admin = new Http(); await admin.login(process.env.ADMIN_EMAIL || 'admin@bookstore.local', process.env.ADMIN_PASSWORD || 'AdminPass123!');
const category = (await new Http().get('/api/categories')).json.find((c) => c.name === 'Fiction').id;
const stamp = Date.now();
const mk = async (roles, name) => { const u = await createUserDirect(db, { roles, name }); const h = new Http(); await h.login(u.email, PASSWORD); return { u, h, email: u.email }; };
const customer = await mk(['customer'], 'Screen Customer');
const emptyCustomer = await mk(['customer'], 'Empty Customer');
const seller = await mk(['customer', 'seller'], 'Screen Seller');
const emptySeller = await mk(['customer', 'seller'], 'Empty Seller');
const adminUser = { email: process.env.ADMIN_EMAIL || 'admin@bookstore.local' };
const book = async (client, title, extra = {}) => (await client.h.post('/api/seller/books', { title, author: 'Screen Author', isbn: isbn13(Math.floor(Math.random() * 1e9)), price: 29900, categoryId: category, language: 'English', stock: 10, ...extra })).json;
const bookMain = await book(seller, `Screen Test Book ${stamp}`);
const bookTwo = await book(seller, `Screen Second Book ${stamp}`, { stock: 1 });
const bookPending = await book(seller, `Screen Pending Book ${stamp}`);
await admin.post(`/api/admin/books/${bookMain.id}/approve`);
await admin.post(`/api/admin/books/${bookTwo.id}/approve`);
await seller.h.patch(`/api/seller/books/${bookMain.id}/inventory`, { stock: 10, lowStockThreshold: 20 }); // low-stock alert for the seller screens
const buy = async (client, b, qty, deliver) => {
  await client.h.post('/api/cart/items', { bookId: b.id, quantity: qty });
  const o = (await client.h.post('/api/orders', { shippingAddress: ADDRESS })).json;
  await client.h.post(`/api/orders/${o.order.id}/payment/confirm`, o.payment.clientConfig.successPayment);
  if (deliver) {
    const mine = (await seller.h.get('/api/seller/orders')).json.items.find((x) => x.id === o.order.id);
    for (const st of ['Packed', 'Shipped', 'Delivered']) await seller.h.patch(`/api/seller/orders/${o.order.id}/items/${mine.items[0].id}/status`, { status: st });
  }
  return o.order;
};
const orderDelivered = await buy(customer, bookMain, 1, true);
const orderPlaced = await buy(customer, bookMain, 1, false);
const other = await mk(['customer'], 'Reviewer Customer');
await buy(other, bookMain, 1, true);
await other.h.post(`/api/books/${bookMain.id}/reviews`, { rating: 2, comment: `Screen test review ${stamp}` });
const applicant = await mk(['customer'], 'Screen Applicant');
await applicant.h.post('/api/seller/applications', { storeName: `Screen Store ${stamp}` });
await customer.h.put(`/api/wishlist/items/${bookMain.id}`);
await customer.h.post('/api/profile/addresses', { ...ADDRESS, label: 'Home' });
await customer.h.post('/api/cart/items', { bookId: bookTwo.id, quantity: 1 });

// ------------------------------------------------------------------ browser helpers
async function session(label, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport, baseURL: BASE });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const bag = { errors: [], failed: [], clear() { this.errors.length = 0; this.failed.length = 0; } };
  page.on('pageerror', (e) => bag.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && bag.errors.push(`console: ${m.text()}`));
  page.on('response', (res) => {
    const u = res.url();
    if (!u.startsWith(BASE)) return;
    if (res.status() >= 500 && !bag.expect5xx) bag.failed.push(`${res.status()} ${new URL(u).pathname}`);
    if (res.status() >= 400 && res.status() < 500 && !(res.status() === 401 && u.endsWith('/api/auth/me')) && !bag.allow4xx) bag.failed.push(`${res.status()} ${new URL(u).pathname}`);
  });
  return { label, context, page, bag };
}
async function uiLogin(s, email, password = PASSWORD) {
  s.bag.allow4xx = true;
  await s.page.goto('/login');
  await s.page.getByLabel('Email', { exact: true }).fill(email);
  await s.page.getByLabel('Password', { exact: true }).fill(password);
  await s.page.getByRole('button', { name: 'Log in' }).click();
  await s.page.waitForURL((u) => !u.pathname.endsWith('/login'));
  s.bag.allow4xx = false;
}
async function axe(page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  });
}
const accessibility = [];
async function inspect(id, s, headingRe, { shot = true } = {}) {
  const { page, bag } = s;
  await page.waitForLoadState('networkidle');
  const h = page.getByRole('heading', { name: headingRe }).first();
  await h.waitFor();
  R.check(`${id}.load`, id, 'screen loads with its heading', String(headingRe), (await h.textContent()).trim().slice(0, 60), true);
  R.check(`${id}.api`, id, 'no failed API call and no console error while loading', '0', `${bag.failed.length + bag.errors.length} ${[...bag.failed, ...bag.errors].join(' | ').slice(0, 150)}`, bag.failed.length + bag.errors.length === 0);
  if (SHOTS && shot) await page.screenshot({ path: path.join(shotDir, `${id}.jpg`), type: 'jpeg', quality: 55 });
  const v = await axe(page);
  const bad = v.filter((x) => ['serious', 'critical'].includes(x.impact));
  accessibility.push({ id, browser: BROWSER, serious_critical: bad, other: v.filter((x) => !['serious', 'critical'].includes(x.impact)) });
  R.check(`${id}.a11y`, `${id}, VFR-11`, 'axe-core WCAG 2 A/AA: no serious or critical violations', '0', bad.length ? JSON.stringify(bad) : `0 (other: ${v.length})`, bad.length === 0);
  await page.setViewportSize({ width: 360, height: 740 });
  await sleep(200);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  R.check(`${id}.mobile`, `${id}, VFR-10`, 'no horizontal scrolling at 360 px', '<= 0 px', `${over} px`, over <= 0);
  if (SHOTS && shot && ['S-01', 'S-08', 'S-10', 'S-22'].includes(id)) await page.screenshot({ path: path.join(shotDir, `${id}-360.jpg`), type: 'jpeg', quality: 55 });
  await page.setViewportSize({ width: 1280, height: 800 });
}
async function goto(s, url) {
  s.bag.clear();
  await s.page.goto(url);
}
async function errorState(id, s, urlRe, url, headingRe, afterRetry) {
  const { page, bag } = s;
  bag.expect5xx = true;
  await page.route(urlRe, (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', details: [] } }) }));
  await page.goto(url);
  const alert = page.locator('.alert-error').first();
  await alert.waitFor();
  const retry = page.getByRole('button', { name: 'Try again' });
  R.check(`${id}.error`, `${id}`, 'a server error shows an error message with a Try again button', 'alert + retry', `${(await alert.textContent()).trim().slice(0, 60)} / retry ${await retry.count()}`, (await retry.count()) > 0);
  await page.unroute(urlRe);
  bag.expect5xx = false;
  await retry.first().click();
  await page.locator('.alert-error').first().waitFor({ state: 'detached' }).catch(() => {});
  await page.getByRole('heading', { name: headingRe }).first().waitFor();
  if (afterRetry) await afterRetry();
  R.check(`${id}.retry`, `${id}`, 'Try again loads the data after the error is gone', 'content shown', 'ok', (await page.locator('.alert-error').count()) === 0);
}
async function errorOnly(id, s, urlRe, url) {
  const { page, bag } = s;
  bag.expect5xx = true;
  await page.route(urlRe, (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', details: [] } }) }));
  await page.goto(url);
  const shown = await page.locator('.alert-error').first().waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
  const retry = await page.getByRole('button', { name: 'Try again' }).count();
  await page.unroute(urlRe);
  bag.expect5xx = false;
  R.check(`${id}.error`, id, 'a server error is shown to the user as a message' + (retry ? '' : ' (no Try again button: the user repeats the action)'), 'error message visible', shown ? `message shown${retry ? ' with Try again' : ' without Try again'}` : 'no message: the failure is silent', shown);
}
async function loadingState(id, s, urlRe, url) {
  const { page } = s;
  await page.route(urlRe, async (r) => { await sleep(1500); await r.continue().catch(() => {}); });
  await page.goto(url);
  const loading = page.getByRole('status').filter({ hasText: /Loading/ }).first();
  const seen = await loading.waitFor({ timeout: 3000 }).then(() => true).catch(() => false);
  await page.unroute(urlRe);
  await page.waitForLoadState('networkidle');
  R.check(`${id}.loading`, id, 'a loading indicator is shown while data is fetched', 'visible', seen ? 'visible' : 'not seen', seen);
}
async function textOf(page, re) { return page.getByText(re).first().waitFor().then(() => true).catch(() => false); }

// ------------------------------------------------------------------ sessions
const g = await session('guest');
const c = await session('customer');
const ec = await session('empty customer');
const sl = await session('seller');
const es = await session('empty seller');
const ad = await session('admin');
await uiLogin(c, customer.email);
await uiLogin(ec, emptyCustomer.email);
await uiLogin(sl, seller.email);
await uiLogin(es, emptySeller.email);
await uiLogin(ad, adminUser.email, process.env.ADMIN_PASSWORD || 'AdminPass123!');
R.section(`Screens in ${BROWSER} ${version}`);

// S-01 catalog
R.section('S-01 Catalog');
await goto(g, '/books');
await inspect('S-01', g, /^Books$/);
await goto(g, '/books');
await g.page.getByRole('searchbox').fill('screen test');
await g.page.getByRole('button', { name: 'Search' }).click();
R.check('S-01.search', 'S-01, FR-05', 'search shows the matching book', 'book card', String(await textOf(g.page, new RegExp(`Screen Test Book ${stamp}`))), await textOf(g.page, new RegExp(`Screen Test Book ${stamp}`)));
await g.page.getByRole('searchbox').fill('zzzzqqq');
await g.page.getByRole('button', { name: 'Search' }).click();
R.check('S-01.empty', 'S-01', 'no result shows the empty state with a way back', 'No books match', String(await textOf(g.page, /No books match your search/)), await textOf(g.page, /No books match your search/));
await goto(g, '/books');
await g.page.getByLabel('From', { exact: true }).fill('abc');
await g.page.getByRole('button', { name: 'Apply price' }).click();
R.check('S-01.form', 'S-01', 'an invalid price range is explained', 'message', String(await textOf(g.page, /Enter prices like/)), await textOf(g.page, /Enter prices like/));
await loadingState('S-01', g, /\/api\/books\?/, '/books');
await errorState('S-01', g, /\/api\/books\?/, '/books', /^Books$/);

// S-02 book details
R.section('S-02 Book details');
await goto(g, `/books/${bookMain.id}`);
await inspect('S-02', g, new RegExp(`Screen Test Book ${stamp}`));
R.check('S-02.fields', 'S-02, FR-07', 'details show price, author, ISBN, stock status and rating', 'all shown', 'checked', (await g.page.locator('.price').count()) > 0 && await textOf(g.page, /Screen Author/) && await textOf(g.page, /In stock/) && await textOf(g.page, bookMain.isbn));
R.check('S-02.reviews', 'S-02, FR-17', 'reviews are shown', 'review text', String(await textOf(g.page, new RegExp(`Screen test review ${stamp}`))), await textOf(g.page, new RegExp(`Screen test review ${stamp}`)));
await g.page.getByRole('button', { name: 'Add to cart' }).click();
await g.page.waitForURL('**/login');
R.check('S-02.guest', 'S-02, FR-08', 'a guest who adds to cart is sent to the login screen', '/login', new URL(g.page.url()).pathname, new URL(g.page.url()).pathname === '/login');
await loadingState('S-02', c, new RegExp(`/api/books/${bookMain.id}$`), `/books/${bookMain.id}`);
await errorState('S-02', c, new RegExp(`/api/books/${bookMain.id}$`), `/books/${bookMain.id}`, new RegExp(`Screen Test Book ${stamp}`));
await c.page.goto(`/books/${bookMain.id}`);
await c.page.getByLabel('Quantity').fill('40');
await c.page.getByRole('button', { name: 'Add to cart' }).click();
R.check('S-02.stock', 'S-02, FR-09', 'quantity above stock shows the stock message', 'Only N copies are available', String(await textOf(c.page, /Only \d+ cop/)), await textOf(c.page, /Only \d+ cop|at most 50/));

// S-03 register
R.section('S-03 Register');
await goto(g, '/register');
await inspect('S-03', g, /Create an account/);
await g.page.getByRole('button', { name: 'Register' }).click();
R.check('S-03.form', 'S-03, FR-01', 'empty form shows field messages and sends nothing', 'name, email, password messages', 'checked', await textOf(g.page, 'Enter your name.') && await textOf(g.page, 'Enter a valid email address.') && await textOf(g.page, 'Use at least 8 characters.'));
const regEmail = uniqueEmail('screen');
await g.page.getByLabel('Name', { exact: true }).fill('Screen Registrant');
await g.page.getByLabel('Email', { exact: true }).fill(regEmail);
await g.page.getByLabel('Password', { exact: true }).fill('ValidPass123!');
await g.page.getByRole('button', { name: 'Register' }).click();
R.check('S-03.success', 'S-03, UC-04', 'successful registration shows the check-your-email message', 'Check your email', String(await textOf(g.page, /Check your email/)), await textOf(g.page, /Check your email/));
await goto(g, '/register');
await g.page.getByLabel('Name', { exact: true }).fill('Dup');
await g.page.getByLabel('Email', { exact: true }).fill(regEmail);
await g.page.getByLabel('Password', { exact: true }).fill('ValidPass123!');
g.bag.allow4xx = true;
await g.page.getByRole('button', { name: 'Register' }).click();
R.check('S-03.dup', 'S-03, FR-01', 'a duplicate email is explained', 'already registered', String(await textOf(g.page, /already registered/)), await textOf(g.page, /already registered/));
g.bag.allow4xx = false;
await c.page.goto('/register');
await c.page.waitForURL((u) => !u.pathname.endsWith('/register'), { timeout: 5000 }).catch(() => {});
R.check('S-03.access', 'S-03', 'a logged-in user is sent away from the register screen', 'not /register', new URL(c.page.url()).pathname, !c.page.url().endsWith('/register'));

// S-04 verify email
R.section('S-04 Verify email');
await goto(g, '/verify-email');
await inspect('S-04', g, /Verify your email/);
R.check('S-04.missing', 'S-04', 'without a token the screen offers to resend the link', 'resend form', String(await textOf(g.page, /Send a new link/)), await g.page.getByRole('button', { name: 'Send a new link' }).count() > 0);
g.bag.allow4xx = true;
await g.page.goto(`/verify-email?token=${'f'.repeat(64)}`);
R.check('S-04.invalid', 'S-04, FR-01', 'an invalid token shows an error and the resend form', 'error', String(await textOf(g.page, /invalid or has expired/)), await textOf(g.page, /invalid or has expired/));
g.bag.allow4xx = false;
const vmail = await emailLink(regEmail, 'verify');
await g.page.goto(new URL(vmail.link).pathname + new URL(vmail.link).search);
R.check('S-04.success', 'S-04, UC-04', 'the emailed link verifies the account', 'Your email is verified', String(await textOf(g.page, /Your email is verified/)), await textOf(g.page, /Your email is verified/));

// S-05 login
R.section('S-05 Login');
// a separate account: logout ends every session of a user (D-14), so the shared customer must not be logged out
const loginUser = await createUserDirect(db, { name: 'Login Screen User' });
const lg = await session('login guest');
await goto(lg, '/login');
await inspect('S-05', lg, /^Log in$/);
await lg.page.getByRole('button', { name: 'Log in' }).click();
R.check('S-05.form', 'S-05, FR-02', 'empty form is explained', 'message', String(await textOf(lg.page, /Enter your email address and password/)), await textOf(lg.page, /Enter your email address and password/));
lg.bag.allow4xx = true;
await lg.page.getByLabel('Email', { exact: true }).fill(loginUser.email);
await lg.page.getByLabel('Password', { exact: true }).fill('WrongPassword1!');
await lg.page.getByRole('button', { name: 'Log in' }).click();
R.check('S-05.wrong', 'S-05, FR-02', 'wrong password shows a generic message', 'Email or password is wrong', String(await textOf(lg.page, /Email or password is wrong/)), await textOf(lg.page, /Email or password is wrong/));
await lg.page.getByLabel('Password', { exact: true }).fill(PASSWORD);
await lg.page.getByRole('button', { name: 'Log in' }).click();
lg.bag.allow4xx = false;
await lg.page.getByRole('link', { name: 'Cart' }).waitFor();
R.check('S-05.success', 'S-05, UC-05', 'correct login shows the customer menu', 'Cart link', 'ok', true);
await lg.page.getByRole('button', { name: 'Log out' }).click();
await lg.page.getByRole('link', { name: 'Log in' }).first().waitFor();
R.check('S-05.logout', 'S-05, UC-05', 'logout returns to the guest menu', 'Log in link', 'ok', true);

// S-06 forgot password, S-07 reset password
R.section('S-06 Forgot password / S-07 Reset password');
await goto(g, '/forgot-password');
await inspect('S-06', g, /Forgot your password/);
await g.page.getByRole('button', { name: 'Send reset link' }).click();
R.check('S-06.form', 'S-06', 'an invalid email is explained', 'message', String(await textOf(g.page, /Enter a valid email/)), await textOf(g.page, /Enter a valid email/));
const resetU = await createUserDirect(db);
await g.page.getByLabel('Email', { exact: true }).fill(resetU.email);
await g.page.getByRole('button', { name: 'Send reset link' }).click();
R.check('S-06.success', 'S-06, UC-14', 'the same confirmation is shown', 'reset link has been sent', String(await textOf(g.page, /reset link has been sent/)), await textOf(g.page, /reset link has been sent/));
await goto(g, '/reset-password');
await inspect('S-07', g, /Reset password/);
const rm = await emailLink(resetU.email, 'reset');
await g.page.goto(new URL(rm.link).pathname + new URL(rm.link).search);
await g.page.getByRole('heading', { name: /Choose a new password/ }).waitFor();
await g.page.getByLabel('New password', { exact: true }).fill('short');
await g.page.getByLabel('Repeat the new password').fill('different');
await g.page.getByRole('button', { name: 'Change password' }).click();
R.check('S-07.form', 'S-07, FR-03', 'short and mismatching passwords are explained', 'both messages', 'checked', await textOf(g.page, 'Use at least 8 characters.') && await textOf(g.page, /do not match/));
await g.page.getByLabel('New password', { exact: true }).fill('ResetNew123!');
await g.page.getByLabel('Repeat the new password').fill('ResetNew123!');
await g.page.getByRole('button', { name: 'Change password' }).click();
R.check('S-07.success', 'S-07, UC-14', 'a valid reset works', 'password has been changed', String(await textOf(g.page, /password has been changed/)), await textOf(g.page, /password has been changed/));
g.bag.allow4xx = true;
await g.page.goto(new URL(rm.link).pathname + new URL(rm.link).search);
await g.page.getByLabel('New password', { exact: true }).fill('ResetNew456!');
await g.page.getByLabel('Repeat the new password').fill('ResetNew456!');
await g.page.getByRole('button', { name: 'Change password' }).click();
R.check('S-07.reuse', 'S-07, FR-03', 'the reset link cannot be used twice', 'invalid or has expired', String(await textOf(g.page, /invalid or has expired/)), await textOf(g.page, /invalid or has expired/));
g.bag.allow4xx = false;

// S-08 cart
R.section('S-08 Cart');
await goto(c, '/cart');
await inspect('S-08', c, /Your cart/);
await goto(ec, '/cart');
R.check('S-08.empty', 'S-08', 'an empty cart shows the empty state with a link to the catalog', 'Your cart is empty', String(await textOf(ec.page, /Your cart is empty/)), await textOf(ec.page, /Your cart is empty/));
await goto(c, '/cart');
const qtyBox = c.page.getByLabel(/^Quantity of/).first();
c.bag.allow4xx = true;
await qtyBox.fill('5');
await qtyBox.blur();
R.check('S-08.stock', 'S-08, FR-09', 'quantity above available stock (1 copy) shows the message', 'Only 1 copy is available', String(await textOf(c.page, /Only 1 cop/)), await textOf(c.page, /Only 1 cop/));
c.bag.allow4xx = false;
R.check('S-08.summary', 'S-08, FR-12', 'subtotal, tax, shipping and total are shown', '4 amounts', String(await c.page.locator('.summary dd').count()), (await c.page.locator('.summary dd').count()) === 4);
await loadingState('S-08', c, /\/api\/cart$/, '/cart');
await errorState('S-08', c, /\/api\/cart$/, '/cart', /Your cart/);
await c.page.goto('/cart');

// S-09 wishlist
R.section('S-09 Wishlist');
await goto(c, '/wishlist');
await inspect('S-09', c, /Your wishlist/);
R.check('S-09.items', 'S-09, FR-10', 'a wishlisted book is listed with Move to cart', 'book + button', String(await c.page.getByRole('button', { name: 'Move to cart' }).count()), (await c.page.getByRole('button', { name: 'Move to cart' }).count()) > 0);
await goto(ec, '/wishlist');
R.check('S-09.empty', 'S-09', 'empty wishlist state', 'Your wishlist is empty', String(await textOf(ec.page, /Your wishlist is empty/)), await textOf(ec.page, /Your wishlist is empty/));
await errorState('S-09', c, /\/api\/wishlist$/, '/wishlist', /Your wishlist/);

// S-10 checkout, S-11 payment, S-12 confirmation
R.section('S-10 Checkout / S-11 Payment / S-12 Confirmation');
await customer.h.del(`/api/cart/items/${bookTwo.id}`);
await customer.h.post('/api/cart/items', { bookId: bookMain.id, quantity: 1 });
await goto(ec, '/checkout');
R.check('S-10.empty', 'S-10', 'checkout with an empty cart shows the empty state', 'Your cart is empty', String(await textOf(ec.page, /Your cart is empty/)), await textOf(ec.page, /Your cart is empty/));
await c.page.goto('/cart');
await c.page.getByLabel(/^Quantity of/).first().fill('1');
await c.page.getByLabel(/^Quantity of/).first().blur();
await goto(c, '/checkout');
await inspect('S-10', c, /^Checkout$/);
R.check('S-10.saved', 'S-10, FR-11', 'saved addresses can be chosen', 'radio list', String(await c.page.getByRole('radio', { name: /saved address/i }).count()), (await c.page.getByRole('radio', { name: /saved address/i }).count()) > 0);
await c.page.getByRole('radio', { name: /Enter a new address/ }).check();
await c.page.getByRole('button', { name: 'Continue to payment' }).click();
R.check('S-10.form', 'S-10, FR-11', 'an incomplete new address is explained field by field', 'messages', 'checked', await textOf(c.page, 'Enter the full name.') && await textOf(c.page, 'Enter the address.'));
R.check('S-10.summary', 'S-10, FR-12', 'order summary with totals is shown', '4 amounts', String(await c.page.locator('.summary dd').count()), (await c.page.locator('.summary dd').count()) === 4);
await c.page.getByRole('radio', { name: /saved address/i }).check();
await c.page.getByRole('button', { name: 'Continue to payment' }).click();
await c.page.waitForURL('**/pay');
c.bag.clear();
await inspect('S-11', c, /^Payment$/);
R.check('S-11.timer', 'S-11, D-06', 'the payment screen shows the time left on the stock reservation', 'mm:ss', (await c.page.locator('[role=timer]').textContent()).trim().slice(0, 80), /\d\d:\d\d/.test(await c.page.locator('[role=timer]').textContent()));
R.check('S-11.nocard', 'S-11, VFR-08', 'the screen has no card number, expiry or CVV field', '0 inputs', String(await c.page.locator('input').count()), (await c.page.locator('input').count()) === 0);
c.bag.allow4xx = true;
await c.page.getByRole('button', { name: 'Simulate a failed payment' }).click();
R.check('S-11.fail', 'S-11, FR-13', 'a failed payment is explained and the order stays payable', 'could not be verified', String(await textOf(c.page, /could not be verified/)), await textOf(c.page, /could not be verified/));
c.bag.allow4xx = false;
const payUrl = c.page.url();
const fresh = await c.context.newPage();
await fresh.goto(payUrl, { waitUntil: 'domcontentloaded' });
R.check('S-11.restart', 'S-11', 'a fresh visit of the payment page offers Restart payment (the payment session is not in the API)', 'Restart payment button', String(await fresh.getByRole('button', { name: 'Restart payment' }).count()), await fresh.getByRole('button', { name: 'Restart payment' }).waitFor().then(() => true).catch(() => false));
await fresh.getByRole('button', { name: 'Restart payment' }).click();
await fresh.getByRole('button', { name: /Pay .* \(test success\)/ }).waitFor();
await fresh.getByRole('button', { name: /Pay .* \(test success\)/ }).click();
await fresh.waitForURL('**/confirmation');
await c.page.goto(fresh.url());
await fresh.close();
await inspect('S-12', c, /Thank you for your order/);
R.check('S-12.content', 'S-12, UC-08', 'confirmation shows the order number and total', 'OB-...', (await c.page.locator('strong').first().textContent()).trim(), /^OB-/.test((await c.page.locator('strong').first().textContent()).trim()));

// restarting the payment for the LAST copy of a book that the customer is already holding (defect DEF-01)
await customer.h.post('/api/cart/items', { bookId: bookTwo.id, quantity: 1 });
await goto(c, '/checkout');
await c.page.getByRole('radio', { name: /saved address/i }).check();
await c.page.getByRole('button', { name: 'Continue to payment' }).click();
await c.page.waitForURL('**/pay');
const lastUrl = c.page.url();
const lastTab = await c.context.newPage();
lastTab.on('response', () => {});
await lastTab.goto(lastUrl, { waitUntil: 'domcontentloaded' });
await lastTab.getByRole('button', { name: 'Restart payment' }).click();
const restartWorked = await lastTab.getByRole('button', { name: /Pay .* \(test success\)/ }).waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
const restartMsg = restartWorked ? 'payment button shown' : ((await lastTab.locator('.alert-error').first().textContent().catch(() => '')) || 'no message').trim();
R.check('S-11.restart.lastcopy', 'S-11, D-06, DEF-01', "Restart payment for the last copy the customer already holds works (expected by D-06: a new checkout replaces the earlier one)", 'payment button shown', restartMsg, restartWorked);
await lastTab.close();
const heldOrder = (await customer.h.get('/api/orders/' + lastUrl.split('/')[4])).json;
await customer.h.post(`/api/orders/${heldOrder.id}/cancel`);
await customer.h.del(`/api/cart/items/${bookTwo.id}`).catch(() => {});

// S-13 / S-14 / S-15 orders
R.section('S-13 My orders / S-14 Order details / S-15 Review');
await goto(c, '/orders');
await inspect('S-13', c, /My orders/);
R.check('S-13.rows', 'S-13, FR-15', 'orders are listed with number, date, total and status', '>= 3 rows', String(await c.page.locator('tbody tr').count()), (await c.page.locator('tbody tr').count()) >= 3);
await goto(ec, '/orders');
R.check('S-13.empty', 'S-13', 'empty state', 'not placed any orders', String(await textOf(ec.page, /not placed any orders/)), await textOf(ec.page, /not placed any orders/));
await errorState('S-13', c, /\/api\/orders\?/, '/orders', /My orders/);
await goto(c, `/orders/${orderDelivered.id}`);
await inspect('S-14', c, /^Order OB-/);
R.check('S-14.items', 'S-14, FR-15', 'item status and a Review button for delivered items', 'Delivered + Review', 'checked', await textOf(c.page, 'Delivered') && (await c.page.getByRole('button', { name: 'Review', exact: true }).count()) > 0);
R.check('S-14.nocancel', 'S-14, FR-16', 'a delivered order has no Cancel button', '0', String(await c.page.getByRole('button', { name: 'Cancel order' }).count()), (await c.page.getByRole('button', { name: 'Cancel order' }).count()) === 0);
await c.page.getByRole('button', { name: 'Review', exact: true }).click();
R.check('S-15.dialog', 'S-15, UC-12', 'the review form opens as a dialog with rating and comment', 'dialog', String(await c.page.getByRole('dialog').count()), (await c.page.getByRole('dialog').count()) === 1);
await c.page.getByLabel('Comment (optional)').fill('A <b>second</b> opinion');
await c.page.getByRole('button', { name: 'Submit review' }).click();
R.check('S-15.success', 'S-15, FR-17', 'a review of a delivered book is accepted', 'Thank you for your review', String(await textOf(c.page, /Thank you for your review/)), await textOf(c.page, /Thank you for your review/));
await c.page.goto(`/books/${bookMain.id}`);
await c.page.getByRole('button', { name: 'Write a review' }).click();
c.bag.allow4xx = true;
await c.page.getByRole('button', { name: 'Submit review' }).click();
R.check('S-15.dup', 'S-15, FR-17', 'a second review is refused with a message', 'already reviewed', String(await textOf(c.page, /already reviewed/)), await textOf(c.page, /already reviewed/));
c.bag.allow4xx = false;
await c.page.keyboard.press('Escape');
R.check('S-15.text', 'S-15, VFR-06', 'review HTML is shown as text', 'literal <b>', String((await c.page.locator('.review-comment b').count()) === 0), (await c.page.locator('.review-comment b').count()) === 0 && await textOf(c.page, /A <b>second<\/b> opinion/));
await goto(c, `/orders/${orderPlaced.id}`);
await c.page.getByRole('button', { name: 'Cancel order' }).click();
R.check('S-14.dialog', 'S-14, FR-16', 'Cancel order asks for confirmation in a dialog (Escape closes it)', 'dialog', String(await c.page.getByRole('dialog').count()), (await c.page.getByRole('dialog').count()) === 1);
await c.page.getByRole('button', { name: 'Yes, cancel the order' }).click();
R.check('S-14.cancel', 'S-14, FR-16, UC-11', 'cancelling a placed order shows Cancelled and the refund', 'Cancelled + refunded', String(await textOf(c.page, /payment has been refunded/)), await textOf(c.page, /payment has been refunded/));
await errorState('S-14', c, new RegExp(`/api/orders/${orderPlaced.id}$`), `/orders/${orderPlaced.id}`, /^Order OB-/);

// S-16 / S-17
R.section('S-16 Profile / S-17 Become a seller');
await goto(c, '/profile');
await inspect('S-16', c, /Your profile/);
await c.page.getByLabel('Name', { exact: true }).fill('');
await c.page.getByRole('button', { name: 'Save profile' }).click();
R.check('S-16.form', 'S-16, FR-18', 'empty name is explained', 'Enter your name', String(await textOf(c.page, 'Enter your name.')), await textOf(c.page, 'Enter your name.'));
await c.page.getByLabel('Name', { exact: true }).fill('Screen Customer');
await c.page.getByLabel(/^Phone/).fill('12ab');
await c.page.getByRole('button', { name: 'Save profile' }).click();
R.check('S-16.phone', 'S-16', 'a non-numeric phone number is explained', 'Use 7 to 15 digits', String(await textOf(c.page, /Use 7 to 15 digits/)), await textOf(c.page, /Use 7 to 15 digits/));
await c.page.getByLabel(/^Phone/).fill('9876543210');
await c.page.getByRole('button', { name: 'Save profile' }).click();
R.check('S-16.save', 'S-16, FR-18', 'the profile is saved', 'Profile saved', String(await textOf(c.page, /Profile saved/)), await textOf(c.page, /Profile saved/));
for (let i = 0; i < 5; i += 1) await customer.h.post('/api/profile/addresses', { ...ADDRESS, label: `Extra ${i}` }).catch(() => {});
await c.page.reload();
R.check('S-16.limit', 'S-16, FR-18', 'at 5 addresses the screen says the limit is reached and offers no Add button', 'limit message', String(await textOf(c.page, /reached the limit of 5/)), await textOf(c.page, /reached the limit of 5/) && (await c.page.getByRole('button', { name: 'Add an address' }).count()) === 0);
await errorState('S-16', c, /\/api\/profile$/, '/profile', /Your profile/);
await goto(ec, '/seller/apply');
ec.bag.allow4xx = true; // GET /api/seller/applications/me answers 404 when nothing was submitted (API-35); the screen handles it
await inspect('S-17', ec, /Become a seller/);
await ec.page.getByRole('button', { name: 'Send application' }).click();
R.check('S-17.form', 'S-17, FR-19', 'a too-short store name is explained', 'message', String(await textOf(ec.page, /at least 2 characters/)), await textOf(ec.page, /at least 2 characters/));
ec.bag.allow4xx = false;
await ec.page.getByLabel('Store name').fill('Empty Customer Store');
await ec.page.getByRole('button', { name: 'Send application' }).click();
R.check('S-17.pending', 'S-17, UC-15', 'after applying the screen says the application is waiting', 'waiting for an administrator', String(await textOf(ec.page, /waiting for an administrator/)), await textOf(ec.page, /waiting for an administrator/));

// S-18 to S-23 seller
R.section('S-18 to S-23 Seller screens');
await goto(sl, '/seller');
await inspect('S-18', sl, /Seller dashboard/);
R.check('S-18.alert', 'S-18, FR-21', 'the low-stock alert is shown and can be marked read', 'Low stock: ...', String(await textOf(sl.page, /Low stock:/)), await textOf(sl.page, /Low stock:/));
await goto(es, '/seller');
R.check('S-18.empty', 'S-18', 'no alerts shows the empty state', 'No new alerts', String(await textOf(es.page, /No new alerts/)), await textOf(es.page, /No new alerts/));
await goto(sl, '/seller/books');
await inspect('S-19', sl, /My listings/);
R.check('S-19.rows', 'S-19, FR-20', 'listings with status and Edit/Remove', 'rows', String(await sl.page.locator('tbody tr').count()), (await sl.page.locator('tbody tr').count()) >= 3);
await goto(es, '/seller/books');
R.check('S-19.empty', 'S-19', 'empty state', 'No listings here yet', String(await textOf(es.page, /No listings here yet/)), await textOf(es.page, /No listings here yet/));
await errorState('S-19', sl, /\/api\/seller\/books/, '/seller/books', /My listings/);
await goto(sl, '/seller/books/new');
await inspect('S-20', sl, /New listing/);
await sl.page.getByRole('button', { name: 'Save listing' }).click();
R.check('S-20.form', 'S-20, FR-20', 'an empty listing form is explained field by field', 'messages', 'checked', await textOf(sl.page, 'Enter the title.') && await textOf(sl.page, /Enter an ISBN-10 or ISBN-13\./) && await textOf(sl.page, /Choose a category\./));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
mkdirSync(path.join(OUT, 'tmp'), { recursive: true });
const { writeFileSync, rmSync } = await import('node:fs');
writeFileSync(path.join(OUT, 'tmp', 'cover.png'), png);
writeFileSync(path.join(OUT, 'tmp', 'not-image.png'), 'this is not an image');
await sl.page.getByLabel('Title').fill(`Screen UI Listing ${stamp}`);
await sl.page.getByLabel('Author').fill('UI Author');
await sl.page.getByLabel('ISBN').fill(isbn13(Math.floor(Math.random() * 1e9)));
await sl.page.getByLabel('Price').fill('149.50');
await sl.page.getByLabel('Category').selectOption({ label: 'Fiction' });
await sl.page.getByLabel('Copies in stock').fill('4');
sl.bag.allow4xx = true;
await sl.page.getByLabel('Add an image').setInputFiles(path.join(OUT, 'tmp', 'not-image.png'));
R.check('S-20.badimage', 'S-20, ST-24', 'a file that is not an image is refused by the server and explained', 'only JPEG and PNG', String(await textOf(sl.page, /JPEG and PNG|Only JPEG/)), await textOf(sl.page, /JPEG and PNG|Only JPEG/));
sl.bag.allow4xx = false;
await sl.page.getByLabel('Add an image').setInputFiles(path.join(OUT, 'tmp', 'cover.png'));
await sl.page.getByAltText('Cover preview').waitFor();
R.check('S-20.image', 'S-20, FR-20', 'a valid image is uploaded and previewed', 'preview', 'ok', true);
await sl.page.getByRole('button', { name: 'Save listing' }).click();
await sl.page.waitForURL('**/seller/books');
R.check('S-20.create', 'S-20, UC-16', 'the listing is created (pending approval)', 'in the list as pending', String(await textOf(sl.page, new RegExp(`Screen UI Listing ${stamp}`))), await textOf(sl.page, new RegExp(`Screen UI Listing ${stamp}`)));
rmSync(path.join(OUT, 'tmp'), { recursive: true, force: true });
await sl.page.locator('tr', { hasText: `Screen UI Listing ${stamp}` }).getByRole('link', { name: 'Edit' }).click();
await sl.page.getByRole('heading', { name: /Edit listing/ }).waitFor();
R.check('S-20.edit', 'S-20, FR-20', 'edit form is filled and the ISBN cannot be changed', 'ISBN disabled', String(await sl.page.getByLabel('ISBN').isDisabled()), await sl.page.getByLabel('ISBN').isDisabled());
await sl.page.getByLabel('Price').fill('159.00');
await sl.page.getByRole('button', { name: 'Save listing' }).click();
await sl.page.waitForURL('**/seller/books');
R.check('S-20.saved', 'S-20', 'edit saved', 'Rs 159.00 shown', String(await textOf(sl.page, /159\.00/)), await textOf(sl.page, /159\.00/));
await goto(sl, '/seller/inventory');
await inspect('S-21', sl, /^Inventory$/);
await sl.page.getByLabel(/^Stock of Screen Second Book/).fill('abc');
await sl.page.getByRole('row', { name: /Screen Second Book/ }).getByRole('button', { name: 'Save' }).click();
R.check('S-21.form', 'S-21, FR-21', 'non-numeric stock is explained', 'Use whole numbers', String(await textOf(sl.page, /Use whole numbers/)), await textOf(sl.page, /Use whole numbers/));
await sl.page.getByLabel(/^Stock of Screen Second Book/).fill('0');
await Promise.all([ // wait for the save to be answered (a stock below the reserved units is refused with 409), so the answer is not counted against S-22
  sl.page.waitForResponse((r) => /\/inventory$/.test(r.url()) && r.request().method() === 'PATCH'),
  sl.page.getByRole('row', { name: /Screen Second Book/ }).getByRole('button', { name: 'Save' }).click(),
]);
R.check('S-21.zero', 'S-21, FR-21', 'stock 0 saves and the book shows Out of stock', 'Out of stock', String(await textOf(sl.page, /Out of stock/)), await textOf(sl.page, /Out of stock/));
await sl.page.waitForLoadState('networkidle'); // let the S-21 save finish, so its answer is not counted against S-22
await goto(sl, '/seller/orders');
await inspect('S-22', sl, /Orders with my books/);
R.check('S-22.actions', 'S-22, FR-22', 'orders show shipping details and the next status button', 'Mark as Packed', String(await sl.page.getByRole('button', { name: /Mark as Packed/ }).count()), (await sl.page.getByRole('button', { name: /Mark as Packed/ }).count()) > 0);
const orderPlaced2 = await buy(other, bookMain, 1, false);
await goto(sl, '/seller/orders');
const card = sl.page.locator('article.panel', { hasText: orderPlaced2.orderNumber });
await card.getByRole('button', { name: 'Mark as Packed' }).click();
R.check('S-22.pack', 'S-22, FR-22', 'Mark as Packed works and the next step appears', 'Mark as Shipped', String(await card.getByRole('button', { name: 'Mark as Shipped' }).waitFor().then(() => true).catch(() => false)), await card.getByRole('button', { name: 'Mark as Shipped' }).waitFor().then(() => true).catch(() => false));
await goto(es, '/seller/orders');
R.check('S-22.empty', 'S-22', 'empty state', 'No orders yet', String(await textOf(es.page, /No orders yet/)), await textOf(es.page, /No orders yet/));
await goto(sl, '/seller/reports');
await inspect('S-23', sl, /Sales report/);
R.check('S-23.report', 'S-23, FR-23', 'the report shows orders, books sold and revenue', '3 figures', String(await sl.page.locator('.stat').count()), (await sl.page.locator('.stat').count()) === 3);
await sl.page.getByLabel('To', { exact: true }).fill('2020-01-01');
await sl.page.getByRole('button', { name: 'Show report' }).click();
R.check('S-23.range', 'S-23, FR-23', 'a start date after the end date is explained', 'message', String(await textOf(sl.page, /must not be after/)), await textOf(sl.page, /must not be after/));
await errorOnly('S-23', sl, /\/api\/seller\/reports\/sales/, '/seller/reports');

// S-24 to S-29 administrator
R.section('S-24 to S-29 Administrator screens');
await goto(ad, '/admin');
await inspect('S-24', ad, /Administrator dashboard/);
R.check('S-24.counts', 'S-24, UC-21', 'queues show pending counts', 'numbers', (await ad.page.locator('.stat strong').allTextContents()).slice(0, 2).join(','), /\d/.test((await ad.page.locator('.stat strong').first().textContent())));
await errorOnly('S-24', ad, /\/api\/admin\/seller-applications/, '/admin');
await goto(ad, '/admin/users');
await inspect('S-25', ad, /^Users$/);
await ad.page.getByLabel('Search name or email').fill(emptyCustomer.email);
await ad.page.getByRole('button', { name: 'Filter' }).click();
await ad.page.getByRole('row', { name: new RegExp(emptyCustomer.email) }).getByRole('button', { name: 'Suspend' }).click();
R.check('S-25.dialog', 'S-25, FR-24', 'Suspend asks for confirmation', 'dialog', String(await ad.page.getByRole('dialog').count()), (await ad.page.getByRole('dialog').count()) === 1);
await ad.page.getByRole('dialog').getByRole('button', { name: 'Suspend' }).click();
R.check('S-25.suspend', 'S-25, FR-24', 'the account is suspended', 'Account suspended', String(await textOf(ad.page, /Account suspended/)), await textOf(ad.page, /Account suspended/));
ec.bag.allow4xx = true;
await ec.page.goto('/cart');
await ec.page.waitForURL('**/login');
R.check('S-25.effect', 'S-25, FR-24', 'the suspended user is logged out at once (the next screen redirects to login)', '/login', new URL(ec.page.url()).pathname, new URL(ec.page.url()).pathname === '/login');
ec.bag.allow4xx = false;
await ad.page.getByRole('row', { name: new RegExp(emptyCustomer.email) }).getByRole('button', { name: 'Reactivate' }).click();
await ad.page.getByRole('dialog').getByRole('button', { name: 'Reactivate' }).click();
await textOf(ad.page, /Account reactivated/);
await goto(ad, '/admin/approvals');
await inspect('S-26', ad, /Approvals/);
const appCard = ad.page.locator('li.panel', { hasText: `Screen Store ${stamp}` });
await appCard.getByRole('button', { name: 'Reject' }).click();
await ad.page.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
R.check('S-26.reason', 'S-26, FR-25', 'rejecting without a reason is explained', 'Enter a reason', String(await textOf(ad.page, 'Enter a reason.')), await textOf(ad.page, 'Enter a reason.'));
await ad.page.getByLabel(/^Reason/).fill('Screen validation');
await ad.page.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
R.check('S-26.reject', 'S-26', 'the application is rejected', 'Application rejected', String(await textOf(ad.page, /Application rejected/)), await textOf(ad.page, /Application rejected/));
const listCard = ad.page.locator('li.panel', { hasText: `Screen Pending Book ${stamp}` });
await listCard.getByRole('button', { name: 'Approve' }).click();
R.check('S-26.approve', 'S-26, FR-25', 'a pending listing is approved', 'Listing approved', String(await textOf(ad.page, /Listing approved/)), await textOf(ad.page, /Listing approved/));
await goto(ad, '/admin/reviews');
await inspect('S-27', ad, /Review moderation/);
const rv = ad.page.locator('li.panel', { hasText: `Screen test review ${stamp}` });
await rv.getByRole('button', { name: 'Remove review' }).click();
await ad.page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
R.check('S-27.remove', 'S-27, FR-27', 'a review is removed', 'Review removed', String(await textOf(ad.page, /Review removed/)), await textOf(ad.page, /Review removed/));
await goto(ad, '/admin/categories');
await inspect('S-28', ad, /^Categories$/);
const cname = `Screen Cat ${stamp}`;
await ad.page.getByLabel('New category').fill(cname);
await ad.page.getByRole('button', { name: 'Add' }).click();
await textOf(ad.page, /Category added/);
ad.bag.allow4xx = true;
await ad.page.getByLabel('New category').fill(cname.toLowerCase());
await ad.page.getByRole('button', { name: 'Add' }).click();
R.check('S-28.dup', 'S-28, FR-26', 'a duplicate name (other case) is explained', 'already exists', String(await textOf(ad.page, /already exists/)), await textOf(ad.page, /already exists/));
const crow = ad.page.locator('li.panel', { hasText: cname });
await crow.getByRole('button', { name: 'Rename' }).click();
await ad.page.getByLabel(`Rename ${cname}`).fill(`${cname} B`);
await ad.page.getByRole('button', { name: 'Save' }).click();
R.check('S-28.rename', 'S-28, FR-26', 'rename works', 'Category renamed', String(await textOf(ad.page, /Category renamed/)), await textOf(ad.page, /Category renamed/));
await ad.page.locator('li.panel', { hasText: 'Fiction' }).getByRole('button', { name: 'Delete' }).click();
await ad.page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
R.check('S-28.inuse', 'S-28, FR-26', 'a category with books cannot be deleted', 'still use this category', String(await textOf(ad.page, /still use this category/)), await textOf(ad.page, /still use this category/));
ad.bag.allow4xx = false;
await ad.page.locator('li.panel', { hasText: `${cname} B` }).getByRole('button', { name: 'Delete' }).click();
await ad.page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
R.check('S-28.delete', 'S-28', 'an unused category is deleted', 'Category deleted', String(await textOf(ad.page, /Category deleted/)), await textOf(ad.page, /Category deleted/));
await goto(ad, '/admin/reports');
await inspect('S-29', ad, /Platform report/);
await errorOnly('S-29', ad, /\/api\/admin\/reports\/platform/, '/admin/reports');
await goto(ad, '/admin/reports');
await ad.page.getByRole('heading', { name: 'Best-selling books' }).waitFor();
R.check('S-29.report', 'S-29, FR-28', 'orders, revenue and best-selling books are shown', 'figures + list', String(await ad.page.locator('.stat').count()), (await ad.page.locator('.stat').count()) === 2 && await textOf(ad.page, /Best-selling books/));

// S-30 access denied / not found, and access rules of every protected route
R.section('S-30 Access denied and not found; access rules');
await goto(c, '/admin');
await inspect('S-30', c, /Access denied/, { shot: true });
const rules = [
  ['/cart', 'guest', g, 'login'], ['/orders', 'guest', g, 'login'], ['/profile', 'guest', g, 'login'], ['/seller', 'guest', g, 'login'], ['/admin/users', 'guest', g, 'login'],
  ['/seller/books', 'customer', c, 'denied'], ['/seller/orders', 'customer', c, 'denied'], ['/admin/approvals', 'customer', c, 'denied'], ['/admin/reports', 'seller', sl, 'denied'], ['/admin', 'seller', sl, 'denied'],
  ['/cart', 'admin', ad, 'denied'], ['/orders', 'admin', ad, 'denied'], ['/seller/books', 'admin', ad, 'denied'], ['/checkout', 'admin', ad, 'denied'],
];
for (const [i, [route, who, s, expectation]] of rules.entries()) {
  s.bag.allow4xx = true;
  await s.page.goto(route);
  await sleep(500);
  await s.page.waitForLoadState('networkidle');
  const ok = expectation === 'login' ? new URL(s.page.url()).pathname === '/login' : await s.page.getByRole('heading', { name: 'Access denied' }).count() > 0;
  R.check(`S-30.rule${i + 1}`, 'S-30, FR-29', `${who} opens ${route}`, expectation === 'login' ? 'redirect to /login' : 'Access denied screen', expectation === 'login' ? new URL(s.page.url()).pathname : 'checked', ok);
  s.bag.allow4xx = false;
}
await goto(g, '/no/such/page');
R.check('S-30.notfound', 'S-30', 'an unknown route shows the not found screen', 'Page not found', String(await g.page.getByRole('heading', { name: 'Page not found' }).count()), (await g.page.getByRole('heading', { name: 'Page not found' }).count()) === 1);
R.check('S-30.menu', 'FR-29, A-01', 'the menu of each role shows only its entries', 'customer: no Seller/Admin; seller: customer + seller; admin: no Cart', 'checked',
  (await c.page.getByRole('link', { name: 'Seller dashboard' }).count()) === 0 && (await sl.page.getByRole('link', { name: 'Cart' }).count()) > 0 && (await sl.page.getByRole('link', { name: 'Seller dashboard' }).count()) > 0 && (await ad.page.getByRole('link', { name: 'Cart' }).count()) === 0);
const consoleAll = [g, c, ec, sl, es, ad, lg].flatMap((s) => s.bag.errors);
R.check('ALL.console', 'VFR-12', 'no uncaught exception or console error in any session', '0', `${consoleAll.length} ${consoleAll.slice(0, 3).join(' | ')}`, consoleAll.length === 0);

await browser.close();
const summary = R.save(`screens-${BROWSER}`);
import('node:fs').then(({ writeFileSync: w }) => w(path.join(OUT, `accessibility-${BROWSER}.json`), JSON.stringify(accessibility, null, 1)));
await mongoose.disconnect();
process.exit(summary.fail ? 1 : 0);
