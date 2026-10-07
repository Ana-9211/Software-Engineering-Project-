const { setup, teardown, client, actor, createCategory, nextIsbn } = require('../helpers/testContext');

let ctx;
let seller;
let other;
let category;
beforeAll(async () => {
  ctx = await setup();
  seller = await actor(ctx, { roles: ['customer', 'seller'] });
  other = await actor(ctx, { roles: ['customer', 'seller'] });
  category = await createCategory('Media tests');
});
afterAll(() => teardown(ctx));

// smallest valid-looking files: only the signature bytes matter to the check
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 2)]);

async function upload(actorApi, buffer, filename = 'cover.jpg', contentType = 'image/jpeg') {
  const csrf = await actorApi.token();
  return actorApi.agent.post('/api/seller/uploads/images').set('X-CSRF-Token', csrf).attach('file', buffer, { filename, contentType });
}

describe('GridFS image upload and download (D-09, FR-20, FR-07)', () => {
  test('stores a JPEG and a PNG and streams them back with cache headers', async () => {
    const jpg = await upload(seller.api, JPEG);
    expect(jpg.status).toBe(201);
    expect(jpg.body.url).toBe(`/api/images/${jpg.body.imageId}`);
    const png = await upload(seller.api, PNG, 'a.png', 'image/png');
    expect(png.status).toBe(201);

    const res = await client(ctx.app).agent.get(jpg.body.url).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toMatch(/public, max-age=31536000/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(res.body, JPEG)).toBe(0);
    const cond = await client(ctx.app).agent.get(jpg.body.url).set('If-None-Match', res.headers.etag);
    expect(cond.status).toBe(304);
    const files = await ctx.models.User.db.db.collection('fs.files').find({}).toArray();
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  test('the type is decided from the bytes, not the file name or declared type', async () => {
    const text = await upload(seller.api, Buffer.from('<script>alert(1)</script>'), 'evil.jpg', 'image/jpeg');
    expect(text.status).toBe(400);
    expect(text.body.error.code).toBe('INVALID_FILE');
    const svg = await upload(seller.api, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'x.svg', 'image/svg+xml');
    expect(svg.status).toBe(400);
    const gif = await upload(seller.api, Buffer.from('GIF89a\u0001\u0000'), 'x.png', 'image/png');
    expect(gif.status).toBe(400);
    const exe = await upload(seller.api, Buffer.concat([Buffer.from('MZ'), Buffer.alloc(50)]), 'x.png', 'image/png');
    expect(exe.status).toBe(400);
    // a real PNG with a wrong name and declared type is still accepted
    expect((await upload(seller.api, PNG, 'photo.exe', 'application/octet-stream')).status).toBe(201);
  });

  test('a file larger than 2 MB is refused with 413', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(2 * 1024 * 1024)]);
    const res = await upload(seller.api, big);
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    const exactly = Buffer.concat([JPEG, Buffer.alloc(2 * 1024 * 1024 - JPEG.length)]);
    expect((await upload(seller.api, exactly)).status).toBe(201);
  });

  test('a missing file field is refused', async () => {
    const csrf = await seller.api.token();
    const res = await seller.api.agent.post('/api/seller/uploads/images').set('X-CSRF-Token', csrf).field('x', 'y');
    expect(res.status).toBe(400);
  });

  test('only sellers can upload; guests and customers are refused', async () => {
    const customer = await actor(ctx);
    expect((await upload(customer.api, JPEG)).status).toBe(403);
    const g = client(ctx.app);
    const csrf = await g.token();
    const res = await g.agent.post('/api/seller/uploads/images').set('X-CSRF-Token', csrf).attach('file', JPEG, 'a.jpg');
    expect(res.status).toBe(401);
  });

  test('unknown image id is 404, malformed id is 400', async () => {
    expect((await client(ctx.app).get(`/api/images/${'a'.repeat(24)}`)).status).toBe(404);
    expect((await client(ctx.app).get('/api/images/xyz')).status).toBe(400);
  });
});

describe('images on listings (max 3, owned by the seller)', () => {
  const listing = (imageIds) => ({
    title: 'With Images',
    author: 'Img Author',
    isbn: nextIsbn(),
    price: 5000,
    categoryId: String(category._id),
    language: 'English',
    stock: 1,
    imageIds,
  });

  test('a listing can use up to 3 own images; the first is the cover', async () => {
    const ids = [];
    for (let i = 0; i < 4; i += 1) ids.push((await upload(seller.api, JPEG)).body.imageId);
    const three = await seller.api.post('/api/seller/books', listing(ids.slice(0, 3)));
    expect(three.status).toBe(201);
    expect(three.body.imageUrls).toEqual(ids.slice(0, 3).map((i) => `/api/images/${i}`));
    const four = await seller.api.post('/api/seller/books', listing(ids));
    expect(four.status).toBe(400);
  });

  test("another seller's image, an unknown image and duplicate ids are refused", async () => {
    const mine = (await upload(seller.api, JPEG)).body.imageId;
    const theirs = (await upload(other.api, JPEG)).body.imageId;
    expect((await seller.api.post('/api/seller/books', listing([theirs]))).status).toBe(400);
    expect((await seller.api.post('/api/seller/books', listing(['b'.repeat(24)]))).status).toBe(400);
    expect((await seller.api.post('/api/seller/books', listing([mine, mine]))).status).toBe(400);
    const created = await seller.api.post('/api/seller/books', listing([mine]));
    expect(created.status).toBe(201);
    expect((await seller.api.patch(`/api/seller/books/${created.body.id}`, { imageIds: [theirs] })).status).toBe(400);
  });
});
