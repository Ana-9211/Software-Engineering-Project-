const { notFound } = require('../../utils/AppError');
const { toPage } = require('../../utils/pagination');
const logger = require('../../utils/logger');
const templates = require('./emailTemplates');

const PAGE_SIZE = 20;
const MAX_ATTEMPTS = 3;

const toNotification = (n) => ({
  id: String(n._id),
  type: n.type,
  subject: n.subject,
  payload: n.payload || {},
  readAt: n.readAt || null,
  createdAt: n.createdAt,
});

// BM-13 Notification. Emails are sent asynchronously inside the process with up to 3 attempts (D-12).
// The email functions never throw to their callers (I-04, I-10, I-13).
function createNotificationService({ repo, mailer, config, clock, retryDelaysMs = [0, 1000, 4000], loadOrder }) {
  const pending = new Set();

  async function attemptSend(notificationId, build) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      if (retryDelaysMs[attempt]) await new Promise((r) => setTimeout(r, retryDelaysMs[attempt]));
      await repo.recordAttempt(notificationId);
      try {
        const message = build();
        await mailer.send(message);
        await repo.update(notificationId, { $set: { status: 'sent', sentAt: clock.now(), lastError: null } });
        return;
      } catch (err) {
        await repo.update(notificationId, { $set: { status: 'failed', lastError: String(err.message).slice(0, 200) } });
        logger.warn('email send failed', { notificationId: String(notificationId), attempt: attempt + 1, error: err.message });
      }
    }
  }

  // queue the notification record, then send in the background
  async function queueEmail({ user, type, build, payload }) {
    try {
      const subject = build().subject;
      const record = await repo.create({ userId: user._id, channel: 'email', type, subject, payload, status: 'queued' });
      const job = attemptSend(record._id, build).catch((err) => logger.error('email job crashed', { error: err.message }));
      pending.add(job);
      job.finally(() => pending.delete(job));
    } catch (err) {
      logger.error('could not queue email', { type, error: err.message });
    }
  }

  const linkTo = (path, token) => `${config.appBaseUrl}${path}?token=${token}`;

  return {
    toNotification,

    // tests (and a graceful shutdown) wait for background sends
    async flush() {
      while (pending.size > 0) await Promise.all([...pending]);
    },

    // The raw token is only inside the closure; it is not stored on the notification (SDD 8.2).
    async sendVerificationEmail(user, token) {
      const build = () => ({ to: user.email, ...templates.verification({ name: user.name, link: linkTo('/verify-email', token) }) });
      await queueEmail({ user, type: 'email_verification', build, payload: {} });
    },

    async sendPasswordResetEmail(user, token) {
      const build = () => ({ to: user.email, ...templates.passwordReset({ name: user.name, link: linkTo('/reset-password', token) }) });
      await queueEmail({ user, type: 'password_reset', build, payload: {} });
    },

    async sendOrderConfirmation(order, user) {
      const snapshot = JSON.parse(JSON.stringify(order));
      const build = () => ({ to: user.email, ...templates.orderConfirmation({ name: user.name, order: snapshot, currency: config.currency }) });
      await queueEmail({ user, type: 'order_confirmation', build, payload: { orderId: String(order._id) } });
    },

    // In-app alert, created once while an earlier alert for the same book is still unread (I-13).
    async notifyLowStock(book) {
      try {
        const existing = await repo.findUnreadLowStock(book.sellerId, book._id);
        if (existing) return;
        const available = book.stock - book.reserved;
        await repo.create({
          userId: book.sellerId,
          channel: 'in_app',
          type: 'low_stock',
          subject: `Low stock: ${book.title} (${available} left)`,
          payload: { bookId: String(book._id), available, threshold: book.lowStockThreshold },
          status: 'sent',
          sentAt: clock.now(),
        });
      } catch (err) {
        logger.error('low stock alert failed', { error: err.message });
      }
    },

    async listForUser(userId, filter, page) {
      const { items, totalItems } = await repo.listInApp(userId, filter, page, PAGE_SIZE);
      return toPage(items.map(toNotification), page, PAGE_SIZE, totalItems);
    },

    async markRead(userId, notificationId) {
      const n = await repo.markRead(userId, notificationId, clock.now());
      if (!n) throw notFound('Notification not found');
      return toNotification(n);
    },

    // order confirmations can be rebuilt from the order; token emails cannot (their link is not stored)
    async retryFailed() {
      if (!loadOrder) return 0;
      const failed = await repo.findFailedEmails(50);
      let retried = 0;
      for (const n of failed) {
        if (n.type !== 'order_confirmation') continue;
        const loaded = await loadOrder(n.payload && n.payload.orderId);
        if (!loaded) continue;
        const build = () => ({ to: loaded.user.email, ...templates.orderConfirmation({ name: loaded.user.name, order: loaded.order, currency: config.currency }) });
        await attemptSend(n._id, build);
        retried += 1;
      }
      return retried;
    },
  };
}

module.exports = { createNotificationService };
