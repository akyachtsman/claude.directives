// Playwright configuration template for static HTML apps.
// Copy to .github/scripts/ui-tests/playwright.config.js and customize.
// Replace all REPLACE_* placeholders before use.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 1,
  reporter: [['list'], ['json', { outputFile: '../../../.agent-reports/playwright-results.json' }]],
  use: {
    // REPLACE_WITH_YOUR_APP_URL — e.g. https://yourname.github.io/your-repo/
    // Extra HTML entry points (admin/vendor consoles): set APP_PAGES to a
    // comma-separated list of paths relative to APP_URL — the ENTRY scenario
    // load-gates each one (test.md → UI coverage gates).
    baseURL: (process.env.APP_URL || 'REPLACE_WITH_YOUR_APP_URL').replace(/\/?$/, '/'),
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'on-first-retry',
  },
  outputDir: '../../../.agent-reports/screenshots',
  projects: [
    // Desktop first: global.md requires laptop + tablet + phone coverage, and
    // test.md → Layered UI mandates before/during/after screenshots at
    // 1440x900 — neither is reachable from a device-emulated project, whose
    // viewport is fixed. Its presence is also what makes S4's explicit
    // setViewportSize(390) a real narrowing rather than a no-op.
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // Tablet is its own class, not an interpolation between the two: global.md
      // requires laptop, tablet AND phone, and Pixel 5 + iPhone 12 are both phone
      // profiles, so a tablet-only breakpoint regression was invisible.
      //
      // PORTRAIT, and the orientation is the whole point. This entry is 810 wide.
      // The landscape variant is 1080 wide, which CLEARS a conventional tablet
      // band (max-width: 1023px, desktop from 1024px) and renders the DESKTOP
      // layout under a tablet name — a project that tests nothing while looking
      // like coverage. Measured in apfp.claude, 2026-08-23, where it shipped that
      // way until review caught it.
      //
      // CHECK THIS AGAINST YOUR OWN BREAKPOINTS before trusting it. 810 lands
      // inside the common 768–1023 band, but a project whose tablet rules start
      // above 810 or end below it gets the same dead project from the other side.
      // The width is what matters; the device name is a convenience.
      name: 'tablet',
      use: { ...devices['iPad (gen 7)'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'iphone',
      use: { ...devices['iPhone 12'] },
    },
  ],
});
