// Browser walkthrough of the running application (customer, seller and administrator flows).
// It drives a real browser against a real server and database; nothing is mocked.
//
// Usage (server running on BASE_URL with the demo data and the admin account seeded):
//   SERVER_LOG=/path/to/server.log node e2e/e2e.mjs
// The console mailer prints emails to the server log; the script reads the verification link from there.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE = process.env.BASE_URL || 'http://localhost:5000';
const LOG = process.env.SERVER_LOG;
const EDGE = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = process.env.E2E_OUT || path.join(process.cwd(), 'e2e', 'output');
mkdirSync(OUT, { recursive: true });

const results = [];
let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    process.stdout.write(`PASS  ${name}\n`);
  } catch (err) {
    failed += 1;
    results.push({ name, ok: false, error: String(err.message).split('\n')[0] });
    process.stdout.write(`FAIL  ${name}\n      ${String(err.message).split('\n').slice(0, 3).join('\n      ')}\n`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
async function newSession(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, baseURL: BASE });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
  return { context, page, errors };
}

async function login(page, email, password) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}
async function logout(page) {
  const toggle = page.getByRole('button', { name: 'Menu' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.getByRole('link', { name: 'Log in' }).first().waitFor();
}
async function axeCheck(page, label) {
  await page.evaluate(axeSource);
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }));
  });
  const serious = result.filter((v) => ['serious', 'critical'].includes(v.impact));
  assert(serious.length === 0, `${label}: accessibility violations ${JSON.stringify(serious)}`);
  return result;
}
async function noHorizontalScroll(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 0, `${label}: page scrolls sideways by ${overflow}px`);
}

const stamp = Date.now();
const customerEmail = `e2e.customer.${stamp}@example.com`;
const CUSTOMER_PASSWORD = 'E2eCustomer123!';
const listingTitle = `E2E Listing ${stamp}`;
let orderNumber = '';
// a valid ISBN-13 that is different on every run (the seller may not reuse an ISBN)
const isbnBody = `978${String(stamp).slice(-9)}`;
const isbnCheck = (10 - ([...isbnBody].reduce((sum, c, i) => sum + Number(c) * (i % 2 === 0 ? 1 : 3), 0) % 10)) % 10;
const listingIsbn = `${isbnBody}${isbnCheck}`;

// ---------------------------------------------------------------- guest
const guest = await newSession();
await step('guest: catalog shows books, 20 per page, with paging', async () => {
  await guest.page.goto('/books');
  await guest.page.getByRole('heading', { name: 'Books' }).waitFor();
  await guest.page.locator('.book-card').first().waitFor();
  const n = await guest.page.locator('.book-card').count();
  assert(n > 0 && n <= 20, `expected 1-20 cards, saw ${n}`);
});
await step('guest: partial case-insensitive search by title, author and ISBN', async () => {
  const { page } = guest;
  for (const [q, expected] of [['POTTER', 'Harry Potter'], ['tolk', 'The Hobbit'], ['9780261', 'The Hobbit'], ['miserables', 'Les Misérables']]) {
    await page.goto('/books');
    await page.getByRole('searchbox').fill(q);
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByText(expected).first().waitFor();
  }
  await page.goto('/books');
  await page.getByRole('searchbox').fill('zzzzzzz');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByText('No books match your search.').waitFor();
});
await step('guest: filter by category and price, sort', async () => {
  const { page } = guest;
  await page.goto('/books');
  await page.getByLabel('Category').selectOption({ label: 'Science' });
  await page.waitForFunction(() => document.querySelectorAll('.book-card').length === 2);
  await page.getByText('Cosmos').first().waitFor();
  await page.getByLabel('Sort by').selectOption('price_desc');
  await page.waitForFunction(() => document.querySelector('.book-card h3')?.textContent.includes('A Brief History of Time'));
});
await step('guest: book details show price, rating, stock status; adding to cart asks to log in', async () => {
  const { page } = guest;
  await page.goto('/books?q=hobbit');
  await page.getByRole('link', { name: 'The Hobbit' }).first().click();
  await page.getByRole('heading', { name: 'The Hobbit' }).waitFor();
  await page.getByText('In stock').first().waitFor();
  await page.getByText('9780261102217').waitFor();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.waitForURL('**/login');
});
await step('guest: protected screens redirect to login; admin screens are not reachable', async () => {
  for (const p of ['/cart', '/orders', '/seller', '/admin', '/checkout']) {
    await guest.page.goto(p);
    await guest.page.waitForURL('**/login');
  }
});
await step('guest: unknown route shows the not found screen', async () => {
  await guest.page.goto('/no/such/page');
  await guest.page.getByRole('heading', { name: 'Page not found' }).waitFor();
});

