import { useAuth } from '../auth/context.ts';

/** Placeholder: the chat UI arrives in TASKS.md 4.3+. */
export default function ChatPage() {
  const { user, logout } = useAuth();
  return (
    <main className="app-placeholder">
      <h1>AI Support</h1>
      <p>Signed in as {user?.name}</p>
      <button type="button" onClick={() => void logout()}>
        Log out
      </button>
    </main>
  );
}
