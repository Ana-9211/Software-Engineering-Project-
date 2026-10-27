// Records the Sprint 1 demo video (about one minute) of the running application with Playwright video recording.
// Usage: SERVER_LOG=<server log> node validation/record-demo.mjs   (server on BASE_URL with demo data and the admin seeded)
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://localhost:5000';
const LOG = process.env.SERVER_LOG;
const EDGE = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = process.env.DEMO_OUT || path.join(process.cwd(), 'docs', 'demo');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@bookstore.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminPass123!';
mkdirSync(OUT, { recursive: true });
const stamp = Date.now();
const email = `demo.${stamp}@example.com`;
const PASSWORD = 'DemoCustomer123!';
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
const say = async (text, ms = 2500) => { await page.evaluate((t) => window.__caption && window.__caption(t), text).catch(() => {}); await wait(ms); };

try {
  await page.goto('/');
  await say('Online Bookstore: browse, search and buy books', 3000);
  await page.goto('/books');
  await page.locator('.book-card').first().waitFor();
  await say('Catalog: 20 books per page', 2500);
  await page.getByRole('searchbox').pressSequentially('hobb', { delay: 150 });
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByText('The Hobbit').first().waitFor();
  await say('Partial, case-insensitive search by title, author or ISBN', 3000);
  await page.getByRole('link', { name: 'The Hobbit' }).first().click();
  await page.getByRole('heading', { name: 'The Hobbit' }).waitFor();
  await say('Book details: price, stock status and rating', 3000);

  await page.goto('/register');
  await say('Register a new customer account', 1500);
  await page.getByLabel('Name').pressSequentially('Demo Customer', { delay: 60 });
  await page.getByLabel('Email').pressSequentially(email, { delay: 30 });
  await page.getByLabel('Password').pressSequentially(PASSWORD, { delay: 40 });
  await page.getByRole('button', { name: 'Register' }).click();
  await page.getByRole('heading', { name: 'Check your email' }).waitFor();
  await say('A verification email is sent before the first login', 2500);
  let link;
  for (let i = 0; i < 30 && !link; i += 1) {
    const blocks = readFileSync(LOG, 'utf8').split('--- email').filter((b) => b.includes(`To: ${email}`) && /verify/i.test(b));
    const m = blocks.length && /(https?:\/\/\S+\/verify-email\?token=[a-f0-9]+)/.exec(blocks[blocks.length - 1]);
    if (m) link = m[1]; else await wait(300);
  }
  if (!link) throw new Error('verification link not found in the server log');
  await page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await page.getByText('Your email is verified.').waitFor();
  await say('Email verified', 1500);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('link', { name: 'Cart' }).waitFor();
  await say('Logged in', 1200);

  await page.goto('/books?q=hobbit');
  await page.getByRole('link', { name: 'The Hobbit' }).first().click();
  await page.getByLabel('Quantity').fill('2');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.getByText('Added to your cart.').waitFor();
  await say('Add to cart (a quantity above the stock is rejected)', 2000);
  await page.goto('/cart');
  await page.getByRole('heading', { name: 'Your cart' }).waitFor();
  await say('Cart with subtotal, tax, shipping and total', 3000);

  await page.goto('/checkout');
  await page.getByLabel('Full name').fill('Demo Customer');
  await page.getByLabel('Address line 1').fill('12 MG Road');
  await page.getByLabel('City').fill('Bengaluru');
  await page.getByLabel('State').fill('Karnataka');
  await page.getByLabel('Postal code').fill('560001');
  await page.getByLabel('Phone').fill('9876543210');
  await say('Checkout: shipping address', 2000);
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.waitForURL('**/pay');
  await page.getByText(/Your books are reserved for/).waitFor();
  await say('Stock is reserved for 15 minutes while the customer pays', 3000);
  await page.getByRole('button', { name: /Pay .* \(test success\)/ }).click();
  await page.waitForURL('**/confirmation');
  await page.getByRole('heading', { name: 'Thank you for your order' }).waitFor();
  await say('Payment succeeded: order confirmed, email sent', 3000);
  await page.goto('/orders');
  await page.getByText('Placed').first().waitFor();
  await say('Order history and status tracking', 3000);

  // administrator
  await page.getByRole('button', { name: 'Menu' }).click().catch(() => {});
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.getByRole('link', { name: 'Log in' }).first().waitFor();
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('button', { name: 'Log out' }).waitFor();
  await page.goto('/admin');
  await say('Administrator dashboard', 3000);
  await page.goto('/admin/users');
  await say('Manage users: suspend and reactivate accounts', 3000);
  await page.goto('/admin/approvals');
  await say('Approve or reject seller applications', 3000);
  await page.goto('/admin/reports');
  await say('Platform reports: orders, revenue and best sellers', 3000);
  await say('Roles enforced: customer, seller and administrator', 2000);
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  if (video) { const p = await video.path(); renameSync(p, path.join(OUT, 'sprint1-demo.webm')); console.log('saved', path.join(OUT, 'sprint1-demo.webm')); }
}
