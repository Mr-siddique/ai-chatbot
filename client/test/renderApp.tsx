import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { AppRoutes } from '../src/App.tsx';
import { createQueryClient } from '../src/api/queryClient.ts';
import { AuthProvider } from '../src/auth/AuthProvider.tsx';

/** Shows the current path so tests can assert on redirects. */
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

/** A fresh cache per test, so no server data leaks between tests. */
export function createTestQueryClient(): QueryClient {
  const client = createQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, retry: false, gcTime: Infinity },
  });
  return client;
}

/** Renders the whole app (cache + auth + routes) at `path`, like a page load. */
export function renderApp(path = '/', queryClient = createTestQueryClient()) {
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRoutes />
          <Routes>
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { user, queryClient, ...view };
}
