// Zod is a format enforcer like pydantic (used in python)
// It describes what valid data looks like and checks real data against described schema
// Types do not exist at runtime, so zod can check the env during startup runtime
import { z } from 'zod';

// Every setting the service reads from the environment, validated once at startup
// by ConfigModule (see app.module.ts). A missing or malformed value stops the
// process immediately instead of failing on the first request.
// There is deliberately no fallback for JWT_SECRET (lecture 14, pitfall 2).
const EnvSchema = z.object({
  // no .default() declaration means that the value is required, missing value stops startup
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  // everything in .env arrives as a string
  // z.coerce.number() converts
  AUTH_SERVICE_PORT: z.coerce.number().int().positive().default(3000),
  // requires a valid url
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
  // A session after this long dies no matter how active the user is.
  SESSION_MAX_AGE_HOURS: z.coerce.number().int().positive().default(12),

  AUTH_DB_HOST: z.string().default('localhost'),
  AUTH_DB_PORT: z.coerce.number().int().positive().default(5433),
  AUTH_DB_NAME: z.string().min(1),
  AUTH_DB_USER: z.string().min(1),
  AUTH_DB_PASSWORD: z.string().min(1),
});
// builds the type from the schema zod object
// this is what is used by main.ts when retrieving the config settings from ConfigService
// it attaches the schema rules to the type, and verifies what ConfigService actually has when retrieving the config from runtime app
export type Env = z.infer<typeof EnvSchema>;

//Receives
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
