import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../auth/context.ts';
import styles from './ChatLayout.module.css';

type ChatLayoutProps = {
  /** Sidebar content below the "New chat" button (the conversation list). */
  sidebar: ReactNode;
  children: ReactNode;
};

/**
 * UI-08: the signed-in screen. Header (name + logout), a sidebar of
 * conversations, and the main chat area. Below 768px the sidebar becomes a
 * drawer opened from the header.
 */
export function ChatLayout({ sidebar, children }: ChatLayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const sidebarId = useId();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer whenever the user navigates (e.g. picks a conversation).
  // Adjusting state during render on a key change, per React's guidance.
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setDrawerOpen(false);
  }

  // Escape closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.menuButton}
          aria-label="Conversations"
          aria-controls={sidebarId}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((open) => !open)}
        >
          <span aria-hidden="true">☰</span>
        </button>
        <p className={styles.brand}>AI Support</p>
        <div className={styles.account}>
          <p className={styles.userName}>
            <span className="visually-hidden">Signed in as </span>
            {user?.name}
          </p>
          {/* UI-07 */}
          <button type="button" className={styles.logout} onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <nav
          id={sidebarId}
          className={styles.sidebar}
          data-open={drawerOpen}
          aria-label="Conversations"
        >
          <Link to="/" className={styles.newChat}>
            + New chat
          </Link>
          {sidebar}
        </nav>
        {drawerOpen && (
          <div className={styles.backdrop} aria-hidden="true" onClick={() => setDrawerOpen(false)} />
        )}

        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