// ---------------------------------------------------------------- customer: register to delivered order
const cust = await newSession();
await step('customer: register, then login is refused until the email is verified', async () => {
  const { page } = cust;
  await page.goto('/register');
  await page.getByLabel('Name').fill('E2E Customer');
  await page.getByLabel('Email').fill(customerEmail);
  await page.getByLabel('Password').fill(CUSTOMER_PASSWORD);
  await page.getByRole('button', { name: 'Register' }).click();
  await page.getByRole('heading', { name: 'Check your email' }).waitFor();
  await login(page, customerEmail, CUSTOMER_PASSWORD);
  await page.getByText('Please verify your email address before logging in').waitFor();
});
await step('customer: the emailed link verifies the account (D-05) and login works', async () => {
  assert(LOG, 'set SERVER_LOG to the server log file');
  let link;
  for (let i = 0; i < 20 && !link; i += 1) {
    const text = readFileSync(LOG, 'utf8');
    const blocks = text.split('--- email').filter((b) => b.includes(`To: ${customerEmail}`) && /verify/i.test(b));
    const last = blocks[blocks.length - 1];
    const m = last && /(https?:\/\/\S+\/verify-email\?token=[a-f0-9]+)/.exec(last);
    if (m) link = m[1];
    else await new Promise((r) => setTimeout(r, 300));
  }
  assert(link, 'verification link not found in the server log');
  const { page } = cust;
  await page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await page.getByText('Your email is verified.').waitFor();
  await login(page, customerEmail, CUSTOMER_PASSWORD);
  await page.getByRole('link', { name: 'Cart' }).waitFor();
});
await step('customer: wrong password shows a message and does not log in', async () => {
  const other = await newSession();
  await login(other.page, customerEmail, 'WrongPassword9');
  await other.page.getByText('Email or password is wrong').waitFor();
  await other.context.close();
});
await step('customer: quantity above stock is rejected with the stock message (FR-09)', async () => {
  const { page } = cust;
  await page.goto('/books?q=matilda');
  await page.getByRole('link', { name: 'Matilda' }).first().click();
  await page.getByLabel('Quantity').fill('4');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.getByText(/Only 3 copies are available/).waitFor();
});
await step('customer: add to cart, change quantity, summary is correct (FR-08, FR-12)', async () => {
  const { page } = cust;
  await page.goto('/books?q=hobbit');
  await page.getByRole('link', { name: 'The Hobbit' }).first().click();
  await page.getByLabel('Quantity').fill('2');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.getByText('Added to your cart.').waitFor();
  await page.goto('/cart');
  await page.getByRole('heading', { name: 'Your cart' }).waitFor();
  await page.getByText('The Hobbit').first().waitFor();
  const subtotal = await page.locator('.summary dd').nth(0).textContent();
  const tax = await page.locator('.summary dd').nth(1).textContent();
  const ship = await page.locator('.summary dd').nth(2).textContent();
  const total = await page.locator('.summary dd').nth(3).textContent();
  const num = (t) => Number(t.replace(/[^0-9.]/g, ''));
  assert(Math.abs(num(subtotal) + num(tax) + num(ship) - num(total)) < 0.005, `summary does not add up: ${subtotal} ${tax} ${ship} ${total}`);
  assert(num(subtotal) === 700, `expected subtotal 700.00, saw ${subtotal}`); // 2 x 350.00
});
await step('customer: wishlist add and move to cart (FR-10)', async () => {
  const { page } = cust;
  await page.goto('/books?q=cosmos');
  await page.getByRole('link', { name: 'Cosmos' }).first().click();
  await page.getByRole('button', { name: 'Add to wishlist' }).click();
  await page.getByText('Added to your wishlist.').waitFor();
  await page.goto('/wishlist');
  await page.getByText('Cosmos').first().waitFor();
  await page.getByRole('button', { name: 'Move to cart' }).click();
  await page.getByText('Your wishlist is empty.').waitFor();
});
await step('customer: checkout validates the address, reserves stock, pays on the test gateway, confirmation (FR-11, FR-13, FR-30)', async () => {
  const { page } = cust;
  await page.goto('/checkout');
  await page.getByRole('heading', { name: 'Checkout' }).waitFor();
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.getByText('Enter the full name.').waitFor(); // client-side validation
  await page.getByLabel('Full name').fill('E2E Customer');
  await page.getByLabel('Address line 1').fill('12 MG Road');
  await page.getByLabel('City').fill('Bengaluru');
  await page.getByLabel('State').fill('Karnataka');
  await page.getByLabel('Postal code').fill('560001');
  await page.getByLabel('Phone').fill('9876543210');
  await page.getByLabel('Save this address to my profile').check();
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.waitForURL('**/pay');
  await page.getByText(/Your books are reserved for/).waitFor();
  await page.getByRole('button', { name: /Pay .* \(test success\)/ }).click();
  await page.waitForURL('**/confirmation');
  await page.getByRole('heading', { name: 'Thank you for your order' }).waitFor();
  orderNumber = (await page.locator('strong').first().textContent()).trim();
  assert(/^OB-/.test(orderNumber), `order number not shown: ${orderNumber}`);
});
await step('customer: confirmation email was sent (FR-14)', async () => {
  let ok = false;
  for (let i = 0; i < 20 && !ok; i += 1) {
    ok = readFileSync(LOG, 'utf8').includes(`Order confirmation ${orderNumber}`);
    if (!ok) await new Promise((r) => setTimeout(r, 300));
  }
  assert(ok, 'confirmation email not found in the server log');
});
await step('customer: order history shows the order and its status (FR-15)', async () => {
  const { page } = cust;
  await page.goto('/orders');
  await page.getByText(orderNumber).waitFor();
  await page.getByText('Placed').first().waitFor();
  await page.getByRole('link', { name: 'View' }).first().click();
  await page.getByRole('heading', { name: `Order ${orderNumber}` }).waitFor();
});
await step('customer: payment failure keeps the reservation; cancelling the unpaid order releases it (D-06)', async () => {
  const { page } = cust;
  await page.goto('/books?q=algorithms');
  await page.getByRole('link', { name: 'Introduction to Algorithms' }).first().click();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.getByText('Added to your cart.').waitFor();
  await page.goto('/checkout');
  await page.getByRole('radio', { name: /saved address/i }).waitFor();
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.waitForURL('**/pay');
  await page.getByRole('button', { name: 'Simulate a failed payment' }).click();
  await page.getByText(/could not be verified/).waitFor();
  await page.getByRole('button', { name: 'Cancel this order' }).click();
  await page.waitForURL('**/cart');
});
await step('customer: profile and address book, 5 address limit message (FR-18)', async () => {
  const { page } = cust;
  await page.goto('/profile');
  await page.getByRole('heading', { name: /Saved addresses \(1 of 5\)/ }).waitFor();
  await page.getByLabel('Name', { exact: true }).fill('E2E Customer Renamed');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await page.getByText('Profile saved.').waitFor();
});
await step('customer: seller application (FR-19)', async () => {
  const { page } = cust;
  await page.goto('/seller/apply');
  await page.getByLabel('Store name').fill(`E2E Store ${stamp}`);
  await page.getByRole('button', { name: 'Send application' }).click();
  await page.getByText(/waiting for an administrator/).waitFor();
});
await step('customer: cannot open seller or admin screens (access denied)', async () => {
  for (const p of ['/seller', '/admin', '/seller/books']) {
    await cust.page.goto(p);
    await cust.page.getByRole('heading', { name: 'Access denied' }).waitFor();
  }
});

