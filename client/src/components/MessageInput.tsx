import { useId, useRef, type FormEvent, type KeyboardEvent } from 'react';
import styles from './MessageInput.module.css';

export const MESSAGE_MAX_LENGTH = 4000; // SPEC CHAT-01
const COUNTER_FROM = MESSAGE_MAX_LENGTH - 200;

type MessageInputProps = {
  value: string;
  onChange(value: string): void;
  onSubmit(message: string): void;
  /** True while a message is being sent. */
  disabled?: boolean;
};

/**
 * UI-02: the message box. Enter sends, Shift+Enter adds a line. Controlled by
 * the parent so the text survives a failed send (UI-03).
 */
export function MessageInput({ value, onChange, onSubmit, disabled = false }: MessageInputProps) {
  const inputId = useId();
  const counterId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = !disabled && value.trim().length > 0;

  function submit() {
    if (!canSend) return;
    onSubmit(value.trim());
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Don't send while an IME (e.g. Japanese, Chinese input) is composing text.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  function onFormSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
    textareaRef.current?.focus();
  }

  const showCounter = value.length >= COUNTER_FROM;

  return (
    <form className={styles.form} onSubmit={onFormSubmit}>
      <label htmlFor={inputId} className="visually-hidden">
        Message
      </label>
      <textarea
        id={inputId}
        ref={textareaRef}
        className={styles.textarea}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Type your message…"
        rows={1}
        maxLength={MESSAGE_MAX_LENGTH}
        aria-describedby={showCounter ? counterId : undefined}
        // Typing stays possible while a reply is pending; only sending waits.
      />
      <button type="submit" className={styles.send} disabled={!canSend}>
        {disabled ? 'Sending…' : 'Send'}
      </button>
      {showCounter && (
        <p id={counterId} className={styles.counter} aria-live="polite">
          {value.length} / {MESSAGE_MAX_LENGTH}
        </p>
      )}
    </form>
  );
}
