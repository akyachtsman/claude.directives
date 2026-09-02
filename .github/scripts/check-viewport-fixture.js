#!/usr/bin/env node
// check-viewport-fixture.js — does the SHIPPED `page` fixture actually record
// the width a page rendered at? (test.md -> UI coverage gates, fifth gate.)
//
// WHY THIS IS ITS OWN SCRIPT, and not a case in check-ui-viewports-cases.js.
// That suite asks what the GATE does with `rendered-at` evidence, and every one
// of its fixtures asserts WITHOUT requesting `page` — which is exactly what lets
// qa.yml install the kit with `--ignore-scripts` and no browser. Adding
// browser-driving cases there turned CI red on that very property (#347 round
// 5), so the two questions are separated:
//
//   * the gate reads the annotation  -> check-ui-viewports-cases.js, no browser
//   * the fixture writes it          -> here, needs one
//
// Without this, `templates/ui-tests/tests/fixtures.js` is the only load-bearing
// file in the kit that nothing exercises. It is the whole evidence channel for
// the strong verdict: if it silently stops annotating, every downstream suite
// quietly drops from RENDERED to a failing run, or — worse, if the metadata is
// removed with it — to SCHEDULED, which passes.
//
// Requires a browser. Run it where one exists; qa.yml runs it in the job that
// already installs chromium for the map suite.
// ESM: .github/scripts/package.json declares "type": "module", so every script
// here is a module and `require` is not defined.
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIT = join(REPO, 'templates', 'ui-tests');
const FIXTURE = join(KIT, 'tests', 'fixtures.js');

const fail = (lines) => {
  console.error('check-viewport-fixture: FAILED');
  for (const l of lines) console.error(`  ${l}`);
  process.exit(1);
};

const tmp = mkdtempSync(join(tmpdir(), 'viewport-fixture-'));
try {
  mkdirSync(join(tmp, 'tests'), { recursive: true });
  writeFileSync(join(tmp, 'package.json'),
    JSON.stringify({ name: 'viewport-fixture-check', private: true, type: 'module' }));
  symlinkSync(join(KIT, 'node_modules'), join(tmp, 'node_modules'), 'dir');
  // THE SHIPPED FILE, copied not retyped: a local re-implementation would let
  // this pass against a fixture nobody ships.
  writeFileSync(join(tmp, 'tests', 'fixtures.js'), readFileSync(FIXTURE, 'utf8'));
  // Three shapes in one run, because the fixture's value is as much in what it
  // does NOT record as in what it does.
  writeFileSync(join(tmp, 'tests', 'a.spec.js'),
    "import { test, expect } from './fixtures.js';\n"
    + "test('plain page', async ({ page }) => { await page.goto('about:blank'); expect(1).toBe(1); });\n"
    + "test('overrides its viewport', async ({ page }) => {\n"
    + "  await page.setViewportSize({ width: 390, height: 844 });\n"
    + "  await page.goto('about:blank');\n  expect(1).toBe(1);\n});\n"
    + "test('never opens a page', async () => { expect(1).toBe(1); });\n"
    // Codex #347 round 6: a hook that REQUESTS `page` and then throws creates a
    // page while the body never starts. Teardown still runs, so a fixture that
    // read the viewport there recorded coverage for a test that rendered
    // nothing. Evidence is a navigation now, and a hook that throws before
    // navigating leaves none.
    + "test.describe('hook throws', () => {\n"
    + "  test.beforeEach(async ({ page }) => { throw new Error('hook exploded'); });\n"
    + "  test('body never starts', async ({ page }) => { test.fail(); expect(1).toBe(2); });\n"
    + "});\n");
  writeFileSync(join(tmp, 'playwright.config.js'),
    "import { defineConfig } from '@playwright/test';\n"
    + "export default defineConfig({\n  testDir: './tests',\n"
    + "  metadata: { viewportEvidence: 'rendered-at' },\n"
    + "  projects: [{ name: 'desktop', use: { viewport: { width: 1440, height: 900 } } }],\n});\n");

  const run = spawnSync('npx', ['playwright', 'test', '--reporter=json'], {
    cwd: tmp, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PWD: tmp, PLAYWRIGHT_JSON_OUTPUT_NAME: 'r.json' },
    timeout: 180000, killSignal: 'SIGKILL',
  });
  let doc;
  try { doc = JSON.parse(readFileSync(join(tmp, 'r.json'), 'utf8')); } catch (e) {
    fail(['the run produced no readable report — a browser is required here',
      `  ${(e && e.message) || e}`,
      `  playwright exited ${run.status}${run.error ? ` (${run.error.code})` : ''}`,
      `  ${String(run.stderr || '').trim().split('\n').slice(-4).join('\n  ')}`]);
  }
  const seen = new Map();
  const walk = (s) => {
    for (const spec of s.specs || []) {
      for (const t of spec.tests || []) {
        for (const r of t.results || []) {
          const a = (r.annotations || []).find(x => x && x.type === 'rendered-at');
          seen.set(spec.title, a ? String(a.description) : null);
        }
      }
    }
    for (const c of s.suites || []) walk(c);
  };
  for (const s of doc.suites || []) walk(s);

  const problems = [];
  const want = [
    ['plain page', '1440x900', 'the project viewport must be recorded as-is'],
    ['overrides its viewport', '390x844',
      'a test that changes its own viewport must be recorded at the width it ENDED on, '
      + 'not the one its project declared — this is what attributes the kit\'s S4 to phone'],
  ];
  for (const [title, expected, why] of want) {
    if (!seen.has(title)) problems.push(`the run did not report a test titled "${title}"`);
    else if (seen.get(title) !== expected) {
      problems.push(`"${title}" recorded ${JSON.stringify(seen.get(title))}, expected "${expected}"`);
      problems.push(`  ${why}`);
    }
  }
  // THE NEGATIVE MATTERS AS MUCH. A fixture that annotated every test would make
  // the gate certify bands for suites that render nothing — the exact P1 the
  // rendered-at mechanism was added to close.
  for (const [title, why] of [
    ['never opens a page',
      'Annotating it would certify a width nothing rendered at.'],
    ['body never starts',
      'Its page exists only because a failing hook asked for one; the body never ran, '
      + 'so nothing was rendered at that width (#347 round 6).'],
  ]) {
    if (!seen.has(title)) { problems.push(`the run did not report a test titled "${title}"`); continue; }
    if (seen.get(title) !== null) {
      problems.push(`"${title}" recorded ${JSON.stringify(seen.get(title))} and must record NOTHING`);
      problems.push(`  ${why}`);
    }
  }
  if (problems.length) fail(problems);
  console.log('check-viewport-fixture: OK — the shipped fixture records 1440x900, '
    + 'records 390x844 for a test that overrides, and records NOTHING for a test with no '
    + 'page or one whose body never started.');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