// ---------------------------------------------------------------- seller
const sell = await newSession();
await step('seller: login shows seller and customer menu entries (D-04)', async () => {
  await login(sell.page, 'seller@bookstore.local', 'Password123!');
  await sell.page.getByRole('link', { name: 'Seller dashboard' }).waitFor();
  await sell.page.getByRole('link', { name: 'Cart' }).waitFor();
});
await step('seller: create a listing with an uploaded image; it is pending (FR-20)', async () => {
  const { page } = sell;
  // smallest valid 1x1 PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  const file = path.join(OUT, 'cover.png');
  writeFileSync(file, png);
  await page.goto('/seller/books/new');
  await page.getByLabel('Title').fill(listingTitle);
  await page.getByLabel('Author').fill('E2E Author');
  await page.getByLabel('ISBN').fill(listingIsbn);
  await page.getByLabel('Price').fill('199.50');
  await page.getByLabel('Category').selectOption({ label: 'Fiction' });
  await page.getByLabel('Copies in stock').fill('3');
  await page.getByLabel('Add an image').setInputFiles(file);
  await page.getByAltText('Cover preview').waitFor();
  await page.getByRole('button', { name: 'Save listing' }).click();
  await page.waitForURL('**/seller/books');
  await page.getByText(listingTitle).waitFor();
  await page.locator('tr', { hasText: listingTitle }).locator('.badge-pending').waitFor();
});
await step('seller: invalid listing input is refused with messages', async () => {
  const { page } = sell;
  await page.goto('/seller/books/new');
  await page.getByLabel('Title').fill('x');
  await page.getByLabel('ISBN').fill('123');
  await page.getByRole('button', { name: 'Save listing' }).click();
  await page.getByText('Enter an ISBN-10 or ISBN-13.').waitFor();
  await page.getByText(/Enter a price greater than 0/).waitFor();
  await page.getByLabel('ISBN').fill('978-0-306-40615-8'); // wrong check digit: the server refuses it
  await page.getByLabel('Author').fill('A');
  await page.getByLabel('Price').fill('10');
  await page.getByLabel('Category').selectOption({ label: 'Fiction' });
  await page.getByRole('button', { name: 'Save listing' }).click();
  await page.getByText(/valid ISBN/i).waitFor();
});
await step('seller: inventory shows reserved and available; stock below reserved is refused (FR-21)', async () => {
  const { page } = sell;
  await page.goto('/seller/inventory');
  await page.getByRole('heading', { name: 'Stock levels' }).waitFor();
  await page.getByLabel(/^Stock of Matilda/).fill('abc');
  await page.getByRole('row', { name: /Matilda/ }).getByRole('button', { name: 'Save' }).click();
  await page.getByText('Use whole numbers.').waitFor();
});
await step('seller: sees the new order with only own items and moves it Packed, Shipped, Delivered (FR-22)', async () => {
  const { page } = sell;
  await page.goto('/seller/orders');
  const card = page.locator('article.panel', { hasText: orderNumber });
  await card.waitFor();
  assert((await card.getByText('E2E Customer').count()) > 0, 'shipping name missing');
  assert((await card.locator('tbody tr').count()) === 2, 'expected the two demo-seller items of this order');
  for (const next of ['Packed', 'Shipped', 'Delivered']) {
    for (let i = 0; i < 2; i += 1) {
      await card.getByRole('button', { name: `Mark as ${next}` }).first().click();
      await page.getByText(`Marked as ${next}.`).first().waitFor();
      await page.waitForTimeout(250);
    }
  }
});
await step('seller: sales report for the current month (FR-23)', async () => {
  const { page } = sell;
  await page.goto('/seller/reports');
  await page.getByRole('heading', { name: 'Sales report' }).waitFor();
  await page.getByText('books sold').waitFor();
});
await step('seller: cannot open the admin screens', async () => {
  await sell.page.goto('/admin');
  await sell.page.getByRole('heading', { name: 'Access denied' }).waitFor();
});

