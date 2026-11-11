/**
 * Manual check against the real OpenRouter API: `npm run smoke:ai`.
 * Uses one free-tier request. Never run from tests or CI.
 */
import { loadConfig } from '../src/config.js';
import { createOpenRouterAi, type ChatTurn } from '../src/services/ai.js';

try {
  process.loadEnvFile();
} catch {
  // rely on the environment
}

const config = loadConfig();
const ai = createOpenRouterAi(config.ai);

// One request that checks context (AI-03) and the no-invention rule (AI-02).
const history: ChatTurn[] = [
  { role: 'user', content: 'Hi, my name is Sam.' },
  { role: 'assistant', content: 'Hi Sam! How can I help you today?' },
];
const message = "What's my name? Also, what's the status of my order #48213?";

console.log(`Model: ${config.ai.model}\nUser: ${message}\n`);
const started = Date.now();
try {
  const reply = await ai.reply(history, message);
  console.log(`Assistant (${reply.model}, ${Date.now() - started} ms):\n${reply.content}`);
} catch (err) {
  console.error(`Failed after ${Date.now() - started} ms: ${(err as Error).message}`);
  process.exitCode = 1;
}
