import { Types } from 'mongoose';
import type { Logger } from 'pino';
import type { Config } from '../config.js';
import { AppError } from '../lib/AppError.js';
import { Conversation, TITLE_MAX_LENGTH, toPublicConversation, type PublicConversation } from '../models/Conversation.js';
import { CHRONOLOGICAL, Message, toPublicMessage, type PublicMessage } from '../models/Message.js';
import { AiError, type AiService, type ChatTurn } from './ai.js';

export type SendInput = { message: string; conversationId?: string | undefined };
export type SendResult = { conversationId: string; userMessage: PublicMessage; assistantMessage: PublicMessage };
export type ConversationWithMessages = { conversation: PublicConversation; messages: PublicMessage[] };

/** CHAT-06: first 60 characters of the first message, whitespace collapsed. */
export function titleFromMessage(message: string): string {
  const collapsed = message.replace(/\s+/g, ' ').trim();
  // Slice by code points so an emoji is never cut in half.
  return Array.from(collapsed).slice(0, TITLE_MAX_LENGTH).join('').trim();
}

type ChatServiceDeps = {
  ai: AiService;
  config: Pick<Config, 'ai'>;
  logger: Logger;
};

export function createChatService({ ai, config, logger }: ChatServiceDeps) {
  /** The last N turns of a conversation, oldest first (AI-03). */
  async function recentTurns(userId: Types.ObjectId, conversationId: Types.ObjectId): Promise<ChatTurn[]> {
    const limit = config.ai.contextMessages;
    if (limit <= 0) return [];
    const latest = await Message.find({ conversationId, userId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .select({ role: 1, content: 1 })
      .lean();
    return latest.reverse().map(({ role, content }) => ({ role, content }));
  }

  return {
    /** CHAT-03: the user's conversations, most recently active first. */
    async listConversations(userIdString: string): Promise<PublicConversation[]> {
      const conversations = await Conversation.find({ userId: new Types.ObjectId(userIdString) })
        .sort({ updatedAt: -1, _id: -1 })
        .lean();
      return conversations.map(toPublicConversation);
    },

    /** CHAT-04 / CHAT-05: one conversation with its messages, oldest first. Someone else's → 404. */
    async getConversation(userIdString: string, conversationId: string): Promise<ConversationWithMessages> {
      const userId = new Types.ObjectId(userIdString);
      const conversation = await Conversation.findOne({ _id: conversationId, userId }).lean();
      if (!conversation) throw AppError.notFound('Conversation not found');

      const messages = await Message.find({ conversationId: conversation._id, userId }).sort(CHRONOLOGICAL).lean();
      return { conversation: toPublicConversation(conversation), messages: messages.map(toPublicMessage) };
    },

    /**
     * CHAT-01/02/06, AI-04. Nothing is written until the AI has replied, so
     * a failed reply leaves no trace: no new conversation, no messages.
     */
    async send(userIdString: string, input: SendInput): Promise<SendResult> {
      const userId = new Types.ObjectId(userIdString);
      // CHAT-05: a conversation is only found if it belongs to this user.
      const existing = input.conversationId
        ? await Conversation.findOne({ _id: input.conversationId, userId })
        : null;
      if (input.conversationId && !existing) {
        throw AppError.notFound('Conversation not found');
      }

      const history = existing ? await recentTurns(userId, existing._id) : [];

      let reply;
      try {
        reply = await ai.reply(history, input.message);
      } catch (err) {
        if (err instanceof AiError) {
          logger.warn({ err: { message: err.message, status: err.status }, userId: userIdString }, 'AI reply failed');
          throw new AppError(502, 'AI_UNAVAILABLE', 'The assistant is unavailable right now. Please try again.');
        }
        throw err;
      }

      const conversation = existing ?? new Conversation({ userId, title: titleFromMessage(input.message) });
      if (!existing) await conversation.save();

      try {
        // insertMany keeps array order, and _id breaks the createdAt tie,
        // so the question always sorts before its answer.
        const [userMessage, assistantMessage] = await Message.insertMany([
          { conversationId: conversation._id, userId, role: 'user', content: input.message },
          { conversationId: conversation._id, userId, role: 'assistant', content: reply.content },
        ]);

        // Move the conversation to the top of the history list (CHAT-03).
        await Conversation.updateOne(
          { _id: conversation._id, userId },
          { $set: { updatedAt: new Date() } },
          { timestamps: false },
        );

        return {
          conversationId: conversation.id,
          userMessage: toPublicMessage(userMessage!),
          assistantMessage: toPublicMessage(assistantMessage!),
        };
      } catch (err) {
        // Don't leave an empty conversation behind if saving the messages failed.
        if (!existing) await Conversation.deleteOne({ _id: conversation._id, userId }).catch(() => undefined);
        throw err;
      }
    },
  };
}

export type ChatService = ReturnType<typeof createChatService>;
