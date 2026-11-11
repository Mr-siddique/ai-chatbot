import { useState } from 'react';
import { ChatLayout } from '../components/ChatLayout.tsx';
import { MessageInput } from '../components/MessageInput.tsx';
import styles from './ChatPage.module.css';

/**
 * The signed-in chat screen. Layout only for now: the conversation list
 * arrives in TASKS.md 4.4 and sending in 4.5.
 */
export default function ChatPage() {
  const [draft, setDraft] = useState('');

  return (
    <ChatLayout sidebar={<p className={styles.sidebarEmpty}>No conversations yet.</p>}>
      <section className={styles.thread} aria-label="Messages">
        <div className={styles.empty}>
          <h1 className={styles.emptyTitle}>How can we help you today?</h1>
          <p className={styles.emptyText}>Ask a question about your account, an order, or anything else.</p>
        </div>
      </section>

      <div className={styles.composer}>
        <MessageInput value={draft} onChange={setDraft} onSubmit={() => undefined} />
      </div>
    </ChatLayout>
  );
}
