import { z } from 'zod';

const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** BON-03: default log level per environment (LOG_LEVEL overrides). */
const DEFAULT_LOG_LEVEL: Record<NodeEnv, LogLevel> = { development: 'debug', test: 'silent', production: 'info' };

const required = (name: string) => z.string({ error: `${name} is required` }).min(1, `${name} is required`);

const DURATION_UNITS_S = { s: 1, m: 60, h: 3600, d: 86_400, w: 604_800 } as const;

/** "7d" | "12h" | "30m" | "45s" | "3600" (seconds) -> seconds */
const duration = z
  .string()
  .regex(/^\d+[smhdw]?$/, 'must be a number with an optional unit s, m, h, d or w (e.g. 7d)')
  .transform((value) => {
    const unit = value.at(-1) as keyof typeof DURATION_UNITS_S;
    return unit in DURATION_UNITS_S
      ? Number.parseInt(value, 10) * DURATION_UNITS_S[unit]
      : Number.parseInt(value, 10);
  })
  .refine((seconds) => seconds > 0, 'must be greater than 0');

const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
  MONGODB_URI: required('MONGODB_URI'),
  JWT_SECRET: required('JWT_SECRET').min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: duration.prefault('7d'),
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
  logLevel: LogLevel;
  mongodbUri: string;
  jwt: { secret: string; expiresInSeconds: number };
  bcryptRounds: number;
  clientOrigins: string[];
  ai: { apiKey: string; model: string; timeoutMs: number; contextMessages: number; referer: string };
  /** BON-02. Off in tests unless a test turns it on. */
  rateLimit: { enabled: boolean; windowMs: number; max: number; authMax: number };
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
    logLevel: e.LOG_LEVEL ?? DEFAULT_LOG_LEVEL[e.NODE_ENV],
    mongodbUri: e.MONGODB_URI,
    jwt: { secret: e.JWT_SECRET, expiresInSeconds: e.JWT_EXPIRES_IN },
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
      enabled: e.NODE_ENV !== 'test',
      windowMs: e.RATE_LIMIT_WINDOW_MS,
      max: e.RATE_LIMIT_MAX,
      authMax: e.AUTH_RATE_LIMIT_MAX,
    },
  };
}
