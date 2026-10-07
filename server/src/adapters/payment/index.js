const { FakeGateway } = require('./fakeGateway');

// The payment provider is TBD (Architecture 11.3). A real provider adapter must implement the same four
// methods as FakeGateway and be added here. Until then only the fake gateway exists.
function createGateway(config) {
  switch (config.payment.provider) {
    case 'fake':
      return new FakeGateway({ keySecret: config.payment.keySecret, webhookSecret: config.payment.webhookSecret });
    default:
      throw new Error(`Unknown PAYMENT_PROVIDER "${config.payment.provider}". No real provider adapter has been written yet.`);
  }
}

module.exports = { createGateway };
