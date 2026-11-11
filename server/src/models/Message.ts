import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const MESSAGE_ROLES = ['user', 'assistant'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    // Denormalized owner so every message query can be scoped by user (CHAT-05).
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: MESSAGE_ROLES, required: true },
    // Length limits for user input are enforced at the route (CHAT-01); AI
    // replies are stored as returned.
    content: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// CHAT-04: a conversation's messages in order. _id breaks ties between the
// user message and AI reply, which are saved in the same millisecond.
messageSchema.index({ conversationId: 1, createdAt: 1, _id: 1 });

/** Sort order for reading a conversation oldest-first. Always use this. */
export const CHRONOLOGICAL = { createdAt: 1, _id: 1 } as const;

/** Message from specs/SPEC.md. userId is never sent to the client. */
export type PublicMessage = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
};

type MessageFields = InferSchemaType<typeof messageSchema> & { _id: { toString(): string } };
export type MessageDocument = HydratedDocument<InferSchemaType<typeof messageSchema>>;

export function toPublicMessage(message: MessageFields): PublicMessage {
  return {
    id: message._id.toString(),
    conversationId: message.conversationId.toString(),
    role: message.role,
    content: message.content,
    createdAt: new Date(message.createdAt).toISOString(),
  };
}

messageSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, unknown>) => toPublicMessage(ret as unknown as MessageFields),
});

export const Message = model('Message', messageSchema);
