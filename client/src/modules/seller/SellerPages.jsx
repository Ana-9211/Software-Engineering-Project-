import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { catalogApi, sellerApi } from '../../api/endpoints.js';
import { useFetch } from '../../components/useFetch.js';
import { Async, ErrorMessage } from '../../components/states.jsx';
import { Field, SelectField, TextArea, TextField } from '../../components/Field.jsx';
import Pagination from '../../components/Pagination.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { useToast } from '../../components/Toast.jsx';
import { formatDateTime, formatMoney, minorToInput, today, toMinorUnits } from '../../utils/format.js';

// AlertList (FM-09): in-app low-stock alerts (FR-21)
function AlertList({ limit = 5 }) {
  const alerts = useFetch(() => sellerApi.notifications({ unread: true }), []);
  const toast = useToast();
  async function markRead(id) {
    await sellerApi.markRead(id).catch((e) => toast.show(e.message, 'error'));
    alerts.reload();
  }
  return (
    <Async state={alerts} empty={{ test: (d) => d.items.length === 0, title: 'No new alerts.' }}>
      {(d) => (
        <ul className="alert-list">
          {d.items.slice(0, limit).map((n) => (
            <li key={n.id} className="alert alert-info">
              <span>{n.subject} <small className="muted">{formatDateTime(n.createdAt)}</small></span>
              <button type="button" className="btn btn-small" onClick={() => markRead(n.id)}>Mark as read</button>
            </li>
          ))}
        </ul>
      )}
    </Async>
  );
}

// S-18 Seller dashboard (home and alerts)
export function SellerHome() {
  const pending = useFetch(() => sellerApi.listings({ status: 'pending' }), []);
  const orders = useFetch(() => sellerApi.orders({ status: 'Placed' }), []);
  return (
    <section>
      <h1>Seller dashboard</h1>
      <div className="stat-grid">
        <Link to="/seller/books" className="stat"><strong>{pending.data ? pending.data.totalItems : '-'}</strong><span>listings waiting for approval</span></Link>
        <Link to="/seller/orders" className="stat"><strong>{orders.data ? orders.data.totalItems : '-'}</strong><span>new orders to pack</span></Link>
        <Link to="/seller/inventory" className="stat"><strong>Stock</strong><span>manage inventory</span></Link>
      </div>
      <h2>Alerts</h2>
      <AlertList />
    </section>
  );
}

