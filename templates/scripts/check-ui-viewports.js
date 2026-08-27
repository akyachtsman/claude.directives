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
// That is the whole design.
//
// SILENCE MEANS "CHECKED AND FINE", NEVER "COULD NOT LOOK". Every failure has its
// own exit code and its own printed line:
//   0  three classes DECLARED — a config read, never an observed run (#335)
//   1  checked — a class is undeclared (the gate FAILED)
//   2  tests dir not found
//   3  no Playwright config in the tests dir
//   4  @playwright/test not resolvable from the config (CANNOT CHECK)
//   5  importing the config threw, or its export is unusable (CANNOT CHECK)
//   6  zero projects resolved
//   7  reached exit 0 without a verdict — the backstop (a config that calls
//      process.exit(0) at import time would otherwise pass silently)
//   8  usage error (nonsensical band bounds)
//   9  a TOP-LEVEL test-selection key is PRESENT (CANNOT CHECK) — flagged on
//      presence alone; this gate does not decide whether it actually narrows
//  10  a non-built-in reporter is configured (CANNOT CHECK) — its preprocess()
//      can exclude every test; built-ins are read from the installed Playwright
//  11  that built-in reporter list could not be read (CANNOT CHECK) — the
//      discriminator for 10 is unavailable, so no reporter can be vouched for
//  12  a band is DECLARED at the right width but only by projects carrying
//      selection keys (CANNOT CHECK) — distinct from 1, which is a band no
//      project declares at all
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

const { existsSync, statSync } = require('fs');
const { createRequire } = require('module');
const { pathToFileURL } = require('url');
const { resolve, join, isAbsolute, dirname } = require('path');

let verdict = false;
process.on('exit', code => {
  if (code === 0 && !verdict) {
    console.error('FAIL: check-ui-viewports reached exit 0 without recording a verdict.');
    console.error('      Something ended the process before the gate was evaluated (a config');
    console.error('      that calls process.exit() at import time does exactly this).');
    console.error('check-ui-viewports: FAIL (code 7)');
    process.exitCode = 7;
  }
});

