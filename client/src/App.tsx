import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { PublicOnly, RequireAuth } from './auth/routeGuards.tsx';
import { FullPageStatus } from './components/FullPageStatus.tsx';

// Each page is its own chunk, downloaded the first time its route is shown.
// Logged-out visitors never download the chat page.
const LoginPage = lazy(() => import('./pages/LoginPage.tsx'));
const SignupPage = lazy(() => import('./pages/SignupPage.tsx'));
const ChatPage = lazy(() => import('./pages/ChatPage.tsx'));

/** UI-01: every route in the app. */
export function AppRoutes() {
  return (
    <Suspense fallback={<FullPageStatus text="Loading…" />}>
      <Routes>
        <Route element={<PublicOnly />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route path="/" element={<ChatPage />} />
          <Route path="/c/:conversationId" element={<ChatPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
