const { SellerApplication } = require('../../models');
const { AppError } = require('../../utils/AppError');

const opts = (session) => (session ? { session } : {});

const sellerApplicationRepository = {
  // the partial unique index allows only one pending application per user
  async create(data) {
    try {
      return await SellerApplication.create(data);
    } catch (err) {
      if (err && err.code === 11000) throw new AppError('APPLICATION_EXISTS', 409, 'You already have a pending application');
      throw err;
    }
  },

  findLatestByUser: (userId) => SellerApplication.findOne({ userId }).sort({ createdAt: -1, _id: -1 }),
  findById: (id) => SellerApplication.findById(id),

  // only a pending application can be decided
  decide: (id, update, { session } = {}) =>
    SellerApplication.findOneAndUpdate({ _id: id, status: 'pending' }, update, { new: true, ...opts(session) }),

  async listByStatus(status, page, pageSize) {
    const [items, totalItems] = await Promise.all([
      SellerApplication.find({ status }).sort({ createdAt: 1, _id: 1 }).skip((page - 1) * pageSize).limit(pageSize),
      SellerApplication.countDocuments({ status }),
    ]);
    return { items, totalItems };
  },
};

module.exports = { sellerApplicationRepository };
