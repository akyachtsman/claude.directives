// The shared-qa self-test's suite: one spec, run at the three viewport classes
// the ui-suite composite's gate requires. Deliberately small. It proves the
// shared workflow's plumbing (the shared files fetched at the called commit,
// the composites resolving from there, the local server, the gates), not the
// project kit, which stays a copy in each project (#460 step 4).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: '../../../.agent-reports/playwright-results.json' }]],
  use: {
    baseURL: (process.env.APP_URL || 'http://localhost:8080').replace(/\/?$/, '/'),
    headless: true,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'] } },
    { name: 'phone', use: { ...devices['Pixel 5'] } },
  ],
});