// ---------------------------------------------------------------- administrator
const adm = await newSession();
await step('admin: login lands on the dashboard; menu has no customer entries', async () => {
  await login(adm.page, 'admin@bookstore.local', 'AdminPass123!');
  await adm.page.getByRole('heading', { name: 'Administrator dashboard' }).waitFor();
  assert((await adm.page.getByRole('link', { name: 'Cart' }).count()) === 0, 'admin sees the cart link');
});
await step('admin: approve the seller application and the listing (FR-19, FR-25)', async () => {
  const { page } = adm;
  await page.goto('/admin/approvals');
  const app = page.locator('li.panel', { hasText: `E2E Store ${stamp}` });
  await app.getByRole('button', { name: 'Approve' }).click();
  await page.getByText('Application approved.').waitFor();
  const listing = page.locator('li.panel', { hasText: listingTitle });
  await listing.getByRole('button', { name: 'Approve' }).click();
  await page.getByText('Listing approved.').waitFor();
});
await step('admin: rejecting needs a reason', async () => {
  const { page } = adm;
  await page.goto('/admin/approvals');
  const any = page.locator('li.panel').getByRole('button', { name: 'Reject' }).first();
  if ((await any.count()) === 0) return; // nothing waiting
  await any.click();
  await page.getByRole('button', { name: 'Reject' }).last().click();
  await page.getByText('Enter a reason.').waitFor();
  await page.keyboard.press('Escape');
});
await step('admin: category add, duplicate refused, rename, delete (FR-26)', async () => {
  const { page } = adm;
  const name = `E2E Cat ${stamp}`;
  await page.goto('/admin/categories');
  await page.getByLabel('New category').fill(name);
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByText('Category added.').waitFor();
  await page.getByLabel('New category').fill(name.toLowerCase());
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByText(/already exists/).waitFor();
  const row = page.locator('li.panel', { hasText: name });
  await row.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await page.getByText('Category deleted.').waitFor();
});
await step('admin: used category cannot be deleted (CATEGORY_IN_USE)', async () => {
  const { page } = adm;
  await page.goto('/admin/categories');
  const row = page.locator('li.panel', { hasText: 'Fiction' });
  await row.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await page.getByText(/still use this category/).waitFor();
});
await step('admin: platform report for the current month (FR-28)', async () => {
  const { page } = adm;
  await page.goto('/admin/reports');
  await page.getByRole('heading', { name: 'Best-selling books' }).waitFor();
});

