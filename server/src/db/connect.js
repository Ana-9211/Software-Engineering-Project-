const mongoose = require('mongoose');
const models = require('../models');
const logger = require('../utils/logger');

// Database-level validators from SDD 8.2: stock >= 0, reserved >= 0, reserved <= stock, price > 0.
// They protect the invariant even if a code path forgets a check.
const BOOK_VALIDATOR = {
  $expr: {
    $and: [
      { $gte: ['$stock', 0] },
      { $gte: ['$reserved', 0] },
      { $lte: ['$reserved', '$stock'] },
      { $gt: ['$price', 0] },
    ],
  },
};

async function initDatabase() {
  const all = Object.values(models);
  // create collections first: transactions must not depend on implicit collection creation
  await Promise.all(all.map((m) => m.createCollection()));
  // wait for the automatic index builds, then bring the indexes in line with the schemas; changing the
  // collection validator while an index build runs is refused by MongoDB
  await Promise.all(all.map((m) => m.init()));
  await Promise.all(all.map((m) => m.syncIndexes()));
  await mongoose.connection.db.command({ collMod: 'books', validator: BOOK_VALIDATOR, validationLevel: 'strict', validationAction: 'error' });
}

async function connect(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  await initDatabase();
  logger.info('database connected');
}

async function disconnect() {
  await mongoose.disconnect();
}

module.exports = { connect, disconnect, initDatabase };
