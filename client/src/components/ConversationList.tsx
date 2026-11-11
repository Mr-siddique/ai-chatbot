import { NavLink } from 'react-router';
import type { ConversationSummary } from '../api/types.ts';
import { formatRelativeTime } from '../lib/relativeTime.ts';
import styles from './ConversationList.module.css';

type ConversationListProps = {
  conversations: ConversationSummary[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry(): void;
};

/**
 * UI-04: past conversations, most recent activity first. Each shows its
 * title, the latest message (CHAT-03) and when it was active. The open one
 * is highlighted.
 */
export function ConversationList({ conversations, isLoading, error, onRetry }: ConversationListProps) {
  if (isLoading) {
    return (
      <p className={styles.note} role="status">
        Loading conversations…
      </p>
    );
  }

  if (error) {
    return (
      <div className={styles.note} role="alert">
        <p>Couldn’t load your conversations.</p>
        <button type="button" className={styles.retry} onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  if (!conversations || conversations.length === 0) {
    return <p className={styles.note}>No conversations yet.</p>;
  }

  return (
    <ul className={styles.list}>
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          {/* NavLink sets aria-current="page" on the open conversation. */}
          <NavLink to={`/c/${conversation.id}`} className={styles.item}>
            <span className={styles.title}>{conversation.title}</span>
            <span className={styles.meta}>
              {conversation.lastMessagePreview && (
                <span className={styles.preview}>{conversation.lastMessagePreview}</span>
              )}
              <time className={styles.time} dateTime={conversation.updatedAt}>
                {formatRelativeTime(conversation.updatedAt)}
              </time>
            </span>
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
