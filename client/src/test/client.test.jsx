import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError, createApiClient } from '../api/ApiClient.js';
import { formatMoney, toMinorUnits, minorToInput } from '../utils/format.js';
import { menuFor } from '../components/NavBar.jsx';
import Pagination from '../components/Pagination.jsx';
import StarRating from '../components/StarRating.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { ReviewList } from '../modules/reviews/ReviewComponents.jsx';
import { validateAddress, PaymentPage } from '../modules/checkout/CheckoutPages.jsx';
import { validatePassword, EMAIL_PATTERN, RegisterPage } from '../modules/auth/AuthPages.jsx';
import { RoleRoute } from '../auth/guards.jsx';
import * as AuthModule from '../auth/AuthContext.jsx';

const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  json: async () => body,
});

describe('ApiClient (I-01)', () => {
  test('sends cookies, adds the CSRF header to state-changing requests only', async () => {
    const calls = [];
    const fetchFn = vi.fn(async (url, init) => {
      calls.push([url, init]);
      if (url === '/api/auth/csrf-token') return json(200, { csrfToken: 'tok1' });
      return json(200, { ok: true });
    });
    const api = createApiClient({ fetchFn });
    await api.get('/api/books', { q: 'potter', page: 2, empty: '' });
    await api.post('/api/cart/items', { bookId: 'a', quantity: 1 });
    const get = calls.find(([u]) => u.startsWith('/api/books'));
    expect(get[0]).toBe('/api/books?q=potter&page=2');
    expect(get[1].credentials).toBe('same-origin');
    expect(get[1].headers['X-CSRF-Token']).toBeUndefined();
    const post = calls.find(([u]) => u === '/api/cart/items');
    expect(post[1].headers['X-CSRF-Token']).toBe('tok1');
    expect(JSON.parse(post[1].body)).toEqual({ bookId: 'a', quantity: 1 });
    expect(calls.filter(([u]) => u === '/api/auth/csrf-token')).toHaveLength(1); // the token is cached
  });

  test('turns an error body into an ApiError with field errors', async () => {
    const fetchFn = async (url) =>
      url === '/api/auth/csrf-token'
        ? json(200, { csrfToken: 't' })
        : json(400, { error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: [{ field: 'password', issue: 'too short' }] } });
    const api = createApiClient({ fetchFn });
    const err = await api.post('/api/auth/register', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(err.fieldErrors()).toEqual({ password: 'too short' });
  });

  test('fetches a new CSRF token once when the server refuses the old one', async () => {
    let n = 0;
    const fetchFn = async (url, init) => {
      if (url === '/api/auth/csrf-token') return json(200, { csrfToken: `t${++n}` });
      return init.headers['X-CSRF-Token'] === 't2' ? json(200, { done: true }) : json(403, { error: { code: 'CSRF_INVALID', message: 'bad' } });
    };
    const api = createApiClient({ fetchFn });
    expect(await api.post('/api/x', {})).toEqual({ done: true });
  });

  test('reports an expired session so the app can go back to guest mode', async () => {
    const onUnauthorized = vi.fn();
    const fetchFn = async () => json(401, { error: { code: 'UNAUTHENTICATED', message: 'Login required' } });
    const api = createApiClient({ fetchFn, onUnauthorized });
    await expect(api.get('/api/cart')).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalled();
  });

  test('204 gives null and uploads use FormData without a JSON content type', async () => {
    const seen = [];
    const fetchFn = async (url, init) => {
      seen.push(init);
      if (url === '/api/auth/csrf-token') return json(200, { csrfToken: 't' });
      return init.method === 'DELETE' ? { ok: true, status: 204, headers: { get: () => '' } } : json(201, { imageId: 'i' });
    };
    const api = createApiClient({ fetchFn });
    expect(await api.delete('/api/wishlist/items/a')).toBeNull();
    const form = new FormData();
    form.append('file', new Blob(['x']), 'a.png');
    expect(await api.upload('/api/seller/uploads/images', form)).toEqual({ imageId: 'i' });
    expect(seen[seen.length - 1].headers['Content-Type']).toBeUndefined();
  });
});

describe('money and form helpers (D-08)', () => {
  test('minor units are shown with two decimals only on display', () => {
    expect(formatMoney(15400, 'INR')).toMatch(/154\.00/);
    expect(minorToInput(12345)).toBe('123.45');
  });
  test('prices typed by users convert to integers or are refused', () => {
    expect(toMinorUnits('12.5')).toBe(1250);
    expect(toMinorUnits('0.07')).toBe(7);
    expect(toMinorUnits('149.99')).toBe(14999);
    for (const bad of ['abc', '1.234', '-5', '', '1,5']) expect(Number.isNaN(toMinorUnits(bad))).toBe(true);
  });
  test('password and email checks mirror the API rules (FR-01)', () => {
    expect(validatePassword('short')).not.toBe('');
    expect(validatePassword('longenough')).toBe('');
    expect(validatePassword('x'.repeat(73))).not.toBe('');
    expect(EMAIL_PATTERN.test('a@b.co')).toBe(true);
    expect(EMAIL_PATTERN.test('not an email')).toBe(false);
  });
  test('address validation reports every missing required field', () => {
    expect(Object.keys(validateAddress({}))).toEqual(expect.arrayContaining(['fullName', 'line1', 'city', 'state', 'postalCode', 'country', 'phone']));
    expect(validateAddress({ fullName: 'A', line1: 'B', city: 'C', state: 'D', postalCode: '123', country: 'IN', phone: '1234567' })).toEqual({});
    expect(validateAddress({ fullName: 'A', line1: 'B', city: 'C', state: 'D', postalCode: '12', country: 'IN', phone: '1234567' }).postalCode).toBeTruthy();
  });
});

