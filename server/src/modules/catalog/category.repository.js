const { Category } = require('../../models');
const { AppError } = require('../../utils/AppError');

const COLLATION = { locale: 'en', strength: 2 };

function mapDuplicate(err) {
  if (err && err.code === 11000) return new AppError('CATEGORY_EXISTS', 409, 'A category with this name already exists');
  return err;
}

const categoryRepository = {
  list: () => Category.find().collation(COLLATION).sort({ name: 1 }),
  findById: (id) => Category.findById(id),

  async create(name) {
    try {
      return await Category.create({ name });
    } catch (err) {
      throw mapDuplicate(err);
    }
  },

  async rename(id, name) {
    try {
      return await Category.findByIdAndUpdate(id, { $set: { name } }, { new: true, runValidators: true });
    } catch (err) {
      throw mapDuplicate(err);
    }
  },

  remove: (id) => Category.findByIdAndDelete(id),
};

module.exports = { categoryRepository };
