/**
 * API types. These mirror specs/SPEC.md "API contract" exactly; change both
 * together.
 */

export type User = { id: string; name: string; email: string; createdAt: string };

export type Message = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

export type ConversationSummary = { id: string; title: string; createdAt: string; updatedAt: string };

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'RATE_LIMITED'
  | 'AI_UNAVAILABLE'
  | 'INTERNAL';

export type ErrorBody = {
  error: { code: ErrorCode; message: string; details?: { path: string; message: string }[] | unknown };
};

// Request / response bodies
export type SignupBody = { name: string; email: string; password: string };
export type LoginBody = { email: string; password: string };
export type UserResponse = { user: User };

export type SendBody = { message: string; conversationId?: string };
export type SendResponse = { conversationId: string; userMessage: Message; assistantMessage: Message };
export type HistoryResponse = { conversations: ConversationSummary[] };
export type ConversationResponse = { conversation: ConversationSummary; messages: Message[] };
