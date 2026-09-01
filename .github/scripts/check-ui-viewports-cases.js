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
import { join, resolve, dirname, sep, relative } from 'path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Points the suite at a MUTATED copy of the gate, so "these cases discriminate"
// is re-provable rather than a claim made once. Same mechanism as
// CHECK_CLAIMS_BIN on #346, for the same reason: a case that cannot be shown to
// redden is a case nobody has measured.
const CHECK = process.env.CHECK_UI_VIEWPORTS_BIN
  ? resolve(process.env.CHECK_UI_VIEWPORTS_BIN)
  : join(REPO_ROOT, 'templates', 'scripts', 'check-ui-viewports.js');
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

// The spec a fixture needs in order to have anything to discover. runCase()
// writes one into tests/ by default; a case whose testDir resolves ELSEWHERE
// (a config in its own directory, a symlinked layout) places this itself.
const SPEC = "import { test, expect } from '@playwright/test';\ntest('present', async () => { expect(1).toBe(1); });\n";

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

  // ── SELECTION KEYS: OBSERVED, NOT REFUSED (#335) ─────────────────────────
  // Until #335 every one of these was exit 9, refused on PRESENCE, because a
  // config read could not tell a key that narrows from one that does not — a
  // question rounds 1-6 of #333 answered wrong six times, across three spellings
  // of "empty" and two of "matches everything". The refusal was honest and it
  // cost real false alarms: six of the twelve shapes below narrow NOTHING.
  //
  // Stage two asks Playwright. Both columns are now decided by what it
  // enumerates, so these cases pin the two halves of that:
  //   * a key that narrows nothing must PASS — the false alarm is gone
  //   * a key that empties a band must FAIL at exit 12, naming the band
  // Together they are the discriminator. Pinning only the first would let a
  // rewrite that ignores selection entirely pass; only the second would let the
  // old blanket refusal come back.
  //
  // Every expectation below was measured against Playwright 1.62.1 and agrees
  // with what the key means. The fixture's one spec is `tests/gate.spec.js`,
  // whose test title is `present` — which is why /smoke/ matches nothing.
  ...[
    ["testIgnore: []", '  testIgnore: [],\n'],
    ["grepInvert: []", '  grepInvert: [],\n'],
    ["testIgnore: ''", "  testIgnore: '',\n"],
    ["testIgnore: ['']", "  testIgnore: [''],\n"],
    ['grep: /(?:)/', '  grep: /(?:)/,\n'],
    ['shard 1 of 1', '  shard: { current: 1, total: 1 },\n'],
  ].map(([label, line]) => [
    `root ${label} narrows nothing — PASSES now, no longer refused on presence`,
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + line + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    0, 'check-ui-viewports: OK']),

  ...[
    ['testMatch: []', '  testMatch: [],\n'],
    ['grep: /smoke/', '  grep: /smoke/,\n'],
    ['grep: /__NEVER_MATCHES_ANY_TEST__/', '  grep: /__NEVER_MATCHES_ANY_TEST__/,\n'],
    ["testIgnore: ['', 'gate.spec.js']", "  testIgnore: ['', 'gate.spec.js'],\n"],
  ].map(([label, line]) => [
    `root ${label} empties the run — OBSERVED, exit 12`,
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + line + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    12, 'discovers no test for it']),

  // Sharding is its own case because it does not empty the run — it splits it,
  // and the band that survives depends on how Playwright distributes. The
  // assertion is on the exit and the diagnostic shape, not on WHICH band is
  // named, because that is Playwright's business and pinning it would make this
  // case a prediction again.
  ['root shard 1 of 4 leaves a band with nothing — OBSERVED, exit 12',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  shard: { current: 1, total: 4 },\n  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    12, 'discovers no test for it'],

  // ── testDir: BOTH HOLES CLOSED, and neither needed a predicate ───────────
  // The root redirect was deferred at round 6 of #333 after four predicates and
  // a symlink defeat; the project redirect was deferred at round 12 for the same
  // reason. #335 closes both by not asking the question: a redirected project
  // discovers nothing, and that is visible without comparing any paths. There is
  // no code in the gate mentioning testDir, symlinks or realpath.
  ['root testDir redirected away from the suite — OBSERVED, exit 12',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './other',\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'other/keep.txt': 'x\n' },
    12, 'discovers no test for it'],

  ['root testDir is the shipped default (must not false-alarm)',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    0, 'check-ui-viewports: OK'],

  ['testDir spelled without ./ resolves the same (must not false-alarm)',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: 'tests',\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    0, 'check-ui-viewports: OK'],

  ['testDir with a trailing slash resolves the same (must not false-alarm)',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests/',\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    0, 'check-ui-viewports: OK'],

  ['testDir: \'.\' is an ancestor that still contains the suite (must not false-alarm)',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: '.',\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    0, 'check-ui-viewports: OK'],

  // ── respectGitIgnore: acceptance fixture 1 and 2 from #335 ───────────────
  // Neither is expressible as a config predicate — the second is a per-project
  // override of a root setting, the same shape as round 2's testDir finding, and
  // the first depends on the CONTENTS of a file the config never names.
  ['a .gitignore under testDir with respectGitIgnore off — still discovered',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  respectGitIgnore: false,\n  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'tests/.gitignore': '*.spec.js\n' },
    0, 'check-ui-viewports: OK'],

  ['a .gitignore under testDir with respectGitIgnore ON — OBSERVED, exit 12',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  respectGitIgnore: true,\n  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'tests/.gitignore': '*.spec.js\n' },
    12, 'discovers no test for it'],

  ['respectGitIgnore overridden on ONE project — that band alone is caught',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  respectGitIgnore: false,\n  projects: [\n${LAPTOP}${TABLET}`
      + `    { name: 'phone', respectGitIgnore: true, use: { viewport: { width: 390, height: 664 } } },\n  ],\n});\n`,
      'tests/.gitignore': '*.spec.js\n' },
    12, 'phone is declared but Playwright discovers no test for it'],

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

  // The second is acceptance fixture 4 from #335, and the criterion the rewrite
  // was set: catch it WITHOUT the special case. Until now the gate refused any
  // reporter absent from the installed Playwright's `builtInReporters` — derived
  // rather than hand-maintained, but still a rule about which reporters are
  // TRUSTED, not an observation of what they DID.
  //
  // Stage two lists with the config's own reporters intact and `['list']`
  // appended, so preprocess() still runs and the inventory is still readable.
  // Measured: this reporter yields `Total: 0 tests`, and the bands go uncovered.
  // The exit-11 case that pinned the derived list's own failure is deleted with
  // the list — there is no discriminator left to guard.
  ['a reporter that excludes every test — OBSERVED, exit 12',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  reporter: [['./drop-all.js']],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'drop-all.js': 'export default class { preprocess({ testRun, suite }) '
        + '{ for (const t of suite.allTests()) testRun.exclude(t); } }\n' },
    12, 'discovers no test for it'],

  // The negative twin, and the false alarm the allowlist used to produce: a
  // custom reporter that removes NOTHING is now a pass. Under exit 10 this was
  // refused for existing. It is also the case that proves the listing survives a
  // custom reporter at all — without the appended `list`, a custom reporter
  // replaces the built-in one and `--list` prints nothing, which is
  // indistinguishable from excluding everything. Both silent, one a pass.
  ['a custom reporter that excludes NOTHING — passes now, no longer refused',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  reporter: [['./quiet.js']],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'quiet.js': 'export default class { }\n' },
    0, 'check-ui-viewports: OK'],

  // PW_TEST_REPORTER reaches PLAYWRIGHT rather than the config: the runner
  // appends it whatever `reporter` says, so a config declaring only built-ins can
  // still run arbitrary reporter code. Found at round 9 of #333, after round 8
  // had "fixed" exactly that class — a config is CODE, and what it exports
  // depends on everything the evaluation can see. Stage two inherits the
  // environment, so the variable reaches the listing exactly as it reaches the
  // run, and no case needs to know the variable's name.
  ['PW_TEST_REPORTER names a reporter that excludes everything — OBSERVED',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  reporter: [['list']],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      // Playwright resolves PW_TEST_REPORTER relative to testDir, not to the
      // config — measured, after placing it beside the config produced
      // "Cannot find module .../tests/drop-all.js". Left where Playwright looks
      // rather than guessed at: the default testMatch does not match a plain
      // .js, so it is not picked up as a spec.
      'tests/drop-all.js': 'export default class { preprocess({ testRun, suite }) '
        + '{ for (const t of suite.allTests()) testRun.exclude(t); } }\n' },
    12, 'discovers no test for it', { extraEnv: { PW_TEST_REPORTER: './drop-all.js' } }],

  ['PW_TEST_REPORTER names a BUILT-IN — must NOT trip',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  reporter: [['list']],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    0, 'check-ui-viewports: OK', { extraEnv: { PW_TEST_REPORTER: 'dot' } }],

  // ── THE OBSERVATION'S OWN FAILURES (#335) ────────────────────────────────
  // Stage two can fail in two ways, and both must be loud. This is the founding
  // rule of this file applied to the new half: a listing that did not happen is
  // "could not look", never "no tests" and never a pass. Without these cases the
  // CANNOT-CHECK branches are untested code on the path that runs when the check
  // breaks — which is how a refusal quietly becomes a certification.
  ['the listing cannot run at all — CANNOT CHECK, exit 15',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    15, 'could not observe what Playwright discovers',
    // PATH emptied so `npx` cannot be found. The config is perfect and all three
    // bands are declared: the point is that a gate which cannot observe must not
    // fall back on what the config says.
    { extraEnv: { PATH: '' } }],

  ['the listing runs but enumerates nothing readable — CANNOT CHECK, exit 16',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    16, 'produced no "Total:" line',
    // An unresolvable reporter: Playwright fails before listing, so there is no
    // inventory. Distinct from "listed zero tests", which is exit 12 — the gate
    // must not report an observed absence it never observed.
    { extraEnv: { PW_TEST_REPORTER: './no-such-reporter.js' } }],

  // A suite with no spec files at all. Before #335 this passed: three bands were
  // declared and nothing asked whether anything ran. It is exit 12 now, and the
  // change is not a technicality — a suite with no tests has no coverage at any
  // width, and the gate used to certify all three.
  ['a config declaring all three bands with NO tests to run — exit 12',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    12, 'discovers no test for it', { noSpec: true }],

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
    { 'cfgdir/tests/a.spec.js': SPEC,
      'cfgdir/playwright.config.js':
        `import { defineConfig, devices } from '@playwright/test';\n`
        + `const here = process.cwd();\n`
        + `const elsewhere = !here.endsWith('/suite');\n`
        + `export default defineConfig({\n  testDir: '.',\n`
        + `  ...(elsewhere ? { grep: /__ONLY_WHEN_READ_FROM_ELSEWHERE__/ } : {}),\n`
        + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'suite/tests/app.spec.js': "import { test } from '@playwright/test';\ntest('s', async () => {});\n" },
    0, 'check-ui-viewports: OK', { subdir: 'suite', configArg: 'cfgdir/playwright.config.js' }],

  // Codex round 14: PW_TEST_SOURCE_TRANSFORM makes Playwright run a Babel plugin
  // over the config as it loads it, so a plain import() reads a different object.
  // Reproduced with a transform that ADDS a root grep — the gate certified three
  // bands while `--list` found zero tests. Refused rather than reproduced: this
  // gate should not be running arbitrary Babel plugins to predict Playwright.
  //
  // The negative twin is the one that keeps it honest, same as every other env
  // refusal here — an unset variable must not trip it.
  ['PW_TEST_SOURCE_TRANSFORM + _SCOPE both set — refused',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    13, 'PW_TEST_SOURCE_TRANSFORM',
    { extraEnv: { PW_TEST_SOURCE_TRANSFORM: '/tmp/t.js', PW_TEST_SOURCE_TRANSFORM_SCOPE: '/tmp' } }],

  // Codex round 18: Playwright applies the transform only when BOTH are set, so
  // refusing on the transform variable alone was a false alarm on a valid setup —
  // it loaded all three projects while this gate refused.
  ['PW_TEST_SOURCE_TRANSFORM without _SCOPE — must NOT trip',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    0, 'check-ui-viewports: OK', { extraEnv: { PW_TEST_SOURCE_TRANSFORM: '/tmp/t.js' } }],

  ['neither transform variable set — must NOT trip',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    0, 'check-ui-viewports: OK'],

  // Codex round 18, and the first attack that never touches the exit path or the
  // verdict file: `Array.prototype.filter = () => []` in a phone-only config makes
  // the child's missing-band lists empty, so it printed OK naming empty bands and
  // exited 0 cleanly. The child boundary protected termination, not arithmetic.
  //
  // The parent now re-decides from the reported rows with intrinsics the config
  // never saw. A corrupted child can only report WORSE data, which becomes a
  // refusal; it cannot manufacture a pass.
  ['config corrupts Array.prototype.filter — the pass is not accepted',
    { 'playwright.config.js': `${IMPORT}Array.prototype.filter = () => [];\n`
        + `export default defineConfig({\n  testDir: './tests',\n`
        + `  projects: [\n${PHONE}  ],\n});\n` },
    14, 'a pass its own data does not support'],

  // Codex round 18: the verdict CHANNEL was visible to the config through
  // process.env. An exit listener writing {"code":0} to it turned a recorded
  // refusal into an accepted pass. I had written that I was not defending against
  // this; it was one line to close, which was the wrong call to leave open.
  ['config forges a verdict through the env-exposed channel — channel is gone',
    { 'playwright.config.js': `${IMPORT}import { writeFileSync } from 'fs';\n`
        + `process.on('exit', () => {\n`
        + `  try { writeFileSync(process.env.__UI_VIEWPORTS_VERDICT_FILE, '{"code":0}'); } catch {}\n`
        + `  process.exitCode = 0;\n});\n`
        + `export default defineConfig({\n  testDir: './tests',\n`
        + `  projects: [\n${PHONE}  ],\n});\n` },
    1, 'no project declares a laptop viewport'],

  // Codex round 17: the child writes its verdict and then keeps running until the
  // event loop drains, so a config that schedules a throw crashes AFTER record(0).
  // The child printed an uncaught exception and exited 1; the parent reported 0.
  // A recorded PASS is now accepted only when the child also ended cleanly.
  ['config throws on a timer AFTER the gate passes — pass is not accepted',
    { 'playwright.config.js': `${IMPORT}setTimeout(() => { throw new Error('later'); }, 200);\n`
        + `export default defineConfig({\n  testDir: './tests',\n`
        + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    14, 'recorded a pass and then failed'],

  // The twin, and the asymmetry it pins: a recorded FAILURE needs no clean exit
  // to corroborate it. The child had already decided to refuse, and a crash
  // afterwards does not make the config acceptable. Without this case the fix
  // could be "simplified" into requiring a clean exit for every verdict, which
  // would turn precise refusals into the generic 14.
  ['config throws on a timer after the gate FAILS — the failure still stands',
    { 'playwright.config.js': `${IMPORT}setTimeout(() => { throw new Error('later'); }, 200);\n`
        + `export default defineConfig({\n  testDir: './tests',\n`
        + `  projects: [\n${PHONE}  ],\n});\n` },
    1, 'no project declares a laptop viewport'],

  // Codex round 16: after the bound-reference fix, a config registering
  // `process.on('exit', () => { process.exitCode = 0 })` still won — the bound
  // EXIT invokes exit listeners, and the listener overwrote the status. The gate
  // printed FAIL (code 1) and the process returned 0.
  //
  // That is the second primitive in two rounds, which is the argument against
  // capturing a third. The config is now imported in a CHILD process and the
  // verdict travels through a file the parent created, so nothing the config
  // does can reach the exit path that decides pass or fail.
  ['config installs an exit listener that zeroes the status — verdict survives',
    { 'playwright.config.js': `${IMPORT}process.on('exit', () => { process.exitCode = 0; });\n`
        + `export default defineConfig({\n  testDir: './tests',\n`
        + `  projects: [\n${PHONE}  ],\n});\n` },
    1, 'no project declares a laptop viewport'],

  // Belt and braces on the same mechanism: a config that both neuters exit AND
  // installs a zeroing listener. Neither reaches the parent.
  ['config neuters exit AND zeroes the status — verdict still survives',
    { 'playwright.config.js': `${IMPORT}process.exit = () => {};\n`
        + `process.on('exit', () => { process.exitCode = 0; });\n`
        + `export default defineConfig({\n  testDir: './tests',\n`
        + `  projects: [\n${PHONE}  ],\n});\n` },
    1, 'no project declares a laptop viewport'],

  // Codex round 15, and the most direct form this file's subject can take: the
  // CONFIG UNDER TEST disabling the verdict. A phone-only config containing
  // `process.exit = () => {}` let the gate print both missing-band failures, walk
  // past its own process.exit(1), print the OK line and exit 0.
  //
  // `process.exit` is now bound before any config code can run, so the config
  // cannot reach the reference the gate terminates through. This case must exit 1
  // — the phone-only verdict — and not 0.
  ['config neuters process.exit — the verdict still stands',
    { 'playwright.config.js': `${IMPORT}process.exit = () => {};\n`
        + `export default defineConfig({\n  testDir: './tests',\n`
        + `  projects: [\n${PHONE}  ],\n});\n` },
    1, 'no project declares a laptop viewport'],

  // Codex round 15: a shell entering a symlinked directory keeps the LOGICAL path
  // in PWD while cwd is the real target. Round 10 set PWD to process.cwd(), which
  // is physical — right when no symlink is involved and wrong exactly when one is.
  // The config declares a root grep only when PWD is the physical path, so exit 0
  // means the gate presented the logical one, as the run's shell would.
  ['symlinked tests dir keeps the LOGICAL PWD, as a shell would',
    { 'real/inner/tests/a.spec.js': SPEC,
      'real/inner/playwright.config.js':
        `import { defineConfig, devices } from '@playwright/test';\n`
        + `const physical = process.env.PWD && process.env.PWD.includes('/real/');\n`
        + `export default defineConfig({\n  testDir: '.',\n`
        + `  ...(physical ? { grep: /__ONLY_WHEN_PWD_IS_PHYSICAL__/ } : {}),\n`
        + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    0, 'check-ui-viewports: OK', { subdir: 'link', symlink: ['link', 'real/inner'] }],

  // Codex round 14: a symlinked --tests-dir plus a relative --config that
  // traverses a parent. The link points DEEPER than its lexical location, so the
  // two parents genuinely differ:
  //
  //     tmp/link  ->  tmp/real/inner
  //     lexical  resolve('tmp/link', '..')      = tmp        -> three-band decoy
  //     real cwd chdir('tmp/link') => tmp/real/inner, '..'    = tmp/real -> phone-only
  //
  // My first attempt at this fixture used `tmp/link -> tmp/real` and did NOT
  // discriminate: both bases named a path the filesystem followed to the same
  // file, so the case passed against the very defect it was written for. Caught by
  // reverting the fix and seeing it still pass — which is the only reason to run
  // that check on every new case rather than on the ones that look risky.
  ['relative --config with a symlinked --tests-dir resolves from the real cwd',
    { 'real/inner/keep.txt': 'x\n',
      'real/configdir/playwright.config.js':
        `${IMPORT}export default defineConfig({\n  testDir: '.',\n`
        + `  projects: [\n${PHONE}  ],\n});\n`,
      'configdir/playwright.config.js':
        `${IMPORT}export default defineConfig({\n  testDir: '.',\n`
        + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    1, 'no project declares a laptop viewport',
    { subdir: 'link', symlink: ['link', 'real/inner'], configArg: '../configdir', configArgRelative: true }],

  // A RELATIVE --tests-dir. Every other case passes an absolute path, so none of
  // them would have caught the tests dir being re-resolved against itself after
  // the chdir — the shipped kit did, which is a case suite being outrun by a
  // smoke test.
  ['--tests-dir passed RELATIVE to the launch directory',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    0, 'check-ui-viewports: OK', { relativeTestsDir: true }],

  // Codex round 13, and the only finding since round 6 that reopened a FALSE
  // GREEN rather than a false alarm. Playwright's resolveConfigLocation() resolves
  // a relative --config against process.cwd(), which is the tests directory; this
  // gate resolved it against wherever the process was launched. So
  // `--tests-dir suite --config configdir` meant two different files, and the gate
  // certified one while Playwright loaded the other.
  //
  // The fixture puts a PHONE-ONLY config at suite/configdir. Resolved correctly it
  // is found and fails for a missing laptop band (exit 1). Resolved against the
  // launch directory it is not found at all (exit 3) — so the case pins the base,
  // not merely that something went wrong.
  ['relative --config resolves against the TESTS dir, as Playwright does',
    { 'suite/configdir/playwright.config.js':
        `${IMPORT}export default defineConfig({\n  testDir: '.',\n`
        + `  projects: [\n${PHONE}  ],\n});\n`,
      'suite/tests/app.spec.js': "import { test } from '@playwright/test';\ntest('s', async () => {});\n" },
    1, 'no project declares a laptop viewport',
    { subdir: 'suite', configArg: 'configdir', configArgRelative: true }],

  // Codex round 12: Playwright's --config is "Configuration file, OR a test
  // directory with optional playwright.config" (1.62.1 --help). Treating a
  // directory as a file made import() fail and the gate exit 4 on an invocation
  // Playwright handles — a refusal on a valid config, so it counts against the
  // muting risk. Same precedence list as the implicit search, so the two paths
  // cannot disagree about which file Playwright would read.
  ['--config names a DIRECTORY, not a file',
    { 'cfgdir/tests/a.spec.js': SPEC,
      'cfgdir/playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: '.',\n`
        + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'suite/tests/app.spec.js': "import { test } from '@playwright/test';\ntest('s', async () => {});\n" },
    0, 'check-ui-viewports: OK', { subdir: 'suite', configArg: 'cfgdir' }],

  // Codex round 12 again: a project testDir is NO LONGER part of `restricted`.
  // Round 10 compared spellings, round 12 defeated it with a directory symlink —
  // the same defeat round 6 delivered to the root check after four predicates.
  // All testDir inference, root and project, now goes to #335 together.
  //
  // ── PROJECT-LEVEL SELECTION: the same two halves, one level down ─────────
  // These were exits 0 and 12 for three different reasons, all now obsolete. The
  // redirect was a KNOWN HOLE pinned at exit 0 (round 12 defeated the fourth
  // path predicate with a symlink, and all testDir inference went to #335). The
  // two selection keys were exit 12 CANNOT-CHECK — a band whose only project
  // carried a key could not be attributed, whether or not the key did anything.
  //
  // Observation settles all three, and the no-op one is the important twin: it
  // is the false alarm the old refusal produced, and it must now pass.
  ['project testDir redirected away from the suite — OBSERVED, exit 12',
    { 'playwright.config.js': withProjects(
      "    { name: 'desktop', testDir: './elsewhere', use: { viewport: { width: 1440, height: 900 } } },\n"
      + TABLET + PHONE),
      'elsewhere/keep.txt': 'x\n' },
    12, 'laptop is declared but Playwright discovers no test for it'],

  ['project testMatch that matches nothing — OBSERVED, exit 12',
    { 'playwright.config.js': withProjects(
      "    { name: 'desktop', testMatch: /smoke\\.spec\\.js/, use: { viewport: { width: 1440, height: 900 } } },\n"
      + TABLET + PHONE) },
    12, 'laptop is declared but Playwright discovers no test for it'],

  ['project no-op testIgnore: [] — passes now, no longer unattributable',
    { 'playwright.config.js': withProjects(
      "    { name: 'desktop', testIgnore: [], use: { viewport: { width: 1440, height: 900 } } },\n"
      + TABLET + PHONE) },
    0, 'check-ui-viewports: OK'],

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
    // EVERY FIXTURE NEEDS SOMETHING TO DISCOVER. Since #335 the gate does not
    // stop at what the config declares — it asks Playwright what it enumerates,
    // and a fixture with no spec file legitimately enumerates nothing, so every
    // formerly-passing case would fail with "declared but discovers no test".
    // That is the gate being right about a fixture that was never realistic: a
    // suite with no tests has no coverage at any width.
    //
    // Written only when the case supplies no spec of its own, so a case ABOUT
    // discovery (an ignored spec, an excluding reporter, a redirected testDir)
    // still controls exactly what is there. ESM because FIXTURE_PKG declares
    // "type": "module".
    const hasSpec = Object.keys(files).some(n => /\.spec\.[cm]?[jt]s$/.test(n));
    if (!hasSpec && o.noSpec !== true) {
      mkdirSync(join(tmp, 'tests'), { recursive: true });
      writeFileSync(join(tmp, 'tests', 'gate.spec.js'),
        "import { test, expect } from '@playwright/test';\ntest('present', async () => { expect(1).toBe(1); });\n");
    }
    // opts.symlink: [linkName, targetName] inside tmp, created after the files so
    // the target exists. Needed to express the round-14 fixture at all.
    if (o.symlink) {
      const [linkName, targetName] = o.symlink;
      mkdirSync(join(tmp, targetName), { recursive: true });
      symlinkSync(join(tmp, targetName), join(tmp, linkName), 'dir');
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
    const env = { ...process.env, UI_TESTS_DIR: o.env ? target : '',
      PW_TEST_REPORTER: '', PW_TEST_SOURCE_TRANSFORM: '', PW_TEST_SOURCE_TRANSFORM_SCOPE: '', ...(o.extraEnv || {}) };
    // opts.configArg passes an explicit --config, which is how a config OUTSIDE
    // the tests directory gets exercised. Playwright's cwd is the tests dir
    // whatever --config points at, so the two only diverge when they are
    // different directories — which the shipped layout never is (#333 round 11).
    // opts.relativeTestsDir passes the tests dir RELATIVE to the spawn cwd. Once
    // the gate chdir's into it, a relative path re-resolved against the new cwd
    // names itself twice — a defect the shipped kit caught and no case did,
    // because every other case passes an absolute path (#333 round 14).
    const args = o.env
      ? [CHECK]
      : [CHECK, '--tests-dir', o.relativeTestsDir ? relative(REPO_ROOT, target) : target];
    // A RELATIVE --config is left relative: the point of that case is which base
    // the gate resolves it against, and joining it to tmp here would make it
    // absolute and test nothing.
    if (o.configArg) args.push('--config', o.configArgRelative ? o.configArg : join(tmp, o.configArg));
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
