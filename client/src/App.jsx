import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import { Loading } from './components/states.jsx';
import { GuestRoute, RoleRoute, homeFor } from './auth/guards.jsx';
import { useAuth } from './auth/AuthContext.jsx';

// Screens are loaded per route so the first page only downloads what it needs (VFR-01)
const CatalogPage = lazy(() => import('./modules/catalog/CatalogPage.jsx'));
const BookDetailPage = lazy(() => import('./modules/catalog/BookDetailPage.jsx'));
const CartPage = lazy(() => import('./modules/cart/CartPage.jsx'));
const WishlistPage = lazy(() => import('./modules/wishlist/WishlistPage.jsx'));
const NotFound = lazy(() => import('./modules/auth/NotFoundPage.jsx'));
const auth = () => import('./modules/auth/AuthPages.jsx');
const RegisterPage = lazy(() => auth().then((m) => ({ default: m.RegisterPage })));
const VerifyEmailPage = lazy(() => auth().then((m) => ({ default: m.VerifyEmailPage })));
const LoginPage = lazy(() => auth().then((m) => ({ default: m.LoginPage })));
const ForgotPasswordPage = lazy(() => auth().then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => auth().then((m) => ({ default: m.ResetPasswordPage })));
const checkout = () => import('./modules/checkout/CheckoutPages.jsx');
const CheckoutPage = lazy(() => checkout().then((m) => ({ default: m.CheckoutPage })));
const PaymentPage = lazy(() => checkout().then((m) => ({ default: m.PaymentPage })));
const OrderConfirmationPage = lazy(() => checkout().then((m) => ({ default: m.OrderConfirmationPage })));
const orders = () => import('./modules/orders/OrderPages.jsx');
const OrderListPage = lazy(() => orders().then((m) => ({ default: m.OrderListPage })));
const OrderDetailPage = lazy(() => orders().then((m) => ({ default: m.OrderDetailPage })));
const profile = () => import('./modules/profile/ProfilePages.jsx');
const ProfilePage = lazy(() => profile().then((m) => ({ default: m.ProfilePage })));
const SellerApplicationPage = lazy(() => profile().then((m) => ({ default: m.SellerApplicationPage })));
const seller = () => import('./modules/seller/SellerPages.jsx');
const SellerHome = lazy(() => seller().then((m) => ({ default: m.SellerHome })));
const ListingsPage = lazy(() => seller().then((m) => ({ default: m.ListingsPage })));
const ListingFormPage = lazy(() => seller().then((m) => ({ default: m.ListingFormPage })));
const InventoryPage = lazy(() => seller().then((m) => ({ default: m.InventoryPage })));
const SellerOrdersPage = lazy(() => seller().then((m) => ({ default: m.SellerOrdersPage })));
const SalesReportPage = lazy(() => seller().then((m) => ({ default: m.SalesReportPage })));
const admin = () => import('./modules/admin/AdminPages.jsx');
const AdminHome = lazy(() => admin().then((m) => ({ default: m.AdminHome })));
const UsersPage = lazy(() => admin().then((m) => ({ default: m.UsersPage })));
const ApprovalsPage = lazy(() => admin().then((m) => ({ default: m.ApprovalsPage })));
const ReviewModerationPage = lazy(() => admin().then((m) => ({ default: m.ReviewModerationPage })));
const CategoriesPage = lazy(() => admin().then((m) => ({ default: m.CategoriesPage })));
const PlatformReportPage = lazy(() => admin().then((m) => ({ default: m.PlatformReportPage })));

const customer = (el) => <RoleRoute roles={['customer']}>{el}</RoleRoute>;
const sellerOnly = (el) => <RoleRoute roles={['seller']}>{el}</RoleRoute>;
const adminOnly = (el) => <RoleRoute roles={['admin']}>{el}</RoleRoute>;
const guest = (el) => <GuestRoute>{el}</GuestRoute>;

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return <Navigate to={user ? homeFor(user) : '/books'} replace />;
}

// Routes follow the screen list of the Architecture document (6.2), S-01 to S-30
export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/books" element={<CatalogPage />} />
          <Route path="/books/:bookId" element={<BookDetailPage />} />
          <Route path="/register" element={guest(<RegisterPage />)} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/login" element={guest(<LoginPage />)} />
          <Route path="/forgot-password" element={guest(<ForgotPasswordPage />)} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route path="/cart" element={customer(<CartPage />)} />
          <Route path="/wishlist" element={customer(<WishlistPage />)} />
          <Route path="/checkout" element={customer(<CheckoutPage />)} />
          <Route path="/checkout/:orderId/pay" element={customer(<PaymentPage />)} />
          <Route path="/orders" element={customer(<OrderListPage />)} />
          <Route path="/orders/:orderId" element={customer(<OrderDetailPage />)} />
          <Route path="/orders/:orderId/confirmation" element={customer(<OrderConfirmationPage />)} />
          <Route path="/profile" element={customer(<ProfilePage />)} />
          <Route path="/seller/apply" element={customer(<SellerApplicationPage />)} />

          <Route path="/seller" element={sellerOnly(<SellerHome />)} />
          <Route path="/seller/books" element={sellerOnly(<ListingsPage />)} />
          <Route path="/seller/books/new" element={sellerOnly(<ListingFormPage />)} />
          <Route path="/seller/books/:bookId/edit" element={sellerOnly(<ListingFormPage />)} />
          <Route path="/seller/inventory" element={sellerOnly(<InventoryPage />)} />
          <Route path="/seller/orders" element={sellerOnly(<SellerOrdersPage />)} />
          <Route path="/seller/reports" element={sellerOnly(<SalesReportPage />)} />

          <Route path="/admin" element={adminOnly(<AdminHome />)} />
          <Route path="/admin/users" element={adminOnly(<UsersPage />)} />
          <Route path="/admin/approvals" element={adminOnly(<ApprovalsPage />)} />
          <Route path="/admin/reviews" element={adminOnly(<ReviewModerationPage />)} />
          <Route path="/admin/categories" element={adminOnly(<CategoriesPage />)} />
          <Route path="/admin/reports" element={adminOnly(<PlatformReportPage />)} />

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
