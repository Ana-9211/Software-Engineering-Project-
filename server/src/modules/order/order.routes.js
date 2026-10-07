const express = require('express');
const { validate, Joi, id, page } = require('../../middleware/validate');
const { requireRole } = require('../../middleware/requireRole');
const { requiredAddress } = require('../user/user.routes');

// shippingAddress has the same fields as a saved address (without label and default flag)
const shippingFields = requiredAddress();
delete shippingFields.label;
delete shippingFields.isDefault;

// API-27, API-28, API-30, API-31, API-32
function createOrderRouter({ orderService, authGuard }) {
  const router = express.Router();
  const customer = [authGuard, requireRole('customer')];
  const orderParam = { params: { orderId: id.required() } };

  router.post(
    '/',
    ...customer,
    validate({
      body: Joi.object({
        addressId: id,
        shippingAddress: Joi.object(shippingFields),
        saveAddress: Joi.boolean(),
      }).xor('addressId', 'shippingAddress'),
    }),
    async (req, res) => res.status(201).json(await orderService.createOrder(req.user.id, req.valid.body))
  );
  router.get('/', ...customer, validate({ query: { page } }), async (req, res) =>
    res.json(await orderService.listOrders(req.user.id, req.valid.query.page))
  );
  router.get('/:orderId', ...customer, validate(orderParam), async (req, res) =>
    res.json(await orderService.getOrder(req.user.id, req.valid.params.orderId))
  );
  router.post(
    '/:orderId/payment/confirm',
    ...customer,
    validate({
      ...orderParam,
      body: { gatewayPaymentId: Joi.string().min(1).max(100).required(), gatewaySignature: Joi.string().max(256).allow('') },
    }),
    async (req, res) => res.json(await orderService.confirmPayment(req.user.id, req.valid.params.orderId, req.valid.body))
  );
  router.post('/:orderId/cancel', ...customer, validate(orderParam), async (req, res) =>
    res.json(await orderService.cancelOrder(req.user.id, req.valid.params.orderId))
  );
  return router;
}

module.exports = { createOrderRouter };
