const { User } = require('../../models');
const { AppError } = require('../../utils/AppError');

const MAX_ADDRESSES = 5;

const opts = (session) => (session ? { session } : {});

const userRepository = {
  async create(data, { session } = {}) {
    try {
      const [doc] = await User.create([data], opts(session));
      return doc;
    } catch (err) {
      if (err && err.code === 11000) throw new AppError('EMAIL_TAKEN', 409, 'This email address is already registered');
      throw err;
    }
  },

  findById: (id, { session } = {}) => User.findById(id).session(session || null),

  findNames: (ids) => User.find({ _id: { $in: ids } }).select('name'),

  findByEmail: (email) => User.findOne({ email: String(email).toLowerCase() }),

  updateById: (id, update, { session } = {}) => User.findByIdAndUpdate(id, update, { new: true, ...opts(session) }),

  // atomic increment so concurrent failed logins are all counted
  incrementFailedLogins: (id) => User.findByIdAndUpdate(id, { $inc: { failedLoginCount: 1 } }, { new: true }),

  async list({ role, status, q }, page, pageSize) {
    const filter = {};
    if (role) filter.roles = role;
    if (status) filter.status = status;
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ name: new RegExp(escaped, 'i') }, { email: new RegExp(escaped, 'i') }];
    }
    const [items, totalItems] = await Promise.all([
      User.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      User.countDocuments(filter),
    ]);
    return { items, totalItems };
  },

  // The conditional update makes the limit of 5 hold even for concurrent requests (FR-18).
  async pushAddress(userId, address) {
    const result = await User.updateOne(
      { _id: userId, $expr: { $lt: [{ $size: '$addresses' }, MAX_ADDRESSES] } },
      { $push: { addresses: address } }
    );
    return result.modifiedCount === 1;
  },

  clearDefaultAddress: (userId) => User.updateOne({ _id: userId }, { $set: { 'addresses.$[].isDefault': false } }),

  addRole: (userId, role, sellerProfile, { session } = {}) =>
    User.findByIdAndUpdate(userId, { $addToSet: { roles: role }, $set: { sellerProfile } }, { new: true, ...opts(session) }),
};

module.exports = { userRepository, MAX_ADDRESSES };
