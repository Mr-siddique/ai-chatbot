import { useQuery } from '@tanstack/react-query';
import { getConversation, listConversations } from './chat.ts';
import { queryKeys } from './queryClient.ts';

/** UI-04: the sidebar list (GET /chat/history), newest activity first. */
export function useConversations() {
  return useQuery({ queryKey: queryKeys.conversations, queryFn: listConversations });
}

/** UI-04: one conversation with its messages (GET /chat/history/:id). */
export function useConversation(conversationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.conversation(conversationId ?? ''),
    queryFn: () => getConversation(conversationId!),
    enabled: Boolean(conversationId),
  });
}
