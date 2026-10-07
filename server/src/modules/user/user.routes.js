const express = require('express');
const { validate, Joi, id } = require('../../middleware/validate');
const { requireRole } = require('../../middleware/requireRole');

const addressFields = {
  label: Joi.string().max(30).allow(''),
  fullName: Joi.string().trim().min(1).max(100),
  line1: Joi.string().trim().min(1).max(150),
  line2: Joi.string().trim().max(150).allow(''),
  city: Joi.string().trim().min(1).max(80),
  state: Joi.string().trim().min(1).max(80),
  postalCode: Joi.string().trim().min(3).max(12),
  country: Joi.string().trim().min(2).max(60),
  phone: Joi.string().trim().min(7).max(15),
  isDefault: Joi.boolean(),
};

const requiredAddress = (extra = {}) => {
  const out = { ...addressFields, ...extra };
  for (const key of ['fullName', 'line1', 'city', 'state', 'postalCode', 'country', 'phone']) out[key] = addressFields[key].required();
  return out;
};

// API-10 to API-14. Customer role only; addresses are always looked up by the caller's own id.
function createUserRouter({ controller, authGuard }) {
  const router = express.Router();
  const customer = [authGuard, requireRole('customer')];

  router.get('/', ...customer, controller.getProfile);
  router.patch(
    '/',
    ...customer,
    validate({
      body: {
        name: Joi.string().trim().min(1).max(100),
        phone: Joi.string().pattern(/^\d{7,15}$/).message('phone must be 7 to 15 digits'),
      },
    }),
    controller.updateProfile
  );
  router.post('/addresses', ...customer, validate({ body: requiredAddress() }), controller.addAddress);
  router.patch(
    '/addresses/:addressId',
    ...customer,
    validate({ params: { addressId: id.required() }, body: addressFields }),
    controller.updateAddress
  );
  router.delete('/addresses/:addressId', ...customer, validate({ params: { addressId: id.required() } }), controller.removeAddress);
  return router;
}

module.exports = { createUserRouter, addressFields, requiredAddress };
