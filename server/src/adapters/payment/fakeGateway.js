const crypto = require('crypto');

class GatewayError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GatewayError';
  }
}

class SignatureError extends Error {
  constructor(message = 'Invalid signature') {
    super(message);
    this.name = 'SignatureError';
  }
}

const hmac = (secret, text) => crypto.createHmac('sha256', secret).update(text).digest('hex');

// Development and test gateway. It is NOT a real payment provider (the provider is TBD, Architecture 11.3).
// It implements the four methods of the PaymentGateway contract (SDD 7.2) and simulates the hosted
// payment form by returning a "success" and a "failure" payment in clientConfig. No card data is involved.
//
//   createPayment(amount, currency, reference)      -> { gatewayOrderId, clientConfig }
//   verifyPayment(gatewayOrderId, paymentId, sig)   -> boolean
//   verifyWebhook(rawBody, signature)               -> parsed event, or throws SignatureError
//   refund(paymentId, amount)                       -> { gatewayRefundId, status }
class FakeGateway {
  constructor({ keySecret = 'fake-gateway-secret', webhookSecret = 'fake-webhook-secret' } = {}) {
    this.name = 'fake';
    this.keySecret = keySecret;
    this.webhookSecret = webhookSecret;
    this.failures = new Set(); // 'create' | 'verify' | 'refund': make the next such call throw GatewayError
    this.calls = { create: 0, verify: 0, refund: 0 };
  }

  failNext(operation) {
    this.failures.add(operation);
  }

  _maybeFail(operation) {
    if (this.failures.has(operation)) {
      this.failures.delete(operation);
      throw new GatewayError(`fake gateway ${operation} failure`);
    }
  }

  sign(gatewayOrderId, paymentId) {
    return hmac(this.keySecret, `${gatewayOrderId}|${paymentId}`);
  }

  async createPayment(amount, currency, reference) {
    this.calls.create += 1;
    this._maybeFail('create');
    const suffix = crypto.randomBytes(8).toString('hex');
    const gatewayOrderId = `fake_order_${suffix}`;
    const okId = `fake_pay_${suffix}`;
    const badId = `fake_fail_${suffix}`;
    return {
      gatewayOrderId,
      clientConfig: {
        mode: 'fake',
        reference,
        amount,
        currency,
        successPayment: { gatewayPaymentId: okId, gatewaySignature: this.sign(gatewayOrderId, okId) },
        failurePayment: { gatewayPaymentId: badId, gatewaySignature: this.sign(gatewayOrderId, badId) },
      },
    };
  }

  async verifyPayment(gatewayOrderId, paymentId, signature) {
    this.calls.verify += 1;
    this._maybeFail('verify');
    if (typeof paymentId !== 'string' || !paymentId.startsWith('fake_pay_')) return false;
    if (typeof signature !== 'string') return false;
    const expected = Buffer.from(this.sign(gatewayOrderId, paymentId));
    const given = Buffer.from(signature);
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  }

  verifyWebhook(rawBody, signature) {
    const expected = Buffer.from(hmac(this.webhookSecret, rawBody));
    const given = Buffer.from(typeof signature === 'string' ? signature : '');
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) throw new SignatureError();
    try {
      return JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new SignatureError('Malformed event');
    }
  }

  signWebhook(rawBody) {
    return hmac(this.webhookSecret, rawBody);
  }

  async refund(paymentId, amount) {
    this.calls.refund += 1;
    this._maybeFail('refund');
    return { gatewayRefundId: `fake_refund_${crypto.randomBytes(6).toString('hex')}`, status: 'processed', amount, paymentId };
  }
}

module.exports = { FakeGateway, GatewayError, SignatureError };
