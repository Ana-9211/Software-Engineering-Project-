import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, catalogApi } from '../../api/endpoints.js';
import { useFetch } from '../../components/useFetch.js';
import { Async, ErrorMessage } from '../../components/states.jsx';
import { TextField } from '../../components/Field.jsx';
import Pagination from '../../components/Pagination.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import StarRating from '../../components/StarRating.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { useToast } from '../../components/Toast.jsx';
import { formatDate, formatMoney, today } from '../../utils/format.js';

// S-24 Administrator dashboard: queues with pending counts that open the approvals screen
export function AdminHome() {
  const apps = useFetch(() => adminApi.applications({ status: 'pending' }), []);
  const books = useFetch(() => adminApi.books({ status: 'pending' }), []);
  return (
    <section>
      <h1>Administrator dashboard</h1>
      <div className="stat-grid">
        <Link to="/admin/approvals" className="stat"><strong>{apps.data ? apps.data.totalItems : '-'}</strong><span>seller applications waiting</span></Link>
        <Link to="/admin/approvals" className="stat"><strong>{books.data ? books.data.totalItems : '-'}</strong><span>listings waiting</span></Link>
        <Link to="/admin/users" className="stat"><strong>Users</strong><span>suspend or reactivate accounts</span></Link>
        <Link to="/admin/reviews" className="stat"><strong>Reviews</strong><span>moderate reviews</span></Link>
        <Link to="/admin/categories" className="stat"><strong>Categories</strong><span>add, rename, delete</span></Link>
        <Link to="/admin/reports" className="stat"><strong>Reports</strong><span>orders and revenue</span></Link>
      </div>
    </section>
  );
}

