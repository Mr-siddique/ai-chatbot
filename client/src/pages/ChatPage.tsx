import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useConversation, useConversations, useSendMessage } from '../api/chatQueries.ts';
import { ApiError, toApiError } from '../api/client.ts';
import type { Message } from '../api/types.ts';
import { ChatLayout } from '../components/ChatLayout.tsx';
import { ConversationList } from '../components/ConversationList.tsx';
import { MessageInput } from '../components/MessageInput.tsx';
import { MessageList } from '../components/MessageList.tsx';
import { TypingIndicator } from '../components/TypingIndicator.tsx';
import styles from './ChatPage.module.css';

/** A message the user sent that the server hasn't confirmed yet. */
type Outgoing = {
  text: string;
  /** Where it was sent: an existing conversation, or undefined for a new chat. */
  conversationId: string | undefined;
  status: 'sending' | 'failed';
  error?: string;
};

/**
 * The signed-in chat screen: "/" is a new chat, "/c/:conversationId" an
 * existing one (UI-04). Sending shows the message at once (UI-03) and
 * keeps it with a Retry button if the reply fails.
 */
export default function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const conversations = useConversations();
  const conversation = useConversation(conversationId);
  const send = useSendMessage();
  const [draft, setDraft] = useState('');
  const [outgoing, setOutgoing] = useState<Outgoing | null>(null);

  // Which conversation is on screen right now (read inside async callbacks).
  const currentConversationId = useRef(conversationId);
  useEffect(() => {
    currentConversationId.current = conversationId;
  }, [conversationId]);

  function deliver(text: string, targetId: string | undefined) {
    setOutgoing({ text, conversationId: targetId, status: 'sending' });
    send.mutate(
      { message: text, ...(targetId ? { conversationId: targetId } : {}) },
      {
        onSuccess: (result) => {
          setOutgoing(null);
          // UI-04: a new chat gets its own URL, unless the user has moved on.
          if (!targetId && currentConversationId.current === undefined) {
            void navigate(`/c/${result.conversationId}`);
          }
        },
        onError: (err) => {
          setOutgoing({ text, conversationId: targetId, status: 'failed', error: toApiError(err).message });
        },
      },
    );
  }

  function onSubmit(text: string) {
    setDraft('');
    deliver(text, conversationId);
  }

  // Only show the pending/failed message in the conversation it belongs to.
  const visibleOutgoing = outgoing && outgoing.conversationId === conversationId ? outgoing : null;
  const sending = send.isPending;

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
        <Thread
          conversationId={conversationId}
          query={conversation}
          outgoing={visibleOutgoing}
          onRetry={() => visibleOutgoing && deliver(visibleOutgoing.text, visibleOutgoing.conversationId)}
          onDismiss={() => setOutgoing(null)}
        />
      </section>

      <div className={styles.composer}>
        <MessageInput value={draft} onChange={setDraft} onSubmit={onSubmit} disabled={sending} />
      </div>
    </ChatLayout>
  );
}

type ThreadProps = {
  conversationId: string | undefined;
  query: ReturnType<typeof useConversation>;
  outgoing: Outgoing | null;
  onRetry(): void;
  onDismiss(): void;
};

function Thread({ conversationId, query, outgoing, onRetry, onDismiss }: ThreadProps) {
  const pendingMessages = outgoing ? [outgoingAsMessage(outgoing)] : [];
  const footer = outgoing && <OutgoingStatus outgoing={outgoing} onRetry={onRetry} onDismiss={onDismiss} />;

  if (!conversationId) {
    if (outgoing) return <MessageList messages={pendingMessages} footer={footer} />;
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
      <MessageList messages={[...query.data.messages, ...pendingMessages]} footer={footer} />
    </>
  );
}

/** Shows an unconfirmed message in the thread like any other user message. */
function outgoingAsMessage(outgoing: Outgoing): Message {
  return {
    id: 'outgoing',
    conversationId: outgoing.conversationId ?? '',
    role: 'user',
    content: outgoing.text,
    createdAt: '',
  };
}

/** Below the unconfirmed message: the typing indicator, or the error with Retry/Dismiss. */
function OutgoingStatus({ outgoing, onRetry, onDismiss }: { outgoing: Outgoing; onRetry(): void; onDismiss(): void }) {
  if (outgoing.status === 'sending') return <TypingIndicator />;
  return (
    <div className={styles.failed} role="alert">
      <p className={styles.failedText}>Not sent. {outgoing.error}</p>
      <div className={styles.failedActions}>
        <button type="button" className={styles.retry} onClick={onRetry}>
          Retry
        </button>
        <button type="button" className={styles.dismiss} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
