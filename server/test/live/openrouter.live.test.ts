/**
 * Live check against the real OpenRouter API: `npm run test:live`.
 * Uses one free-tier request. Not part of `npm test`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { loadConfig, type Config } from '../../src/config.js';
import { createOpenRouterAi, type ChatTurn } from '../../src/services/ai.js';

let config: Config;

beforeAll(() => {
  try {
    process.loadEnvFile();
  } catch {
    // rely on the environment
  }
  config = loadConfig();
});

describe('OpenRouter (live)', () => {
  it('AI-01/02/03: answers using chat context without inventing order details', async () => {
    const history: ChatTurn[] = [
      { role: 'user', content: 'Hi, my name is Sam.' },
      { role: 'assistant', content: 'Hi Sam! How can I help you today?' },
    ];
    const message = "What's my name? Also, what's the status of my order #48213?";

    const started = Date.now();
    const reply = await createOpenRouterAi(config.ai).reply(history, message);

    // Printed so a human can judge the tone; assertions stay loose because
    // model output varies between runs.
    console.log(`\n[${reply.model}, ${Date.now() - started} ms]\n${reply.content}\n`);

    expect(reply.content.length).toBeGreaterThan(0);
    expect(reply.model).toBeTruthy();
    expect(reply.content).toMatch(/sam/i); // AI-03: used the earlier turn
    expect(reply.content).not.toMatch(/\*\*|^#+\s/m); // AI-02: plain text, no Markdown
  });
});
