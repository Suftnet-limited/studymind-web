import { defineConfig, devices } from '@playwright/test';

// Live-OpenAI browser validation. Local Web only; run explicitly:
//   STATE=<ingest report.json> LIVE_SHOTS=<dir> npx playwright test -c tests/live/playwright.live.config.ts
const baseURL = process.env.E2E_WEB_URL || 'http://127.0.0.1:3100';
if (!['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Live UI tests only run against a local Web server');

export default defineConfig({
  testDir: '.',
  testMatch: /live-ui\.spec\.ts/,
  outputDir: process.env.E2E_OUTPUT || 'test-results',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL, trace: 'off', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});
