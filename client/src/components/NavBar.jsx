import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { cartApi } from '../api/endpoints.js';
import { useToast } from './Toast.jsx';

// Role-aware navigation (Architecture 6.1). The cart count comes from GET /api/cart (SDD 4.2).
export function menuFor(user) {
  if (!user) {
    return [
      { to: '/books', label: 'Catalog' },
      { to: '/login', label: 'Log in' },
      { to: '/register', label: 'Register' },
    ];
  }
  if (user.roles.includes('admin')) {
    return [
      { to: '/admin', label: 'Dashboard', end: true },
      { to: '/admin/users', label: 'Users' },
      { to: '/admin/approvals', label: 'Approvals' },
      { to: '/admin/reviews', label: 'Reviews' },
      { to: '/admin/categories', label: 'Categories' },
      { to: '/admin/reports', label: 'Reports' },
    ];
  }
  const items = [
    { to: '/books', label: 'Catalog' },
    { to: '/wishlist', label: 'Wishlist' },
    { to: '/cart', label: 'Cart' },
    { to: '/orders', label: 'My orders' },
    { to: '/profile', label: 'Profile' },
  ];
  if (user.roles.includes('seller')) {
    items.push({ to: '/seller', label: 'Seller dashboard', end: true });
    items.push({ to: '/seller/books', label: 'Listings' });
    items.push({ to: '/seller/inventory', label: 'Inventory' });
    items.push({ to: '/seller/orders', label: 'Seller orders' });
    items.push({ to: '/seller/reports', label: 'Sales report' });
  } else {
    items.push({ to: '/seller/apply', label: 'Become a seller' });
  }
  return items;
}

export default function NavBar() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const isCustomer = Boolean(user && user.roles.includes('customer'));
  const userId = user ? user.id : null;

  useEffect(() => {
    if (!isCustomer) {
      setCartCount(0);
      return undefined;
    }
    let active = true;
    const load = () =>
      cartApi
        .get()
        .then((c) => active && setCartCount(c.items.reduce((n, i) => n + i.quantity, 0)))
        .catch(() => {});
    load();
    window.addEventListener('cart-changed', load);
    return () => {
      active = false;
      window.removeEventListener('cart-changed', load);
    };
  }, [isCustomer, userId]);

  async function onLogout() {
    await logout();
    toast.show('You have been logged out.', 'info');
    navigate('/books');
  }

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link to={user && user.roles.includes('admin') ? '/admin' : '/books'} className="brand">
          Online Bookstore
        </Link>
        <button type="button" className="btn menu-toggle" aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen((o) => !o)}>
          Menu
        </button>
        <nav id="main-nav" className={`main-nav ${open ? 'open' : ''}`} aria-label="Main">
          {menuFor(user).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setOpen(false)}>
              {item.label}
              {item.to === '/cart' && cartCount > 0 && <span className="cart-count" aria-label={`${cartCount} items in cart`}>{cartCount}</span>}
            </NavLink>
          ))}
          {user && (
            <button type="button" className="btn btn-small" onClick={onLogout}>
              Log out
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}

// other screens tell the navigation that the cart changed
export const notifyCartChanged = () => window.dispatchEvent(new Event('cart-changed'));
