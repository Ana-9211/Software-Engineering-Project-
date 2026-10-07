const { Notification } = require('../../models');

const notificationRepository = {
  create: (data) => Notification.create(data),
  findById: (id) => Notification.findById(id),
  update: (id, update) => Notification.findByIdAndUpdate(id, update, { new: true }),

  // atomic claim of one attempt, so two workers never send the same email twice
  recordAttempt: (id) => Notification.findByIdAndUpdate(id, { $inc: { attempts: 1 } }, { new: true }),

  findUnreadLowStock: (userId, bookId) =>
    Notification.findOne({ userId, channel: 'in_app', type: 'low_stock', readAt: null, 'payload.bookId': String(bookId) }),

  async listInApp(userId, { unread }, page, pageSize) {
    const filter = { userId, channel: 'in_app' };
    if (unread === true) filter.readAt = null;
    if (unread === false) filter.readAt = { $ne: null };
    const [items, totalItems] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      Notification.countDocuments(filter),
    ]);
    return { items, totalItems };
  },

  markRead: (userId, id, now) =>
    Notification.findOneAndUpdate({ _id: id, userId, channel: 'in_app' }, { $set: { readAt: now } }, { new: true }),

  findFailedEmails: (limit) => Notification.find({ channel: 'email', status: 'failed', attempts: { $lt: 3 } }).limit(limit),
};

module.exports = { notificationRepository };
