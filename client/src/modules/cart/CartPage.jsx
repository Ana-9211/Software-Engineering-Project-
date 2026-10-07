import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cartApi } from '../../api/endpoints.js';
import { useFetch } from '../../components/useFetch.js';
import { Async, ErrorMessage } from '../../components/states.jsx';
import { notifyCartChanged } from '../../components/NavBar.jsx';
import { formatMoney } from '../../utils/format.js';

// OrderSummaryBox (FM-03, FM-05): subtotal, tax, shipping and total as returned by the API (FR-12)
export function OrderSummaryBox({ summary }) {
  return (
    <dl className="summary" aria-label="Order summary">
      <dt>Subtotal</dt><dd>{formatMoney(summary.subtotal)}</dd>
      <dt>Tax</dt><dd>{formatMoney(summary.tax)}</dd>
      <dt>Shipping</dt><dd>{formatMoney(summary.shippingFee)}</dd>
      <dt className="total">Total</dt><dd className="total">{formatMoney(summary.total)}</dd>
    </dl>
  );
}

function CartItemRow({ item, onChange, onRemove, busy }) {
  const [qty, setQty] = useState(item.quantity);
  return (
    <tr>
      <td data-label="Book">
        <Link to={`/books/${item.bookId}`}>{item.title}</Link>
        <div className="muted">{item.author}</div>
        {!item.available && <div className="field-error" role="alert">Only {item.availableUnits} available now. Reduce the quantity.</div>}
      </td>
      <td data-label="Price">{formatMoney(item.unitPrice)}</td>
      <td data-label="Quantity">
        <label className="sr-only" htmlFor={`qty-${item.bookId}`}>Quantity of {item.title}</label>
        <input id={`qty-${item.bookId}`} type="number" min="1" max="50" value={qty} onChange={(e) => setQty(e.target.value)} onBlur={() => Number(qty) !== item.quantity && Number(qty) >= 1 && onChange(item, Number(qty))} disabled={busy} />
      </td>
      <td data-label="Total">{formatMoney(item.lineTotal)}</td>
      <td>
        <button type="button" className="btn btn-small" onClick={() => onRemove(item)} disabled={busy} aria-label={`Remove ${item.title}`}>Remove</button>
      </td>
    </tr>
  );
}

// S-08 Cart (UC-06, FR-08, FR-09)
export default function CartPage() {
  const cart = useFetch(() => cartApi.get(), []);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
      notifyCartChanged();
    } catch (err) {
      setError(err); // FR-09: shows "Only N copies are available"
    } finally {
      setBusy(false);
      cart.reload();
    }
  }

  return (
    <section>
      <h1>Your cart</h1>
      <ErrorMessage error={error} />
      <Async state={cart} empty={{ test: (d) => d.items.length === 0, title: 'Your cart is empty.', children: <Link to="/books" className="btn btn-primary">Browse books</Link> }}>
        {(c) => (
          <>
            <table className="table responsive">
              <thead>
                <tr><th>Book</th><th>Price</th><th>Quantity</th><th>Total</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {c.items.map((i) => (
                  <CartItemRow key={`${i.bookId}-${i.quantity}`} item={i} busy={busy} onChange={(it, q) => run(() => cartApi.setQuantity(it.bookId, q))} onRemove={(it) => run(() => cartApi.remove(it.bookId))} />
                ))}
              </tbody>
            </table>
            <OrderSummaryBox summary={c.summary} />
            <p className="muted">Books in your cart are not held for you. They are reserved when you start the checkout.</p>
            <Link to="/checkout" className={`btn btn-primary ${c.items.some((i) => !i.available) ? 'disabled' : ''}`} aria-disabled={c.items.some((i) => !i.available)}>
              Proceed to checkout
            </Link>
          </>
        )}
      </Async>
    </section>
  );
}
