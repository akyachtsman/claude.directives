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
// So the second half stops predicting and READS THE RUN. Pass `--report <path>`
// pointing at the JSON report the suite just wrote, and a band is covered when
// some project declared at that width has at least one test whose result status
// is anything other than "skipped". See `readReport()` below. Declared AND
// executed, joined by project name in the parent process.
//
// A LISTING WAS TRIED FIRST AND IS NOT THIS. `playwright test --list` was the
// #347 design for three rounds and lost on four measured differences from a run,
// each one a false green; `readReport()` below catalogues them. Each was answered
// with a probe or a refusal, and each probe was one more thing the config could
// notice. All four fixtures are kept in the cases suite, and all four are now
// caught by the one rule above.
//
// ⚠️ WHAT THIS STILL CANNOT SEE. The report names projects, not viewports, so the
// WIDTHS still come from importing the config while the EXECUTION comes from the
// run — two evaluations, and a config that returns different viewports to each
// would be believed. Nothing here probes for that: the two evaluations differ
// only in argv and cwd, both of which the run also varies between CI and a
// developer's shell, so a config that is not a stable function of its inputs is
// out of this gate's reach by construction. It is a far narrower hole than the
// listing's, which needed no dishonesty at all — a `.gitignore` or a shard was
// enough.
//
// ⚠️⚠️ THE STANDING LIMIT, AND IT IS ONE LIMIT WEARING TWO FACES. This gate reads
// the config through artifacts produced by processes the CONFIG RUNS IN, and
// there is no authenticated channel out of a process you do not control. So:
//
//   * the JSON report is written by the Playwright process, and the config's own
//     exit handler can replace it after the reporter is done. Codex reproduced a
//     config that rewrote the report with passing results for all three projects
//     when only phone had been scheduled (#347 round 11), and this parser
//     accepted it.
//   * the declaration rows are assembled in the evaluation child, and a
//     corrupted `Array.prototype.push` can put a forged row among them before
//     the parent ever sees one.
//
// Six rounds of hardening bought real ground — the exit path, the bound, the kill
// signal, the verdict file, the nonce, and the band arithmetic all moved out of
// the config's reach — and each of those closed a way to subvert code the gate
// OWNS. Neither of the two above is that. They are the config lying about
// itself, in the only evidence that exists about it.
//
// Nothing closes this, and the shape of the failed attempts says why: every
// candidate mechanism (hash the report before the handler runs, watch the file
// for a second write, capture the array primitives) either lives inside the same
// process or is an enumeration, and every enumeration on #347 was walked around
// within one round. What WOULD close it is an execution channel Playwright does
// not offer.
//
// So the scope is stated rather than defended: THIS GATE CATCHES DRIFT, NOT
// FORGERY. A config that narrows silently — a shard, a `.gitignore`, a filter, a
// device spread overwriting a literal, a project quietly deleted — is what it
// exists for and what it catches. A config written to deceive this gate defeats
// it, and would defeat any check that reads the run through the run's own
// output. Owner decision, 2026-09-02: ship with the limit stated here, in the
// verdict line, and in test.md. Tracked as directives#349.
//
// Without `--report` this gate checks the DECLARATION only and says so in the
// verdict line. That is still a real check — a missing band is exit 1, provable
// from the widths alone — and it is fast enough to run before the suite.
//
// SILENCE MEANS "CHECKED AND FINE", NEVER "COULD NOT LOOK". Every failure has its
// own exit code and its own printed line:
//   0  three classes declared; with --report, also EXECUTED at those widths
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
//      presence alone. The run's report settles whether it narrowed anything.
//  10  RETIRED by #335 — a non-built-in reporter used to be refused by name.
//  11  RETIRED by #335 — the built-in reporter list is no longer consulted.
//  12  a band is DECLARED at the right width and NOTHING RAN there (FAILED) —
//      only reachable with --report, and it is the run's own account
//  13  PW_TEST_SOURCE_TRANSFORM and _SCOPE are both set (CANNOT CHECK)
//  14  the config evaluation reported no verdict, or a pass its own data or its
//      exit status does not support, or it never finished (CANNOT CHECK)
//  15  --report was given and the report could not be read (CANNOT CHECK)
//  16  RETIRED — the listing that needed it is gone; see readReport()
//  17  RETIRED — ditto
//  18  two or more projects share a name (CANNOT CHECK) — the run reports
//      results by project name, so one project's tests would certify another's
//  19  RETIRED — `--forbid-only` was a probe against the listing, and a probe
//      the config could observe. The run's report needs no probe.
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
const { resolve, join, isAbsolute, dirname } = require('path');
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
// READING THE RUN'S OWN REPORT. Runs in the PARENT, which never imports the
// config.
//
// #335 asked for an observation instead of a config read, and the first answer
// was `playwright test --list`. Three review rounds measured four ways a LISTING
// is not a RUN, and none of them is adversarial:
//   * `--list` appears in `process.argv`, which config code can read.
//   * list mode loads with `filterOnly: false`; a run uses `true`, so one stray
//     `test.only` makes the listing name bands the run never reaches.
//   * list mode skips `globalSetup`, so a suite whose collection depends on
//     setup state enumerates differently than it runs.
//   * a listing carries no DISPOSITION: `testRun.skip()` leaves tests enumerated
//     and their bodies unexecuted, and `--list --reporter=json` reports
//     status "skipped" for every test even when nothing skipped any of them,
//     because nothing runs.
// Each fix for one widened the surface for the next — the `--forbid-only` probe
// added for the second became a third observable mode. That is the plateau #341
// was filed to escape, reached again in three rounds instead of twenty-four.
//
// So the question moved to where it can be answered: the RUN. Playwright's JSON
// reporter records, per test, the project that owned it and whether it actually
// executed. Every one of the four gaps closes at once, because this is not a
// model of the run — it is the run's own account of itself. Nothing here
// predicts, observes from outside, or needs to know which mechanism removed a
// test.
//
// The config import above still answers WHICH WIDTHS ARE DECLARED, because the
// report does not carry per-project viewports (measured: `config.projects[]` has
// name, testDir, testMatch, timeout and no `use`). Declaration from the config,
// execution from the report, joined by project name.
function readReport(reportPath) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch (e) {
    return { ok: false, code: 15, lines: [
      `could not read the run's report at ${reportPath}`,
      `  ${(e && e.message) || e}`,
      '  This gate certifies coverage from the run\'s own results. No report is',
      '  "the run did not report", never "nothing ran at those widths".',
    ] };
  }
  // WHAT THIS ESTABLISHES, AND WHAT IT DOES NOT. A result proves a test was
  // SCHEDULED in a project declaring that width. It does NOT prove a page was
  // ever that wide, and the verdict line says so rather than implying more.
  //
  // #347 rounds 5-7 tried to close that gap by having the kit's `page` fixture
  // record the width each page rendered at. Three variants of one finding
  // defeated three implementations: a `beforeAll` that throws, a `beforeEach`
  // that throws, and a `beforeEach` that NAVIGATES and then throws — each
  // producing evidence for a test whose body never ran. Every fix was correct
  // for the variant that motivated it and wrong one step out, which is the
  // exact pattern #335 catalogued twenty times over for config prediction. The
  // mechanism was removed rather than lost to a fourth time; the reasoning is
  // in the PR and the work is filed as directives#348.
  //
  // EXECUTED, not merely present. A test the run reports as `skipped` did not
  // run its body — `testRun.skip()` and `test.skip()` both land here — so it is
  // no evidence that a viewport was exercised. This is the distinction a listing
  // cannot make at all, and the whole reason the observation moved here.
  //
  // `viewport-override` marks a test that called `setViewportSize()`, which runs
  // at the width IT chose in every project and would otherwise credit its
  // project's declared width (#347 round 4). PER-RESULT, not per-test:
  // Playwright stores a retry's annotation on the test-level list too, so
  // merging them let a retry retroactively discard an honest earlier attempt
  // (round 5).
  // PER-RESULT WHERE THE REPORT HAS IT, PER-TEST WHERE IT DOES NOT. Playwright
  // only began serialising `results[].annotations` after the floor this kit
  // declares: measured on 1.44.0, the key is ABSENT from every result while
  // `tests[].annotations` carries the marker. Reading the result alone there
  // made `overrides()` always false, so S4's marker was ignored and a run
  // containing only S4 certified laptop and tablet — the round-4 false green,
  // restored by the round-5 fix for anyone on an older Playwright (Codex, #347
  // round 8).
  //
  // The FIELD'S PRESENCE is the capability signal, so nothing here reads a
  // version number. Where results carry annotations, each attempt is judged by
  // its own record and a retry cannot retroactively discard an honest earlier
  // one (round 5). Where they do not, the test-level list is the only evidence
  // that exists — retry scoping is unavailable on such a report because the
  // data is, not because this chose to ignore it.
  const OVERRIDE = 'viewport-override';
  const overrides = (r, t) => {
    const list = Array.isArray(r.annotations) ? r.annotations
      : (Array.isArray(t.annotations) ? t.annotations : []);
    return list.some(a => a && a.type === OVERRIDE);
  };
  const executed = new Map();
  let total = 0;
  const walk = (suite) => {
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        total += 1;
        const name = typeof t.projectName === 'string' ? t.projectName : '';
        const ran = (t.results || []).some(r => r && r.status && r.status !== 'skipped'
          && !overrides(r, t));
        if (ran) executed.set(name, (executed.get(name) || 0) + 1);
      }
    }
    for (const child of suite.suites || []) walk(child);
  };
  for (const suite of doc.suites || []) walk(suite);
  return { ok: true, total, executed };
}