// S-25 User management (UC-20, FR-24)
export function UsersPage() {
  const [filters, setFilters] = useState({ q: '', role: '', status: '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const users = useFetch(() => adminApi.users({ ...applied, page }), [applied, page]);
  const [target, setTarget] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function change() {
    setBusy(true);
    setError(null);
    try {
      await adminApi.setUserStatus(target.user.id, target.status);
      toast.show(target.status === 'suspended' ? 'Account suspended.' : 'Account reactivated.', 'success');
      users.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      setTarget(null);
    }
  }

  return (
    <section>
      <h1>Users</h1>
      <ErrorMessage error={error} />
      <form className="row" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(filters); }}>
        <TextField label="Search name or email" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} maxLength={100} />
        <div className="field">
          <label htmlFor="role">Role</label>
          <select id="role" value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
            <option value="">All</option><option>customer</option><option>seller</option><option>admin</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ustatus">Status</label>
          <select id="ustatus" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All</option><option>active</option><option>pending_verification</option><option>suspended</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary">Filter</button>
      </form>
      <Async state={users} empty={{ test: (d) => d.items.length === 0, title: 'No users match.' }}>
        {(d) => (
          <>
            <table className="table responsive">
              <thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Status</th><th><span className="sr-only">Action</span></th></tr></thead>
              <tbody>
                {d.items.map((u) => (
                  <tr key={u.id}>
                    <td data-label="Name">{u.name}</td>
                    <td data-label="Email">{u.email}</td>
                    <td data-label="Roles">{u.roles.join(', ')}</td>
                    <td data-label="Status"><StatusBadge status={u.status} /></td>
                    <td>
                      {u.status === 'suspended'
                        ? <button type="button" className="btn btn-small" onClick={() => setTarget({ user: u, status: 'active' })}>Reactivate</button>
                        : <button type="button" className="btn btn-small btn-danger" onClick={() => setTarget({ user: u, status: 'suspended' })}>Suspend</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </Async>
      {target && (
        <ConfirmDialog title={target.status === 'suspended' ? 'Suspend this account?' : 'Reactivate this account?'} confirmLabel={target.status === 'suspended' ? 'Suspend' : 'Reactivate'} danger={target.status === 'suspended'} busy={busy} onConfirm={change} onCancel={() => setTarget(null)}>
          <p>{target.user.name} ({target.user.email}){target.status === 'suspended' ? ' will be logged out and cannot log in.' : ' will be able to log in again.'}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

// asks for a reason and rejects (FR-25)
function RejectDialog({ title, onSubmit, onCancel }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  return (
    <ConfirmDialog title={title} confirmLabel="Reject" danger onConfirm={() => (reason.trim() ? onSubmit(reason.trim()) : setError('Enter a reason.'))} onCancel={onCancel}>
      <TextField label="Reason (shown to the applicant)" value={reason} onChange={(e) => setReason(e.target.value)} error={error} maxLength={500} />
    </ConfirmDialog>
  );
}

// S-26 Seller and listing approvals (UC-21, FR-19, FR-25)
export function ApprovalsPage() {
  const [appPage, setAppPage] = useState(1);
  const [bookPage, setBookPage] = useState(1);
  const apps = useFetch(() => adminApi.applications({ status: 'pending', page: appPage }), [appPage]);
  const books = useFetch(() => adminApi.books({ status: 'pending', page: bookPage }), [bookPage]);
  const [rejecting, setRejecting] = useState(null);
  const [error, setError] = useState(null);
  const toast = useToast();

  async function act(fn, ok, list) {
    setError(null);
    try {
      await fn();
      toast.show(ok, 'success');
    } catch (err) {
      setError(err);
    } finally {
      setRejecting(null);
      list.reload();
    }
  }

  return (
    <section>
      <h1>Approvals</h1>
      <ErrorMessage error={error} />
      <h2>Seller applications</h2>
      <Async state={apps} empty={{ test: (d) => d.items.length === 0, title: 'No applications are waiting.' }}>
        {(d) => (
          <>
            <ul className="plain cards">
              {d.items.map((a) => (
                <li key={a.id} className="panel">
                  <strong>{a.storeName}</strong> <span className="muted">by {a.applicantName}</span>
                  {a.description && <p>{a.description}</p>}
                  <p className="muted">Applied {formatDate(a.createdAt)}</p>
                  <div className="row">
                    <button type="button" className="btn btn-small btn-primary" onClick={() => act(() => adminApi.approveApplication(a.id), 'Application approved.', apps)}>Approve</button>
                    <button type="button" className="btn btn-small btn-danger" onClick={() => setRejecting({ kind: 'app', item: a })}>Reject</button>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setAppPage} />
          </>
        )}
      </Async>
      <h2>Listings</h2>
      <Async state={books} empty={{ test: (d) => d.items.length === 0, title: 'No listings are waiting.' }}>
        {(d) => (
          <>
            <ul className="plain cards">
              {d.items.map((b) => (
                <li key={b.id} className="panel">
                  <strong>{b.title}</strong> <span className="muted">by {b.author} - ISBN {b.isbn}</span>
                  <p>{formatMoney(b.price)} - {b.stock} copies - {b.language}</p>
                  {b.description && <p>{b.description}</p>}
                  <div className="row">
                    <button type="button" className="btn btn-small btn-primary" onClick={() => act(() => adminApi.approveBook(b.id), 'Listing approved.', books)}>Approve</button>
                    <button type="button" className="btn btn-small btn-danger" onClick={() => setRejecting({ kind: 'book', item: b })}>Reject</button>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setBookPage} />
          </>
        )}
      </Async>
      {rejecting && (
        <RejectDialog
          title={`Reject ${rejecting.kind === 'app' ? rejecting.item.storeName : rejecting.item.title}?`}
          onCancel={() => setRejecting(null)}
          onSubmit={(reason) =>
            rejecting.kind === 'app'
              ? act(() => adminApi.rejectApplication(rejecting.item.id, reason), 'Application rejected.', apps)
              : act(() => adminApi.rejectBook(rejecting.item.id, reason), 'Listing rejected.', books)
          }
        />
      )}
    </section>
  );
}

// S-27 Review moderation (UC-22, FR-27)
export function ReviewModerationPage() {
  const [maxRating, setMaxRating] = useState('');
  const [page, setPage] = useState(1);
  const reviews = useFetch(() => adminApi.reviews({ maxRating, page }), [maxRating, page]);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState(null);
  const toast = useToast();

  async function remove() {
    try {
      await adminApi.deleteReview(removing.id);
      toast.show('Review removed.', 'success');
    } catch (err) {
      setError(err);
    } finally {
      setRemoving(null);
      reviews.reload();
    }
  }

  return (
    <section>
      <h1>Review moderation</h1>
      <ErrorMessage error={error} />
      <div className="field inline">
        <label htmlFor="maxr">Show ratings up to</label>
        <select id="maxr" value={maxRating} onChange={(e) => { setMaxRating(e.target.value); setPage(1); }}>
          <option value="">Any rating</option>
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} stars</option>)}
        </select>
      </div>
      <Async state={reviews} empty={{ test: (d) => d.items.length === 0, title: 'No reviews found.' }}>
        {(d) => (
          <>
            <ul className="plain cards">
              {d.items.map((r) => (
                <li key={r.id} className="panel">
                  <StarRating value={r.rating} /> <strong>{r.userName}</strong> <small className="muted">{formatDate(r.createdAt)} - <Link to={`/books/${r.bookId}`}>book</Link></small>
                  {r.comment && <p className="review-comment">{r.comment}</p>}
                  <button type="button" className="btn btn-small btn-danger" onClick={() => setRemoving(r)}>Remove review</button>
                </li>
              ))}
            </ul>
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </Async>
      {removing && (
        <ConfirmDialog title="Remove this review?" confirmLabel="Remove" danger onConfirm={remove} onCancel={() => setRemoving(null)}>
          <p>The book rating is recalculated.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

// S-28 Category management (UC-23, FR-26)
export function CategoriesPage() {
  const categories = useFetch(() => catalogApi.categories(), []);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState(null);
  const toast = useToast();

  async function act(fn, message) {
    setError(null);
    try {
      await fn();
      toast.show(message, 'success');
    } catch (err) {
      setError(err); // CATEGORY_EXISTS and CATEGORY_IN_USE show their messages
    } finally {
      setRemoving(null);
      categories.reload();
    }
  }

  return (
    <section className="narrow">
      <h1>Categories</h1>
      <ErrorMessage error={error} />
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { act(() => adminApi.createCategory(name.trim()), 'Category added.'); setName(''); } }}>
        <TextField label="New category" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <button type="submit" className="btn btn-primary">Add</button>
      </form>
      <Async state={categories} empty={{ test: (d) => d.length === 0, title: 'No categories yet.' }}>
        {(list) => (
          <ul className="plain cards">
            {list.map((c) => (
              <li key={c.id} className="panel row">
                {editing === c.id ? (
                  <form className="row" onSubmit={(e) => { e.preventDefault(); act(() => adminApi.renameCategory(c.id, editName.trim()), 'Category renamed.'); setEditing(null); }}>
                    <TextField label={`Rename ${c.name}`} value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={60} />
                    <button type="submit" className="btn btn-small btn-primary">Save</button>
                    <button type="button" className="btn btn-small" onClick={() => setEditing(null)}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <span>{c.name}</span>
                    <button type="button" className="btn btn-small" onClick={() => { setEditing(c.id); setEditName(c.name); }}>Rename</button>
                    <button type="button" className="btn btn-small btn-danger" onClick={() => setRemoving(c)}>Delete</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Async>
      {removing && (
        <ConfirmDialog title={`Delete ${removing.name}?`} confirmLabel="Delete" danger onConfirm={() => act(() => adminApi.deleteCategory(removing.id), 'Category deleted.')} onCancel={() => setRemoving(null)}>
          <p>A category that still has books cannot be deleted.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

// S-29 Platform reports (UC-24, FR-28)
export function PlatformReportPage() {
  const [range, setRange] = useState({ from: today().slice(0, 8) + '01', to: today() });
  const [report, setReport] = useState({ data: null, error: null });

  async function run(e) {
    e && e.preventDefault();
    if (range.from > range.to) return setReport({ data: null, error: { message: 'The start date must not be after the end date.' } });
    try {
      setReport({ data: await adminApi.platformReport(range.from, range.to), error: null });
    } catch (err) {
      setReport({ data: null, error: err });
    }
    return undefined;
  }
  useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const d = report.data;
  return (
    <section>
      <h1>Platform report</h1>
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
            <div className="stat"><strong>{formatMoney(d.revenue)}</strong><span>revenue</span></div>
          </div>
          <h2>Best-selling books</h2>
          {d.topBooks.length === 0 ? <p className="muted">No sales in this period.</p> : (
            <ol className="top-list">{d.topBooks.map((b) => <li key={b.bookId}>{b.title} <strong>{b.units}</strong> sold</li>)}</ol>
          )}
        </>
      )}
    </section>
  );
}
