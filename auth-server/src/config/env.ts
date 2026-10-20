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

  // Shared JWT_SECRET with both Spring backends; UTF-8 bytes must match exactly.
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters for HS256'),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  // The user's existing Resend API key name; never sent to frontend containers.
  Email_Service: z.string().optional(),
  EMAIL_FROM: z.string().default('Asset Avengers <onboarding@resend.dev>'),
  EMAIL_RESET_TEMPLATE_ID: z.string().default(''),
  // Required operationally for authenticator setup/verification and encrypted reset emails. Missing keys fail closed.
  MFA_ENCRYPTION_KEY: z
    .string()
    .regex(/^[A-Za-z0-9+/]{43}=$/, 'Use a base64-encoded 32-byte key')
    .optional()
    .or(z.literal('')),

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

// Receives raw env input during config module setup for app module
// Uses defined zod object schema type to evaluate each env variable
export function validateEnv(raw: Record<string, unknown>): Env {
  // This is what parses env and validates
  const result = EnvSchema.safeParse(raw);
  // Gets all issues from parsing and maps them into
  if (!result.success) {
    const problems = result.error.issues
      .map(
        // Issue converted to string with path seperated by '.' and then the issue message
        (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
      )
      // Appends all issues into a string seperated by a newline value for each
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  // This is what is handed to Nest ConfigService
  return result.data;
}
