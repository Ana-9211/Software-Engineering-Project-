const bcrypt = require('bcryptjs');

// bcrypt with a per-hash salt; cost comes from configuration and is never below 10 (VFR-04).
function createPasswordService({ config }) {
  // used to spend the same time when the email is unknown, so login timing does not reveal accounts
  const dummyHash = bcrypt.hashSync('not-a-real-password', config.bcryptCost);
  return {
    hash: (plain) => bcrypt.hash(plain, config.bcryptCost),
    compare: (plain, hash) => bcrypt.compare(plain, hash),
    spendTime: (plain) => bcrypt.compare(plain, dummyHash),
  };
}

module.exports = { createPasswordService };
