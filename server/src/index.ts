import { ConfigError, loadConfig, type Config } from './config.js';
import { createApp } from './app.js';
import { connectDb, disconnectDb } from './db.js';
import { createLogger } from './lib/logger.js';

// Load server/.env for local dev. Real env vars (Docker, Render) take precedence.
try {
  process.loadEnvFile();
} catch {
  // no .env file: rely on the environment
}

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const logger = createLogger(config);

try {
  await connectDb(config.mongodbUri);
} catch (err) {
  logger.fatal(
    `Could not connect to MongoDB (${(err as Error).message}). ` +
      'Is it running? Locally: docker start ai-support-mongo',
  );
  process.exit(1);
}
logger.info('Connected to MongoDB');

// Express 5 passes listen failures (e.g. port already in use) to this callback
// instead of throwing. Ignoring it leaves a process that serves nothing.
const server = createApp({ config, logger }).listen(config.port, (err?: Error) => {
  if (err) {
    const inUse = (err as NodeJS.ErrnoException).code === 'EADDRINUSE';
    logger.fatal(
      inUse
        ? `Port ${config.port} is already in use. Stop the other server (or set PORT) and try again.`
        : `Could not start the server: ${err.message}`,
    );
    void disconnectDb().finally(() => process.exit(1));
    return;
  }
  logger.info(`Server listening on http://localhost:${config.port} (${config.nodeEnv})`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down`);
  server.close();
  await disconnectDb();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
