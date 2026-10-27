// Fixed settings for tests (AppModule ignores ../.env when NODE_ENV is "test").
// Throwaway values: nothing here is a real secret.
export const TEST_ENV = {
  EMAIL_FROM: 'Asset Avengers <security@assetavengers.top>',
  SUPERSET_SSO_SECRET: 'test-only-superset-sso-secret-at-least-32-characters',
  CORS_ALLOWED_ORIGIN: 'http://localhost:4200',
  JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
  JWT_ISSUER: 'endgame-auth',
  JWT_AUDIENCE: 'endgame-api',
  AUTH_JWT_AUDIENCE: 'endgame-auth',
  STAFF_JWT_AUDIENCE: 'endgame-staff',
  AUTH_DB_NAME: 'unused',
  AUTH_DB_USER: 'unused',
  AUTH_DB_PASSWORD: 'unused',
};
