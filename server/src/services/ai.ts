import { OpenRouter } from '@openrouter/sdk';
import { HTTPClient, type Fetcher } from '@openrouter/sdk/lib/http.js';
import {
  HTTPClientError,
  OpenRouterError,
  RequestTimeoutError,
  ResponseValidationError,
} from '@openrouter/sdk/models/errors';
import type { Config } from '../config.js';

export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type AiReply = { content: string; model: string };

/** What the chat service depends on. Tests inject a fake; production uses OpenRouter. */
export interface AiService {
  reply(history: ChatTurn[], message: string): Promise<AiReply>;
}

/** Any failure to get a usable reply. The chat service maps it to 502 AI_UNAVAILABLE. */
export class AiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export const APP_TITLE = 'AI Support Agent';

/** AI-02. Plain text only: the client renders replies as text with line breaks. */
export const SYSTEM_PROMPT = `You are a friendly, professional customer support agent for an online service.

How to respond:
- Be polite, warm and concise. Prefer short paragraphs or simple numbered steps.
- Write plain text only. Do not use Markdown (no **bold**, # headings, tables or code blocks).
- You may use anything the customer has told you earlier in this conversation (for example their name),
  but say it comes from this chat. Never claim to have it "on file" or in their account.
- If the question is unclear, ask one short clarifying question.
- Stay on customer support topics. Politely decline unrelated or harmful requests.

What you must never do:
- Never invent order numbers, order status, account details, prices, refunds or company policies.
  You cannot see the customer's account or orders. If they need that, say so and suggest contacting
  the support team through the help page.
- Never ask for passwords, full card numbers or other sensitive data.
- If you don't know something, say so honestly.`;

type PromptMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * AI-02 / AI-03: system prompt, then the last `contextLimit` turns of the
 * conversation (oldest first), then the new user message.
 */
export function buildMessages(history: ChatTurn[], message: string, contextLimit: number): PromptMessage[] {
  const context = contextLimit > 0 ? history.slice(-contextLimit) : [];
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...context.map(({ role, content }) => ({ role, content })),
    { role: 'user', content: message },
  ];
}

/** Assistant content is a string, or a list of parts of which we keep the text. */
function extractText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part: { type?: string; text?: unknown }) => (part?.type === 'text' && typeof part.text === 'string' ? part.text : ''))
      .join('')
      .trim();
  }
  return '';
}

/**
 * AI-01 / AI-04: OpenRouter via the official SDK. `fetcher` lets tests
 * replace the network; production uses global fetch.
 */
export function createOpenRouterAi(config: Config['ai'], fetcher?: Fetcher): AiService {
  const client = new OpenRouter({
    apiKey: config.apiKey,
    httpReferer: config.referer,
    appTitle: APP_TITLE,
    timeoutMs: config.timeoutMs,
    // The SDK's default retries 5xx with backoff for up to an hour. One
    // attempt bounded by AI_TIMEOUT_MS keeps the chat request predictable.
    retryConfig: { strategy: 'none' },
    ...(fetcher ? { httpClient: new HTTPClient({ fetcher }) } : {}),
  });

  // Never let the API key end up in an error message or log line.
  const redact = (text: string) => text.split(config.apiKey).join('[redacted]').slice(0, 300);
  const where = `model ${config.model}`;

  function toAiError(err: unknown): AiError {
    // The SDK wraps a timeout before the response starts (RequestTimeoutError);
    // a timeout while the body is still downloading surfaces as the platform's
    // own TimeoutError/AbortError.
    const isPlatformTimeout =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    if (err instanceof RequestTimeoutError || isPlatformTimeout) {
      return new AiError(`OpenRouter timed out after ${config.timeoutMs}ms (${where})`);
    }
    if (err instanceof ResponseValidationError) {
      return new AiError(`OpenRouter returned an unexpected response (${where})`, err.statusCode);
    }
    if (err instanceof OpenRouterError) {
      return new AiError(`OpenRouter error ${err.statusCode} (${where}): ${redact(err.message)}`, err.statusCode);
    }
    if (err instanceof HTTPClientError) {
      return new AiError(`OpenRouter request failed (${where}): ${redact(err.message)}`);
    }
    return new AiError(`OpenRouter request failed (${where}): ${redact(String(err))}`);
  }

  return {
    async reply(history, message) {
      let result;
      try {
        result = await client.chat.send({
          chatRequest: {
            model: config.model,
            messages: buildMessages(history, message, config.contextMessages),
            stream: false,
          },
        });
      } catch (err) {
        throw toAiError(err);
      }

      const content = extractText(result.choices[0]?.message?.content);
      if (!content) {
        throw new AiError(`OpenRouter returned an empty reply (${where})`);
      }
      return { content, model: result.model || config.model };
    },
  };
}
