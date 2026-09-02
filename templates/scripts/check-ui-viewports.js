'use strict';
// check-ui-viewports.js — does the installed Playwright config actually declare a
// laptop, a tablet and a phone? (test.md -> UI coverage gates, fifth gate.)
//
// WHY THIS SHAPE. Three static readers were tried; all three failed, twelve
// findings between them (#280, #281, #282), and EVERY failure mode was SILENT —
// a check that goes quiet when it fails reads as having looked. The findings were
// all one thing: a regex approximating what Playwright resolves.
//   * `{ viewport: {width:1440}, ...devices['Pixel 5'] }` runs at 393, not 1440.
//   * commented-out projects counted as coverage.
//   * `devices["iPad …"]` double-quoted; `projects : [` with a space.
// `npx playwright test --list --reporter=json` was MEASURED and ruled out too: it
// exits 0 with 0 specs when TEST_AUTH_CREDENTIAL is unset (the same silent pass),
// and reports `viewport: null` for every project even when all 102 specs
// enumerate — so it cannot answer this question at all (apfp.claude, 2026-08-23).
// A third reason found 2026-08-27: `--reporter=json` REPLACES the config's
// reporters rather than adding to one, so a custom reporter's preprocess() never
// runs under that command. Measured on 1.62.1 — a config whose reporter excludes
// every test listed all three projects and exited 0 with the flag, and exited 1
// having excluded 3 tests without it. Any future rewrite that shells out to
// `--list` must NOT override the reporter, or it reproduces the very false green
// it was written to catch. (templates/actions/ui-suite/action.yml already carries
// this warning for the test run itself; it applies identically to listing.)
//
// So: IMPORT the config and let Node evaluate it. Spread order, quoting, comments
// and the device table all stop mattering, because JavaScript does the resolving.
// That answers WHICH WIDTHS ARE DECLARED, and it is the half of this gate that
// has always worked.
//
// It cannot answer whether anything RUNS at those widths, and #335 records eight
// review rounds and twenty findings from trying — every one a rule correct for
// the example that motivated it and wrong one step out. "Empty" alone had three
// spellings, found one per round. Playwright decides what runs from testDir plus
// testMatch/testIgnore plus grep/grepInvert plus respectGitIgnore plus nested
// .gitignore contents plus shard plus reporter preprocessing plus per-project
// overrides — version-dependent, two of them arbitrary user code, and the config
// object is itself a function of the environment it is evaluated in.
//
// So the second half stops predicting and ASKS: `playwright test --list`, with
// the config's own reporters left in place, in the same environment the suite
// runs in. See `observe()` below for how, and for what it refuses. A band is
// covered when a project at that width turns up in what Playwright actually
// enumerated — declared AND observed, joined in the parent process.
//
// ⚠️ WHAT THE OBSERVATION CANNOT SEE, and it is one thing rather than a family.
// A listing is not the run: it carries `--list` in `process.argv`, and a config
// is arbitrary code that may read that. Measured — a config applying a
// non-matching `grep` UNLESS argv contains `--list` discovers nothing in the real
// run and everything here, and this gate reports OK. No arrangement of `--list`
// closes that, because the flag is what makes it a listing.
//
// It is NOT the same shape as the twenty findings #335 catalogued. Those were
// ordinary mechanisms — a `.gitignore`, a per-project override, a symlink, a
// shard, a reporter — that an honest config uses and a config read could not
// follow. This one requires the config to branch on how it is being inspected.
// Closing it needs a different mechanism (observing the RUN, which needs browsers
// and minutes, or comparing the config's own evaluation across argv shapes), and
// that trade belongs to whoever needs it rather than to a fourth predicate here.
// Pinned by a case in the direction of STAYING a limit, so if it ever starts
// being caught, someone changed something nobody reviewed.
//
// SILENCE MEANS "CHECKED AND FINE", NEVER "COULD NOT LOOK". Every failure has its
// own exit code and its own printed line:
//   0  three classes declared AND observed to discover tests (#335)
//   1  checked — a class is undeclared (the gate FAILED)
//   2  tests dir not found
//   3  no Playwright config in the tests dir
//   4  @playwright/test not resolvable from the config (CANNOT CHECK)
//   5  importing the config threw, or its export is unusable (CANNOT CHECK)
//   6  zero projects resolved
//   7  reached exit 0 without a verdict — the backstop (a config that calls
//      process.exit(0) at import time would otherwise pass silently)
//   8  usage error (nonsensical band bounds)
//   9  RETIRED by #335 — a top-level selection key used to be refused on
//      presence alone. Stage two observes whether it narrows anything.
//  10  RETIRED by #335 — a non-built-in reporter used to be refused by name.
//      Stage two runs the listing with the config's own reporters intact.
//  11  RETIRED by #335 — the built-in reporter list is no longer consulted.
//  12  a band is DECLARED at the right width and Playwright discovers NO test
//      for it (the gate FAILED) — distinct from 1, which is a band no project
//      declares at all. Under #333 this code meant "cannot attribute"; it now
//      means an observed absence, which is a stronger statement, not a weaker one
//  13  PW_TEST_SOURCE_TRANSFORM and _SCOPE are both set (CANNOT CHECK) —
//      Playwright transforms the config as it loads it, so a plain import()
//      reads a different object than the run does
//  14  the config evaluation reported no verdict, or a pass its own data or its
//      exit status does not support (CANNOT CHECK)
//  15  the listing could not be run at all (CANNOT CHECK)
//  16  the listing ran and produced no inventory to read (CANNOT CHECK) — a
//      `--list` that prints nothing is "could not look", never "no tests"
//  17  the config behaved differently when a reporter was appended to read the
//      inventory past its own (CANNOT CHECK) — it responded to being observed
//  18  more than one project has no "name" (CANNOT CHECK) — the listing prints
//      an unnamed project's tests unprefixed, so two of them cannot be told
//      apart and a band would be certified by another project's tests
//
// The three RETIRED codes are kept in this list rather than deleted. They were
// documented exits of a shipped gate, and a reader meeting one in an old CI log
// needs to find out what it meant and why it stopped happening.
// node_modules is environment-provided, not repo-guaranteed: in CI it exists
// because the ui-suite composite ran `npm install` first. Its absence is 4 — a
// loud "cannot check", never a pass.
//
// CommonJS deliberately: the other templates/scripts helpers are CJS
// (notify-email.js, check-contrast.js), and a downstream .github/scripts/package.json
// (the copy of templates/scripts/package.json) carries no "type" field, so an ESM
// .js dropped there would not load at all. Dynamic import() of an ESM config from
// CJS works on Node 20+.
//
// Usage:
//   node .github/scripts/check-ui-viewports.js --tests-dir .github/scripts/ui-tests
//   UI_TESTS_DIR=... node .github/scripts/check-ui-viewports.js
// Options: --config <path>, --tablet-min <px> (768), --laptop-min <px> (1024)

