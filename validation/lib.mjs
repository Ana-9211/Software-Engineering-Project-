// Shared helpers for the Phase 4 validation scripts: a small HTTP client with a cookie jar and CSRF handling,
// a recorder that stores expected and actual results, and direct database access for test fixtures and
// invariant checks (fixtures are created in the database only where the application has no use case for them,
// for example bulk customer accounts).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASE = process.env.BASE_URL || 'http://localhost:5000';
export const SERVER_LOG = process.env.SERVER_LOG || '/tmp/p4/server.log';
export const OUT = process.env.EVIDENCE_DIR ? path.resolve(process.env.EVIDENCE_DIR) : path.join(ROOT, 'docs', 'phase-4', 'evidence'); // Sprint 2 runs write to docs/sprint-2/evidence
mkdirSync(OUT, { recursive: true });

export const mongoose = require(path.join(ROOT, 'node_modules', 'mongoose'));
export const bcrypt = require(path.join(ROOT, 'node_modules', 'bcryptjs'));
export const jwt = require(path.join(ROOT, 'node_modules', 'jsonwebtoken'));

export function readEnvFile() {
  const file = path.join(ROOT, 'server', '.env');
  const env = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line);
      if (m) env[m[1]] = m[2];
    }
  }
  return env;
}

export class Http {
  constructor() {
    this.jar = new Map();
    this.csrf = null;
  }

  cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  store(res) {
    for (const line of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const dead = attrs.some((a) => /^\s*max-age=0/i.test(a)) || attrs.some((a) => /^\s*expires=.*1970/i.test(a));
      if (dead || value === '') this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }

  async fetchCsrf() {
    const res = await fetch(`${BASE}/api/auth/csrf-token`, { headers: { Cookie: this.cookieHeader() } });
    this.store(res);
    this.csrf = (await res.json()).csrfToken;
  }

  // csrf: true = correct token, false = none, string = that value
  async call(method, url, { body, form, headers = {}, csrf = true, raw, cookies } = {}) {
    const h = { Accept: 'application/json', ...headers };
    const ck = cookies !== undefined ? cookies : this.cookieHeader();
    if (ck) h.Cookie = ck;
    if (!['GET', 'HEAD'].includes(method) && csrf !== false) {
      if (!this.csrf) await this.fetchCsrf();
      h['X-CSRF-Token'] = csrf === true ? this.csrf : csrf;
      if (cookies === undefined) h.Cookie = this.cookieHeader();
    }
    const init = { method, headers: h, redirect: 'manual' };
    if (form) init.body = form;
    else if (raw !== undefined) {
      init.body = raw;
      h['Content-Type'] = h['Content-Type'] || 'application/json';
    } else if (body !== undefined) {
      init.body = JSON.stringify(body);
      h['Content-Type'] = 'application/json';
    }
    const res = await fetch(BASE + url, init);
    this.store(res);
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, headers: res.headers, json, text };
  }

  get(url, o) { return this.call('GET', url, o); }
  post(url, body, o) { return this.call('POST', url, { body, ...o }); }
  put(url, body, o) { return this.call('PUT', url, { body, ...o }); }
  patch(url, body, o) { return this.call('PATCH', url, { body, ...o }); }
  del(url, o) { return this.call('DELETE', url, o); }

