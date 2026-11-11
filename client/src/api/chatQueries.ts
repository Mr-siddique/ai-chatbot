import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getConversation, listConversations, sendMessage } from './chat.ts';
import type { ConversationResponse, ConversationSummary } from './types.ts';
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
 * UI-03/UI-04: send a message. The response carries the updated conversation
 * summary, so the cache is updated directly: no refetch of the list or the
 * conversation. This lives in the hook (not in mutate() callbacks) so it
 * still happens if the user navigates away while the assistant is replying.
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: sendMessage,
    onSuccess: (result) => {
      const { conversation } = result;
      const added = [result.userMessage, result.assistantMessage];

      // The open conversation: append the exchange (or create it, for a new chat).
      queryClient.setQueryData<ConversationResponse>(queryKeys.conversation(conversation.id), (old) => ({
        conversation,
        messages: old ? [...old.messages, ...added] : added,
      }));

      // The sidebar: this conversation moves to the top with its new preview.
      queryClient.setQueryData<ConversationSummary[]>(queryKeys.conversations, (old) =>
        old ? [conversation, ...old.filter((item) => item.id !== conversation.id)] : old,
      );
    },
  });
}
