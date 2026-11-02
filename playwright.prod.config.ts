import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests against the PRODUCTION build (vite build), served the way the
 * production nginx serves it (e2e/prod/serve-dist.mjs). Every backend call is
 * mocked, as in the dev-server suite.
 * Run: npx vite build && npx playwright test -c playwright.prod.config.ts
 */
const PORT = 5180;

export default defineConfig({
  testDir: 'e2e/prod',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `node e2e/prod/serve-dist.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
