// Phase 4: Lighthouse accessibility, performance and best-practices scores for the main screens (VFR-11, indicative VFR-01).
// Uses the Lighthouse command line (npx lighthouse@12) with Google Chrome in headless mode against the local application.
// Lighthouse default settings: mobile emulation with simulated slow 4G and CPU slowdown. One run per page, one machine.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Http, OUT, BASE, connectDb, createUserDirect, PASSWORD, mongoose } from './lib.mjs';

// Lighthouse is installed outside the repository (npm i lighthouse@12 --prefix <dir>); LIGHTHOUSE_CLI points to its cli/index.js
const LH = process.env.LIGHTHOUSE_CLI || '/tmp/p4/lhtool/node_modules/lighthouse/cli/index.js';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const tmp = path.join(OUT, 'tmp-lh');
mkdirSync(tmp, { recursive: true });
const db = await connectDb();

const books = (await new Http().get('/api/books')).json.items;
const bookId = books[0].id;
const loginCookie = async (roles, email, password) => {
  const u = email ? { email } : await createUserDirect(db, { roles });
  const h = new Http();
  await h.login(u.email, password || PASSWORD);
  if (roles && roles.includes('customer') && !roles.includes('seller') && !email) {
    await h.post('/api/cart/items', { bookId, quantity: 1 });
  }
  return h.cookieHeader();
};
const customerCookie = await loginCookie(['customer']);
const sellerCookie = await loginCookie(['customer', 'seller']);
const adminCookie = await loginCookie(['admin'], process.env.ADMIN_EMAIL || 'admin@bookstore.local', process.env.ADMIN_PASSWORD || 'AdminPass123!');

const pages = [
  ['S-01 Catalog', '/books', null, true], ['S-02 Book details', `/books/${bookId}`, null, true], ['S-05 Login', '/login', null, false], ['S-03 Register', '/register', null, false],
  ['S-08 Cart', '/cart', customerCookie, true], ['S-10 Checkout', '/checkout', customerCookie, true], ['S-13 My orders', '/orders', customerCookie, false], ['S-16 Profile', '/profile', customerCookie, false],
  ['S-19 Seller listings', '/seller/books', sellerCookie, false], ['S-20 Listing form', '/seller/books/new', sellerCookie, false], ['S-24 Admin dashboard', '/admin', adminCookie, false], ['S-26 Approvals', '/admin/approvals', adminCookie, false],
];
const results = [];
for (const [name, route, cookie, main] of pages) {
  const out = path.join(tmp, `${name.slice(0, 4)}.json`);
  const args = [LH, BASE + route, '--chrome-flags=--headless --disable-gpu', '--only-categories=accessibility,performance,best-practices', '--output=json', `--output-path=${out}`, '--quiet'];
  if (cookie) args.push(`--extra-headers=${JSON.stringify({ Cookie: cookie })}`);
  let error = null;
  let attempts = 0;
  // on this Windows machine headless Chrome sometimes loses the page-load trace (NO_NAVSTART); the run is repeated until it is complete
  for (; attempts < 5; attempts += 1) {
    error = null;
    try {
      execFileSync(process.execPath, args, { env: { ...process.env, CHROME_PATH: CHROME }, stdio: 'pipe', timeout: 240000 });
    } catch (e) { error = String(e.message).split('\n')[0].slice(0, 120); }
    try {
      if (!JSON.parse(readFileSync(out, 'utf8')).runtimeError) break;
    } catch { /* no file: try again */ }
  }
  try {
    const d = JSON.parse(readFileSync(out, 'utf8'));
    const a = d.audits;
    results.push({
      page: name, route, mainCustomerPage: main,
      accessibility: Math.round((d.categories.accessibility.score ?? 0) * 100), performance: d.categories.performance.score === null ? null : Math.round(d.categories.performance.score * 100), bestPractices: d.categories['best-practices'].score === null ? null : Math.round(d.categories['best-practices'].score * 100),
      fcpMs: Math.round(a['first-contentful-paint'].numericValue), lcpMs: Math.round(a['largest-contentful-paint'].numericValue), tbtMs: Math.round(a['total-blocking-time'].numericValue), speedIndexMs: Math.round(a['speed-index'].numericValue), cls: Number(a['cumulative-layout-shift'].numericValue.toFixed(3)),
      failedAccessibilityAudits: Object.values(a).filter((x) => x.score === 0 && d.categories.accessibility.auditRefs.some((r) => r.id === x.id)).map((x) => x.id),
      runtimeError: d.runtimeError ? d.runtimeError.code : null, attempts: attempts + 1,
    });
  } catch (e) { results.push({ page: name, route, error: error || e.message }); }
  process.stdout.write(`${name}: ${JSON.stringify(results[results.length - 1]).slice(0, 220)}\n`);
}
rmSync(tmp, { recursive: true, force: true });
writeFileSync(path.join(OUT, 'lighthouse-results.json'), JSON.stringify({ tool: 'lighthouse 12 (command line)', browser: 'Google Chrome headless', settings: 'defaults: mobile emulation, simulated slow 4G, CPU slowdown x4, one run per page', generatedAt: new Date().toISOString(), results }, null, 1));
await mongoose.disconnect();
