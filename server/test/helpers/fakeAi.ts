import { AiError, type AiReply, type AiService, type ChatTurn } from '../../src/services/ai.js';

type Behavior = { kind: 'reply'; reply: (history: ChatTurn[], message: string) => string } | { kind: 'fail'; error: Error };

/**
 * A scriptable AiService for tests. By default it echoes the message.
 * Records every call so tests can check what context the AI received.
 */
export function createFakeAi() {
  let behavior: Behavior = { kind: 'reply', reply: (_history, message) => `Echo: ${message}` };
  const calls: { history: ChatTurn[]; message: string }[] = [];

  const ai: AiService = {
    async reply(history, message): Promise<AiReply> {
      calls.push({ history: structuredClone(history), message });
      if (behavior.kind === 'fail') throw behavior.error;
      return { content: behavior.reply(history, message), model: 'fake/model' };
    },
  };

  return {
    ai,
    calls,
    replyWith(reply: string | ((history: ChatTurn[], message: string) => string)) {
      behavior = { kind: 'reply', reply: typeof reply === 'string' ? () => reply : reply };
    },
    failWith(error: Error = new AiError('OpenRouter timed out after 30000ms (model fake/model)')) {
      behavior = { kind: 'fail', error };
    },
    reset() {
      calls.length = 0;
      behavior = { kind: 'reply', reply: (_history, message) => `Echo: ${message}` };
    },
  };
}
