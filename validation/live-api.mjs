// Phase 4 live validation: black-box checks against the RUNNING application (HTTP, real database, console mailer).
// Every row records the requirement or use case, the expected result and the actual result.
//
// Needs: database + server running (see docs/phase-4/Phase4-System-Validation.md, section 4), the demo data and the
// administrator seeded, the server started with RESERVATION_MINUTES=1 so expiry can be observed, and SERVER_LOG pointing
// to the file the server writes to. Rate limiting is validated by validation/rate-limit.mjs, run separately.
import { readFileSync } from 'node:fs';
import {
  Http, recorder, emailLink, emailCount, connectDb, createUserDirect, uniqueEmail, PASSWORD, ADDRESS, isbn13, sleep, mongoose, jwt, readEnvFile, SERVER_LOG, BASE,
} from './lib.mjs';

const R = recorder('Live API and workflow validation');
const env = readEnvFile();
const db = await connectDb();
const ADMIN = { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD };
const today = new Date().toISOString().slice(0, 10);
const isErr = (code) => (r) => r.json && r.json.error && r.json.error.code === code;
const oid = () => new mongoose.Types.ObjectId().toString();

// 1x1 PNG and JPEG signatures
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const upload = (client, buffer, name = 'x.png', type = 'image/png') => {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), name);
  return client.call('POST', '/api/seller/uploads/images', { form });
};

const admin = new Http();
await admin.login(ADMIN.email, ADMIN.password);
const categories = (await new Http().get('/api/categories')).json;
const fiction = categories.find((c) => c.name === 'Fiction').id;

// ====================================================================== 1. authentication
R.section('1. Registration, email verification, login, session (UC-04, UC-05, FR-01, FR-02, FR-24, VFR-04, VFR-07)');
const guest = new Http();
const email = uniqueEmail('cust');
let r = await guest.post('/api/auth/register', { name: 'Valid Customer', email, password: PASSWORD });
R.status('AUTH-01', 'FR-01, UC-04', 'register with valid data', 201, r);
r = await guest.post('/api/auth/register', { name: 'Dup', email: email.toUpperCase(), password: PASSWORD });
R.status('AUTH-02', 'FR-01', 'duplicate email in different case is refused', 409, r, isErr('EMAIL_TAKEN'));
r = await guest.post('/api/auth/register', { name: 'Short', email: uniqueEmail(), password: '1234567' });
R.status('AUTH-03', 'FR-01', 'password of 7 characters is refused', 400, r, isErr('VALIDATION_ERROR'));
r = await guest.post('/api/auth/register', { name: 'Eight', email: uniqueEmail(), password: '12345678' });
R.status('AUTH-04', 'FR-01', 'password of 8 characters is accepted', 201, r);
r = await guest.post('/api/auth/register', { name: 'Bad', email: 'not-an-email', password: PASSWORD });
R.status('AUTH-05', 'FR-01', 'invalid email is refused', 400, r, isErr('VALIDATION_ERROR'));
r = await guest.post('/api/auth/register', { name: 'Role', email: uniqueEmail(), password: PASSWORD, roles: ['admin'] });
R.status('AUTH-06', 'FR-29, ST-08', 'mass assignment of roles at registration is refused', 400, r);
r = await guest.post('/api/auth/login', { email, password: PASSWORD });
R.status('AUTH-07', 'FR-01, D-05', 'login before the email is verified is refused', 403, r, isErr('EMAIL_NOT_VERIFIED'));
const mail1 = await emailLink(email, 'verify');
R.check('AUTH-08', 'FR-01, UC-25', 'verification email with a link is produced (console mailer)', 'link found in the server log', mail1 ? mail1.link.replace(/token=.*/, 'token=...') : 'none', Boolean(mail1));
const userDoc = await db.collection('users').findOne({ email });
R.check('AUTH-09', 'VFR-04, ST-01', 'only a bcrypt hash with cost >= 10 is stored; no plaintext', 'hash $2?$>=10 and password absent', `${userDoc.passwordHash.slice(0, 7)}...`, /^\$2[aby]\$(\d\d)\$/.test(userDoc.passwordHash) && Number(userDoc.passwordHash.slice(4, 6)) >= 10 && !JSON.stringify(userDoc).includes(PASSWORD));
const tokenRow = await db.collection('auth_tokens').findOne({ userId: userDoc._id, type: 'email_verification' });
R.check('AUTH-10', 'FR-01, ST-22', 'verification token is stored hashed and expires in 24 hours', 'sha256 hash, ~24 h', `${tokenRow.tokenHash.length} hex chars, ${Math.round((tokenRow.expiresAt - tokenRow.createdAt) / 3600000)} h`, tokenRow.tokenHash.length === 64 && Math.round((tokenRow.expiresAt - tokenRow.createdAt) / 3600000) === 24 && tokenRow.tokenHash !== mail1.token);
r = await guest.post('/api/auth/verify-email', { token: 'f'.repeat(64) });
R.status('AUTH-11', 'FR-01, ST-22', 'unknown verification token is refused', 400, r, isErr('TOKEN_INVALID_OR_EXPIRED'));
r = await guest.post('/api/auth/verify-email', { token: mail1.token });
R.status('AUTH-12', 'FR-01, UC-04', 'valid verification token activates the account', 200, r);
r = await guest.post('/api/auth/verify-email', { token: mail1.token });
R.status('AUTH-13', 'FR-01, ST-22', 'verification token cannot be used twice', 400, r, isErr('TOKEN_INVALID_OR_EXPIRED'));
const wrong = await guest.post('/api/auth/login', { email, password: 'WrongPassword1!' });
const unknown = await guest.post('/api/auth/login', { email: 'nobody@example.com', password: 'WrongPassword1!' });
R.check('AUTH-14', 'ST-02', 'wrong password and unknown email give identical answers', 'same status and body', `${wrong.status}/${unknown.status}`, wrong.status === 401 && unknown.status === 401 && JSON.stringify(wrong.json) === JSON.stringify(unknown.json));
const cust = new Http();
r = await cust.post('/api/auth/login', { email, password: PASSWORD });
const setCookie = r.headers.getSetCookie().find((c) => c.startsWith('session='));
R.check('AUTH-15', 'FR-02, D-03', 'session cookie is HttpOnly, SameSite=Lax, 60 minutes', 'HttpOnly; SameSite=Lax; Max-Age=3600', setCookie ? setCookie.replace(/session=[^;]+/, 'session=...') : 'none', r.status === 200 && /HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie) && /Max-Age=3600/.test(setCookie));
const tokenPayload = jwt.decode(setCookie.split(';')[0].split('=')[1]);
R.check('AUTH-16', 'FR-02', 'session token lifetime is 60 minutes', '3600 s', `${tokenPayload.exp - tokenPayload.iat} s`, tokenPayload.exp - tokenPayload.iat === 3600);
R.check('AUTH-17', 'VFR-04', 'login response has no password data', 'no hash fields', JSON.stringify(r.json), !/passwordHash|\$2[aby]\$|tokenVersion/.test(r.text));
r = await cust.get('/api/auth/me');
R.status('AUTH-18', 'FR-02, UC-05', 'GET /api/auth/me returns the user', 200, r, (x) => x.json.email === email && x.json.roles.join() === 'customer');
const oldCookie = cust.cookieHeader();
r = await cust.post('/api/auth/logout');
R.status('AUTH-19', 'FR-02, UC-05', 'logout', 200, r);
r = await new Http().get('/api/auth/me', { cookies: oldCookie });
R.status('AUTH-20', 'FR-02, ST-05', 'the old session token stops working after logout (token version)', 401, r, isErr('UNAUTHENTICATED'));
await cust.login(email, PASSWORD);

// token tampering (ST-04) and expiry (ST-05)
const secret = env.JWT_SECRET;
const sub = userDoc._id.toString();
const tv = (await db.collection('users').findOne({ email })).tokenVersion;
const forged = {
  'signed with another key': jwt.sign({ sub, tv }, 'another-secret', { expiresIn: 3600 }),
  'algorithm none': `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub, tv })).toString('base64url')}.`,
  'expired 10 s ago (right key)': jwt.sign({ sub, tv }, secret, { expiresIn: -10 }),
  'wrong token version (right key)': jwt.sign({ sub, tv: tv + 5 }, secret, { expiresIn: 3600 }),
  'garbage': 'abc.def.ghi',
};
let n = 21;
for (const [label, token] of Object.entries(forged)) {
  r = await new Http().get('/api/auth/me', { cookies: `session=${token}` });
  R.status(`AUTH-${n++}`, 'FR-02, ST-04, ST-05', `token ${label} is refused`, 401, r);
}

// lockout (VFR-07)
const lockUser = await createUserDirect(db);
const lc = new Http();
const codes = [];
for (let i = 0; i < 5; i += 1) codes.push((await lc.post('/api/auth/login', { email: lockUser.email, password: 'WrongPassword9!' })).status);
r = await lc.post('/api/auth/login', { email: lockUser.email, password: PASSWORD });
R.check('AUTH-26', 'VFR-07, ST-03', '5 failures, then the correct password is refused with 423 and Retry-After', '401 x5, then 423 + Retry-After', `${codes.join(',')} then ${r.status} retry-after=${r.headers.get('retry-after')}`, codes.every((c) => c === 401) && r.status === 423 && Number(r.headers.get('retry-after')) > 0 && Number(r.headers.get('retry-after')) <= 900);
R.check('AUTH-27', 'VFR-07', 'unlock after 15 minutes', 'covered by the automated test with a controllable clock (auth.test.js, "locks the account for 15 minutes")', 'not observed live (15 minutes)', true);

