const { AppError } = require('../../utils/AppError');
const { computeSummary } = require('../../utils/money');

const MAX_QUANTITY = 50;

// BM-04 Cart. A cart is a wish to buy, not a reservation: stock is only held at checkout (D-06).
function createCartService({ cartRepo, bookRepo, config }) {
  const pricing = { taxRatePercent: config.taxRatePercent, shippingFlatFee: config.shippingFlatFee };

  const insufficient = (available) =>
    new AppError('INSUFFICIENT_STOCK', 409, `Only ${Math.max(0, available)} cop${available === 1 ? 'y is' : 'ies are'} available`, [
      { field: 'quantity', issue: `only ${Math.max(0, available)} available` },
    ]);

  // cart lines with current prices and availability (FR-08, FR-12)
  async function buildView(cart) {
    const ids = cart ? cart.items.map((i) => i.bookId) : [];
    const books = ids.length ? await bookRepo.findByIds(ids) : [];
    const byId = new Map(books.map((b) => [String(b._id), b]));
    const items = [];
    for (const line of cart ? cart.items : []) {
      const book = byId.get(String(line.bookId));
      if (!book) continue;
      const availableUnits = book.status === 'approved' ? book.stock - book.reserved : 0;
      items.push({
        bookId: String(line.bookId),
        sellerId: String(book.sellerId),
        isbn: book.isbn,
        title: book.title,
        author: book.author,
        imageUrl: book.imageIds.length ? `/api/images/${book.imageIds[0]}` : null,
        unitPrice: book.price,
        quantity: line.quantity,
        availableUnits: Math.max(0, availableUnits),
        available: availableUnits >= line.quantity,
        lineTotal: book.price * line.quantity,
      });
    }
    return { items, summary: computeSummary(items, pricing) };
  }

  // the public cart shape does not show seller ids and ISBNs; checkout needs them for the order snapshot
  const publicView = (view) => ({
    items: view.items.map((line) => {
      const rest = { ...line };
      delete rest.sellerId;
      delete rest.isbn;
      return rest;
    }),
    summary: view.summary,
  });

  async function approvedBook(bookId) {
    const book = await bookRepo.findApprovedById(bookId);
    if (!book) throw new AppError('BOOK_NOT_FOUND', 404, 'This book is not available');
    return book;
  }

  return {
    computeSummary: (items) => computeSummary(items, pricing),

    async getCart(userId) {
      return publicView(await buildView(await cartRepo.findByUser(userId)));
    },

    async addItem(userId, bookId, quantity) {
      const book = await approvedBook(bookId);
      const cart = await cartRepo.getOrCreate(userId);
      const existing = cart.items.find((i) => String(i.bookId) === String(bookId));
      const total = (existing ? existing.quantity : 0) + quantity;
      if (total > MAX_QUANTITY) {
        throw new AppError('VALIDATION_ERROR', 400, `A cart line can hold at most ${MAX_QUANTITY} copies`, [{ field: 'quantity', issue: `maximum ${MAX_QUANTITY}` }]);
      }
      const available = book.stock - book.reserved;
      if (total > available) throw insufficient(available); // FR-09
      return publicView(await buildView(await cartRepo.setQuantity(userId, bookId, total)));
    },

    async updateItem(userId, bookId, quantity) {
      const cart = await cartRepo.findByUser(userId);
      if (!cart || !cart.items.some((i) => String(i.bookId) === String(bookId))) {
        throw new AppError('ITEM_NOT_IN_CART', 404, 'This book is not in your cart');
      }
      const book = await approvedBook(bookId);
      const available = book.stock - book.reserved;
      if (quantity > available) throw insufficient(available);
      return publicView(await buildView(await cartRepo.setQuantity(userId, bookId, quantity)));
    },

    async removeItem(userId, bookId) {
      const removed = await cartRepo.removeItem(userId, bookId);
      if (!removed) throw new AppError('ITEM_NOT_IN_CART', 404, 'This book is not in your cart');
      return publicView(await buildView(await cartRepo.findByUser(userId)));
    },

    // I-07: the checkout reads the cart and requires every line to be available right now
    async getValidatedCart(userId) {
      const view = await buildView(await cartRepo.findByUser(userId));
      if (view.items.length === 0) throw new AppError('VALIDATION_ERROR', 400, 'Your cart is empty', [{ field: 'cart', issue: 'empty' }]);
      const short = view.items.find((i) => !i.available);
      if (short) throw insufficient(short.availableUnits);
      return view;
    },

    clear: (userId, session) => cartRepo.clear(userId, { session }),
  };
}

module.exports = { createCartService };