function die(code, lines) {
  for (const l of lines) console.error(l);
  console.error(`check-ui-viewports: FAIL (code ${code})`);
  verdict = true;
  process.exit(code);
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

console.log(`tests dir: ${resolve(dir)}  (source: ${dirSource})`);
console.log(`bands (${bandSource}): phone <${TABLET_MIN}px | tablet ${TABLET_MIN}-${LAPTOP_MIN - 1}px | laptop >=${LAPTOP_MIN}px`);

if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  die(2, [
    `CANNOT CHECK: tests dir does not exist: ${resolve(dir)}`,
    `  resolved from: ${dirSource}`,
    '  order tried:   --tests-dir, then $UI_TESTS_DIR, then .github/scripts/ui-tests',
    '  This is NOT a pass — the viewport gate was not evaluated.',
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
  configPath = isAbsolute(explicit) ? explicit : resolve(explicit);
  if (!existsSync(configPath)) {
    die(3, [`CANNOT CHECK: --config path does not exist: ${configPath}`, '  This is NOT a pass.']);
  }
} else {
  const present = CONFIG_NAMES.filter(n => existsSync(join(dir, n)));
  if (!present.length) {
    die(3, [
      `CANNOT CHECK: no Playwright config in ${resolve(dir)}`,
      `  looked for: ${CONFIG_NAMES.join(', ')}`,
      '  This is NOT a pass — the viewport gate was not evaluated.',
    ]);
  }
  if (present.length > 1) {
    console.log(`NOTE: ${present.length} configs present — Playwright reads ${present[0]}, shadowing ${present.slice(1).join(', ')}`);
  }
  configPath = resolve(join(dir, present[0]));
}
console.log(`config:    ${configPath}`);

(async () => {
  // --- 3. Precondition probe BEFORE the import, so "no node_modules" can never be
  // mistaken for "the config is broken". Resolves exactly as Node will when the
  // config's own `import ... from '@playwright/test'` runs.
  try {
    createRequire(pathToFileURL(configPath)).resolve('@playwright/test');
  } catch (e) {
    die(4, [
      'CANNOT CHECK: @playwright/test is not resolvable from the config.',
      `  config: ${configPath}`,
      `  ${(e && (e.code || e.name)) || 'Error'}: ${String(e && e.message).split('\n')[0]}`,
      '  In CI this step must run AFTER the ui-suite composite\'s "Install test dependencies".',
      `  Locally: (cd ${dir} && npm install --no-package-lock --ignore-scripts)`,
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
  // Fixed here rather than in the composite deliberately: a caller invoking this
  // script directly gets the same guarantee, and there is no second place to keep
  // in step. configPath is already absolute, so nothing below depends on cwd.
  try {
    process.chdir(dirname(configPath));
    // process.chdir() does NOT update process.env.PWD — Node leaves it at the
    // value the shell exported. A config reading PWD would still see the repo
    // root while cwd said otherwise, so round 9's fix moved ONE of the two
    // cwd-derived inputs. Codex, round 10. Verified: after chdir, cwd changed
    // and process.env.PWD had not.
    process.env.PWD = process.cwd();
  } catch (e) {
    die(5, [
      'CANNOT CHECK: cannot enter the config\'s directory to evaluate it.',
      `  ${dirname(configPath)}`,
      `  ${(e && e.message) || e}`,
      '  Playwright evaluates the config from there, so reading it from elsewhere',
      '  can produce a different config. Refusing rather than reading the wrong one.',
    ]);
  }
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
    // root filter on every project — exit 9 for the entire fleet. Recorded on
    // #335, because it constrains the rewrite too.
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
  // is test selection is declared at the root, this gate stops. Not because that
  // key necessarily narrows anything — several of the flagged shapes provably do
  // not — but because this gate has no way to establish that it does not, and its
  // own anti-silence rule says "could not look" gets a loud exit, never a pass.
  //
  // The cost is real and is accepted deliberately: a config whose root key is a
  // genuine no-op is refused. The diagnostic says so outright rather than
  // implying the config is broken. That direction is safe; the other is not.
  //
  // testDir is NOT checked here — four predicates across three rounds and a
  // symlink hole remained. It belongs to #335.
  const SELECTION_KEYS = ['grep', 'grepInvert', 'testMatch', 'testIgnore', 'shard'];
  const rootFilters = SELECTION_KEYS.filter(k => cfg[k] !== undefined);

  if (rootFilters.length) {
    die(9, [
      `FAIL: the config declares TOP-LEVEL ${rootFilters.join(', ')} — CANNOT CHECK.`,
      '  This gate stops whenever a root-level test-selection key is declared. It',
      '  does NOT claim your key narrows the run: it cannot tell either way, and it',
      '  will not certify per-band coverage it cannot attribute.',
      '  If the key is a no-op, this is a conservative refusal. That is deliberate.',
      '  To clear it, the key has to stop being declared at the root for the run',
      '  this gate is certifying — either move it onto the projects that are NOT',
      '  providing viewport coverage, or drop it from this run entirely.',
      '  NOT by relocating it to the CI command line. This gate reads a config; it',
      '  cannot see the arguments `playwright test` is invoked with, so a selection',
      '  flag moved there is simply outside what it can inspect — the refusal turns',
      '  into a pass without anything about the run having been established.',
      '  test.md -> UI coverage gates, fifth gate.',
    ]);
  }

  // REPORTERS CAN REMOVE TESTS, so a reporter this gate cannot vouch for is a
  // CANNOT CHECK. A reporter's preprocess() receives a TestRun and may call
  // exclude(), skip() or skipSharding() on any test — public API in 1.62.1.
  // Reproduced 2026-08-27: three correctly banded projects plus a reporter
  // calling testRun.exclude() on every test runs ZERO scenarios, and this gate
  // exited 0 naming all three bands.
  //
  // I first declined to check this, on the grounds that separating "custom" from
  // "built-in" needs a version-dependent name list — the same enumerate-vs-derive
  // move that produced seventeen findings on this PR. Codex answered it in round
  // 8: the installed Playwright EXPORTS the list, so it is derived, not
  // maintained. That distinction is the whole point and I had collapsed it.
  //
  //   require('playwright/lib/common').builtInReporters
  //   -> ["list","line","dot","json","junit","null","github","html","blob"]
  //
  // Version-matched by construction: it comes from the same install the run uses.
  // A built-in is Playwright's own code and is trusted here; anything else is
  // arbitrary user code with the power to empty the run, and gets a loud exit.
  //
  // If that export ever moves, this fails LOUDLY (exit 11) rather than silently
  // trusting every reporter — the difference between a check that stopped working
  // and a check that says nothing, which is this file's founding subject.
  let builtInReporters;
  try {
    const mod = createRequire(pathToFileURL(configPath))('playwright/lib/common');
    builtInReporters = mod && mod.builtInReporters;
    if (!Array.isArray(builtInReporters) || builtInReporters.length === 0) {
      throw new Error('builtInReporters is not a non-empty array');
    }
  } catch (e) {
    die(11, [
      'CANNOT CHECK: cannot read the installed Playwright\'s built-in reporter list.',
      `  ${(e && e.message) || e}`,
      '  This gate needs it to tell a Playwright reporter from arbitrary user code,',
      '  because a reporter\'s preprocess() can exclude every test in the run.',
      '  It is read from the INSTALLED package (playwright/lib/common) rather than',
      '  hard-coded, so it cannot go stale — but it can move between versions.',
      '  Refusing here is deliberate: the alternative is trusting every reporter.',
      '  test.md -> UI coverage gates, fifth gate.',
    ]);
  }
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
  const envReporter = process.env.PW_TEST_REPORTER;
  // reporter accepts a bare id, a [id, options] pair, or an array of either.
  const reporterIds = (r => {
    if (r === undefined) return [];
    const one = e => (Array.isArray(e) ? e[0] : e);
    return (Array.isArray(r) && !(typeof r[0] === 'string' && r.length === 2 && typeof r[1] === 'object')
      ? r.map(one)
      : [one(r)]).filter(x => typeof x === 'string');
  })(cfg.reporter);
  if (envReporter) reporterIds.push(envReporter);
  const foreignReporters = reporterIds.filter(id => !builtInReporters.includes(id));
  if (foreignReporters.length) {
    die(10, [
      `FAIL: non-built-in reporter(s) in effect: ${foreignReporters.join(', ')} — CANNOT CHECK.`,
      ...(envReporter && foreignReporters.includes(envReporter)
        ? ['  One of these comes from PW_TEST_REPORTER, not from the config: the runner',
           '  appends it regardless of what `reporter` says. Clear that variable for both',
           '  the check and the run, or point it at a built-in.']
        : []),
      '  A reporter\'s preprocess() can call testRun.exclude() or .skip() on any',
      '  test, so a run can execute nothing while every band is declared. This gate',
      '  reads a config; it cannot execute your reporter to find out.',
      `  Built-in reporters are accepted (from the installed Playwright): ${builtInReporters.join(', ')}.`,
      '  This does NOT say your reporter removes tests — only that nothing here can',
      '  establish that it does not.',
      '  test.md -> UI coverage gates, fifth gate.',
    ]);
  }

  // Playwright merges top-level `use` into each project at RUNTIME, but
  // defineConfig() does not do it at authoring time (measured 2026-08-26), so do it
  // here. An unset viewport falls through to Playwright's documented 1280x720
  // default; `viewport: null` is an explicit "no fixed viewport" and must NOT fall
  // through, which is why this tests `!== undefined` rather than truthiness.
  const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
  // A project that restricts its test set may declare a width and still never run
  // the UI suite — round 2 of #280 found exactly that. Such a project is printed
  // with its width but does NOT count toward a band: the conservative direction is
  // a false alarm naming the project, never a false pass.
  const CONFIG_DIR = dirname(configPath);
  const resolveDir = d => resolve(CONFIG_DIR, String(d));
  const RESTRICTORS = ['testMatch', 'testIgnore', 'grep', 'grepInvert'];
  const cover = { laptop: [], tablet: [], phone: [] };
  const rows = [];
  for (const p of projects) {
    const name = (p && p.name) || '(unnamed)';
    const vp = p && p.use && p.use.viewport !== undefined ? p.use.viewport
      : cfg.use && cfg.use.viewport !== undefined ? cfg.use.viewport
        : DEFAULT_VIEWPORT;
    const restricted = RESTRICTORS.filter(k => p && p[k] !== undefined);
    // RESOLVED paths, not spellings. A project redundantly declaring the root's
    // own directory as 'tests' against a root './tests' is not restricted, and
    // the string test called it so — reported as a missing band on a config
    // Playwright runs fine. Round 3 made exactly this fix for the ROOT testDir
    // and it never reached this separate per-project comparison (Codex, round
    // 10); the same reasoning applies unchanged, because normalising a path is
    // decidable where inferring which spec is the suite is not.
    if (p && p.testDir !== undefined
        && resolveDir(p.testDir) !== resolveDir(cfg.testDir === undefined ? '.' : cfg.testDir)) {
      restricted.push('testDir');
    }
    if (vp === null) {
      rows.push({ name, w: 'null', band: 'UNCLASSIFIABLE (viewport: null — no fixed viewport)', restricted });
      continue;
    }
    if (typeof vp !== 'object' || !Number.isFinite(vp.width)) {
      rows.push({ name, w: JSON.stringify(vp), band: 'UNCLASSIFIABLE (malformed viewport)', restricted });
      continue;
    }
    const band = vp.width >= LAPTOP_MIN ? 'laptop' : vp.width >= TABLET_MIN ? 'tablet' : 'phone';
    rows.push({ name, w: `${vp.width}x${vp.height}`, band, restricted });
    if (!restricted.length) cover[band].push(name);
  }
  for (const r of rows) {
    const tail = r.restricted.length ? `  RESTRICTED by ${r.restricted.join(', ')} — NOT counted` : '';
    console.log(`  ${String(r.name).padEnd(18)} ${String(r.w).padEnd(12)} ${r.band}${tail}`);
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
  const bandProjects = b => rows.filter(r => r.band === b);
  const undeclared = ['laptop', 'tablet', 'phone'].filter(b => bandProjects(b).length === 0);
  const unattributable = ['laptop', 'tablet', 'phone']
    .filter(b => cover[b].length === 0 && bandProjects(b).length > 0);
  if (undeclared.length) {
    for (const b of undeclared) console.error(`FAIL: no project declares a ${b} viewport.`);
    console.error('  global.md requires laptop, tablet AND phone. This config is the only place');
    console.error('  the UI suite gets its widths, and exactly one test sets its own (S4, at 390),');
    console.error('  so no scenario is ever rendered at the missing width.');
    console.error('  test.md -> UI coverage gates, fifth gate.');
    verdict = true;
    console.error('check-ui-viewports: FAIL (code 1)');
    process.exit(1);
  }
  if (unattributable.length) {
    for (const b of unattributable) {
      const who = bandProjects(b).map(r => `${r.name} (${r.restricted.join(', ')})`).join('; ');
      console.error(`FAIL: ${b} is declared only by projects carrying selection keys — CANNOT CHECK.`);
      console.error(`  ${who}`);
    }
    console.error('  Those projects are at the right width. This gate reads a config and cannot');
    console.error('  tell whether their selection keys exclude the UI suite, so it will not');
    console.error('  certify the band. It does NOT claim they do exclude it — if the key is a');
    console.error('  no-op, this is a conservative refusal, and that is the deliberate direction.');
    console.error('  Clear it by leaving at least one project per band without selection keys.');
    console.error('  test.md -> UI coverage gates, fifth gate.');
    verdict = true;
    console.error('check-ui-viewports: FAIL (code 12)');
    process.exit(12);
  }
  // SCOPE THE SUCCESS CLAIM. "OK" here means the config DECLARES an unrestricted
  // project in each band — not that any scenario will execute at those widths.
  // This gate reads a config object; it never observes a run. A custom reporter's
  // preprocess() can exclude every test at runtime (reproduced 2026-08-27) and
  // nothing in a config read can see it. Saying "declared" rather than "covered"
  // costs nothing and stops this line being quoted as proof of coverage it does
  // not establish — which is the same fail-open shape, moved into the wording.
  console.log(`check-ui-viewports: OK — DECLARED laptop:${cover.laptop.join('/')}  tablet:${cover.tablet.join('/')}  phone:${cover.phone.join('/')}`);
  console.log('  (declared, not executed: a config read cannot observe a run — see #335)');
  verdict = true;
})().catch(err => die(5, ['CANNOT CHECK: unexpected failure inside check-ui-viewports.',
  `  ${(err && err.stack) || err}`]));