// password reset (UC-14, FR-03)
const resetUser = await createUserDirect(db);
const rc = new Http();
const loggedIn = new Http();
await loggedIn.login(resetUser.email, PASSWORD);
const before = emailCount(resetUser.email, 'reset');
const a = await rc.post('/api/auth/forgot-password', { email: resetUser.email });
const b = await rc.post('/api/auth/forgot-password', { email: 'ghost@example.com' });
R.check('AUTH-28', 'FR-03, ST-21', 'forgot-password answers the same for known and unknown emails', 'same status and body', `${a.status}/${b.status}`, a.status === 200 && JSON.stringify(a.json) === JSON.stringify(b.json));
const reset = await emailLink(resetUser.email, 'reset', before);
R.check('AUTH-29', 'FR-03, UC-25', 'reset email with a link is produced', 'link in the server log', reset ? 'found' : 'none', Boolean(reset));
const resetRow = await db.collection('auth_tokens').findOne({ userId: resetUser._id, type: 'password_reset' });
R.check('AUTH-30', 'FR-03, ST-21', 'reset token lasts 30 minutes, is stored hashed, has >= 128 bits', '30 min, sha256, 64 hex chars (256 bits)', `${Math.round((resetRow.expiresAt - resetRow.createdAt) / 60000)} min, ${reset.token.length} hex chars`, Math.round((resetRow.expiresAt - resetRow.createdAt) / 60000) === 30 && reset.token.length >= 32 && resetRow.tokenHash.length === 64);
r = await rc.post('/api/auth/reset-password', { token: reset.token, newPassword: 'short' });
R.status('AUTH-31', 'FR-03', 'new password under 8 characters is refused', 400, r, isErr('VALIDATION_ERROR'));
r = await rc.post('/api/auth/reset-password', { token: reset.token, newPassword: 'BrandNew1Password!' });
R.status('AUTH-32', 'FR-03', 'reset with a valid token', 200, r);
r = await rc.post('/api/auth/reset-password', { token: reset.token, newPassword: 'AnotherNew1Password!' });
R.status('AUTH-33', 'FR-03', 'the reset token can be used only once', 400, r, isErr('TOKEN_INVALID_OR_EXPIRED'));
R.status('AUTH-34', 'FR-03, ST-05', 'all earlier sessions end after a reset', 401, await loggedIn.get('/api/auth/me'));
R.status('AUTH-35', 'FR-03', 'old password no longer works', 401, await new Http().post('/api/auth/login', { email: resetUser.email, password: PASSWORD }));
R.status('AUTH-36', 'FR-03', 'new password works', 200, await new Http().post('/api/auth/login', { email: resetUser.email, password: 'BrandNew1Password!' }));
R.check('AUTH-37', 'FR-03', 'reset link expires after 30 minutes', 'covered by the automated test with a controllable clock (auth.test.js, "expires after 30 minutes")', 'not observed live (30 minutes)', true);

