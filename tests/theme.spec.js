// Functional test of the color-scheme contract: setting `data-theme` on the root
// applies that scheme's accent, and no `data-theme` falls back to neutral grey.
// This is exactly what a downstream project does with its one-time theme choice.
//
// Run locally (needs a browser):
//   cd tests && npm install && npx playwright install chromium && npx playwright test
//
// Not wired into this repo's always-on CI (it's a static directive repo); the
// fast static guard is check-theme-parity.js. Run this when changing the palettes.
const { test, expect } = require('@playwright/test');
const path = require('path');

const PAGE = 'file://' + path.resolve(__dirname, '..', 'docs', 'design-system.html');

// Documented accent per scheme — must match directives/design.md.
const SCHEMES = {
  'forest': '#1F7A45',
  'slate-blue': '#1565C0',
  'teal': '#0F8A6E',
  'indigo': '#4A3FB5',
  'plum': '#A52A78',
  'terracotta': '#C0532A',
  'charcoal': '#36383B',
  'burgundy': '#9B2D3F',
  'bronze': '#A06A12',
  'deep-cyan': '#0E6E93',
};
const FALLBACK = '#6E6E6A';

function accent(page) {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-accent').trim().toUpperCase());
}

test.describe('color-scheme contract (data-theme)', () => {
  for (const [id, hex] of Object.entries(SCHEMES)) {
    test(`data-theme="${id}" applies accent ${hex}`, async ({ page }) => {
      await page.goto(PAGE);
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), id);
      expect(await accent(page)).toBe(hex.toUpperCase());
    });
  }

  test('no data-theme falls back to neutral grey', async ({ page }) => {
    await page.goto(PAGE);
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    expect(await accent(page)).toBe(FALLBACK.toUpperCase());
  });
});
