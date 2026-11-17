import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for the critical journeys.
 *
 * - Default: builds the app with no Supabase config (local-only guest
 *   mode) and serves it with `vite preview`.
 * - E2E_BASE_URL=https://<deployment>: runs against a deployed build
 *   instead, which also enables the HTTP security-header checks.
 */
const deployedUrl = process.env.E2E_BASE_URL;
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: deployedUrl ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(deployedUrl
    ? {}
    : {
        webServer: {
          // Empty values force local-only mode even if a .env exists.
          command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
          env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
          url: `http://localhost:${PORT}`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