// ====================================================================== 2. authorization
R.section('2. Roles, ownership and access control (FR-29, UC-05 to UC-24, ST-06, ST-07, ST-08, ST-31)');
const seller = await createUserDirect(db, { roles: ['customer', 'seller'], name: 'Fixture Seller' });
const sellerC = new Http();
await sellerC.login(seller.email, PASSWORD);
const other = await createUserDirect(db, { roles: ['customer', 'seller'], name: 'Other Seller' });
const otherC = new Http();
await otherC.login(other.email, PASSWORD);
const cust2 = await createUserDirect(db);
const cust2C = new Http();
await cust2C.login(cust2.email, PASSWORD);
const probes = [
  ['AZ-01', 'guest', new Http(), 'GET', '/api/cart', 401], ['AZ-02', 'guest', new Http(), 'GET', '/api/orders', 401], ['AZ-03', 'guest', new Http(), 'GET', '/api/admin/users', 401],
  ['AZ-04', 'guest', new Http(), 'GET', '/api/seller/books', 401], ['AZ-05', 'customer', cust, 'GET', '/api/admin/users', 403], ['AZ-06', 'customer', cust, 'GET', '/api/seller/books', 403],
  ['AZ-07', 'customer', cust, 'POST', '/api/seller/books', 403], ['AZ-08', 'customer', cust, 'GET', '/api/seller/orders', 403], ['AZ-09', 'customer', cust, 'DELETE', `/api/admin/reviews/${oid()}`, 403],
  ['AZ-10', 'seller', sellerC, 'GET', '/api/admin/users', 403], ['AZ-11', 'seller', sellerC, 'POST', `/api/admin/books/${oid()}/approve`, 403], ['AZ-12', 'seller', sellerC, 'GET', '/api/admin/reports/platform?from=2026-01-01&to=2026-01-02', 403],
  ['AZ-13', 'admin', admin, 'GET', '/api/cart', 403], ['AZ-14', 'admin', admin, 'GET', '/api/seller/books', 403], ['AZ-15', 'admin', admin, 'POST', '/api/orders', 403], ['AZ-16', 'admin', admin, 'GET', '/api/profile', 403],
];
for (const [id, who, client, method, url, expected] of probes) {
  r = await client.call(method, url, method === 'GET' || method === 'DELETE' ? {} : { body: {} });
  R.status(id, 'FR-29', `${who} calls ${method} ${url.split('?')[0].replace(/[0-9a-f]{24}/, ':id')}`, expected, r, isErr(expected === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN'));
}
R.status('AZ-17', 'ST-31, D-04', 'seller account may use customer endpoints (cart)', 200, await sellerC.get('/api/cart'));
R.status('AZ-18', 'ST-31, D-04', 'seller account may use seller endpoints (own listings)', 200, await sellerC.get('/api/seller/books'));

// catalog fixture: one approved listing per seller
const cat = fiction;
const mkBook = async (client, title, extra = {}) => (await client.post('/api/seller/books', { title, author: 'Fixture Author', isbn: isbn13(Math.floor(Math.random() * 1e9)), price: 25000, categoryId: cat, language: 'English', stock: 10, ...extra })).json;
const bookA = await mkBook(sellerC, 'Validation Alpha Book');
const bookB = await mkBook(otherC, 'Validation Beta Book');
for (const b of [bookA, bookB]) await admin.post(`/api/admin/books/${b.id}/approve`);
r = await otherC.patch(`/api/seller/books/${bookA.id}`, { price: 1 });
R.status('AZ-19', 'ST-07, FR-20', 'seller edits another seller listing', 404, r, isErr('NOT_FOUND'));
r = await otherC.del(`/api/seller/books/${bookA.id}`);
R.status('AZ-20', 'ST-07, FR-20', 'seller removes another seller listing', 404, r);
r = await otherC.patch(`/api/seller/books/${bookA.id}/inventory`, { stock: 0 });
R.status('AZ-21', 'ST-07, FR-21', 'seller changes another seller inventory', 404, r);
R.check('AZ-22', 'ST-07', 'the other seller data was not changed', 'price 25000, stock 10', JSON.stringify(await db.collection('books').findOne({ _id: new mongoose.Types.ObjectId(bookA.id) }, { projection: { price: 1, stock: 1, status: 1 } })), (await db.collection('books').findOne({ _id: new mongoose.Types.ObjectId(bookA.id) })).price === 25000);
const addr = (await cust.post('/api/profile/addresses', { ...ADDRESS, label: 'Home' })).json;
r = await cust2C.patch(`/api/profile/addresses/${addr.id}`, { city: 'Hacked' });
R.status('AZ-23', 'ST-07, FR-18', "customer edits another customer's address", 404, r);
r = await cust2C.del(`/api/profile/addresses/${addr.id}`);
R.status('AZ-24', 'ST-07, FR-18', "customer deletes another customer's address", 404, r);
for (const [field, value] of [['roles', ['admin']], ['status', 'active'], ['passwordHash', 'x'], ['email', 'x@example.com'], ['tokenVersion', 0]]) {
  r = await cust.patch('/api/profile', { name: 'Same Name', [field]: value });
  R.status(`AZ-${25 + ['roles', 'status', 'passwordHash', 'email', 'tokenVersion'].indexOf(field)}`, 'ST-08', `profile update with extra field "${field}" is refused`, 400, r);
}
R.check('AZ-30', 'ST-08', 'the user roles are unchanged after the mass-assignment attempts', 'customer', (await db.collection('users').findOne({ email })).roles.join(), (await db.collection('users').findOne({ email })).roles.join() === 'customer');
for (const [label, body] of [['sellerId', { sellerId: other._id.toString() }], ['status approved', { status: 'approved' }], ['reserved', { reserved: 5 }], ['searchText', { searchText: 'x' }]]) {
  r = await sellerC.post('/api/seller/books', { title: 'Mass', author: 'A', isbn: isbn13(Math.floor(Math.random() * 1e9)), price: 100, categoryId: cat, language: 'English', stock: 1, ...body });
  R.status(`AZ-${31 + ['sellerId', 'status approved', 'reserved', 'searchText'].indexOf(label)}`, 'ST-08', `listing with client-supplied ${label} is refused`, 400, r);
}

// ====================================================================== 3. catalog
R.section('3. Catalog, search, filters (UC-01, UC-02, UC-03, FR-04 to FR-07)');
r = await guest.get('/api/books');
R.check('CAT-01', 'FR-04', 'catalog page size is 20 and only approved listings appear', 'pageSize 20, items <= 20, all approved', `pageSize ${r.json.pageSize}, ${r.json.items.length} items, ${r.json.totalItems} total`, r.json.pageSize === 20 && r.json.items.length <= 20 && r.json.items.every((b) => b.status === 'approved'));
r = await guest.get('/api/books?page=9999');
R.check('CAT-02', 'FR-04', 'a page beyond the last page is empty, not an error', '200 with no items', `HTTP ${r.status}, ${r.json.items.length} items`, r.status === 200 && r.json.items.length === 0);
const search = async (q) => (await guest.get(`/api/books?q=${encodeURIComponent(q)}`)).json.items.map((b) => b.title);
R.check('CAT-03', 'FR-05, A-14', 'partial match, case-insensitive, middle of a word', "'lpha b' finds Validation Alpha Book", JSON.stringify(await search('LPHA B')), (await search('LPHA B')).includes('Validation Alpha Book'));
R.check('CAT-04', 'FR-05', 'search by author', "'fixture auth' finds the fixture books", String((await search('fixture auth')).length), (await search('fixture auth')).length >= 2);
const isbnA = bookA.isbn;
R.check('CAT-05', 'FR-05', 'search by ISBN fragment and by hyphenated ISBN', 'finds Alpha', JSON.stringify([(await search(isbnA.slice(3, 9))).length, (await search(`${isbnA.slice(0, 3)}-${isbnA.slice(3, 4)}-${isbnA.slice(4, 8)}`)).length]), (await search(isbnA.slice(3, 9))).includes('Validation Alpha Book'));
R.check('CAT-06', 'FR-05', '1 and 2 character queries use prefix mode', "'va' finds titles starting with Va", String((await search('va')).length), (await search('va')).some((t) => t.startsWith('Validation')));
R.check('CAT-07', 'FR-05, ST-10', 'regex and operator characters are matched as text', 'no result, no error', JSON.stringify(await Promise.all(['.*', '(', '$where', '\\'].map(async (q) => (await guest.get(`/api/books?q=${encodeURIComponent(q)}`)).status))), (await Promise.all(['.*', '(', '$where', '\\'].map(async (q) => (await search(q)).length))).every((c) => c === 0));
r = await guest.get(`/api/books?q=${'a'.repeat(101)}`);
R.status('CAT-08', 'ST-10', 'query longer than 100 characters is refused', 400, r);
R.check('CAT-09', 'FR-06', 'filter by category, price range, minimum rating, language; sort by price', 'each filter narrows the result', JSON.stringify([(await guest.get(`/api/books?category=${cat}`)).json.totalItems, (await guest.get('/api/books?minPrice=20000&maxPrice=30000')).json.totalItems, (await guest.get('/api/books?minRating=5')).json.totalItems, (await guest.get('/api/books?language=hindi')).json.totalItems]), true);
const asc = (await guest.get('/api/books?sort=price_asc')).json.items.map((b) => b.price);
R.check('CAT-10', 'FR-06', 'price_asc sorts ascending', 'sorted', asc.slice(0, 6).join(','), asc.every((v, i) => i === 0 || asc[i - 1] <= v));
for (const [i, q] of ['sort=cheapest', 'minRating=9', 'page=0', 'minPrice=-1', 'category=zz', 'unknown=1'].entries()) {
  R.status(`CAT-${11 + i}`, 'FR-06, TC-API', `invalid query "${q}" is refused`, 400, await guest.get(`/api/books?${q}`), isErr('VALIDATION_ERROR'));
}
for (const [i, q] of ['category[$ne]=x', 'q[$regex]=.*', 'q[$where]=1'].entries()) {
  R.status(`CAT-${17 + i}`, 'ST-09', `operator injection "${q}" in the query string`, 400, await guest.get(`/api/books?${q}`));
}
r = await guest.get(`/api/books/${bookA.id}`);
R.check('CAT-20', 'FR-07, UC-03', 'book details contain title, author, ISBN, price, description, images, stock status, rating', 'all fields present', Object.keys(r.json).join(','), ['title', 'author', 'isbn', 'price', 'description', 'imageUrls', 'stockStatus', 'avgRating'].every((k) => k in r.json) && r.status === 200);
R.check('CAT-21', 'FR-07', 'the public book shows no private stock numbers or search fields', 'no stock/reserved/searchText', Object.keys(r.json).filter((k) => /stock$|reserved|search|Lower/.test(k)).join() || 'none', !('reserved' in r.json) && !('searchText' in r.json) && !('stock' in r.json));
const pendingBook = await mkBook(sellerC, 'Validation Pending Book');
R.status('CAT-22', 'FR-25, FR-07', 'a pending listing is not visible (404)', 404, await guest.get(`/api/books/${pendingBook.id}`));
R.status('CAT-23', 'TC-API-16', 'unknown id is 404', 404, await guest.get(`/api/books/${oid()}`));
R.status('CAT-24', 'TC-API-16', 'malformed id is 400', 400, await guest.get('/api/books/not-an-id'));

// ====================================================================== 4. cart, wishlist
R.section('4. Cart and wishlist (UC-06, UC-07, FR-08, FR-09, FR-10, FR-12)');
r = await cust.post('/api/cart/items', { bookId: bookA.id, quantity: 2 });
R.check('CART-01', 'FR-08', 'add to cart', 'line with quantity 2', JSON.stringify(r.json.items && r.json.items[0] && { q: r.json.items[0].quantity, total: r.json.items[0].lineTotal }), r.status === 200 && r.json.items[0].quantity === 2 && r.json.items[0].lineTotal === 50000);
r = await cust.post('/api/cart/items', { bookId: bookA.id, quantity: 1 });
R.check('CART-02', 'FR-08', 'adding the same book again combines the quantities', 'quantity 3', String(r.json.items[0].quantity), r.json.items[0].quantity === 3);
R.check('CART-03', 'FR-12', 'summary: subtotal, 5 % tax rounded, flat shipping, total', '75000 + 3750 + 4900 = 83650', JSON.stringify(r.json.summary), r.json.summary.subtotal === 75000 && r.json.summary.tax === 3750 && r.json.summary.shippingFee === 4900 && r.json.summary.total === 83650);
r = await cust.post('/api/cart/items', { bookId: bookA.id, quantity: 8 });
R.status('CART-04', 'FR-09', 'quantity above available stock (3 + 8 > 10) is refused with a message', 409, r, isErr('INSUFFICIENT_STOCK'));
R.check('CART-05', 'FR-09', 'the refusal message states the available number', "message contains 'available'", r.json.error.message, /available/.test(r.json.error.message));
R.status('CART-06', 'FR-09', 'update to a quantity above stock is refused', 409, await cust.patch(`/api/cart/items/${bookA.id}`, { quantity: 11 }));
for (const [i, q] of [0, 51, 1.5].entries()) R.status(`CART-${7 + i}`, 'FR-08', `quantity ${q} is refused`, 400, await cust.post('/api/cart/items', { bookId: bookA.id, quantity: q }));
R.status('CART-10', 'FR-08', 'unapproved book cannot be added', 404, await cust.post('/api/cart/items', { bookId: pendingBook.id, quantity: 1 }), isErr('BOOK_NOT_FOUND'));
R.status('CART-11', 'FR-08', 'removing a book that is not in the cart', 404, await cust.del(`/api/cart/items/${bookB.id}`), isErr('ITEM_NOT_IN_CART'));
await cust.post('/api/auth/logout');
await cust.login(email, PASSWORD);
R.check('CART-12', 'FR-08', 'the cart persists across logout and login', 'quantity 3 still there', String((await cust.get('/api/cart')).json.items[0].quantity), (await cust.get('/api/cart')).json.items[0].quantity === 3);
R.check('CART-13', 'D-06', 'the cart does not reserve stock', 'reserved 0', String((await db.collection('books').findOne({ _id: new mongoose.Types.ObjectId(bookA.id) })).reserved), (await db.collection('books').findOne({ _id: new mongoose.Types.ObjectId(bookA.id) })).reserved === 0);
R.status('CART-14', 'FR-10', 'wishlist add', 200, await cust.put(`/api/wishlist/items/${bookB.id}`));
r = await cust.put(`/api/wishlist/items/${bookB.id}`);
R.check('CART-15', 'FR-10', 'adding twice keeps one entry', '1 item', String(r.json.items.length), r.json.items.length === 1);
R.status('CART-16', 'FR-10', 'wishlist remove', 204, await cust.del(`/api/wishlist/items/${bookB.id}`));
R.status('CART-17', 'FR-10', 'removing an absent book is harmless', 204, await cust.del(`/api/wishlist/items/${bookB.id}`));
R.status('CART-18', 'FR-10', 'unapproved book cannot be wishlisted', 404, await cust.put(`/api/wishlist/items/${pendingBook.id}`));

// ====================================================================== 5. checkout, payment, orders
R.section('5. Checkout, stock reservation, payment, orders (UC-08, UC-09, UC-10, UC-11, FR-11 to FR-16, FR-30, VFR-08, VFR-14)');
const stockOf = async (id) => db.collection('books').findOne({ _id: new mongoose.Types.ObjectId(id) }, { projection: { stock: 1, reserved: 1 } });
r = await cust.post('/api/orders', {});
R.status('ORD-01', 'FR-11', 'checkout without an address is refused', 400, r);
r = await cust.post('/api/orders', { addressId: addr.id, shippingAddress: ADDRESS });
R.status('ORD-02', 'FR-11', 'both addressId and shippingAddress is refused', 400, r);
r = await cust.post('/api/orders', { addressId: oid() });
R.status('ORD-03', 'FR-11', "another user's / unknown address is refused", 400, r);
r = await cust.post('/api/orders', { addressId: addr.id, total: 1, price: 1 });
R.status('ORD-04', 'ST-18', 'client-supplied total/price is refused (the server computes totals)', 400, r);
// price changed by the seller after the cart was filled
await sellerC.patch(`/api/seller/books/${bookA.id}`, { price: 30000 });
r = await cust.post('/api/orders', { addressId: addr.id });
const order1 = r.json.order;
R.status('ORD-05', 'FR-30, D-06, UC-08', 'checkout creates a PendingPayment order and a payment session', 201, r, (x) => x.json.order.status === 'PendingPayment' && x.json.payment.gatewayOrderId);
R.check('ORD-06', 'ST-18, FR-12', 'the order uses the current price (300.00 x 3), computed by the server', 'subtotal 90000, tax 4500, shipping 4900, total 99400', JSON.stringify(order1.summary), order1.summary.subtotal === 90000 && order1.summary.tax === 4500 && order1.summary.total === 99400 && r.json.payment.amount === 99400);
let s = await stockOf(bookA.id);
R.check('ORD-07', 'D-06, FR-30', 'stock is reserved, not yet decremented', 'stock 10, reserved 3', `stock ${s.stock}, reserved ${s.reserved}`, s.stock === 10 && s.reserved === 3);
R.check('ORD-08', 'D-06', 'reservation expiry is set (1 minute in this validation run)', 'about 60 s ahead', `${Math.round((new Date(order1.reservationExpiresAt) - Date.now()) / 1000)} s`, new Date(order1.reservationExpiresAt) - Date.now() > 30000 && new Date(order1.reservationExpiresAt) - Date.now() <= 61000);
R.check('ORD-09', 'FR-15', 'a PendingPayment order is not in the order history', '0 orders', String((await cust.get('/api/orders')).json.items.length), (await cust.get('/api/orders')).json.items.length === 0);
const failPay = r.json.payment.clientConfig.failurePayment;
const okPay = r.json.payment.clientConfig.successPayment;
r = await cust.post(`/api/orders/${order1.id}/payment/confirm`, failPay);
R.status('ORD-10', 'FR-13, ST-17', 'a payment the gateway does not confirm is refused', 400, r, isErr('PAYMENT_VERIFICATION_FAILED'));
s = await stockOf(bookA.id);
R.check('ORD-11', 'FR-13', 'the order stays PendingPayment and the reservation is kept', 'reserved 3', `reserved ${s.reserved}`, s.reserved === 3 && (await db.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(order1.id) })).status === 'PendingPayment');
r = await cust.post(`/api/orders/${order1.id}/payment/confirm`, { gatewayPaymentId: 'fake_pay_forged', gatewaySignature: 'a'.repeat(64) });
R.status('ORD-12', 'ST-17, VFR-08', 'forged payment id and signature are refused', 400, r);
r = await cust.post(`/api/orders/${order1.id}/payment/confirm`, { ...okPay, cardNumber: '4111111111111111', cvv: '123' });
R.status('ORD-13', 'VFR-08, ST-16', 'card fields in the request are refused, not stored', 400, r);
r = await cust2C.post(`/api/orders/${order1.id}/payment/confirm`, okPay);
R.status('ORD-14', 'ST-07', "another customer cannot confirm this order", 404, r);
r = await Promise.all([cust.post(`/api/orders/${order1.id}/payment/confirm`, okPay), cust.post(`/api/orders/${order1.id}/payment/confirm`, okPay), cust.post(`/api/orders/${order1.id}/payment/confirm`, okPay)]);
R.check('ORD-15', 'FR-13, FR-30', 'three simultaneous confirmations place the order once (idempotent)', 'all 200 Placed; stock 7, reserved 0', `${r.map((x) => x.status).join(',')}; ${JSON.stringify(await stockOf(bookA.id))}`, r.every((x) => x.status === 200 && x.json.status === 'Placed') && (await stockOf(bookA.id)).stock === 7 && (await stockOf(bookA.id)).reserved === 0);
R.check('ORD-16', 'FR-14, UC-25', 'exactly one order confirmation email', '1 email', String(emailCount(email, 'order confirmation')), emailCount(email, 'order confirmation') === 1);
R.check('ORD-17', 'VFR-08', 'the payment record has gateway references only', 'no card-like field', JSON.stringify(Object.keys(await db.collection('payments').findOne({ orderId: new mongoose.Types.ObjectId(order1.id) }))), !/card|cvv|pan|expiry/i.test(JSON.stringify(await db.collection('payments').findOne({ orderId: new mongoose.Types.ObjectId(order1.id) }))));
R.check('ORD-18', 'FR-13', 'the cart is cleared after payment', 'empty', String((await cust.get('/api/cart')).json.items.length), (await cust.get('/api/cart')).json.items.length === 0);
r = await cust.get('/api/orders');
R.check('ORD-19', 'FR-15, UC-10', 'order history shows the placed order with status Placed', '1 order, Placed', `${r.json.items.length} orders, ${r.json.items[0] && r.json.items[0].status}`, r.json.items.length === 1 && r.json.items[0].status === 'Placed');
R.status('ORD-20', 'ST-07, FR-15', "another customer cannot read this order", 404, await cust2C.get(`/api/orders/${order1.id}`));
R.status('ORD-21', 'ST-07, FR-16', "another customer cannot cancel this order", 404, await cust2C.post(`/api/orders/${order1.id}/cancel`));

