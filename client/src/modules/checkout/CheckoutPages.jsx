import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { cartApi, orderApi, profileApi } from '../../api/endpoints.js';
import { useFetch } from '../../components/useFetch.js';
import { Async, ErrorMessage, Loading } from '../../components/states.jsx';
import { TextField } from '../../components/Field.jsx';
import { OrderSummaryBox } from '../cart/CartPage.jsx';
import { notifyCartChanged } from '../../components/NavBar.jsx';
import { formatMoney, formatDateTime } from '../../utils/format.js';
import StatusBadge from '../../components/StatusBadge.jsx';

const EMPTY_ADDRESS = { fullName: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'India', phone: '' };

// validates an address in the browser (same rules as the API, for fast feedback)
export function validateAddress(a) {
  const e = {};
  const need = (k, label, min = 1, max = 150) => {
    const v = (a[k] || '').trim();
    if (v.length < min) e[k] = `Enter ${label}.`;
    else if (v.length > max) e[k] = `Use at most ${max} characters.`;
  };
  need('fullName', 'the full name', 1, 100);
  need('line1', 'the address', 1, 150);
  need('city', 'the city', 1, 80);
  need('state', 'the state', 1, 80);
  need('postalCode', 'the postal code', 3, 12);
  need('country', 'the country', 2, 60);
  need('phone', 'a phone number', 7, 15);
  return e;
}

// AddressForm (FM-05, FM-08)
export function AddressForm({ value, onChange, errors = {} }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <>
      <TextField label="Full name" value={value.fullName} onChange={set('fullName')} error={errors.fullName} autoComplete="name" required />
      <TextField label="Address line 1" value={value.line1} onChange={set('line1')} error={errors.line1} autoComplete="address-line1" required />
      <TextField label="Address line 2 (optional)" value={value.line2 || ''} onChange={set('line2')} error={errors.line2} autoComplete="address-line2" />
      <div className="row">
        <TextField label="City" value={value.city} onChange={set('city')} error={errors.city} autoComplete="address-level2" required />
        <TextField label="State" value={value.state} onChange={set('state')} error={errors.state} autoComplete="address-level1" required />
      </div>
      <div className="row">
        <TextField label="Postal code" value={value.postalCode} onChange={set('postalCode')} error={errors.postalCode} autoComplete="postal-code" required />
        <TextField label="Country" value={value.country} onChange={set('country')} error={errors.country} autoComplete="country-name" required />
      </div>
      <TextField label="Phone" type="tel" value={value.phone} onChange={set('phone')} error={errors.phone} autoComplete="tel" required />
    </>
  );
}

