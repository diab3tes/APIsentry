import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

// Empty strings in .env should behave like "unset" so defaults apply.
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const schema = z.object({
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(5000)),
  NODE_ENV: z.preprocess(emptyToUndefined, z.enum(['development', 'test', 'production']).default('development')),
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().optional()),
  GEMINI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  GEMINI_MODEL: z.preprocess(emptyToUndefined, z.string().default('gemini-1.5-flash')),
  CONCURRENCY_LIMIT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(10).default(5)),
  LATENCY_THRESHOLD_MS: z.preprocess(emptyToUndefined, z.coerce.number().positive().default(3000)),
  AI_TIMEOUT_MS: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(8000)),
  CORS_ORIGIN: z.preprocess(emptyToUndefined, z.string().default('http://localhost:5173')),
  EMAIL_ALERTS_ENABLED: z.preprocess(emptyToUndefined, bool),
  ALERT_EMAIL_TO: z.preprocess(emptyToUndefined, z.string().default('oncall@example.com')),
  ALERT_EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().default('apisentry@example.com')),
  SMTP_HOST: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().default(587)),
  SMTP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PASS: z.preprocess(emptyToUndefined, z.string().optional()),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Logger depends on env, so report with console before failing fast.
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
