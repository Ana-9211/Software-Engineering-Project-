// Starts a local single-node MongoDB replica set for development (transactions need a replica set).
// It uses mongodb-memory-server, so nothing has to be installed. Data is kept in ../.mongo-data.
// Alternatives: Docker (docker compose up -d) or MongoDB Atlas; set MONGODB_URI accordingly.
const path = require('path');
const fs = require('fs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

(async () => {
  const dbPath = path.join(__dirname, '..', '..', '.mongo-data');
  fs.mkdirSync(dbPath, { recursive: true });
  const rs = await MongoMemoryReplSet.create({
    instanceOpts: [{ port: 27017, dbPath, storageEngine: 'wiredTiger' }],
    replSet: { name: 'rs0', count: 1, dbName: 'bookstore' },
  });
  console.log(`Local MongoDB replica set is running.\nMONGODB_URI=mongodb://127.0.0.1:27017/bookstore?replicaSet=rs0\nPress Ctrl+C to stop.`);
  const stop = async () => {
    await rs.stop({ doCleanup: false });
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