describe('role-aware navigation (Architecture 6.1)', () => {
  const labels = (u) => menuFor(u).map((m) => m.label);
  test('guest', () => expect(labels(null)).toEqual(['Catalog', 'Log in', 'Register']));
  test('customer can apply to become a seller', () => {
    const l = labels({ roles: ['customer'] });
    expect(l).toEqual(expect.arrayContaining(['Catalog', 'Wishlist', 'Cart', 'My orders', 'Profile', 'Become a seller']));
    expect(l).not.toContain('Seller dashboard');
  });
  test('seller keeps every customer entry and gains the seller dashboard (D-04)', () => {
    const l = labels({ roles: ['customer', 'seller'] });
    expect(l).toEqual(expect.arrayContaining(['Cart', 'My orders', 'Seller dashboard', 'Listings', 'Inventory', 'Seller orders', 'Sales report']));
    expect(l).not.toContain('Become a seller');
  });
  test('administrator sees only the admin dashboard entries', () => {
    const l = labels({ roles: ['admin'] });
    expect(l).toEqual(['Dashboard', 'Users', 'Approvals', 'Reviews', 'Categories', 'Reports']);
    expect(l).not.toContain('Cart');
  });
});

describe('route guards (FM-11, FR-29)', () => {
  function renderGuard(user, roles) {
    vi.spyOn(AuthModule, 'useAuth').mockReturnValue({ user, loading: false });
    return render(
      <MemoryRouter initialEntries={['/secret']}>
        <Routes>
          <Route path="/secret" element={<RoleRoute roles={roles}><p>secret content</p></RoleRoute>} />
          <Route path="/login" element={<p>login screen</p>} />
        </Routes>
      </MemoryRouter>
    );
  }
  test('guests are sent to the login screen', () => {
    renderGuard(null, ['customer']);
    expect(screen.getByText('login screen')).toBeInTheDocument();
  });
  test('a user without the role sees access denied', () => {
    renderGuard({ roles: ['customer'] }, ['admin']);
    expect(screen.getByRole('heading', { name: /access denied/i })).toBeInTheDocument();
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
  });
  test('a user with the role sees the screen', () => {
    renderGuard({ roles: ['customer', 'seller'] }, ['seller']);
    expect(screen.getByText('secret content')).toBeInTheDocument();
  });
});

describe('shared components', () => {
  test('pagination moves between pages and hides itself for a single page', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Pagination page={2} totalPages={3} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onChange).toHaveBeenCalledWith(3);
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onChange).toHaveBeenCalledWith(1);
    rerender(<Pagination page={1} totalPages={1} onChange={onChange} />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
  test('star rating is readable by screen readers', () => {
    render(<StarRating value={4.4} count={12} />);
    expect(screen.getByRole('img', { name: /Rated 4\.4 out of 5 from 12 reviews/ })).toBeInTheDocument();
  });
  test('status badge shows readable text', () => {
    render(<StatusBadge status="PendingPayment" />);
    expect(screen.getByText('Awaiting payment')).toBeInTheDocument();
  });
  test('review text is shown as text, never as HTML (XSS, VFR-06)', () => {
    const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const { container } = render(<ReviewList data={{ items: [{ id: '1', userName: 'Eve', rating: 3, comment: payload, createdAt: new Date().toISOString() }], page: 1, totalPages: 1 }} onPage={() => {}} />);
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(payload)).toBeInTheDocument();
  });
});

describe('register form (FR-01, UC-04)', () => {
  test('shows field messages and does not call the API for invalid input', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(200, {}));
    render(<MemoryRouter><RegisterPage /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText('Name'), 'Asha');
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test('shows the check-your-email message after a successful registration', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (url === '/api/auth/csrf-token' ? json(200, { csrfToken: 't' }) : json(201, { message: 'ok' })));
    render(<MemoryRouter><RegisterPage /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText('Name'), 'Asha');
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'LongEnough1');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /check your email/i })).toBeInTheDocument());
    fetchSpy.mockRestore();
  });
});

describe('payment page after a reload (S-11)', () => {
  test('without the payment session it offers to restart from the stored address', async () => {
    const address = { fullName: 'A B', line1: '1 St', city: 'C', state: 'S', postalCode: '123456', country: 'India', phone: '9999999999' };
    const order = { id: 'o1', orderNumber: 'OB-1', status: 'PendingPayment', reservationExpiresAt: new Date(Date.now() + 600000).toISOString(), items: [], summary: { subtotal: 1, tax: 0, shippingFee: 0, total: 1 }, shippingAddress: address };
    const calls = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      calls.push([url, init && init.method, init && init.body]);
      if (url === '/api/auth/csrf-token') return json(200, { csrfToken: 't' });
      if (url === '/api/orders' && init.method === 'POST') return json(201, { order: { ...order, id: 'o2' }, payment: { clientConfig: { mode: 'fake', successPayment: {}, failurePayment: {} } } });
      return json(200, order);
    });
    render(
      <MemoryRouter initialEntries={['/checkout/o1/pay']}>
        <Routes>
          <Route path="/checkout/:orderId/pay" element={<PaymentPage />} />
        </Routes>
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Restart payment' }));
    await waitFor(() => expect(calls.some(([u, m]) => u === '/api/orders' && m === 'POST')).toBe(true));
    const post = calls.find(([u, m]) => u === '/api/orders' && m === 'POST');
    expect(JSON.parse(post[2])).toEqual({ shippingAddress: address });
    fetchSpy.mockRestore();
  });
});
