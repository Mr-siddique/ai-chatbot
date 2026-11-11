import { api } from './client.ts';
import type { LoginBody, SignupBody, User, UserResponse } from './types.ts';

export async function signup(body: SignupBody): Promise<User> {
  const { data } = await api.post<UserResponse>('/auth/signup', body);
  return data.user;
}

export async function login(body: LoginBody): Promise<User> {
  const { data } = await api.post<UserResponse>('/auth/login', body);
  return data.user;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

/** The current user, or an ApiError (401) when not logged in. */
export async function me(): Promise<User> {
  const { data } = await api.get<UserResponse>('/auth/me');
  return data.user;
}
