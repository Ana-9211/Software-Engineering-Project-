import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { Loading } from '../components/states.jsx';
import AccessDenied from '../modules/auth/AccessDeniedPage.jsx';

export function homeFor(user) {
  if (user.roles.includes('admin')) return '/admin';
  return '/books';
}

// ProtectedRoute: logged-in users only. Guests are sent to the login screen and come back afterwards.
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading label="Checking your session" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

// RoleRoute: logged in and holding one of the roles; otherwise the access denied screen (S-30).
export function RoleRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading label="Checking your session" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (!user.roles.some((r) => roles.includes(r))) return <AccessDenied />;
  return children;
}

// GuestRoute: screens only for visitors who are not logged in (register, login, ...)
export function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Checking your session" />;
  if (user) return <Navigate to={homeFor(user)} replace />;
  return children;
}