const { existsSync, statSync, mkdtempSync, writeFileSync, readFileSync, rmSync } = require('fs');
const { createRequire } = require('module');
const { pathToFileURL } = require('url');
const { resolve, join, isAbsolute, dirname, basename } = require('path');
const { tmpdir } = require('os');

// ============================================================================
// THE VERDICT LIVES OUTSIDE THE PROCESS THAT IMPORTS THE CONFIG.
//
// A Playwright config is arbitrary JavaScript, and this gate imports it. Round
// 15 found a config that set `process.exit = () => {}` and turned its own gate
// green; I bound the reference and said plainly that this was a patch and not
// isolation. Round 16 then found `process.on('exit', () => { process.exitCode =
// 0 })`, which the bound EXIT still invokes — same false green, one primitive
// further out. Capturing primitives one at a time is the enumerate-vs-derive
// failure this whole PR is about, applied to my own runtime.
//
// So the config is now evaluated in a CHILD process, and the child reports its
// verdict through a file the parent created. The parent never imports the
// config, so nothing the config does can reach the exit path that decides pass
// or fail. If the child dies without writing a verdict — crash, signal, an exit
// the config forced — the parent has no verdict to report and says so (exit 14),
// which is this file's founding rule applied to its own plumbing: a missing
// answer is never a passing one.
//
// This is the "remove the thing that can be wrong" move that has held three
// times on this PR, rather than a fourth captured primitive.
// ============================================================================
// ============================================================================
// OBSERVING DISCOVERY. Runs in the PARENT, which never imports the config.
//
// `npx playwright test --list` answers the question a config read cannot, and
// #335 records why every static answer failed. Three constraints shape this:
//
//   1. NO `--reporter` FLAG. A CLI reporter REPLACES the config's list rather
//      than adding to it, so a custom reporter's preprocess() never runs and the
//      listing reports tests that will not execute. Measured on 1.62.1: a config
//      whose reporter excludes every test listed all three projects and exited 0
//      WITH the flag, and listed zero WITHOUT it. Overriding the reporter here
//      would reproduce the exact false green this stage exists to catch.
//   2. THE LISTING MUST BE READABLE. A custom reporter replaces the built-in
//      `list` reporter, so `--list` prints nothing at all — and a no-op custom
//      reporter is indistinguishable from one that excluded everything, both
//      silent. So a WRAPPER config re-exports the user's config with `['list']`
//      APPENDED to whatever reporters it already declares. Appending keeps every
//      preprocess() running (measured: an excluding reporter still yields
//      `Total: 0 tests`) while restoring an inventory to read.
//   3. NO ANSWER IS NOT A PASS. If the listing cannot run, or runs without
//      producing its `Total:` trailer, this is CANNOT CHECK and exits loudly.
//
// The wrapper is written BESIDE the config, so every relative path in it —
// testDir, reporter module paths — resolves exactly as it does for the real run,
// and it is `.mjs` so its own module system is not in question. That last point
// was a bug first: deriving the wrapper's format from the config's EXTENSION is
// a prediction, and it was wrong on the first real config it met, because
// templates/ui-tests/package.json carries "type": "module". `.mjs` is ESM under
// every resolver rule and ESM can import a CommonJS config through its default
// export, so one form covers CJS, ESM and TypeScript configs alike — all three
// measured.
// ============================================================================
function observe(configPath, testsDir) {
  const { spawnSync } = require('child_process');
  if (typeof configPath !== 'string' || typeof testsDir !== 'string') {
    return { ok: false, code: 15, lines: ['the evaluation did not report which config to observe'] };
  }

  // 64 MiB. spawnSync's default maxBuffer is 1 MiB and every test prints once
  // PER SELECTED PROJECT, so a few thousand tests across three viewport projects
  // reaches it — and the child is then killed with ENOBUFS, which this gate would
  // report as "could not observe" on a suite Playwright lists and runs fine. A
  // size-dependent refusal is the worst kind: it appears when a suite grows.
  const MAX_BUFFER = 64 * 1024 * 1024;
  const list = (extraArgs) => {
    const args = ['playwright', 'test', '--list', ...extraArgs];
    // PWD IS SET EXPLICITLY, and it is load-bearing. spawnSync's `cwd` does not
    // update PWD in the child, so the listing inherited whatever PWD this process
    // was started with — and Playwright reads PWD during discovery. Measured on
    // the symlinked-tests-dir fixture: PWD inherited, or deleted, or set to the
    // PHYSICAL path all discover ZERO tests, while PWD set to the LOGICAL tests
    // dir discovers all of them. The gate already knew this — round 15 of #333
    // fixed its own chdir for it — and this spawn shipped without the same
    // treatment, the one-path-not-its-twin shape #346 counted four times.
    const r = spawnSync('npx', args, { cwd: testsDir, encoding: 'utf8',
      timeout: 120000, maxBuffer: MAX_BUFFER, env: { ...process.env, PWD: testsDir } });
    const out = `${r.stdout || ''}`;
    // THE TRAILER IS THE PROOF THE LISTING HAPPENED. `--list` exits 0 having
    // printed nothing when a custom reporter replaces the built-in `list` one,
    // and exits 0 with zero specs when an environment variable the config reads
    // is unset — both silent passes if absence were read as "no tests". Only
    // `Total: N` is evidence that Playwright enumerated and reported.
    const m = /^Total: (\d+) test/m.exec(out);
    const projects = new Set();
    for (const line of out.split('\n')) {
      const p = /^\s+\[([^\]]+)\]\s+›/.exec(line);
      if (p) { projects.add(p[1]); continue; }
      // A PROJECT MAY HAVE NO NAME, and Playwright's list reporter then emits its
      // tests with no `[project] ›` prefix at all. Dropping those lines made the
      // gate report a band undiscovered for a config Playwright lists in full.
      // The declaration stage calls such a project `(unnamed)`, so this does too
      // — the two sides have to agree on the label or the join cannot match.
      if (/^\s+\S+:\d+:\d+\s+›/.test(line)) projects.add('(unnamed)');
    }
    return { r, out, total: m ? Number(m[1]) : null, projects };
  };

  // ── STEP ONE: THE CONFIG EXACTLY AS THE RUN SEES IT ──────────────────────
  // No wrapper, nothing appended, `config.reporter` untouched. For every config
  // whose reporters do not swallow the listing — which is every built-in-reporter
  // config, so the fleet — this is the whole observation, and it is as faithful
  // as a listing can be.
  // POINTED AT THE CONFIG THIS GATE RESOLVED, not at whatever Playwright would
  // find in cwd. Dropping this argument was a regression caught by two existing
  // cases: with the config in its own directory, a bare `--list` found no config
  // at all and observed zero tests, so the gate failed a suite that runs. The
  // declaration stage and the observation must describe the SAME file or the join
  // is between two different configs.
  const plain = list(['--config', configPath]);
  if (plain.r.error) {
    const enobufs = plain.r.error.code === 'ENOBUFS';
    return { ok: false, code: 15, lines: [
      enobufs
        ? `the listing produced more than ${MAX_BUFFER} bytes and was truncated`
        : `could not run the listing: ${plain.r.error.message}`,
    ] };
  }
  if (plain.total !== null) {
    return { ok: true, total: plain.total, projects: [...plain.projects], wrapped: false };
  }

  // ── STEP TWO: ONLY WHEN THE CONFIG'S OWN REPORTERS HID THE ANSWER ────────
  // A custom reporter REPLACES the built-in `list` reporter, so `--list` prints
  // nothing — and a reporter that merely stays quiet is indistinguishable from
  // one that excluded every test. Both silent, one of them a pass.
  //
  // So, and only here, a wrapper config re-exports the user's config with
  // `['list']` APPENDED. Appending keeps every preprocess() running while
  // restoring an inventory to read. It is written BESIDE the config so relative
  // paths resolve identically, and it is `.mjs` so its own module system is not
  // in question — deriving that from the config's extension was a prediction and
  // it was wrong on the first real config it met, because
  // templates/ui-tests/package.json carries "type": "module".
  const wrapper = join(dirname(configPath), `.ui-viewports-observe.${process.pid}.mjs`);
  const rel = './' + basename(configPath);
  // A bare string reporter is normalised to a tuple: Playwright rejects a loose
  // string INSIDE the array form (`config.reporter[0] must be a tuple`).
  const body = `import base from ${JSON.stringify(rel)};\n`
    + 'const cfg = base && base.default ? base.default : base;\n'
    + 'const r = cfg.reporter;\n'
    + "const list = r === undefined ? [['list']]\n"
    + "  : typeof r === 'string' ? [[r], ['list']]\n"
    + "  : Array.isArray(r) ? [...r, ['list']]\n"
    + "  : [r, ['list']];\n"
    + 'export default { ...cfg, reporter: list };\n';
  let wrapped;
  try {
    writeFileSync(wrapper, body, 'utf8');
    wrapped = list(['--config', wrapper]);
  } catch (e) {
    return { ok: false, code: 15, lines: [`could not run the listing: ${(e && e.message) || e}`] };
  } finally {
    try { rmSync(wrapper, { force: true }); } catch { /* best effort; nothing reads it again */ }
  }
  if (wrapped.r.error) {
    const enobufs = wrapped.r.error.code === 'ENOBUFS';
    return { ok: false, code: 15, lines: [
      enobufs
        ? `the listing produced more than ${MAX_BUFFER} bytes and was truncated`
        : `could not run the listing: ${wrapped.r.error.message}`,
    ] };
  }

  // ── THE WRAPPER MUST NOT HAVE CHANGED THE ANSWER ─────────────────────────
  // Appending a reporter is not invisible: `preprocess()` receives the resolved
  // config, so a reporter can branch on `config.reporter` itself. Codex built one
  // that excludes every test only when it is the SOLE reporter — the real run
  // discovers nothing, the wrapped listing discovers everything, and this gate
  // certified a suite that runs zero scenarios.
  //
  // Comparing the two runs' EXIT STATUS catches that without knowing how the
  // config noticed. The plain run and the wrapped run must agree about whether
  // Playwright found anything; when they disagree, the config responded to being
  // observed and no listing here describes the real run. That is a refusal, not a
  // verdict — the same rule as everywhere else in this file: a thing that changed
  // under inspection has not been inspected.
  //
  // The legitimate case still works: a reporter that excludes every test without
  // branching fails BOTH runs (Playwright reports "No tests found", exit 1), the
  // statuses agree, and the wrapped inventory reports `Total: 0` — exit 12.
  if (plain.r.status !== wrapped.r.status) {
    return { ok: false, code: 17, lines: [
      'the config behaved DIFFERENTLY when a reporter was appended to it',
      `  listing with your reporters alone: exit ${plain.r.status}`,
      `  listing with 'list' appended:      exit ${wrapped.r.status}`,
      '  Appending a reporter is the only way to read an inventory past a reporter',
      '  that replaces the built-in one, and a reporter can branch on the resolved',
      '  config it is handed. This config did something different when it was',
      '  observed, so nothing observed here describes the run.',
    ] };
  }
  if (wrapped.total === null) {
    const err = `${wrapped.r.stderr || ''}`.trim().split('\n').slice(0, 4);
    return { ok: false, code: 16, lines: [
      'the listing produced no "Total:" line, so nothing was enumerated to read',
      `  exit status: ${wrapped.r.status}${wrapped.r.signal ? ` (signal ${wrapped.r.signal})` : ''}`,
      ...err.map(l => `  ${l}`),
    ] };
  }
  return { ok: true, total: wrapped.total, projects: [...wrapped.projects], wrapped: true };
}

