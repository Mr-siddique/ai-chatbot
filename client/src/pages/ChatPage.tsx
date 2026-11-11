import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useConversation, useConversations } from '../api/chatQueries.ts';
import { ApiError } from '../api/client.ts';
import { ChatLayout } from '../components/ChatLayout.tsx';
import { ConversationList } from '../components/ConversationList.tsx';
import { MessageInput } from '../components/MessageInput.tsx';
import { MessageList } from '../components/MessageList.tsx';
import styles from './ChatPage.module.css';

/**
 * The signed-in chat screen: "/" is a new chat, "/c/:conversationId" an
 * existing one (UI-04). Sending arrives in TASKS.md 4.5.
 */
export default function ChatPage() {
  const { conversationId } = useParams();
  const conversations = useConversations();
  const conversation = useConversation(conversationId);
  const [draft, setDraft] = useState('');

  return (
    <ChatLayout
      sidebar={
        <ConversationList
          conversations={conversations.data}
          isLoading={conversations.isPending}
          error={conversations.error}
          onRetry={() => void conversations.refetch()}
        />
      }
    >
      <section className={styles.thread} aria-label="Conversation">
        <Thread conversationId={conversationId} query={conversation} />
      </section>

      <div className={styles.composer}>
        <MessageInput value={draft} onChange={setDraft} onSubmit={() => undefined} />
      </div>
    </ChatLayout>
  );
}

function Thread({
  conversationId,
  query,
}: {
  conversationId: string | undefined;
  query: ReturnType<typeof useConversation>;
}) {
  if (!conversationId) {
    return (
      <div className={styles.empty}>
        <h1 className={styles.emptyTitle}>How can we help you today?</h1>
        <p className={styles.emptyText}>Ask a question about your account, an order, or anything else.</p>
      </div>
    );
  }

  if (query.isPending) {
    return (
      <p className={styles.status} role="status">
        Loading conversation…
      </p>
    );
  }

  if (query.error) {
    // 404 covers both "deleted" and "someone else's" (CHAT-05), and a bad id is 400.
    const notFound = query.error instanceof ApiError && [400, 404].includes(query.error.status);
    return (
      <div className={styles.empty} role="alert">
        <h1 className={styles.emptyTitle}>{notFound ? 'Conversation not found' : 'Couldn’t load this conversation'}</h1>
        {notFound ? (
          <p className={styles.emptyText}>
            It may have been removed. <Link to="/">Start a new chat</Link>
          </p>
        ) : (
          <button type="button" className={styles.retry} onClick={() => void query.refetch()}>
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <h1 className="visually-hidden">{query.data.conversation.title}</h1>
      <MessageList messages={query.data.messages} />
    </>
  );
}
