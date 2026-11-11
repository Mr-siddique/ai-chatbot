import styles from './TypingIndicator.module.css';

/**
 * BON-01: shown while the assistant is preparing a reply. Looks like an
 * assistant bubble with three bouncing dots; screen readers hear
 * "Assistant is typing…" once, politely.
 */
export function TypingIndicator() {
  return (
    <div className={styles.row} role="status" aria-live="polite">
      <span className="visually-hidden">Assistant is typing…</span>
      <span className={styles.bubble} aria-hidden="true">
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </span>
    </div>
  );
}