const VERDICT_FILE = process.env.__UI_VIEWPORTS_VERDICT_FILE;
if (!VERDICT_FILE) {
  const { spawnSync } = require('child_process');
  const box = mkdtempSync(join(tmpdir(), 'ui-viewports-verdict-'));
  const file = join(box, 'verdict.json');
  let child;
  try {
    child = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: { ...process.env, __UI_VIEWPORTS_VERDICT_FILE: file },
    });
  } finally {
    // read before cleanup, so a throw in spawnSync still leaves nothing behind
  }
  let recorded = null;
  try { recorded = JSON.parse(readFileSync(file, 'utf8')); } catch { /* handled below */ }

  // A RECORDED SUCCESS NEEDS A CLEAN EXIT TO CORROBORATE IT. The child writes
  // its verdict and then keeps running until the event loop drains, so a config
  // that schedules a delayed throw crashes AFTER record(0) — Codex round 17
  // reproduced a three-band config with a 200ms timer that threw: the child
  // printed an uncaught exception and exited 1, and this parent reported 0.
  //
  // A recorded FAILURE needs no such corroboration: the child had already decided
  // to refuse, and a crash afterwards does not make the config acceptable. Only
  // the pass is upgraded from "was written" to "was written and nothing else went
  // wrong", which is the same asymmetry as everywhere else in this file — a
  // refusal may stand on partial evidence, a certification may not.
  if (recorded && recorded.code === 0 && (child.signal || child.status !== 0)) {
    console.error('CANNOT CHECK: the config evaluation recorded a pass and then failed.');
    console.error(child.signal
      ? `  it was killed by ${child.signal} after writing its verdict`
      : `  it exited ${child.status} after writing its verdict`);
    console.error('  Something in the config was still running after the gate finished —');
    console.error('  a scheduled throw, an unhandled rejection, a handler that failed.');
    console.error('  A pass is only accepted when the evaluation also ended cleanly.');
    console.error('check-ui-viewports: FAIL (code 14)');
    process.exit(14);
  }
  // THE PARENT RE-DECIDES THE BAND VERDICT FROM THE CHILD'S DATA. The child's
  // own code for this can be corrupted by the config (round 18), so its answer is
  // not taken on trust where this process can compute the same thing with clean
  // intrinsics. Only a recorded 0 is re-checked: a refusal already refuses, and
  // the parent has no reason to overturn one.
  if (recorded && recorded.code === 0) {
    let rows = null;
    try { rows = JSON.parse(readFileSync(`${file}.rows`, 'utf8')); } catch { /* below */ }
    const bands = ['laptop', 'tablet', 'phone'];
    const ok = rows && Array.isArray(rows.rows) && rows.cover
      && bands.every(b => Array.isArray(rows.cover[b]) && rows.cover[b].length > 0);
    if (ok) {
      // ── STAGE TWO: OBSERVE, do not predict ────────────────────────────────
      // Everything above establishes what the config DECLARES. It cannot
      // establish what Playwright will DISCOVER, and eight rounds of trying
      // produced twenty findings, each a rule correct for its example and wrong
      // one step out (#335). So this stage stops reasoning about selection and
      // asks Playwright, then joins the two answers: a band is covered when a
      // project at that width actually turns up in the listing.
      const obs = observe(rows.configPath, rows.testsDir);
      if (!obs.ok) {
        console.error('CANNOT CHECK: could not observe what Playwright discovers.');
        for (const line of obs.lines) console.error(`  ${line}`);
        console.error('  A listing that did not happen is NOT a pass — the gate can say what the');
        console.error('  config declares and nothing about what runs, so it refuses.');
        console.error(`check-ui-viewports: FAIL (code ${obs.code})`);
        rmSync(box, { recursive: true, force: true });
        process.exit(obs.code);
      }
      const seen = new Set(obs.projects);
      const missing = bands.filter(b => !rows.cover[b].some(n => seen.has(n)));
      if (missing.length) {
        for (const b of missing) {
          console.error(`FAIL: ${b} is declared but Playwright discovers no test for it.`);
          console.error(`  declared by: ${rows.cover[b].join(', ')}`);
        }
        console.error(`  Playwright listed ${obs.total} test(s) across: ${obs.projects.join(', ') || '(no project)'}`);
        console.error('  This is an OBSERVED result, not an inference from the config: the widths');
        console.error('  are declared correctly and no scenario reaches them. Something between');
        console.error('  the config and discovery removes them — a filter, an ignore rule, a');
        console.error('  shard, a reporter. This gate does not need to know which.');
        console.error('  test.md -> UI coverage gates, fifth gate.');
        rmSync(box, { recursive: true, force: true });
        process.exit(12);
      }
      const where = b => rows.cover[b].filter(n => seen.has(n)).join('/');
      console.log(`check-ui-viewports: OK — OBSERVED laptop:${where('laptop')}  tablet:${where('tablet')}  phone:${where('phone')}`);
      console.log(`  (${obs.total} test(s) discovered across ${obs.projects.join(', ')} — asked Playwright, not inferred)`);
    }
    if (!ok) {
      console.error('CANNOT CHECK: the evaluation reported a pass its own data does not support.');
      console.error('  Every band must be covered by at least one unrestricted project for a');
      console.error('  pass to stand, and the reported rows do not show that.');
      console.error('  The child computes with whatever the config left of the runtime; this');
      console.error('  process re-checks the conclusion with intrinsics the config never saw.');
      console.error('check-ui-viewports: FAIL (code 14)');
      rmSync(box, { recursive: true, force: true });
      process.exit(14);
    }
  }
  if (!recorded || !Number.isInteger(recorded.code)) {
    console.error('CANNOT CHECK: the config evaluation did not report a verdict.');
    if (child && child.signal) console.error(`  the evaluation was killed by ${child.signal}`);
    else if (child && child.error) console.error(`  ${child.error.message}`);
    else console.error(`  it ended with status ${child ? child.status : 'unknown'} and wrote nothing`);
    console.error('  The config is imported in a child process precisely so that nothing it');
    console.error('  does can decide this outcome. No verdict is NOT a pass.');
    console.error('check-ui-viewports: FAIL (code 14)');
    process.exit(14);
  }
  rmSync(box, { recursive: true, force: true });
  process.exit(recorded.code);
}

