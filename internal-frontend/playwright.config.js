import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:5174/admin',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
