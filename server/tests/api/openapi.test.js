// VFR-15 / TC-VFR-15: the implemented routes must match docs/phase-2/design/openapi.yaml exactly.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execFileSync } = require('child_process');
const { setup, teardown, client } = require('../helpers/testContext');

const SPEC_PATH = path.join(__dirname, '../../../docs/phase-2/design/openapi.yaml');
const spec = yaml.load(fs.readFileSync(SPEC_PATH, 'utf8'));
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const operations = [];
for (const [p, item] of Object.entries(spec.paths)) {
  for (const m of METHODS) if (item[m]) operations.push({ method: m, path: p, id: item[m].operationId });
}

let ctx;
beforeAll(async () => { ctx = await setup(); });
afterAll(() => teardown(ctx));

// counts (route, method) pairs in the Express router tree
function countRoutes(stack) {
  let n = 0;
  for (const layer of stack) {
    if (layer.route) n += Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]).length;
    else if (layer.name === 'router' && layer.handle.stack) n += countRoutes(layer.handle.stack);
  }
  return n;
}

test('the OpenAPI document is valid OpenAPI 3 and lists 61 operations', () => {
  // the validator is an ES module, so it runs in its own node process
  const out = execFileSync('node', [path.join(__dirname, '../../scripts/validate-openapi.mjs')], { encoding: 'utf8' });
  expect(out).toContain('valid');
  expect(operations).toHaveLength(61);
});

test('the application defines exactly 61 route handlers: none missing, none extra', () => {
  expect(countRoutes(ctx.rawApp.router.stack)).toBe(61);
});

test.each(operations)('$method $path is implemented', async ({ method, path: p }) => {
  const url = p.replace(/\{(\w+)\}/g, 'a'.repeat(24));
  const api = client(ctx.app);
  const res = method === 'get' || method === 'delete' ? await api[method](url) : await api[method](url, {});
  // an unimplemented route would fall through to the generic "Route not found" answer
  const notImplemented = res.status === 404 && res.body && res.body.error && res.body.error.message === 'Route not found';
  expect(notImplemented).toBe(false);
  expect(res.status).not.toBe(405);
});

test('documented success status codes: 201 for creation, 204 for deletes', () => {
  const created = operations.filter((o) => spec.paths[o.path][o.method].responses['201']).map((o) => `${o.method} ${o.path}`);
  expect(created).toEqual(expect.arrayContaining(['post /api/auth/register', 'post /api/orders', 'post /api/seller/books']));
});

test('uniform error body on unknown routes', async () => {
  const res = await client(ctx.app).get('/api/does-not-exist');
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found', details: [] } });
});
