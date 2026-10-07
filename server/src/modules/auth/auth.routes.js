const express = require('express');
const { validate, Joi } = require('../../middleware/validate');

// bcrypt only uses the first 72 bytes, so a longer password is rejected instead of silently cut
const password = Joi.string()
  .min(8)
  .max(72)
  .custom((value, helpers) => (Buffer.byteLength(value, 'utf8') > 72 ? helpers.error('string.max', { limit: 72 }) : value));
// the format is checked; the list of public top-level domains is not (internal domains such as .local are allowed)
const email = Joi.string().trim().email({ tlds: { allow: false } }).max(254);
const oneTimeToken = Joi.string().min(32).max(128);

// API-01 to API-09
function createAuthRouter({ controller, authGuard, authLimiter }) {
  const router = express.Router();

  router.get('/csrf-token', controller.csrfToken);
  router.post(
    '/register',
    authLimiter,
    validate({ body: { name: Joi.string().trim().min(1).max(100).required(), email: email.required(), password: password.required() } }),
    controller.register
  );
  router.post('/verify-email', validate({ body: { token: oneTimeToken.required() } }), controller.verifyEmail);
  router.post('/resend-verification', authLimiter, validate({ body: { email: email.required() } }), controller.resendVerification);
  router.post(
    '/login',
    authLimiter,
    validate({ body: { email: email.required(), password: Joi.string().min(1).max(72).required() } }),
    controller.login
  );
  router.post('/logout', authGuard, controller.logout);
  router.get('/me', authGuard, controller.me);
  router.post('/forgot-password', authLimiter, validate({ body: { email: email.required() } }), controller.forgotPassword);
  router.post(
    '/reset-password',
    validate({ body: { token: oneTimeToken.required(), newPassword: password.required() } }),
    controller.resetPassword
  );
  return router;
}

module.exports = { createAuthRouter };
