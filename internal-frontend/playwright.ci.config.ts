import { defineConfig } from '@playwright/test';

// Real services in Docker: no dev server, proxy mocking, static MFA seed or test JWT.
export default defineConfig({
  testDir: './tests',
  testMatch: 'auth-journey.e2e.ts',
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: '/results/artifacts',
  reporter: [['line'], ['junit', { outputFile: '/results/junit.xml' }]],
  use: {
    baseURL: 'http://internal-frontend',
    headless: true,
    // Network traces contain enrollment keys, recovery codes and session tokens.
    // Save masked failure screenshots in the test hook instead.
    trace: 'off', screenshot: 'off', video: 'off',
  },
});