// How long the config-evaluation child may take. Two minutes is far past any
// honest evaluation (the shipped kit is well under a second) and well inside the
// ui-suite job's own bound. Named because it appears in the spawn AND in two
// diagnostics, and a bound whose stated value drifts from its enforced one sends
// the reader looking for the wrong thing.
const EVAL_TIMEOUT_MS = 120000;

const VERDICT_FILE = process.env.__UI_VIEWPORTS_VERDICT_FILE;
if (!VERDICT_FILE) {
  const { spawnSync } = require('child_process');
  const { randomBytes } = require('crypto');
  const box = mkdtempSync(join(tmpdir(), 'ui-viewports-verdict-'));
  const file = join(box, 'verdict.json');
  // THE PATH IS NOT A SECRET AND CANNOT BE MADE ONE. Round 18's fix deleted the
  // env var before the config could read it; Codex round 20 walked around it by
  // enumerating os.tmpdir() for `ui-viewports-verdict-*`, taking the newest, and
  // writing {"code":0} plus a three-band `.rows` from an exit listener — then
  // setting process.exitCode = 0 so the corroboration check above saw a clean
  // end too. Reproduced here: the gate printed its own `FAIL (code 1)` and then
  // exited 0 with `OK — DECLARED laptop:phone tablet:phone phone:phone`.
  //
  // Nor would deleting the variable "harder" have helped: /proc/self/environ is
  // a snapshot taken at exec and `delete process.env.X` does not touch it
  // (measured — the deleted key is still there), so ANYTHING passed to the child
  // through the environment is readable by the config no matter what this file
  // does with it afterwards.
  //
  // So the file stops being the credential. The parent mints a nonce, the child
  // stamps it into both payloads, and a payload without it is not from the child
  // — whoever wrote it and wherever it landed. The nonce reaches the child over
  // STDIN, which is a one-shot channel: the child consumes it before importing
  // anything, and a later read of fd 0 returns "" (`/proc/self/fd/0` is ENXIO).
  // That is the only channel here that a config cannot go back and re-read.
  const nonce = randomBytes(24).toString('hex');
  // ONE CLEANUP, ON EVERY PATH. The box used to be removed at the two exits that
  // remembered to, and the parent has eleven. Measured while reproducing the
  // forgery above: a scratch /tmp held 230 abandoned `ui-viewports-verdict-*`
  // directories, every one from a refusal branch — which is also what made the
  // forge's `readdirSync` enumeration so comfortable. An exit hook covers the
  // refusals, the early returns and a throw alike, so a branch added later
  // cannot forget.
  process.on('exit', () => { try { rmSync(box, { recursive: true, force: true }); } catch {} });
  let child;
  try {
    // BOUNDED. The child IMPORTS the config, which is arbitrary code, and an
    // import that leaves a live handle never lets the child exit — a plain
    // `setInterval(() => {}, 1000)` at module scope is enough, and Playwright
    // lists such a config without complaint. Unbounded, this gate then hung
    // until something outside killed it, consuming the whole job's budget and
    // producing none of the CANNOT CHECK verdicts it promises. A guard that
    // hangs is worse than one that refuses: the refusal is a result.
    //
    child = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
      timeout: EVAL_TIMEOUT_MS,
      // SIGKILL, NOT THE DEFAULT SIGTERM. `spawnSync`'s timeout kills with
      // SIGTERM, which a config can install a handler for — and a handler that
      // does not exit, plus one live handle, makes the bound do nothing at all.
      // Codex reproduced it on Node 20 (#347 round 4) and so did I: with a
      // 500ms bound the call had still not returned when an external `timeout 8`
      // killed it. SIGKILL cannot be caught, so the advertised bound holds
      // against config code rather than only against honest configs. Measured
      // after the change: returns at 507ms with ETIMEDOUT and signal SIGKILL.
      //
      // This is the same lesson as the rest of this file one level down — the
      // bound was a claim about arbitrary code, resting on that code's
      // cooperation.
      killSignal: 'SIGKILL',
      // stdin is a pipe carrying the nonce; stdout/stderr still inherit so the
      // child's diagnostics reach the caller unchanged.
      stdio: ['pipe', 'inherit', 'inherit'],
      input: nonce,
      env: { ...process.env, __UI_VIEWPORTS_VERDICT_FILE: file },
    });
  } finally {
    // read before cleanup, so a throw in spawnSync still leaves nothing behind
  }
  let recorded = null;
  try { recorded = JSON.parse(readFileSync(file, 'utf8')); } catch { /* handled below */ }

  // THE NONCE GATE. Checked before anything else looks at `recorded`, because a
  // payload that does not carry it was not written by the child this parent
  // spawned — and the whole point of the child is that the config's code cannot
  // decide this outcome. A forged file lands at the same path; it cannot carry
  // this value. Refusal, not silent fallback: a verdict this process cannot
  // attribute is no verdict, which is exit 14's existing meaning.
  if (recorded && recorded.nonce !== nonce) {
    console.error('CANNOT CHECK: the recorded verdict did not come from the config evaluation.');
    console.error('  The verdict file exists but is not stamped with this run\'s token, so');
    console.error('  something other than the gate\'s own child process wrote it.');
    console.error('  A verdict that cannot be attributed is not a pass.');
    console.error('check-ui-viewports: FAIL (code 14)');
    process.exit(14);
  }

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
  // TWO CAUSES REACH THIS BRANCH AND THEY NEED DIFFERENT ADVICE. A config that
  // schedules a throw fails after recording; so does a config that merely leaves
  // a HANDLE open, because the bound above then kills a child that has already
  // written its verdict. Both are exit 14 and neither hangs, which was the whole
  // point — but telling someone whose config holds a `setInterval` to look for
  // "a scheduled throw" sends them hunting for a bug that is not there.
  //
  // Found by writing the case for Codex's #347 round-3 fixture rather than by
  // reading the fix: the timeout diagnostic further down is UNREACHABLE for it,
  // because the verdict was already on disk. `spawnSync` reports an expired
  // bound as an ETIMEDOUT error alongside the kill signal, so the two are
  // distinguishable here.
  const timedOut = !!(child && child.error && child.error.code === 'ETIMEDOUT');
  if (recorded && recorded.code === 0 && (child.signal || child.status !== 0)) {
    console.error('CANNOT CHECK: the config evaluation recorded a pass and then failed.');
    if (timedOut) {
      console.error(`  it wrote its verdict and then did not finish within ${EVAL_TIMEOUT_MS / 1000}s, so it was killed`);
      console.error('  Importing the config left something running — a timer, a socket, a');
      console.error('  watcher. Playwright will still list such a config; this gate cannot');
      console.error('  wait for one, and a gate that hangs reports nothing at all.');
    } else {
      console.error(child.signal
        ? `  it was killed by ${child.signal} after writing its verdict`
        : `  it exited ${child.status} after writing its verdict`);
      console.error('  Something in the config was still running after the gate finished —');
      console.error('  a scheduled throw, an unhandled rejection, a handler that failed.');
    }
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
    // THE PARENT COMPUTES THE BANDS. It does not read a `cover` map, because
    // there is no longer one to read.
    //
    // Until round 11 the child sent both the rows and its own `cover`, and this
    // block checked `cover[b].length > 0` — trusting exactly the arithmetic the
    // comment two hundred lines down claimed the parent was re-doing. Codex
    // showed the gap with `Array.prototype.filter = () => []` plus
    // `Array.prototype.toJSON = () => ['phone']`: the LEGITIMATE child stamps the
    // real nonce onto forged arrays, so authentication of the writer said nothing
    // about the content, and a phone-only config printed all three bands.
    //
    // The nonce answers "who wrote this". This answers "is it true", and the two
    // are different questions — conflating them is what the round-10 fix quietly
    // did. So the payload now carries only OBSERVATIONS (a project name and the
    // number its config gave for width) and every conclusion is drawn here, by a
    // process that never imported the config.
    //
    // Band bounds are re-derived from argv rather than taken from the payload,
    // for the same reason: a bound the child supplies is a bound the config can
    // choose. This duplicates the parsing further down (that copy runs in the
    // child) — two readings of one flag, deliberately, because the alternative is
    // the child telling the parent what "laptop" means.
    const pxOpt = (flag, fallback) => {
      const i = process.argv.indexOf(flag);
      const eq = process.argv.find(a => a.startsWith(`${flag}=`));
      const raw = i >= 0 ? process.argv[i + 1] : eq ? eq.slice(flag.length + 1) : undefined;
      return Number(raw !== undefined ? raw : fallback);
    };
    const tabletMin = pxOpt('--tablet-min', 768);
    const laptopMin = pxOpt('--laptop-min', 1024);
    // STRICT ROWS. Every row must be an object with a string name; `width` is
    // optional (the UNCLASSIFIABLE rows carry none) but when present must be a
    // finite number. A `toJSON` hook that collapses the array to strings, or an
    // object prototype that reshapes the entries, fails here rather than
    // arriving as a plausible-looking cover map.
    const rowList = rows && Array.isArray(rows.rows) ? rows.rows : null;
    const rowsWellFormed = rowList !== null && rowList.every(r => r && typeof r === 'object'
      && !Array.isArray(r) && typeof r.name === 'string'
      && (r.width === undefined || (typeof r.width === 'number' && Number.isFinite(r.width))));
    const cover = { laptop: [], tablet: [], phone: [] };
    if (rowsWellFormed && Number.isFinite(tabletMin) && Number.isFinite(laptopMin)
        && tabletMin < laptopMin) {
      for (const r of rowList) {
        if (typeof r.width !== 'number' || !Number.isFinite(r.width)) continue;
        cover[r.width >= laptopMin ? 'laptop' : r.width >= tabletMin ? 'tablet' : 'phone']
          .push(r.name);
      }
    }
    const ok = rows && rows.nonce === nonce && rowsWellFormed
      && bands.every(b => cover[b].length > 0);
    if (ok) {
      // ── STAGE TWO: WHAT ACTUALLY RAN ─────────────────────────────────────
      // Only when a report is supplied. Without one this gate reports what the
      // config DECLARES and says so plainly — that is a real check (a missing
      // band is exit 1 and provable from the widths alone) and it is fast enough
      // to run before the suite. The coverage claim needs the run, and the
      // ui-suite composite invokes this again with `--report` afterwards.
      // Read from argv directly: `opt()` is defined further down, in the section
      // that runs in the CHILD, and this block is the parent.
      // BOTH SPELLINGS, still. The original reason was a disagreement: round 7
      // found check-ui-suite-env.py accepting `--report=<path>` while this
      // parser understood only the space-separated form, so that spelling passed
      // the guard and then got the declaration-only verdict at exit 0 — the
      // guard certifying a command this script silently ignored.
      //
      // That guard no longer decides anything from the flag's spelling: since
      // round 10 it pins the composite's command bodies verbatim, and the pinned
      // post-run body uses the space-separated form. So the coupling is gone
      // rather than resolved. Both spellings stay supported HERE because this
      // script is also run by hand and from project scripts, where `--report=`
      // is the more natural spelling, and a flag that is silently ignored is the
      // exact failure round 7 recorded.
      let reportIdx = process.argv.indexOf('--report');
      let reportArg = reportIdx >= 0 ? process.argv[reportIdx + 1] : undefined;
      if (reportIdx < 0) {
        const eq = process.argv.findIndex(a => a.startsWith('--report='));
        if (eq >= 0) { reportIdx = eq; reportArg = process.argv[eq].slice('--report='.length); }
      }
      // A PRESENT FLAG WITH NO PATH IS A USAGE ERROR, NOT A QUIETER CHECK.
      // `--report ''` — which is what an unset REPORT_PATH expands to in the
      // composite — used to fall through the truthiness test and print the
      // DECLARED verdict, so the caller asked for the execution check and got
      // silence with a passing exit (Codex, #347 round 6). Someone who passes
      // the flag wants stage two; if the path is missing, say so.
      if (reportIdx >= 0 && !String(reportArg || '').trim()) {
        console.error('CANNOT CHECK: --report was given with no path.');
        console.error('  Passing the flag asks for the execution check, so an empty value is a');
        console.error('  usage error rather than a reason to fall back on the declaration.');
        console.error('  In the ui-suite composite this is an unset or empty `report-path`.');
        console.error('check-ui-viewports: FAIL (code 8)');
        process.exit(8);
      }
      if (reportArg) {
        const run = readReport(isAbsolute(reportArg) ? reportArg : resolve(rows.testsDir, reportArg));
        if (!run.ok) {
          console.error('CANNOT CHECK: could not read what the run did.');
          for (const line of run.lines) console.error(`  ${line}`);
          console.error(`check-ui-viewports: FAIL (code ${run.code})`);
            process.exit(run.code);
        }
        // ONE LABEL FOR THE EMPTY KEY, and it is only ever a LABEL. The join
        // runs on the raw name, so a project actually named `(no name)` is a
        // different key from a project with none — Codex reported the reverse
        // for the old `(unnamed)` sentinel (#347 round 3), which was a real
        // collision because the two sides of the join disagreed. They agree now
        // (both use the empty string), and this only decides what gets printed.
        // Without it a `declared by:` line for an unnamed project printed empty.
        const label = n => (n === '' ? '(no name)' : n);
        const ranIn = n => (run.executed.get(n) || 0) > 0;
        const missing = bands.filter(b => !cover[b].some(ranIn));
        if (missing.length) {
          for (const b of missing) {
            console.error(`FAIL: ${b} is declared but NOTHING RAN at that width.`);
            console.error(`  declared by: ${cover[b].map(label).join(', ')}`);
          }
          const ran = [...run.executed.entries()].map(([n, c]) => `${label(n)}:${c}`).join(', ');
          console.error(`  the run executed ${[...run.executed.values()].reduce((a, b2) => a + b2, 0)} of ${run.total} test(s): ${ran || '(none)'}`);
          console.error('  This is the run\'s own report, not an inference: the widths are declared');
          console.error('  correctly and no scenario executed at them. A filter, an ignore rule, a');
          console.error('  shard, a reporter, a focused test, a global setup — this gate does not');
          console.error('  need to know which, because it is reading the outcome rather than');
          console.error('  predicting it.');
          console.error('  test.md -> UI coverage gates, fifth gate.');
            process.exit(12);
        }
        const where = b => cover[b].filter(ranIn).map(label).join('/');
        console.log(`check-ui-viewports: OK — SCHEDULED laptop:${where('laptop')}  tablet:${where('tablet')}  phone:${where('phone')}`);
        console.log('  (a test EXECUTED in a project declaring each width. This does NOT');
        console.log('   establish that a page was rendered at it: a test that never opens a');
        console.log('   page, or whose body never starts, counts here. #347 rounds 5-7 tried');
        console.log('   three mechanisms for the stronger claim and three variants of one');
        console.log('   finding defeated all three — see test.md -> UI coverage gates.)');
        console.log('  (evidence: the run\'s own report, written by the process the config');
        console.log('   runs in. A config that REPLACES it defeats this — the gate catches');
        console.log('   drift, not forgery. directives#349.)');
        console.log(`  (from the run's own report: ${[...run.executed.values()].reduce((a, b2) => a + b2, 0)} of ${run.total} test(s) executed)`);
      } else {
        const shown = b => cover[b].map(n => (n === '' ? '(no name)' : n)).join('/');
        console.log(`check-ui-viewports: OK — DECLARED laptop:${shown('laptop')}  tablet:${shown('tablet')}  phone:${shown('phone')}`);
        console.log('  (declared, not executed — pass --report <playwright json> after the run');
        console.log('   to certify that scenarios actually ran at these widths)');
      }
    }
    if (!ok) {
      console.error('CANNOT CHECK: the evaluation reported a pass its own data does not support.');
      console.error('  Every band must be covered by at least one unrestricted project for a');
      console.error('  pass to stand, and the reported rows do not show that.');
      console.error('  The child computes with whatever the config left of the runtime; this');
      console.error('  process re-checks the conclusion with intrinsics the config never saw.');
      console.error('check-ui-viewports: FAIL (code 14)');
      process.exit(14);
    }
  }
  if (!recorded || !Number.isInteger(recorded.code)) {
    console.error('CANNOT CHECK: the config evaluation did not report a verdict.');
    if (timedOut) {
      console.error(`  it did not finish within ${EVAL_TIMEOUT_MS / 1000}s and was killed`);
      console.error('  Importing the config left something running — a timer, a socket, a');
      console.error('  watcher. Playwright will still list such a config; this gate cannot');
      console.error('  wait for one, and a gate that hangs reports nothing at all.');
    } else if (child && child.signal) console.error(`  the evaluation was killed by ${child.signal}`);
    else if (child && child.error) console.error(`  ${child.error.message}`);
    else console.error(`  it ended with status ${child ? child.status : 'unknown'} and wrote nothing`);
    console.error('  The config is imported in a child process precisely so that nothing it');
    console.error('  does can decide this outcome. No verdict is NOT a pass.');
    console.error('check-ui-viewports: FAIL (code 14)');
    process.exit(14);
  }
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