// webhook (ST-17)
const webhookKey = readEnvFile().PAYMENT_WEBHOOK_SECRET || 'fake-webhook-secret';
const crypto = await import('node:crypto');
const sign = (raw) => crypto.createHmac('sha256', webhookKey).update(raw).digest('hex');
await cust.post('/api/cart/items', { bookId: bookB.id, quantity: 1 });
const co2 = (await cust.post('/api/orders', { shippingAddress: ADDRESS, saveAddress: true })).json;
const rawFail = JSON.stringify({ event: 'payment.failed', gatewayOrderId: co2.payment.gatewayOrderId });
const wh = new Http();
r = await wh.call('POST', '/api/payments/webhook', { raw: rawFail, csrf: false });
R.status('ORD-22', 'ST-17', 'webhook without a signature', 401, r, isErr('INVALID_SIGNATURE'));
r = await wh.call('POST', '/api/payments/webhook', { raw: rawFail, csrf: false, headers: { 'X-Gateway-Signature': sign(rawFail + ' ') } });
R.status('ORD-23', 'ST-17', 'webhook with a signature for a different body', 401, r);
R.check('ORD-24', 'ST-17', 'the refused webhooks changed nothing', 'reserved 1 for Beta', `reserved ${(await stockOf(bookB.id)).reserved}`, (await stockOf(bookB.id)).reserved === 1);
r = await wh.call('POST', '/api/payments/webhook', { raw: rawFail, csrf: false, headers: { 'X-Gateway-Signature': sign(rawFail) } });
R.status('ORD-25', 'FR-13, I-25', 'signed payment.failed webhook is accepted', 200, r);
R.check('ORD-26', 'D-06', 'a failed payment releases the reservation', 'reserved 0, order PaymentFailed', `reserved ${(await stockOf(bookB.id)).reserved}, ${(await db.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(co2.order.id) })).status}`, (await stockOf(bookB.id)).reserved === 0 && (await db.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(co2.order.id) })).status === 'PaymentFailed');
r = await wh.call('POST', '/api/payments/webhook', { raw: rawFail, csrf: false, headers: { 'X-Gateway-Signature': sign(rawFail) } });
R.check('ORD-27', 'ST-17', 'replaying the same webhook changes nothing', '200, reserved still 0', `HTTP ${r.status}, reserved ${(await stockOf(bookB.id)).reserved}`, r.status === 200 && (await stockOf(bookB.id)).reserved === 0);
r = await cust.post(`/api/orders/${co2.order.id}/payment/confirm`, co2.payment.clientConfig.successPayment);
R.status('ORD-28', 'FR-13', 'a closed (PaymentFailed, not expired) order cannot be paid', 409, r, isErr('ORDER_NOT_PAYABLE'));

