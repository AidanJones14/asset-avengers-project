import { z } from 'zod';

// Every setting the service reads from the environment, validated once at startup
// by ConfigModule (see app.module.ts). A missing or malformed value stops the
// process immediately instead of failing on the first request.
// There is deliberately no fallback for JWT_SECRET (lecture 14, pitfall 2).
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  AUTH_SERVICE_PORT: z.coerce.number().int().positive().default(3000),
  CORS_ALLOWED_ORIGIN: z.url(),

  // Shared with Spring (jwt.shared-secret): the two values must match exactly.
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters for HS256'),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  ACCESS_TOKEN_TTL: z.string().default('15m'),

  // A session dies after this long without a refresh...
  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(30),
  // ...and after this long no matter how active the user is.
  SESSION_MAX_AGE_HOURS: z.coerce.number().int().positive().default(12),

  AUTH_DB_HOST: z.string().default('localhost'),
  AUTH_DB_HOST_PORT: z.coerce.number().int().positive().default(5433),
  AUTH_DB_NAME: z.string().min(1),
  AUTH_DB_USER: z.string().min(1),
  AUTH_DB_PASSWORD: z.string().min(1),
});

export type Env = z.infer<typeof EnvSchema>;

// ConfigModule calls this with process.env merged with ../.env.
// Whatever it returns is what ConfigService.get(...) hands out afterwards.
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