// S-10 Checkout: choose or enter an address, see the summary, then reserve the books (UC-08, FR-11, FR-12)
export function CheckoutPage() {
  const navigate = useNavigate();
  const cart = useFetch(() => cartApi.get(), []);
  const profile = useFetch(() => profileApi.get(), []);
  const [mode, setMode] = useState('saved');
  const [addressId, setAddressId] = useState('');
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [saveAddress, setSaveAddress] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const saved = profile.data ? profile.data.addresses : [];
  useEffect(() => {
    if (!profile.data) return;
    if (saved.length === 0) setMode('new');
    else if (!addressId) setAddressId((saved.find((a) => a.isDefault) || saved[0]).id);
  }, [profile.data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function place(e) {
    e.preventDefault();
    setError(null);
    let body;
    if (mode === 'saved') {
      body = { addressId };
    } else {
      const found = validateAddress(address);
      setErrors(found);
      if (Object.keys(found).length) return;
      body = { shippingAddress: Object.fromEntries(Object.entries(address).map(([k, v]) => [k, v.trim()]).filter(([k, v]) => k !== 'line2' || v)), saveAddress };
    }
    setBusy(true);
    try {
      const result = await orderApi.create(body); // reserves the stock of every line (FR-30, D-06)
      notifyCartChanged();
      navigate(`/checkout/${result.order.id}/pay`, { state: { checkout: result } });
    } catch (err) {
      setError(err);
      setErrors(err.fieldErrors ? Object.fromEntries(Object.entries(err.fieldErrors()).map(([k, v]) => [k.replace('shippingAddress.', ''), v])) : {});
      cart.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1>Checkout</h1>
      <Async state={cart} empty={{ test: (d) => d.items.length === 0, title: 'Your cart is empty.', children: <Link to="/books" className="btn btn-primary">Browse books</Link> }}>
        {(c) => (
          <form onSubmit={place} noValidate className="checkout-layout">
            <div>
              <ErrorMessage error={error} />
              {error && error.code === 'INSUFFICIENT_STOCK' && <p><Link to="/cart">Go back to the cart to adjust the quantities.</Link></p>}
              <h2>Shipping address</h2>
              {profile.loading && !profile.data ? <Loading /> : (
                <>
                  {saved.length > 0 && (
                    <fieldset>
                      <legend>Choose where to send your order</legend>
                      <label className="choice"><input type="radio" name="mode" checked={mode === 'saved'} onChange={() => setMode('saved')} /> Use a saved address</label>
                      {mode === 'saved' && (
                        <div className="address-list" role="radiogroup" aria-label="Saved addresses">
                          {saved.map((a) => (
                            <label key={a.id} className="address-choice">
                              <input type="radio" name="addressId" value={a.id} checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                              <span><strong>{a.fullName}</strong>{a.label ? ` (${a.label})` : ''}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.postalCode}, {a.country}<br />{a.phone}</span>
                            </label>
                          ))}
                        </div>
                      )}
                      <label className="choice"><input type="radio" name="mode" checked={mode === 'new'} onChange={() => setMode('new')} /> Enter a new address</label>
                    </fieldset>
                  )}
                  {mode === 'new' && (
                    <>
                      <AddressForm value={address} onChange={setAddress} errors={errors} />
                      <label className="choice"><input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} /> Save this address to my profile</label>
                    </>
                  )}
                </>
              )}
            </div>
            <aside>
              <h2>Order summary</h2>
              <ul className="plain">
                {c.items.map((i) => <li key={i.bookId}>{i.title} x {i.quantity} <span className="right">{formatMoney(i.lineTotal)}</span></li>)}
              </ul>
              <OrderSummaryBox summary={c.summary} />
              <p className="muted">Your books are reserved for 15 minutes once you continue, so nobody else can buy the last copies while you pay.</p>
              <button type="submit" className="btn btn-primary" disabled={busy || (mode === 'saved' && !addressId)}>{busy ? 'Reserving...' : 'Continue to payment'}</button>
            </aside>
          </form>
        )}
      </Async>
    </section>
  );
}

// time left on the stock reservation (S-11)
function Countdown({ until, onExpired }) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(until) - Date.now()));
  useEffect(() => {
    const t = setInterval(() => {
      const ms = Math.max(0, new Date(until) - Date.now());
      setLeft(ms);
      if (ms === 0) onExpired();
    }, 1000);
    return () => clearInterval(t);
  }, [until, onExpired]);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return <strong>{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</strong>;
}