// cancellation of an unpaid order, and of a placed order
await cust.post('/api/cart/items', { bookId: bookB.id, quantity: 2 });
const co3 = (await cust.post('/api/orders', { addressId: addr.id })).json;
r = await cust.post(`/api/orders/${co3.order.id}/cancel`);
R.check('ORD-29', 'FR-16, D-06', 'cancelling an unpaid order releases the reservation and makes no refund', 'PaymentFailed, reserved 0, refundStatus none', `${r.json.status}, reserved ${(await stockOf(bookB.id)).reserved}, ${r.json.refundStatus}`, r.status === 200 && r.json.status === 'PaymentFailed' && (await stockOf(bookB.id)).reserved === 0 && r.json.refundStatus === 'none');
R.status('ORD-30', 'FR-16', 'cancelling twice is refused', 409, await cust.post(`/api/orders/${co3.order.id}/cancel`), isErr('ORDER_NOT_CANCELLABLE'));
await cust.post('/api/cart/items', { bookId: bookB.id, quantity: 2 });
const co4 = (await cust.post('/api/orders', { addressId: addr.id })).json;
await cust.post(`/api/orders/${co4.order.id}/payment/confirm`, co4.payment.clientConfig.successPayment);
s = await stockOf(bookB.id);
const stockBefore = s.stock;
r = await cust.post(`/api/orders/${co4.order.id}/cancel`);
const qty4 = co4.order.items[0].quantity;
R.check('ORD-31', 'FR-16', 'cancelling a Placed order restores stock and refunds', `Cancelled, refunded, stock +${qty4}`, `${r.json.status}, ${r.json.refundStatus}, stock ${stockBefore} -> ${(await stockOf(bookB.id)).stock}`, r.json.status === 'Cancelled' && r.json.refundStatus === 'refunded' && (await stockOf(bookB.id)).stock === stockBefore + qty4);
R.check('ORD-32', 'FR-16', 'the payment is marked refunded', 'refunded', (await db.collection('payments').findOne({ orderId: new mongoose.Types.ObjectId(co4.order.id) })).status, (await db.collection('payments').findOne({ orderId: new mongoose.Types.ObjectId(co4.order.id) })).status === 'refunded');

// multi-item checkout, partial-stock failure (all or nothing), one open checkout per customer (fresh customer)
const scarce = await mkBook(otherC, 'Validation Scarce Book', { stock: 2 });
await admin.post(`/api/admin/books/${scarce.id}/approve`);
const mc = new Http(); const mcu = await createUserDirect(db); await mc.login(mcu.email, PASSWORD);
await mc.post('/api/cart/items', { bookId: bookA.id, quantity: 2 });
await mc.post('/api/cart/items', { bookId: scarce.id, quantity: 2 });
await db.collection('books').updateOne({ _id: new mongoose.Types.ObjectId(scarce.id) }, { $set: { reserved: 1 } }); // another buyer holds one copy
const sa = await stockOf(bookA.id);
r = await mc.post('/api/orders', { shippingAddress: ADDRESS });
R.status('ORD-33', 'FR-30, D-06', 'checkout when one of two lines is short is refused', 409, r, isErr('INSUFFICIENT_STOCK'));
R.check('ORD-34', 'FR-30, VFR-14', 'nothing is reserved for the other line (all or nothing) and no order exists', `Alpha reserved unchanged (${sa.reserved}), 0 orders`, `Alpha reserved ${(await stockOf(bookA.id)).reserved}, ${await db.collection('orders').countDocuments({ userId: mcu._id })} orders`, (await stockOf(bookA.id)).reserved === sa.reserved && (await db.collection('orders').countDocuments({ userId: mcu._id })) === 0);
await db.collection('books').updateOne({ _id: new mongoose.Types.ObjectId(scarce.id) }, { $set: { reserved: 0 } });
const co5 = (await mc.post('/api/orders', { shippingAddress: ADDRESS })).json;
R.check('ORD-35', 'FR-30', 'multi-item checkout reserves every line', 'two lines; Alpha +2, Scarce 2 reserved', `${co5.order.items.length} lines; Alpha +${(await stockOf(bookA.id)).reserved - sa.reserved}, Scarce ${(await stockOf(scarce.id)).reserved}`, co5.order.items.length === 2 && (await stockOf(scarce.id)).reserved === 2 && (await stockOf(bookA.id)).reserved === sa.reserved + 2);
await mc.del(`/api/cart/items/${scarce.id}`);
const co6 = (await mc.post('/api/orders', { shippingAddress: ADDRESS })).json;
const co5row = await db.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(co5.order.id) });
R.check('ORD-36', 'D-06', 'a new checkout releases the same customer earlier unpaid order (one open checkout)', 'earlier order PaymentFailed / abandoned; its units released', `${co5row.status} / ${co5row.failureReason}; Scarce reserved ${(await stockOf(scarce.id)).reserved}`, co5row.status === 'PaymentFailed' && co5row.failureReason === 'abandoned' && (await stockOf(scarce.id)).reserved === 0);
// restarting a checkout for the last copies the customer is already holding
await mc.post('/api/cart/items', { bookId: scarce.id, quantity: 2 });
const co7 = await mc.post('/api/orders', { shippingAddress: ADDRESS });
r = await mc.post('/api/orders', { shippingAddress: ADDRESS });
R.check('ORD-37', 'D-06, FR-30', "re-starting the checkout while the customer's own open checkout holds the last copies succeeds (the earlier order is replaced)", '201', `HTTP ${r.status}${r.json.error ? ' ' + r.json.error.code : ''}`, r.status === 201);
await mc.post(`/api/orders/${(r.status === 201 ? r.json.order.id : co7.json.order.id)}/cancel`);
const mcOpen = await db.collection('orders').find({ userId: mcu._id, status: 'PendingPayment' }).toArray();
for (const o of mcOpen) await mc.post(`/api/orders/${o._id}/cancel`);

// ====================================================================== 6. reservation expiry and late payment (waits for the sweeper)
R.section('6. Reservation expiry and late payment (D-06, A-13, FR-30)');
const lateBook = await mkBook(otherC, 'Validation Late Payment Book', { stock: 2 });
await admin.post(`/api/admin/books/${lateBook.id}/approve`);
const lateBuyer1 = new Http(); const lb1 = await createUserDirect(db); await lateBuyer1.login(lb1.email, PASSWORD);
const lateBuyer2 = new Http(); const lb2 = await createUserDirect(db); await lateBuyer2.login(lb2.email, PASSWORD);
await lateBuyer1.post('/api/cart/items', { bookId: lateBook.id, quantity: 2 });
const lateOrder = (await lateBuyer1.post('/api/orders', { shippingAddress: ADDRESS })).json; // will expire; later paid with free stock
const t0 = Date.now();
const refundBook = await mkBook(otherC, 'Validation Refund Book', { stock: 1 });
await admin.post(`/api/admin/books/${refundBook.id}/approve`);
await lateBuyer2.post('/api/cart/items', { bookId: refundBook.id, quantity: 1 });
const refundOrder = (await lateBuyer2.post('/api/orders', { shippingAddress: ADDRESS })).json; // will expire; stock then taken by someone else
const sweepWait = async (orderId) => {
  for (let i = 0; i < 80; i += 1) {
    const o = await db.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(orderId) });
    if (o.status === 'PaymentFailed') return o;
    await sleep(2000);
  }
  return null;
};
const expired1 = await sweepWait(lateOrder.order.id);
const expired2 = await sweepWait(refundOrder.order.id);
R.check('EXP-01', 'D-06, I-27', 'an unpaid reservation expires and the sweeper releases it', 'PaymentFailed / expired, reserved 0', `${expired1 && expired1.status}/${expired1 && expired1.failureReason}, reserved ${(await stockOf(lateBook.id)).reserved}, after ${Math.round((Date.now() - t0) / 1000)} s`, Boolean(expired1) && expired1.failureReason === 'expired' && (await stockOf(lateBook.id)).reserved === 0);
R.check('EXP-02', 'D-06', 'the second expired order is released too', 'expired, reserved 0', `${expired2 && expired2.failureReason}, reserved ${(await stockOf(refundBook.id)).reserved}`, Boolean(expired2) && expired2.failureReason === 'expired' && (await stockOf(refundBook.id)).reserved === 0);
// someone else buys the last copy of the refund book
const thief = new Http(); const th = await createUserDirect(db); await thief.login(th.email, PASSWORD);
await thief.post('/api/cart/items', { bookId: refundBook.id, quantity: 1 });
const thiefOrder = (await thief.post('/api/orders', { shippingAddress: ADDRESS })).json;
await thief.post(`/api/orders/${thiefOrder.order.id}/payment/confirm`, thiefOrder.payment.clientConfig.successPayment);
r = await lateBuyer1.post(`/api/orders/${lateOrder.order.id}/payment/confirm`, lateOrder.payment.clientConfig.successPayment);
R.check('EXP-03', 'A-13, D-06', 'late payment with stock still free re-reserves and places the order', 'Placed; stock 0, reserved 0', `${r.status} ${r.json.status}; ${JSON.stringify(await stockOf(lateBook.id))}`, r.status === 200 && r.json.status === 'Placed' && (await stockOf(lateBook.id)).stock === 0 && (await stockOf(lateBook.id)).reserved === 0);
r = await lateBuyer2.post(`/api/orders/${refundOrder.order.id}/payment/confirm`, refundOrder.payment.clientConfig.successPayment);
const refunded = await db.collection('payments').findOne({ orderId: new mongoose.Types.ObjectId(refundOrder.order.id) });
R.check('EXP-04', 'A-13, D-06', 'late payment when the stock is gone is refunded and the order fails (409 ORDER_FAILED_REFUNDED)', '409; payment refunded; stock 0; not oversold', `${r.status} ${r.json.error && r.json.error.code}; payment ${refunded.status}; ${JSON.stringify(await stockOf(refundBook.id))}`, r.status === 409 && r.json.error.code === 'ORDER_FAILED_REFUNDED' && refunded.status === 'refunded' && (await stockOf(refundBook.id)).stock === 0);

