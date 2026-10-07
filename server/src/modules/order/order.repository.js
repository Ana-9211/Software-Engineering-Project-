const { Order } = require('../../models');

const opts = (session) => (session ? { session } : {});
const UNPAID = ['PendingPayment', 'PaymentFailed'];

const orderRepository = {
  create: (data, { session } = {}) => Order.create([data], opts(session)).then(([doc]) => doc),

  // ownership is part of the query: another customer's order is simply not found
  findOwned: (userId, orderId) => Order.findOne({ _id: orderId, userId }),
  findById: (id, { session } = {}) => Order.findById(id).session(session || null),
  findOpenCheckouts: (userId) => Order.find({ userId, status: 'PendingPayment' }),
  setPayment: (orderId, paymentId) => Order.updateOne({ _id: orderId }, { $set: { paymentId } }),

  async listForUser(userId, page, pageSize) {
    const filter = { userId, status: { $nin: UNPAID } };
    const [items, totalItems] = await Promise.all([
      Order.find(filter).sort({ placedAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      Order.countDocuments(filter),
    ]);
    return { items, totalItems };
  },

  // PendingPayment -> PaymentFailed, only if it is still PendingPayment (so a release happens once)
  closeUnpaid: (orderId, reason, { session } = {}) =>
    Order.findOneAndUpdate(
      { _id: orderId, status: 'PendingPayment' },
      { $set: { status: 'PaymentFailed', failureReason: reason } },
      { new: true, ...opts(session) }
    ),

  // payment confirmed: PendingPayment (or an expired PaymentFailed) -> Placed
  markPlaced: (orderId, now, { session } = {}) =>
    Order.findOneAndUpdate(
      { _id: orderId, $or: [{ status: 'PendingPayment' }, { status: 'PaymentFailed', failureReason: 'expired' }] },
      { $set: { status: 'Placed', placedAt: now, 'items.$[].fulfilmentStatus': 'Placed' }, $unset: { failureReason: 1, reservationExpiresAt: 1 } },
      { new: true, ...opts(session) }
    ),

  setFailureReason: (orderId, reason) => Order.updateOne({ _id: orderId }, { $set: { failureReason: reason } }),

  // Placed or Packed with nothing shipped or delivered -> Cancelled
  cancelPlaced: (userId, orderId, now, { session } = {}) =>
    Order.findOneAndUpdate(
      { _id: orderId, userId, status: { $in: ['Placed', 'Packed'] }, 'items.fulfilmentStatus': { $nin: ['Shipped', 'Delivered'] } },
      { $set: { status: 'Cancelled', cancelledAt: now, 'items.$[].fulfilmentStatus': 'Cancelled' } },
      { new: true, ...opts(session) }
    ),

  findExpired: (now, limit) => Order.find({ status: 'PendingPayment', reservationExpiresAt: { $lt: now } }).limit(limit),

  // the seller's order list: orders that contain the seller's items and are no longer unpaid
  async listForSeller(sellerId, itemStatus, page, pageSize) {
    const filter = { placedAt: { $ne: null } };
    filter.items = { $elemMatch: itemStatus ? { sellerId, fulfilmentStatus: itemStatus } : { sellerId } };
    const [items, totalItems] = await Promise.all([
      Order.find(filter).sort({ placedAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      Order.countDocuments(filter),
    ]);
    return { items, totalItems };
  },

  // The previous status and the seller id are part of the filter, so only the seller's own item moves,
  // and only one step forward. Returns null when nothing matched.
  updateItemStatus: (orderId, itemId, sellerId, from, to, { session } = {}) =>
    Order.findOneAndUpdate(
      { _id: orderId, status: { $in: ['Placed', 'Packed', 'Shipped'] }, items: { $elemMatch: { _id: itemId, sellerId, fulfilmentStatus: from } } },
      { $set: { 'items.$[item].fulfilmentStatus': to } },
      { new: true, arrayFilters: [{ 'item._id': itemId }], ...opts(session) }
    ),

  setStatus: (orderId, status, { session } = {}) => Order.findByIdAndUpdate(orderId, { $set: { status } }, { new: true, ...opts(session) }),

  // I-14
  async hasDeliveredItem(userId, bookId) {
    return Boolean(await Order.exists({ userId, items: { $elemMatch: { bookId, fulfilmentStatus: 'Delivered' } } }));
  },

  // I-23: report aggregations (orders that were paid; unpaid and cancelled orders are not revenue)
  aggregate: (pipeline) => Order.aggregate(pipeline),
};

module.exports = { orderRepository, UNPAID };