// --- everything below runs in the CHILD, where the config is imported. ---

// THE CHANNEL IS REMOVED FROM THE CONFIG'S VIEW. Round 16 I wrote that a config
// could read this path from its own environment and forge a verdict, and said I
// was not defending against it. Codex round 18 then did it: an exit listener that
// writes {"code":0} to process.env.__UI_VIEWPORTS_VERDICT_FILE and sets
// process.exitCode = 0, so a recorded refusal became an accepted pass.
//
// "I am not defending against that" was the wrong posture for a hazard I could
// close in one line. The variable is deleted before anything the config can see
// runs, so the path exists only in this closure. That is the same move as every
// fix on this PR that has held: remove the thing rather than reason about it.
delete process.env.__UI_VIEWPORTS_VERDICT_FILE;

// Captured before the config is imported: a corrupted JSON.stringify or a
// corrupted writeFileSync would make the report unreadable, which the parent
// treats as no answer — the safe direction, but worth not inviting.
const STRINGIFY = JSON.stringify;
const WRITE = writeFileSync;

function record(code) {
  // Written before terminating, so the parent has an answer even if something
  // the config installed interferes with how this process ends.
  try { WRITE(VERDICT_FILE, STRINGIFY({ code }), 'utf8'); } catch { /* parent reports */ }
}

// The band data, for the parent to decide on. Written to a sibling of the
// verdict file so one read tells the parent whether the child got this far.
function report(data) {
  try { WRITE(`${VERDICT_FILE}.rows`, STRINGIFY(data), 'utf8'); } catch { /* parent reports */ }
}

// CAPTURED BEFORE ANY CONFIG CODE CAN RUN. The config is arbitrary JavaScript
// imported into THIS process, so anything it can reach, it can rewrite — and
// `process.exit` is the one that decides the verdict. Codex reproduced it in
// round 15: a phone-only config containing `process.exit = () => {}` let the
// gate print both missing-band failures, walk past its own `process.exit(1)`,
// print the OK line, and exit 0. A false green produced by the config under
// test, which is the most direct form this file's subject can take.
//
// A bound reference is not reachable from the config, so every termination below
// goes through EXIT rather than looking the method up at call time. The stronger
// fix is a child process — the config could still mutate console, prototypes, or
// exit handlers — and that belongs with #335, which has to spawn a run anyway.
// This closes the verdict path, which is the part that decides pass or fail.
const EXIT = process.exit.bind(process);