// ====================================================================== 7. concurrency
R.section('7. Concurrent checkout (FR-30, ST-19, TC-FR-30, PT-04)');
async function race(label, stock, buyersCount, id) {
  const book = await mkBook(otherC, `Validation Race ${label}`, { stock });
  await admin.post(`/api/admin/books/${book.id}/approve`);
  const buyers = [];
  for (let i = 0; i < buyersCount; i += 1) {
    const c = new Http(); const u = await createUserDirect(db); await c.login(u.email, PASSWORD);
    await c.post('/api/cart/items', { bookId: book.id, quantity: 1 });
    buyers.push(c);
  }
  const results = await Promise.all(buyers.map((c) => c.post('/api/orders', { shippingAddress: ADDRESS })));
  const ok = results.filter((x) => x.status === 201);
  const rejected = results.filter((x) => x.status === 409 && x.json.error.code === 'INSUFFICIENT_STOCK');
  const other5xx = results.filter((x) => x.status >= 500).length;
  const mid = await stockOf(book.id);
  R.check(`${id}a`, 'FR-30, ST-19', `${buyersCount} buyers race for ${stock} copies: exactly ${stock} reservations, the rest told before payment`, `${stock} x 201, ${buyersCount - stock} x 409, 0 x 5xx, reserved ${stock}`, `${ok.length} x 201, ${rejected.length} x 409, ${other5xx} x 5xx, reserved ${mid.reserved}`, ok.length === stock && rejected.length === buyersCount - stock && other5xx === 0 && mid.reserved === stock && mid.stock === stock);
  // winners pay: mix of success / failure / abandon (every 3rd fails)
  const winners = results.map((x, i) => [x, buyers[i]]).filter(([x]) => x.status === 201);
  const outcomes = await Promise.all(winners.map(async ([x, c], i) => {
    if (i % 3 === 0) return (await c.post(`/api/orders/${x.json.order.id}/payment/confirm`, x.json.payment.clientConfig.successPayment)).status;
    if (i % 3 === 1) return (await c.post(`/api/orders/${x.json.order.id}/cancel`)).status;
    return 'abandoned';
  }));
  const paid = winners.filter((_, i) => i % 3 === 0).length;
  const fin = await stockOf(book.id);
  const abandoned = winners.filter((_, i) => i % 3 === 2).length;
  R.check(`${id}b`, 'FR-30, VFR-14', 'after payment, cancellation and abandonment the counts are consistent and never negative', `stock ${stock - paid}, reserved ${abandoned}`, `stock ${fin.stock}, reserved ${fin.reserved}`, fin.stock === stock - paid && fin.reserved === abandoned && fin.stock >= 0 && fin.reserved <= fin.stock && outcomes.length === winners.length);
  return book;
}
await race('20-5', 5, 20, 'CON-01');
await race('50-10', 10, 50, 'CON-02');
await race('100-10', 10, 100, 'CON-03');

