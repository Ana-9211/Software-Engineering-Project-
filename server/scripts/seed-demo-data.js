// Development and validation data only (SDD 8.5): categories, one seller, one customer and a catalogue.
// Refuses to run in production. Safe to run again: existing records are kept.
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const { connect, disconnect } = require('../src/db/connect');
const { User, Category, Book } = require('../src/models');
const { buildSearchFields } = require('../src/modules/catalog/search');

const DEMO_PASSWORD = 'Password123!';
const CATEGORIES = ['Fiction', 'Science', 'History', 'Technology', 'Children'];

const BOOKS = [
  ['Harry Potter and the Philosopher\'s Stone', 'J. K. Rowling', '9780747532699', 39900, 'Fiction', 'English', 25, 4.7],
  ['Harry Potter and the Chamber of Secrets', 'J. K. Rowling', '9780747538486', 41900, 'Fiction', 'English', 18, 4.6],
  ['The Hobbit', 'J. R. R. Tolkien', '9780261102217', 35000, 'Fiction', 'English', 30, 4.8],
  ['Les Misérables', 'Victor Hugo', '9780140444308', 29900, 'Fiction', 'French', 12, 4.4],
  ['Cosmos', 'Carl Sagan', '9780345539434', 49900, 'Science', 'English', 15, 4.7],
  ['A Brief History of Time', 'Stephen Hawking', '9780553380163', 45000, 'Science', 'English', 20, 4.5],
  ['Sapiens', 'Yuval Noah Harari', '9780099590088', 52000, 'History', 'English', 22, 4.6],
  ['The Guns of August', 'Barbara W. Tuchman', '9780345476098', 38000, 'History', 'English', 8, 4.3],
  ['Clean Code', 'Robert C. Martin', '9780132350884', 59900, 'Technology', 'English', 14, 4.4],
  ['Introduction to Algorithms', 'Thomas H. Cormen', '9780262033848', 79900, 'Technology', 'English', 6, 4.6],
  ['The Very Hungry Caterpillar', 'Eric Carle', '9780241003008', 19900, 'Children', 'English', 40, 4.9],
  ['Matilda', 'Roald Dahl', '9780142410370', 24900, 'Children', 'English', 3, 4.7],
];

(async () => {
  if (config.isProd) throw new Error('seed-demo-data must not run in production');
  await connect(config.mongodbUri);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, config.bcryptCost);

  const categories = {};
  for (const name of CATEGORIES) {
    categories[name] = (await Category.findOne({ name }).collation({ locale: 'en', strength: 2 })) || (await Category.create({ name }));
  }
  const upsertUser = async (email, name, roles, extra = {}) =>
    (await User.findOne({ email })) ||
    User.create({ email, name, roles, passwordHash, status: 'active', emailVerifiedAt: new Date(), ...extra });

  const seller = await upsertUser('seller@bookstore.local', 'Demo Seller', ['customer', 'seller'], {
    sellerProfile: { storeName: 'Demo Book Shop', description: 'Demo seller', approvedAt: new Date() },
  });
  await upsertUser('customer@bookstore.local', 'Demo Customer', ['customer']);

  let created = 0;
  for (const [title, author, isbn, price, cat, language, stock, avgRating] of BOOKS) {
    if (await Book.exists({ sellerId: seller._id, isbn })) continue;
    await Book.create({
      sellerId: seller._id, title, author, isbn, price, description: `${title} by ${author}.`,
      categoryId: categories[cat]._id, language, stock, reserved: 0, lowStockThreshold: 5,
      status: 'approved', avgRating, reviewCount: 0, ...buildSearchFields(title, author, isbn),
    });
    created += 1;
  }
  console.log(`Demo data ready (${created} books added).`);
  console.log(`Accounts (password ${DEMO_PASSWORD}): seller@bookstore.local, customer@bookstore.local`);
  console.log('Create the administrator with: npm run seed:admin (needs ADMIN_EMAIL and ADMIN_PASSWORD)');
  await disconnect();
})().catch(async (err) => {
  console.error(err.message);
  await disconnect().catch(() => {});
  process.exit(1);
});
