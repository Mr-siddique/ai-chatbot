import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as authApi from '../api/auth.ts';
import { ApiError, setUnauthenticatedHandler } from '../api/client.ts';
import { queryKeys } from '../api/queryClient.ts';
import type { LoginBody, SignupBody, User } from '../api/types.ts';
import { AuthContext, type AuthContextValue, type AuthState } from './context.ts';

/** The current user, or null when not logged in. Other failures (offline) throw. */
async function fetchCurrentUser(): Promise<User | null> {
  try {
    return await authApi.me();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

/**
 * Who is logged in. The user comes from the server (GET /auth/me) and is
 * cached by TanStack Query under queryKeys.me; nothing is ever stored in
 * localStorage (UI-06). This provider exposes it through useAuth().
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // AUTH-06: restore the session on page load.
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: fetchCurrentUser,
    retry: false,
    staleTime: Infinity, // only changes on login/signup/logout
  });

  /** Ends the session in this tab and drops all cached server data. */
  const endSession = useCallback(() => {
    // Another user may log in next: never let them see this user's chats.
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.me[0] });
    queryClient.setQueryData<User | null>(queryKeys.me, null);
  }, [queryClient]);

  // UI-05: any 401 UNAUTHENTICATED (e.g. session expired) ends the session.
  useEffect(() => {
    setUnauthenticatedHandler(endSession);
    return () => setUnauthenticatedHandler(null);
  }, [endSession]);

  const startSession = useCallback(
    (user: User) => {
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.me[0] });
      queryClient.setQueryData<User | null>(queryKeys.me, user);
    },
    [queryClient],
  );

  const login = useCallback(async (body: LoginBody) => startSession(await authApi.login(body)), [startSession]);
  const signup = useCallback(async (body: SignupBody) => startSession(await authApi.signup(body)), [startSession]);

  // UI-07: clear the server cookie, then local state. If the request fails
  // (offline, session already expired) the user is still logged out here.
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // nothing to do: the local session ends regardless
    }
    endSession();
  }, [endSession]);

  const value = useMemo<AuthContextValue>(() => {
    const state: AuthState = me.isPending
      ? { status: 'loading', user: null }
      : me.data
        ? { status: 'authenticated', user: me.data }
        : { status: 'anonymous', user: null }; // includes "server unreachable"
    return { ...state, login, signup, logout };
  }, [me.isPending, me.data, login, signup, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
