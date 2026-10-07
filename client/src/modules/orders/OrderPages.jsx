import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { orderApi } from '../../api/endpoints.js';
import { useFetch } from '../../components/useFetch.js';
import { Async, ErrorMessage } from '../../components/states.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Pagination from '../../components/Pagination.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { useToast } from '../../components/Toast.jsx';
import { OrderSummaryBox } from '../cart/CartPage.jsx';
import { ReviewForm } from '../reviews/ReviewComponents.jsx';
import { formatDate, formatDateTime, formatMoney } from '../../utils/format.js';

// S-13 My orders (UC-10, FR-15)
export function OrderListPage() {
  const [page, setPage] = useState(1);
  const orders = useFetch(() => orderApi.list(page), [page]);
  return (
    <section>
      <h1>My orders</h1>
      <Async state={orders} empty={{ test: (d) => d.items.length === 0, title: 'You have not placed any orders yet.', children: <Link to="/books" className="btn btn-primary">Browse books</Link> }}>
        {(d) => (
          <>
            <table className="table responsive">
              <thead><tr><th>Order</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th><th><span className="sr-only">Details</span></th></tr></thead>
              <tbody>
                {d.items.map((o) => (
                  <tr key={o.id}>
                    <td data-label="Order">{o.orderNumber}</td>
                    <td data-label="Date">{formatDate(o.placedAt)}</td>
                    <td data-label="Items">{o.items.reduce((n, i) => n + i.quantity, 0)}</td>
                    <td data-label="Total">{formatMoney(o.summary.total)}</td>
                    <td data-label="Status"><StatusBadge status={o.status} /></td>
                    <td><Link to={`/orders/${o.id}`}>View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </Async>
    </section>
  );
}

// S-14 Order details and cancel (UC-10, UC-11, FR-16), with the review dialog (S-15) for delivered items
export function OrderDetailPage() {
  const { orderId } = useParams();
  const order = useFetch(() => orderApi.get(orderId), [orderId]);
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const result = await orderApi.cancel(orderId);
      toast.show(result.status === 'Cancelled' ? 'Order cancelled. Your refund has been requested.' : 'Order closed.', 'success');
      order.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <section>
      <p><Link to="/orders">Back to my orders</Link></p>
      <ErrorMessage error={error} />
      <Async state={order}>
        {(o) => {
          const shipped = o.items.some((i) => ['Shipped', 'Delivered'].includes(i.fulfilmentStatus));
          const cancellable = ['PendingPayment', 'Placed', 'Packed'].includes(o.status) && !shipped;
          return (
            <>
              <h1>Order {o.orderNumber}</h1>
              <p><StatusBadge status={o.status} /> {o.placedAt && <span className="muted">placed {formatDateTime(o.placedAt)}</span>}</p>
              {o.status === 'PendingPayment' && <p><Link to={`/checkout/${o.id}/pay`} className="btn btn-primary">Go to payment</Link></p>}
              {o.refundStatus === 'refunded' && <p className="alert alert-success" role="status">The payment has been refunded.</p>}
              {o.refundStatus === 'pending' && <p className="alert alert-info" role="status">Your refund is pending. We will complete it as soon as the payment provider confirms.</p>}
              <table className="table responsive">
                <thead><tr><th>Book</th><th>Price</th><th>Qty</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>
                  {o.items.map((i) => (
                    <tr key={i.id}>
                      <td data-label="Book"><Link to={`/books/${i.bookId}`}>{i.title}</Link><div className="muted">ISBN {i.isbn}</div></td>
                      <td data-label="Price">{formatMoney(i.unitPrice)}</td>
                      <td data-label="Qty">{i.quantity}</td>
                      <td data-label="Total">{formatMoney(i.lineTotal)}</td>
                      <td data-label="Status">
                        <StatusBadge status={i.fulfilmentStatus} />
                        {i.fulfilmentStatus === 'Delivered' && <button type="button" className="btn btn-small" onClick={() => setReviewing(i)}>Review</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="checkout-layout">
                <div>
                  <h2>Shipping address</h2>
                  {o.shippingAddress && (
                    <address>
                      {o.shippingAddress.fullName}<br />{o.shippingAddress.line1}{o.shippingAddress.line2 ? `, ${o.shippingAddress.line2}` : ''}<br />
                      {o.shippingAddress.city}, {o.shippingAddress.state} {o.shippingAddress.postalCode}<br />{o.shippingAddress.country}<br />{o.shippingAddress.phone}
                    </address>
                  )}
                </div>
                <OrderSummaryBox summary={o.summary} />
              </div>
              {cancellable && <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>Cancel order</button>}
              {!cancellable && shipped && o.status !== 'Delivered' && <p className="muted">This order has shipped and can no longer be cancelled.</p>}
              {confirming && (
                <ConfirmDialog title="Cancel this order?" confirmLabel="Yes, cancel the order" danger busy={busy} onConfirm={cancel} onCancel={() => setConfirming(false)}>
                  <p>{o.status === 'PendingPayment' ? 'The reserved books will be released.' : 'The books go back to stock and your payment will be refunded.'}</p>
                </ConfirmDialog>
              )}
              {reviewing && (
                <ConfirmDialog title={`Review: ${reviewing.title}`} hideConfirm onCancel={() => setReviewing(null)}>
                  <ReviewForm bookId={reviewing.bookId} onDone={() => { setReviewing(null); toast.show('Thank you for your review.', 'success'); }} />
                </ConfirmDialog>
              )}
            </>
          );
        }}
      </Async>
    </section>
  );
}
