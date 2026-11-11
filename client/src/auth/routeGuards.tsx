import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageStatus } from '../components/FullPageStatus.tsx';
import { useAuth } from './context.ts';

/**
 * AUTH-05: pages for logged-in users. While the session check is running we
 * show a loading state instead of flashing the login page.
 */
export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') return <FullPageStatus text="Loading…" />;
  if (auth.status === 'anonymous') {
    // Remember where the user was going, so login can send them back.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** AUTH-05: login/signup are only for logged-out users. */
export function PublicOnly() {
  const auth = useAuth();

  if (auth.status === 'loading') return <FullPageStatus text="Loading…" />;
  if (auth.status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}
