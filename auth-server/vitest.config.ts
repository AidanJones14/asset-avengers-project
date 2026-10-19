import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { TEST_ENV } from './test/test-env.js';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    // Schema integration suites share only the explicitly supplied disposable DB.
    fileParallelism: !process.env.MFA_TEST_DATABASE_URL,
    root: './',
    env: TEST_ENV,
    include: ['**/*.spec.ts'],
  },
});