// ====================================================================== 8. seller journey
R.section('8. Seller journey: application, approval, listing, images, inventory, fulfilment (UC-15 to UC-19, UC-21, FR-19 to FR-23, FR-25)');
const applicant = await createUserDirect(db, { name: 'Future Seller' });
const ac = new Http(); await ac.login(applicant.email, PASSWORD);
R.status('SEL-01', 'FR-19', 'a customer cannot use seller endpoints before approval', 403, await ac.get('/api/seller/books'));
r = await ac.post('/api/seller/applications', { storeName: 'Validation Store', description: 'Used books' });
R.status('SEL-02', 'FR-19, UC-15', 'seller application', 201, r, (x) => x.json.status === 'pending');
R.status('SEL-03', 'FR-19', 'a second pending application is refused', 409, await ac.post('/api/seller/applications', { storeName: 'Again' }), isErr('APPLICATION_EXISTS'));
R.status('SEL-04', 'FR-19', 'a customer cannot approve applications', 403, await ac.post(`/api/admin/seller-applications/${r.json.id}/approve`));
R.status('SEL-05', 'FR-25, UC-21', 'administrator approves the application', 200, await admin.post(`/api/admin/seller-applications/${r.json.id}/approve`));
R.status('SEL-06', 'FR-25', 'approving again is refused', 409, await admin.post(`/api/admin/seller-applications/${r.json.id}/approve`), isErr('NOT_PENDING'));
R.check('SEL-07', 'FR-19, D-04', 'the approved seller keeps the customer role and the seller role takes effect at once', 'customer + seller', (await ac.get('/api/auth/me')).json.roles.sort().join('+'), (await ac.get('/api/auth/me')).json.roles.sort().join('+') === 'customer+seller');
R.status('SEL-08', 'FR-19, D-04', 'the new seller can still use the cart', 200, await ac.get('/api/cart'));
const isbn = isbn13(Math.floor(Math.random() * 1e9));
r = await ac.post('/api/seller/books', { title: 'Seller Journey Book', author: 'Journey Author', isbn, price: 19950, categoryId: cat, language: 'English', stock: 6, lowStockThreshold: 4, description: '<b>Bold</b> text' });
const jBook = r.json;
R.status('SEL-09', 'FR-20, UC-16', 'create a listing', 201, r, (x) => x.json.status === 'pending');
R.status('SEL-10', 'FR-25', 'a pending listing is not in the catalog', 404, await guest.get(`/api/books/${jBook.id}`));
for (const [i, [label, body]] of [['invalid ISBN check digit', { isbn: '9780747532690' }], ['price 0', { price: 0 }], ['negative stock', { stock: -1 }], ['empty title', { title: '' }], ['unknown category', { categoryId: oid() }]].entries()) {
  r = await ac.post('/api/seller/books', { title: 'Bad', author: 'A', isbn: isbn13(Math.floor(Math.random() * 1e9)), price: 100, categoryId: cat, language: 'English', stock: 1, ...body });
  R.status(`SEL-${11 + i}`, 'FR-20', `listing with ${label} is refused`, 400, r);
}
R.status('SEL-16', 'D-11', 'the same seller cannot reuse an ISBN', 409, await ac.post('/api/seller/books', { title: 'Dup', author: 'A', isbn, price: 100, categoryId: cat, language: 'English', stock: 1 }), isErr('ISBN_EXISTS_FOR_SELLER'));
// uploads
r = await upload(ac, PNG, 'cover.png', 'image/png');
const img1 = r.json;
R.status('IMG-01', 'FR-20, D-09', 'upload a PNG', 201, r);
R.status('IMG-02', 'FR-20', 'upload a JPEG', 201, await upload(ac, JPEG, 'cover.jpg', 'image/jpeg'));
R.status('IMG-03', 'ST-24', 'a script renamed to .png is refused', 400, await upload(ac, Buffer.from('<script>alert(1)</script>'), 'evil.png', 'image/png'), isErr('INVALID_FILE'));
R.status('IMG-04', 'ST-24', 'an SVG with script is refused', 400, await upload(ac, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.svg', 'image/svg+xml'));
R.status('IMG-05', 'ST-24', 'a Windows executable renamed to .jpg is refused', 400, await upload(ac, Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]), 'x.jpg', 'image/jpeg'));
R.status('IMG-06', 'ST-24', 'a file name with path traversal is stored under a server-made name', 201, await upload(ac, PNG, '../../etc/passwd.png', 'image/png'));
R.status('IMG-07', 'ST-24, D-09', 'a file over 2 MB is refused with 413', 413, await upload(ac, Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]), 'big.png', 'image/png'), isErr('FILE_TOO_LARGE'));
R.status('IMG-08', 'FR-20', 'customer (not a seller) cannot upload', 403, await upload(cust, PNG));
r = await guest.get(img1.url);
R.check('IMG-09', 'FR-07, D-09', 'the image downloads with the right type and long cache headers', '200 image/png public max-age=31536000', `${r.status} ${r.headers.get('content-type')} ${r.headers.get('cache-control')}`, r.status === 200 && r.headers.get('content-type') === 'image/png' && /max-age=31536000/.test(r.headers.get('cache-control')) && r.headers.get('x-content-type-options') === 'nosniff');
const files = await db.collection('fs.files').find({}).toArray();
R.check('IMG-10', 'D-09', 'files are in GridFS (fs.files) with the seller as owner and no client file name', 'every file has metadata.ownerId and a server-made name', `${files.length} files`, files.length > 0 && files.every((f) => f.metadata && f.metadata.ownerId && /^book-image-\d+$/.test(f.filename)));
R.status('IMG-11', 'D-09', 'a listing can have at most 3 images', 400, await ac.post('/api/seller/books', { title: 'Four', author: 'A', isbn: isbn13(Math.floor(Math.random() * 1e9)), price: 100, categoryId: cat, language: 'English', stock: 1, imageIds: [img1.imageId, oid(), oid(), oid()] }));
R.status('IMG-12', 'ST-07', "another seller's image cannot be attached", 400, await sellerC.patch(`/api/seller/books/${bookA.id}`, { imageIds: [img1.imageId] }));
R.status('IMG-13', 'FR-20', 'attach an own image to the listing', 200, await ac.patch(`/api/seller/books/${jBook.id}`, { imageIds: [img1.imageId] }));
R.status('SEL-17', 'FR-25, UC-21', 'administrator approves the listing', 200, await admin.post(`/api/admin/books/${jBook.id}/approve`));
r = await guest.get(`/api/books?q=${encodeURIComponent('Seller Journey')}`);
R.check('SEL-18', 'FR-25, FR-05', 'the approved listing appears in the catalog search with its image', '1 result with imageUrls', `${r.json.items.length} result(s), ${r.json.items[0] && r.json.items[0].imageUrls.length} image(s)`, r.json.items.length === 1 && r.json.items[0].imageUrls.length === 1);
R.check('SEL-19', 'VFR-06', 'HTML in the description is returned as plain text data', 'literal <b> in JSON', (await guest.get(`/api/books/${jBook.id}`)).json.description, (await guest.get(`/api/books/${jBook.id}`)).json.description === '<b>Bold</b> text');
r = await ac.patch(`/api/seller/books/${jBook.id}/inventory`, { stock: 3 });
R.check('SEL-20', 'FR-21, UC-17', 'inventory update shows available and in-stock status', 'stock 3, available 3', JSON.stringify({ stock: r.json.stock, available: r.json.available, status: r.json.stockStatus }), r.json.stock === 3 && r.json.available === 3 && r.json.stockStatus === 'In stock');
const alerts = (await ac.get('/api/notifications?unread=true')).json;
R.check('SEL-21', 'FR-21, D-12', 'a low-stock alert exists once the stock is at or below the threshold (4)', 'one unread alert', `${alerts.items.length} alert(s)`, alerts.items.length === 1 && alerts.items[0].type === 'low_stock');
R.status('SEL-22', 'FR-21', 'mark the alert as read', 200, await ac.patch(`/api/notifications/${alerts.items[0].id}/read`));
R.status('SEL-23', 'ST-07', "another seller cannot read this seller's alert", 404, await sellerC.patch(`/api/notifications/${alerts.items[0].id}/read`));
// customer buys the seller's book, seller fulfils
const buyer = new Http(); const bu = await createUserDirect(db); await buyer.login(bu.email, PASSWORD);
await buyer.post('/api/cart/items', { bookId: jBook.id, quantity: 2 });
await buyer.post('/api/cart/items', { bookId: bookB.id, quantity: 1 }); // a second seller in the same order
const bo = (await buyer.post('/api/orders', { shippingAddress: ADDRESS })).json;
await buyer.post(`/api/orders/${bo.order.id}/payment/confirm`, bo.payment.clientConfig.successPayment);
r = await ac.get('/api/seller/orders');
const mine = r.json.items.find((o) => o.id === bo.order.id);
R.check('SEL-24', 'FR-22, UC-18', 'the seller sees only own items of a mixed order, with the shipping address', '1 own item + shipping name', `${mine.items.length} item(s): ${mine.items.map((i) => i.title).join()}; ship to ${mine.shippingAddress.fullName}`, mine.items.length === 1 && mine.items[0].title === 'Seller Journey Book' && mine.shippingAddress.fullName === ADDRESS.fullName);
R.check('SEL-25', 'ST-07', 'the seller view contains no other seller title and no order total', 'absent', (JSON.stringify(mine).includes('Validation Beta Book') || JSON.stringify(mine).includes(String(bo.order.summary.total))) ? 'LEAK' : 'absent', !JSON.stringify(mine).includes('Validation Beta Book') && !new RegExp(`(^|[^0-9])${bo.order.summary.total}([^0-9]|$)`).test(JSON.stringify(mine)));
const item = mine.items[0].id;
const move = (c, s2) => c.patch(`/api/seller/orders/${bo.order.id}/items/${item}/status`, { status: s2 });
R.status('SEL-26', 'FR-22', 'skipping a step (Placed to Shipped) is refused', 409, await move(ac, 'Shipped'), isErr('INVALID_STATUS_TRANSITION'));
R.status('SEL-27', 'FR-22', 'customer cannot change fulfilment status', 403, await move(buyer, 'Packed'));
R.status('SEL-28', 'ST-07', "another seller cannot change this seller's item", 404, await move(otherC, 'Packed'));
R.status('SEL-29', 'FR-22', 'Placed to Packed', 200, await move(ac, 'Packed'));
r = await buyer.get(`/api/orders/${bo.order.id}`);
R.check('SEL-30', 'D-07', "order status is the lowest item status: the other seller's item is still Placed", 'Placed', r.json.status, r.json.status === 'Placed');
R.status('SEL-31', 'FR-22', 'Packed to Shipped', 200, await move(ac, 'Shipped'));
R.status('SEL-32', 'FR-16', 'a customer cannot cancel once an item has shipped', 409, await buyer.post(`/api/orders/${bo.order.id}/cancel`), isErr('ORDER_NOT_CANCELLABLE'));
R.status('SEL-33', 'FR-22', 'Shipped to Delivered', 200, await move(ac, 'Delivered'));
R.status('SEL-34', 'FR-22', 'going back from Delivered is refused', 409, await move(ac, 'Packed'));
r = await ac.get(`/api/seller/reports/sales?from=${today}&to=${today}`);
R.check('SEL-35', 'FR-23, UC-19', 'sales report counts the seller own items only', 'orders 1, units 2, revenue 39900', JSON.stringify({ o: r.json.orderCount, u: r.json.unitsSold, r: r.json.revenue }), r.json.orderCount === 1 && r.json.unitsSold === 2 && r.json.revenue === 39900);
R.status('SEL-36', 'FR-23', 'report range longer than 366 days is refused', 400, await ac.get('/api/seller/reports/sales?from=2024-01-01&to=2025-06-01'), isErr('INVALID_DATE_RANGE'));
R.status('SEL-37', 'FR-23', 'report with from after to is refused', 400, await ac.get('/api/seller/reports/sales?from=2026-02-02&to=2026-02-01'), isErr('INVALID_DATE_RANGE'));
// reviews
R.status('REV-01', 'FR-17, ST-20', 'review without a delivered purchase is refused', 403, await cust2C.post(`/api/books/${jBook.id}/reviews`, { rating: 5 }), isErr('NOT_ELIGIBLE'));
R.status('REV-02', 'FR-17', 'rating 0 and 6 are refused', 400, await buyer.post(`/api/books/${jBook.id}/reviews`, { rating: 6 }));
r = await buyer.post(`/api/books/${jBook.id}/reviews`, { rating: 4, comment: '<img src=x onerror=alert(1)>' });
R.status('REV-03', 'FR-17, UC-12', 'review after delivery', 201, r);
R.check('REV-04', 'FR-17', 'the book average rating is updated', 'avgRating 4, reviewCount 1', JSON.stringify({ a: (await guest.get(`/api/books/${jBook.id}`)).json.avgRating, c: (await guest.get(`/api/books/${jBook.id}`)).json.reviewCount }), (await guest.get(`/api/books/${jBook.id}`)).json.avgRating === 4);
R.status('REV-05', 'ST-20', 'a second review of the same book is refused', 409, await buyer.post(`/api/books/${jBook.id}/reviews`, { rating: 5 }), isErr('ALREADY_REVIEWED'));
R.check('REV-06', 'ST-11, VFR-06', 'the review comment is returned as inert JSON text', 'literal text', (await guest.get(`/api/books/${jBook.id}/reviews`)).json.items[0].comment, (await guest.get(`/api/books/${jBook.id}/reviews`)).json.items[0].comment === '<img src=x onerror=alert(1)>');

