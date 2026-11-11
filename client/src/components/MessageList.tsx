import { useEffect, useRef, type ReactNode } from 'react';
import type { Message } from '../api/types.ts';
import styles from './MessageList.module.css';

type MessageListProps = {
  messages: Message[];
  /** Rendered after the last message (e.g. typing indicator, error + retry). */
  footer?: ReactNode;
};

/**
 * UI-03: the conversation, oldest first. Text keeps its line breaks; the view
 * follows the newest message. role="log" lets screen readers announce new
 * messages as they arrive.
 */
export function MessageList({ messages, footer }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id;

  // Scroll when a message is added or the footer changes, not on every render.
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [lastId, messages.length, footer]);

  return (
    <div className={styles.log} role="log" aria-label="Messages" aria-live="polite">
      <ol className={styles.list}>
        {messages.map((message) => (
          <li key={message.id} className={styles.item} data-role={message.role}>
            <span className="visually-hidden">{message.role === 'user' ? 'You said:' : 'Assistant said:'}</span>
            <p className={styles.bubble}>{message.content}</p>
          </li>
        ))}
      </ol>
      {footer}
      <div ref={endRef} />
    </div>
  );
}