let verdict = false;
process.on('exit', code => {
  if (code === 0 && !verdict) {
    console.error('FAIL: check-ui-viewports reached exit 0 without recording a verdict.');
    console.error('      Something ended the process before the gate was evaluated (a config');
    console.error('      that calls process.exit() at import time does exactly this).');
    console.error('check-ui-viewports: FAIL (code 7)');
    // Record it, so the parent reports the SPECIFIC diagnosis rather than the
    // generic "no verdict". 7 says the config ended the process before the gate
    // ran; 14 says the evaluation vanished without even reaching here (a signal,
    // a hard kill). Both are refusals — this one names the cause.
    record(7);
    process.exitCode = 7;
  }
});

function die(code, lines) {
  for (const l of lines) console.error(l);
  console.error(`check-ui-viewports: FAIL (code ${code})`);
  verdict = true;
  record(code);
  EXIT(code);
}

const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };

// --- 1. Resolve the tests dir. The default is a fallback, never an assumption:
// the resolved path AND its source print on every run, because #281's snippet died
// from a hard-coded path that exited quiet for any project that moved UI_TESTS_DIR.
let dir = opt('--tests-dir');
let dirSource = '--tests-dir';
if (dir === undefined) { dir = process.env.UI_TESTS_DIR; dirSource = 'UI_TESTS_DIR'; }
if (!dir) { dir = '.github/scripts/ui-tests'; dirSource = 'default'; }

// Width bands, not device names. The template config's own tablet comment states
// the convention this follows — "max-width: 1023px, desktop from 1024px" — and
// says plainly that a 1080-wide "tablet" renders the DESKTOP layout: the width is
// what matters, the device name is a convenience. Override for a project whose
// breakpoints differ; an override always prints, so it can never be invisible.
const rawTablet = opt('--tablet-min');
const rawLaptop = opt('--laptop-min');
const TABLET_MIN = Number(rawTablet !== undefined ? rawTablet : 768);
const LAPTOP_MIN = Number(rawLaptop !== undefined ? rawLaptop : 1024);
const bandSource = (rawTablet !== undefined || rawLaptop !== undefined)
  ? 'OVERRIDDEN on the command line' : 'defaults';
if (!Number.isFinite(TABLET_MIN) || !Number.isFinite(LAPTOP_MIN) || TABLET_MIN >= LAPTOP_MIN) {
  die(8, [`CANNOT CHECK: nonsensical band bounds (tablet-min=${TABLET_MIN}, laptop-min=${LAPTOP_MIN})`]);
}

// ABSOLUTE, CAPTURED BEFORE THE CHDIR BELOW. Every later use must be this and
// not `dir`: once cwd is the tests directory, a relative `dir` would resolve
// against ITSELF. Caught immediately by the shipped kit (it looked for
// templates/ui-tests/templates/ui-tests) but NOT by any case, because the cases
// harness passes an absolute --tests-dir — so a relative one is now pinned too.
const TESTS_DIR = resolve(dir);
console.log(`tests dir: ${TESTS_DIR}  (source: ${dirSource})`);
console.log(`bands (${bandSource}): phone <${TABLET_MIN}px | tablet ${TABLET_MIN}-${LAPTOP_MIN - 1}px | laptop >=${LAPTOP_MIN}px`);

if (!existsSync(TESTS_DIR) || !statSync(TESTS_DIR).isDirectory()) {
  die(2, [
    `CANNOT CHECK: tests dir does not exist: ${TESTS_DIR}`,
    `  resolved from: ${dirSource}`,
    '  order tried:   --tests-dir, then $UI_TESTS_DIR, then .github/scripts/ui-tests',
    '  This is NOT a pass — the viewport gate was not evaluated.',
  ]);
}

// ENTER THE TESTS DIRECTORY FIRST, then resolve everything relative to being
// there. Playwright does `path.resolve(process.cwd(), configFile)` AFTER its cwd
// is the tests directory — and cwd is the REAL path, because chdir resolves
// symlinks. Computing a base instead reproduces that only while no symlink is
// involved: with `--tests-dir suite-link --config ../configdir`, resolving `..`
// against the lexical path names a different directory than resolving it from
// inside the link's target (Codex, round 14 — a false green, reproduced).
//
// Rounds 9 through 13 each corrected WHICH base to compute. This stops computing
// one. `process.cwd()` after the chdir is the same value Playwright will use, by
// construction, so there is no base to get wrong and no fifth predicate to add.
try {
  process.chdir(TESTS_DIR);
  // THE LOGICAL PATH, NOT THE PHYSICAL ONE. A shell entering a symlinked
  // directory keeps the symlink path in PWD while cwd is the real target, so the
  // run sees PWD=/…/link and cwd=/…/real. Round 10 set PWD to process.cwd(),
  // which is the physical path — correct when no symlink is involved and wrong
  // exactly when one is. Codex round 15 reproduced a config branching on a PWD
  // ending in /link.
  //
  // TESTS_DIR is resolve()d, which does NOT follow symlinks, so it is the same
  // logical path the shell would export. cwd stays physical via the chdir above.
  // Between them the two match what the run's shell produces.
  process.env.PWD = TESTS_DIR;
} catch (e) {
  die(5, [
    'CANNOT CHECK: cannot enter the tests directory to evaluate the config.',
    `  ${TESTS_DIR}`,
    `  ${(e && e.message) || e}`,
    '  Playwright evaluates the config from there, so reading it from elsewhere',
    '  can produce a different config. Refusing rather than reading the wrong one.',
  ]);
}

// --- 2. Resolve the config in PLAYWRIGHT'S OWN precedence order. Measured
// 2026-08-26 against @playwright/test 1.62.1: a .ts config shadows a .js one, and
// a .js config shadows a .mjs one. Reading the file Playwright does NOT read is
// #281's bug wearing a different hat, so name every shadowed file.
const CONFIG_NAMES = ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mts',
  'playwright.config.mjs', 'playwright.config.cts', 'playwright.config.cjs'];
