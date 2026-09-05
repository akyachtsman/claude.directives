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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync, unlinkSync, lstatSync, existsSync } from 'fs';
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
// The pre-run declaration the round-23 cross-check cases carry (#347 round 23).
const DECLARED_MAP = [{ name: 'desktop', width: 1440 }, { name: 'tablet', width: 810 },
  { name: 'phone', width: 390 }];
const SPEC = "import { test, expect } from '@playwright/test';\ntest('present', async () => { expect(1).toBe(1); });\n";

const cfg = body => `${IMPORT}export default defineConfig({\n  testDir: './tests',\n${body}});\n`;

// A config that goes looking for the verdict channel instead of being handed it.
// Written out in full rather than composed, because every line of it is the
// finding: enumerate, pick the newest, write both payloads, and clear the exit
// code so the corroboration check sees a clean end (Codex, #347 round 10).
// A config that selects nothing and then writes a report saying everything ran.
// The exit handler fires inside the PLAYWRIGHT process, after its json reporter
// has finished, so what the gate reads is not the run's account of itself.
// directives#349 — the limit this pins, not a defect to fix here.
//
// PARAMETERISED, NOT STRING-SURGERY. The twin needs the same config WITHOUT the
// handler, and my first attempt produced it by rewriting `process.on('exit'` into
// a harmless expression — which left an unbalanced paren, so the twin would have
// failed at exit 5 (config throws at import) while asserting exit 12. It would
// have passed for a reason that had nothing to do with the report. Building both
// from one function makes the two fixtures differ in exactly the handler.
const forgedReport = (rewrite) => `${IMPORT}import { writeFileSync } from 'fs';
${rewrite ? `process.on('exit', () => {
  try {
    const result = { status: 'passed', annotations: [] };
    const tests = ['desktop', 'tablet', 'phone'].map(projectName => ({
      projectName, annotations: [], results: [result],
    }));
    writeFileSync(process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || 'report.json', JSON.stringify({
      suites: [{ specs: [{ title: 'present', tests }] }],
    }), 'utf8');
  } catch {}
});` : ''}
export default defineConfig({
  testDir: './tests',
  grep: /this-title-does-not-exist/,
  projects: [
${LAPTOP}${TABLET}${PHONE}  ],
});
`;

