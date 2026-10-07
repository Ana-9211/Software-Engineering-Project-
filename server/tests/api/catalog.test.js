const { setup, teardown, client, actor, createUser, createCategory, createBook, nextIsbn } = require('../helpers/testContext');
const { buildSearchFields, textCondition, normalise, trigrams } = require('../../src/modules/catalog/search');

let ctx;
let seller;
let cat1;
let cat2;
const guest = () => client(ctx.app);

beforeAll(async () => {
  ctx = await setup();
  seller = await createUser(ctx, { roles: ['customer', 'seller'] });
  cat1 = await createCategory('Fiction');
  cat2 = await createCategory('Science');
  const mk = (title, author, extra = {}) => createBook(ctx, seller, extra.categoryId || cat1._id, { title, author, ...extra });
  await mk("Harry Potter and the Philosopher's Stone", 'J. K. Rowling', { price: 19900, avgRating: 4.8, language: 'English', isbn: '9780747532699' });
  await mk('Harry Potter and the Chamber of Secrets', 'J. K. Rowling', { price: 21900, avgRating: 4.5, language: 'English' });
  await mk('The Hobbit', 'J. R. R. Tolkien', { price: 15000, avgRating: 4.2, language: 'English' });
  await mk('Cosmos', 'Carl Sagan', { price: 30000, avgRating: 3.5, categoryId: cat2._id, language: 'English' });
  await mk('Les Misérables', 'Victor Hugo', { price: 12000, avgRating: 4.9, language: 'French' });
  await mk('Hidden Draft', 'Nobody', { status: 'pending' });
  await mk('Removed Book', 'Nobody', { status: 'removed' });
  // 25 more for pagination
  for (let i = 0; i < 25; i += 1) await mk(`Filler ${String(i).padStart(2, '0')}`, 'Filler Author', { price: 1000 + i });
});
afterAll(() => teardown(ctx));

describe('search helpers (D-10)', () => {
  test('normalise lowercases, strips accents and collapses spaces', () => {
    expect(normalise('  Les   MISÉRABLES ')).toBe('les miserables');
  });
  test('buildSearchFields derives the four fields', () => {
    const f = buildSearchFields("Harry Potter and the Philosopher's Stone", 'J. K. Rowling', '978-0-7475-3269-9');
    expect(f.titleLower).toBe("harry potter and the philosopher's stone");
    expect(f.searchText).toBe("harry potter and the philosopher's stone j. k. rowling 9780747532699");
    expect(f.searchTrigrams).toEqual(expect.arrayContaining(['har', 'arr', 'rry', 'ry ', 'y p']));
    expect(new Set(f.searchTrigrams).size).toBe(f.searchTrigrams.length); // distinct
  });
  test('3+ character queries use $all on trigrams, 1-2 character queries use prefixes', () => {
    const long = textCondition('Potter');
    expect(long.searchTrigrams.$all).toEqual(trigrams('potter'));
    const short = textCondition('ha');
    expect(short.$or).toHaveLength(3);
    expect(short.searchTrigrams).toBeUndefined();
  });
  test('regex characters in the query are escaped', () => {
    expect(textCondition('a.c').searchText.$regex).toBe('a\\.c');
  });
});

