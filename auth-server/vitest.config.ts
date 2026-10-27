import { defineConfig } from 'vitest/config';
import { TEST_ENV } from './test/test-env.js';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    // LCOV feeds SonarQube; include untested source files in the denominator.
    coverage: { provider: 'v8', reporter: ['text-summary', 'lcov'], include: ['src/**/*.ts'], exclude: ['src/**/*.spec.ts'] },
    // Schema integration suites share only the explicitly supplied disposable DB.
    fileParallelism: !process.env.MFA_TEST_DATABASE_URL,
    root: './',
    env: TEST_ENV,
    include: ['**/*.spec.ts'],
  },
});
