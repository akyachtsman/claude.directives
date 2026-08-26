// check-ui-viewports-cases.js — pinned cases for templates/scripts/check-ui-viewports.js.
//
// WHY THIS EXISTS. Same doctrine as check-workflow-ref-guard.py next door: the
// gate's whole value is being trusted when it is QUIET, so a regression in it is
// silent by construction — it reads zero projects, prints a cheerful OK, and the
// phone-only config it was installed to catch sails through. #282 is twelve
// findings of evidence that this exact failure recurs: three static readers, every
// one of them wrong, every one of them wrong QUIETLY.
//
// Every case pins BOTH the exit code AND a required diagnostic substring. A case
// asserting only "exit 1" pins almost nothing here — six distinct faults exit
// non-zero, so a case can keep passing while the branch it was written for is
// reverted and some unrelated check catches the input instead (the lesson
// check-workflow-ref-guard.py records from Codex, #237).
//
// NOT exported: .github/ is outside every EXPORTS.json category path, so no
// manifest entry is required for this file.
// ESM (.github/scripts/package.json declares "type": "module").
//
// Run: node .github/scripts/check-ui-viewports-cases.js
import { mkdtempSync, writeFileSync, symlinkSync, rmSync, unlinkSync, lstatSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { pathToFileURL, fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { join, resolve, dirname, sep } from 'path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECK = join(REPO_ROOT, 'templates', 'scripts', 'check-ui-viewports.js');
const ANCHOR = join(REPO_ROOT, 'templates', 'ui-tests', 'playwright.config.js');

// The fixtures import @playwright/test the way a real config does, so they need a
// real one. Resolve it from the shipped config's own location and reuse it by
// symlink — the self-test must never "skip", for exactly the reason the gate it
// tests must never skip.
let NODE_MODULES;
try {
  const entry = createRequire(pathToFileURL(ANCHOR)).resolve('@playwright/test');
  const idx = entry.lastIndexOf(`${sep}node_modules${sep}`);
  if (idx < 0) throw new Error(`resolved outside a node_modules dir: ${entry}`);
  NODE_MODULES = entry.slice(0, idx + `${sep}node_modules`.length);
} catch (e) {
  console.error('check-ui-viewports-cases: CANNOT RUN — @playwright/test is not resolvable.');
  console.error(`  ${(e && e.message) || e}`);
  console.error('  Install it first: (cd templates/ui-tests && npm install --no-package-lock --ignore-scripts)');
  process.exit(1);
}

const FIXTURE_PKG = JSON.stringify({ name: 'ui-viewports-fixture', private: true, type: 'module' });
const IMPORT = "import { defineConfig, devices } from '@playwright/test';\n";
const TABLET = "    { name: 'tablet', use: { viewport: { width: 810, height: 1080 } } },\n";
const PHONE = "    { name: 'phone', use: { viewport: { width: 390, height: 664 } } },\n";
const LAPTOP = "    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },\n";

const cfg = body => `${IMPORT}export default defineConfig({\n  testDir: './tests',\n${body}});\n`;
const withProjects = rows => cfg(`  projects: [\n${rows}  ],\n`);

// (label, {files}, expected exit, required diagnostic, options)
const CASES = [
  ['three classes present (literal widths)',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    0, 'check-ui-viewports: OK'],

  ['two phone device profiles only (the claude.prop shape)',
    { 'playwright.config.js': withProjects(
      "    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },\n"
      + "    { name: 'iphone', use: { ...devices['iPhone 12'] } },\n") },
    1, 'no unrestricted project covers laptop'],

  // The spread runs AFTER the literal, so this project is 393 wide however it is
  // named. A regex reading `width: 1440` calls it a laptop; this pins that the
  // gate does not.
  ['viewport literal overwritten by a later device spread',
    { 'playwright.config.js': withProjects(
      '    { name: \'desktop\', use: { viewport: { width: 1440, height: 900 }, ...devices["Pixel 5"] } },\n'
      + TABLET + PHONE) },
    1, 'no unrestricted project covers laptop'],

  ['laptop project commented out',
    { 'playwright.config.js': withProjects(`  //${LAPTOP.trimEnd()}\n` + TABLET + PHONE) },
    1, 'no unrestricted project covers laptop'],

  // The fix for claude.trading's finding: a root-level filter INTERSECTS with every
  // project, so all three bands can be perfectly declared while zero scenarios are
  // scheduled. Before exit 9 existed, each of these printed a confident
  // "check-ui-viewports: OK" naming all three classes. Both the per-project case
  // below and these must stay: they are different code paths (`p[k]` vs `cfg[k]`),
  // and it was the project one being covered that made the root one look covered.
  ['top-level grep excludes the suite (all three bands correct)',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  grep: /__NEVER_MATCHES_ANY_TEST__/,\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    9, 'TOP-LEVEL grep'],

  ['top-level testIgnore excludes the suite (all three bands correct)',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  testIgnore: /app\\.spec\\.js/,\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    9, 'TOP-LEVEL testIgnore'],

  // Codex round 1 on #333: an empty NEGATIVE filter subtracts nothing, so exit 9
  // on it is a false alarm — and a guard that cries wolf gets muted, which is
  // fail-open by another road. The third case is the one that keeps the fix from
  // being "simplified" into `any empty array is fine`: an empty POSITIVE filter
  // selects NOTHING and is maximally narrowing.
  ['top-level testIgnore: [] subtracts nothing (must not false-alarm)',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  testIgnore: [],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    0, 'check-ui-viewports: OK'],

  ['top-level grepInvert: [] subtracts nothing (must not false-alarm)',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  grepInvert: [],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    0, 'check-ui-viewports: OK'],

  ['top-level testMatch: [] selects NOTHING (empty positive is still fatal)',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  testMatch: [],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    9, 'TOP-LEVEL testMatch'],

  ['laptop project carries testMatch',
    { 'playwright.config.js': withProjects(
      "    { name: 'desktop', testMatch: /smoke\\.spec\\.js/, use: { viewport: { width: 1440, height: 900 } } },\n"
      + TABLET + PHONE) },
    1, 'RESTRICTED by testMatch'],

  ['laptop project declares viewport: null',
    { 'playwright.config.js': withProjects(
      "    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: null } },\n"
      + TABLET + PHONE) },
    1, 'UNCLASSIFIABLE (viewport: null'],

  // defineConfig() does not fold top-level `use` into the projects, so the gate
  // has to do it itself — this pins that it does.
  ['project with no use:, inheriting top-level use.viewport',
    { 'playwright.config.js': cfg(
      '  use: { viewport: { width: 1440, height: 900 } },\n'
      + `  projects: [\n    { name: 'desktop' },\n${TABLET}${PHONE}  ],\n`) },
    0, 'check-ui-viewports: OK'],

  ['no projects key at all',
    { 'playwright.config.js': cfg('  retries: 1,\n') },
    6, 'declares no `projects` array'],

  ['projects: []',
    { 'playwright.config.js': withProjects('') },
    6, 'zero projects resolved'],

  ['config throws at import',
    { 'playwright.config.js': `${IMPORT}throw new Error('config exploded on import');\n` },
    5, 'importing the config threw'],

  // Deliberately a .js/.mjs pair rather than .ts/.js: importing a .ts config is
  // Node-version dependent, so a .ts case would be flaky across runners. The .ts
  // precedence is recorded in the gate's own header from measurement instead.
  ['playwright.config.js shadows playwright.config.mjs',
    {
      'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'playwright.config.mjs': withProjects(PHONE),
    },
    0, 'shadowing playwright.config.mjs'],

  ['no node_modules to resolve @playwright/test from',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    4, '@playwright/test is not resolvable', { nodeModules: false }],

  ['--tests-dir points at a directory that does not exist',
    {}, 2, 'tests dir does not exist', { missingDir: true }],

  ['directory exists but holds no Playwright config',
    {}, 3, 'no Playwright config in'],

  // #281 died from a hard-coded path: a project that had moved UI_TESTS_DIR got a
  // quiet exit. This pins that the env var is honoured AND that the source prints.
  ['UI_TESTS_DIR honoured when --tests-dir is absent',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    0, '(source: UI_TESTS_DIR)', { env: true }],

  // The anti-silence invariant itself. Without the process.on('exit') backstop
  // this config exits the gate 0 with no verdict printed — the precise defect
  // #282 is about, re-created inside the thing meant to catch it.
  ['config calling process.exit(0) at import time',
    { 'playwright.config.js': `${IMPORT}process.exit(0);\nexport default {};\n` },
    7, 'without recording a verdict'],
];

function runCase(files, opts) {
  const o = opts || {};
  const tmp = mkdtempSync(join(tmpdir(), 'ui-viewports-'));
  const link = join(tmp, 'node_modules');
  try {
    writeFileSync(join(tmp, 'package.json'), FIXTURE_PKG);
    for (const [name, body] of Object.entries(files)) writeFileSync(join(tmp, name), body);
    if (o.nodeModules !== false) symlinkSync(NODE_MODULES, link, 'dir');
    const target = o.missingDir ? join(tmp, 'no-such-dir') : tmp;
    const env = { ...process.env, UI_TESTS_DIR: o.env ? target : '' };
    const args = o.env ? [CHECK] : [CHECK, '--tests-dir', target];
    const r = spawnSync(process.execPath, args, { encoding: 'utf8', env, cwd: REPO_ROOT });
    return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
  } finally {
    // Unlink the symlink explicitly before the recursive remove — nothing about
    // this self-test should ever be able to reach the real node_modules.
    if (existsSync(link) || safeIsLink(link)) unlinkSync(link);
    rmSync(tmp, { recursive: true, force: true });
  }
}

function safeIsLink(p) {
  try { return lstatSync(p).isSymbolicLink(); } catch { return false; }
}

const failures = [];
for (const [label, files, expected, diagnostic, opts] of CASES) {
  const { code, out } = runCase(files, opts);
  if (code !== expected) {
    failures.push(`${label}\n      expected exit ${expected}; got ${code}.\n      ${out}`);
  } else if (!out.includes(diagnostic)) {
    failures.push(`${label}\n      exited ${code} as expected, but for the wrong stated reason.\n`
      + `      expected the output to contain: ${JSON.stringify(diagnostic)}\n      ${out}`);
  } else {
    console.log(`OK:   ${label} (exit ${code})`);
  }
}

if (failures.length) {
  console.error('\ncheck-ui-viewports-cases: FAILED\n');
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log(`check-ui-viewports-cases: OK — ${CASES.length} pinned config shapes read correctly.`);
