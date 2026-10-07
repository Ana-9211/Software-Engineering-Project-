const { Payment } = require('../../models');

const opts = (session) => (session ? { session } : {});

const paymentRepository = {
  create: (data, { session } = {}) => Payment.create([data], opts(session)).then(([doc]) => doc),
  findByOrderId: (orderId, { session } = {}) => Payment.findOne({ orderId }).session(session || null),
  findByGatewayOrderId: (gatewayOrderId) => Payment.findOne({ gatewayOrderId }),
  findById: (id) => Payment.findById(id),

  // unique sparse index on gatewayPaymentId: the same gateway payment can never be recorded twice
  markSucceeded: (orderId, gatewayPaymentId, { session } = {}) =>
    Payment.findOneAndUpdate({ orderId }, { $set: { status: 'succeeded', gatewayPaymentId } }, { new: true, ...opts(session) }),

  markFailed: (orderId, { session } = {}) =>
    Payment.findOneAndUpdate({ orderId, status: 'created' }, { $set: { status: 'failed' } }, { new: true, ...opts(session) }),

  setRefund: (orderId, update) => Payment.findOneAndUpdate({ orderId }, update, { new: true }),
};

module.exports = { paymentRepository };
