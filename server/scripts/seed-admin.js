// Creates (or re-activates) the administrator account. Phase 1 has no use case to create administrators
// (SDD 8.5), so this script reads the email and password from ADMIN_EMAIL and ADMIN_PASSWORD.
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const { connect, disconnect } = require('../src/db/connect');
const { User } = require('../src/models');

(async () => {
  if (!config.adminEmail || !config.adminPassword) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment first');
  }
  if (config.adminPassword.length < 8 || config.adminPassword.length > 72) throw new Error('ADMIN_PASSWORD must be 8 to 72 characters');
  await connect(config.mongodbUri);
  const passwordHash = await bcrypt.hash(config.adminPassword, config.bcryptCost);
  const email = config.adminEmail.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.roles = ['admin'];
    existing.status = 'active';
    existing.emailVerifiedAt = existing.emailVerifiedAt || new Date();
    existing.tokenVersion += 1;
    await existing.save();
    console.log(`Administrator ${email} updated`);
  } else {
    await User.create({ name: 'Administrator', email, passwordHash, roles: ['admin'], status: 'active', emailVerifiedAt: new Date() });
    console.log(`Administrator ${email} created`);
  }
  await disconnect();
})().catch(async (err) => {
  console.error(err.message);
  await disconnect().catch(() => {});
  process.exit(1);
});
