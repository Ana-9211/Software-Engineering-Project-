const { AppError, notFound } = require('../../utils/AppError');
const { toPage } = require('../../utils/pagination');

const ADMIN_PAGE_SIZE = 20;

const toUser = (u) => ({ id: String(u._id), name: u.name, email: u.email, roles: u.roles, status: u.status });

const toAddress = (a) => ({
  id: String(a._id),
  label: a.label,
  fullName: a.fullName,
  line1: a.line1,
  line2: a.line2,
  city: a.city,
  state: a.state,
  postalCode: a.postalCode,
  country: a.country,
  phone: a.phone,
  isDefault: a.isDefault,
});

const toProfile = (u) => ({
  name: u.name,
  email: u.email,
  phone: u.phone || '',
  addresses: u.addresses.map(toAddress),
});

// BM-02 User and Profile
function createUserService({ repo }) {
  async function mustFind(userId) {
    const user = await repo.findById(userId);
    if (!user) throw notFound('User not found');
    return user;
  }

  return {
    toUser,
    toAddress,

    // used by authGuard (I-24)
    findAuthUser: (id) => repo.findById(id),
    findByEmail: (email) => repo.findByEmail(email),
    findById: (id) => repo.findById(id),
    create: (data, opts) => repo.create(data, opts),
    update: (id, update, opts) => repo.updateById(id, update, opts),
    recordLoginFailure: (id) => repo.incrementFailedLogins(id),

    // display names for reviews
    async namesByIds(ids) {
      const users = ids.length ? await repo.findNames(ids) : [];
      return new Map(users.map((u) => [String(u._id), u.name]));
    },

    async getProfile(userId) {
      return toProfile(await mustFind(userId));
    },

    async updateProfile(userId, dto) {
      const update = {};
      if (dto.name !== undefined) update.name = dto.name;
      if (dto.phone !== undefined) update.phone = dto.phone;
      const user = await repo.updateById(userId, { $set: update });
      if (!user) throw notFound('User not found');
      return toProfile(user);
    },

    async addAddress(userId, dto) {
      const user = await mustFind(userId);
      const address = { ...dto, isDefault: Boolean(dto.isDefault) || user.addresses.length === 0 };
      if (address.isDefault) await repo.clearDefaultAddress(userId);
      const added = await repo.pushAddress(userId, address);
      if (!added) throw new AppError('ADDRESS_LIMIT', 409, 'You can save at most 5 addresses');
      const fresh = await mustFind(userId);
      return toAddress(fresh.addresses[fresh.addresses.length - 1]);
    },

    async updateAddress(userId, addressId, dto) {
      const user = await mustFind(userId);
      const address = user.addresses.id(addressId);
      if (!address) throw notFound('Address not found');
      if (dto.isDefault) await repo.clearDefaultAddress(userId);
      const fresh = await mustFind(userId);
      const target = fresh.addresses.id(addressId);
      Object.assign(target, dto);
      await fresh.save();
      return toAddress(target);
    },

    async removeAddress(userId, addressId) {
      const user = await mustFind(userId);
      const address = user.addresses.id(addressId);
      if (!address) throw notFound('Address not found');
      address.deleteOne();
      await user.save();
    },

    // for checkout: returns the saved address as a plain snapshot, or null
    async getAddressSnapshot(userId, addressId) {
      const user = await mustFind(userId);
      const a = user.addresses.id(addressId);
      if (!a) return null;
      const { fullName, line1, line2, city, state, postalCode, country, phone } = a;
      return { fullName, line1, line2, city, state, postalCode, country, phone };
    },

    async listUsers(filter, page) {
      const { items, totalItems } = await repo.list(filter, page, ADMIN_PAGE_SIZE);
      return toPage(items.map(toUser), page, ADMIN_PAGE_SIZE, totalItems);
    },

    async setStatus(userId, status) {
      const user = await repo.updateById(userId, { $set: { status } });
      if (!user) throw notFound('User not found');
      return toUser(user);
    },

    // I-19: called by SellerService when an application is approved
    async grantRole(userId, role, sellerProfile, { session } = {}) {
      const user = await repo.addRole(userId, role, sellerProfile, { session });
      if (!user) throw notFound('User not found');
      return toUser(user);
    },
  };
}

module.exports = { createUserService, toUser };
