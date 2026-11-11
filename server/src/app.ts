import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import type { Config } from './config.js';

export type AppDeps = {
  config: Config;
};

/** Builds the Express app without listening, so tests and index.ts share it. */
export function createApp({ config }: AppDeps): Express {
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

  return app;
}
