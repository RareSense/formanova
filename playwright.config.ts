import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests against the Vite dev server. Every backend call is mocked in
 * the test (e2e/fixtures.ts), so no server or account is needed.
 * Run: npx playwright test
 */
const PORT = 5179;

export default defineConfig({
  testDir: 'e2e',
  // e2e/prod runs against the production build: playwright.prod.config.ts.
  testIgnore: 'prod/**',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  // One retry for the dev server, not the app: under load a cold page load
  // occasionally lands on / before the lazy route resolves (seen once in 52 runs).
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