// S-11 Payment (UC-09, FR-13). Card details are never entered here: they belong to the payment gateway's own form (VFR-08).
export function PaymentPage() {
  const { orderId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const checkout = location.state && location.state.checkout;
  const order = useFetch(() => orderApi.get(orderId), [orderId]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);

  const config = checkout && checkout.payment && checkout.payment.clientConfig;

  async function pay(payment) {
    setBusy(true);
    setError(null);
    try {
      await orderApi.confirmPayment(orderId, payment);
      navigate(`/orders/${orderId}/confirmation`, { replace: true });
    } catch (err) {
      setError(err);
      order.reload();
    } finally {
      setBusy(false);
    }
  }

  // After a reload the payment session is gone (API-31 does not return it). Starting the checkout again from
  // the address stored on the order replaces the open order with a new one (API-27), using the same cart.
  async function restart(o) {
    setBusy(true);
    setError(null);
    try {
      const result = await orderApi.create({ shippingAddress: o.shippingAddress });
      navigate(`/checkout/${result.order.id}/pay`, { replace: true, state: { checkout: result } });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await orderApi.cancel(orderId);
      navigate('/cart');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1>Payment</h1>
      <Async state={order}>
        {(o) => {
          if (o.status === 'Placed' || ['Packed', 'Shipped', 'Delivered'].includes(o.status)) {
            return <p>This order is already paid. <Link to={`/orders/${o.id}`}>View the order</Link>.</p>;
          }
          const payable = o.status === 'PendingPayment' || (o.status === 'PaymentFailed' && o.failureReason === 'expired');
          return (
            <div className="checkout-layout">
              <div>
                <ErrorMessage error={error} />
                {error && error.code === 'ORDER_FAILED_REFUNDED' && <p><Link to="/books">Back to the catalog</Link></p>}
                <p>Order <strong>{o.orderNumber}</strong> <StatusBadge status={o.status} /></p>
                {o.status === 'PendingPayment' && !expired && (
                  <p className="alert alert-info" role="timer">Your books are reserved for <Countdown until={o.reservationExpiresAt} onExpired={() => setExpired(true)} />. Pay before the time runs out.</p>
                )}
                {(expired || (o.status === 'PaymentFailed' && o.failureReason === 'expired')) && (
                  <p className="alert alert-error" role="alert">The reservation has expired. If you still pay, we will try to reserve the books again; if they have sold out, your payment is refunded.</p>
                )}
                {!payable && <p className="alert alert-error" role="alert">This order can no longer be paid. <Link to="/cart">Return to your cart</Link>.</p>}
                {payable && config && config.mode === 'fake' && (
                  <div className="gateway-box">
                    <h2>Test payment gateway</h2>
                    <p className="muted">No real payment is taken and no card details are needed. This stands in for the payment provider, which has not been chosen yet.</p>
                    <div className="row">
                      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => pay(config.successPayment)}>Pay {formatMoney(o.summary.total)} (test success)</button>
                      <button type="button" className="btn" disabled={busy} onClick={() => pay(config.failurePayment)}>Simulate a failed payment</button>
                    </div>
                  </div>
                )}
                {payable && !config && (
                  <div className="alert alert-info" role="status">
                    <span>The payment session is not available any more (for example after a page reload). Restart the payment to continue with the same address and cart.</span>
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => restart(o)}>Restart payment</button>
                  </div>
                )}
                {o.status === 'PendingPayment' && <button type="button" className="btn btn-danger" disabled={busy} onClick={cancel}>Cancel this order</button>}
              </div>
              <aside>
                <h2>Order summary</h2>
                <ul className="plain">{o.items.map((i) => <li key={i.id}>{i.title} x {i.quantity} <span className="right">{formatMoney(i.lineTotal)}</span></li>)}</ul>
                <OrderSummaryBox summary={o.summary} />
              </aside>
            </div>
          );
        }}
      </Async>
    </section>
  );
}

// S-12 Order confirmation (UC-08, FR-14)
export function OrderConfirmationPage() {
  const { orderId } = useParams();
  const order = useFetch(() => orderApi.get(orderId), [orderId]);
  return (
    <section>
      <Async state={order}>
        {(o) => (
          <>
            <h1>Thank you for your order</h1>
            <p className="alert alert-success" role="status">Order <strong>{o.orderNumber}</strong> is confirmed. A confirmation email is on its way.</p>
            <p>Placed on {formatDateTime(o.placedAt)} - total <strong>{formatMoney(o.summary.total)}</strong></p>
            <ul className="plain">{o.items.map((i) => <li key={i.id}>{i.title} x {i.quantity}</li>)}</ul>
            <div className="row">
              <Link to={`/orders/${o.id}`} className="btn btn-primary">View order</Link>
              <Link to="/books" className="btn">Continue shopping</Link>
            </div>
          </>
        )}
      </Async>
    </section>
  );
}