let configPath;
const explicit = opt('--config');
if (explicit) {
  // Plain resolve() against the CURRENT directory, which the chdir above has
  // already made the tests directory — exactly Playwright's
  // resolve(process.cwd(), configFile). Round 13 computed the base instead and
  // round 14 defeated that with a symlink.
  configPath = isAbsolute(explicit) ? explicit : resolve(explicit);
  if (!existsSync(configPath)) {
    die(3, [`CANNOT CHECK: --config path does not exist: ${configPath}`, '  This is NOT a pass.']);
  }
  // Playwright's own --config is "Configuration file, OR a test directory with
  // optional playwright.config" (1.62.1 --help). Treating a directory as a file
  // made import() fail and the gate exit 4 on a config Playwright loads fine —
  // a refusal on a valid invocation, not a fail-open, but still a false alarm.
  // Codex, round 12. Same precedence list as the implicit search below, so the
  // two paths cannot disagree about which file Playwright would read.
  if (statSync(configPath).isDirectory()) {
    const found = CONFIG_NAMES.filter(n => existsSync(join(configPath, n)));
    if (!found.length) {
      die(3, [
        `CANNOT CHECK: --config names a directory with no Playwright config: ${configPath}`,
        `  looked for: ${CONFIG_NAMES.join(', ')}`,
        '  This is NOT a pass — the viewport gate was not evaluated.',
      ]);
    }
    if (found.length > 1) {
      console.log(`NOTE: ${found.length} configs present — Playwright reads ${found[0]}, shadowing ${found.slice(1).join(', ')}`);
    }
    configPath = join(configPath, found[0]);
  }
} else {
  const present = CONFIG_NAMES.filter(n => existsSync(join(TESTS_DIR, n)));
  if (!present.length) {
    die(3, [
      `CANNOT CHECK: no Playwright config in ${TESTS_DIR}`,
      `  looked for: ${CONFIG_NAMES.join(', ')}`,
      '  This is NOT a pass — the viewport gate was not evaluated.',
    ]);
  }
  if (present.length > 1) {
    console.log(`NOTE: ${present.length} configs present — Playwright reads ${present[0]}, shadowing ${present.slice(1).join(', ')}`);
  }
  configPath = resolve(join(TESTS_DIR, present[0]));
}
console.log(`config:    ${configPath}`);

