const { AppError } = require('../../utils/AppError');
const { sha256, randomToken } = require('../../utils/ids');
const logger = require('../../utils/logger');

const MAX_FAILED_LOGINS = 5; // VFR-07
const LOCK_MINUTES = 15;
const VERIFICATION_HOURS = 24;
const RESET_MINUTES = 30; // FR-03

const SAME_REPLY = {
  resend: 'If this email is registered and not yet verified, a new verification link has been sent.',
  forgot: 'If this email is registered, a password reset link has been sent.',
};

// BM-01 Authentication
function createAuthService({ userService, tokenRepo, passwordService, tokenService, notificationService, clock, config }) {
  const minutes = (m) => new Date(clock.now().getTime() + m * 60000);

  async function issueToken(user, type, expiresAt) {
    await tokenRepo.invalidateOpen(user._id, type, clock.now());
    const raw = randomToken(32); // 64 hex characters, within the 32-128 rule of API-03
    await tokenRepo.create({ userId: user._id, type, tokenHash: sha256(raw), expiresAt });
    return raw;
  }

  return {
    async register({ name, email, password }) {
      const passwordHash = await passwordService.hash(password);
      const user = await userService.create({ name, email, passwordHash, roles: ['customer'], status: 'pending_verification' });
      const token = await issueToken(user, 'email_verification', minutes(VERIFICATION_HOURS * 60));
      await notificationService.sendVerificationEmail(user, token);
      return { message: 'Registration successful. Please check your email for the verification link.' };
    },

    async verifyEmail(token) {
      const record = await tokenRepo.consume(sha256(token), 'email_verification', clock.now());
      if (!record) throw new AppError('TOKEN_INVALID_OR_EXPIRED', 400, 'The verification link is invalid or has expired');
      const user = await userService.findById(record.userId);
      if (user && user.status === 'pending_verification') {
        await userService.update(user._id, { $set: { status: 'active', emailVerifiedAt: clock.now() } });
      }
      return { message: 'Email verified. You can now log in.' };
    },

    // always the same reply, so the endpoint does not reveal which emails exist
    async resendVerification(email) {
      const user = await userService.findByEmail(email);
      if (user && user.status === 'pending_verification') {
        const token = await issueToken(user, 'email_verification', minutes(VERIFICATION_HOURS * 60));
        await notificationService.sendVerificationEmail(user, token);
      }
      return { message: SAME_REPLY.resend };
    },

    // D-05: login requires a verified email. This is the only place that applies the rule (the
    // EMAIL_NOT_VERIFIED branch), so the alternative (block checkout instead) can be switched here.
    async login(email, password) {
      const user = await userService.findByEmail(email);
      if (!user) {
        await passwordService.spendTime(password);
        throw new AppError('INVALID_CREDENTIALS', 401, 'Email or password is wrong');
      }
      const now = clock.now();
      if (user.lockUntil && user.lockUntil > now) {
        const err = new AppError('ACCOUNT_LOCKED', 423, 'Too many failed attempts. Try again later.');
        err.retryAfterSeconds = Math.ceil((user.lockUntil - now) / 1000);
        throw err;
      }
      const ok = await passwordService.compare(password, user.passwordHash);
      if (!ok) {
        const updated = await userService.recordLoginFailure(user._id);
        logger.audit('login_failed', { userId: String(user._id) });
        if (updated.failedLoginCount >= MAX_FAILED_LOGINS) {
          await userService.update(user._id, { $set: { lockUntil: minutes(LOCK_MINUTES), failedLoginCount: 0 } });
          logger.audit('account_locked', { userId: String(user._id) });
        }
        throw new AppError('INVALID_CREDENTIALS', 401, 'Email or password is wrong');
      }
      if (user.status === 'suspended') throw new AppError('ACCOUNT_SUSPENDED', 403, 'Your account has been suspended');
      if (user.status === 'pending_verification') {
        throw new AppError('EMAIL_NOT_VERIFIED', 403, 'Please verify your email address before logging in');
      }
      const fresh = await userService.update(user._id, { $set: { failedLoginCount: 0 }, $unset: { lockUntil: 1 } });
      return { user: userService.toUser(fresh), token: tokenService.sign(fresh) };
    },

    // increments the token version: every session of this user ends (D-14)
    async invalidateSessions(userId) {
      await userService.update(userId, { $inc: { tokenVersion: 1 } });
    },

    async logout(userId) {
      await this.invalidateSessions(userId);
      return { message: 'Logged out' };
    },

    async getCurrentUser(userId) {
      const user = await userService.findById(userId);
      if (!user) throw new AppError('UNAUTHENTICATED', 401, 'Session is no longer valid');
      return userService.toUser(user);
    },

    async forgotPassword(email) {
      const user = await userService.findByEmail(email);
      if (user && user.status !== 'suspended') {
        const token = await issueToken(user, 'password_reset', minutes(RESET_MINUTES));
        await notificationService.sendPasswordResetEmail(user, token);
      }
      return { message: SAME_REPLY.forgot };
    },

    async resetPassword(token, newPassword) {
      const record = await tokenRepo.consume(sha256(token), 'password_reset', clock.now());
      if (!record) throw new AppError('TOKEN_INVALID_OR_EXPIRED', 400, 'The reset link is invalid or has expired');
      const passwordHash = await passwordService.hash(newPassword);
      await userService.update(record.userId, {
        $set: { passwordHash, failedLoginCount: 0 },
        $unset: { lockUntil: 1 },
        $inc: { tokenVersion: 1 }, // all sessions end
      });
      logger.audit('password_reset', { userId: String(record.userId) });
      return { message: 'Password changed. Please log in with the new password.' };
    },

    config,
  };
}

module.exports = { createAuthService, MAX_FAILED_LOGINS, LOCK_MINUTES };
