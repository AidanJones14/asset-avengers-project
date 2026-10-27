import { defineConfig } from 'vitest/config';
import { TEST_ENV } from './test/test-env.js';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    env: TEST_ENV,
    include: ['**/*.e2e-spec.ts'],
  },
});
