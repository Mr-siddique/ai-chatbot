import { pino, type Logger } from 'pino';
import type { Config } from '../config.js';

export function createLogger(config: Pick<Config, 'nodeEnv'>): Logger {
  if (config.nodeEnv === 'production') {
    return pino({ level: 'info' });
  }
  if (config.nodeEnv === 'test') {
    return pino({ level: 'silent' });
  }
  return pino({ level: 'debug', transport: { target: 'pino-pretty', options: { colorize: true } } });
}