  async login(email, password) {
    const r = await this.post('/api/auth/login', { email, password });
    if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${r.text}`);
    return r.json;
  }
}

// ---------------------------------------------------------------- recorder
export function recorder(name) {
  const rows = [];
  let section = '';
  const api = {
    section(title) { section = title; process.stdout.write(`\n== ${title}\n`); },
    // id, refs (requirements / use cases / ST / TC), description, expected, actual (string), ok (boolean)
    check(id, refs, description, expected, actual, ok) {
      rows.push({ id, section, refs, description, expected: String(expected), actual: String(actual).slice(0, 220), result: ok ? 'PASS' : 'FAIL' });
      process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${description}${ok ? '' : `\n      expected ${expected}; actual ${String(actual).slice(0, 200)}`}\n`);
    },
    status(id, refs, description, expectedStatus, res, extra) {
      const codeOk = extra === undefined ? true : extra(res);
      api.check(id, refs, description, `HTTP ${expectedStatus}`, `HTTP ${res.status}${res.json && res.json.error ? ' ' + res.json.error.code : ''}`, res.status === expectedStatus && codeOk);
    },
    rows,
    summary() {
      const pass = rows.filter((r) => r.result === 'PASS').length;
      return { name, total: rows.length, pass, fail: rows.length - pass };
    },
    save(file = name) {
      const s = api.summary();
      writeFileSync(path.join(OUT, `${file}.json`), JSON.stringify({ ...s, generatedAt: new Date().toISOString(), rows }, null, 1));
      const md = [`# ${name}`, '', `${s.pass} of ${s.total} checks passed${s.fail ? `, ${s.fail} FAILED` : ''}.`, '', '| ID | Refs | Check | Expected | Actual | Result |', '|---|---|---|---|---|---|'];
      for (const r of rows) md.push(`| ${r.id} | ${r.refs} | ${r.description.replace(/\|/g, '/')} | ${r.expected.replace(/\|/g, '/')} | ${r.actual.replace(/\|/g, '/')} | ${r.result} |`);
      writeFileSync(path.join(OUT, `${file}.md`), md.join('\n') + '\n');
      process.stdout.write(`\n${name}: ${s.pass}/${s.total} passed${s.fail ? `, ${s.fail} FAILED` : ''}\n`);
      return s;
    },
  };
  return api;
}

// ---------------------------------------------------------------- emails (console mailer prints them to the server log)
export async function emailLink(to, kind, sinceIndex = 0) {
  for (let i = 0; i < 40; i += 1) {
    const text = readFileSync(SERVER_LOG, 'utf8');
    const blocks = text.split('--- email').slice(1).filter((b) => b.includes(`To: ${to}`) && b.toLowerCase().includes(kind));
    const last = blocks[blocks.length - 1];
    const m = last && /(https?:\/\/\S+\?token=[a-f0-9]+)/.exec(last);
    if (m && blocks.length > sinceIndex) return { link: m[1], token: m[1].split('token=')[1], count: blocks.length };
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}
export const emailCount = (to, kind) =>
  readFileSync(SERVER_LOG, 'utf8').split('--- email').slice(1).filter((b) => b.includes(`To: ${to}`) && b.toLowerCase().includes(kind)).length;

// ---------------------------------------------------------------- database access
export async function connectDb() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bookstore?replicaSet=rs0';
  await mongoose.connect(uri);
  return mongoose.connection.db;
}

let counter = 0;
export const uniqueEmail = (p = 'val') => `${p}.${Date.now()}.${counter++}@example.com`;
export const PASSWORD = 'Valid1Password!';
let hash;
export async function createUserDirect(db, { roles = ['customer'], status = 'active', name = 'Validation User', email } = {}) {
  hash = hash || (await bcrypt.hash(PASSWORD, 10));
  const doc = {
    name, email: email || uniqueEmail(), passwordHash: hash, roles, status, emailVerifiedAt: new Date(), addresses: [],
    failedLoginCount: 0, tokenVersion: 0, createdAt: new Date(), updatedAt: new Date(), __v: 0,
  };
  const r = await db.collection('users').insertOne(doc);
  return { ...doc, _id: r.insertedId };
}

export const ADDRESS = { fullName: 'Val Idator', line1: '1 Test Street', city: 'Chennai', state: 'TN', postalCode: '600001', country: 'India', phone: '9000000001' };

export function isbn13(seed) {
  const body = `978${String(seed).padStart(9, '0').slice(-9)}`;
  const sum = [...body].reduce((s, c, i) => s + Number(c) * (i % 2 === 0 ? 1 : 3), 0);
  return body + ((10 - (sum % 10)) % 10);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
