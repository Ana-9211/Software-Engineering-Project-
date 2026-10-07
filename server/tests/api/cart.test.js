const { setup, teardown, client, actor, createUser, createCategory, createBook } = require('../helpers/testContext');

let ctx;
let seller;
let category;
let book;
beforeAll(async () => {
  ctx = await setup();
  seller = await createUser(ctx, { roles: ['customer', 'seller'] });
  category = await createCategory('Cart tests');
  book = await createBook(ctx, seller, category._id, { title: 'Cart Book', price: 10000, stock: 5 });
});
afterAll(() => teardown(ctx));

describe('cart (FR-08, FR-09, FR-12, UC-06)', () => {
  test('an empty cart has a zero summary', async () => {
    const { api } = await actor(ctx);
    const res = await api.get('/api/cart');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], summary: { subtotal: 0, tax: 0, shippingFee: 0, total: 0 } });
  });

  test('add, add again (quantities combine), change and remove', async () => {
    const { api } = await actor(ctx);
    let res = await api.post('/api/cart/items', { bookId: String(book._id), quantity: 2 });
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ title: 'Cart Book', quantity: 2, unitPrice: 10000, lineTotal: 20000, available: true });
    res = await api.post('/api/cart/items', { bookId: String(book._id), quantity: 1 });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].quantity).toBe(3);
    res = await api.patch(`/api/cart/items/${book._id}`, { quantity: 4 });
    expect(res.body.items[0].quantity).toBe(4);
    res = await api.delete(`/api/cart/items/${book._id}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  test('summary: tax is rounded half up, shipping is the flat fee, total adds up to 2 decimals (FR-12)', async () => {
    const { api } = await actor(ctx);
    const odd = await createBook(ctx, seller, category._id, { title: 'Odd Price', price: 999, stock: 50 });
    const res = await api.post('/api/cart/items', { bookId: String(odd._id), quantity: 3 });
    const s = res.body.summary;
    expect(s.subtotal).toBe(2997);
    expect(s.tax).toBe(Math.floor((2997 * ctx.container.config.taxRatePercent + 50) / 100)); // 5 % -> 149.85 -> 150
    expect(s.tax).toBe(150);
    expect(s.shippingFee).toBe(ctx.container.config.shippingFlatFee);
    expect(s.total).toBe(s.subtotal + s.tax + s.shippingFee);
    for (const v of Object.values(s)) expect(Number.isInteger(v)).toBe(true);
  });

  test('rejects a quantity above the available stock with a message (FR-09)', async () => {
    const { api } = await actor(ctx);
    const res = await api.post('/api/cart/items', { bookId: String(book._id), quantity: 6 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.message).toMatch(/only 5 copies are available/i);
    await api.post('/api/cart/items', { bookId: String(book._id), quantity: 5 });
    const more = await api.post('/api/cart/items', { bookId: String(book._id), quantity: 1 });
    expect(more.status).toBe(409);
    const patch = await api.patch(`/api/cart/items/${book._id}`, { quantity: 6 });
    expect(patch.status).toBe(409);
  });

  test('units held by other open checkouts are not available to the cart (stock minus reserved)', async () => {
    const held = await createBook(ctx, seller, category._id, { title: 'Mostly Held', stock: 5, reserved: 4 });
    const { api } = await actor(ctx);
    expect((await api.post('/api/cart/items', { bookId: String(held._id), quantity: 2 })).status).toBe(409);
    expect((await api.post('/api/cart/items', { bookId: String(held._id), quantity: 1 })).status).toBe(200);
  });

  test('a cart does not reserve stock (D-06)', async () => {
    const fresh = await createBook(ctx, seller, category._id, { title: 'Not Reserved', stock: 3 });
    const a = await actor(ctx);
    const b = await actor(ctx);
    await a.api.post('/api/cart/items', { bookId: String(fresh._id), quantity: 3 });
    expect((await b.api.post('/api/cart/items', { bookId: String(fresh._id), quantity: 3 })).status).toBe(200);
    expect((await ctx.models.Book.findById(fresh._id)).reserved).toBe(0);
  });

  test('validation: quantity range, book id, unknown fields; unavailable books', async () => {
    const { api } = await actor(ctx);
    for (const body of [{ bookId: String(book._id), quantity: 0 }, { bookId: String(book._id), quantity: 51 }, { bookId: String(book._id), quantity: 1.5 }, { bookId: 'bad', quantity: 1 }, { quantity: 1 }, { bookId: String(book._id), quantity: 1, price: 1 }]) {
      expect((await api.post('/api/cart/items', body)).status).toBe(400);
    }
    const pending = await createBook(ctx, seller, category._id, { title: 'Pending Cart', status: 'pending' });
    const res = await api.post('/api/cart/items', { bookId: String(pending._id), quantity: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BOOK_NOT_FOUND');
    const missing = await api.delete(`/api/cart/items/${book._id}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('ITEM_NOT_IN_CART');
    expect((await api.patch(`/api/cart/items/${book._id}`, { quantity: 1 })).body.error.code).toBe('ITEM_NOT_IN_CART');
  });

  test('the cart persists across sessions (FR-08)', async () => {
    const { user, api } = await actor(ctx);
    await api.post('/api/cart/items', { bookId: String(book._id), quantity: 2 });
    await api.post('/api/auth/logout');
    const again = client(ctx.app);
    await again.post('/api/auth/login', { email: user.email, password: ctx.PASSWORD });
    const res = await again.get('/api/cart');
    expect(res.body.items[0].quantity).toBe(2);
  });

  test("one customer cannot see another customer's cart", async () => {
    const a = await actor(ctx);
    const b = await actor(ctx);
    await a.api.post('/api/cart/items', { bookId: String(book._id), quantity: 1 });
    expect((await b.api.get('/api/cart')).body.items).toEqual([]);
  });
});

describe('wishlist (FR-10, UC-07)', () => {
  test('add is idempotent, list, remove', async () => {
    const { api } = await actor(ctx);
    expect((await api.put(`/api/wishlist/items/${book._id}`)).status).toBe(200);
    const again = await api.put(`/api/wishlist/items/${book._id}`);
    expect(again.body.items).toHaveLength(1);
    expect(again.body.items[0].title).toBe('Cart Book');
    expect((await api.get('/api/wishlist')).body.items).toHaveLength(1);
    expect((await api.delete(`/api/wishlist/items/${book._id}`)).status).toBe(204);
    expect((await api.delete(`/api/wishlist/items/${book._id}`)).status).toBe(204);
    expect((await api.get('/api/wishlist')).body.items).toEqual([]);
  });

  test('unknown or hidden books cannot be added; wishlists are private', async () => {
    const a = await actor(ctx);
    const b = await actor(ctx);
    const hidden = await createBook(ctx, seller, category._id, { title: 'Hidden WL', status: 'rejected' });
    const res = await a.api.put(`/api/wishlist/items/${hidden._id}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BOOK_NOT_FOUND');
    await a.api.put(`/api/wishlist/items/${book._id}`);
    expect((await b.api.get('/api/wishlist')).body.items).toEqual([]);
  });
});
