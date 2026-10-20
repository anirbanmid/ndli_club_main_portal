import { defineConfig, devices } from '@playwright/test';

/**
 * M3-9 Playwright E2E (BRIEF_M3): public pages — landing, directory, verifier.
 *
 * Hermetic by design: every /api/v1/public/* call is mocked from
 * e2e/fixtures.ts (the API contract itself is pinned by the backend suite).
 * The server is `vite preview` over the production build (SPA fallback
 * serves /verify/ and /directory/ deep links).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
