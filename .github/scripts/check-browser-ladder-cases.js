#!/usr/bin/env node
// check-browser-ladder-cases.js — the browser ladder's own guard.
//
// WHY IT EXISTS. `templates/scripts/browser-ladder.js` encodes the one rule that
// survived four failed attempts to state it in prose (#332): grade on whether
// the browser LAUNCHES, never on an install's exit code, and never let a
// dependency-phase abort stand in for "unavailable". Nothing else in this repo
// runs it -- this repo's own suite drives chromium directly -- so without these
// cases it is shipped, exported, and unexercised.
//
// It also cannot be exercised the obvious way. Actually running the ladder needs
// a network and up to three browser downloads, and the branches worth pinning
// are the FAILING ones: no privileges, a blocked download, a binary that will
// not start. Those cannot be produced on demand in CI.
//
// So the two effects -- install and launch -- are injected, and every case
// drives the SHIPPED `ladder()` that the CLI itself calls. The logic under test
// is the logic that runs.
//
// WHAT THAT DOES NOT PROVE, stated because a stub is a claim about the world:
// these cases prove the ladder REACTS correctly to a given install/launch
// outcome. They do not prove `npx playwright install` behaves as the stubs say,
// nor that `--with-deps` really orders installDeps first. Those are facts about
// Playwright, cited in the script's header from its source, and a change there
// would leave every case here green. The rung ORDER is pinned as a literal for
// exactly that reason: if the fact changes, the pin is what gets re-read.

// `.github/scripts/package.json` declares "type": "module", while the shipped
// ladder is CommonJS like every other file in `templates/scripts/`. createRequire
// loads it as the CJS module it is, rather than converting the shipped file to
// suit its own test.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
// BROWSER_LADDER_BIN drives a mutated copy, so discrimination is re-proved
// rather than asserted.
const LADDER = process.env.BROWSER_LADDER_BIN
  || join(HERE, '..', '..', 'templates', 'scripts', 'browser-ladder.js');
const { ladder, report, RUNGS, realInstall, realLaunch, classifyInstall,
  INSTALL_MAX_BUFFER, parseArgs, DEFAULT_TESTS_DIR } = require(LADDER);
import { tmpdir } from 'os';
import { mkdtempSync, realpathSync } from 'fs';
import { spawnSync } from 'child_process';

const OK = { ok: true, error: null };
const fail = (msg) => ({ ok: false, error: msg });

/** Build stubs whose launch outcome depends on which rungs have run. */
function scripted(launchResults) {
  const installs = [];
  let i = 0;
  return {
    installs,
    install: (argv) => {
      const planned = launchResults[i] || {};
      installs.push(argv.join(' '));
      return { code: planned.installCode == null ? 0 : planned.installCode,
               output: planned.installOutput || '' };
    },
    launch: () => {
      const planned = launchResults[i] || {};
      i += 1;
      return planned.launch || fail('no launch planned');
    },
  };
}

const cases = [];
const failures = [];

async function check(label, fn) {
  cases.push(label);
  try {
    // AWAITED. Without this an async case's thrown assertion arrives as an
    // unhandled rejection after `OK` has already been printed, so every failing
    // case reports as a passing one -- the fail-open family (#323) inside the
    // very harness meant to catch it. Found by this file's own first run.
    await fn();
    console.log(`OK:   ${label}`);
  } catch (err) {
    failures.push(`${label}\n      ${err.message}`);
  }
}

function eq(actual, expected, what) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

