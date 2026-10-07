import { useState } from 'react';
import { reviewApi } from '../../api/endpoints.js';
import { Field } from '../../components/Field.jsx';
import { ErrorMessage } from '../../components/states.jsx';
import StarRating from '../../components/StarRating.jsx';
import Pagination from '../../components/Pagination.jsx';
import { formatDate } from '../../utils/format.js';

// ReviewList (FM-07): text is rendered as text by React, never as HTML (VFR-06)
export function ReviewList({ data, onPage }) {
  if (!data || data.items.length === 0) return <p className="muted">There are no reviews yet.</p>;
  return (
    <>
      <ul className="review-list">
        {data.items.map((r) => (
          <li key={r.id}>
            <StarRating value={r.rating} />
            <strong> {r.userName}</strong> <small className="muted">{formatDate(r.createdAt)}</small>
            {r.comment && <p className="review-comment">{r.comment}</p>}
          </li>
        ))}
      </ul>
      <Pagination page={data.page} totalPages={data.totalPages} onChange={onPage} />
    </>
  );
}

// S-15 ReviewForm (UC-12, FR-17): only customers with a delivered order are accepted by the server
export function ReviewForm({ bookId, onDone }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await reviewApi.create(bookId, { rating: Number(rating), comment });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="review-form">
      <h3>Write a review</h3>
      <ErrorMessage error={error} />
      <Field label="Rating">
        {(p) => (
          <select {...p} value={rating} onChange={(e) => setRating(e.target.value)}>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} - {['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'][n]}</option>)}
          </select>
        )}
      </Field>
      <Field label="Comment (optional)" hint={`${comment.length} / 2000`}>
        {(p) => <textarea {...p} value={comment} maxLength={2000} rows={4} onChange={(e) => setComment(e.target.value)} />}
      </Field>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Submit review'}</button>
    </form>
  );
}
