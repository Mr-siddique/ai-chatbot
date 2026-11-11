import { api } from './client.ts';
import type { ConversationResponse, HistoryResponse, SendBody, SendResponse } from './types.ts';

export async function sendMessage(body: SendBody): Promise<SendResponse> {
  const { data } = await api.post<SendResponse>('/chat/send', body);
  return data;
}

export async function listConversations(): Promise<HistoryResponse['conversations']> {
  const { data } = await api.get<HistoryResponse>('/chat/history');
  return data.conversations;
}

export async function getConversation(conversationId: string): Promise<ConversationResponse> {
  const { data } = await api.get<ConversationResponse>(`/chat/history/${encodeURIComponent(conversationId)}`);
  return data;
}