const FORGE = `${IMPORT}import { readdirSync, writeFileSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
process.on('exit', () => {
  try {
    const dirs = readdirSync(tmpdir())
      .filter(d => d.startsWith('ui-viewports-verdict-'))
      .map(d => join(tmpdir(), d))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    const file = join(dirs[0], 'verdict.json');
    writeFileSync(file, JSON.stringify({ code: 0 }), 'utf8');
    writeFileSync(file + '.rows', JSON.stringify({
      rows: [{ name: 'phone', width: 390 }],
      cover: { laptop: ['phone'], tablet: ['phone'], phone: ['phone'] },
      configPath: 'playwright.config.js', testsDir: '.',
    }), 'utf8');
    process.exitCode = 0;
  } catch {}
});
export default defineConfig({
  testDir: './tests',
  projects: [
${PHONE}  ],
});
`;
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
    12, 'NOTHING RAN at that width', { runReport: true }]),

  // Sharding is its own case because it does not empty the run — it splits it,
  // and the band that survives depends on how Playwright distributes. The
  // assertion is on the exit and the diagnostic shape, not on WHICH band is
  // named, because that is Playwright's business and pinning it would make this
  // case a prediction again.
  ['root shard 1 of 4 leaves a band with nothing — OBSERVED, exit 12',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  shard: { current: 1, total: 4 },\n  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    12, 'NOTHING RAN at that width', { runReport: true,
      // THE FAILURE PATH NEEDS THE ASSERTION TOO. Round 19 put `mustNotSay` on
      // the SUCCESS verdict and left the exit-12 diagnostic saying "the run
      // executed N of M test(s)" — the same withdrawn claim, on the path a
      // reader reaches when something is wrong (Codex, #347 round 20).
      //
      // A correction to the finding's stated reason, since it matters for what
      // this now covers: the runner concatenates stdout AND stderr, so the
      // mechanism always reached this line. What was missing was a case on this
      // path, not the ability to see it. NOTHING RAN survives deliberately —
      // it claims LESS than the evidence, and nothing scheduled entails nothing
      // executed.
      mustNotSay: ['EXECUTED', 'run executed', 'actually exercised', 'actually ran'] }],

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
    12, 'NOTHING RAN at that width', { runReport: true }],

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
    12, 'NOTHING RAN at that width', { runReport: true }],

  ['respectGitIgnore overridden on ONE project — that band alone is caught',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  respectGitIgnore: false,\n  projects: [\n${LAPTOP}${TABLET}`
      + `    { name: 'phone', respectGitIgnore: true, use: { viewport: { width: 390, height: 664 } } },\n  ],\n});\n`,
      'tests/.gitignore': '*.spec.js\n' },
    12, 'phone is declared but NOTHING RAN at that width', { runReport: true }],

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
  // was set: catch it WITHOUT the special case. Two earlier designs refused a
  // reporter — first any absent from the installed Playwright's
  // `builtInReporters`, then any that left a listing unreadable. Both were rules
  // about which reporters are TRUSTED rather than observations of what they DID,
  // and both refused honest configs. The run's report needs neither: a reporter
  // whose preprocess() excludes every test produces a run that executed nothing,
  // and the report says so in the reporter's own words.
  //
  // These fixtures declare a `json` reporter of their OWN (opts.ownReporter), so
  // the harness runs `playwright test` with no `--reporter` override — a CLI
  // reporter REPLACES the config's, which would delete the very reporter under
  // test. That is the same trap the gate's header warns about, exercised here.
  ['a reporter that excludes every test — OBSERVED in the run, exit 12',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  reporter: [['./drop-all.js'], ['json', { outputFile: 'report.json' }]],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'drop-all.js': 'export default class { preprocess({ testRun, suite }) '
        + '{ for (const t of suite.allTests()) testRun.exclude(t); } }\n' },
    12, 'NOTHING RAN at that width', { runReport: true, ownReporter: true }],

  // The twin, and what the report bought: a custom reporter that removes NOTHING
  // used to be indistinguishable from one that removed everything, because both
  // produced the same silent listing, so both were refused. The run reports what
  // it ran whoever else is listening, so this one simply passes.
  ['a custom reporter that excludes NOTHING — no longer refused, it just passes',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  reporter: [['./quiet.js'], ['json', { outputFile: 'report.json' }]],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'quiet.js': 'export default class { }\n' },
    0, 'check-ui-viewports: OK — SCHEDULED', { runReport: true, ownReporter: true }],

  // PW_TEST_REPORTER reaches PLAYWRIGHT rather than the config: the runner
  // appends it whatever `reporter` says, so a config declaring only built-ins can
  // still run arbitrary reporter code. Found at round 9 of #333, after round 8
  // had "fixed" exactly that class — a config is CODE, and what it exports
  // depends on everything the evaluation can see. The gate now reads the RUN's
  // report, so the variable reaches the thing being measured by definition and
  // no case needs to know the variable's name.
  ['PW_TEST_REPORTER names a reporter that excludes everything — OBSERVED',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  reporter: [['list'], ['json', { outputFile: 'report.json' }]],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      // Playwright resolves PW_TEST_REPORTER relative to testDir, not to the
      // config — measured, after placing it beside the config produced
      // "Cannot find module .../tests/drop-all.js". Left where Playwright looks
      // rather than guessed at: the default testMatch does not match a plain
      // .js, so it is not picked up as a spec.
      'tests/drop-all.js': 'export default class { preprocess({ testRun, suite }) '
        + '{ for (const t of suite.allTests()) testRun.exclude(t); } }\n' },
    12, 'NOTHING RAN at that width',
    { runReport: true, ownReporter: true, extraEnv: { PW_TEST_REPORTER: './drop-all.js' } }],

  ['PW_TEST_REPORTER names a BUILT-IN — must NOT trip',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  reporter: [['list'], ['json', { outputFile: 'report.json' }]],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    0, 'check-ui-viewports: OK — SCHEDULED',
    { runReport: true, ownReporter: true, extraEnv: { PW_TEST_REPORTER: 'dot' } }],

  // ── THE JOIN IS BY NAME, SO NAMES MUST BE TELLABLE APART (#347 round 2) ──
  // Two shapes, both measured as false greens where one project's tests
  // certified another project's band. Collision is a property of the JOIN — the
  // report identifies a result only by `projectName` — so the gate refuses.
  ['duplicate project names — CANNOT CHECK, exit 18',
    { 'playwright.config.js': withProjects(
      "    { name: 'same', use: { viewport: { width: 1440, height: 900 } } },\n"
      + "    { name: 'same', testMatch: /__none__/, use: { viewport: { width: 390, height: 664 } } },\n"
      + TABLET) },
    18, 'two or more projects share a name'],

  // The third shape is RETIRED, and its fixture is kept as the proof. Under the
  // listing this config was a false green: `[desktop] › injected] › a.spec.js …`
  // read back as the project `desktop`, so the phone project's tests certified
  // the laptop band, and the gate had to refuse every name containing `] ›`. The
  // report carries `projectName` as a JSON string, so nothing is parsed out of
  // prose — the injected delimiter is just part of a name, the laptop project
  // still runs nothing, and the gate says exactly that.
  ['a project name containing the old listing delimiter — attributed correctly now',
    { 'playwright.config.js': withProjects(
      "    { name: 'desktop', testMatch: /__none__/, use: { viewport: { width: 1440, height: 900 } } },\n"
      + "    { name: 'desktop] › injected', use: { viewport: { width: 390, height: 664 } } },\n"
      + TABLET) },
    12, 'laptop is declared but NOTHING RAN at that width', { runReport: true }],

  ['distinct ordinary names still pass — the twin',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    0, 'check-ui-viewports: OK'],

  // ── FOCUS: exit 19 IS RETIRED, AND THIS IS WHY ───────────────────────────
  // Playwright loads with filterOnly:false in list mode and filterOnly:true for a
  // run, so a listing enumerated tests a focused suite would never execute. The
  // gate answered with `--forbid-only` and refused the whole config — a probe,
  // and one more thing a config could notice.
  //
  // This fixture is the case that probe existed for, and it is now an ordinary
  // observation: the laptop project is restricted to `gate.spec.js`, the `.only`
  // lives in `focus.spec.js`, so laptop discovers a test and RUNS none. A
  // listing would have counted `gate.spec.js` for laptop and passed. The report
  // counts what executed, and the diagnostic names laptop without the word
  // "focus" appearing anywhere in the gate.
  ['a focused test elsewhere empties a band — OBSERVED, exit 12',
    { 'playwright.config.js': withProjects(
      "    { name: 'desktop', testMatch: 'gate.spec.js', use: { viewport: { width: 1440, height: 900 } } },\n"
      + TABLET + PHONE),
      'tests/gate.spec.js': "import { test, expect } from '@playwright/test';\n"
        + "test('present', async () => { expect(1).toBe(1); });\n",
      'tests/focus.spec.js': "import { test, expect } from '@playwright/test';\n"
        + "test.only('focused', async () => { expect(1).toBe(1); });\n" },
    12, 'laptop is declared but NOTHING RAN at that width', { runReport: true }],

  ['…and an unfocused suite is not refused — the twin',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    0, 'check-ui-viewports: OK — SCHEDULED', { runReport: true,
      // THE WORD THE VERDICT WITHDREW, ASSERTED AGAINST ITS OWN OUTPUT (#347
      // round 19). This line still read "(a test EXECUTED in a project
      // declaring each width" — the PASSING verdict, printed on every green
      // run, contradicting the name it prints one line above. Case-sensitive
      // and exact: `EXECUTED` now appears nowhere in this output legitimately,
      // and "actually exercised" is the composite's retired step name.
      //
      // One carrier, not the class. The prose in test.md, CLAUDE.md and the
      // shipped config stays unpinned — see the runner's mustNotSay note.
      mustNotSay: ['EXECUTED', 'actually exercised', 'actually ran'] }],

  // ── WHAT A LISTING COULD NOT SEE AT ALL, AND THE REPORT CAN ──────────────
  ['a reporter that SKIPS every test — CAUGHT now, exit 12',
    // This was the listing design's documented limit, and it is the single
    // clearest reason the design changed. testRun.skip() leaves the tests
    // ENUMERATED: a listing prints them all and reads as full coverage.
    // Measured in both listing formats — `--list --reporter=json` reports status
    // "skipped" for EVERY test even with no skipping reporter at all, because
    // nothing runs in list mode, so the JSON carried no disposition either. A
    // listing could see what was EXCLUDED and never what was SKIPPED.
    //
    // A run's report carries a per-test `results[].status`, so a skipped test is
    // a test that did not execute and the band it was supposed to certify is
    // uncovered. Nothing in the gate knows the word "skip": it counts results
    // whose status is anything other than "skipped", which is the same rule that
    // catches exclusion, sharding and a focused suite.
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  reporter: [['./skipper.js'], ['json', { outputFile: 'report.json' }]],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'skipper.js': 'export default class { async preprocess({ suite, testRun }) '
        + '{ for (const t of suite.allTests()) testRun.skip(t); } }\n' },
    12, 'NOTHING RAN at that width', { runReport: true, ownReporter: true }],

  // ── THE OBSERVATION WAS ITSELF OBSERVABLE (#347 round 1) ─────────────────
  // Two P1s, both reproduced against the listing design, both false greens: a
  // config CAN notice how it is being inspected, and a listing announced itself
  // twice over — an appended reporter in `config.reporter`, and `--list` in
  // argv. Neither survives reading the run: there is nothing to notice, because
  // the gate no longer arranges an inspection. Both fixtures are kept, and both
  // are now caught by the same rule as everything else.
  ['a reporter that branches on config.reporter — the run is the run, exit 12',
    // Under the listing this excluded every test only when it was the SOLE
    // reporter, so the real run discovered nothing while the wrapped listing
    // discovered everything. Inverted here to keep the fixture honest against a
    // config that carries its own `json`: it excludes when a second reporter is
    // present, which is the shape the shipped kit has. Whatever it branches on,
    // it branches during the run being measured.
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  reporter: [['./sneaky.js'], ['json', { outputFile: 'report.json' }]],\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'sneaky.js': 'export default class { async preprocess({ config, suite, testRun }) '
        + '{ if (config.reporter.length > 1) { for (const t of suite.allTests()) testRun.exclude(t); } } }\n' },
    12, 'NOTHING RAN at that width', { runReport: true, ownReporter: true }],

  ['a config that branches on --list — CAUGHT now, exit 12',
    // The listing design's other documented limit. This config applies a
    // non-matching grep unless argv contains `--list`, so the real run
    // discovered nothing and the listing discovered everything. No arrangement
    // of `--list` closed it, because the flag was what made it a listing.
    // Nothing in the gate passes `--list` any more: the run takes the grep, the
    // report is empty, and the band is named.
    { 'playwright.config.js': `${IMPORT}const listing = process.argv.includes('--list');\n`
      + `export default defineConfig({\n  testDir: './tests',\n`
      + `  ...(listing ? {} : { grep: /__NEVER_MATCHES__/ }),\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    12, 'NOTHING RAN at that width', { runReport: true }],

  // ── UNNAMED PROJECTS: the fix, and the hole the fix opened ───────────────
  // ── AN EXPLICIT NON-STRING NAME IS NOT "unnamed" (#347 round 27) ───────
  // `typeof p.name === 'string' ? p.name : ''` coerced these to the SAME key a
  // legitimately unnamed project uses, so a leftover report carrying
  // `projectName: ""` joined against them and certified at exit 0 — while
  // Playwright 1.62.1 refuses the config outright (`config.projects[0].name must
  // be a string`, measured), so no run could have produced those results at all.
  // Round 24 made the REPORT's projectName refuse a non-string and left the
  // CONFIG's key coercing one: the same defect on the other side of the join.
  ...[['a number', '42'], ['null', 'null'], ['an array', "['a']"], ['an object', '{}']]
    .map(([what, value]) => [
      `a project whose name is ${what} — CANNOT CHECK`,
      { 'playwright.config.js': withProjects(
        `    { name: ${value}, use: { viewport: { width: 1440, height: 900 } } },\n`
        + TABLET + PHONE) },
      5, 'has a name that is not a string',
    ]),

  // The sibling, found by sweeping the line rather than the finding: a non-object
  // ENTRY was read as an unnamed project at Playwright's default 1280x720 and
  // certified the LAPTOP band from a `projectName: ""` row — a declaration the
  // config never made. Playwright refuses these too ("config.projects[0] must be
  // an object", measured on 1.62.1).
  // `['an array', '[]']` WAS PINNED HERE IN ROUND 27 AND IS GONE IN ROUND 28.
  // Arrays are objects to Playwright, which accepts and runs them; the case
  // asserted a refusal this gate should never have made. Overturning a case I
  // shipped one round earlier, recorded here rather than quietly dropped — the
  // twin above now pins the opposite, that an array carrying name and use is
  // ACCEPTED.
  ...[['null', 'null'], ['a number', '7'], ['a string', "'laptop'"]]
    .map(([what, value]) => [
      `a project entry that is ${what} — CANNOT CHECK`,
      { 'playwright.config.js': withProjects(`    ${value},\n` + TABLET + PHONE) },
      5, 'not an object',
    ]),

  // ── ROUND 27'S ENTRY RULE WAS STRICTER THAN PLAYWRIGHT'S (#347 round 28) ──
  // `Array.isArray` was not Playwright's check. An array carrying `name` and
  // `use` is LISTED and RUN normally by 1.62.1 (measured), so refusing it blocked
  // a config the run accepts. A gate that refuses what the run accepts is the
  // same defect as one that certifies what the run refuses — it just fails
  // loudly, which is how it survived a round.
  ['an array carrying name and use — accepted, as Playwright does',
    { 'playwright.config.js':
      "const p = [];\np.name = 'laptop';\np.use = { viewport: { width: 1440, height: 900 } };\n"
      + 'export default { testDir: \'.\', projects: [p,\n' + TABLET + PHONE + '] };\n' },
    0, 'check-ui-viewports: OK — DECLARED'],

  // ── `use` IS THE SAME COERCION ONE LEVEL DOWN (#347 round 28) ──────────
  // `use: null` was accepted and read as an OMITTED viewport, so the project took
  // the root or default width — a declaration from a config Playwright refuses
  // ("config.projects[0].use must be an object", measured).
  ...[['null', 'null'], ['a number', '7'], ['a string', "'wide'"]]
    .map(([what, value]) => [
      `a project whose use is ${what} — CANNOT CHECK`,
      { 'playwright.config.js': withProjects(
        `    { name: 'laptop', use: ${value} },\n` + TABLET + PHONE) },
      5, 'not an object',
    ]),
  ['a root-level use that is not an object — CANNOT CHECK',
    { 'playwright.config.js':
      "export default { testDir: '.', use: null, projects: [\n" + LAPTOP + TABLET + PHONE + '] };\n' },
    5, 'not an object'],

  // ── PLAYWRIGHT MERGES OWN ENUMERABLE ENTRIES ONLY (#347 round 28) ──────
  // `mergeObjects()` copies own enumerable keys, so a `use` that INHERITS
  // `viewport` hands Playwright nothing and falls through to the default — while
  // a plain property read saw the inherited value and published it as declared.
  // Measured: three projects inheriting 1280/900/390 ran with Playwright ignoring
  // all three. Ordinary JavaScript, not forgery.
  ['inherited viewports are not what the run uses — FAIL, not a false certificate',
    { 'playwright.config.js':
      'const mk = w => Object.create({ viewport: { width: w, height: 800 } });\n'
      + "export default { testDir: '.', projects: [\n"
      + "  { name: 'laptop', use: mk(1440) },\n"
      + "  { name: 'tablet', use: mk(900) },\n"
      + "  { name: 'phone', use: mk(390) },\n] };\n" },
    1, 'no project declares a tablet viewport'],
  // …AND `mergeObjects()` SKIPS UNDEFINED VALUES, which round 28's
  // own-enumerable test did not. `{ use: { viewport: undefined } }` is an own
  // enumerable key the merge steps over, so the ROOT width still applies and
  // Playwright runs the project at 1440 — while the gate selected the
  // `undefined`, called the project unclassifiable and FAILED a config the run
  // accepts (Codex, #347 round 29). Round 28's own lesson, one round later:
  // exact, not stricter.
  ['an undefined project viewport falls through to the root width',
    { 'playwright.config.js':
      "export default { testDir: '.', use: { viewport: { width: 1440, height: 900 } },\n"
      + '  projects: [\n'
      + "    { name: 'laptop', use: { viewport: undefined } },\n"
      + TABLET + PHONE + '] };\n' },
    0, 'check-ui-viewports: OK — DECLARED'],
  // The twin for THAT: with no root viewport to fall through to, the same shape
  // takes the documented default rather than being read as a declaration.
  ['…and with no root viewport it takes the 1280x720 default',
    { 'playwright.config.js': withProjects(
      "    { name: 'laptop', use: { viewport: undefined } },\n" + TABLET + PHONE) },
    0, 'check-ui-viewports: OK — DECLARED'],

  // …AND READ ONCE, because `Object.entries()` does (#347 round 30). Round 29's
  // fix tested `!== undefined` and then the selecting expression read the
  // property AGAIN. A getter returning 390 first and a wider value after made
  // the run use 390 while the gate published the second read.
  ['a getter viewport is read once, as the merge reads it',
    { 'playwright.config.js':
      'const mk = (first, rest) => { let n = 0; return { get viewport() {\n'
      + '  n += 1; return n === 1 ? { width: first, height: 800 }\n'
      + '                         : { width: rest, height: 800 }; } }; };\n'
      + "export default { testDir: '.', projects: [\n"
      + "  { name: 'laptop', use: mk(390, 1440) },\n"
      + "  { name: 'tablet', use: mk(390, 900) },\n"
      + "  { name: 'phone', use: mk(390, 390) },\n] };\n" },
    1, 'no project declares a laptop viewport'],

  // …AND THE ROOT LAYER IS READ FOR EVERY PROJECT, before that project's own
  // (#347 round 31). `mergeObjects()` takes the root even when the project
  // overrides it, so round 30's skip desynchronised a stateful root getter: the
  // run consumed 1280 under an overridden project and used 390 for the next.
  // Project `b` here has no viewport of its own, so it takes the root's SECOND
  // read (390 = phone) — measured against a real run, which reports b at 390.
  ['the root layer is read once per project, even when overridden',
    { 'playwright.config.js':
      'let n = 0;\n'
      + "export default { testDir: '.',\n"
      + '  use: { get viewport() { n += 1;\n'
      + '    return n === 1 ? { width: 1280, height: 800 } : { width: 390, height: 800 }; } },\n'
      + '  projects: [\n'
      + "    { name: 'a', use: { viewport: { width: 1440, height: 900 } } },\n"
      + "    { name: 'b' },\n"
      + "    { name: 'c', use: { viewport: { width: 820, height: 1180 } } },\n] };\n" },
    0, 'phone:b'],

  // …AND EVERY OWN ENUMERABLE PROPERTY IS READ, IN ORDER (#347 round 32).
  // `mergeObjects()` walks the whole layer, so a sibling accessor BEFORE
  // `viewport` runs first and can change what `viewport` returns. Rounds 28-31
  // each added one attribute of the merge to a predicate over `viewport` alone;
  // this is the traversal itself, which subsumes all four. Measured: Playwright
  // reports 390 in all three projects for this config.
  ['a sibling getter before viewport runs first, as the merge runs it',
    { 'playwright.config.js':
      'let n = 0;\n'
      + "export default { testDir: '.',\n"
      + "  use: { get baseURL() { n += 1; return 'http://x'; },\n"
      + '         get viewport() { return n >= 1 ? { width: 390, height: 800 }\n'
      + '                                        : { width: 1440, height: 800 }; } },\n'
      + "  projects: [ { name: 'laptop' }, { name: 'tablet' }, { name: 'phone' } ] };\n" },
    1, 'no project declares a laptop viewport'],
  // The twin: with no side-effecting sibling the same shape still reads the
  // root width normally, so the traversal is not satisfied by ignoring the root.
  ['…and a plain root viewport is still read for every project',
    { 'playwright.config.js':
      "export default { testDir: '.',\n"
      + '  use: { viewport: { width: 1440, height: 900 } },\n'
      + "  projects: [ { name: 'laptop' },\n" + TABLET + PHONE + '] };\n' },
    0, 'laptop:laptop'],

  // …AND THE FIRST LAYER IS A SPREAD, NOT `Object.entries` (#347 round 33).
  // Read out of 1.62.1's `mergeObjects`: `const result = { ...a }` for the first
  // layer, `Object.entries` only for the later ones. A spread evaluates
  // enumerable SYMBOL properties; `Object.entries` does not. Round 32 sent both
  // layers through entries, so a root symbol accessor with side effects never
  // fired in the gate and did fire in the run.
  ['a root symbol accessor fires, as the spread fires it',
    { 'playwright.config.js':
      'let n = 0;\n'
      + "const S = Symbol('s');\n"
      + 'const root = { get viewport() {\n'
      + '  return n >= 1 ? { width: 390, height: 800 } : { width: 1440, height: 800 }; } };\n'
      + 'Object.defineProperty(root, S, { enumerable: true, get() { n += 1; return 1; } });\n'
      + "export default { testDir: '.', use: root, projects: [\n"
      + "  { name: 'a', use: { viewport: { width: 820, height: 1180 } } },\n"
      + "  { name: 'laptop' },\n"
      + "  { name: 'phone', use: { viewport: { width: 390, height: 844 } } },\n] };\n" },
    1, 'no project declares a laptop viewport'],

  // ── THE JOIN KEY IS READ ONCE PER PROJECT (#347 round 33) ──────────────
  // `keyOf` read `p.name` twice and ran twice per project — duplicate detection,
  // then row construction — so a stateful accessor could hold one name through
  // Playwright's resolution and return another on the gate's last read, moving a
  // project's row onto a different project's results.
  ['a stateful name accessor cannot move the join key',
    { 'playwright.config.js':
      'let reads = 0;\n'
      + "const laptop = { use: { viewport: { width: 1440, height: 900 } } };\n"
      + "Object.defineProperty(laptop, 'name', { enumerable: true,\n"
      + "  get() { reads += 1; return reads >= 3 ? 'phone' : 'laptop-empty'; } });\n"
      + "export default { testDir: '.', projects: [laptop,\n" + TABLET + PHONE + '] };\n',
      'flip.json': '{"suites":[{"specs":[{"tests":['
        + '{"projectName":"tablet","annotations":[],"results":[{"status":"passed","annotations":[]}]},'
        + '{"projectName":"phone","annotations":[],"results":[{"status":"passed","annotations":[]}]}'
        + ']}]}]}' },
    12, 'declared by: laptop-empty', { reportArg: 'flip.json' }],

  // ── A PRESENT ROOT NAME IS VALIDATED (#347 round 31) ───────────────────
  // Round 30 added root-name inheritance and coerced a non-string to '',
  // reintroducing on the root the exact defect round 27 fixed on projects.
  ...[['a number', '42'], ['null', 'null'], ['an object', '{}']]
    .map(([what, value]) => [
      `a root name that is ${what} — CANNOT CHECK`,
      { 'playwright.config.js':
        `export default { testDir: '.', name: ${value}, projects: [\n`
        + LAPTOP + TABLET + PHONE + '] };\n' },
      5, "root config's name is",
    ]),

  // ── THE ROOT `name` IS INHERITED (#347 round 30) ───────────────────────
  // Playwright resolves a project's reported name as project.name, then the
  // ROOT config's name, then "" — measured: a root `name: 'desktop-root'` with
  // an unnamed project reports `[desktop-root]`. Keying it "" made the join look
  // for a row the report never carries. Predates this PR.
  ['an unnamed project inherits the root name for the join',
    { 'playwright.config.js':
      "export default { testDir: '.', name: 'desktop-root', projects: [\n"
      + '    { use: { viewport: { width: 1440, height: 900 } } },\n'
      + TABLET + PHONE + '] };\n',
      'rootname.json': '{"suites":[{"specs":[{"tests":['
        + '{"projectName":"desktop-root","annotations":[],"results":[{"status":"passed","annotations":[]}]},'
        + '{"projectName":"tablet","annotations":[],"results":[{"status":"passed","annotations":[]}]},'
        + '{"projectName":"phone","annotations":[],"results":[{"status":"passed","annotations":[]}]}'
        + ']}]}]}' },
    0, 'laptop:desktop-root', { reportArg: 'rootname.json' }],
  // The twin: with NO root name the empty key is still correct, so the rule is
  // not satisfied by inventing a name where Playwright reports "".
  ['…and with no root name the empty key still attributes',
    { 'playwright.config.js': withProjects(
      "    { use: { viewport: { width: 1440, height: 900 } } },\n" + TABLET + PHONE) },
    0, 'check-ui-viewports: OK — DECLARED'],

  // The twin: an OWN viewport is still read, so the rule above is not satisfied
  // by ignoring viewports altogether.
  ['an own viewport is still read',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    0, 'check-ui-viewports: OK — DECLARED'],

  // ── THE SHELL'S LOGICAL CWD, NOT NODE'S PHYSICAL ONE (#347 round 28) ──
  // Round 15 exported PWD = TESTS_DIR and argued TESTS_DIR was already the
  // logical path because `resolve()` does not follow symlinks. True for an
  // ABSOLUTE argument; the shipped composite passes `--tests-dir .`, whose base
  // is `process.cwd()` — which Node reports PHYSICALLY. So under a symlinked
  // tests-dir the gate read the config with PWD pointing at the real target
  // while Playwright inherited the shell's link path. Measured: a config
  // branching on a PWD ending in the link declared phone-only to the run and all
  // three bands to the gate, and the genuine report certified.
  ['a config branching on a symlinked PWD reads as the RUN reads it',
    { 'playwright.config.js':
      "const logical = (process.env.PWD || '').endsWith('-link');\n"
      + 'const w = logical ? [390, 390, 390] : [1440, 900, 390];\n'
      + "export default { testDir: '.', projects: [\n"
      + "  { name: 'laptop', use: { viewport: { width: w[0], height: 800 } } },\n"
      + "  { name: 'tablet', use: { viewport: { width: w[1], height: 800 } } },\n"
      + "  { name: 'phone', use: { viewport: { width: w[2], height: 800 } } },\n] };\n" },
    1, 'no project declares a laptop viewport', { symlinkCwd: true }],
  // The twin: entered by its REAL path, the same config declares all three and
  // certifies — so the case above pins WHICH path is read, not a blanket failure
  // under symlinks.
  ['…and entered by its real path the same config certifies',
    { 'playwright.config.js':
      "const logical = (process.env.PWD || '').endsWith('-link');\n"
      + 'const w = logical ? [390, 390, 390] : [1440, 900, 390];\n'
      + "export default { testDir: '.', projects: [\n"
      + "  { name: 'laptop', use: { viewport: { width: w[0], height: 800 } } },\n"
      + "  { name: 'tablet', use: { viewport: { width: w[1], height: 800 } } },\n"
      + "  { name: 'phone', use: { viewport: { width: w[2], height: 800 } } },\n] };\n" },
    0, 'check-ui-viewports: OK — DECLARED'],

  ['a project with no name is still attributed — no false failure',
    // An unnamed project reports `projectName: ""`, and the declaration side
    // keys it the same way, so the join matches. Under the listing this needed a
    // parser rule (unprefixed lines) and produced a false FAILURE until it had
    // one.
    { 'playwright.config.js': withProjects(
      "    { use: { viewport: { width: 1440, height: 900 } } },\n" + TABLET + PHONE) },
    0, 'laptop:(no name)', { runReport: true }],

  ['an unnamed project beside one NAMED `(no name)` — distinct keys, not a collision',
    // Codex #347 round 3, against the listing: the display sentinel was
    // `(unnamed)`, a project could be named that literally, and BOTH SIDES of
    // the join used the sentinel — so a phone project named `(unnamed)`
    // certified an unnamed laptop project that ran nothing. The join now runs on
    // the raw name (`''` for unnamed), and `(no name)` is only ever printed, so
    // the two are different keys however the label is spelled. The laptop
    // project here matches nothing and is named as the uncovered band.
    { 'playwright.config.js': withProjects(
      "    { testMatch: /__none__/, use: { viewport: { width: 1440, height: 900 } } },\n"
      + TABLET
      + "    { name: '(no name)', use: { viewport: { width: 390, height: 664 } } },\n") },
    12, 'laptop is declared but NOTHING RAN at that width', { runReport: true }],

  ['…and the diagnostic names the unnamed project rather than printing blank',
    // Same fixture, pinning the OTHER half: `declared by:` used to interpolate
    // the raw key, so an unnamed project printed an empty list — a diagnostic
    // that names nothing is the silent-failure shape one line down.
    { 'playwright.config.js': withProjects(
      "    { testMatch: /__none__/, use: { viewport: { width: 1440, height: 900 } } },\n"
      + TABLET
      + "    { name: '(no name)', use: { viewport: { width: 390, height: 664 } } },\n") },
    12, 'declared by: (no name)', { runReport: true }],

  ['a project name containing a plain `]` — read exactly, exit 0',
    // Codex #347 round 3, P2, against the listing: the parser captured
    // `[^\]]+`, so `desk]top` could not be read back at all and the gate
    // reported the laptop band undiscovered for a config Playwright runs in
    // full. Nothing parses a name now — the report carries it as a JSON string.
    { 'playwright.config.js': withProjects(
      "    { name: 'desk]top', use: { viewport: { width: 1440, height: 900 } } },\n"
      + TABLET + PHONE) },
    0, 'laptop:desk]top', { runReport: true }],

  ['a config that PRINTS listing-shaped lines is not believed',
    // Codex #347 round 3, against the listing: a config logging
    // `[project] › …` lines during evaluation populated the inventory, and the
    // gate certified three bands for a config with a non-matching root grep —
    // user stdout outranking the reporter's own trailer. The report is a FILE
    // the json reporter writes, so nothing a config prints reaches it, and this
    // config's grep leaves the run empty.
    { 'playwright.config.js': `${IMPORT}console.log('  [desktop] › a.spec.js:2:1 › present');\n`
      + `console.log('  Total: 3 tests in 1 file');\n`
      + `export default defineConfig({\n  testDir: './tests',\n`
      + `  grep: /__NEVER_MATCHES__/,\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    12, 'NOTHING RAN at that width', { runReport: true }],

  ['globalSetup that changes what collection defines — OBSERVED, exit 12',
    // Codex #347 round 3: list mode goes straight to createLoadTask while a run
    // calls createGlobalSetupTasks first, so a setup whose state the specs read
    // at collection time enumerated one suite and ran another. There is no list
    // mode any more; the report comes from the run that DID call the setup.
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  globalSetup: './global-setup.js',\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'global-setup.js': "export default async () => { process.env.NARROW = '1'; };\n",
      'tests/gate.spec.js': "import { test, expect } from '@playwright/test';\n"
        + "if (!process.env.NARROW) { test('present', async () => { expect(1).toBe(1); }); }\n" },
    12, 'NOTHING RAN at that width', { runReport: true }],

  ['TWO unnamed projects — CANNOT CHECK, exit 18',
    // Found by testing the fix above rather than shipping it. With two nameless
    // projects an unprefixed line marks BOTH discovered, so a config whose
    // unnamed phone project finds nothing was certified for phone by the unnamed
    // laptop project's tests. One nameless project is unambiguous; two are not.
    { 'playwright.config.js': withProjects(
      "    { use: { viewport: { width: 1440, height: 900 } } },\n"
      + "    { testMatch: /__none__/, use: { viewport: { width: 390, height: 664 } } },\n"
      + TABLET) },
    18, 'two or more projects share a name'],

  // ── A TEST THAT CHANGES ITS OWN VIEWPORT IS EVIDENCE FOR ONE WIDTH ──────
  // Codex #347 round 4, and the sharpest finding on the report design: a test
  // calling setViewportSize() runs at the width IT chose in every project, so a
  // run that selected only such a test reports results under all three project
  // names while nothing rendered at laptop or tablet. The shipped kit has
  // exactly one (S4, at 390), which is what made this reachable rather than
  // hypothetical.
  //
  // The report carries no viewport, so the test DECLARES the deviation and the
  // gate reads it. Measured on 1.62.1: annotations reach the JSON report both
  // per-test and per-result.
  ['every executed test declares a viewport override — no band is certified',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'tests/gate.spec.js': "import { test, expect } from '@playwright/test';\n"
        + "test('overrides', async () => {\n"
        + "  test.info().annotations.push({ type: 'viewport-override', description: '390' });\n"
        + "  expect(1).toBe(1);\n});\n" },
    12, 'NOTHING RAN at that width', { runReport: true }],

  // The twin, and the discriminator: the SAME fixture without the annotation
  // passes. Without this pair, a gate that ignored annotations entirely and a
  // gate that discarded every result would both look correct from one side.
  ['…and the same test without the annotation still certifies all three',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'tests/gate.spec.js': "import { test, expect } from '@playwright/test';\n"
        + "test('overrides', async () => { expect(1).toBe(1); });\n" },
    0, 'check-ui-viewports: OK — SCHEDULED', { runReport: true }],

  // An annotated test alongside an ordinary one: the band is covered by the
  // ordinary one, so the override costs nothing. This is the shipped kit's own
  // shape — S4 annotated, every other scenario not — and without it the rule
  // could be "any annotation anywhere fails the run" and still pass the pair
  // above.
  ['an annotated test beside an ordinary one — the ordinary one still counts',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'tests/gate.spec.js': "import { test, expect } from '@playwright/test';\n"
        + "test('present', async () => { expect(1).toBe(1); });\n"
        + "test('overrides', async () => {\n"
        + "  test.info().annotations.push({ type: 'viewport-override', description: '390' });\n"
        + "  expect(1).toBe(1);\n});\n" },
    0, 'check-ui-viewports: OK — SCHEDULED', { runReport: true }],

  // A RETRY'S ANNOTATION MUST NOT DISQUALIFY THE ATTEMPT BEFORE IT (#347 r5).
  // Playwright stores a retry's annotation on that result AND on the test-level
  // list. Reading the union made the retry's `viewport-override` retroactively
  // discard the first attempt — which rendered at the project's own viewport and
  // is honest evidence — so a band whose only test is flaky could fail outright.
  // This fixture fails once at the project viewport, then overrides on the retry.
  // AN OLDER PLAYWRIGHT DOES NOT SERIALISE PER-RESULT ANNOTATIONS (#347 r8).
  // Measured on 1.44.0: `results[].annotations` is ABSENT while
  // `tests[].annotations` carries the marker. Reading the result alone there
  // made every override invisible, so S4's marker was ignored and a run
  // containing only S4 certified laptop and tablet — the round-4 false green,
  // restored for anyone below the floor. The FIELD'S PRESENCE is the capability
  // signal; this fixture hand-writes a report in the old shape rather than
  // installing an old Playwright, because what is under test is how the gate
  // reads a report, not how Playwright writes one.
  ['a report with no per-result annotations — the test-level marker still counts',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'old.json': JSON.stringify({
        config: { version: '1.44.0' },
        suites: [{ specs: [{ title: 'S4 shape', tests: [
          { projectName: 'desktop', annotations: [{ type: 'viewport-override', description: '390' }],
            results: [{ status: 'passed' }] },
          { projectName: 'tablet', annotations: [{ type: 'viewport-override', description: '390' }],
            results: [{ status: 'passed' }] },
          { projectName: 'phone', annotations: [{ type: 'viewport-override', description: '390' }],
            results: [{ status: 'passed' }] },
        ] }] }],
      }) },
    12, 'NOTHING RAN at that width', { reportArg: 'old.json' }],

  ['…and the same report WITHOUT the marker still certifies',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'old.json': JSON.stringify({
        config: { version: '1.44.0' },
        suites: [{ specs: [{ title: 'ordinary', tests: [
          { projectName: 'desktop', annotations: [], results: [{ status: 'passed' }] },
          { projectName: 'tablet', annotations: [], results: [{ status: 'passed' }] },
          { projectName: 'phone', annotations: [], results: [{ status: 'passed' }] },
        ] }] }],
      }) },
    0, 'check-ui-viewports: OK — SCHEDULED', { reportArg: 'old.json' }],

  ['a retry that overrides — the first attempt still counts',
    { 'playwright.config.js': `${IMPORT}export default defineConfig({\n  testDir: './tests',\n`
      + `  retries: 1,\n  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'tests/gate.spec.js': "import { test, expect } from '@playwright/test';\n"
        + "test('flaky then overrides', async () => {\n"
        + "  if (test.info().retry > 0) {\n"
        + "    test.info().annotations.push({ type: 'viewport-override', description: '390' });\n"
        + "    return;\n  }\n"
        + "  expect(test.info().retry).toBe(1);\n});\n" },
    0, 'check-ui-viewports: OK — SCHEDULED', { runReport: true }],

  // ── THE OBSERVATION'S OWN FAILURES (#335) ────────────────────────────────
  // Stage two can fail in two ways, and both must be loud. This is the founding
  // rule of this file applied to the new half: a report that is not there is
  // "could not look", never "nothing ran" and never a pass. Without these cases
  // the CANNOT-CHECK branch is untested code on the path that runs when the
  // check breaks — which is how a refusal quietly becomes a certification.
  //
  // Both fixtures declare all three bands perfectly, so the ONLY thing between
  // them and a green is the read. A gate that cannot read the run must not fall
  // back on what the config says, and must not report an absence it never saw.
  // A PRESENT FLAG WITH NO PATH IS A USAGE ERROR (#347 round 6). `--report ''`
  // is what an unset REPORT_PATH expands to in the composite, and it used to
  // fall through the truthiness test: the caller asked for the execution check
  // and got the DECLARED verdict with exit 0. Silence where a check was
  // requested is the failure this whole file is about.
  // Round 20 folded this into ONE check above the parent/child split, so the
  // wording is now shared with the other three path flags; the rule and the exit
  // are unchanged, and this case is what proves that.
  ['--report given with an empty path — usage error, exit 8',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    8, '--report was given with no value', { reportArg: '' }],

  // BOTH SPELLINGS REACH STAGE TWO (#347 round 7). check-ui-suite-env.py accepts
  // `--report=<path>` as satisfying its requirement, and this parser understood
  // only the space-separated form — so that spelling passed the guard and got
  // the declaration verdict at exit 0. Two places that must agree about one flag.
  ['--report=<path> is read, not ignored',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    15, "could not read the run's report", { reportEq: 'no-such-report.json' }],

  ['--report names a file that is not there — CANNOT CHECK, exit 15',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    15, "could not read the run's report",
    // No suite is run: the path simply does not exist, which is what a failed or
    // never-started run leaves behind. Exit 15, not exit 12.
    { reportArg: 'no-such-report.json' }],

  ['--report names a file that is not JSON — CANNOT CHECK, exit 15',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      // A run killed partway leaves a truncated report, and a misconfigured
      // reporter leaves someone else's output. Both parse-fail, and neither is
      // evidence about coverage.
      'report.json': 'Running 3 tests using 1 worker\n' },
    15, "could not read the run's report",
    { reportArg: 'report.json' }],

  // A suite with no spec files at all. Before #335 this passed: three bands were
  // declared and nothing asked whether anything ran. It is exit 12 now, and the
  // change is not a technicality — a suite with no tests has no coverage at any
  // width, and the gate used to certify all three.
  ['a config declaring all three bands with NO tests to run — exit 12',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    12, 'NOTHING RAN at that width', { noSpec: true, runReport: true }],

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
    12, 'laptop is declared but NOTHING RAN at that width', { runReport: true }],

  ['project testMatch that matches nothing — OBSERVED, exit 12',
    { 'playwright.config.js': withProjects(
      "    { name: 'desktop', testMatch: /smoke\\.spec\\.js/, use: { viewport: { width: 1440, height: 900 } } },\n"
      + TABLET + PHONE) },
    12, 'laptop is declared but NOTHING RAN at that width', { runReport: true }],

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

  // ── A GATE THAT HANGS REPORTS NOTHING AT ALL (#347 round 3) ──────────────
  // The child IMPORTS the config, which is arbitrary code, and an import that
  // leaves a live handle never lets the child exit. Codex reproduced it with a
  // bare `setInterval(() => {}, 1000)` at module scope — Playwright lists such a
  // config without complaint, and this gate hung until something outside killed
  // it, consuming the whole job's budget and producing NONE of the CANNOT CHECK
  // verdicts it advertises. That is worse than any wrong verdict: a refusal is a
  // result and a hang is not.
  //
  // opts.shortTimeout runs the case against a copy of the gate with only the
  // bound substituted, because a case cannot wait 120 seconds. The substitution
  // is asserted to have happened, so renaming or deleting the constant reddens
  // this rather than silently testing an unmutated file. What is pinned is the
  // BRANCH — its exit code and its diagnostic — not the constant's value.
  // TWO WAYS TO HANG, AND THEY LAND ON DIFFERENT BRANCHES. Writing this case is
  // what showed that: Codex's fixture leaves a HANDLE open, so the child records
  // its verdict normally and is killed afterwards — the "recorded a pass and then
  // failed" branch, not the no-verdict one. The timeout diagnostic that had been
  // added for it was unreachable from that fixture, and the branch that DID fire
  // told the reader to look for a scheduled throw. Both are pinned now, because
  // "exit 14 either way" was true and still left the advice wrong.
  ['a config leaving a live handle — killed AFTER recording, and told so',
    { 'playwright.config.js': `${IMPORT}setInterval(() => {}, 1000);\n`
      + `export default defineConfig({\n  testDir: './tests',\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    14, 'wrote its verdict and then did not finish within 2s', { shortTimeout: 2000 }],

  ['…and it is NOT blamed on a scheduled throw',
    { 'playwright.config.js': `${IMPORT}setInterval(() => {}, 1000);\n`
      + `export default defineConfig({\n  testDir: './tests',\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    14, 'left something running — a timer, a socket', { shortTimeout: 2000 }],

  // The other half: a config that blocks the thread never reaches its own
  // export, so nothing is recorded and the no-verdict branch fires. Without this
  // the ETIMEDOUT path there is untested code on the path that runs when the
  // check breaks — which is how a refusal quietly becomes a certification.
  ['a config that blocks the thread — no verdict at all, and told so',
    { 'playwright.config.js': `${IMPORT}const end = Date.now() + 600000;\n`
      + `while (Date.now() < end) {}\n`
      + `export default defineConfig({\n  testDir: './tests',\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    14, 'did not report a verdict', { shortTimeout: 2000 }],

  // The stated bound is the ENFORCED one. Both diagnostics interpolate the same
  // constant the spawn uses, so this case — running at 2s — must read 2s. A
  // message that hardcoded 120 would pass every other assertion here and send a
  // reader looking for a two-minute hang that never happened.
  ['…and that one names the timeout as the cause, with the bound actually in force',
    { 'playwright.config.js': `${IMPORT}const end = Date.now() + 600000;\n`
      + `while (Date.now() < end) {}\n`
      + `export default defineConfig({\n  testDir: './tests',\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    14, 'it did not finish within 2s and was killed', { shortTimeout: 2000 }],

  // A BOUND THAT THE THING BEING BOUNDED CAN INTERCEPT IS NOT A BOUND.
  // `spawnSync`'s timeout kills with SIGTERM, and a config is arbitrary code
  // that may install a handler for it. Codex reproduced the hang on Node 20
  // (#347 round 4) and so did I, standalone: a 500ms bound had still not
  // returned when an external `timeout 8` killed the parent. The gate now kills
  // with SIGKILL, which cannot be caught.
  //
  // This case is why the harness above is itself bounded: a regression here does
  // not fail slowly, it fails by never returning at all.
  ['a config that traps SIGTERM and stays alive — the bound still holds',
    { 'playwright.config.js': `${IMPORT}process.on('SIGTERM', () => {});\n`
      + `setInterval(() => {}, 1000);\n`
      + `export default defineConfig({\n  testDir: './tests',\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    14, 'did not finish within 2s', { shortTimeout: 2000 }],

  // The twin, and the reason the bound cannot simply be made aggressive: an
  // ordinary config must still evaluate well inside it. The shipped kit is under
  // a second; this asserts the SAME 2s bound the two cases above trip is ample
  // for an honest config, so a timeout is evidence about the config rather than
  // about the machine.
  ['an ordinary config finishes well inside the same bound — no false refusal',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    0, 'check-ui-viewports: OK', { shortTimeout: 2000 }],

  // ── THE VERDICT FILE IS NOT A CREDENTIAL (#347 round 10) ─────────────────
  // Round 18 of #333 deleted __UI_VIEWPORTS_VERDICT_FILE from the child's
  // environment before the config could read it, and the comment there claimed
  // the channel was now out of the config's view. It was not. Codex enumerated
  // os.tmpdir() for `ui-viewports-verdict-*`, took the newest, wrote {"code":0}
  // and a three-band `.rows` from an exit listener, and set process.exitCode = 0
  // so the "recorded a pass and then failed" corroboration saw a clean end too.
  // A phone-only config then produced `OK — DECLARED laptop:phone tablet:phone
  // phone:phone` after printing its own FAIL (code 1).
  //
  // Nor was deleting it "harder" ever going to work: /proc/self/environ is an
  // exec-time snapshot that `delete process.env.X` does not touch, so anything
  // handed to the child through the environment stays readable by the config.
  // The parent now mints a nonce, sends it down stdin (a channel that is
  // consumed, not re-readable), and refuses any payload not stamped with it.
  //
  // This fixture is the reproduction. It is deliberately a WORKING forge — it
  // finds the directory and writes both files — so the case fails if the nonce
  // check is removed rather than if the enumeration stops working.
  ['a config forging a verdict into the gate\'s own tmp directory — refused',
    { 'playwright.config.js': FORGE },
    14, 'did not come from the config evaluation'],

  // The twin, and the one that matters: the forge must be REFUSED, not merely
  // survived. Without this the case above could pass on any exit-14 branch —
  // the fixture also sets process.exitCode, so a gate that had simply broken
  // would satisfy the code alone.
  ['…and the forged bands are not printed as a pass',
    { 'playwright.config.js': FORGE },
    14, 'A verdict that cannot be attributed is not a pass.'],

  // ── THE NONCE SAYS WHO WROTE IT, NOT WHETHER IT IS TRUE (#347 round 11) ──
  // Round 10's nonce closed the forged FILE and the comment further down claimed
  // the parent re-decided the band verdict — but the parent read a `cover` map
  // the CHILD had computed, so the legitimate child stamped the real nonce onto
  // corrupted arithmetic. Codex's fixture is two prototype assignments: `filter`
  // returns nothing (so the child's own band lists come out empty) and `toJSON`
  // makes every array serialise as `['phone']`. A phone-only config printed all
  // three bands and exited 0.
  //
  // The payload now carries only observations and the parent bands them itself,
  // so this fixture reaches the structural check and is refused.
  //
  // ⚠️ WHAT THIS CASE PROVES CHANGED IN ROUND 25, and the diagnostic moved with
  // it. `toJSON` makes `rows` serialise as `['phone']`, and round 25 hoisted the
  // payload shape check ahead of both `decideFromRows` callers — so the forgery
  // is now refused THERE, one step before the corroboration check that used to
  // catch it. Same exit, same property (a forged payload does not certify), a
  // different path.
  //
  // The cost, stated rather than left implicit: this case would now stay green
  // if the round-11 corroboration check were deleted, because the shape check
  // fires first. It pins "a forged payload is refused", not "the corroboration
  // check catches it". The case below — `filter` corrupted with serialisation
  // INTACT — is the one that still exercises the round-11 path, because its
  // payload is well-formed and only its CONTENT is a lie.
  ['a config corrupting Array.prototype to forge the band map — refused',
    { 'playwright.config.js': `${IMPORT}Array.prototype.filter = () => [];\n`
      + `Array.prototype.toJSON = () => ['phone'];\n`
      + `export default defineConfig({\n  testDir: './tests',\n`
      + `  projects: [\n${PHONE}  ],\n});\n` },
    14, 'a payload this gate cannot read'],

  // The narrower half on its own, and the sharper shape: `filter` corrupted with
  // serialisation intact, on a PHONE-ONLY config. The child's own
  // missing-band check runs through `filter`, so it finds nothing undeclared and
  // records a PASS — a false verdict produced without any forged file at all
  // (#333 round 18). The parent bands the rows and refuses.
  ['a phone-only config corrupting Array.prototype.filter — child passes, parent refuses',
    { 'playwright.config.js': `${IMPORT}Array.prototype.filter = () => [];\n`
      + `export default defineConfig({\n  testDir: './tests',\n`
      + `  projects: [\n${PHONE}  ],\n});\n` },
    14, 'reported a pass its own data does not support'],

  // THE TWIN, and it is a BEHAVIOUR CHANGE this round rather than a regression.
  // The same corruption on an HONEST three-band config used to be refused: the
  // child's empty `cover` map reached the parent, which saw three empty bands.
  // Now the parent bands the rows itself, so the config's declaration is read
  // correctly and it passes — which is the right answer, because those three
  // widths really are declared. Pinned because the change is easy to mistake for
  // a hole: what the parent stopped trusting is the child's ARITHMETIC, and a
  // corrupted child can no longer manufacture a refusal any more than a pass.
  ['…and the same corruption on an honest three-band config no longer false-alarms',
    { 'playwright.config.js': `${IMPORT}Array.prototype.filter = () => [];\n`
      + `export default defineConfig({\n  testDir: './tests',\n`
      + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n` },
    0, 'check-ui-viewports: OK'],

  // ── BAND BOUNDS: ONE READER, BOTH PROCESSES (#347 round 12) ──────────────
  // Round 11 gave the parent its own band-flag parser so a bound could not come
  // from the child's payload. That was right, but the parent's copy accepted
  // `--tablet-min=900` and the child's `opt()` did not — so the parent banded at
  // 900 while the child refused at 768, and since the parent never overturns a
  // refusal, this legitimate config was rejected for "no phone project".
  //
  // 850/1100/1300 is phone/tablet/laptop at 900/1200 and tablet/laptop/laptop at
  // the defaults, so the same fixture proves the bounds ARRIVED rather than
  // merely that it passed.
  ...[
    ['equals spelling', ['--tablet-min=900', '--laptop-min=1200']],
    ['space spelling', ['--tablet-min', '900', '--laptop-min', '1200']],
  ].map(([label, extraArgs]) => [
    `band bounds via the ${label} reach BOTH processes`,
    { 'playwright.config.js': withProjects(
      "    { name: 'a', use: { viewport: { width: 850, height: 900 } } },\n"
      + "    { name: 'b', use: { viewport: { width: 1100, height: 900 } } },\n"
      + "    { name: 'c', use: { viewport: { width: 1300, height: 900 } } },\n") },
    0, 'OK — DECLARED laptop:c  tablet:b  phone:a', { extraArgs },
  ]),

  // The twin: at the DEFAULT bounds the same three widths leave phone undeclared.
  // Without it the two cases above would pass against a gate that ignored the
  // flags entirely and banded everything generously.
  ['…and the same widths FAIL at the default bounds',
    { 'playwright.config.js': withProjects(
      "    { name: 'a', use: { viewport: { width: 850, height: 900 } } },\n"
      + "    { name: 'b', use: { viewport: { width: 1100, height: 900 } } },\n"
      + "    { name: 'c', use: { viewport: { width: 1300, height: 900 } } },\n") },
    1, 'no project declares a phone viewport'],

  // ── THE DECLARED MAPPING CROSSES THE RUN (#347 round 14) ────────────────
  // The post-run invocation used to import the config AGAIN, after globalSetup,
  // the tests and globalTeardown had all run. Codex reproduced a config whose
  // project C is a laptop before the run and a phone after teardown drops a
  // marker: the run scheduled A/B/C at laptop/tablet/laptop and phone project D
  // matched nothing, and the post-run evaluation reported `SCHEDULED … phone:C`.
  //
  // `--declared` carries the pre-run mapping across. These two pin the write and
  // the refusal; the reclassification itself is exercised end-to-end by
  // check-repo-map-ui's sibling fixture in the PR, since it needs a real run.
  ['--declared writes the mapping on a passing declaration',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    0, 'mapping written for the post-run check', { declared: true }],

  // THE SHIPPED DEFAULT'S SHAPE ON A CLEAN RUNNER. `report-path` defaults to
  // `../../../.agent-reports/playwright-results.json`, and that directory does
  // not exist until Playwright creates its output — which is AFTER this runs.
  // Round 14 shipped the sidecar without creating the parent, so the pre-run
  // gate exited 20 before the suite started and would have failed the composite
  // on every fresh checkout (Codex, #347 round 15).
  ['--declared into a directory that does not exist yet — created, not refused',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    0, 'mapping written for the post-run check', { declaredNested: true }],

  // A MISSING MAPPING REFUSES RATHER THAN RE-IMPORTING. Falling back would
  // silently restore the re-evaluation the flag replaced — the fail-open shape
  // this file exists to catch.
  ['--declared with --report and no mapping — refused, not re-imported',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    20, 'declared mapping from before the run could not be read',
    { declaredMissing: true, runReport: true }],

  // ── A VALUE IS NOT A FLAG (#347 round 16) ───────────────────────────────
  // `--tablet-min` is a legal filename, so an accepted `report-path` can put it
  // straight after `--report`. A whole-argv search found it there, read the
  // following (nonexistent) token as a band bound, and NaN bounds refused at
  // exit 14 WITHOUT EVER READING THE REPORT. The scan steps over option values
  // now; this fixture has no such report file, so the honest answer is 15 —
  // "could not read the report" — and 14 means the argv scan regressed.
  ['a report path that is itself a flag name — not read as a band bound',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    15, 'could not read', { reportIsFlagName: true }],

  // ── THE SAME FINDING, ONE FLAG OVER (#347 round 18) ─────────────────────
  // Round 16 fixed the band bounds and round 14's `--declared` by stepping over
  // option values, and left `--report` on a bare `indexOf`. Codex built the
  // identical construction against it: point `--config` at something NAMED
  // `--report`, and the whole-argv search lands on the config's VALUE.
  //
  // The old code then read the token AFTER it as the report path — there is
  // none — and exited 8 for a missing path on a command that passed no
  // `--report` at all. The command is honest and complete, so the honest answer
  // is the DECLARED verdict at exit 0; 8 means the scan regressed.
  //
  // A DIRECTORY named `--report`, which is what the harness supports and what
  // Playwright's `--config` accepts alongside a file. The finding is about the
  // argv token, not about how the config is stored.
  ['a --config value named --report — not read as the report flag',
    { '--report/playwright.config.js':
        `${IMPORT}export default defineConfig({\n  testDir: '.',\n`
        + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      '--report/app.spec.js': SPEC },
    0, 'OK — DECLARED', { configArg: '--report', configArgRelative: true }],

  // ── A PRESENT FLAG WITH AN EMPTY VALUE (#347 round 19) ──────────────────
  // `--report ''` has been a usage error since round 6. The options with a
  // silent FALLBACK had not been, and that is where it costs more: Codex
  // reproduced a wrapper running `--config "$PW_CONFIG"` with the variable
  // unset, and the gate loaded the IMPLICIT config and returned a confident
  // DECLARED verdict for a config the caller never named. A wrapper's unset
  // variable inside quotes is the ordinary way this arrives.
  ['--config with an empty value — refused, not read as absent',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    8, '--config was given with no value', { extraArgs: ['--config', ''] }],
  // Not reported, same defect: an empty --tests-dir fell past `=== undefined`,
  // past UI_TESTS_DIR, and landed on the hard-coded default. Fixing only the
  // reported flag is what rounds 16 and 18 already were, twice.
  ['--tests-dir with an empty value — refused, not fallen back from',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    8, '--tests-dir was given with no value', { env: true, extraArgs: ['--tests-dir', ''] }],

  // ── BOUNDS ARE A USAGE ERROR ON THE CARRIED PATH TOO (#347 round 19) ────
  // The child refuses nonsensical bounds at exit 8 before importing anything,
  // and `--declared` with `--report` never reaches the child. So this command
  // fell through to the banding guard, produced an empty cover map, and
  // surfaced as exit 14 — "a pass its own data does not support", blaming the
  // mapping for the caller's command line. Two paths that band rows have to
  // refuse the same bounds or the exit code stops meaning anything.
  ['inverted bounds on the carried-mapping path — exit 8, not 14',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'declared.json': JSON.stringify({
        testsDir: '.',
        rows: [{ name: 'desktop', width: 1440 }, { name: 'tablet', width: 810 },
          { name: 'phone', width: 390 }],
      }) },
    8, 'nonsensical band bounds',
    { declared: true, reportArg: 'report.json',
      extraArgs: ['--tablet-min', '1200', '--laptop-min', '1000'] }],

  // ── THE EMPTY-VALUE CHECK IS ABOVE THE SPLIT NOW (#347 round 20) ────────
  // Round 19 added it in the CHILD section, which the carried-mapping path
  // never reaches: `--tests-dir '' --config '' --declared <map> --report <rep>`
  // returned the SCHEDULED verdict at exit 0 while the same flags refused at 8
  // on the config-import path. One command, two answers, decided by branch.
  // That is round 19's OWN bounds finding repeated, and it repeated because I
  // fixed the reported flags instead of moving the check.
  ['empty --config on the CARRIED path — refused, not bypassed',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'declared.json': JSON.stringify({
        testsDir: '.',
        rows: [{ name: 'desktop', width: 1440 }, { name: 'tablet', width: 810 },
          { name: 'phone', width: 390 }],
      }) },
    8, '--config was given with no value',
    { declared: true, reportArg: 'report.json', extraArgs: ['--config', ''] }],
  ['empty --declared — refused before the mapping read',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    8, '--declared was given with no value', { extraArgs: ['--declared', ''] }],

  // ── AND IT MUST NOT REFUSE A LEGAL NAME (#347 round 20) ─────────────────
  // The first version called `.trim()`, so a config or directory named with
  // spaces — which the filesystem and every earlier version of this gate accept
  // — was refused as "given with no value". Strictly empty is the rule now: the
  // only thing being refused is a flag supplied with NO value.
  ['a --config value of a single space is a NAME, not an empty flag',
    { ' /playwright.config.js':
        `${IMPORT}export default defineConfig({\n  testDir: '.',\n`
        + `  projects: [\n${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      ' /app.spec.js': SPEC },
    0, 'OK — DECLARED', { configArg: ' ', configArgRelative: true }],

  // ── PARSES IS NOT READS (#347 round 20) ─────────────────────────────────
  // `JSON.parse` succeeding says the bytes are JSON. Every level below was
  // `x || []`, which handles undefined and null and THROWS on anything else:
  // Codex reproduced `{"suites":{}}` exiting 1 with a stack trace instead of the
  // promised CANNOT CHECK. Reproducing the family rather than the instance found
  // seven shapes and a second, worse mode — `"a string"` and `42` produced no
  // crash at all, just a confident exit-12 FAIL naming three bands unexercised,
  // because `doc.suites` was undefined and `|| []` swallowed it.
  ...[
    ['suites is an object', '{"suites":{}}', 'not a Playwright run report'],
    ['the document is a string', '"a string"', 'not a Playwright run report'],
    ['the document is a number', '42', 'not a Playwright run report'],
    ['the document is null', 'null', 'not a Playwright run report'],
    ['a suite is null', '{"suites":[null]}', 'not shaped like a Playwright report'],
    ['specs is an object', '{"suites":[{"specs":{}}]}', 'not shaped like a Playwright report'],
    ['tests is an object', '{"suites":[{"specs":[{"tests":{}}]}]}', 'not shaped like a Playwright report'],
    ['results is an object', '{"suites":[{"specs":[{"tests":[{"results":{}}]}]}]}',
      'not shaped like a Playwright report'],
  ].map(([what, json, diagnostic]) => [
    `a report where ${what} — CANNOT CHECK, never a verdict`,
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'bad-report.json': json },
    15, diagnostic, { reportArg: 'bad-report.json' },
  ]),
  // ── #352: A REPORT VERDICT NEEDS TWO OBSERVATIONS, SO ONE FLAG IS REFUSED ──
  // Everything else in this file now reaches the gate the way the composite does,
  // with both flags. That is the arrangement CI has always used -- but it means
  // NOTHING here would exercise the refusal itself, and an unpinned refusal is
  // one nobody notices being deleted. `noDeclared` opts this case out of the
  // harness's composite sequence so it can hand the gate the shape #352 is about.
  ['--report without --declared is refused — one observation, exit 22',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'empty-report.json': '{"suites":[]}' },
    22, '--report was given without --declared',
    { reportArg: 'empty-report.json', noDeclared: true }],
  // THE TWIN, and it is what makes the case above mean anything: the SAME config
  // and the SAME report, with the mapping supplied, reaches a real verdict. So
  // exit 22 is caused by the missing flag and not by the fixture.
  ['…the same report WITH a declared mapping reaches a verdict, not a refusal',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'empty-report.json': '{"suites":[]}' },
    12, 'NOTHING RAN at that width',
    { reportArg: 'empty-report.json', declaredMap: DECLARED_MAP }],

  // The twin: an EMPTY but well-formed report is a real answer, not a refusal.
  // Without this the eight above are satisfiable by refusing every report.
  ['an empty but well-formed report is exit 12, not 15',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'empty-report.json': '{"suites":[]}' },
    12, 'NOTHING RAN at that width', { reportArg: 'empty-report.json' }],

  // ── null IS PRESENT (#347 round 21) ─────────────────────────────────────
  // Round 20 stated the rule as "a present non-array is malformed" and then
  // implemented `undefined || null` as absent — the old `x || []` behaviour
  // wearing the new rule's clothes. So the dangerous half of the round-20
  // family came straight back: a confident exit-12 NOTHING RAN on a document
  // that was never read. Playwright omits keys it has nothing for; it does not
  // null them.
  ...[
    ['specs', '{"suites":[{"specs":null}]}'],
    ['tests', '{"suites":[{"specs":[{"tests":null}]}]}'],
    ['results', '{"suites":[{"specs":[{"tests":[{"results":null}]}]}]}'],
  ].map(([field, json]) => [
    `a report where ${field} is null — CANNOT CHECK, never a verdict`,
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'null-report.json': json },
    15, 'not shaped like a Playwright report', { reportArg: 'null-report.json' },
  ]),

  // ── THE CARRIED MAPPING'S testsDir IS PART OF ITS SHAPE (#347 round 21) ──
  // Only `rows` was validated. `testsDir` goes straight to `realpathSync` and
  // `resolve()`, so a mapping missing it produced Node's ERR_INVALID_ARG_TYPE
  // at exit 1 with a stack trace instead of the exit-20 refusal this branch
  // promises. Validating the fields you happen to look at is the same partial
  // check as `x || []`.
  ...[
    ['missing', JSON.stringify({ rows: [{ name: 'desktop', width: 1440 }] })],
    ['null', JSON.stringify({ testsDir: null, rows: [{ name: 'desktop', width: 1440 }] })],
    ['a number', JSON.stringify({ testsDir: 42, rows: [{ name: 'desktop', width: 1440 }] })],
    ['empty', JSON.stringify({ testsDir: '', rows: [{ name: 'desktop', width: 1440 }] })],
  ].map(([what, json]) => [
    `a carried mapping whose testsDir is ${what} — exit 20, not a stack trace`,
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'declared.json': json },
    20, 'declared mapping from before the run could not be read',
    { declared: true, reportArg: 'report.json' },
  ]),

  // ── AN EMPTY NUMERIC BOUND (#347 round 21) ──────────────────────────────
  // Round 20's empty-value refusal covered the four PATH flags and stopped
  // there. The numeric ones are defeated harder by the same construction:
  // `Number('')` is 0, not NaN, so an empty bound slipped past the NaN guard
  // and REBANDED the config — every positive-width phone project reclassified
  // as tablet, reported as a missing phone declaration at exit 1. Reported for
  // `--tablet-min`; `--laptop-min` is the sibling that was not.
  ...[['--tablet-min'], ['--laptop-min']].map(([flag]) => [
    `${flag} with an empty value — refused, not read as 0`,
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    8, `${flag} was given with no value`, { extraArgs: [flag, ''] },
  ]),
  // The twin: a real bound still overrides, so the refusal above is about the
  // empty VALUE and not about the flag being present.
  ['a real --tablet-min still overrides the default',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE) },
    0, 'OVERRIDDEN on the command line', { extraArgs: ['--tablet-min', '700'] }],

  // ── ONLY PLAYWRIGHT'S OWN STATUSES COUNT (#347 round 22) ────────────────
  // The predicate was `r.status && r.status !== 'skipped'`, which counts any
  // truthy value. Codex certified three bands at exit 0 with
  // `"not-a-playwright-status"`; measuring the family found an OBJECT does it
  // too, and null/primitive elements were silently ignored rather than refused.
  // An unknown status is a report this gate does not understand, and the honest
  // answer to that is CANNOT CHECK, not a verdict.
  ...[
    ['a string Playwright never emits', '"not-a-playwright-status"'],
    ['an object', '{"a":1}'],
    ['a number', '7'],
    ['true', 'true'],
  ].map(([what, json]) => [
    `a result whose status is ${what} — CANNOT CHECK, never a verdict`,
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'odd-status.json': `{"suites":[{"specs":[{"tests":[{"projectName":"desktop","annotations":[],"results":[{"status":${json}}]}]}]}]}` },
    15, 'not shaped like a Playwright report', { reportArg: 'odd-status.json' },
  ]),
  ['a null result element — refused, not silently skipped',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'null-el.json': '{"suites":[{"specs":[{"tests":[{"projectName":"desktop","annotations":[],"results":[null]}]}]}]}' },
    15, 'not shaped like a Playwright report', { reportArg: 'null-el.json' }],
  // The twin, and it is what stops the four above being satisfiable by refusing
  // every report: every status Playwright DOES emit is still read.
  // ── THE GATE'S OWN SIDECAR IS A DISTINGUISHER (#347 round 22, P1) ───────
  // `--declared` exists so the post-run join uses the widths the config declared
  // BEFORE the run (round 14). But the pre-run pass imports the config while the
  // sidecar is ABSENT and then writes it, so Playwright imports the same config
  // while it is PRESENT — and a config that reads it declares one thing to the
  // check and another to the run. The carried mapping, whose whole purpose is to
  // be the pre-run truth, becomes the lie.
  //
  // Round 21's gate returned the carried mapping without re-importing, so this
  // fixture certified all three bands at exit 0. The post-run pass now imports
  // again and the two declarations must AGREE.
  //
  // The widths are SHUFFLED rather than narrowed on purpose: narrowing all three
  // to 390 is caught by the ordinary band check, which would make this case pass
  // for a reason that has nothing to do with the cross-check.
  ['a config that reads the --declared sidecar — caught by the cross-check',
    { 'playwright.config.js':
        `import fs from 'fs';\n`
        + `${IMPORT}`
        + `const seen = fs.existsSync(new URL('declared.json', import.meta.url));\n`
        + `export default defineConfig({\n  testDir: './tests',\n  projects: [\n`
        + `    { name: 'A', use: { viewport: { width: seen ? 390 : 1440, height: 900 } } },\n`
        + `    { name: 'B', use: { viewport: { width: 810, height: 1080 } } },\n`
        + `    { name: 'C', use: { viewport: { width: seen ? 1440 : 390, height: 664 } } },\n`
        + `  ],\n});\n`,
      'tests/gate.spec.js': SPEC },
    21, 'declared different widths before and after the run',
    { preDeclare: true, runReport: true, declared: true }],
  // The twin: the same shape WITHOUT the state dependence must still pass, or
  // the case above would be satisfied by refusing every carried mapping.
  ['…and a config that does not read it still passes the cross-check',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'tests/gate.spec.js': SPEC },
    0, 'check-ui-viewports: OK — SCHEDULED',
    { preDeclare: true, runReport: true, declared: true }],

  // ── ANNOTATIONS DECIDE EXCLUSION, SO THEIR SHAPE MATTERS (#347 round 23) ─
  // `Array.isArray(x) ? x : []` read a present non-array as absent — the same
  // `x || []` behaviour rounds 20 and 21 removed everywhere else, left in the
  // one place where the value decides whether a result counts as evidence.
  ...[
    ['result', '{"status":"passed","annotations":{}}', 'result.annotations'],
    ['test', '{"status":"passed"}', 'test.annotations'],
  ].map(([where, result]) => [
    `${where}-level annotations present but not an array — CANNOT CHECK`,
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'ann.json': `{"suites":[{"specs":[{"tests":[{"projectName":"desktop","annotations":{},"results":[${result}]}]}]}]}` },
    15, 'not shaped like a Playwright report', { reportArg: 'ann.json' },
  ]),

  // ── A SEARCH MAY STOP EARLY; A VALIDATION MAY NOT (#347 round 23) ───────
  // Round 22 put the result validation inside a `some()` predicate, which
  // short-circuits on the first qualifying element — so `[passed, null]`
  // certified three bands because the null was never reached.
  // ── REQUIRED IS NOT PRESENT-AND-VALID (#347 round 24) ──────────────────
  // `arr(undefined)` read an OMITTED `specs` as a legitimately empty suite, so a
  // malformed branch was skipped in silence beside a valid one and the gate
  // still returned a verdict. Measured against a real 1.62.1 report: every suite
  // carries `specs`; only nested `suites` is omitted when empty. Rounds 20-23
  // fixed one field per round — this is the schema instead of a fifth instance.
  ...[
    ['a suite omits specs', '{"suites":[{},{"specs":[{"tests":[{"projectName":"desktop","annotations":[],"results":[{"status":"passed"}]}]}]}]}',
      'suite.specs is missing'],
    ['a spec omits tests', '{"suites":[{"specs":[{}]}]}', 'spec.tests is missing'],
    ['a test omits results', '{"suites":[{"specs":[{"tests":[{"projectName":"desktop"}]}]}]}',
      'test.results is missing'],
  ].map(([what, json, needle]) => [
    `${what} — CANNOT CHECK, never a verdict`,
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE), 'req.json': json },
    15, needle, { reportArg: 'req.json' },
  ]),

  // ── THE JOIN KEY IS EVIDENCE TOO (#347 round 24) ───────────────────────
  // A missing or non-string `projectName` was coerced to '', which is the label
  // a legitimately UNNAMED project uses — so a malformed test could certify that
  // project's band on a key the report never carried.
  ...[
    ['missing', '{"suites":[{"specs":[{"tests":[{"results":[{"status":"passed"}]}]}]}]}'],
    ['a number', '{"suites":[{"specs":[{"tests":[{"projectName":7,"results":[{"status":"passed"}]}]}]}]}'],
    ['null', '{"suites":[{"specs":[{"tests":[{"projectName":null,"results":[{"status":"passed"}]}]}]}]}'],
  ].map(([what, json]) => [
    `a test whose projectName is ${what} — CANNOT CHECK`,
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE), 'proj.json': json },
    15, 'expected a string', { reportArg: 'proj.json' },
  ]),

  // ── ANNOTATION ENTRIES, NOT JUST THE CONTAINER (#347 round 24) ─────────
  // Round 23 validated the annotations ARRAY and stopped at its edge. A `null`,
  // a string or `{ type: 42 }` inside it read as a non-override, so a malformed
  // annotation silently turns exclusion OFF and a passed result certifies its
  // band. One field at a time, again — hence the schema above.
  ...[
    ['null', 'null'], ['a string', '"viewport-override"'], ['a non-string type', '{"type":42}'],
  ].map(([what, entry]) => [
    `an annotation entry that is ${what} — CANNOT CHECK`,
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'ann-el.json': `{"suites":[{"specs":[{"tests":[{"projectName":"desktop","annotations":[],"results":[{"status":"passed","annotations":[${entry}]}]}]}]}]}` },
    15, 'expected an object with a string type', { reportArg: 'ann-el.json' },
  ]),
  // ── TEST-LEVEL ANNOTATIONS ARE REQUIRED (#347 round 25) ────────────────
  // Round 24's schema said "OPTIONAL at BOTH levels" and cited round 8's
  // measurement two lines above it, which says the opposite: on the 1.44 floor
  // the key is absent from every RESULT while `tests[].annotations` CARRIES the
  // marker. The fallback exists because the per-result field is missing there —
  // the test-level one is what it falls back TO. Optional let a report omit the
  // field carrying `viewport-override` evidence and read as an empty list.
  ['a test omits annotations — CANNOT CHECK',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'noann.json': '{"suites":[{"specs":[{"tests":[{"projectName":"desktop",'
        + '"results":[{"status":"passed"}]}]}]}]}' },
    15, 'test.annotations is missing', { reportArg: 'noann.json' }],
  // The twin that keeps the requirement honest: the 1.44 SHAPE — test-level
  // present, per-result absent — is exactly what the fallback exists for and
  // must still read. Without this, requiring the field is satisfiable by
  // refusing the floor this kit still supports.
  ['the 1.44 shape still reads — test annotations present, per-result absent',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'v144.json': '{"suites":[{"specs":[{"tests":['
        + '{"projectName":"desktop","annotations":[],"results":[{"status":"passed"}]},'
        + '{"projectName":"tablet","annotations":[],"results":[{"status":"passed"}]},'
        + '{"projectName":"phone","annotations":[],"results":[{"status":"passed"}]}'
        + ']}]}]}' },
    0, 'check-ui-viewports: OK — SCHEDULED', { reportArg: 'v144.json' }],

  // ── EVERY LIST, NOT THE SELECTED ONE (#347 round 26) ───────────────────
  // Round 25 validated entries inside `overrides()`, which reads exactly ONE of
  // the two lists. So a modern report supplying `results[].annotations` had its
  // test-level array checked for being an array and its ENTRIES never read.
  ['test-level annotation entries with per-result lists present — CANNOT CHECK',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'both.json': '{"suites":[{"specs":[{"tests":['
        + '{"projectName":"desktop","annotations":[null],"results":[{"status":"passed","annotations":[]}]},'
        + '{"projectName":"tablet","annotations":[null],"results":[{"status":"passed","annotations":[]}]},'
        + '{"projectName":"phone","annotations":[null],"results":[{"status":"passed","annotations":[]}]}'
        + ']}]}]}' },
    15, 'an annotation in test.annotations is null', { reportArg: 'both.json' }],
  // The carrier Codex did not name, found by reproducing the one it did:
  // `overrides()` sat behind `r.status !== 'skipped' &&`, so a SKIPPED result's
  // own annotations were never validated. Same defect, second list.
  ['a skipped result\'s annotation entries — CANNOT CHECK',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'skipann.json': '{"suites":[{"specs":[{"tests":['
        + '{"projectName":"desktop","annotations":[],"results":['
        + '{"status":"skipped","annotations":[null]},{"status":"passed","annotations":[]}]},'
        + '{"projectName":"tablet","annotations":[],"results":[{"status":"passed","annotations":[]}]},'
        + '{"projectName":"phone","annotations":[],"results":[{"status":"passed","annotations":[]}]}'
        + ']}]}]}' },
    15, 'an annotation in result.annotations is null', { reportArg: 'skipann.json' }],
  // The twin for both: validating the unselected list must not mean REJECTING
  // it. A well-formed non-override test-level entry beside per-result lists
  // still certifies, so the two above are not satisfiable by refusing any
  // report that carries test-level annotations at all.
  ['a well-formed test-level entry beside per-result lists still certifies',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'bothok.json': '{"suites":[{"specs":[{"tests":['
        + '{"projectName":"desktop","annotations":[{"type":"slow"}],"results":[{"status":"passed","annotations":[]}]},'
        + '{"projectName":"tablet","annotations":[{"type":"slow"}],"results":[{"status":"passed","annotations":[]}]},'
        + '{"projectName":"phone","annotations":[{"type":"slow"}],"results":[{"status":"passed","annotations":[]}]}'
        + ']}]}]}' },
    0, 'check-ui-viewports: OK — SCHEDULED', { reportArg: 'bothok.json' }],

  // The twin: a WELL-FORMED override annotation is still honoured, so the three
  // above are not satisfiable by refusing every annotation.
  ['a well-formed viewport-override is still honoured',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'ok-ann.json': '{"suites":[{"specs":[{"tests":[{"projectName":"desktop","annotations":[],'
        + '"results":[{"status":"passed","annotations":[{"type":"viewport-override"}]}]}]}]}]}' },
    12, 'NOTHING RAN at that width', { reportArg: 'ok-ann.json' }],

  ['a malformed result AFTER a qualifying one — still refused',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'short.json': '{"suites":[{"specs":[{"tests":[{"projectName":"desktop",'
        + '"results":[{"status":"passed"},null]}]}]}]}' },
    15, 'not shaped like a Playwright report', { reportArg: 'short.json' }],

  // ── THE CROSS-CHECK MADE POST-RUN IMPORTABILITY A PREREQUISITE (r23) ────
  // Round 22 claimed it "preserves round 14's property exactly". It does not:
  // round 14's point was that the post-run pass depends on nothing the run can
  // touch, and a second import puts it back on the config still loading. A
  // suite that leaves the config unimportable now refuses, with its widths
  // unchanged. Kept as a refusal — a fallback would certify without
  // corroboration AND be the evasion — but the diagnostic has to say so.
  ['a config unimportable after the run — refused, and the diagnostic says why',
    { 'playwright.config.js': 'throw new Error("unimportable after the run");\n',
      'report.json': '{"suites":[{"specs":['
        + '{"tests":[{"projectName":"desktop","annotations":[],"results":[{"status":"passed"}]}]},'
        + '{"tests":[{"projectName":"tablet","annotations":[],"results":[{"status":"passed"}]}]},'
        + '{"tests":[{"projectName":"phone","annotations":[],"results":[{"status":"passed"}]}]}'
        + ']}]}' },
    5, 'the config is imported a SECOND time after',
    { declaredMap: DECLARED_MAP, reportArg: 'report.json' }],
  // The control: the same carried mapping and report with an importable config
  // reaches the verdict, so the case above is about importability alone.
  ['…and the same mapping and report with an importable config passes',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'report.json': '{"suites":[{"specs":['
        + '{"tests":[{"projectName":"desktop","annotations":[],"results":[{"status":"passed"}]}]},'
        + '{"tests":[{"projectName":"tablet","annotations":[],"results":[{"status":"passed"}]}]},'
        + '{"tests":[{"projectName":"phone","annotations":[],"results":[{"status":"passed"}]}]}'
        + ']}]}' },
    0, 'check-ui-viewports: OK — SCHEDULED',
    { declaredMap: DECLARED_MAP, reportArg: 'report.json' }],

  // ── THE FRESH ROWS ARE VALIDATED BEFORE THEY ARE COMPARED (r23) ────────
  // `asMap()` ran `.map()` in front of `decideFromRows`'s own validation, so a
  // config corrupting `Array.prototype.toJSON` crashed the comparison with an
  // uncaught TypeError. The nonce says who wrote the payload, never that it is
  // shaped like one — round 11's lesson, unapplied by the reader round 22 added.
  ['a post-run payload whose rows are not an array — CANNOT CHECK, not a crash',
    { 'playwright.config.js':
        `Array.prototype.toJSON = () => 'not-an-array';\n`
        + `${IMPORT}export default defineConfig({\n  testDir: './tests',\n  projects: [\n`
        + `${LAPTOP}${TABLET}${PHONE}  ],\n});\n`,
      'report.json': '{"suites":[{"specs":['
        + '{"tests":[{"projectName":"desktop","annotations":[],"results":[{"status":"passed"}]}]},'
        + '{"tests":[{"projectName":"tablet","annotations":[],"results":[{"status":"passed"}]}]},'
        + '{"tests":[{"projectName":"phone","annotations":[],"results":[{"status":"passed"}]}]}'
        + ']}]}' },
    14, 'a payload this gate cannot read', { declaredMap: DECLARED_MAP, reportArg: 'report.json' }],

  ['every real Playwright status is still accepted',
    { 'playwright.config.js': withProjects(LAPTOP + TABLET + PHONE),
      'real.json': '{"suites":[{"specs":['
        + '{"tests":[{"projectName":"desktop","annotations":[],"results":[{"status":"passed"}]}]},'
        + '{"tests":[{"projectName":"tablet","annotations":[],"results":[{"status":"failed"}]}]},'
        + '{"tests":[{"projectName":"phone","annotations":[],"results":[{"status":"timedOut"}]}]},'
        + '{"tests":[{"projectName":"phone","annotations":[],"results":[{"status":"interrupted"}]}]},'
        + '{"tests":[{"projectName":"phone","annotations":[],"results":[{"status":"skipped"}]}]}'
        + ']}]}' },
    0, 'check-ui-viewports: OK — SCHEDULED', { reportArg: 'real.json' }],

  // ── THE RECORDED LIMIT, PINNED AT EXIT 0 (#347 round 11, directives#349) ──
  // THIS CASE ASSERTS A FALSE GREEN, DELIBERATELY. The config selects nothing
  // (`grep` matches no title) and its exit handler then writes a report claiming
  // all three projects ran. The gate believes it.
  //
  // That is the standing limit: the report is written by the Playwright process,
  // the config runs IN that process, and there is no authenticated channel out of
  // a process you do not control. Every candidate mechanism either lives inside
  // the same process (hash it first, read stdout, run as a reporter, use
  // globalTeardown) or is an enumeration, and every enumeration on this PR was
  // walked around within one round.
  //
  // Pinned in the direction of STAYING a limit, the same way #347 round 1's argv
  // case was: if this ever starts being caught, someone added a mechanism nobody
  // reviewed, and the case turns red so it gets read. Flipping it to a refusal is
  // the deliverable of directives#349 — not a drive-by fix.
  //
  // Without the exit handler this fixture is exit 12 with all three bands named,
  // which is the case immediately after. The pair is what makes this one mean
  // "the rewrite was believed" rather than "the gate passed for some reason".
  ['a config REWRITING the run report — believed, and that is the recorded limit',
    { 'playwright.config.js': forgedReport(true), 'tests/gate.spec.js': SPEC },
    0, 'check-ui-viewports: OK — SCHEDULED', { runReport: true }],

  ['…the same config without the rewrite is exit 12, so the pass above IS the rewrite',
    { 'playwright.config.js': forgedReport(false), 'tests/gate.spec.js': SPEC },
    12, 'declared but NOTHING RAN', { runReport: true }],
];