// S-19 Seller listings (UC-16)
export function ListingsPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const listings = useFetch(() => sellerApi.listings({ status, page }), [status, page]);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState(null);
  const toast = useToast();

  async function remove() {
    try {
      await sellerApi.removeListing(removing.id);
      toast.show('Listing removed.', 'success');
      listings.reload();
    } catch (err) {
      setError(err);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section>
      <div className="page-head">
        <h1>My listings</h1>
        <Link to="/seller/books/new" className="btn btn-primary">New listing</Link>
      </div>
      <ErrorMessage error={error} />
      <div className="field inline">
        <label htmlFor="status">Show</label>
        <select id="status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {['pending', 'approved', 'rejected', 'removed'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <Async state={listings} empty={{ test: (d) => d.items.length === 0, title: 'No listings here yet.' }}>
        {(d) => (
          <>
            <table className="table responsive">
              <thead><tr><th>Title</th><th>Price</th><th>Stock</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {d.items.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Title">{b.title}<div className="muted">{b.author} - ISBN {b.isbn}</div>{b.rejectionReason && <div className="field-error">Rejected: {b.rejectionReason}</div>}</td>
                    <td data-label="Price">{formatMoney(b.price)}</td>
                    <td data-label="Stock">{b.available} available ({b.stock} on hand)</td>
                    <td data-label="Status"><StatusBadge status={b.status} /></td>
                    <td>
                      {b.status !== 'removed' && (
                        <div className="row">
                          <Link to={`/seller/books/${b.id}/edit`} className="btn btn-small">Edit</Link>
                          <button type="button" className="btn btn-small btn-danger" onClick={() => setRemoving(b)}>Remove</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </Async>
      {removing && (
        <ConfirmDialog title="Remove this listing?" confirmLabel="Remove" danger onConfirm={remove} onCancel={() => setRemoving(null)}>
          <p>{removing.title} will no longer be shown in the catalog. Past orders keep their details.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

// ImageUploader (FM-09): up to 3 JPEG or PNG images of at most 2 MB each (D-09)
function ImageUploader({ imageIds, onChange }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    if (!['image/jpeg', 'image/png'].includes(file.type)) return setError({ message: 'Choose a JPEG or PNG image.' });
    if (file.size > 2 * 1024 * 1024) return setError({ message: 'The image is larger than 2 MB. Choose a smaller one.' });
    setBusy(true);
    try {
      const { imageId } = await sellerApi.uploadImage(file);
      onChange([...imageIds, imageId]);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  return (
    <fieldset>
      <legend>Images ({imageIds.length} of 3, the first is the cover)</legend>
      <ErrorMessage error={error} />
      <div className="thumbs">
        {imageIds.map((id, i) => (
          <figure key={id}>
            <img src={`/api/images/${id}`} alt={i === 0 ? 'Cover preview' : `Image ${i + 1} preview`} />
            <button type="button" className="btn btn-small" onClick={() => onChange(imageIds.filter((x) => x !== id))}>Remove</button>
            {i > 0 && <button type="button" className="btn btn-small" onClick={() => onChange([id, ...imageIds.filter((x) => x !== id)])}>Make cover</button>}
          </figure>
        ))}
      </div>
      {imageIds.length < 3 && (
        <Field label={busy ? 'Uploading...' : 'Add an image'}>
          {(p) => <input {...p} type="file" accept="image/jpeg,image/png" onChange={onFile} disabled={busy} />}
        </Field>
      )}
    </fieldset>
  );
}

const BLANK_LISTING = { title: '', author: '', isbn: '', price: '', description: '', categoryId: '', language: 'English', stock: '0', lowStockThreshold: '5', imageIds: [] };

// S-20 Listing form: create and edit (UC-16, FR-20). Stock is changed on the inventory screen after creation.
export function ListingFormPage() {
  const { bookId } = useParams();
  const editing = Boolean(bookId);
  const navigate = useNavigate();
  const toast = useToast();
  const categories = useFetch(() => catalogApi.categories(), []);
  const existing = useFetch(async () => {
    if (!editing) return null;
    const list = await sellerApi.listings({});
    const found = list.items.find((b) => b.id === bookId);
    if (found) return found;
    // the listing may be on a later page
    for (let p = 2; p <= list.totalPages; p += 1) {
      const next = await sellerApi.listings({ page: p });
      const hit = next.items.find((b) => b.id === bookId);
      if (hit) return hit;
    }
    throw Object.assign(new Error('Listing not found'), { status: 404 });
  }, [bookId]);
  const [form, setForm] = useState(BLANK_LISTING);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const b = existing.data;
    if (b) {
      setForm({
        title: b.title, author: b.author, isbn: b.isbn, price: minorToInput(b.price), description: b.description || '', categoryId: b.categoryId,
        language: b.language, stock: String(b.stock), lowStockThreshold: String(b.lowStockThreshold), imageIds: b.imageUrls.map((u) => u.split('/').pop()),
      });
    }
  }, [existing.data]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function validate() {
    const e = {};
    if (!form.title.trim()) e.title = 'Enter the title.';
    if (!form.author.trim()) e.author = 'Enter the author.';
    if (!editing && !/^[0-9Xx\- ]{10,17}$/.test(form.isbn.trim())) e.isbn = 'Enter an ISBN-10 or ISBN-13.';
    const price = toMinorUnits(form.price);
    if (Number.isNaN(price) || price < 1) e.price = 'Enter a price greater than 0, for example 249.00.';
    if (!form.categoryId) e.categoryId = 'Choose a category.';
    if (form.language.trim().length < 2) e.language = 'Enter the language.';
    if (!editing && !/^\d+$/.test(form.stock)) e.stock = 'Enter the number of copies in stock.';
    return e;
  }

  async function submit(ev) {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    setError(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    const body = {
      title: form.title.trim(), author: form.author.trim(), price: toMinorUnits(form.price), description: form.description,
      categoryId: form.categoryId, language: form.language.trim(), imageIds: form.imageIds,
    };
    try {
      if (editing) {
        await sellerApi.updateListing(bookId, body);
      } else {
        await sellerApi.createListing({ ...body, isbn: form.isbn.trim(), stock: Number(form.stock), lowStockThreshold: Number(form.lowStockThreshold || 5) });
      }
      toast.show(editing ? 'Listing saved.' : 'Listing created. It appears in the catalog after an administrator approves it.', 'success');
      navigate('/seller/books');
    } catch (err) {
      setError(err);
      setErrors(err.fieldErrors ? err.fieldErrors() : {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="narrow">
      <h1>{editing ? 'Edit listing' : 'New listing'}</h1>
      <Async state={existing}>
        {() => (
          <form onSubmit={submit} noValidate>
            <ErrorMessage error={error} />
            <TextField label="Title" value={form.title} onChange={set('title')} error={errors.title} maxLength={200} required />
            <TextField label="Author" value={form.author} onChange={set('author')} error={errors.author} maxLength={150} required />
            <TextField label="ISBN" value={form.isbn} onChange={set('isbn')} error={errors.isbn} disabled={editing} hint={editing ? 'The ISBN cannot be changed.' : 'ISBN-10 or ISBN-13, hyphens allowed.'} required />
            <TextField label="Price" inputMode="decimal" value={form.price} onChange={set('price')} error={errors.price} required />
            <SelectField label="Category" value={form.categoryId} onChange={set('categoryId')} error={errors.categoryId} required>
              <option value="">Choose a category</option>
              {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectField>
            <TextField label="Language" value={form.language} onChange={set('language')} error={errors.language} maxLength={30} required />
            {!editing && (
              <div className="row">
                <TextField label="Copies in stock" inputMode="numeric" value={form.stock} onChange={set('stock')} error={errors.stock} required />
                <TextField label="Low-stock alert at" inputMode="numeric" value={form.lowStockThreshold} onChange={set('lowStockThreshold')} />
              </div>
            )}
            {editing && <p className="muted">Change stock on the <Link to="/seller/inventory">inventory screen</Link>.</p>}
            <TextArea label="Description (optional)" value={form.description} onChange={set('description')} maxLength={5000} rows={5} />
            <ImageUploader imageIds={form.imageIds} onChange={(ids) => setForm({ ...form, imageIds: ids })} />
            <div className="row">
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save listing'}</button>
              <Link to="/seller/books" className="btn">Cancel</Link>
            </div>
          </form>
        )}
      </Async>
    </section>
  );
}

// one row of the inventory screen
function InventoryRow({ book, onSaved }) {
  const [stock, setStock] = useState(String(book.stock));
  const [threshold, setThreshold] = useState(String(book.lowStockThreshold));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function save(e) {
    e.preventDefault();
    setError(null);
    if (!/^\d+$/.test(stock) || !/^\d+$/.test(threshold)) return setError({ message: 'Use whole numbers.' });
    setBusy(true);
    try {
      await sellerApi.setInventory(book.id, { stock: Number(stock), lowStockThreshold: Number(threshold) });
      toast.show(`Stock of "${book.title}" updated.`, 'success');
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
    return undefined;
  }
  return (
    <tr>
      <td data-label="Book">{book.title}{error && <div className="field-error" role="alert">{error.message}</div>}</td>
      <td data-label="Reserved">{book.reserved}</td>
      <td data-label="Available">{book.available} <span className={book.stockStatus === 'In stock' ? 'in-stock' : 'out-of-stock'}>({book.stockStatus})</span></td>
      <td colSpan={3}>
        <form className="row" onSubmit={save}>
          <label className="sr-only" htmlFor={`s-${book.id}`}>Stock of {book.title}</label>
          <input id={`s-${book.id}`} inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} size={6} />
          <label className="sr-only" htmlFor={`t-${book.id}`}>Low-stock threshold of {book.title}</label>
          <input id={`t-${book.id}`} inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} size={4} />
          <button type="submit" className="btn btn-small btn-primary" disabled={busy}>Save</button>
        </form>
      </td>
    </tr>
  );
}

// S-21 Inventory (UC-17, FR-21)
export function InventoryPage() {
  const [page, setPage] = useState(1);
  const listings = useFetch(() => sellerApi.listings({ page }), [page]);
  return (
    <section>
      <h1>Inventory</h1>
      <p className="muted">Reserved copies belong to customers who are paying right now. Stock cannot be set below the reserved number.</p>
      <h2>Alerts</h2>
      <AlertList />
      <h2>Stock levels</h2>
      <Async state={listings} empty={{ test: (d) => d.items.length === 0, title: 'You have no listings yet.' }}>
        {(d) => (
          <>
            <table className="table responsive">
              <thead><tr><th>Book</th><th>Reserved</th><th>Available</th><th colSpan={3}>Stock on hand and alert threshold</th></tr></thead>
              <tbody>{d.items.filter((b) => b.status !== 'removed').map((b) => <InventoryRow key={`${b.id}-${b.stock}-${b.lowStockThreshold}`} book={b} onSaved={listings.reload} />)}</tbody>
            </table>
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </Async>
    </section>
  );
}

const NEXT = { Placed: 'Packed', Packed: 'Shipped', Shipped: 'Delivered' };

// S-22 Seller orders (UC-18, FR-22)
export function SellerOrdersPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const orders = useFetch(() => sellerApi.orders({ status, page }), [status, page]);
  const [error, setError] = useState(null);
  const toast = useToast();

  async function advance(order, item) {
    setError(null);
    try {
      await sellerApi.setItemStatus(order.id, item.id, NEXT[item.fulfilmentStatus]);
      toast.show(`Marked as ${NEXT[item.fulfilmentStatus]}.`, 'success');
    } catch (err) {
      setError(err);
    } finally {
      orders.reload();
    }
  }

  return (
    <section>
      <h1>Orders with my books</h1>
      <ErrorMessage error={error} />
      <div className="field inline">
        <label htmlFor="ostatus">Item status</label>
        <select id="ostatus" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All</option>
          {['Placed', 'Packed', 'Shipped', 'Delivered', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <Async state={orders} empty={{ test: (d) => d.items.length === 0, title: 'No orders yet.' }}>
        {(d) => (
          <>
            {d.items.map((o) => (
              <article key={o.id} className="panel">
                <h2>{o.orderNumber} <small className="muted">{formatDateTime(o.placedAt)}</small></h2>
                <address>Ship to {o.shippingAddress.fullName}, {o.shippingAddress.line1}{o.shippingAddress.line2 ? `, ${o.shippingAddress.line2}` : ''}, {o.shippingAddress.city}, {o.shippingAddress.state} {o.shippingAddress.postalCode}, {o.shippingAddress.country} - {o.shippingAddress.phone}</address>
                <table className="table responsive">
                  <thead><tr><th>Book</th><th>Qty</th><th>Amount</th><th>Status</th><th><span className="sr-only">Action</span></th></tr></thead>
                  <tbody>
                    {o.items.map((i) => (
                      <tr key={i.id}>
                        <td data-label="Book">{i.title}</td>
                        <td data-label="Qty">{i.quantity}</td>
                        <td data-label="Amount">{formatMoney(i.lineTotal)}</td>
                        <td data-label="Status"><StatusBadge status={i.fulfilmentStatus} /></td>
                        <td>{NEXT[i.fulfilmentStatus] && <button type="button" className="btn btn-small btn-primary" onClick={() => advance(o, i)}>Mark as {NEXT[i.fulfilmentStatus]}</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            ))}
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </Async>
    </section>
  );
}

// S-23 Sales report (UC-19, FR-23)
export function SalesReportPage() {
  const [range, setRange] = useState({ from: today().slice(0, 8) + '01', to: today() });
  const [report, setReport] = useState({ data: null, error: null, loading: false });

  async function run(e) {
    e && e.preventDefault();
    if (range.from > range.to) return setReport({ data: null, error: { message: 'The start date must not be after the end date.' }, loading: false });
    setReport({ data: null, error: null, loading: true });
    try {
      setReport({ data: await sellerApi.salesReport(range.from, range.to), error: null, loading: false });
    } catch (err) {
      setReport({ data: null, error: err, loading: false });
    }
    return undefined;
  }
  useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const d = report.data;
  return (
    <section>
      <h1>Sales report</h1>
      <form onSubmit={run} className="row" noValidate>
        <TextField label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} max={range.to} />
        <TextField label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} min={range.from} />
        <button type="submit" className="btn btn-primary">Show report</button>
      </form>
      <ErrorMessage error={report.error} />
      {d && (
        <>
          <div className="stat-grid">
            <div className="stat"><strong>{d.orderCount}</strong><span>orders</span></div>
            <div className="stat"><strong>{d.unitsSold}</strong><span>books sold</span></div>
            <div className="stat"><strong>{formatMoney(d.revenue)}</strong><span>revenue</span></div>
          </div>
          {d.byBook.length === 0 ? <p className="muted">No sales in this period.</p> : (
            <table className="table responsive">
              <thead><tr><th>Book</th><th>Units</th><th>Revenue</th></tr></thead>
              <tbody>{d.byBook.map((b) => <tr key={b.bookId}><td data-label="Book">{b.title}</td><td data-label="Units">{b.units}</td><td data-label="Revenue">{formatMoney(b.revenue)}</td></tr>)}</tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