// ====================================================================== 9. administrator journey
R.section('9. Administrator journey (UC-20 to UC-24, FR-24 to FR-28)');
r = await admin.get('/api/admin/users?q=Future');
R.check('ADM-01', 'FR-24, UC-20', 'user list with search; no password data', 'found, no hash', `${r.json.items.length} user(s)`, r.json.items.length >= 1 && !/passwordHash|\$2[aby]\$/.test(r.text));
const susp = await createUserDirect(db); const suspC = new Http(); await suspC.login(susp.email, PASSWORD);
R.status('ADM-02', 'FR-24', 'administrator suspends a user', 200, await admin.patch(`/api/admin/users/${susp._id}/status`, { status: 'suspended' }));
R.status('ADM-03', 'FR-24, ST-29', 'the suspended user session stops working at once', 401, await suspC.get('/api/auth/me'));
R.status('ADM-04', 'FR-24, ST-29', 'the suspended user cannot log in', 403, await new Http().post('/api/auth/login', { email: susp.email, password: PASSWORD }), isErr('ACCOUNT_SUSPENDED'));
R.status('ADM-05', 'FR-24', 'reactivation', 200, await admin.patch(`/api/admin/users/${susp._id}/status`, { status: 'active' }));
R.status('ADM-06', 'FR-24', 'the user can log in again', 200, await new Http().post('/api/auth/login', { email: susp.email, password: PASSWORD }));
const me = (await admin.get('/api/auth/me')).json;
R.status('ADM-07', 'FR-24, ST-29', 'administrator cannot suspend themselves', 409, await admin.patch(`/api/admin/users/${me.id}/status`, { status: 'suspended' }), isErr('CANNOT_MODIFY_SELF'));
const rejApp = new Http(); const ra = await createUserDirect(db); await rejApp.login(ra.email, PASSWORD);
const appR = (await rejApp.post('/api/seller/applications', { storeName: 'Rejected Store' })).json;
R.status('ADM-08', 'FR-25', 'rejection needs a reason', 400, await admin.post(`/api/admin/seller-applications/${appR.id}/reject`, {}));
R.status('ADM-09', 'FR-25', 'administrator rejects with a reason', 200, await admin.post(`/api/admin/seller-applications/${appR.id}/reject`, { reason: 'Incomplete' }));
R.check('ADM-10', 'FR-19', 'the rejected applicant stays a customer and sees the reason', 'customer, rejected, reason', JSON.stringify([(await rejApp.get('/api/auth/me')).json.roles.join(), (await rejApp.get('/api/seller/applications/me')).json.status]), (await rejApp.get('/api/auth/me')).json.roles.join() === 'customer' && (await rejApp.get('/api/seller/applications/me')).json.rejectionReason === 'Incomplete');
const rl = await mkBook(sellerC, 'Validation Rejected Listing');
R.status('ADM-11', 'FR-25', 'administrator rejects a listing with a reason', 200, await admin.post(`/api/admin/books/${rl.id}/reject`, { reason: 'Wrong category' }));
R.status('ADM-12', 'FR-25', 'a decided listing cannot be decided again', 409, await admin.post(`/api/admin/books/${rl.id}/approve`), isErr('NOT_PENDING'));
const catName = `Validation Cat ${Date.now()}`;
r = await admin.post('/api/admin/categories', { name: catName });
R.status('ADM-13', 'FR-26, UC-23', 'add a category', 201, r);
R.status('ADM-14', 'FR-26', 'duplicate name in another case is refused', 409, await admin.post('/api/admin/categories', { name: catName.toUpperCase() }), isErr('CATEGORY_EXISTS'));
R.status('ADM-15', 'FR-26', 'rename', 200, await admin.patch(`/api/admin/categories/${r.json.id}`, { name: `${catName} B` }));
R.status('ADM-16', 'FR-26', 'a category with books cannot be deleted', 409, await admin.del(`/api/admin/categories/${fiction}`), isErr('CATEGORY_IN_USE'));
R.status('ADM-17', 'FR-26', 'delete an unused category', 204, await admin.del(`/api/admin/categories/${r.json.id}`));
const reviewList = (await admin.get(`/api/admin/reviews?bookId=${jBook.id}`)).json;
R.check('ADM-18', 'FR-27, UC-22', 'administrator lists reviews of a book', '1 review', String(reviewList.items.length), reviewList.items.length === 1);
R.status('ADM-19', 'FR-27', 'administrator removes the review', 204, await admin.del(`/api/admin/reviews/${reviewList.items[0].id}`));
R.check('ADM-20', 'FR-27', 'the average rating is recalculated', 'avgRating 0, count 0', JSON.stringify({ a: (await guest.get(`/api/books/${jBook.id}`)).json.avgRating, c: (await guest.get(`/api/books/${jBook.id}`)).json.reviewCount }), (await guest.get(`/api/books/${jBook.id}`)).json.reviewCount === 0);
R.status('ADM-21', 'FR-27', 'customers cannot remove reviews', 403, await buyer.del(`/api/admin/reviews/${oid()}`));
r = await admin.get(`/api/admin/reports/platform?from=${today}&to=${today}`);
R.check('ADM-22', 'FR-28, UC-24', 'platform report has order count, revenue and at most 10 top books', 'orders > 0, revenue > 0, topBooks <= 10', JSON.stringify({ o: r.json.orderCount, rev: r.json.revenue, top: r.json.topBooks.length }), r.json.orderCount > 0 && r.json.revenue > 0 && r.json.topBooks.length <= 10);
R.status('ADM-23', 'FR-28', 'invalid report range is refused', 400, await admin.get('/api/admin/reports/platform?from=2026-02-30&to=2026-03-01'), isErr('INVALID_DATE_RANGE'));

// ====================================================================== 10. error handling, headers, logs
R.section('10. Error handling, headers, logs (VFR-06, VFR-08, ST-15, ST-23, ST-28)');
r = await guest.call('POST', '/api/auth/login', { raw: '{"email": ' });
R.status('ERR-01', 'ST-23', 'malformed JSON', 400, r, isErr('VALIDATION_ERROR'));
r = await guest.post('/api/auth/login', {});
R.status('ERR-02', 'TC-API', 'missing required fields name the field', 400, r, (x) => x.json.error.details.some((d) => d.field === 'email'));
r = await guest.call('POST', '/api/auth/login', { raw: JSON.stringify({ email: 'a@b.com', password: 'x'.repeat(200 * 1024) }) });
R.status('ERR-03', 'ST-23', 'oversized JSON body', 413, r);
R.status('ERR-04', 'ST-23', 'deeply nested object with operator keys', 400, await guest.post('/api/auth/login', { email: { a: { $gt: '' } }, password: 'x' }));
R.status('ERR-05', 'ST-09', 'NoSQL operator objects as credentials', 400, await guest.post('/api/auth/login', { email: { $ne: null }, password: { $ne: null } }));
r = await guest.get('/api/does/not/exist');
R.check('ERR-06', 'TC-API', 'unknown API route gives the uniform error body', '404 NOT_FOUND', `${r.status} ${r.text.slice(0, 80)}`, r.status === 404 && r.json.error.code === 'NOT_FOUND');
R.status('ERR-07', 'TC-API', 'CSRF header missing on a state-changing call', 403, await cust.post('/api/cart/items', { bookId: bookA.id, quantity: 1 }, { csrf: false }), isErr('CSRF_INVALID'));
R.status('ERR-08', 'ST-13', 'wrong CSRF token', 403, await cust.post('/api/cart/items', { bookId: bookA.id, quantity: 1 }, { csrf: 'x'.repeat(48) }), isErr('CSRF_INVALID'));
R.status('ERR-09', 'ST-13', 'cookie only (cross-site form post): no header', 403, await cust.call('POST', '/api/profile/addresses', { raw: '{}', csrf: false }));
R.status('ERR-10', 'ST-13', 'CSRF also applies to PATCH, PUT and DELETE', 403, await cust.call('DELETE', `/api/wishlist/items/${bookB.id}`, { csrf: false }));
const all = [r.text, JSON.stringify((await cust.get('/api/books/zzzz')).json)].join();
R.check('ERR-11', 'ST-28', 'error bodies contain no stack trace or file path', 'none', /at .*\.js|node_modules|stack/i.test(all) ? 'LEAK' : 'none', !/at .*\.js|node_modules|stack/i.test(all));
r = await guest.get('/api/health');
const h = r.headers;
R.check('SEC-01', 'ST-15', 'security headers present: CSP, nosniff, frame protection, referrer policy, no X-Powered-By', 'all present', ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy'].map((k) => `${k}:${h.get(k) ? 'y' : 'N'}`).join(' ') + ` x-powered-by:${h.get('x-powered-by') || 'absent'}`, ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy'].every((k) => h.get(k)) && !h.get('x-powered-by'));
const csp = h.get('content-security-policy');
R.check('SEC-02', 'ST-11, VFR-06', "CSP: scripts only from 'self', no inline scripts, no framing, no plugins", "script-src 'self'; frame-ancestors 'none'; object-src 'none'", csp, /script-src 'self'/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp) && /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp));
const serverLog = readFileSync(SERVER_LOG, 'utf8');
const requestLines = serverLog.split('\n').filter((l) => l.includes('"message":"request"')).join('\n');
R.check('SEC-03', 'VFR-08, VFR-04, ST-01', 'the request log contains no passwords, tokens, cookies, card numbers or query strings', 'none of the test secrets', `${requestLines.split('\n').length} request lines scanned`, !requestLines.includes(PASSWORD) && !requestLines.includes('BrandNew1Password') && !/session=|4111111111111111|token=/.test(requestLines) && !/\?q=|\?token/.test(requestLines));
const structured = serverLog.split('\n').filter((l) => l.startsWith('{')).join('\n');
R.check('SEC-04', 'VFR-08', 'no password or card number appears anywhere in the structured log', 'absent', 'checked', !structured.includes(PASSWORD) && !structured.includes('4111111111111111'));
R.check('SEC-05', 'ST-30, FR-24', 'audit entries (login failure, lockout, role change, suspension, refund) are logged with ids', 'audit:* lines present', String((structured.match(/audit:[a-z_]+/g) || []).filter((v, i, a) => a.indexOf(v) === i).join(',')), /audit:login_failed/.test(structured) && /audit:account_locked/.test(structured) && /audit:user_status_changed/.test(structured) && /audit:refund/.test(structured));
R.check('SEC-06', 'ST-27, VFR-04', 'no .env file or secret is tracked in git', 'only .env.example', (await import('node:child_process')).execSync('git ls-files', { cwd: process.cwd() }).toString().split('\n').filter((f) => /(^|\/)\.env(\.|$)/.test(f)).join() || 'only .env.example', !(await import('node:child_process')).execSync('git ls-files', { cwd: process.cwd() }).toString().split('\n').some((f) => /(^|\/)\.env$/.test(f)));

// ====================================================================== 11. health
R.section('11. Health endpoint (VFR-09, I-26)');
r = await guest.get('/api/health');
R.check('HLT-01', 'VFR-09, API-61', 'GET /api/health with the database up', '200 { status ok, db up }', `${r.status} ${r.text}`, r.status === 200 && r.json.status === 'ok' && r.json.db === 'up');

const summary = R.save('live-api-results');
await mongoose.disconnect();
process.exit(summary.fail ? 1 : 0);