describe('browse, pagination and details (FR-04, FR-07, UC-01, UC-03)', () => {
  test('lists only approved books, 20 per page, with paging fields', async () => {
    const res = await guest().get('/api/books');
    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(20);
    expect(res.body.items).toHaveLength(20);
    expect(res.body.totalItems).toBe(30); // 5 + 25 approved, not the pending or removed ones
    expect(res.body.totalPages).toBe(2);
    const page2 = await guest().get('/api/books?page=2');
    expect(page2.body.items).toHaveLength(10);
    expect(res.body.items.some((b) => ['Hidden Draft', 'Removed Book'].includes(b.title))).toBe(false);
  });

  test('never exposes derived search fields or private stock numbers', async () => {
    const res = await guest().get('/api/books?q=cosmos');
    const book = res.body.items[0];
    expect(book).not.toHaveProperty('searchText');
    expect(book).not.toHaveProperty('searchTrigrams');
    expect(book).not.toHaveProperty('titleLower');
    expect(book).not.toHaveProperty('stock');
    expect(book).not.toHaveProperty('reserved');
    expect(book).toMatchObject({ title: 'Cosmos', stockStatus: 'In stock', price: 30000 });
  });

  test('book details; pending, removed and unknown books are 404', async () => {
    const list = await guest().get('/api/books?q=hobbit');
    const id = list.body.items[0].id;
    const ok = await guest().get(`/api/books/${id}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ title: 'The Hobbit', author: 'J. R. R. Tolkien', stockStatus: 'In stock' });
    const pending = await ctx.models.Book.findOne({ title: 'Hidden Draft' });
    expect((await guest().get(`/api/books/${pending._id}`)).status).toBe(404);
    expect((await guest().get('/api/books/aaaaaaaaaaaaaaaaaaaaaaaa')).status).toBe(404);
    expect((await guest().get('/api/books/not-an-id')).status).toBe(400);
  });

  test('shows Out of stock when no unit is available (stock minus reserved)', async () => {
    const b = await createBook(ctx, seller, cat1._id, { title: 'Last Copy Held', stock: 2, reserved: 2 });
    const res = await guest().get(`/api/books/${b._id}`);
    expect(res.body.stockStatus).toBe('Out of stock');
    expect(res.body.available).toBe(0);
    await ctx.models.Book.deleteOne({ _id: b._id });
  });
});

describe('search (FR-05, UC-02, A-14)', () => {
  const titles = async (q) => (await guest().get(`/api/books?q=${encodeURIComponent(q)}`)).body.items.map((b) => b.title);

  test('partial, case-insensitive match anywhere in the title', async () => {
    expect(await titles('potter')).toHaveLength(2);
    expect(await titles('POTTER')).toHaveLength(2);
    expect(await titles('losoph')).toEqual(["Harry Potter and the Philosopher's Stone"]); // middle of a word
  });
  test('matches the author', async () => {
    expect((await titles('rowling')).sort()).toHaveLength(2);
    expect(await titles('tolkien')).toEqual(['The Hobbit']);
  });
  test('matches the ISBN, also with hyphens and fragments', async () => {
    expect(await titles('9780747532699')).toEqual(["Harry Potter and the Philosopher's Stone"]);
    expect(await titles('978-0-7475')).toEqual(["Harry Potter and the Philosopher's Stone"]);
    expect(await titles('747532')).toEqual(["Harry Potter and the Philosopher's Stone"]);
  });
  test('ignores accents', async () => {
    expect(await titles('miserables')).toEqual(['Les Misérables']);
    expect(await titles('MISÉRABLES')).toEqual(['Les Misérables']);
  });
  test('1 and 2 character queries match prefixes of title or author', async () => {
    expect(await titles('co')).toEqual(['Cosmos']);
    expect(await titles('v')).toEqual(['Les Misérables']); // author Victor Hugo
  });
  test('no match gives an empty page, not an error', async () => {
    const res = await guest().get('/api/books?q=zzzzzz');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.totalItems).toBe(0);
  });
  test('trigrams must appear in order: the words reversed do not match', async () => {
    expect(await titles('potter harry')).toEqual([]); // documented phrase behaviour (SDD 4.4.2)
  });
  test('regex metacharacters are matched literally', async () => {
    expect(await titles('.*')).toEqual([]);
    expect(await titles('(')).toEqual([]);
    expect((await guest().get('/api/books?q=%24where')).status).toBe(200);
  });
  test('the search uses the trigram index, not a collection scan', async () => {
    const filter = { status: 'approved', ...textCondition('potter') };
    const plan = await ctx.models.Book.find(filter).explain('queryPlanner');
    const text = JSON.stringify(plan.queryPlanner.winningPlan);
    expect(text).toContain('IXSCAN');
    expect(text).not.toContain('COLLSCAN');
    expect(text).toContain('status_1_searchTrigrams_1');
  });
});

describe('filters and sorting (FR-06)', () => {
  test('category filter', async () => {
    const res = await guest().get(`/api/books?category=${cat2._id}`);
    expect(res.body.items.map((b) => b.title)).toEqual(['Cosmos']);
  });
  test('price range is inclusive and in minor units', async () => {
    const res = await guest().get('/api/books?minPrice=15000&maxPrice=21900');
    expect(res.body.items.map((b) => b.title).sort()).toEqual(['Harry Potter and the Chamber of Secrets', "Harry Potter and the Philosopher's Stone", 'The Hobbit']);
  });
  test('minRating means average rating greater than or equal to the value (A-12)', async () => {
    const res = await guest().get('/api/books?minRating=5');
    expect(res.body.items).toHaveLength(0);
    const four = await guest().get('/api/books?minRating=4');
    expect(four.body.items.map((b) => b.title).sort()).toEqual(['Harry Potter and the Chamber of Secrets', "Harry Potter and the Philosopher's Stone", 'Les Misérables', 'The Hobbit']);
  });
  test('language filter is case-insensitive', async () => {
    const res = await guest().get('/api/books?language=french');
    expect(res.body.items.map((b) => b.title)).toEqual(['Les Misérables']);
  });
  test('sorting by price and rating', async () => {
    const asc = await guest().get('/api/books?sort=price_asc');
    expect(asc.body.items[0].price).toBe(1000);
    const desc = await guest().get('/api/books?sort=price_desc');
    expect(desc.body.items[0].title).toBe('Cosmos');
    const rating = await guest().get('/api/books?sort=rating_desc');
    expect(rating.body.items[0].title).toBe('Les Misérables');
  });
  test('sorting by newest puts the latest created first', async () => {
    const res = await guest().get('/api/books?sort=newest');
    expect(res.body.items[0].title).toBe('Filler 24');
  });
  test('search combined with a filter', async () => {
    const res = await guest().get(`/api/books?q=potter&maxPrice=20000`);
    expect(res.body.items.map((b) => b.title)).toEqual(["Harry Potter and the Philosopher's Stone"]);
  });
  test('invalid query parameters are rejected', async () => {
    for (const q of ['page=0', 'sort=cheapest', 'minRating=9', 'minPrice=-1', 'category=xyz', 'q=', 'unknown=1', 'minPrice=100&maxPrice=50']) {
      const res = await guest().get(`/api/books?${q}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
  test('NoSQL operator injection in the query string is rejected', async () => {
    const res = await guest().get('/api/books?category[$ne]=x');
    expect(res.status).toBe(400);
    const res2 = await guest().get('/api/books?q[$gt]=');
    expect(res2.status).toBe(400);
  });
});

describe('categories (API-18)', () => {
  test('lists categories alphabetically', async () => {
    const res = await guest().get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.map((c) => c.name)).toEqual(['Fiction', 'Science']);
    expect(res.body[0]).toHaveProperty('id');
  });
});

describe('listings: create, edit, remove (FR-20, FR-25, UC-16)', () => {
  let sellerApi;
  let category;
  beforeAll(async () => {
    const a = await actor(ctx, { roles: ['customer', 'seller'] });
    sellerApi = a.api;
    category = cat1;
  });
  const payload = (over = {}) => ({
    title: 'My New Book',
    author: 'Ann Author',
    isbn: nextIsbn(),
    price: 25000,
    description: 'Nice',
    categoryId: String(category._id),
    language: 'English',
    stock: 5,
    ...over,
  });

  test('a new listing is pending and not visible in the catalog; search fields are generated by the server', async () => {
    const res = await sellerApi.post('/api/seller/books', payload({ title: 'Zebra Unique Title' }));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect((await guest().get('/api/books?q=zebra')).body.items).toHaveLength(0);
    const stored = await ctx.models.Book.findById(res.body.id);
    expect(stored.searchText).toContain('zebra unique title');
    expect(stored.searchTrigrams.length).toBeGreaterThan(5);
    expect(stored.reserved).toBe(0);
  });

  test('clients cannot send search fields, status, reserved or a seller id', async () => {
    for (const extra of [{ searchText: 'x' }, { status: 'approved' }, { reserved: 5 }, { sellerId: String(seller._id) }, { searchTrigrams: ['abc'] }]) {
      const res = await sellerApi.post('/api/seller/books', payload(extra));
      expect(res.status).toBe(400);
    }
  });

  test('validates ISBN check digit, price, stock and category', async () => {
    for (const over of [{ isbn: '9780747532690' }, { isbn: 'abc' }, { price: 0 }, { price: 10.5 }, { stock: -1 }, { stock: 100001 }, { title: '' }, { categoryId: 'zz' }]) {
      const res = await sellerApi.post('/api/seller/books', payload(over));
      expect(res.status).toBe(400);
    }
    const missingCat = await sellerApi.post('/api/seller/books', payload({ categoryId: 'a'.repeat(24) }));
    expect(missingCat.status).toBe(400);
    const isbn10 = await sellerApi.post('/api/seller/books', payload({ isbn: '0-306-40615-2' }));
    expect(isbn10.status).toBe(201);
    expect(isbn10.body.isbn).toBe('0306406152');
  });

  test('the same seller cannot reuse an ISBN, another seller can (D-11)', async () => {
    const isbn = nextIsbn();
    expect((await sellerApi.post('/api/seller/books', payload({ isbn }))).status).toBe(201);
    const dup = await sellerApi.post('/api/seller/books', payload({ isbn }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ISBN_EXISTS_FOR_SELLER');
    const other = await actor(ctx, { roles: ['customer', 'seller'] });
    expect((await other.api.post('/api/seller/books', payload({ isbn }))).status).toBe(201);
  });

  test('editing the title regenerates the search fields, the approval status stays', async () => {
    const created = (await sellerApi.post('/api/seller/books', payload({ title: 'Old Title Alpha' }))).body;
    await ctx.models.Book.updateOne({ _id: created.id }, { $set: { status: 'approved' } });
    const edited = await sellerApi.patch(`/api/seller/books/${created.id}`, { title: 'Brand New Gamma', price: 11111 });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ title: 'Brand New Gamma', price: 11111, status: 'approved' });
    expect((await guest().get('/api/books?q=gamma')).body.items).toHaveLength(1);
    expect((await guest().get('/api/books?q=alpha')).body.items).toHaveLength(0);
  });

  test('stock, status and isbn cannot be changed through the edit endpoint', async () => {
    const created = (await sellerApi.post('/api/seller/books', payload())).body;
    for (const body of [{ stock: 99 }, { status: 'approved' }, { isbn: nextIsbn() }, { reserved: 1 }]) {
      expect((await sellerApi.patch(`/api/seller/books/${created.id}`, body)).status).toBe(400);
    }
  });

  test("a seller cannot see, edit or remove another seller's listing (ownership)", async () => {
    const other = await actor(ctx, { roles: ['customer', 'seller'] });
    const theirs = (await other.api.post('/api/seller/books', payload())).body;
    expect((await sellerApi.patch(`/api/seller/books/${theirs.id}`, { price: 1 })).status).toBe(404);
    expect((await sellerApi.delete(`/api/seller/books/${theirs.id}`)).status).toBe(404);
    expect((await sellerApi.patch(`/api/seller/books/${theirs.id}/inventory`, { stock: 1 })).status).toBe(404);
    const mine = await sellerApi.get('/api/seller/books');
    expect(mine.body.items.some((b) => b.id === theirs.id)).toBe(false);
    const still = await ctx.models.Book.findById(theirs.id);
    expect(still.price).toBe(25000);
  });

  test('removing a listing keeps the record with status removed and hides it from the catalog', async () => {
    const created = (await sellerApi.post('/api/seller/books', payload({ title: 'Doomed Book Omega' }))).body;
    await ctx.models.Book.updateOne({ _id: created.id }, { $set: { status: 'approved' } });
    expect((await guest().get('/api/books?q=omega')).body.items).toHaveLength(1);
    expect((await sellerApi.delete(`/api/seller/books/${created.id}`)).status).toBe(204);
    expect((await guest().get('/api/books?q=omega')).body.items).toHaveLength(0);
    expect((await ctx.models.Book.findById(created.id)).status).toBe('removed');
    const removed = await sellerApi.get('/api/seller/books?status=removed');
    expect(removed.body.items.some((b) => b.id === created.id)).toBe(true);
  });

  test('own listings show stock details to the owner and can be filtered by status', async () => {
    const res = await sellerApi.get('/api/seller/books?status=pending');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((b) => b.status === 'pending')).toBe(true);
    expect(res.body.items[0]).toHaveProperty('stock');
    expect(res.body.items[0]).toHaveProperty('reserved');
  });
});