// Writes a copy of the gate with the config-evaluation child's bound replaced.
// Kept in one place so the three cases above cannot disagree about what they are
// running, and asserted rather than assumed: a silent no-op substitution would
// leave them testing the shipped 120s bound and passing for the wrong reason —
// the fail-open shape this whole file exists to catch, inside its own harness.
function gateWithTimeout(ms) {
  const src = readFileSync(CHECK, 'utf8');
  const needle = 'const EVAL_TIMEOUT_MS = 120000;';
  if (!src.includes(needle)) {
    throw new Error(`check-ui-viewports-cases: cannot find \`${needle}\` in the gate — `
      + 'the config-evaluation bound was renamed or removed, and the timeout cases '
      + 'would otherwise pass without exercising it.');
  }
  // NOT inside the fixture directory, and NOT a `.js`. The fixture's
  // package.json declares "type": "module" so Node would load a `.js` copy as
  // ESM and the gate — which is CommonJS — dies on its first `require`, failing
  // the case for a reason that has nothing to do with the branch under test.
  // Measured, not predicted: the first attempt did exactly that.
  const dir = mkdtempSync(join(tmpdir(), 'ui-viewports-gate-'));
  const out = join(dir, 'gate-short-timeout.cjs');
  writeFileSync(out, src.replace(needle, `const EVAL_TIMEOUT_MS = ${ms};`));
  return { bin: out, dir };
}

