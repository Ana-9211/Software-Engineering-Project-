// Records the Sprint 2 demo video (about two minutes) of the finished application with Playwright video recording.
// Captions are drawn on the page, so the video needs no narration track.
// Usage (server on BASE_URL with the demo data and the administrator seeded):
//   ADMIN_PASSWORD=<password> node docs/demo/record-sprint2-demo.mjs
// The raw recording is a .webm; docs/demo/README.md shows the ffmpeg command that makes the .mp4.
import { mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://localhost:5000';
const EDGE = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = process.env.DEMO_OUT || path.join(process.cwd(), 'docs', 'demo');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@bookstore.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) throw new Error('Set ADMIN_PASSWORD to the password of the seeded administrator');
const DEMO_PASSWORD = 'Password123!';
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  baseURL: BASE,
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
});
await context.addInitScript(() => {
  const draw = () => {
    const text = sessionStorage.getItem('demoCaption');
    let el = document.getElementById('demo-caption');
    if (!text) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'demo-caption';
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:12px 20px;background:rgba(17,24,39,.92);color:#fff;font:600 20px system-ui,sans-serif;text-align:center;pointer-events:none';
      document.documentElement.appendChild(el);
    }
    el.textContent = text;
  };
  window.__caption = (t) => { sessionStorage.setItem('demoCaption', t); draw(); };
  document.addEventListener('DOMContentLoaded', draw);
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const say = async (text, ms = 2500) => { await page.evaluate((t) => window.__caption && window.__caption(t), text).catch(() => {}); await wait(Math.round(ms * 1.45)); };

async function login(email, password) {
  await context.clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('button', { name: 'Log out' }).waitFor();
}

try {
  await page.goto('/books');
  await page.locator('.book-card').first().waitFor();
  await say('Sprint 2: the finished Online Bookstore (MERN)', 3500);

  // FR-06 filters and sorting
  await page.getByLabel('Category').selectOption({ label: 'Science' });
  await page.waitForFunction(() => document.querySelectorAll('.book-card').length === 2);
  await say('FR-06: filter by category, price and rating, and sort', 3000);
  await page.getByLabel('Sort by').selectOption('price_desc');
  await say('Sorted by price, highest first', 2500);

  // FR-10 wishlist
  await login('customer@bookstore.local', DEMO_PASSWORD);
  await page.goto('/books?q=cosmos');
  await page.getByRole('link', { name: 'Cosmos' }).first().click();
  await page.getByRole('button', { name: 'Add to wishlist' }).click();
  await page.getByText('Added to your wishlist.').waitFor();
  await say('FR-10: add a book to the wishlist', 2500);
  await page.goto('/wishlist');
  await page.getByRole('heading', { name: /wishlist/i }).first().waitFor();
  await say('The wishlist keeps it until it is moved to the cart', 3000);

  // checkout, FR-11 to FR-14, with the restart of an open checkout (DEF-01)
  await page.goto('/books?q=matilda');
  await page.getByRole('link', { name: 'Matilda' }).first().click();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.getByText('Added to your cart.').waitFor();
  await page.goto('/checkout');
  await page.getByRole('heading', { name: 'Checkout' }).waitFor();
  await wait(1500);
  if (await page.getByLabel('Full name').isVisible()) {
    await page.getByLabel('Full name').fill('Demo Customer');
    await page.getByLabel('Address line 1').fill('12 MG Road');
    await page.getByLabel('City').fill('Bengaluru');
    await page.getByLabel('State').fill('Karnataka');
    await page.getByLabel('Postal code').fill('560001');
    await page.getByLabel('Phone').fill('9876543210');
    await page.getByLabel('Save this address to my profile').check();
  } else {
    await page.getByRole('radio', { name: /saved address/i }).first().check();
  }
  await say('FR-11: shipping address, saved to the address book', 2500);
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.waitForURL('**/pay');
  await page.getByText(/Your books are reserved for/).waitFor();
  await say('FR-30: stock is reserved while the customer pays', 3000);
  const payUrl = page.url();
  await page.goto('/cart'); // coming back by the saved link has lost the payment session
  await page.goto(payUrl);
  await page.getByRole('button', { name: 'Restart payment' }).click();
  await page.getByRole('button', { name: /Pay .* \(test success\)/ }).waitFor();
  await say('A checkout that holds the last copies can be restarted (DEF-01 fixed)', 3500);
  await page.getByRole('button', { name: /Pay .* \(test success\)/ }).click();
  await page.waitForURL('**/confirmation');
  await page.getByRole('heading', { name: 'Thank you for your order' }).waitFor();
  await say('FR-13, FR-14: paid on the test gateway, confirmation email sent', 3500);

  // FR-15 orders, FR-18 profile
  await page.goto('/orders');
  await page.getByText('Placed').first().waitFor();
  await say('FR-15: order history and status (FR-16: cancel until it ships)', 3000);
  await page.goto('/profile');
  await page.getByRole('heading', { name: /Saved addresses/ }).waitFor();
  await say('FR-18: profile and an address book of up to 5 addresses', 3000);

  // seller
  await login('seller@bookstore.local', DEMO_PASSWORD);
  await page.goto('/seller/inventory');
  await say('FR-21: seller inventory with reserved and available stock', 3500);
  await page.goto('/seller/reports');
  await page.getByRole('heading', { name: 'Sales report' }).waitFor();
  await page.getByText('books sold').waitFor();
  await say('FR-23: sales report for a date range', 3500);

  // administrator
  await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto('/admin/categories');
  const name = `Demo ${Date.now() % 100000}`;
  await page.getByLabel('New category').fill(name);
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByText('Category added.').waitFor();
  await say('FR-26: add, rename and delete categories (a category in use cannot be deleted)', 3500);
  await page.goto('/admin/reviews');
  await say('FR-27: remove inappropriate reviews', 3000);
  await page.goto('/admin/reports');
  await page.getByRole('heading', { name: 'Platform report' }).waitFor();
  await say('FR-28: platform report of orders, revenue and best sellers', 3500);

  // DEF-04 / DEF-05: error state with a retry
  await page.route('**/api/admin/reports/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'The service is not available.', details: [] } }) }));
  await page.getByRole('button', { name: 'Show report' }).click();
  await page.getByRole('button', { name: 'Try again' }).waitFor();
  await say('DEF-04/05: when the server fails the screen shows the error and a retry', 3500);
  await page.unroute('**/api/admin/reports/**');
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByText('orders', { exact: true }).first().waitFor();
  await say('Retry succeeds once the server is back', 2500);

  // measured results
  await page.goto('/books');
  await say('Checks: 526 server tests, 28 client tests, 41 browser steps, 257 live API checks, lint clean', 4500);
  await say('Measured: 100 users, 0% errors, catalog p95 about 60 to 90 ms; Lighthouse accessibility 100', 4500);
  await say('Security: stricter CSP, Permissions-Policy, HTTPS redirect, patched dependencies', 4000);
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  if (video) { const p = await video.path(); renameSync(p, path.join(OUT, 'sprint2-demo.webm')); console.log('saved', path.join(OUT, 'sprint2-demo.webm')); }
}
