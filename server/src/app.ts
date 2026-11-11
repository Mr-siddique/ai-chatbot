import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import type { Logger } from 'pino';
import type { Config } from './config.js';
import { createLogger } from './lib/logger.js';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createRequestLogger } from './middleware/requestLogger.js';
import { createAuthRouter } from './routes/auth.js';
import { createChatRouter } from './routes/chat.js';
import { createOpenRouterAi, type AiService } from './services/ai.js';
import { createChatService } from './services/chat.js';

export type AppDeps = {
  config: Config;
  logger?: Logger;
  /** Defaults to OpenRouter. Tests pass a fake so they never hit the network. */
  ai?: AiService;
};

/** Builds the Express app without listening, so tests and index.ts share it. */
export function createApp({ config, logger = createLogger(config), ai = createOpenRouterAi(config.ai) }: AppDeps): Express {
  const app = express();

  if (config.isProd) {
    // Behind Render / nginx / Vercel: needed for Secure cookies and real client IPs.
    app.set('trust proxy', 1);
  }

  app.disable('x-powered-by');
  app.use(createRequestLogger(logger));
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigins, credentials: true }));
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const chat = createChatService({ ai, config, logger });

  app.use('/auth', createAuthRouter({ config }));
  app.use('/chat', createChatRouter({ config, chat }));

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger, exposeDetails: !config.isProd }));

  return app;
}
