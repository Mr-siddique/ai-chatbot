import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const TITLE_MAX_LENGTH = 60;

const conversationSchema = new Schema(
  {
    // CHAT-05: every conversation belongs to exactly one user.
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: TITLE_MAX_LENGTH },
  },
  { timestamps: true },
);

// CHAT-03: "my conversations, newest first" is a single index scan.
conversationSchema.index({ userId: 1, updatedAt: -1 });

/** ConversationSummary from specs/SPEC.md. userId is never sent to the client. */
export type PublicConversation = { id: string; title: string; createdAt: string; updatedAt: string };

type ConversationFields = InferSchemaType<typeof conversationSchema> & { _id: { toString(): string } };
export type ConversationDocument = HydratedDocument<InferSchemaType<typeof conversationSchema>>;

export function toPublicConversation(conversation: ConversationFields): PublicConversation {
  return {
    id: conversation._id.toString(),
    title: conversation.title,
    createdAt: new Date(conversation.createdAt).toISOString(),
    updatedAt: new Date(conversation.updatedAt).toISOString(),
  };
}

conversationSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, unknown>) => toPublicConversation(ret as unknown as ConversationFields),
});

export const Conversation = model('Conversation', conversationSchema);
