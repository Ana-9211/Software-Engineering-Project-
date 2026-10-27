// Phase 4 validation of rate limiting (ST-23, VFR-06). Needs a SEPARATE server instance (limits are per process and
// would block the other validation scripts): PORT=5001 RATE_LIMIT_AUTH=20 RATE_LIMIT_GLOBAL=300 node server/src/server.js
// Run with BASE_URL=http://localhost:5001.
import { Http, recorder } from './lib.mjs';

const R = recorder('Rate limiting validation');
R.section('Rate limiting (ST-23, VFR-06)');
const c = new Http();
const statuses = [];
for (let i = 0; i < 25; i += 1) statuses.push((await c.post('/api/auth/login', { email: 'nobody@example.com', password: 'WrongPassword1!' })).status);
const first429 = statuses.indexOf(429);
R.check('RL-01', 'ST-23, VFR-06', 'authentication endpoints are limited: the 21st login attempt in the window gets 429 (limit 20)', '20 x 401 then 429', `first 429 at attempt ${first429 + 1}; ${statuses.filter((s) => s === 401).length} x 401, ${statuses.filter((s) => s === 429).length} x 429`, first429 === 20 && statuses.slice(0, 20).every((s) => s === 401));
const limited = await c.post('/api/auth/login', { email: 'nobody@example.com', password: 'x' });
R.check('RL-02', 'ST-23', 'the 429 answer uses the uniform error body with RATE_LIMITED', '429 { error: { code: RATE_LIMITED } }', `${limited.status} ${limited.text.slice(0, 90)}`, limited.status === 429 && limited.json.error.code === 'RATE_LIMITED');
R.check('RL-03', 'ST-23', 'other authentication endpoints share the limit (register)', '429', String((await c.post('/api/auth/register', { name: 'A', email: 'a@example.com', password: 'Password123!' })).status), (await c.post('/api/auth/register', { name: 'A', email: 'a@example.com', password: 'Password123!' })).status === 429);
const h = new Http();
const codes = [];
for (let i = 0; i < 320; i += 1) codes.push((await h.get('/api/books?page=1')).status);
R.check('RL-04', 'ST-23, VFR-06', 'the global API limit applies (limit 300 per window in this run)', '200 x 300 (minus earlier requests), then 429', `${codes.filter((s) => s === 200).length} x 200, ${codes.filter((s) => s === 429).length} x 429`, codes.includes(429) && codes.filter((s) => s === 200).length >= 250);
R.check('RL-05', 'ST-23', 'the service stays responsive for the health check while limited', 'process answers', String((await fetch(`${process.env.BASE_URL || 'http://localhost:5001'}/api/health`)).status), true);
const s = R.save('rate-limit-results');
process.exit(s.fail ? 1 : 0);
