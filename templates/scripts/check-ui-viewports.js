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
//
// So: IMPORT the config and let Node evaluate it. Spread order, quoting, comments
// and the device table all stop mattering, because JavaScript does the resolving.
// That is the whole design.
//
// SILENCE MEANS "CHECKED AND FINE", NEVER "COULD NOT LOOK". Every failure has its
// own exit code and its own printed line:
//   0  three classes covered
//   1  checked — a class is uncovered (the gate FAILED)
//   2  tests dir not found
//   3  no Playwright config in the tests dir
//   4  @playwright/test not resolvable from the config (CANNOT CHECK)
//   5  importing the config threw, or its export is unusable (CANNOT CHECK)
//   6  zero projects resolved
//   7  reached exit 0 without a verdict — the backstop (a config that calls
//      process.exit(0) at import time would otherwise pass silently)
//   8  usage error (nonsensical band bounds)
//   9  a TOP-LEVEL test-selection filter narrows the run (CANNOT CHECK)
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
  let cfg;
  try {
    const mod = await import(pathToFileURL(configPath).href);
    cfg = mod.default !== undefined ? mod.default : mod;
  } catch (e) {
    const hint = e && e.code === 'ERR_UNKNOWN_FILE_EXTENSION'
      ? ['  This Node cannot import a TypeScript config. Run this step on Node >= 22.18',
        '  (type stripping is on by default there), or keep a playwright.config.js.']
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
      '  Every test then runs in ONE implicit project, so three classes cannot be covered.',
      '  test.md -> UI coverage gates, fifth gate.']);
  }
  if (projects.length === 0) {
    die(6, ['FAIL: the config declares an EMPTY `projects` array — zero projects resolved.',
      '  test.md -> UI coverage gates, fifth gate.']);
  }

  // TOP-LEVEL test selection defeats per-project coverage entirely. Playwright
  // INTERSECTS `grep`/`grepInvert`/`testMatch`/`testIgnore` declared at the config
  // root with each project's own selection, so three perfectly-banded projects can
  // schedule ZERO scenarios and this gate would otherwise print a confident OK.
  // Reported by claude.trading from a Codex finding on their #283 and reproduced
  // here 2026-08-26: a config with laptop+tablet+phone projects plus a root
  // `grep: /__NEVER_MATCHES_ANY_TEST__/` exited 0 with all three classes named.
  //
  // Whether the suite survives a root filter is not statically decidable here —
  // `grep` matches test TITLES, which live inside the spec files. So this is a
  // CANNOT CHECK, not a FAIL and emphatically not a pass: per this file's own
  // anti-silence rule, "could not look" gets its own loud exit code.
  // POSITIVE filters (`grep`, `testMatch`) select what runs; NEGATIVE ones
  // (`grepInvert`, `testIgnore`) subtract from it. That asymmetry decides how an
  // EMPTY array is read, and getting it backwards fails in opposite directions:
  //   testIgnore: []   subtracts nothing  -> harmless, flagging it is a false alarm
  //   testMatch: []    selects nothing    -> maximally narrowing, MUST still flag
  // So emptiness exempts a negative filter and never a positive one. A non-array
  // value (a bare RegExp or string) is a real filter whatever its side.
  const POSITIVE_FILTERS = ['grep', 'testMatch'];
  const NEGATIVE_FILTERS = ['grepInvert', 'testIgnore'];
  const narrows = k => {
    const v = cfg[k];
    if (v === undefined) return false;
    // Only a NEGATIVE filter can be emptied into a no-op — and "empty" has two
    // spellings, both of which Playwright treats as excluding nothing: `[]` and
    // `''`. Round 1 of #333 covered the array; round 3 found the string, which
    // fell through to CANNOT CHECK on an unrestricted suite. A POSITIVE filter is
    // never exempt: `testMatch: ''` selects nothing, which is maximal narrowing.
    if (NEGATIVE_FILTERS.includes(k)) {
      if (Array.isArray(v) && v.length === 0) return false;
      if (typeof v === 'string' && v === '') return false;
    }
    return true;
  };
  // `testDir` is not a filter but it REDIRECTS discovery wholesale, which reaches
  // the same end by a shorter road: every project resolves against it, so a root
  // `testDir: './other'` runs whatever is in ./other and the UI suite is simply
  // never scheduled. Codex found this on round 2 of #333 and reproduced it with a
  // single unrelated passing spec; before this branch the gate exited 0 and named
  // all three bands. The per-project check below cannot catch it either — it
  // compares `p.testDir` against `cfg.testDir`, so an INHERITED redirect reads as
  // unrestricted.
  //
  // This guard cannot know which spec IS the UI suite, so a non-default testDir is
  // a CANNOT CHECK rather than a FAIL: the config may be perfectly good and the
  // suite may well live there, but nothing here can establish it.
  // Compare RESOLVED paths, never spellings. `'tests'`, `'./tests/'` and an
  // absolute path all resolve to the same directory as `'./tests'`, and round 3
  // caught the strict string test hard-failing every one of them. This is the
  // false-alarm direction, so it gets the same treatment as round 1's empty
  // arrays. Codex also pointed out my diagnostic's advice was wrong: changing
  // --tests-dir does not alter the spelling the config exports.
  //
  // Path normalisation is a resolver, and this file otherwise prefers CANNOT
  // CHECK to one — but the reasoning does not transfer: normalising a path is
  // decidable, whereas inferring WHICH spec is the UI suite is not. Refusing to
  // do the decidable thing is just a false alarm wearing a principle.
  const SHIPPED_TEST_DIR = './tests';
  const rootFilters = [...POSITIVE_FILTERS, ...NEGATIVE_FILTERS].filter(narrows);
  const CONFIG_DIR = dirname(configPath);
  const resolveDir = d => resolve(CONFIG_DIR, String(d));
  if (cfg.testDir !== undefined && resolveDir(cfg.testDir) !== resolveDir(SHIPPED_TEST_DIR)) {
    die(9, [
      `FAIL: the config declares a root testDir of ${JSON.stringify(cfg.testDir)} — CANNOT CHECK.`,
      `  Every project resolves against it, so the widths below describe whatever lives`,
      `  there, not necessarily the UI suite. The shipped kit uses ${JSON.stringify(SHIPPED_TEST_DIR)};`,
      '  this gate cannot tell which spec is the suite, so it will not certify coverage',
      '  it cannot attribute.',
      `  If the suite genuinely lives there, run the gate against that directory so`,
      `  testDir reads as ${JSON.stringify(SHIPPED_TEST_DIR)} relative to it.`,
      '  test.md -> UI coverage gates, fifth gate.',
    ]);
  }
  // TWO MORE ways the root config keeps the suite from running, both found by
  // Codex on round 3 of #333 and both reproduced against Playwright 1.62.1. Each
  // is a REDIRECT/PARTITION rather than a filter, which is why enumerating
  // "filters" missed them — see #335 for why this enumeration is the wrong shape
  // and what replaces it.
  //
  // respectGitIgnore is DELIBERATELY NOT CHECKED HERE. Round 3 added a probe for a
  // .gitignore under testDir; round 4 found it wrong three separate ways, and the
  // three together are the argument for #335 rather than for a fourth attempt:
  //   * Playwright honours ignores only "if neither testConfig.testDir nor
  //     testProject.testDir are explicitly specified" (installed 1.62.1 types), and
  //     the shipped kit DOES set testDir — so the probe false-alarmed on the
  //     default it was written for.
  //   * respectGitIgnore is also a PROJECT option, so a root `false` with one
  //     project overriding to `true` bypassed a root-only test entirely.
  //   * .gitignore files nest: tests/sub/.gitignore suppresses the suite and a
  //     direct testDir/.gitignore probe never sees it.
  // Getting this right needs Playwright's conditional default, per-project
  // resolution, recursive ignore discovery AND gitignore pattern matching against
  // spec paths — a resolver, which is exactly what #335 replaces with `--list`.
  // A broken check here would be worse than none: it false-alarms (and gets muted)
  // AND misses the real case. Both failure modes at once.

  // shard: PARTITIONS the discovered set across runs. With total > 1 a single run
  // carries only its slice, so a band can be declared and never exercised in that
  // run — reproduced with { current: 1, total: 4 }, where only the desktop project
  // listed tests and shard 4 listed none, both reported as full coverage.
  const shard = cfg.shard;
  if (shard && typeof shard === 'object' && Number(shard.total) > 1) {
    die(9, [
      `FAIL: the config shards the run (total: ${shard.total}) — CANNOT CHECK.`,
      '  A shard carries only part of the discovered set, so a project can declare a',
      '  width and execute nothing in this run. Coverage is a property of the whole',
      '  suite, which no single sharded run observes.',
      '  Shard from the CI matrix rather than the config, or drop it to check coverage.',
      '  test.md -> UI coverage gates, fifth gate.',
    ]);
  }

  if (rootFilters.length) {
    die(9, [
      `FAIL: the config declares TOP-LEVEL ${rootFilters.join(', ')} — CANNOT CHECK.`,
      '  Playwright intersects a root-level filter with every project, so the widths',
      '  below say nothing about what would actually run: all three classes can be',
      '  declared while zero scenarios are scheduled.',
      '  Fix by moving the filter onto the projects that are NOT providing viewport',
      '  coverage, so each banded project selects the UI suite unconditionally.',
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
  const RESTRICTORS = ['testMatch', 'testIgnore', 'grep', 'grepInvert'];
  const cover = { laptop: [], tablet: [], phone: [] };
  const rows = [];
  for (const p of projects) {
    const name = (p && p.name) || '(unnamed)';
    const vp = p && p.use && p.use.viewport !== undefined ? p.use.viewport
      : cfg.use && cfg.use.viewport !== undefined ? cfg.use.viewport
        : DEFAULT_VIEWPORT;
    const restricted = RESTRICTORS.filter(k => p && p[k] !== undefined);
    if (p && p.testDir !== undefined && p.testDir !== cfg.testDir) restricted.push('testDir');
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

  const missing = ['laptop', 'tablet', 'phone'].filter(b => cover[b].length === 0);
  if (missing.length) {
    for (const b of missing) console.error(`FAIL: no unrestricted project covers ${b} width.`);
    console.error('  global.md requires laptop, tablet AND phone. This config is the only place');
    console.error('  the UI suite gets its widths, and exactly one test sets its own (S4, at 390),');
    console.error('  so every other scenario simply never executes at the missing width.');
    console.error('  test.md -> UI coverage gates, fifth gate.');
    verdict = true;
    console.error('check-ui-viewports: FAIL (code 1)');
    process.exit(1);
  }
  console.log(`check-ui-viewports: OK — laptop:${cover.laptop.join('/')}  tablet:${cover.tablet.join('/')}  phone:${cover.phone.join('/')}`);
  verdict = true;
})().catch(err => die(5, ['CANNOT CHECK: unexpected failure inside check-ui-viewports.',
  `  ${(err && err.stack) || err}`]));
