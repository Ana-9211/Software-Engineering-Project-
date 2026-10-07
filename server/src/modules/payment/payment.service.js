const { AppError } = require('../../utils/AppError');
const logger = require('../../utils/logger');
const { GatewayError, SignatureError } = require('../../adapters/payment/fakeGateway');

// BM-07 Payment. All gateway calls go through the PaymentGateway adapter (I-11); no card data ever
// enters or leaves this service (VFR-08). Gateway calls are never made inside a database transaction.
function createPaymentService({ repo, gateway, config, clock }) {
  const gatewayError = (err) => {
    logger.warn('payment gateway error', { error: err.message });
    return new AppError('PAYMENT_GATEWAY_ERROR', 502, 'The payment gateway could not be reached');
  };

  return {
    // I-08: create the payment at the gateway and the local record
    async createPaymentSession(order) {
      let created;
      try {
        created = await gateway.createPayment(order.total, config.currency, order.orderNumber);
      } catch (err) {
        if (err instanceof GatewayError) throw gatewayError(err);
        throw err;
      }
      await repo.create({
        orderId: order._id,
        gateway: gateway.name,
        gatewayOrderId: created.gatewayOrderId,
        amount: order.total,
        currency: config.currency,
        status: 'created',
      });
      return {
        gatewayOrderId: created.gatewayOrderId,
        amount: order.total,
        currency: config.currency,
        clientConfig: created.clientConfig,
      };
    },

    findByOrder: (orderId, opts) => repo.findByOrderId(orderId, opts),
    findByGatewayOrderId: (gatewayOrderId) => repo.findByGatewayOrderId(gatewayOrderId),

    // true when the gateway confirms the payment
    async verifyPayment(order, { gatewayPaymentId, gatewaySignature }) {
      const payment = await repo.findByOrderId(order._id);
      if (!payment) return false;
      try {
        return Boolean(await gateway.verifyPayment(payment.gatewayOrderId, gatewayPaymentId, gatewaySignature || ''));
      } catch (err) {
        if (err instanceof GatewayError) throw gatewayError(err);
        throw err;
      }
    },

    // I-25: authenticated by signature over the raw body
    verifyWebhook(rawBody, signature) {
      try {
        return gateway.verifyWebhook(rawBody, signature);
      } catch (err) {
        if (err instanceof SignatureError) throw new AppError('INVALID_SIGNATURE', 401, 'Webhook signature is invalid');
        throw err;
      }
    },

    // part of the confirmation transaction; a duplicate gateway payment id is rejected
    async markSucceeded(orderId, gatewayPaymentId, { session } = {}) {
      try {
        return await repo.markSucceeded(orderId, gatewayPaymentId, { session });
      } catch (err) {
        if (err && err.code === 11000) {
          throw new AppError('PAYMENT_VERIFICATION_FAILED', 400, 'This gateway payment was already used for another order');
        }
        throw err;
      }
    },

    markFailed: (orderId, opts) => repo.markFailed(orderId, opts),

    // After the order is cancelled (or could not be fulfilled). Returns { refunded: boolean }.
    // A failed gateway call leaves the payment as refund_pending (A-05); the order stays cancelled.
    async refund(payment, amount) {
      const requestedAt = clock.now();
      await repo.setRefund(payment.orderId, { $set: { status: 'refund_pending', 'refund.amount': amount, 'refund.requestedAt': requestedAt } });
      try {
        const result = await gateway.refund(payment.gatewayPaymentId, amount);
        await repo.setRefund(payment.orderId, {
          $set: { status: 'refunded', 'refund.gatewayRefundId': result.gatewayRefundId, 'refund.completedAt': clock.now() },
        });
        logger.audit('refund', { orderId: String(payment.orderId), amount });
        return { refunded: true };
      } catch (err) {
        logger.error('refund failed, payment left as refund_pending', { orderId: String(payment.orderId), error: err.message });
        return { refunded: false };
      }
    },
  };
}

module.exports = { createPaymentService };
