const { setup, teardown, client, actor, createUser, createCategory, createBook } = require('../helpers/testContext');

let ctx;
let admin;
let seller;
let category;
beforeAll(async () => {
  ctx = await setup();
  admin = await actor(ctx, { roles: ['admin'] });
  seller = await createUser(ctx, { roles: ['customer', 'seller'] });
  category = await createCategory('Review tests');
});
afterAll(() => teardown(ctx));

const address = { fullName: 'Rev Iewer', line1: '1 Road', city: 'Chennai', state: 'TN', postalCode: '600001', country: 'India', phone: '9000011111' };

// a customer who bought the book; the item can be moved to Delivered through the order document
async function buyer(book, { deliver = true } = {}) {
  const a = await actor(ctx);
  await a.api.post('/api/cart/items', { bookId: String(book._id), quantity: 1 });
  const created = await a.api.post('/api/orders', { shippingAddress: address });
  await a.api.post(`/api/orders/${created.body.order.id}/payment/confirm`, created.body.payment.clientConfig.successPayment);
  if (deliver) {
    await ctx.models.Order.updateOne({ _id: created.body.order.id }, { $set: { 'items.$[].fulfilmentStatus': 'Delivered', status: 'Delivered' } });
  }
  return a;
}

describe('ratings and reviews (FR-17, FR-27, UC-12, UC-22)', () => {
  test('only customers with a delivered order can review; the average rating is updated', async () => {
    const book = await createBook(ctx, seller, category._id, { title: 'Reviewed Book', stock: 20 });
    const b = await buyer(book);
    const res = await b.api.post(`/api/books/${book._id}/reviews`, { rating: 4, comment: 'Good read' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ rating: 4, comment: 'Good read', bookId: String(book._id) });
    expect(res.body.userName).toBe('Test User');
    const detail = await client(ctx.app).get(`/api/books/${book._id}`);
    expect(detail.body).toMatchObject({ avgRating: 4, reviewCount: 1 });

    const b2 = await buyer(book);
    await b2.api.post(`/api/books/${book._id}/reviews`, { rating: 5 });
    expect((await client(ctx.app).get(`/api/books/${book._id}`)).body).toMatchObject({ avgRating: 4.5, reviewCount: 2 });
  });

  test('a customer who never bought the book, or has not received it, cannot review', async () => {
    const book = await createBook(ctx, seller, category._id, { stock: 20 });
    const stranger = await actor(ctx);
    const res = await stranger.api.post(`/api/books/${book._id}/reviews`, { rating: 5 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ELIGIBLE');
    const notYet = await buyer(book, { deliver: false });
    expect((await notYet.api.post(`/api/books/${book._id}/reviews`, { rating: 5 })).body.error.code).toBe('NOT_ELIGIBLE');
  });

  test('one review per customer per book, also under concurrent requests', async () => {
    const book = await createBook(ctx, seller, category._id, { stock: 20 });
    const b = await buyer(book);
    const results = await Promise.all([1, 2, 3].map(() => b.api.post(`/api/books/${book._id}/reviews`, { rating: 3 })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409 && r.body.error.code === 'ALREADY_REVIEWED')).toHaveLength(2);
    expect(await ctx.models.Review.countDocuments({ bookId: book._id })).toBe(1);
    expect((await client(ctx.app).get(`/api/books/${book._id}`)).body.reviewCount).toBe(1);
  });

  test('validation: rating integer 1-5, comment up to 2000 characters, unknown fields', async () => {
    const book = await createBook(ctx, seller, category._id, { stock: 20 });
    const b = await buyer(book);
    for (const body of [{ rating: 0 }, { rating: 6 }, { rating: 2.5 }, {}, { rating: 3, comment: 'x'.repeat(2001) }, { rating: 3, userId: 'x' }]) {
      expect((await b.api.post(`/api/books/${book._id}/reviews`, body)).status).toBe(400);
    }
    expect((await b.api.post(`/api/books/${'f'.repeat(24)}/reviews`, { rating: 3 })).status).toBe(404);
  });

  test('comments are stored as plain text and returned unchanged (escaped by the UI)', async () => {
    const book = await createBook(ctx, seller, category._id, { stock: 20 });
    const b = await buyer(book);
    const text = '<img src=x onerror=alert(1)> & "quotes"';
    await b.api.post(`/api/books/${book._id}/reviews`, { rating: 2, comment: text });
    const list = await client(ctx.app).get(`/api/books/${book._id}/reviews`);
    expect(list.body.items[0].comment).toBe(text);
    expect(list.headers['content-type']).toMatch(/application\/json/); // never rendered as HTML by the API
  });

  test('public list is newest first, 10 per page', async () => {
    const book = await createBook(ctx, seller, category._id, { stock: 50 });
    for (let i = 0; i < 12; i += 1) {
      const b = await buyer(book);
      await b.api.post(`/api/books/${book._id}/reviews`, { rating: (i % 5) + 1, comment: `c${i}` });
    }
    const p1 = await client(ctx.app).get(`/api/books/${book._id}/reviews`);
    expect(p1.body).toMatchObject({ page: 1, totalItems: 12, totalPages: 2 });
    expect(p1.body.items).toHaveLength(10);
    expect(p1.body.items[0].comment).toBe('c11');
    expect((await client(ctx.app).get(`/api/books/${book._id}/reviews?page=2`)).body.items).toHaveLength(2);
    expect((await client(ctx.app).get(`/api/books/${'f'.repeat(24)}/reviews`)).status).toBe(404);
  });

  test('an administrator lists and removes reviews; the rating is recalculated', async () => {
    const book = await createBook(ctx, seller, category._id, { stock: 20 });
    const b1 = await buyer(book);
    const b2 = await buyer(book);
    await b1.api.post(`/api/books/${book._id}/reviews`, { rating: 1, comment: 'spam' });
    await b2.api.post(`/api/books/${book._id}/reviews`, { rating: 5 });
    const list = await admin.api.get(`/api/admin/reviews?bookId=${book._id}&maxRating=2`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].comment).toBe('spam');
    expect((await client(ctx.app).get(`/api/books/${book._id}`)).body.avgRating).toBe(3);

    expect((await admin.api.delete(`/api/admin/reviews/${list.body.items[0].id}`)).status).toBe(204);
    expect((await client(ctx.app).get(`/api/books/${book._id}`)).body).toMatchObject({ avgRating: 5, reviewCount: 1 });
    expect((await admin.api.delete(`/api/admin/reviews/${list.body.items[0].id}`)).status).toBe(404);
    // after removal the customer may review again
    expect((await b1.api.post(`/api/books/${book._id}/reviews`, { rating: 4 })).status).toBe(201);
  });

  test("customers and sellers cannot moderate or delete reviews, and cannot remove someone else's", async () => {
    const book = await createBook(ctx, seller, category._id, { stock: 20 });
    const b = await buyer(book);
    const review = (await b.api.post(`/api/books/${book._id}/reviews`, { rating: 3 })).body;
    const other = await actor(ctx);
    expect((await other.api.delete(`/api/admin/reviews/${review.id}`)).status).toBe(403);
    expect((await b.api.delete(`/api/admin/reviews/${review.id}`)).status).toBe(403);
    expect((await other.api.get('/api/admin/reviews')).status).toBe(403);
    expect(await ctx.models.Review.countDocuments({ _id: review.id })).toBe(1);
  });
});

describe('profile and addresses (FR-18, UC-13)', () => {
  const addr = (over = {}) => ({ label: 'Home', fullName: 'A Person', line1: '1 Road', city: 'Delhi', state: 'DL', postalCode: '110001', country: 'India', phone: '9111111111', ...over });

  test('view and update profile; the email cannot be changed', async () => {
    const { api, user } = await actor(ctx, { name: 'Before' });
    expect((await api.get('/api/profile')).body).toMatchObject({ name: 'Before', email: user.email, addresses: [] });
    const res = await api.patch('/api/profile', { name: 'After', phone: '9876543210' });
    expect(res.body).toMatchObject({ name: 'After', phone: '9876543210' });
    expect((await api.patch('/api/profile', { email: 'new@example.com' })).status).toBe(400);
    expect((await api.patch('/api/profile', { phone: '12ab' })).status).toBe(400);
    expect((await api.patch('/api/profile', { roles: ['admin'] })).status).toBe(400);
    expect((await api.get('/api/profile')).body.email).toBe(user.email);
  });

  test('add, edit and delete addresses; the first becomes the default', async () => {
    const { api } = await actor(ctx);
    const first = await api.post('/api/profile/addresses', addr());
    expect(first.status).toBe(201);
    expect(first.body.isDefault).toBe(true);
    const second = await api.post('/api/profile/addresses', addr({ label: 'Work', isDefault: true }));
    const list = (await api.get('/api/profile')).body.addresses;
    expect(list.find((a) => a.id === first.body.id).isDefault).toBe(false);
    expect(list.find((a) => a.id === second.body.id).isDefault).toBe(true);
    const edited = await api.patch(`/api/profile/addresses/${first.body.id}`, { city: 'Mumbai' });
    expect(edited.body.city).toBe('Mumbai');
    expect((await api.delete(`/api/profile/addresses/${first.body.id}`)).status).toBe(204);
    expect((await api.get('/api/profile')).body.addresses).toHaveLength(1);
    expect((await api.delete(`/api/profile/addresses/${first.body.id}`)).status).toBe(404);
  });

  test('at most 5 addresses, also under concurrent requests', async () => {
    const { api } = await actor(ctx);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => api.post('/api/profile/addresses', addr({ label: `A${i}` }))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    const refused = results.filter((r) => r.status === 409);
    expect(refused).toHaveLength(3);
    expect(refused[0].body.error.code).toBe('ADDRESS_LIMIT');
    expect((await api.get('/api/profile')).body.addresses).toHaveLength(5);
  });

  test("addresses are private: another customer's address id is 404", async () => {
    const a = await actor(ctx);
    const b = await actor(ctx);
    const mine = await a.api.post('/api/profile/addresses', addr());
    expect((await b.api.patch(`/api/profile/addresses/${mine.body.id}`, { city: 'Hacked' })).status).toBe(404);
    expect((await b.api.delete(`/api/profile/addresses/${mine.body.id}`)).status).toBe(404);
    expect((await a.api.get('/api/profile')).body.addresses[0].city).toBe('Delhi');
  });

  test('required fields and lengths are validated', async () => {
    const { api } = await actor(ctx);
    for (const over of [{ fullName: '' }, { line1: undefined }, { postalCode: '12' }, { phone: '123' }, { country: 'X' }, { label: 'x'.repeat(31) }, { extra: 'field' }]) {
      expect((await api.post('/api/profile/addresses', addr(over))).status).toBe(400);
    }
  });
});