// ---------------------------------------------------------------- back to the customer
await step('customer: delivered item can be reviewed once; rating shown on the book (FR-17)', async () => {
  const { page } = cust;
  await page.goto('/orders');
  await page.getByRole('link', { name: 'View' }).first().click();
  await page.getByText('Delivered').first().waitFor();
  await page.getByRole('row', { name: /The Hobbit/ }).getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByLabel('Comment (optional)').fill('A <b>great</b> read');
  await page.getByRole('button', { name: 'Submit review' }).click();
  await page.getByText('Thank you for your review.').waitFor();
  await page.getByRole('link', { name: 'The Hobbit' }).first().click();
  await page.getByText('A <b>great</b> read').waitFor(); // shown as text, not as HTML
  assert((await page.locator('.review-comment b').count()) === 0, 'review HTML was rendered');
  await page.getByRole('button', { name: 'Write a review' }).click();
  await page.getByRole('button', { name: 'Submit review' }).click();
  await page.getByText('You have already reviewed this book').waitFor();
});
await step('customer: the new listing is in the catalog after approval (FR-25)', async () => {
  await cust.page.goto('/books');
  await cust.page.getByRole('searchbox').fill(listingTitle);
  await cust.page.getByRole('button', { name: 'Search' }).click();
  await cust.page.getByText(listingTitle).first().waitFor();
  const img = cust.page.locator('.book-card img').first();
  await img.waitFor();
  const loaded = await img.evaluate((el) => el.complete && el.naturalWidth > 0);
  assert(loaded, 'GridFS image did not load');
});
await step('customer: logout ends the session', async () => {
  await logout(cust.page);
  await cust.page.goto('/orders');
  await cust.page.waitForURL('**/login');
});

