// Phase 4 load test of the catalog / search API (VFR-02, VFR-03 indication) with the load generator in its OWN process.
// (server/scripts/bench-search.js runs the server and the load generator in one Node process, which understates what the
// server can do.) The server under test must be started separately on the benchmark database:
//   MONGODB_URI=mongodb://127.0.0.1:27017/bookstore_bench?replicaSet=rs0 PORT=5002 RATE_LIMIT_GLOBAL=1000000 node server/src/server.js
// Steps: node validation/loadtest.mjs seed   |   node validation/loadtest.mjs run   (LOAD_URL=http://localhost:5002)
import { createRequire } from 'node:module';
import path from 'node:path';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { ROOT, OUT, mongoose, isbn13 } from './lib.mjs';

if (process.argv[2] === 'seed') { process.env.NODE_ENV = 'test'; process.env.LOG_LEVEL = 'silent'; } // the seed step only needs the models, not the server secrets
const require = createRequire(import.meta.url);
const { buildSearchFields } = require(path.join(ROOT, 'server', 'src', 'modules', 'catalog', 'search.js'));
const mode = process.argv[2];
const BOOKS = Number(process.env.BENCH_BOOKS || 10000);
const URL_BASE = process.env.LOAD_URL || 'http://localhost:5002';
const WORDS = ['river', 'night', 'garden', 'history', 'science', 'story', 'house', 'king', 'road', 'light', 'ocean', 'secret', 'little', 'great', 'world', 'time', 'mountain', 'letters', 'design', 'engine'];
const NAMES = ['Anand', 'Brooks', 'Chen', 'Dutta', 'Evans', 'Farah', 'Gupta', 'Hughes', 'Iyer', 'Jones'];
const pick = (a, i) => a[i % a.length];

if (mode === 'seed') {
  await mongoose.connect('mongodb://127.0.0.1:27017/bookstore_bench?replicaSet=rs0');
  await mongoose.connection.dropDatabase();
  const models = require(path.join(ROOT, 'server', 'src', 'models'));
  const { initDatabase } = require(path.join(ROOT, 'server', 'src', 'db', 'connect.js'));
  await initDatabase();
  const cats = await models.Category.insertMany(['Fiction', 'Science', 'History'].map((name) => ({ name })));
  const seller = new mongoose.Types.ObjectId();
  const docs = [];
  for (let i = 0; i < BOOKS; i += 1) {
    const title = `${pick(WORDS, i)} ${pick(WORDS, i * 7 + 3)} ${pick(WORDS, i * 13 + 5)} ${i}`;
    const author = `${pick(NAMES, i * 3)} ${pick(NAMES, i * 5 + 1)}`;
    const isbn = isbn13(i);
    docs.push({ sellerId: seller, title, author, isbn, price: 5000 + (i % 200) * 100, categoryId: cats[i % 3]._id, language: i % 5 === 0 ? 'Hindi' : 'English', stock: 10, reserved: 0, status: 'approved', avgRating: (i % 50) / 10, ...buildSearchFields(title, author, isbn) });
  }
  await models.Book.insertMany(docs, { ordered: false });
  writeFileSync(path.join(OUT, '.loadtest-category'), String(cats[1]._id));
  console.log(`seeded ${BOOKS} books in bookstore_bench`);
  await mongoose.disconnect();
  process.exit(0);
}

const cat = readFileSync(path.join(OUT, '.loadtest-category'), 'utf8');
const queries = ['', '?q=river', '?q=night%20garden', '?q=anand', '?q=9780000', '?q=ri', `?category=${cat}&sort=price_asc`, '?minRating=4&sort=rating_desc', '?q=mountain&maxPrice=9000', '?page=5', '/__book'];
const users = Number(process.env.USERS || 100);
const thinkMs = Number(process.env.THINK_MS ?? 1000);
const total = Number(process.env.TOTAL || 3000);
const label = process.env.LABEL || 'run';
const times = [];
let errors = 0;
let next = 0;
let someBookId = null;
{
  const r = await (await fetch(`${URL_BASE}/api/books`)).json();
  someBookId = r.items[0].id;
}
const started = Date.now();
async function worker() {
  while (next < total) {
    let q = queries[next++ % queries.length];
    let url = `${URL_BASE}/api/books${q}`;
    if (q === '/__book') url = `${URL_BASE}/api/books/${someBookId}`;
    const t0 = process.hrtime.bigint();
    try {
      const res = await fetch(url);
      await res.text();
      if (!res.ok) errors += 1;
    } catch { errors += 1; }
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (thinkMs) await new Promise((r) => setTimeout(r, thinkMs));
  }
}
await Promise.all(Array.from({ length: users }, worker));
const seconds = (Date.now() - started) / 1000;
times.sort((a, b) => a - b);
const pct = (p) => Number(times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(1));
const result = { label, books: BOOKS, users, thinkMs, requests: times.length, errors, errorRate: `${((errors / times.length) * 100).toFixed(2)}%`, seconds: Number(seconds.toFixed(1)), throughputRps: Number((times.length / seconds).toFixed(1)), p50ms: pct(0.5), p95ms: pct(0.95), p99ms: pct(0.99), maxMs: Number(times[times.length - 1].toFixed(1)) };
console.log(JSON.stringify(result));
const file = path.join(OUT, 'loadtest-results.json');
const all = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
all.push({ ...result, at: new Date().toISOString() });
writeFileSync(file, JSON.stringify(all, null, 1));
process.exit(0);
