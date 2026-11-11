import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getConversation, listConversations, sendMessage } from './chat.ts';
import type { ConversationResponse } from './types.ts';
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

/**
 * UI-03/UI-04: send a message. Cache updates live here (not in mutate()
 * callbacks) so they still happen if the user navigates away while the
 * assistant is replying.
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: sendMessage,
    onSuccess: (result, variables) => {
      const key = queryKeys.conversation(result.conversationId);
      const added = [result.userMessage, result.assistantMessage];

      if (variables.conversationId) {
        // Existing conversation: append the exchange.
        queryClient.setQueryData<ConversationResponse>(key, (old) =>
          old ? { ...old, messages: [...old.messages, ...added] } : old,
        );
      } else {
        // New conversation: show it instantly, then fetch the server's title in the background.
        const now = result.assistantMessage.createdAt;
        queryClient.setQueryData<ConversationResponse>(key, {
          conversation: { id: result.conversationId, title: variables.message.slice(0, 60), createdAt: now, updatedAt: now },
          messages: added,
        });
        void queryClient.invalidateQueries({ queryKey: key, exact: true });
      }

      // The sidebar order (and, for a new chat, its contents) changed.
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations, exact: true });
    },
  });
}
