// Measures GET /api/books (browse and search) on a catalogue of BOOKS books with CONCURRENCY parallel clients.
// Used to check VFR-02 (p95 <= 500 ms). Results depend on this machine and are only an indication.
// Usage: BENCH_BOOKS=10000 node scripts/bench-search.js   (needs the dev database: npm run dev:db)
const mongoose = require('mongoose');
const http = require('http');
const config = require('../src/config');
const { initDatabase } = require('../src/db/connect');
const { Book, Category } = require('../src/models');
const { buildSearchFields } = require('../src/modules/catalog/search');
const { createApp } = require('../src/app');

const BOOKS = Number(process.env.BENCH_BOOKS || 10000);
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY || 100);
const THINK_MS = Number(process.env.BENCH_THINK_MS || 0); // pause of each simulated user between requests
const REQUESTS = Number(process.env.BENCH_REQUESTS || 3000);
const WORDS = ['river', 'night', 'garden', 'history', 'science', 'story', 'house', 'king', 'road', 'light', 'ocean', 'secret', 'little', 'great', 'world', 'time', 'mountain', 'letters', 'design', 'engine'];
const NAMES = ['Anand', 'Brooks', 'Chen', 'Dutta', 'Evans', 'Farah', 'Gupta', 'Hughes', 'Iyer', 'Jones'];

const pick = (arr, i) => arr[i % arr.length];
function isbn13(n) {
  const body = `978${String(100000000 + n).slice(-9)}`;
  const sum = [...body].reduce((s, c, i) => s + Number(c) * (i % 2 === 0 ? 1 : 3), 0);
  return body + ((10 - (sum % 10)) % 10);
}

(async () => {
  const uri = config.mongodbUri.replace(/\/([^/?]+)\?/, '/bookstore_bench?');
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await initDatabase();
  const cats = await Category.insertMany(['Fiction', 'Science', 'History'].map((name) => ({ name })));
  const seller = new mongoose.Types.ObjectId();
  const docs = [];
  for (let i = 0; i < BOOKS; i += 1) {
    const title = `${pick(WORDS, i)} ${pick(WORDS, i * 7 + 3)} ${pick(WORDS, i * 13 + 5)} ${i}`;
    const author = `${pick(NAMES, i * 3)} ${pick(NAMES, i * 5 + 1)}`;
    const isbn = isbn13(i);
    docs.push({
      sellerId: seller, title, author, isbn, price: 5000 + (i % 200) * 100, categoryId: cats[i % 3]._id, language: i % 5 === 0 ? 'Hindi' : 'English',
      stock: 10, reserved: 0, status: 'approved', avgRating: (i % 50) / 10, ...buildSearchFields(title, author, isbn),
    });
  }
  await Book.insertMany(docs, { ordered: false });

  const { app } = createApp();
  const server = http.createServer(app).listen(0);
  const port = server.address().port;
  const queries = ['', '?q=river', '?q=night garden', '?q=anand', '?q=9780000', '?q=ri', `?category=${cats[1]._id}&sort=price_asc`, '?minRating=4&sort=rating_desc', '?q=mountain&maxPrice=9000', '?page=5'];
  const times = [];
  const byQuery = new Map();
  let errors = 0;
  let next = 0;
  const started = Date.now();
  async function worker() {
    while (next < REQUESTS) {
      const q = queries[next++ % queries.length];
      const t0 = process.hrtime.bigint();
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/books${q}`);
        await res.json();
        if (!res.ok) errors += 1;
      } catch {
        errors += 1;
      }
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      times.push(ms);
      byQuery.set(q, [...(byQuery.get(q) || []), ms]);
      if (THINK_MS) await new Promise((r) => setTimeout(r, THINK_MS));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const seconds = (Date.now() - started) / 1000;
  times.sort((a, b) => a - b);
  const pct = (p) => times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(1);
  console.log(JSON.stringify({ books: BOOKS, concurrency: CONCURRENCY, thinkMs: THINK_MS, requests: times.length, errors, errorRate: `${((errors / times.length) * 100).toFixed(2)}%`, seconds: Number(seconds.toFixed(1)), p50ms: Number(pct(0.5)), p95ms: Number(pct(0.95)), p99ms: Number(pct(0.99)), maxMs: Number(times[times.length - 1].toFixed(1)) }, null, 2));
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)].toFixed(0);
  for (const [q, a] of byQuery) console.log(`  median ${med(a).padStart(5)} ms  ${q || '(browse)'}`);
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
