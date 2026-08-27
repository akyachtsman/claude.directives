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
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, unlinkSync, lstatSync, existsSync } from 'fs';
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
    1, 'no project declares a laptop viewport'],

  // The spread runs AFTER the literal, so this project is 393 wide however it is
  // named. A regex reading `width: 1440` calls it a laptop; this pins that the
  // gate does not.
  ['viewport literal overwritten by a later device spread',
    { 'playwright.config.js': withProjects(
      '    { name: \'desktop\', use: { viewport: { width: 1440, height: 900 }, ...devices["Pixel 5"] } },\n'
      + TABLET + PHONE) },
    1, 'no project declares a laptop viewport'],

  ['laptop project commented out',
    { 'playwright.config.js': withProjects(`  //${LAPTOP.trimEnd()}\n` + TABLET + PHONE) },
    1, 'no project declares a laptop viewport'],

  // OBSERVED 2026-08-26, on the two fixtures below: with a root-level key set and
  // all three bands correctly declared, this gate printed "check-ui-viewports: OK"
  // naming all three classes. That is what claude.trading reported; it is a record
  // of what the gate did, not a claim about how Playwright resolves either config.
  // Both these and the per-project case below must stay — different code paths
  // (`cfg[k]` vs `p[k]`), and the project one being covered is what made the root
  // one look covered.
  ['root grep declared — refused, though all three bands are correct',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  grep: /__NEVER_MATCHES_ANY_TEST__/,\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    9, 'TOP-LEVEL grep'],

  ['root testIgnore declared — refused, though all three bands are correct',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  testIgnore: /app\\.spec\\.js/,\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    9, 'TOP-LEVEL testIgnore'],

  // THESE CASES PIN A POLICY, NOT A PREDICTION. Rounds 1-6 tried to decide which
  // root values actually narrow a run; seventeen findings later that attempt is
  // gone, and every root selection key is refused on presence. Several of the
  // shapes below provably narrow nothing — that is why they are here. They pin
  // that the gate refuses them ANYWAY, so nobody restores the exemptions and, with
  // them, the false-green path this PR closed.
  //
  // The accepted cost is a false alarm on a harmless config, which is the muting
  // risk Codex raised in round 1 and which still stands. It is taken knowingly:
  // the alternative was a gate that stated things about Playwright that were
  // false in eight measured cases.
  ['root testIgnore: [] — conservative refusal, gate makes no Playwright claim',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  testIgnore: [],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    9, 'root-level'],

  ['root grepInvert: [] — conservative refusal',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  grepInvert: [],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    9, 'root-level'],

  ['root testMatch: [] — refused on presence, like every other root selection key',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  testMatch: [],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    9, 'TOP-LEVEL testMatch'],

  // Codex round 2 on #333: testDir is not a filter but redirects discovery
  // wholesale, reaching the same false-green by a shorter road. The second case
  // is the one that keeps the rule honest — the SHIPPED default must still pass,
  // or the gate fails every correct config and gets muted.
  ['root testDir redirect is DEFERRED to #335 — not checked here',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './other',\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    0, 'check-ui-viewports: OK'],

  ['root testDir is the shipped default (must not false-alarm)',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    0, 'check-ui-viewports: OK'],

  // Codex round 3 on #333: four more, two of them root keys the enumeration did
  // not know existed. Each fatal case is pinned beside its no-false-alarm twin.
  ['root testIgnore: \'\' — conservative refusal',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  testIgnore: '',\n  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    9, 'root-level'],

  ['testDir spelled without ./ resolves the same (must not false-alarm)',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: 'tests',\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    0, 'check-ui-viewports: OK'],

  ['testDir with a trailing slash resolves the same (must not false-alarm)',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests/',\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    0, 'check-ui-viewports: OK'],

  ['a .gitignore under testDir is NOT flagged — respectGitIgnore is #335 territory',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  respectGitIgnore: false,\n  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'tests/.gitignore': '*.spec.js\n' },
    0, 'check-ui-viewports: OK'],

  ['root shard: total 4 — refused on presence',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  shard: { current: 1, total: 4 },\n  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    9, 'TOP-LEVEL shard'],

  ['root shard: total 1 — refused on presence',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  shard: { current: 1, total: 1 },\n  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    9, 'root-level'],

  // Codex round 5 on #333: three more false alarms, all in the checks I asked the
  // review to attack. Each fatal twin is kept so the exemptions cannot widen into
  // a fail-open.
  ['testDir: \'.\' is an ancestor that still contains the suite (must not false-alarm)',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: '.',\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    0, 'check-ui-viewports: OK'],

  ['root grep: /(?:)/ — conservative refusal',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  grep: /(?:)/,\n  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    9, 'root-level'],

  ['root grep: /smoke/ — refused on presence',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  grep: /smoke/,\n  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    9, 'TOP-LEVEL grep'],

  ['root testIgnore: [\'\'] — conservative refusal',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  testIgnore: [''],\n  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    9, 'root-level'],

  ['root testIgnore: [\'\', \'app.spec.js\'] — refused on presence',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  testIgnore: ['', 'app.spec.js'],\n  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    9, 'TOP-LEVEL testIgnore'],

  // REPORTER: THREE CASES, ONE PER OUTCOME. Rounds 7-8 on #333.
  //
  // A reporter's preprocess() can call testRun.exclude() on every test, so a run
  // executes nothing while all three bands are declared (reproduced 1.62.1).
  // Round 7 shipped this as a KNOWN false green, on the reasoning that telling
  // custom from built-in needed a hand-maintained name list. Round 8 showed the
  // installed Playwright EXPORTS the list, so it is DERIVED and version-matched:
  // require('playwright/lib/common').builtInReporters. The distinction between a
  // list you maintain and one you read is the whole subject of this file, and it
  // had been collapsed.
  //
  // The first case is the fleet guard: the shipped kit's own reporters are
  // built-in and must pass. If anyone replaces the derived list with a stricter
  // rule, this fails.
  ['built-in reporters (shipped-kit shape) — must NOT trip',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  reporter: [['list'], ['json', { outputFile: 'r.json' }]],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    0, 'check-ui-viewports: OK'],

  // The second is the hole itself, now closed. It was pinned at exit 0 for one
  // round as a visible known-wrong expectation; it is exit 10 now.
  ['custom reporter (can exclude every test) — refused',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  reporter: [['./drop-all.js']],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'drop-all.js': 'export default class { preprocess({ testRun, suite }) '
        + '{ for (const t of suite.allTests()) testRun.exclude(t); } }\n' },
    10, 'non-built-in reporter'],

  // The third pins the DISCRIMINATOR'S OWN failure. Deriving the list is only
  // safer than hard-coding it while the export exists; if it moves, the branch
  // must go loud rather than trusting every reporter. Without this case that
  // fallback is untested code, which is how a "cannot check" quietly becomes a
  // pass. The fixture shadows `playwright` one directory below node_modules, so
  // the config still imports the REAL @playwright/test from above it.
  ['built-in reporter list unreadable — loud CANNOT CHECK, not a free pass',
    { 'sub/playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  reporter: [['./whatever.js']],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'sub/node_modules/playwright/package.json': '{ "name": "playwright", "main": "index.js" }\n',
      'sub/node_modules/playwright/index.js': 'module.exports = {};\n',
      'sub/node_modules/playwright/lib/common.js': 'module.exports = {};\n' },
    11, 'built-in reporter list', { subdir: 'sub' }],

  // Codex round 9 on #333: TWO more inputs that are not the config object, found
  // after round 8 had "fixed" exactly that class by copying environment variables
  // onto the check step. Both show the same thing from a new angle — a config is
  // CODE, and what it exports depends on everything the evaluation can see.
  //
  // PW_TEST_REPORTER reaches PLAYWRIGHT rather than the config: the runner
  // appends it whatever `reporter` says, so a config declaring only built-ins can
  // still run arbitrary reporter code. Reproduced: Playwright found 0 tests in 0
  // files while the gate exited 0. The negative twin matters as much — the gate
  // must not refuse a clean config because the variable happens to be set to a
  // built-in.
  ['PW_TEST_REPORTER names a custom reporter — refused though the config is clean',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  reporter: [['list']],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    10, 'PW_TEST_REPORTER', { extraEnv: { PW_TEST_REPORTER: './sneaky-reporter.js' } }],

  ['PW_TEST_REPORTER names a BUILT-IN — must NOT trip',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  reporter: [['list']],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    0, 'check-ui-viewports: OK', { extraEnv: { PW_TEST_REPORTER: 'dot' } }],

  // cwd: Playwright evaluates the config from the tests directory; this gate was
  // invoked from the repo root, so a config branching on process.cwd() handed the
  // two different objects. The gate now chdir's before importing. This config
  // declares a root `grep` ONLY when evaluated from somewhere other than its own
  // directory — so it is exit 0 iff the chdir happened, and exit 9 without it.
  ['config branches on process.cwd() — evaluated from the config\'s own directory',
    { 'playwright.config.js':
        `import { defineConfig, devices } from '@playwright/test';\n`
        + `import { dirname } from 'path';\n`
        + `import { fileURLToPath } from 'url';\n`
        + `const here = dirname(fileURLToPath(import.meta.url));\n`
        + `const elsewhere = process.cwd() !== here;\n`
        + `export default defineConfig({\n  testDir: './tests',\n`
        + `  ...(elsewhere ? { grep: /__ONLY_WHEN_READ_FROM_ELSEWHERE__/ } : {}),\n`
        + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    0, 'check-ui-viewports: OK'],

  // Codex round 10: DECLARED-BUT-RESTRICTED is exit 12, not exit 1. The laptop
  // project is right there at 1440 — saying "no project covers laptop" states
  // something false. Exit 1 is reserved for a band no project declares at all
  // (the two-phone-profiles case above), which this gate CAN prove from widths.
  //
  // The second case is the one Codex reproduced: `testIgnore: []` excludes
  // nothing, and Playwright listed the spec for all three projects while the gate
  // reported a missing band. It is still refused — exempting it needs "does this
  // value narrow?", answered wrong six times in rounds 1-6 — but it is refused
  // under a verdict that does not misdescribe the config.
  // Codex round 11: an explicit --config OUTSIDE --tests-dir. Playwright evaluates
  // from the tests directory regardless of where the config lives, so chdir'ing to
  // the CONFIG's directory (rounds 9-10) put the two evaluations back on different
  // cwds. In the shipped layout the two coincide, which is why three rounds of
  // fixes to this one line could not tell the difference.
  //
  // The config declares a root `grep` ONLY when evaluated somewhere other than the
  // tests directory, so exit 0 means the gate stood where Playwright would.
  ['explicit --config outside --tests-dir — evaluated from the TESTS dir',
    { 'cfgdir/playwright.config.js':
        `import { defineConfig, devices } from '@playwright/test';\n`
        + `const here = process.cwd();\n`
        + `const elsewhere = !here.endsWith('/suite');\n`
        + `export default defineConfig({\n  testDir: '.',\n`
        + `  ...(elsewhere ? { grep: /__ONLY_WHEN_READ_FROM_ELSEWHERE__/ } : {}),\n`
        + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'suite/tests/app.spec.js': "import { test } from '@playwright/test';\ntest('s', async () => {});\n" },
    0, 'check-ui-viewports: OK', { subdir: 'suite', configArg: 'cfgdir/playwright.config.js' }],

  // Codex round 12: Playwright's --config is "Configuration file, OR a test
  // directory with optional playwright.config" (1.62.1 --help). Treating a
  // directory as a file made import() fail and the gate exit 4 on an invocation
  // Playwright handles — a refusal on a valid config, so it counts against the
  // muting risk. Same precedence list as the implicit search, so the two paths
  // cannot disagree about which file Playwright would read.
  ['--config names a DIRECTORY, not a file',
    { 'cfgdir/playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: '.',\n`
        + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'suite/tests/app.spec.js': "import { test } from '@playwright/test';\ntest('s', async () => {});\n" },
    0, 'check-ui-viewports: OK', { subdir: 'suite', configArg: 'cfgdir' }],

  // Codex round 12 again: a project testDir is NO LONGER part of `restricted`.
  // Round 10 compared spellings, round 12 defeated it with a directory symlink —
  // the same defeat round 6 delivered to the root check after four predicates.
  // All testDir inference, root and project, now goes to #335 together.
  //
  // This case pins a REAL HOLE at exit 0, deliberately: a project redirecting
  // discovery away from the suite is not flagged. Recorded as a case rather than
  // prose, so re-adding a fifth predicate trips a test instead of passing quietly
  // — and so the hole is visible to anyone reading what this gate covers.
  ['project testDir redirect is NOT flagged — a known hole, deferred to #335',
    { 'playwright.config.js': withProjects(
      "    { name: 'desktop', testDir: './elsewhere', use: { viewport: { width: 1440, height: 900 } } },\n"
      + TABLET + PHONE) },
    0, 'check-ui-viewports: OK'],

  ['laptop project carries testMatch — declared but unattributable',
    { 'playwright.config.js': withProjects(
      "    { name: 'desktop', testMatch: /smoke\\.spec\\.js/, use: { viewport: { width: 1440, height: 900 } } },\n"
      + TABLET + PHONE) },
    12, 'declared only by projects carrying selection keys'],

  ['laptop project carries a no-op testIgnore: [] — still refused, but not called missing',
    { 'playwright.config.js': withProjects(
      "    { name: 'desktop', testIgnore: [], use: { viewport: { width: 1440, height: 900 } } },\n"
      + TABLET + PHONE) },
    12, 'declared only by projects carrying selection keys'],

  // The no-false-alarm twin for the round-10 path fix: a project redundantly
  // naming the root's own directory, spelled differently, is NOT restricted.
  ['project testDir spelled differently but resolving to the root\'s — must NOT trip',
    { 'playwright.config.js': withProjects(
      "    { name: 'desktop', testDir: 'tests', use: { viewport: { width: 1440, height: 900 } } },\n"
      + TABLET + PHONE) },
    0, 'check-ui-viewports: OK'],

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
    // A case may declare a nested path (tests/.gitignore); create parents rather
    // than dropping the case, or the fixture the guard is meant to see never exists.
    for (const [name, body] of Object.entries(files)) {
      const dest = join(tmp, name);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, body);
    }
    if (o.nodeModules !== false) symlinkSync(NODE_MODULES, link, 'dir');
    // opts.subdir runs the gate against tmp/<subdir> while node_modules stays at
    // tmp/. Node resolution walks UP, so a case can shadow one package for the
    // gate (tmp/<subdir>/node_modules/<pkg>) while `@playwright/test` still
    // resolves to the real install one level above. That is the only way to
    // exercise the "cannot read the built-in reporter list" branch without
    // writing into the shared node_modules, which this self-test must never do.
    const target = o.missingDir ? join(tmp, 'no-such-dir') : (o.subdir ? join(tmp, o.subdir) : tmp);
    // PW_TEST_REPORTER is cleared unless a case sets it: it reaches Playwright
    // past the config, so a value inherited from the developer's own shell would
    // change what every case measures.
    const env = { ...process.env, UI_TESTS_DIR: o.env ? target : '', PW_TEST_REPORTER: '', ...(o.extraEnv || {}) };
    // opts.configArg passes an explicit --config, which is how a config OUTSIDE
    // the tests directory gets exercised. Playwright's cwd is the tests dir
    // whatever --config points at, so the two only diverge when they are
    // different directories — which the shipped layout never is (#333 round 11).
    const args = o.env ? [CHECK] : [CHECK, '--tests-dir', target];
    if (o.configArg) args.push('--config', join(tmp, o.configArg));
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