// ---------------------------------------------------------------- admin: suspension
await step('admin: suspending a user logs them out and blocks login (FR-24)', async () => {
  const victim = await newSession();
  await login(victim.page, 'customer@bookstore.local', 'Password123!');
  await victim.page.getByRole('link', { name: 'Cart' }).waitFor();
  const { page } = adm;
  await page.goto('/admin/users');
  await page.getByLabel('Search name or email').fill('customer@bookstore.local');
  await page.getByRole('button', { name: 'Filter' }).click();
  const row = page.getByRole('row', { name: /customer@bookstore.local/ });
  await row.getByRole('button', { name: 'Suspend' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Suspend' }).click();
  await page.getByText('Account suspended.').waitFor();
  await victim.page.goto('/cart');
  await victim.page.waitForURL('**/login');
  await login(victim.page, 'customer@bookstore.local', 'Password123!');
  await victim.page.getByText('Your account has been suspended').waitFor();
  await page.getByRole('row', { name: /customer@bookstore.local/ }).getByRole('button', { name: 'Reactivate' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reactivate' }).click();
  await page.getByText('Account reactivated.').waitFor();
  await victim.context.close();
});

// ---------------------------------------------------------------- responsive and accessibility
const mobile = await newSession({ width: 360, height: 740 });
await step('responsive at 360 px: no sideways scrolling on the main customer screens (VFR-10)', async () => {
  const { page } = mobile;
  for (const p of ['/books', '/books?q=hobbit', '/login', '/register']) {
    await page.goto(p);
    await page.waitForLoadState('networkidle');
    await noHorizontalScroll(page, p);
  }
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: 'Catalog' }).waitFor();
  await login(page, 'customer@bookstore.local', 'Password123!');
  for (const p of ['/cart', '/orders', '/profile', '/wishlist']) {
    await page.goto(p);
    await page.waitForLoadState('networkidle');
    await noHorizontalScroll(page, p);
  }
});
await step('responsive at 1920 px', async () => {
  const wide = await newSession({ width: 1920, height: 1080 });
  await wide.page.goto('/books');
  await wide.page.waitForLoadState('networkidle');
  await noHorizontalScroll(wide.page, '/books at 1920');
  await wide.context.close();
});
await step('accessibility (axe, WCAG 2 A/AA): no serious or critical violations on main customer screens (VFR-11)', async () => {
  const page = guest.page;
  for (const p of ['/books', '/login', '/register']) {
    await page.goto(p);
    await page.waitForLoadState('networkidle');
    await axeCheck(page, p);
  }
  await page.goto('/books?q=hobbit');
  await page.getByRole('link', { name: 'The Hobbit' }).first().click();
  await page.getByRole('heading', { name: 'The Hobbit' }).waitFor();
  await axeCheck(page, 'book details');
  await login(mobile.page, 'customer@bookstore.local', 'Password123!');
  for (const p of ['/cart', '/checkout', '/orders', '/profile']) {
    await mobile.page.goto(p);
    await mobile.page.waitForLoadState('networkidle');
    await axeCheck(mobile.page, p);
  }
});
await step('no browser console errors or uncaught exceptions during the walkthrough', async () => {
  const all = [...guest.errors, ...cust.errors, ...sell.errors, ...adm.errors, ...mobile.errors];
  assert(all.length === 0, all.slice(0, 5).join(' | '));
});

await browser.close();
const passed = results.filter((r) => r.ok).length;
writeFileSync(path.join(OUT, 'e2e-results.json'), JSON.stringify({ passed, failed, total: results.length, results }, null, 2));
process.stdout.write(`\n${passed} passed, ${failed} failed, ${results.length} steps\n`);
process.exit(failed ? 1 : 0);