(async () => {
  // ── the rung order is the fix for defect 3, so it is pinned literally ───────
  // A plain install must precede `--with-deps`. Reversed, a privilege failure in
  // the dependency phase aborts BEFORE the download, and the launch that follows
  // fails because nothing was ever fetched -- a ceiling manufactured by the
  // ladder itself. This is the single most reversible line in the file and the
  // one whose reversal is hardest to notice.
  await check('the rungs are as-is, then plain install, then --with-deps', () => {
    eq(RUNGS.map((r) => r.name), ['as-is', 'install', 'install --with-deps'], 'rung order');
    eq(RUNGS[0].argv, null, 'first rung installs nothing');
    eq(RUNGS[1].argv('chromium'), ['playwright', 'install', 'chromium'], 'second rung');
    eq(RUNGS[2].argv('chromium'), ['playwright', 'install', '--with-deps', 'chromium'],
       'third rung');
  });

  // ── issue branch 1: already in the image ───────────────────────────────────
  await check('branch 1 — a browser already present launches with NO install', async () => {
    const s = scripted([{ launch: OK }]);
    const out = await ladder({ browser: 'chromium', install: s.install, launch: s.launch });
    eq(out.ok, true, 'verdict');
    eq(out.rung, 'as-is', 'rung');
    eq(s.installs, [], 'no install was attempted');
  });

  // ── issue branch 2: absent, download works, libraries sufficient ───────────
  await check('branch 2 — absent, plain install is enough', async () => {
    const s = scripted([
      { launch: fail("Executable doesn't exist at /root/.cache/ms-playwright/...") },
      { launch: OK },
    ]);
    const out = await ladder({ browser: 'chromium', install: s.install, launch: s.launch });
    eq(out.ok, true, 'verdict');
    eq(out.rung, 'install', 'rung');
    eq(s.installs, ['playwright install chromium'], 'only the plain install ran');
  });

  // ── issue branch 3: libraries missing, privileges available ───────────────
  await check('branch 3 — libraries missing, --with-deps rescues it', async () => {
    const s = scripted([
      { launch: fail("Executable doesn't exist") },
      { launch: fail('error while loading shared libraries: libnss3.so') },
      { launch: OK },
    ]);
    const out = await ladder({ browser: 'chromium', install: s.install, launch: s.launch });
    eq(out.ok, true, 'verdict');
    eq(out.rung, 'install --with-deps', 'rung');
    eq(s.installs, ['playwright install chromium', 'playwright install --with-deps chromium'],
       'plain install ran BEFORE --with-deps');
  });

  // ── issue branch 4: libraries missing, NO privileges ──────────────────────
  // The defect-3 case, and the reason for the whole ordering. `--with-deps`
  // aborts in its dependency phase without downloading anything -- but the plain
  // rung already fetched the binary, so the final launch error is the REAL one
  // (missing libraries) rather than "executable doesn't exist".
  await check('branch 4 — no privileges: the ceiling quotes the library error, not the abort', async () => {
    const s = scripted([
      { launch: fail("Executable doesn't exist") },
      { launch: fail('error while loading shared libraries: libnss3.so') },
      { installCode: 1,
        installOutput: 'Installing dependencies...\nERROR: must be run as root',
        launch: fail('error while loading shared libraries: libnss3.so') },
    ]);
    const out = await ladder({ browser: 'chromium', install: s.install, launch: s.launch });
    eq(out.ok, false, 'verdict');
    const last = out.attempts[out.attempts.length - 1];
    if (!/libnss3/.test(last.launch.error)) {
      throw new Error(`the evidence must be the launch error, got ${last.launch.error}`);
    }
    if (/must be run as root/.test(last.launch.error)) {
      throw new Error('the dependency-phase abort must not stand in for the launch error');
    }
  });

  // ── issue branch 5: download blocked ──────────────────────────────────────
  await check('branch 5 — download blocked is a ceiling, and every rung still launched', async () => {
    const blocked = { installCode: 1, installOutput: 'Error: connect ECONNREFUSED cdn.playwright.dev',
                      launch: fail("Executable doesn't exist at /root/.cache/ms-playwright") };
    const s = scripted([{ launch: fail("Executable doesn't exist") }, blocked, blocked]);
    const out = await ladder({ browser: 'chromium', install: s.install, launch: s.launch });
    eq(out.ok, false, 'verdict');
    eq(out.attempts.length, 3, 'every rung was attempted');
    eq(out.attempts.map((a) => a.launch.ok), [false, false, false], 'each rung ended in a launch');
  });

  // ── issue branch 6: present but will not start ────────────────────────────
  await check('branch 6 — installed but will not launch is a ceiling', async () => {
    const wont = fail('Target page, context or browser has been closed');
    const s = scripted([{ launch: wont }, { launch: wont }, { launch: wont }]);
    const out = await ladder({ browser: 'chromium', install: s.install, launch: s.launch });
    eq(out.ok, false, 'verdict');
  });

  // ── the rule itself, in both directions ──────────────────────────────────
  // Defect 2 was reading an install's exit code as the answer. These two cases
  // are the rule stated as a test: a failing install whose launch works is a
  // PASS, and a succeeding install whose launch fails is a CEILING.
  await check('an install that FAILS but whose launch works is not a ceiling', async () => {
    const s = scripted([
      { launch: fail("Executable doesn't exist") },
      { installCode: 1, installOutput: 'some warning on stderr', launch: OK },
    ]);
    const out = await ladder({ browser: 'chromium', install: s.install, launch: s.launch });
    eq(out.ok, true, 'a non-zero install must not decide the verdict');
    eq(out.rung, 'install', 'rung');
  });

  await check('an install that SUCCEEDS but whose launch fails is a ceiling', async () => {
    const s = scripted([
      { launch: fail('no browser') },
      { installCode: 0, launch: fail('still no browser') },
      { installCode: 0, launch: fail('still no browser') },
    ]);
    const out = await ladder({ browser: 'chromium', install: s.install, launch: s.launch });
    eq(out.ok, false, 'exit 0 from install must not buy a pass');
  });

  // ── a non-zero install never short-circuits the ladder ───────────────────
  await check('a failing install does not stop the ladder before the launch', async () => {
    const s = scripted([
      { launch: fail('nope') },
      { installCode: 127, installOutput: 'npx: command not found', launch: fail('nope') },
      { installCode: 127, launch: OK },
    ]);
    const out = await ladder({ browser: 'chromium', install: s.install, launch: s.launch });
    eq(out.ok, true, 'the ladder continued past two failed installs');
    eq(out.rung, 'install --with-deps', 'rung');
  });

  // ── the report is the human-facing half, so pin what it says ─────────────
  await check('the CEILING report quotes the launch error and labels install codes as context', async () => {
    const s = scripted([
      { launch: fail('first') },
      { installCode: 1, installOutput: 'ERROR: must be run as root', launch: fail('second') },
      { installCode: 1, installOutput: 'ERROR: must be run as root', launch: fail('libnss3 missing') },
    ]);
    const out = await ladder({ browser: 'chromium', install: s.install, launch: s.launch });
    const lines = [];
    const code = report('chromium', out, (l) => lines.push(l));
    const text = lines.join('\n');
    eq(code, 1, 'exit code');
    if (!text.includes('CEILING')) throw new Error('report must say CEILING');
    if (!text.includes('libnss3 missing')) throw new Error('report must quote the LAST launch error');
    if (!/context, never the verdict|CONTEXT, never the verdict/.test(text)) {
      throw new Error('report must label install exit codes as context');
    }
    if (!text.includes("CLAUDE.md")) throw new Error('report must say where to record the limit');
  });

  await check('the LAUNCHES report names the rung and claims nothing more', async () => {
    const s = scripted([{ launch: OK }]);
    const out = await ladder({ browser: 'chromium', install: s.install, launch: s.launch });
    const lines = [];
    const code = report('chromium', out, (l) => lines.push(l));
    eq(code, 0, 'exit code');
    const text = lines.join('\n');
    if (!text.includes('LAUNCHES')) throw new Error('report must say LAUNCHES');
    if (!text.includes('as-is')) throw new Error('report must name the rung');
  });

  // ── #355 round 1: a harness failure is CANNOT CHECK, never a ceiling ──────
  // The shipped kit installs @playwright/test under the UI-test directory, so
  // resolving from a repository root finds nothing even when the browser is
  // healthy. Every rung then failed identically and the run ended in CEILING --
  // a limit recorded about the wrong thing.
  await check('a harness failure ends the ladder without a verdict', async () => {
    const s = scripted([
      { launch: { ok: false, harness: true, error: 'playwright could not be resolved' } },
      { launch: OK },
    ]);
    const out = await ladder({ browser: 'chromium', install: s.install, launch: s.launch });
    eq(out.ok, false, 'verdict');
    eq(out.harness, true, 'flagged as a harness problem');
    eq(out.attempts.length, 1, 'it stopped at the first rung');
    eq(s.installs, [], 'and installed nothing for a Playwright it cannot load');
  });

  await check('CANNOT CHECK reports exit 2 and claims nothing about the browser', async () => {
    const s = scripted([{ launch: { ok: false, harness: true, error: 'no playwright here' } }]);
    const out = await ladder({ browser: 'chromium', install: s.install, launch: s.launch });
    const lines = [];
    const code = report('chromium', out, (l) => lines.push(l));
    const text = lines.join('\n');
    eq(code, 2, 'exit code — distinct from both LAUNCHES (0) and CEILING (1)');
    if (!text.includes('CANNOT CHECK')) throw new Error('must say CANNOT CHECK');
    if (text.includes('CEILING')) throw new Error('must NOT report a ceiling');
    if (!text.includes('says nothing about whether the browser works')) {
      throw new Error('must disclaim any browser conclusion');
    }
  });

  // ── #355 round 1: the ladder must not kill the installer it is measuring ──
  // spawnSync's default maxBuffer is ~1 MiB and `--with-deps` apt output exceeds
  // it routinely; on overflow Node SIGTERMs the child, so the install is cut off
  // and the launch fails for a reason the ladder caused.
  await check('a noisy installer is not truncated or killed by the ladder', async () => {
    // ~4 MiB on stdout — comfortably past the old default, well inside the new.
    const out = realInstall(['node', '-e', "process.stdout.write('x'.repeat(4*1024*1024))"]);
    eq(out.code, 0, 'the child ran to completion');
    eq(out.interrupted, undefined, 'and was not interrupted');
    if (out.output.length < 4 * 1024 * 1024) {
      throw new Error(`output was truncated: ${out.output.length} bytes`);
    }
  });

  // An ENOBUFS kill is what the raised buffer exists to avoid, and it cannot be
  // provoked on demand without a 64 MiB installer -- so the CLASSIFICATION is
  // pinned against a synthetic spawnSync result instead. This tests the shipped
  // branch, not a copy of it.
  await check('an install the ladder cut short is marked interrupted, not just non-zero', () => {
    const out = classifyInstall({
      status: null, stdout: 'partial output', stderr: '',
      error: Object.assign(new Error('spawnSync npx ENOBUFS'), { code: 'ENOBUFS' }),
    });
    if (!out.interrupted) throw new Error('an overflow kill must be distinguishable from an exit code');
    if (!/could not run the installer to completion/.test(out.output)) {
      throw new Error(`the reason must be stated, got: ${out.output}`);
    }
  });

  // ── #355 round 4: a signal is an interruption even with no `error` ────────
  // Node reports a signal-terminated child as `status: null, signal: 'SIGTERM'`
  // and sets NO `proc.error`. Keying `interrupted` on `error` alone therefore let
  // a killed installer through as a completed rung with code -1, and the launch
  // that failed for want of the browser it never fetched was reported as a
  // CEILING -- defect 3 through the one door round 3 left open.
  await check('an installer killed by a signal is interrupted even without proc.error', () => {
    const out = classifyInstall({ status: null, signal: 'SIGTERM', stdout: 'half a download', stderr: '' });
    if (!out.interrupted) throw new Error('a signal-terminated install must not read as a completed rung');
    if (!/SIGTERM/.test(out.output)) throw new Error(`the signal must be named, got: ${out.output}`);
    eq(out.code, -1, 'status null still reports -1');
  });

  // The complement, so the rule cannot be satisfied by marking everything
  // interrupted: a plain non-zero exit is still a rung that HAPPENED, and the
  // ladder must climb past it rather than stop with CANNOT CHECK.
  await check('a non-zero install with no signal and no error is NOT interrupted', () => {
    const out = classifyInstall({ status: 1, signal: null, stdout: '', stderr: 'permission denied' });
    eq(out.interrupted, undefined, 'a plain failure is context, not an interruption');
    eq(out.code, 1, 'exit code');
  });

  // And the interruption must actually END the ladder, not merely be labelled.
  await check('a signal-killed installer stops the ladder with CANNOT CHECK', async () => {
    const out = await ladder({
      browser: 'chromium',
      install: () => classifyInstall({ status: null, signal: 'SIGKILL', stdout: '', stderr: '' }),
      launch: () => fail('Executable does not exist'),
    });
    eq(out.ok, false, 'verdict');
    eq(out.interrupted, true, 'interrupted');
    eq(out.attempts.length, 2, 'the as-is rung, then the interrupted install');
    eq(out.attempts[1].launch, null, 'no launch was attempted after the interruption');
    eq(report('chromium', out, () => {}), 2, 'CANNOT CHECK exit code');
  });

  await check('the install buffer is large enough that apt output cannot trip it', () => {
    if (INSTALL_MAX_BUFFER < 16 * 1024 * 1024) {
      throw new Error(`buffer is ${INSTALL_MAX_BUFFER}; Node's ~1 MiB default is what killed the installer`);
    }
  });

  // ── #355 round 1: a clean close is not a healthy browser ─────────────────
  // Browser.close() catches TargetClosedError and resolves, so a browser that
  // starts and dies immediately closed "successfully" and reported ok:true --
  // the exact start-then-die case the code claimed to catch.
  // Round 1 answered this with `isConnected()` before the close. Round 3
  // replaced that with actually USING the browser: a flag sampled at an instant
  // still passed a process that died between the sample and the close. These two
  // cases now exercise the probe, which is what the code does.
  await check('a browser that dies before it can be used is a failure, not a pass', async () => {
    const stub = { chromium: { launch: async () => ({
      isConnected: () => false,
      newContext: async () => { throw new Error('Target closed'); },
      close: async () => {},
    }) } };
    const result = await realLaunch('chromium', '.', stub)();
    eq(result.ok, false, 'a dead browser must not pass');
    if (!/could not be used/.test(result.error)) throw new Error(`error must say why: ${result.error}`);
  });

  await check('a usable browser passes even if closing it throws', async () => {
    const stub = { chromium: { launch: async () => ({
      isConnected: () => true,
      newContext: async () => ({ close: async () => {} }),
      close: async () => { throw new Error('close blew up'); },
    }) } };
    const result = await realLaunch('chromium', '.', stub)();
    eq(result.ok, true, 'the close is cleanup, not the verdict');
  });

  // ── #355 round 2: the installer must run where the harness lives ────────
  // npx resolves the package from its cwd, and the kit installs Playwright under
  // the UI-test directory -- so an installer run from a repository root fetches
  // a different Playwright than the suite uses, or none, and the launch failure
  // that follows reads as a ceiling. Round 1 fixed where Playwright is RESOLVED
  // and left where the installer RUNS.
  // `npx node -e …` — NOT `npx -e …`, which npx eats as its own `--before` flag
  // and answers with a config warning. The first version of these two cases did
  // that: one failed loudly, and the other PASSED, because it only asserted the
  // output was not the process cwd and warning text satisfies that. A case that
  // cannot fail for the right reason is worse than no case.
  // DELIMITED, because npm writes warnings to stderr and `realInstall` merges
  // both streams. In a proxy-configured environment `npm warn Unknown env config
  // "http-proxy"` rode along and BOTH cwd cases failed on an exact comparison --
  // the child had run in the right directory the whole time (Codex, #355).
  // My "21 cases green" was true here and false elsewhere: a suite that depends
  // on the absence of unrelated diagnostics is measuring its environment.
  const CWD_PROBE = ['node', '-e',
    'process.stdout.write("<<CWD:" + process.cwd() + ":CWD>>")'];
  const readCwd = (out) => {
    const m = /<<CWD:([\s\S]*?):CWD>>/.exec(out);
    return m ? m[1] : null;
  };

  await check('the installer runs in the directory it is given', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ladder-cwd-')));
    const out = realInstall(CWD_PROBE, dir);
    const seen = readCwd(out.output);
    if (seen !== dir) {
      throw new Error(`installer ran in ${JSON.stringify(seen)}, expected ${dir}`);
    }
  });

  await check('and it does NOT silently fall back to the process cwd', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ladder-cwd2-')));
    const out = realInstall(CWD_PROBE, dir);
    const seen = readCwd(out.output);
    // Positive assertion, not a negative one: the output must BE the given
    // directory. `!== process.cwd()` was satisfied by any noise at all.
    if (seen !== dir) {
      throw new Error('the cwd argument was ignored — this is the round-1 defect');
    }
    if (seen === process.cwd()) {
      throw new Error('installer ran in the process cwd despite being given another');
    }
  });

  // ── #355 round 3 ────────────────────────────────────────────────────────
  await check('an interrupted install stops the ladder without a browser verdict', async () => {
    const s = scripted([
      { launch: fail('nope') },
      { installCode: -1, installOutput: 'cut short', launch: OK },
    ]);
    // The stub's second rung WOULD launch; an interrupted install must stop
    // before that, because a browser never fetched cannot support a verdict.
    s.install = () => ({ code: -1, output: 'cut short', interrupted: true });
    const out = await ladder({ browser: 'chromium', install: s.install, launch: s.launch });
    eq(out.ok, false, 'verdict');
    eq(out.interrupted, true, 'flagged as interrupted');
    const lines = [];
    eq(report('chromium', out, (l) => lines.push(l)), 2, 'exit 2, not a ceiling');
    if (lines.join('\n').includes('CEILING')) throw new Error('must not report a ceiling');
  });

  await check('a browser that cannot open a context is not launching', async () => {
    const stub = { chromium: { launch: async () => ({
      isConnected: () => true,
      newContext: async () => { throw new Error('Target closed'); },
      close: async () => {},
    }) } };
    const result = await realLaunch('chromium', '.', stub)();
    eq(result.ok, false, 'a browser that cannot be used has not launched');
    if (!/could not be used/.test(result.error)) throw new Error(`error must say why: ${result.error}`);
  });

  await check('a usable browser passes', async () => {
    const stub = { chromium: { launch: async () => ({
      isConnected: () => true,
      newContext: async () => ({ close: async () => {} }),
      close: async () => {},
    }) } };
    eq((await realLaunch('chromium', '.', stub)()).ok, true, 'verdict');
  });

  // ── #355 round 3: argument parsing, which had NO cases and held a P1 ────
  // `browser-ladder.js firefox` ran CHROMIUM for two rounds. The mutant that
  // restores that filter reddens nothing without these, because the parsing
  // lived inside main() where no case could reach it.
  await check('the browser argument survives when --tests-dir is absent', () => {
    eq(parseArgs(['firefox']).browser, 'firefox', 'browser');
    eq(parseArgs(['webkit']).browser, 'webkit', 'browser');
    eq(parseArgs([]).browser, 'chromium', 'default browser');
    eq(parseArgs([]).testsDir, DEFAULT_TESTS_DIR, 'default tests dir');
  });

  await check('the browser argument survives in either order with --tests-dir', () => {
    eq(parseArgs(['firefox', '--tests-dir', 'x']).browser, 'firefox', 'browser after');
    eq(parseArgs(['--tests-dir', 'x', 'firefox']).browser, 'firefox', 'browser before');
    eq(parseArgs(['--tests-dir', 'x', 'firefox']).testsDir, 'x', 'tests dir');
    eq(parseArgs(['firefox', '--tests-dir=x']).testsDir, 'x', '--tests-dir=x form');
    eq(parseArgs(['firefox', '--tests-dir=x']).browser, 'firefox', 'browser with = form');
  });

  await check('an explicitly supplied --tests-dir is distinguishable from the default', () => {
    // `testsDirArg` is what lets a typo refuse while an omitted flag falls back;
    // collapsing the two is the fail-open this round closed.
    eq(parseArgs(['chromium']).testsDirArg, null, 'omitted');
    eq(parseArgs(['chromium', '--tests-dir', 'x']).testsDirArg, 'x', 'supplied');
  });

  // ── #355 round 4: supplied-but-empty is not omitted ──────────────────────
  // A trailing `--tests-dir` or a bare `--tests-dir=` collapsed to `null` through
  // `|| null`, so a malformed option became the shipped DEFAULT silently -- the
  // ladder then installed into and reported on a tree the caller never named.
  // Round 3 refused a mistyped directory; this is the same defect reached by a
  // route that produced no string to mistype.
  await check('an empty --tests-dir value is distinguishable from an omitted flag', () => {
    eq(parseArgs(['chromium', '--tests-dir']).testsDirArg, '', 'trailing flag');
    eq(parseArgs(['chromium', '--tests-dir=']).testsDirArg, '', 'bare = form');
    eq(parseArgs(['chromium']).testsDirArg, null, 'omitted is still null');
    // AND it must not silently become the default, which is what made it invisible.
    eq(parseArgs(['chromium', '--tests-dir']).testsDir, '', 'no fallback for an empty value');
    eq(parseArgs(['chromium']).testsDir, DEFAULT_TESTS_DIR, 'the default is still reached when omitted');
  });

  // The refusal itself lives in main(), which is not exported -- so it is pinned
  // through the CLI, which is what a caller actually runs. It returns before any
  // rung, so this costs no network and no browser.
  await check('the CLI refuses an empty --tests-dir with CANNOT CHECK, exit 2', () => {
    for (const argv of [['chromium', '--tests-dir'], ['chromium', '--tests-dir=']]) {
      const proc = spawnSync(process.execPath, [LADDER, ...argv], { encoding: 'utf8' });
      eq(proc.status, 2, `exit code for ${argv.join(' ')}`);
      if (!/CANNOT CHECK/.test(proc.stderr)) {
        throw new Error(`must say CANNOT CHECK, got: ${proc.stderr || proc.stdout}`);
      }
      if (/CEILING/.test(proc.stdout)) {
        throw new Error('a malformed option must never be reported as a browser ceiling');
      }
    }
  });

  // A whitespace-only value is NOT refused here: a directory named with spaces is
  // legal on POSIX and resolves to a real path, so trimming first would refuse
  // something the OS accepts. The existence check gives the right answer instead
  // -- CANNOT CHECK, but for the reason that is true. An over-broad refusal and a
  // false certification are not symmetric defects, and this is the side where the
  // over-broad one would be the bug.
  await check('a whitespace-only --tests-dir is carried through, not trimmed away', () => {
    eq(parseArgs(['chromium', '--tests-dir', '  ']).testsDirArg, '  ', 'preserved verbatim');
    eq(parseArgs(['chromium', '--tests-dir', '  ']).testsDir, '  ', 'and used as given');
  });

  if (failures.length) {
    console.log('\ncheck-browser-ladder-cases: FAILED');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\ncheck-browser-ladder-cases: OK — ${cases.length} pinned ladder outcomes.`);
})();
