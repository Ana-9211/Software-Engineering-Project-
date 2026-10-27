// Database backup and restore without the MongoDB command-line tools (VFR-14).
//   node scripts/backup-db.js backup  [dir]                 writes <dir>/<timestamp>/<collection>.jsonl.gz and manifest.json
//   node scripts/backup-db.js restore <backupDir> [dbName]  restores into dbName (default: the database in MONGODB_URI)
//   node scripts/backup-db.js verify  <backupDir> [dbName]  compares document counts with the manifest
// Every collection is exported, including the GridFS image collections (fs.files, fs.chunks). Documents are
// stored as Extended JSON, so ObjectIds, dates and binary data survive. Restore refuses to write into a
// non-empty database unless RESTORE_DROP=1 is set. Run it daily from a scheduler (see docs/sprint-2/deployment.md).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const mongoose = require('mongoose');
const config = require('../src/config');

const { EJSON } = mongoose.mongo.BSON;
const BATCH = 500;

function withDbName(uri, name) {
  return name ? uri.replace(/\/([^/?]*)(\?|$)/, `/${name}$2`) : uri;
}

async function backup(rootDir) {
  await mongoose.connect(config.mongodbUri);
  const db = mongoose.connection.db;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(rootDir, stamp);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = { createdAt: new Date().toISOString(), database: db.databaseName, collections: {} };
  for (const info of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (info.name.startsWith('system.')) continue;
    const gz = zlib.createGzip();
    const out = fs.createWriteStream(path.join(dir, `${info.name}.jsonl.gz`));
    gz.pipe(out);
    let n = 0;
    for await (const doc of db.collection(info.name).find({})) {
      if (!gz.write(`${EJSON.stringify(doc, { relaxed: false })}\n`)) await new Promise((r) => gz.once('drain', r));
      n += 1;
    }
    gz.end();
    await new Promise((r) => out.on('finish', r));
    manifest.collections[info.name] = n;
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await mongoose.disconnect();
  return { dir, manifest };
}

async function restore(dir, dbName) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  await mongoose.connect(withDbName(config.mongodbUri, dbName));
  const db = mongoose.connection.db;
  const existing = (await db.listCollections({}, { nameOnly: true }).toArray()).filter((c) => !c.name.startsWith('system.'));
  const occupied = [];
  for (const c of existing) if ((await db.collection(c.name).estimatedDocumentCount()) > 0) occupied.push(c.name);
  if (occupied.length > 0) {
    if (process.env.RESTORE_DROP !== '1') {
      await mongoose.disconnect();
      throw new Error(`database ${db.databaseName} is not empty (${occupied.join(', ')}); set RESTORE_DROP=1 to replace it`);
    }
    await db.dropDatabase();
  }
  for (const name of Object.keys(manifest.collections)) {
    const col = db.collection(name);
    const lines = readline.createInterface({ input: fs.createReadStream(path.join(dir, `${name}.jsonl.gz`)).pipe(zlib.createGunzip()), crlfDelay: Infinity });
    let batch = [];
    for await (const line of lines) {
      if (!line) continue;
      batch.push(EJSON.parse(line, { relaxed: false }));
      if (batch.length >= BATCH) { await col.insertMany(batch, { ordered: false }); batch = []; }
    }
    if (batch.length) await col.insertMany(batch, { ordered: false });
  }
  // the indexes are recreated by the application at start-up (initDatabase); the data is what is restored here
  await mongoose.disconnect();
  return manifest;
}

async function verify(dir, dbName) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  await mongoose.connect(withDbName(config.mongodbUri, dbName));
  const db = mongoose.connection.db;
  const rows = [];
  for (const [name, expected] of Object.entries(manifest.collections)) {
    const actual = await db.collection(name).countDocuments({});
    rows.push({ collection: name, expected, actual, ok: expected === actual });
  }
  await mongoose.disconnect();
  return rows;
}

(async () => {
  const [mode, a, b] = process.argv.slice(2);
  if (mode === 'backup') {
    const { dir, manifest } = await backup(a || path.join(__dirname, '..', '..', 'backups'));
    process.stdout.write(`${JSON.stringify({ backup: dir, ...manifest })}\n`);
  } else if (mode === 'restore' && a) {
    const manifest = await restore(a, b);
    process.stdout.write(`restored ${Object.keys(manifest.collections).length} collections\n`);
  } else if (mode === 'verify' && a) {
    const rows = await verify(a, b);
    process.stdout.write(`${JSON.stringify(rows)}\n`);
    if (rows.some((r) => !r.ok)) process.exit(1);
  } else {
    process.stderr.write('usage: backup-db.js backup [dir] | restore <dir> [dbName] | verify <dir> [dbName]\n');
    process.exit(2);
  }
})().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