// ...WHICH IS NOT ENOUGH ON ITS OWN, AND THE COMMENT ABOVE USED TO STOP HERE.
// Deleting the key does not touch /proc/self/environ, and the path is guessable
// from os.tmpdir() regardless. So the parent also mints a nonce and sends it
// down STDIN; this reads it once, here, before a single line of the config has
// run. After this read fd 0 is drained — a later `readFileSync(0)` returns ""
// and `/proc/self/fd/0` is ENXIO — so the config cannot recover it the way it
// recovered the path. Every payload below carries it; the parent rejects any
// that does not.
//
// A failed read leaves NONCE empty, which the parent treats as unattributable
// and refuses. That is the right direction: no token, no pass.
let NONCE = '';
try { NONCE = readFileSync(0, 'utf8').trim(); } catch { /* parent refuses */ }

// Captured before the config is imported: a corrupted JSON.stringify or a
// corrupted writeFileSync would make the report unreadable, which the parent
// treats as no answer — the safe direction, but worth not inviting.
const STRINGIFY = JSON.stringify;
const WRITE = writeFileSync;

function record(code) {
  // Written before terminating, so the parent has an answer even if something
  // the config installed interferes with how this process ends.
  try { WRITE(VERDICT_FILE, STRINGIFY({ code, nonce: NONCE }), 'utf8'); } catch { /* parent reports */ }
}

