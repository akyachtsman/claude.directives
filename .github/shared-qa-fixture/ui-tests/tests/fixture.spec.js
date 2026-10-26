import { test, expect } from '@playwright/test';

test('fixture page loads without errors and fits the viewport', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shared QA fixture');
  await page.getByRole('button', { name: 'Mark checked' }).click();
  await expect(page.getByRole('status')).toHaveText('Checked');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

// Left out by the grep-invert input (`live only`). It fails if it ever runs, so
// a self-test that lost GREP_INVERT goes red instead of passing quietly.
test('a test the PR run leaves out (live only)', () => {
  throw new Error('grep-invert did not reach the suite: GREP_INVERT=' + JSON.stringify(process.env.GREP_INVERT));
});
