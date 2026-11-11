import { z } from 'zod';

const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

const required = (name: string) => z.string({ error: `${name} is required` }).min(1, `${name} is required`);

const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: required('MONGODB_URI'),
  JWT_SECRET: required('JWT_SECRET').min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().min(1).default('7d'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  OPENROUTER_API_KEY: required('OPENROUTER_API_KEY'),
  OPENROUTER_MODEL: z.string().min(1).default('nvidia/nemotron-3.5-lightning:free'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  AI_CONTEXT_MESSAGES: z.coerce.number().int().min(0).default(10),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
});

/** bcrypt cost per environment: fast in tests, strong in production. */
const BCRYPT_ROUNDS: Record<NodeEnv, number> = { test: 4, development: 10, production: 12 };

export type Config = {
  nodeEnv: NodeEnv;
  isProd: boolean;
  port: number;
  mongodbUri: string;
  jwt: { secret: string; expiresIn: string };
  bcryptRounds: number;
  clientOrigins: string[];
  ai: { apiKey: string; model: string; timeoutMs: number; contextMessages: number; referer: string };
  rateLimit: { windowMs: number; max: number; authMax: number };
};

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

/** Parse and validate environment variables. Throws ConfigError listing every problem. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  const e = parsed.data;
  const clientOrigins = e.CLIENT_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    nodeEnv: e.NODE_ENV,
    isProd: e.NODE_ENV === 'production',
    port: e.PORT,
    mongodbUri: e.MONGODB_URI,
    jwt: { secret: e.JWT_SECRET, expiresIn: e.JWT_EXPIRES_IN },
    bcryptRounds: BCRYPT_ROUNDS[e.NODE_ENV],
    clientOrigins,
    ai: {
      apiKey: e.OPENROUTER_API_KEY,
      model: e.OPENROUTER_MODEL,
      timeoutMs: e.AI_TIMEOUT_MS,
      contextMessages: e.AI_CONTEXT_MESSAGES,
      referer: clientOrigins[0] ?? 'http://localhost:5173',
    },
    rateLimit: {
      windowMs: e.RATE_LIMIT_WINDOW_MS,
      max: e.RATE_LIMIT_MAX,
      authMax: e.AUTH_RATE_LIMIT_MAX,
    },
  };
}