// The band data, for the parent to decide on. Written to a sibling of the
// verdict file so one read tells the parent whether the child got this far.
function report(data) {
  try { WRITE(`${VERDICT_FILE}.rows`, STRINGIFY({ ...data, nonce: NONCE }), 'utf8'); } catch { /* parent reports */ }
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

  // ROOT SELECTION KEYS ARE NO LONGER REFUSED, AND THE HISTORY IS THE ARGUMENT.
  // Until #335 this gate stopped whenever `grep`, `grepInvert`, `testMatch`,
  // `testIgnore` or `shard` appeared at the root — not because such a key
  // necessarily narrows anything, but because a config read could not establish
  // that it does not. That refused configs that were provably fine, and it was
  // the honest move only while nothing better existed.
  //
  // claude.trading reported (from a Codex finding on their #283) that a root
  // `grep` left this gate printing a confident OK, and seven review rounds then
  // produced seventeen findings — every one a rule that held for the example that
  // motivated it and failed one step out. "Empty" had three spellings ([], '',
  // ['']). "Matches everything" had at least two (/(?:)/ and /^/). testDir took
  // four predicates and a symlink still beat it. A `shard` can be cancelled at
  // runtime by a reporter calling skipSharding().
  //
  // The run's report ends the argument by not entering it. A key that narrows
  // shows up as a project with nothing executed; a key that is a no-op shows up
  // as nothing at all. The question "does this value actually narrow?" —
  // answered wrong six times across three spellings of "empty" and two of
  // "matches everything" — is no longer asked by anyone here.

  // REPORTERS ARE NO LONGER VETTED BY NAME. A reporter's preprocess() can call
  // testRun.exclude() on every test, and this gate used to refuse any reporter
  // absent from the installed Playwright's `builtInReporters` — a derived list,
  // but still a rule about which reporters are TRUSTED rather than an
  // observation of what they DID.
  //
  // A reporter that empties the run produces a report with nothing executed, and
  // the bands go uncovered. #335 set this as the criterion for whether the
  // rewrite had actually moved from predicting to observing: if the new stage
  // still needed the reporter allowlist, it had not.
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
  // Playwright found zero tests. Round 14.
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
  // THE JOIN IS BY PROJECT NAME, so two projects that share one are
  // indistinguishable — whichever ran would certify both bands. Playwright has
  // no trouble telling them apart; this gate cannot, because the run's report
  // identifies a result only by `projectName`.
  //
  // An unnamed project reports `projectName: ""`, so the empty string is the key
  // for "no name" on BOTH sides and two nameless projects collide exactly as two
  // projects called `same` do — one rule covers both. The listing-era rule about
  // names containing `] ›` is gone with the listing: the report carries the name
  // as a JSON string, so nothing has to be parsed back out of prose.
  const keyOf = p => ((p && typeof p.name === 'string') ? p.name : '');
  const keys = projects.map(keyOf);
  const dupes = [...new Set(keys.filter((n, i2, a) => a.indexOf(n) !== i2))];
  if (dupes.length) {
    die(18, [
      'CANNOT CHECK: two or more projects share a name.',
      `  ${dupes.map(n => (n === '' ? '(no name)' : n)).join(', ')}`,
      '  The run reports each result by project NAME, so tests belonging to one of',
      '  them would certify the other\'s band. Give every project a distinct name;',
      '  Playwright accepts any string and the names appear in the run\'s output.',
      '  test.md -> UI coverage gates, fifth gate.',
    ]);
  }
  const cover = { laptop: [], tablet: [], phone: [] };
  const rows = [];
  for (const p of projects) {
    const name = keyOf(p);
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
    // `width` is the NUMBER, for the parent to band; `w` and `band` are this
    // process's own display strings and the parent reads neither.
    rows.push({ name, w: `${vp.width}x${vp.height}`, band, width: vp.width });
    cover[band].push(name);
  }
  for (const r of rows) {
    console.log(`  ${String(r.name === '' ? '(no name)' : r.name).padEnd(18)} ${String(r.w).padEnd(12)} ${r.band}`);
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
  // NO `cover`. The parent bands the rows itself (#347 round 11): a map computed
  // here is a conclusion drawn with whatever the config left of the runtime, and
  // the nonce proves only who wrote it. `cover` is still used BELOW for this
  // process's own refusal message, which is allowed to be wrong in the safe
  // direction — a corrupted child refusing is not a false pass.
  report({ rows, configPath, testsDir: TESTS_DIR });
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
