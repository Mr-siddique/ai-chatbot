import { createContext, useContext } from 'react';
import type { LoginBody, SignupBody, User } from '../api/types.ts';

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: User }
  | { status: 'anonymous'; user: null };

export type AuthContextValue = AuthState & {
  login(body: LoginBody): Promise<void>;
  signup(body: SignupBody): Promise<void>;
  logout(): Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
