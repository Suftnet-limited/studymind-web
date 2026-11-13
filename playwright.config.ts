import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests for the canonical learning workspace. They need a LOCAL Web server and a LOCAL StudyMind AI
 * backend (see tests/integration). Run: E2E_WEB_URL=http://127.0.0.1:3100 npm run test:e2e
 */
const baseURL = process.env.E2E_WEB_URL || 'http://127.0.0.1:3100';
const host = new URL(baseURL).hostname;
if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) throw new Error(`E2E tests only run against local servers, not ${host}`);

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: process.env.E2E_OUTPUT || 'test-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});
