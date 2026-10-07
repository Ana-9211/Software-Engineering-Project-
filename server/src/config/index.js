// Only this file reads environment variables (SDD section 3, "Configuration").
require('dotenv').config({ quiet: true });

function build(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isTest = nodeEnv === 'test';
  const isProd = nodeEnv === 'production';

  const required = ['MONGODB_URI', 'JWT_SECRET', 'CSRF_SECRET'];
  if (!isTest) {
    const missing = required.filter((name) => !env[name]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}. See .env.example`);
    }
  }

  const int = (name, fallback) => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n)) throw new Error(`${name} must be an integer`);
    return n;
  };

  const bcryptCost = int('BCRYPT_COST', 12);
  if (bcryptCost < 10) throw new Error('BCRYPT_COST must be 10 or higher (VFR-04)');

  return {
    nodeEnv,
    isTest,
    isProd,
    port: int('PORT', 5000),
    mongodbUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bookstore?replicaSet=rs0',
    jwtSecret: env.JWT_SECRET || 'test-jwt-secret-not-for-production',
    csrfSecret: env.CSRF_SECRET || 'test-csrf-secret-not-for-production',
    bcryptCost,
    sessionMinutes: 60, // FR-02
    cookieSecure: isProd,
    payment: {
      provider: env.PAYMENT_PROVIDER || 'fake',
      keyId: env.PAYMENT_KEY_ID || '',
      keySecret: env.PAYMENT_KEY_SECRET || 'fake-gateway-secret',
      webhookSecret: env.PAYMENT_WEBHOOK_SECRET || 'fake-webhook-secret',
    },
    mail: {
      provider: env.MAIL_PROVIDER || 'console',
      host: env.MAIL_HOST || '',
      user: env.MAIL_USER || '',
      password: env.MAIL_PASSWORD || '',
      from: env.MAIL_FROM || 'Online Bookstore <no-reply@bookstore.local>',
    },
    // Pricing values are TBD in Phase 2 (A-03); these are the documented defaults.
    currency: env.CURRENCY || 'INR',
    taxRatePercent: int('TAX_RATE_PERCENT', 5),
    shippingFlatFee: int('SHIPPING_FLAT_FEE', 4900),
    appBaseUrl: env.APP_BASE_URL || 'http://localhost:5173',
    rateLimitGlobal: int('RATE_LIMIT_GLOBAL', isTest ? 100000 : 300),
    rateLimitAuth: int('RATE_LIMIT_AUTH', isTest ? 100000 : 20),
    reservationMinutes: int('RESERVATION_MINUTES', 15),
    logLevel: env.LOG_LEVEL || (isTest ? 'silent' : 'info'),
    clientDist: env.CLIENT_DIST || '',
    // used only by the seed-admin script (Phase 1 has no use case that creates administrators)
    adminEmail: env.ADMIN_EMAIL || '',
    adminPassword: env.ADMIN_PASSWORD || '',
  };
}

module.exports = build();
module.exports.build = build;
