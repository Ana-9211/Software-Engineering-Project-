// Role-based access (FR-29, TC-FR-29): the test reads the access matrix of the Software Design Document
// (section 6.6) and checks every endpoint against every kind of caller.
const fs = require('fs');
const path = require('path');
const { setup, teardown, client, actor } = require('../helpers/testContext');

const SDD = fs.readFileSync(path.join(__dirname, '../../../docs/phase-2/design/Software-Design-Document.md'), 'utf8');

function readMatrix() {
  const start = SDD.indexOf('## 6.6 Role-based access matrix');
  const end = SDD.indexOf('# 7. ABI');
  const rows = [];
  for (const line of SDD.slice(start, end).split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (!/^API-\d+$/.test(cells[1] || '')) continue;
    rows.push({
      id: cells[1],
      method: cells[2],
      path: cells[3].replace(/`/g, ''),
      guest: cells[4] === 'Y',
      customer: cells[5] === 'Y',
      seller: cells[6] === 'Y',
      admin: cells[7] === 'Y',
    });
  }
  return rows;
}

const ID = 'a'.repeat(24);
const fill = (p) => p.replace(/:\w+/g, ID);

let ctx;
let principals;
const matrix = readMatrix();

beforeAll(async () => {
  ctx = await setup();
  principals = {
    guest: { api: client(ctx.app), roles: [] },
    customer: { api: (await actor(ctx, { roles: ['customer'] })).api, roles: ['customer'] },
    seller: { api: (await actor(ctx, { roles: ['customer', 'seller'] })).api, roles: ['customer', 'seller'] },
    admin: { api: (await actor(ctx, { roles: ['admin'] })).api, roles: ['admin'] },
  };
});
afterAll(() => teardown(ctx));

test('the matrix in the design document has all 61 endpoints', () => {
  expect(matrix).toHaveLength(61);
  expect(new Set(matrix.map((r) => r.id)).size).toBe(61);
});

// A caller is allowed when one of their roles has Y; the guest column covers callers with no session.
function allowed(row, principalName, roles) {
  if (principalName === 'guest') return row.guest;
  return roles.some((r) => row[r === 'customer' ? 'customer' : r === 'seller' ? 'seller' : 'admin']);
}

describe.each(['guest', 'customer', 'seller', 'admin'])('access as %s', (name) => {
  test.each(matrix.filter((r) => r.id !== 'API-29'))('$id $method $path', async (row) => {
    // logout and password-related calls change the session, so those run on a throw-away account
    let api = principals[name].api;
    if (name !== 'guest' && row.id === 'API-06') {
      api = (await actor(ctx, { roles: principals[name].roles })).api;
    }
    const url = fill(row.path);
    const method = row.method.toLowerCase();
    const res = method === 'get' || method === 'delete' ? await api[method](url) : await api[method](url, {});
    if (row.id === 'API-01') api.resetCsrf(); // the csrf-token endpoint issues a new token and cookie
    const ok = allowed(row, name, principals[name].roles);
    if (ok) {
      expect([401, 403]).not.toContain(res.status); // may be 400/404/409... but never refused for role reasons
    } else if (name === 'guest') {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    } else {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });
});

test('API-29 webhook accepts nobody without a valid signature', async () => {
  for (const name of ['guest', 'customer', 'seller', 'admin']) {
    const res = await principals[name].api.agent.post('/api/payments/webhook').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_SIGNATURE');
  }
});

test('an approved seller keeps the customer role: customer endpoints work for a seller account (D-04)', async () => {
  expect((await principals.seller.api.get('/api/cart')).status).toBe(200);
  expect((await principals.seller.api.get('/api/seller/books')).status).toBe(200);
});

test('an administrator is not a customer or a seller (D-04)', async () => {
  expect((await principals.admin.api.get('/api/cart')).status).toBe(403);
  expect((await principals.admin.api.get('/api/seller/books')).status).toBe(403);
});
