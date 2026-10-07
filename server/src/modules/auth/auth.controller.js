const { SESSION_COOKIE } = require('../../middleware/authGuard');
const { issueCsrfToken } = require('../../middleware/csrfProtection');

function createAuthController({ authService, config }) {
  const cookieOptions = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
  };

  return {
    csrfToken: (req, res) => res.json({ csrfToken: issueCsrfToken(res) }),
    register: async (req, res) => res.status(201).json(await authService.register(req.valid.body)),
    verifyEmail: async (req, res) => res.json(await authService.verifyEmail(req.valid.body.token)),
    resendVerification: async (req, res) => res.json(await authService.resendVerification(req.valid.body.email)),

    login: async (req, res) => {
      const { user, token } = await authService.login(req.valid.body.email, req.valid.body.password);
      res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: config.sessionMinutes * 60 * 1000 });
      res.json(user);
    },

    logout: async (req, res) => {
      const result = await authService.logout(req.user.id);
      res.clearCookie(SESSION_COOKIE, cookieOptions);
      res.json(result);
    },

    me: async (req, res) => res.json(await authService.getCurrentUser(req.user.id)),
    forgotPassword: async (req, res) => res.json(await authService.forgotPassword(req.valid.body.email)),
    resetPassword: async (req, res) =>
      res.json(await authService.resetPassword(req.valid.body.token, req.valid.body.newPassword)),
  };
}

module.exports = { createAuthController };
