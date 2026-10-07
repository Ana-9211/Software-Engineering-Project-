// One in-memory MongoDB replica set for the whole test run (transactions need a replica set).
const { MongoMemoryReplSet } = require('mongodb-memory-server');

module.exports = async () => {
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  globalThis.__MONGO_RS__ = rs;
  process.env.MONGO_TEST_URI = rs.getUri();
};
