import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import type { Logger } from 'pino';
import type { Config } from './config.js';
import { createLogger } from './lib/logger.js';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';

export type AppDeps = {
  config: Config;
  logger?: Logger;
};

/** Builds the Express app without listening, so tests and index.ts share it. */
export function createApp({ config, logger = createLogger(config) }: AppDeps): Express {
  const app = express();

  if (config.isProd) {
    // Behind Render / nginx / Vercel: needed for Secure cookies and real client IPs.
    app.set('trust proxy', 1);
  }

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigins, credentials: true }));
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger, exposeDetails: !config.isProd }));

  return app;
}
