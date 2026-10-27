// Phase 4 keyboard-only checks (VFR-11): skip link, tab order, visible focus, submit with Enter, dialog with Escape and focus return.
import { chromium } from 'playwright-core';
import { BASE, Http, recorder, connectDb, createUserDirect, PASSWORD, ADDRESS, isbn13, mongoose } from './lib.mjs';

const R = recorder('Keyboard accessibility validation');
const db = await connectDb();
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.setDefaultTimeout(10000);

R.section('Keyboard only (Edge)');
await page.goto('/books');
await page.getByRole('heading', { name: /^Books$/ }).waitFor();
await page.keyboard.press('Tab');
const first = await page.evaluate(() => ({ text: document.activeElement.textContent.trim(), href: document.activeElement.getAttribute('href') }));
R.check('KB-01', 'VFR-11', 'the first Tab stop is the "Skip to content" link', 'Skip to content', first.text, first.text === 'Skip to content');
await page.keyboard.press('Enter');
const afterSkip = await page.evaluate(() => document.activeElement.id);
R.check('KB-02', 'VFR-11', 'activating the skip link moves focus to the main content', '#content', `#${afterSkip}`, afterSkip === 'content');

await page.goto('/books');
await page.getByRole('heading', { name: /^Books$/ }).waitFor();
const stops = [];
for (let i = 0; i < 25; i += 1) {
  await page.keyboard.press('Tab');
  stops.push(await page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    const visible = (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none') || cs.boxShadow !== 'none';
    return { tag: el.tagName, name: (el.getAttribute('aria-label') || el.textContent || el.id || '').trim().slice(0, 30), visible };
  }));
}
R.check('KB-03', 'VFR-11', 'Tab reaches the navigation, search box, filters, book links and paging controls (25 stops, none is the page body)', 'no BODY stops', `${stops.filter((s) => s.tag === 'BODY').length} body stops; e.g. ${stops.slice(0, 8).map((s) => s.name).join(' > ')}`, stops.every((s) => s.tag !== 'BODY'));
R.check('KB-04', 'VFR-11', 'every focused control shows a visible focus indicator', 'all 25 visible', `${stops.filter((s) => s.visible).length} of ${stops.length}`, stops.every((s) => s.visible));

const u = await createUserDirect(db, { name: 'Keyboard User' });
await page.goto('/login');
await page.getByLabel('Email', { exact: true }).focus();
await page.keyboard.type(u.email);
await page.keyboard.press('Tab');
await page.keyboard.type(PASSWORD);
await page.keyboard.press('Enter');
await page.getByRole('link', { name: 'Cart' }).waitFor();
R.check('KB-05', 'VFR-11', 'the login form can be completed and submitted with the keyboard only (Enter)', 'logged in', 'Cart link visible', true);

// dialog: Escape closes it and focus returns to the button that opened it
const seller = await createUserDirect(db, { roles: ['customer', 'seller'] });
const sc = new Http(); await sc.login(seller.email, PASSWORD);
const cat = (await new Http().get('/api/categories')).json[0].id;
const adminC = new Http(); await adminC.login(process.env.ADMIN_EMAIL || 'admin@bookstore.local', process.env.ADMIN_PASSWORD || 'AdminPass123!');
const b = (await sc.post('/api/seller/books', { title: `Keyboard Book ${Date.now()}`, author: 'K', isbn: isbn13(Math.floor(Math.random() * 1e9)), price: 1000, categoryId: cat, language: 'English', stock: 5 })).json;
await adminC.post(`/api/admin/books/${b.id}/approve`);
const buyer = new Http(); await buyer.login(u.email, PASSWORD);
await buyer.post('/api/cart/items', { bookId: b.id, quantity: 1 });
const o = (await buyer.post('/api/orders', { shippingAddress: ADDRESS })).json;
await buyer.post(`/api/orders/${o.order.id}/payment/confirm`, o.payment.clientConfig.successPayment);
await page.goto(`/orders/${o.order.id}`);
await page.getByRole('heading', { name: /^Order OB-/ }).waitFor();
const trigger = page.getByRole('button', { name: 'Cancel order' });
await trigger.focus();
await page.keyboard.press('Enter');
await page.getByRole('dialog').waitFor();
const focusInDialog = await page.evaluate(() => Boolean(document.activeElement.closest('[role=dialog]')));
R.check('KB-06', 'VFR-11', 'opening a dialog moves focus into it', 'focus inside the dialog', String(focusInDialog), focusInDialog);
await page.keyboard.press('Escape');
await page.getByRole('dialog').waitFor({ state: 'detached' });
const back = await page.evaluate(() => document.activeElement.textContent.trim());
R.check('KB-07', 'VFR-11', 'Escape closes the dialog and focus returns to the "Cancel order" button', 'Cancel order', back, back === 'Cancel order');
const s = R.save('keyboard-results');
await browser.close();
await mongoose.disconnect();
process.exit(s.fail ? 1 : 0);
