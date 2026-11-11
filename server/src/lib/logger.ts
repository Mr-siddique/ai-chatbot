import { pino, type DestinationStream, type Logger } from 'pino';
import type { Config } from '../config.js';

/**
 * Never logged, wherever they appear (defense in depth: we don't log bodies,
 * but a future `logger.info({ user })` must not leak a hash).
 */
export const REDACTED_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'password',
  'passwordHash',
  '*.password',
  '*.passwordHash',
  'apiKey',
  '*.apiKey',
];

/**
 * BON-03: one logger, configured per environment.
 * production → JSON lines at `info` (or LOG_LEVEL), for log tooling;
 * development → colored, readable lines at `debug`;
 * test → silent.
 * `destination` lets tests capture output.
 */
export function createLogger(config: Pick<Config, 'nodeEnv' | 'logLevel'>, destination?: DestinationStream): Logger {
  const options = { level: config.logLevel, redact: { paths: REDACTED_PATHS, censor: '[redacted]' } };

  if (destination) return pino(options, destination);
  if (config.nodeEnv === 'development') {
    return pino({
      ...options,
      transport: { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname,req,res,responseTime' } },
    });
  }
  return pino(options);
}