(async () => {
  // --- 3. Precondition probe BEFORE the import, so "no node_modules" can never be
  // mistaken for "the config is broken". Resolves exactly as Node will when the
  // config's own `import ... from '@playwright/test'` runs.
  try {
    // FROM THE TESTS DIRECTORY, not from the config. These are the GATE'S OWN
    // dependencies: it needs Playwright installed to do its job, and Playwright
    // is installed next to the suite. A config living outside the tests dir may
    // legitimately export a plain object without importing Playwright at all —
    // Codex round 15 reproduced that layout, where the runner listed all three
    // projects and this probe exited 4 on a valid setup.
    // Whether the CONFIG's own imports resolve is reported by importing it,
    // which is where that belongs.
    createRequire(pathToFileURL(join(TESTS_DIR, 'noop.js'))).resolve('@playwright/test');
  } catch (e) {
    die(4, [
      'CANNOT CHECK: @playwright/test is not resolvable from the config.',
      `  config: ${configPath}`,
      `  ${(e && (e.code || e.name)) || 'Error'}: ${String(e && e.message).split('\n')[0]}`,
      '  In CI this step must run AFTER the ui-suite composite\'s "Install test dependencies".',
      `  Locally: (cd ${TESTS_DIR} && npm install --no-package-lock --ignore-scripts)`,
      '  node_modules is environment-provided (gitignored, never in a fresh clone),',
      '  so its absence is a loud "cannot check" — NOT a pass.',
    ]);
  }

  // --- 4. Import it. Node evaluates the spreads; nothing here parses text.
  //
  // CHDIR FIRST. A config is CODE, so what it exports can depend on where it is
  // evaluated — process.cwd() as much as process.env. Playwright runs with the
  // tests directory as its working directory (the ui-suite composite sets
  // `working-directory` on the run step); this gate was invoked from the repo
  // root. A config branching on cwd therefore handed the two a DIFFERENT object,
  // and copying environment variables across, as round 8 did, does not make the
  // evaluations equivalent — it made one of two inputs match. Codex, round 9.
  //
  // (the chdir into the tests directory happened before config resolution above)
  let cfg;
  try {
    const mod = await import(pathToFileURL(configPath).href);
    cfg = mod.default !== undefined ? mod.default : mod;
  } catch (e) {
    // The old wording here said "or keep a playwright.config.js", which is wrong
    // for the case Codex reported in round 10: a config that IS JavaScript but
    // imports a TypeScript helper. Node rejects the whole module graph, so the
    // file's own extension is not the deciding factor and that advice sends the
    // reader nowhere. Playwright's runner accepts such a config, so this is a
    // refusal on a config the subsequent run would have handled.
    //
    // Deliberately NOT fixed by falling back to Playwright's own config loader,
    // which does load it. Measured 2026-08-27: loadConfigFromFile NORMALISES
    // defaults onto its output — the shipped kit declares no `grep` and the
    // loader reports `grep: /.*/`; it declares no project `testMatch` and the
    // loader reports the default glob. It cannot distinguish DECLARED from
    // DEFAULTED, and every refusal in this gate is a statement about what the
    // config declares. Loading through it would read every config as carrying a
    // root filter on every project — which, while this gate still refused those,
    // meant refusing the entire fleet. #335 removed that refusal, so the cost is
    // no longer fatal; the plain import stays because DECLARED-vs-DEFAULTED still
    // decides which widths are the author's and which are Playwright's.
    const hint = e && e.code === 'ERR_UNKNOWN_FILE_EXTENSION'
      ? ['  This Node cannot import the config\'s module graph — note that the config',
        '  itself may be JavaScript and still import a TypeScript file, which is enough.',
        '  Playwright\'s own runner WOULD load it, so this is a refusal on a config the',
        '  run accepts. Either raise this step to Node >= 22.18 (type stripping is on by',
        '  default there), or keep the config\'s imports to JavaScript.',
        '  The ui-suite composite pins Node 20; see its header note.']
      : [];
    die(5, [
      'CANNOT CHECK: importing the config threw.',
      `  config: ${configPath}`,
      `  ${(e && (e.code || e.name)) || 'Error'}: ${String(e && e.message).split('\n')[0]}`,
      ...hint,
      '  This is NOT a pass — the viewport gate was not evaluated.',
    ]);
  }
  if (!cfg || typeof cfg !== 'object') {
    die(5, [`CANNOT CHECK: the config's export is ${cfg === null ? 'null' : typeof cfg}, not an object.`,
      `  config: ${configPath}`, '  This is NOT a pass.']);
  }

  // --- 5. Projects.
  const projects = Array.isArray(cfg.projects) ? cfg.projects : null;
  if (projects === null) {
    die(6, ['FAIL: the config declares no `projects` array.',
      '  This gate reads per-project viewports to decide which bands are DECLARED,',
      '  so with no projects there is nothing here that declares a band. It makes',
      '  no claim about what such a config would run.',
      '  test.md -> UI coverage gates, fifth gate.']);
  }
  if (projects.length === 0) {
    die(6, ['FAIL: the config declares an EMPTY `projects` array — zero projects resolved.',
      '  test.md -> UI coverage gates, fifth gate.']);
  }

  // ROOT-LEVEL SELECTION KEYS ARE FLAGGED ON PRESENCE. This code makes no claim
  // about what Playwright would run with them set.
  //
  // The history is the argument. claude.trading reported (from a Codex finding on
  // their #283) that a root `grep` left this gate printing a confident OK, and
  // seven review rounds then produced seventeen findings — every one a rule that
  // held for the example that motivated it and failed one step out. "Empty" had
  // three spellings ([], '', ['']). "Matches everything" had at least two
  // (/(?:)/ and /^/). testDir took four predicates and a symlink still beat it.
  // A `shard` can be cancelled at runtime by a reporter calling skipSharding().
  //
  // So the rule here is a POLICY, not a prediction: if a key whose documented job
  // ROOT SELECTION KEYS ARE NO LONGER REFUSED. Until #335 this gate stopped
  // whenever `grep`, `grepInvert`, `testMatch`, `testIgnore` or `shard` appeared
  // at the root — not because such a key necessarily narrows anything, but
  // because a config read could not establish that it does not. That refused
  // configs that were provably fine, and it was the honest move only while
  // nothing better existed.
  //
  // Stage two asks Playwright instead. A key that narrows shows up as a project
  // missing from the listing; a key that is a no-op shows up as nothing at all.
  // The question "does this value actually narrow?" — answered wrong six times
  // across three spellings of "empty" and two of "matches everything" — is no
  // longer asked by anyone here.

  // REPORTERS ARE NO LONGER VETTED BY NAME. A reporter's preprocess() can call
  // testRun.exclude() on every test, and this gate used to refuse any reporter
  // absent from the installed Playwright's `builtInReporters` — a derived list,
  // but still a rule about which reporters are TRUSTED rather than an
  // observation of what they DID.
  //
  // Stage two runs the listing with the config's own reporters intact and the
  // built-in `list` reporter appended, so a reporter that empties the run yields
  // `Total: 0 tests` and the bands go uncovered. Measured on 1.62.1 against a
  // reporter calling testRun.exclude() on every test. #335 set this as the
  // criterion for whether the rewrite had actually moved from predicting to
  // observing: if `--list` still needed the reporter allowlist, it had not.
  // PW_TEST_REPORTER ADDS A REPORTER THE CONFIG NEVER MENTIONS. The runner
  // appends it independently of `reporter`, so a config declaring only built-ins
  // can still run arbitrary reporter code. Reproduced 2026-08-27 (Codex, round 9):
  // with it pointing at a preprocess() that excludes everything, Playwright found
  // 0 tests in 0 files while this gate exited 0 naming three bands.
  //
  // This is the same lesson as the cwd fix above, arriving from a third direction:
  // the config object is not the whole input. Round 8 fixed environment VARIABLES
  // reaching the config; this is the environment reaching PLAYWRIGHT, past the
  // config entirely. Reading `reporter` was never going to see it.
  // PW_TEST_SOURCE_TRANSFORM makes Playwright run a Babel plugin over the config
  // as it loads it, so the object Playwright gets is not the object a plain
  // import() produces. Codex reproduced a transform that ADDS a root grep: the
  // gate imported the untransformed three-band config and exited 0 while
  // `--list` found zero tests. Round 14.
  //
  // Same family as PW_TEST_REPORTER above — an environment variable that changes
  // what Playwright does, invisible to reading the config. Refused rather than
  // reproduced: applying the transform here would mean running an arbitrary Babel
  // plugin from this gate, and the point of the last eight rounds is that this
  // program should stop trying to reproduce Playwright's behaviour.
  // BOTH VARIABLES, because Playwright applies the transform only when both are
  // set (transformHook, 1.62.1). Round 14 refused on the transform variable
  // alone; Codex round 18 reproduced an inherited transform path with no scope
  // where Playwright loaded all three projects and this gate refused a valid
  // setup. A refusal on a config the run accepts is a false alarm, and false
  // alarms are how a gate gets deleted.
  //
  // The scope's PREFIX MATCH against the config path is deliberately not
  // evaluated. Deciding whether a scope covers a file is a prediction about
  // Playwright, and this file has lost that argument in every round it tried.
  // Both set → refuse; that is decidable and it is where the refusal belongs.
  if (process.env.PW_TEST_SOURCE_TRANSFORM && process.env.PW_TEST_SOURCE_TRANSFORM_SCOPE) {
    die(13, [
      'FAIL: PW_TEST_SOURCE_TRANSFORM and _SCOPE are both set — CANNOT CHECK.',
      `  ${process.env.PW_TEST_SOURCE_TRANSFORM}`,
      `  scope: ${process.env.PW_TEST_SOURCE_TRANSFORM_SCOPE}`,
      '  Playwright applies that transform while loading the config, so what it',
      '  sees is not what a plain import() produces. This gate reads the config;',
      '  it will not run your transform to find out what it changes.',
      '  Clear it for the run this gate is certifying, or accept that coverage',
      '  here cannot be attributed.',
      '  test.md -> UI coverage gates, fifth gate.',
    ]);
  }

  // Playwright merges top-level `use` into each project at RUNTIME, but
  // defineConfig() does not do it at authoring time (measured 2026-08-26), so do it
  // here. An unset viewport falls through to Playwright's documented 1280x720
  // default; `viewport: null` is an explicit "no fixed viewport" and must NOT fall
  // through, which is why this tests `!== undefined` rather than truthiness.
  const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
  // PROJECT-LEVEL SELECTION KEYS ARE NO LONGER SUBTRACTED HERE. A project that
  // restricts its test set may declare a width and still never run the UI suite —
  // round 2 of #280 — and this gate used to answer that by refusing to count any
  // project carrying `testMatch`, `testIgnore`, `grep` or `grepInvert`. That is
  // the root-key refusal one level down, with the same cost: a project whose key
  // is a no-op was dropped from its band and the band reported unattributable.
  // Stage two counts a project when Playwright discovers a test for it, which
  // answers the same question by observation and needs no list of key names.
  // AT MOST ONE PROJECT MAY BE NAMELESS. Playwright's list reporter prints an
  // unnamed project's tests with no `[project] ›` prefix, so the observation can
  // tell "some unnamed project discovered this" and nothing more. With one
  // unnamed project that is unambiguous. With two, an unprefixed line marks BOTH
  // as discovered — and a config with an unnamed laptop project and an unnamed
  // phone project that discovers nothing was certified for both bands. Found by
  // testing the fix for the single-unnamed case rather than shipping it: the fix
  // was right and it opened this beside itself.
  const nameless = projects.filter(p => !(p && p.name));
  if (nameless.length > 1) {
    die(18, [
      `CANNOT CHECK: ${nameless.length} projects have no "name".`,
      '  Playwright lists an unnamed project\'s tests without a project prefix, so',
      '  discovery cannot be attributed to one of them rather than another, and a',
      '  band would be certified by a different project\'s tests.',
      '  Name them — Playwright accepts any string, and the names appear in this',
      '  gate\'s output and in the run\'s.',
      '  test.md -> UI coverage gates, fifth gate.',
    ]);
  }
  const cover = { laptop: [], tablet: [], phone: [] };
  const rows = [];
  for (const p of projects) {
    const name = (p && p.name) || '(unnamed)';
    const vp = p && p.use && p.use.viewport !== undefined ? p.use.viewport
      : cfg.use && cfg.use.viewport !== undefined ? cfg.use.viewport
        : DEFAULT_VIEWPORT;
    // testDir IS NOT PART OF `restricted`, at the project level either. Round 10
    // fixed the spelling comparison here; round 12 defeated the fix with a
    // directory symlink — `alias -> .` makes two lexically different paths name
    // one directory, and every project was marked restricted, refusing all three
    // bands on a config Playwright runs.
    //
    // That is the SAME defeat round 6 delivered to the root testDir check, after
    // four predicates. I removed the root one then and left this one, because the
    // finding named the root. A realpath here would be predicate five, and
    // bind mounts and case-insensitive filesystems are the next two.
    //
    // So all testDir inference now goes to #335 together, root and project. The
    // cost is a project that genuinely redirects discovery away from the suite is
    // not flagged — a real hole, recorded rather than papered over, and no worse
    // than the root case that has been deferred since round 6.
    if (vp === null) {
      rows.push({ name, w: 'null', band: 'UNCLASSIFIABLE (viewport: null — no fixed viewport)' });
      continue;
    }
    if (typeof vp !== 'object' || !Number.isFinite(vp.width)) {
      rows.push({ name, w: JSON.stringify(vp), band: 'UNCLASSIFIABLE (malformed viewport)' });
      continue;
    }
    const band = vp.width >= LAPTOP_MIN ? 'laptop' : vp.width >= TABLET_MIN ? 'tablet' : 'phone';
    rows.push({ name, w: `${vp.width}x${vp.height}`, band });
    cover[band].push(name);
  }
  for (const r of rows) {
    console.log(`  ${String(r.name).padEnd(18)} ${String(r.w).padEnd(12)} ${r.band}`);
  }

  // TWO DIFFERENT VERDICTS, because they are different facts. A band with no
  // project in it at all is UNDECLARED — that is a FAIL this gate can prove from
  // the widths alone. A band whose only projects carry selection keys is
  // DECLARED BUT UNATTRIBUTABLE: the projects exist at the right widths and this
  // gate cannot tell whether their filters exclude the suite.
  //
  // They were one verdict until round 10, and calling the second "no project
  // covers laptop" states something false — a laptop project is right there.
  // Codex reproduced the cost: a laptop project carrying `testIgnore: []`, which
  // excludes nothing, reported a missing band while Playwright listed the spec
  // for all three projects.
  //
  // What is NOT done here, deliberately: exempting the no-op. That needs the
  // question "does this value actually narrow?", which rounds 1-6 answered wrong
  // six times across three spellings of "empty" and two of "matches everything".
  // The refusal stays; only the false claim goes. See #335.
  // THE DECISION IS MADE IN THE PARENT, from data this process reports.
  //
  // The child boundary stopped the config reaching the exit path (round 16) and
  // the verdict file (round 18), but not the ARITHMETIC. Codex round 18:
  // `Array.prototype.filter = () => []` in a phone-only config makes both lists
  // below empty, so the gate prints OK naming empty bands and exits 0 cleanly —
  // no exit trick, no forged file, just a corrupted computation.
  //
  // Capturing the primitives this analysis uses would be an enumeration
  // (`filter`, then `map`, then `Object.keys`, then `JSON.stringify`…), and every
  // enumeration on this PR has been defeated within a round. So the rows are
  // reported to the parent, which never imported the config, and the parent
  // decides. A corrupted child can only produce WORSE data — fewer rows, missing
  // bands — which the parent turns into a refusal. It cannot manufacture a pass,
  // because the pass is computed by code the config never touched.
  // configPath travels with the rows so the PARENT can observe discovery. The
  // parent never imports the config; it hands the path to Playwright and reads
  // what comes back, which is the whole point of #335.
  report({ rows, cover, configPath, testsDir: TESTS_DIR });
  const bandProjects = b => rows.filter(r => r.band === b);
  const undeclared = ['laptop', 'tablet', 'phone'].filter(b => bandProjects(b).length === 0);
  if (undeclared.length) {
    for (const b of undeclared) console.error(`FAIL: no project declares a ${b} viewport.`);
    console.error('  global.md requires laptop, tablet AND phone. This config is the only place');
    console.error('  the UI suite gets its widths, and exactly one test sets its own (S4, at 390),');
    console.error('  so no scenario is ever rendered at the missing width.');
    console.error('  test.md -> UI coverage gates, fifth gate.');
    verdict = true;
    console.error('check-ui-viewports: FAIL (code 1)');
    record(1);
    EXIT(1);
  }
  // ONE VERDICT NOW, not two. "Declared but unattributable" existed because a
  // config read could not tell whether a project's selection keys excluded the
  // suite, so a band with only restricted projects got its own refusal (exit 12,
  // CANNOT CHECK). Stage two answers that question outright, so the refusal is
  // gone and exit 12 now means something PROVEN: the band is declared and
  // Playwright discovers nothing for it. The code is reused deliberately — it was
  // always "this band is not established"; what changed is that the gate can now
  // say why with evidence instead of declining to say.
  // NO VERDICT LINE HERE. Declaring the bands is half the question; the other
  // half is whether Playwright discovers anything for them, and only the parent
  // can ask (it never imported the config). A success printed here would be the
  // "declared, not executed" claim #335 was filed to replace — and worse, it
  // would print BEFORE the observation that can still refuse it.
  verdict = true;
  // The PASS must be recorded too, and explicitly. If the success path forgot,
  // every clean config would reach the parent with no verdict and report exit 14
  // — loud and wrong, but in the safe direction. The dangerous direction is the
  // one that cannot happen here: nothing writes a 0 except this line.
  record(0);
})().catch(err => die(5, ['CANNOT CHECK: unexpected failure inside check-ui-viewports.',
  `  ${(err && err.stack) || err}`]));
