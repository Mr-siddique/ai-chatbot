import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import type { Config } from '../config.js';
import { authUser, requireAuth } from '../middleware/requireAuth.js';
import type { ChatService } from '../services/chat.js';

export const MESSAGE_MAX_LENGTH = 4000;

const objectId = z.string().refine((value) => isValidObjectId(value), 'Invalid id');

const sendSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(MESSAGE_MAX_LENGTH, `Message must be at most ${MESSAGE_MAX_LENGTH} characters`),
  conversationId: objectId.optional(),
});

const historyParamsSchema = z.object({ conversationId: objectId });

export function createChatRouter({ config, chat }: { config: Config; chat: ChatService }): Router {
  const router = Router();

  // AUTH-05: every chat route requires a session.
  router.use(requireAuth(config));

  // CHAT-01: send a message, get the assistant's reply.
  router.post('/send', async (req, res) => {
    const input = sendSchema.parse(req.body);
    const result = await chat.send(authUser(req).id, input);
    res.json(result);
  });

  // CHAT-03: the sidebar list.
  router.get('/history', async (req, res) => {
    const conversations = await chat.listConversations(authUser(req).id);
    res.json({ conversations });
  });

  // CHAT-04: open one conversation.
  router.get('/history/:conversationId', async (req, res) => {
    const { conversationId } = historyParamsSchema.parse(req.params);
    const result = await chat.getConversation(authUser(req).id, conversationId);
    res.json(result);
  });

  return router;
}