function runCase(files, opts) {
  const o = opts || {};
  const tmp = mkdtempSync(join(tmpdir(), 'ui-viewports-'));
  const link = join(tmp, 'node_modules');
  let bin = CHECK;
  let binDir = null;
  const cleanupLinks = [];
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
    if (o.shortTimeout) { const g = gateWithTimeout(o.shortTimeout); binDir = g.dir; bin = g.bin; }
    let args = o.env
      ? [bin]
      : [bin, '--tests-dir', o.relativeTestsDir ? relative(REPO_ROOT, target) : target];
    // A RELATIVE --config is left relative: the point of that case is which base
    // the gate resolves it against, and joining it to tmp here would make it
    // absolute and test nothing.
    if (o.configArg) args.push('--config', o.configArgRelative ? o.configArg : join(tmp, o.configArg));
    // Extra flags verbatim, for the band-bound cases (#347 round 12).
    if (o.extraArgs) args.push(...o.extraArgs);
    // The declared-mapping sidecar lives in the fixture dir (#347 round 14).
    // opts.declaredMap writes it HERE rather than in the files map, because its
    // `testsDir` has to be the real fixture path: the post-run report is resolved
    // against it, and a static '.' resolves against the harness's cwd instead
    // (#347 round 23).
    if (o.declaredMap) {
      writeFileSync(join(tmp, 'declared.json'),
        JSON.stringify({ testsDir: target, rows: o.declaredMap }));
    }
    if (o.declared || o.declaredMap) args.push('--declared', join(tmp, 'declared.json'));
    // A path whose PARENT does not exist — the shipped default's shape on a
    // clean runner (#347 round 15).
    if (o.declaredNested) args.push('--declared', join(tmp, 'no', 'such', 'dir', 'declared.json'));
    // A report path that is itself a flag name — a legal filename (#347 r16).
    if (o.reportIsFlagName) args.push('--report', '--tablet-min');
    if (o.declaredMissing) args.push('--declared', join(tmp, 'absent.json'));
    // opts.runReport: RUN the suite first, then check its report. Since #335's
    // second design the coverage claim comes from the run's own JSON report, so
    // a case about execution has to produce one — nothing before the run can
    // answer whether a scenario reached a width.
    //
    // `--reporter=json` REPLACES the config's reporters, which is exactly right
    // for a fixture whose reporters are incidental and exactly wrong for one
    // that is ABOUT a reporter. Those set opts.ownReporter and declare a json
    // reporter of their own alongside the reporter under test.
    // opts.preDeclare: run the WHOLE composite sequence — the pre-run
    // declaration pass, then Playwright, then the post-run check — because a
    // config that answers differently across the run cannot be exercised by a
    // single invocation. The sidecar's existence is the state that changes, and
    // it changes because THIS pass writes it (#347 round 22).
    //
    // SINCE #352, `--report` REQUIRES `--declared`, so a case that checks a
    // report runs the composite's own three-step sequence by default: the
    // pre-run declaration pass, Playwright, then the post-run check. That is not
    // a concession to the new rule — it is the arrangement CI has always used,
    // and the old `--report`-only invocation was a shape no shipped caller had.
    //
    // opts.noDeclared opts out, for the cases that are ABOUT the mapping being
    // absent or unreadable. Those must keep reaching their own refusals rather
    // than being rewritten into the happy path.
    // EVERY case that hands the gate a report, not just the ones that RUN one.
    // The synthetic-report cases -- the malformed shapes, the status table, the
    // annotation entries -- pass `--report` with a hand-written file, which is
    // the same unsupported shape. They get their mapping from the pre-run pass
    // over their OWN config rather than from a shared literal, because several
    // of them declare non-standard project names on purpose and a hardcoded
    // mapping would silently join against the wrong ones.
    const bearsReport = o.runReport || o.reportArg !== undefined
      || o.reportEq !== undefined || o.reportIsFlagName;
    // `o.declared` is excluded too: a case setting it is SUPPLYING its own
    // mapping -- often a deliberately broken one, written through the files map
    // to reach the exit-20 refusal. Running the pre-run pass over those would
    // overwrite the fixture with a valid mapping and quietly retarget the case.
    const composite = bearsReport && !o.noDeclared && !o.declared && !o.declaredMap
      && !o.declaredMissing && !o.declaredNested;
    if (o.preDeclare || composite) {
      spawnSync(process.execPath, [bin, '--tests-dir', target, '--declared', join(tmp, 'declared.json')],
        { encoding: 'utf8', env, cwd: REPO_ROOT, timeout: 60000, killSignal: 'SIGKILL' });
      if (composite && !args.includes('--declared')) {
        args.push('--declared', join(tmp, 'declared.json'));
      }
    }
    if (o.runReport) {
      const runArgs = o.ownReporter ? ['playwright', 'test'] : ['playwright', 'test', '--reporter=json'];
      // PLAYWRIGHT_JSON_OUTPUT_NAME rather than capturing stdout. A config is
      // code and may print: a fixture that logs during evaluation lands in the
      // captured stream ahead of the JSON and the parse fails, so the case would
      // measure the harness instead of the gate. Playwright writes the file
      // itself, which is also what the shipped kit's `outputFile` does — so the
      // cases exercise the same arrangement CI uses.
      //
      // AND _FILE OUTRANKS _NAME, so an inherited one steals every fixture's
      // report. This is the round-18 action.yml finding pointed at the harness
      // that measured it: a QA job or a developer shell exporting
      // PLAYWRIGHT_JSON_OUTPUT_FILE sends all of these to that path, `report.json`
      // is never written, and every runReport case reports exit 15 — the suite
      // then measures the shell instead of the gate (Codex, #347 round 19).
      // _DIR goes too: these fixtures run under `--reporter=json` with no
      // configured `outputFile`, which is exactly the case where _DIR applies.
      const runEnv = { ...env, PWD: target, PLAYWRIGHT_JSON_OUTPUT_NAME: 'report.json' };
      delete runEnv.PLAYWRIGHT_JSON_OUTPUT_FILE;
      delete runEnv.PLAYWRIGHT_JSON_OUTPUT_DIR;
      spawnSync('npx', runArgs, {
        cwd: target, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
        env: runEnv,
      });
      args.push('--report', 'report.json');
    }
    // opts.reportArg passes --report WITHOUT running anything: the cases that
    // exercise the read's own failures need a path the gate cannot use, and
    // running a suite first would only obscure which read failed.
    if (o.reportArg !== undefined) args.push('--report', o.reportArg);
    // The `--flag=value` spelling, which the env guard accepts.
    if (o.reportEq !== undefined) args.push(`--report=${o.reportEq}`);
    // BOUNDED, AND WITH A KILL THE GATE CANNOT INTERCEPT. The thing under test
    // is a program whose own job is to not hang; if it regresses, this suite
    // must FAIL rather than stall a CI job to its bound and report nothing —
    // the same shape, one level up. 60s is ~50x the slowest honest case.
    // A SYMLINKED TESTS DIRECTORY, ENTERED LOGICALLY — what a shell does and what
    // every other case here cannot express, because the harness passes an
    // ABSOLUTE --tests-dir and the composite passes `.`. Node reports cwd
    // PHYSICALLY, so `resolve('.')` recovered the real target while Playwright
    // inherited the shell's logical PWD, and the two read different configs
    // (#347 round 28). Spawning with cwd set to the LINK and PWD exported to it
    // is exactly the shell's state.
    let spawnCwd = REPO_ROOT;
    let spawnEnv = env;
    if (o.symlinkCwd) {
      const logical = `${tmp}-link`;
      symlinkSync(tmp, logical, 'dir');
      cleanupLinks.push(logical);
      spawnCwd = logical;
      spawnEnv = { ...env, PWD: logical };
      args = args.map(a => (a === tmp ? '.' : a));
    }
    const r = spawnSync(process.execPath, args, {
      encoding: 'utf8', env: spawnEnv, cwd: spawnCwd, timeout: 60000,
      killSignal: 'SIGKILL',
    });
    if (r.error && r.error.code === 'ETIMEDOUT') {
      return { code: 'TIMED OUT', out: 'the gate did not return within 60s and was killed' };
    }
    return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
  } finally {
    // Unlink the symlink explicitly before the recursive remove — nothing about
    // this self-test should ever be able to reach the real node_modules.
    if (existsSync(link) || safeIsLink(link)) unlinkSync(link);
    for (const l of cleanupLinks) { try { unlinkSync(l); } catch { /* already gone */ } }
    rmSync(tmp, { recursive: true, force: true });
    if (binDir) rmSync(binDir, { recursive: true, force: true });
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
  } else if ((opts && opts.mustNotSay || []).some(bad => out.includes(bad))) {
    // WHAT THE VERDICT MUST NOT SAY, asserted as directly as what it must.
    // Seven rounds of this PR found a stale EXECUTED claim somewhere (3, 6, 8,
    // 9, 17, 18, 19), and every fix so far was a person reading. This is the one
    // carrier a machine can hold: the gate's OWN OUTPUT, checked for the word it
    // withdrew. It does not reach the prose in test.md, CLAUDE.md or the shipped
    // config — nothing here does, and `check-claims.js` structurally cannot,
    // since it proves a phrasing TRAVELLED and never that no other line
    // contradicts it. One carrier pinned is not the class closed.
    const said = (opts.mustNotSay || []).filter(bad => out.includes(bad));
    failures.push(`${label}\n      exited ${code} with the right reason, but the output still says`
      + ` ${JSON.stringify(said)}.\n      ${out}`);
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
