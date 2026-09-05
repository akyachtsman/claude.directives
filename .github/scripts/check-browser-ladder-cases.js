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
  INSTALL_MAX_BUFFER, INSTALL_TIMEOUT_MS, parseArgs, DEFAULT_TESTS_DIR,
  resolvePlaywright, PROBE_TIMEOUT_MS, treeRootOf, flushThenExit,
  FLUSHED_STREAMS } = require(LADDER);
import { tmpdir } from 'os';
import { existsSync, mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'fs';
import { spawn as spawnProcess, spawnSync } from 'child_process';
import { EventEmitter } from 'events';

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
    const out = await realInstall(['node', '-e', "process.stdout.write('x'.repeat(4*1024*1024))"]);
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
    eq(out.attempts[1].launch.ok, false, 'the launch was attempted and failed');
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

  await check('the installer runs in the directory it is given', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ladder-cwd-')));
    const out = await realInstall(CWD_PROBE, dir);
    const seen = readCwd(out.output);
    if (seen !== dir) {
      throw new Error(`installer ran in ${JSON.stringify(seen)}, expected ${dir}`);
    }
  });

  await check('and it does NOT silently fall back to the process cwd', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ladder-cwd2-')));
    const out = await realInstall(CWD_PROBE, dir);
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
  // ⚠️ THIS CASE USED TO ASSERT THE OPPOSITE, and it was wrong. Round 3 returned
  // from the interrupted branch BEFORE the launch, so the install result decided
  // the outcome -- defect 2 wearing the other sleeve. A signal arriving after the
  // download actually landed then produced CANNOT CHECK for a browser that starts
  // fine, and the old case pinned exactly that: its second rung WOULD have
  // launched (Codex, #355 round 5). The rule has no exception. Both directions
  // are now pinned.
  await check('an interrupted install still ends in a launch — and a launch is a pass', async () => {
    const s = scripted([{ launch: fail('nope') }, { launch: OK }]);
    s.install = () => ({ code: -1, output: 'cut short', interrupted: true });
    const out = await ladder({ browser: 'chromium', install: s.install, launch: s.launch });
    eq(out.ok, true, 'verdict');
    eq(out.rung, 'install', 'the rung whose install was cut short');
    eq(out.interrupted, undefined, 'a pass is not an interruption');
    eq(report('chromium', out, () => {}), 0, 'exit 0');
  });

  await check('an interrupted install whose launch FAILS is CANNOT CHECK, never a ceiling', async () => {
    const s = scripted([{ launch: fail('nope') }, { launch: fail("Executable doesn't exist") }]);
    s.install = () => ({ code: -1, output: 'cut short', interrupted: true });
    const out = await ladder({ browser: 'chromium', install: s.install, launch: s.launch });
    eq(out.ok, false, 'verdict');
    eq(out.interrupted, true, 'flagged as interrupted');
    eq(out.attempts.length, 2, 'the as-is rung, then the interrupted one');
    const lines = [];
    eq(report('chromium', out, (l) => lines.push(l)), 2, 'exit 2, not a ceiling');
    const text = lines.join('\n');
    if (text.includes('CEILING')) throw new Error('must not report a ceiling');
    // The launch DID happen, and its error is evidence the reader needs.
    if (!text.includes("Executable doesn't exist")) {
      throw new Error('the launch error must be quoted, not swallowed');
    }
    if (!text.includes('cut short')) throw new Error('the install output must be quoted too');
  });

  // The ladder must not climb PAST an interrupted rung: a further install is more
  // of the instrument that has already shown it cannot run one to completion.
  await check('an interrupted rung whose launch fails stops the ladder there', async () => {
    const installs = [];
    const out = await ladder({
      browser: 'chromium',
      install: (argv) => { installs.push(argv.join(' ')); return { code: -1, output: 'cut short', interrupted: true }; },
      launch: () => fail('nope'),
    });
    eq(out.interrupted, true, 'interrupted');
    eq(installs, ['playwright install chromium'], '--with-deps was never attempted');
  });

  // A harness failure after an interrupted install keeps ITS OWN diagnosis: the
  // Playwright-not-loadable message is actionable, the interrupted one is not.
  await check('a harness failure after an interrupted install reports the harness', async () => {
    const out = await ladder({
      browser: 'chromium',
      install: () => ({ code: -1, output: 'cut short', interrupted: true }),
      launch: () => ({ ok: false, harness: true, error: 'playwright could not be resolved' }),
    });
    eq(out.interrupted, undefined, 'not folded into the interrupted verdict');
    eq(out.harness, true, 'harness');
    const lines = [];
    eq(report('chromium', out, (l) => lines.push(l)), 2, 'exit 2');
    if (!lines.join('\n').includes('Playwright itself could not be loaded')) {
      throw new Error('the harness diagnosis is the more specific one and must survive');
    }
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

  // ── #355 round 6: four pre-existing defects, none from round 5 ───────────

  // A PASS THAT OVER-CLAIMS IS THE SAME DEFECT AS A FAILURE THAT DOES. The
  // success report used to say a suite failure "is about your code or your app",
  // contradicting this file's own header: a browser that opens an empty context
  // proves nothing about egress, DNS, TLS or the filesystem, so an environmental
  // limit would have been reported as an application regression.
  await check('the LAUNCHES report claims only that startup worked', async () => {
    const s = scripted([{ launch: OK }]);
    const out = await ladder({ browser: 'chromium', install: s.install, launch: s.launch });
    const lines = [];
    eq(report('chromium', out, (l) => lines.push(l)), 0, 'exit 0');
    const text = lines.join('\n');
    if (/about your\s+code or your app/.test(text)) {
      throw new Error('the pass must not attribute a suite failure to the application');
    }
    for (const must of ['BROWSER STARTUP', 'egress', 'says nothing']) {
      if (!text.includes(must)) throw new Error(`the pass must still name its limits: ${must}`);
    }
  });

  // An explicitly named directory is authoritative for RESOLUTION, not only for
  // existence. main() already refuses one that does not exist; this fallback
  // quietly undid half of that, resolving from the cwd while the installer ran in
  // the named directory -- two different trees, and the mismatch came out as a
  // CEILING.
  await check('an explicit --tests-dir does not fall back to the cwd', () => {
    const found = resolvePlaywright('/nonexistent-tests-dir-for-cases', true);
    eq(found.mod, null, 'unresolved');
    eq(found.tried.length, 1, 'exactly one base was tried');
    if (found.tried[0].includes(process.cwd())) {
      throw new Error('the working directory must not be consulted for an explicit --tests-dir');
    }
  });

  // ...and the complement, so the rule is not bought by refusing the fallback
  // outright: the DEFAULT is a guess this file makes, so it may still fall back.
  await check('the DEFAULT tests dir may still fall back to the cwd', () => {
    const found = resolvePlaywright('/nonexistent-tests-dir-for-cases', false);
    // ASSERT THE PROPERTY, NOT ONE OUTCOME OF IT. Whether `playwright` resolves
    // from this repo's own working directory depends on whether node_modules
    // happens to be installed -- a machine with it takes the success branch and
    // has no `tried` list at all, so pinning `tried.length` passed here and threw
    // elsewhere. What the case is actually about is that the cwd WAS consulted.
    const consultedCwd = found.mod
      ? found.base === process.cwd()
      : found.tried.length === 2 && found.tried[1].includes(process.cwd());
    if (!consultedCwd) {
      throw new Error(`the working directory must still be a fallback for the default: ${JSON.stringify(found.tried || found.base)}`);
    }
  });

  // ⚠️ THE FIRST VERSION OF THIS CASE TESTED A COPY OF THE CALL. It ran
  // `spawnSync` itself with its own 500 ms timeout, which proves Node honours a
  // timeout -- a fact about Node, not about this file. Codex measured the
  // consequence: deleting `timeout: INSTALL_TIMEOUT_MS` from `realInstall` left
  // all 42 cases green (#355 round 7). The case now inspects the SHIPPED call.
  await check('realInstall spawns npx detached, in the directory it was given', async () => {
    let seen = null;
    await realInstall(['playwright', 'install', 'chromium'], '/tmp', {
      spawn: (cmd, argv, opts) => {
        seen = { cmd, argv, opts };
        const child = new EventEmitter();
        child.pid = 4242;
        child.stdout = null;
        child.stderr = null;
        setImmediate(() => child.emit('close', 0, null));
        return child;
      },
    });
    eq(seen.cmd, 'npx', 'the command');
    eq(seen.argv, ['playwright', 'install', 'chromium'], 'the argv');
    eq(seen.opts.cwd, '/tmp', 'the directory it was given');
    // DETACHED IS THE MECHANISM, not a detail: without its own process group
    // there is nothing to kill but the direct child, and `--with-deps` spawns
    // apt beneath it.
    eq(seen.opts.detached, true, 'the installer gets its own process group');
  });

  // THE BOUND MUST REACH THE GROUP, and only a real child can show that. The
  // fake `npx` below leaves a grandchild that outlives it; before this round it
  // wrote its marker two seconds AFTER realInstall had returned "interrupted"
  // and the ladder had climbed on (Codex, #355).
  await check('a timed-out installer takes its whole process tree with it', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ladder-group-')));
    const marker = join(dir, 'orphan.txt');
    const fake = join(dir, 'npx');
    writeFileSync(fake, `#!/bin/sh\n( sleep 2; echo alive > ${marker} ) &\nsleep 30\n`, { mode: 0o755 });

    const started = Date.now();
    const out = await realInstall(['ignored'], dir, {
      spawn: (cmd, argv, opts) => spawnProcess(fake, argv, opts),
      timeout: 400,
    });
    if (Date.now() - started > 20000) throw new Error('the bound did not apply');
    if (!out.interrupted) throw new Error('a killed installer must read as interrupted');

    // Long enough that the orphan WOULD have written by now.
    await new Promise((r) => setTimeout(r, 3000));
    if (existsSync(marker)) {
      throw new Error('a descendant of the installer outlived the bound that killed it');
    }
  });

  await check('the bound is finite, and long enough that a slow download is not a hang', () => {
    if (!INSTALL_TIMEOUT_MS || INSTALL_TIMEOUT_MS > 30 * 60 * 1000) {
      throw new Error(`installer timeout is ${INSTALL_TIMEOUT_MS}; an unbounded install hangs the ladder`);
    }
    // A browser download on a slow link legitimately takes minutes, so this is a
    // bound on HUNG, not on SLOW.
    if (INSTALL_TIMEOUT_MS < 5 * 60 * 1000) {
      throw new Error(`installer timeout is ${INSTALL_TIMEOUT_MS}; a slow download is not a hang`);
    }
  });

  // And the whole path end to end, through realInstall rather than beside it:
  // a real child that outruns the bound is killed and classified.
  await check('a real installer that outruns realInstall\'s bound is killed and classified', async () => {
    const started = Date.now();
    const out = await realInstall(['-e', 'setTimeout(() => {}, 60000)'], process.cwd(),
      { spawn: (cmd, argv, opts) => spawnProcess(process.execPath, argv, opts), timeout: 500 });
    if (Date.now() - started > 30000) throw new Error('the bound did not apply');
    if (!out.interrupted) throw new Error('a killed child must read as interrupted');
    if (!out.reason) throw new Error('and it must record WHY it was cut short');
  });

  // ── the interruption reason must survive truncation ──────────────────────
  // `classifyInstall` appended it to the END of the captured output, and the
  // report prints the FIRST ten lines -- so any installer that had already said
  // ten lines (a download, an apt run) lost the one sentence saying whether it
  // timed out, overflowed, or was signalled (Codex, #355 round 7).
  await check('the CANNOT CHECK report names the interruption reason above the output', async () => {
    const noisy = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
    const out = await ladder({
      browser: 'chromium',
      install: () => classifyInstall({ status: null, signal: 'SIGTERM', stdout: noisy, stderr: '' }),
      launch: () => fail('Executable does not exist'),
    });
    const lines = [];
    eq(report('chromium', out, (l) => lines.push(l)), 2, 'CANNOT CHECK');
    const text = lines.join('\n');
    if (!/WHY: .*SIGTERM/.test(text)) {
      throw new Error(`the reason must be stated outside the truncated output, got:\n${text}`);
    }
    // ...and it must come BEFORE the output it explains.
    if (text.indexOf('WHY:') > text.indexOf('line 0')) {
      throw new Error('the reason must precede the installer output, not trail it');
    }
  });

  // `process.exit()` TERMINATES BEFORE A REDIRECTED STDOUT DRAINS, and this
  // file's output IS the evidence a reader is meant to keep.
  //
  // ⚠️ MY FIRST VERSION OF THIS CASE COULD NOT FAIL. It called `report()` in a
  // child and set `process.exitCode` itself, so it never ran the CLI's exit line
  // -- the mutant restoring `process.exit()` reddened NOTHING. The defect lives
  // in the module tail, so the case has to drive the module tail.
  //
  // That needs the real `main()` to reach the CEILING report without a browser
  // or a network: a stub `playwright` package under the named --tests-dir whose
  // launch throws one enormous SINGLE-LINE error (the report caps line COUNT, so
  // only line LENGTH gets past it), and a fake `npx` first on PATH so the two
  // install rungs return instantly.
  await check('the CLI does not truncate its own output into a pipe', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ladder-pipe-')));
    const pkg = join(dir, 'node_modules', 'playwright');
    mkdirSync(pkg, { recursive: true });
    mkdirSync(join(dir, 'bin'), { recursive: true });
    writeFileSync(join(pkg, 'package.json'),
      '{"name":"playwright","version":"0.0.0","main":"index.js"}');
    writeFileSync(join(pkg, 'index.js'),
      "module.exports = { chromium: { launch: async () => "
      + "{ throw new Error('E'.repeat(200000)); } } };\n");
    writeFileSync(join(dir, 'bin', 'npx'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    const proc = spawnSync(process.execPath, [LADDER, 'chromium', '--tests-dir', dir], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}` },
    });
    eq(proc.status, 1, 'a CEILING is exit 1');
    if (!/EEEEE/.test(proc.stdout)) throw new Error('the launch error never reached the pipe');
    // The LAST line is the one an early exit loses.
    if (!/what would make it wrong/.test(proc.stdout)) {
      throw new Error(`the report was truncated: ${proc.stdout.length} bytes, no closing line`);
    }
  });

  // ── #355 round 7: one resolution, one base ───────────────────────────────
  // The installer's directory was chosen by EXISTENCE while the launcher
  // resolved Playwright INDEPENDENTLY, under a comment claiming "the same
  // directory for both". For the DEFAULT they disagree exactly when it matters:
  // a default directory that exists but holds no Playwright made `npx` install
  // into it while every launch used the cwd's Playwright. Round 6 fixed the
  // EXPLICIT branch and left this one.
  //
  // Driven through the CLI, because the divergence lived in main(): a tests-dir
  // that EXISTS and is EMPTY, with a stub playwright resolvable only from the
  // cwd. The old code installed into the empty directory; the new code refuses
  // to resolve at all for an explicit dir, and for the default announces the
  // base it actually resolved from.
  await check('the installer runs in a REAL directory, the one resolution used', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ladder-base-')));
    const pkg = join(dir, 'node_modules', 'playwright');
    mkdirSync(pkg, { recursive: true });
    mkdirSync(join(dir, 'bin'), { recursive: true });
    writeFileSync(join(pkg, 'package.json'),
      '{"name":"playwright","version":"0.0.0","main":"index.js"}');
    writeFileSync(join(pkg, 'index.js'),
      'module.exports = { chromium: { launch: async () => ({ '
      + 'newContext: async () => ({ close: async () => {} }), close: async () => {} }) } };\n');
    writeFileSync(join(dir, 'bin', 'npx'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    // The shipped default `.github/scripts/ui-tests` does NOT exist here, and
    // `createRequire` walks ancestors — so resolution succeeds from a base that
    // is not a directory. The first version of the fix reported that base as the
    // installer's cwd; `spawnSync` would have rejected it with ENOENT while the
    // banner announced it as the tree in use.
    const proc = spawnSync(process.execPath, [LADDER, 'chromium'], {
      encoding: 'utf8',
      cwd: dir,
      env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}` },
    });
    eq(proc.status, 0, 'the stub browser launches');
    const announced = /the installer runs in (.*), the same tree/.exec(proc.stdout);
    if (!announced) throw new Error(`the run must name the installer's directory:\n${proc.stdout}`);
    if (!existsSync(announced[1])) {
      throw new Error(`the announced installer directory does not exist: ${announced[1]}`);
    }
    if (!proc.stdout.includes(join(pkg, 'index.js'))) {
      throw new Error(`the run must name where playwright actually came from:\n${proc.stdout}`);
    }
  });

  // A tests directory named explicitly, with playwright in NO ancestor, is
  // CANNOT CHECK — never a silent fallback to whatever the cwd happens to hold.
  // (The stub lives in a separate tree, because `createRequire` walks ancestors:
  // an "empty" directory under one that has playwright resolves perfectly well,
  // and `npx` run there would find the same package — so that is not a mismatch
  // and must not be refused.)
  await check('an explicit --tests-dir with no playwright anywhere above it is CANNOT CHECK', () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'ladder-cwd-')));
    const away = realpathSync(mkdtempSync(join(tmpdir(), 'ladder-away-')));
    const pkg = join(home, 'node_modules', 'playwright');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'package.json'),
      '{"name":"playwright","version":"0.0.0","main":"index.js"}');
    writeFileSync(join(pkg, 'index.js'),
      'module.exports = { chromium: { launch: async () => ({ '
      + 'newContext: async () => ({ close: async () => {} }), close: async () => {} }) } };\n');

    const proc = spawnSync(process.execPath, [LADDER, 'chromium', '--tests-dir', away],
      { encoding: 'utf8', cwd: home });
    eq(proc.status, 2, 'CANNOT CHECK');
    // MATCH THE VERDICT, NOT THE WORD. The banner line says "grading on whether
    // it LAUNCHES", so a bare /LAUNCHES/ matches every run this file makes --
    // the case failed on the banner rather than on a verdict, which is failing
    // for the wrong reason.
    if (/browser-ladder: (CEILING|LAUNCHES)/.test(proc.stdout)) {
      throw new Error('a harness that could not be resolved is neither a ceiling nor a pass');
    }
    if (proc.stdout.includes(`${home}:`)) {
      throw new Error('the cwd must not appear among the bases tried for an explicit directory');
    }
  });

  // The complement: an explicit directory whose ANCESTOR holds playwright still
  // works, because `npx` run there finds the same package. Refusing it would be
  // an over-broad refusal bought to make the case above pass.
  await check('an explicit --tests-dir resolving through an ancestor is accepted', () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'ladder-anc-')));
    const nested = join(home, 'tests');
    mkdirSync(nested, { recursive: true });
    const pkg = join(home, 'node_modules', 'playwright');
    mkdirSync(pkg, { recursive: true });
    mkdirSync(join(home, 'bin'), { recursive: true });
    writeFileSync(join(pkg, 'package.json'),
      '{"name":"playwright","version":"0.0.0","main":"index.js"}');
    writeFileSync(join(pkg, 'index.js'),
      'module.exports = { chromium: { launch: async () => ({ '
      + 'newContext: async () => ({ close: async () => {} }), close: async () => {} }) } };\n');
    writeFileSync(join(home, 'bin', 'npx'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    const proc = spawnSync(process.execPath, [LADDER, 'chromium', '--tests-dir', nested], {
      encoding: 'utf8',
      cwd: home,
      env: { ...process.env, PATH: `${join(home, 'bin')}:${process.env.PATH}` },
    });
    eq(proc.status, 0, 'accepted');
    // THE INSTALLER RUNS IN THE PACKAGE'S TREE, not in the directory named.
    // `npx` there finds `node_modules/.bin/playwright` with no search at all,
    // and it is the same tree resolution used — which is the whole point, and
    // the only way the symlink case can be made to agree.
    if (!proc.stdout.includes(`the installer runs in ${home}`)) {
      throw new Error(`the installer must run in the tree that owns the package:\n${proc.stdout}`);
    }
    if (!proc.stdout.includes(`looking for playwright under ${nested}`)) {
      throw new Error('the directory the caller named must still be where the search starts');
    }
  });

  // ── #355 round 8: a symlinked --tests-dir must not split the trees ──────
  // `createRequire` searches the ancestors of the LEXICAL path it is handed,
  // while a process spawned with that path as `cwd` sees the CANONICAL target
  // and searches ITS ancestors. Round 7's "one resolution, one base" still
  // diverged there. Deriving the base from the resolved package makes both sides
  // canonical by construction (Codex, #355).
  await check('a symlinked --tests-dir resolves and installs on ONE tree', () => {
    const real = realpathSync(mkdtempSync(join(tmpdir(), 'ladder-real-')));
    const lex = realpathSync(mkdtempSync(join(tmpdir(), 'ladder-lex-')));
    // ⚠️ THE PACKAGE LIVES IN THE SYMLINK'S *LEXICAL* TREE. I built this
    // backwards the first time — package in the canonical tree — and got a
    // CANNOT CHECK, which is a safe outcome and proves nothing. The divergence
    // only exists this way round: `createRequire` searches the lexical
    // ancestors and FINDS it, while a process given that path as `cwd` sees the
    // canonical target and searches ancestors that do not have it.
    const pkg = join(lex, 'node_modules', 'playwright');
    mkdirSync(pkg, { recursive: true });
    mkdirSync(join(real, 'tests'), { recursive: true });
    mkdirSync(join(lex, 'bin'), { recursive: true });
    writeFileSync(join(pkg, 'package.json'),
      '{"name":"playwright","version":"0.0.0","main":"index.js"}');
    writeFileSync(join(pkg, 'index.js'),
      'module.exports = { chromium: { launch: async () => ({ '
      + 'newContext: async () => ({ close: async () => {} }), close: async () => {} }) } };\n');
    writeFileSync(join(lex, 'bin', 'npx'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    // ...reached through a symlink pointing OUT of that tree.
    const link = join(lex, 'tests-link');
    symlinkSync(join(real, 'tests'), link);

    const proc = spawnSync(process.execPath, [LADDER, 'chromium', '--tests-dir', link], {
      encoding: 'utf8',
      cwd: lex,
      env: { ...process.env, PATH: `${join(lex, 'bin')}:${process.env.PATH}` },
    });
    eq(proc.status, 0, 'the stub browser launches');
    const announced = /the installer runs in (.*), the same tree/.exec(proc.stdout);
    if (!announced) throw new Error(`the run must name the installer's directory:\n${proc.stdout}`);
    // The announced base must be the tree the package is really in. Handing the
    // symlink itself to `npx` sends it to the canonical target, whose ancestors
    // hold no playwright at all.
    eq(announced[1], lex, 'the installer base is the tree the package is in');
    if (!proc.stdout.includes(join(pkg, 'index.js'))) {
      throw new Error(`the run must name where playwright actually came from:\n${proc.stdout}`);
    }
  });

  // ── the probe is bounded, so a browser that stops answering cannot hang ──
  // Playwright sends newContext() and close() with kNoTimeout, so bounding the
  // INSTALLER did not make the ladder bounded (Codex, #355).
  // ⚠️ THIS CASE MUST BOUND ITSELF, or it does not test a bound. The first
  // version simply awaited `realLaunch` -- so against a mutant that removes the
  // bound it HUNG TOO, and because a never-settling promise holds no handle, the
  // whole suite exited 0 with no summary and the mutant reddened NOTHING.
  // A case that shares the defect cannot detect it. The race below is the
  // instrument; its timer is deliberately left ref'd so the failure is loud.
  await check('a browser that never answers is a failure, not a hang', async () => {
    const stub = { chromium: { launch: async () => ({
      newContext: () => new Promise(() => {}),   // never settles
      close: async () => {},
    }) } };
    const started = Date.now();
    const raced = await Promise.race([
      realLaunch('chromium', '.', stub)().then((out) => ({ out })),
      new Promise((r) => setTimeout(() => r({ hung: true }), PROBE_TIMEOUT_MS + 10000)),
    ]);
    if (raced.hung) {
      throw new Error(`realLaunch never returned — the probe is not bounded (${Date.now() - started} ms)`);
    }
    eq(raced.out.ok, false, 'verdict');
    if (!/stopped answering/.test(raced.out.error)) {
      throw new Error(`the reason must say it stopped answering, got: ${raced.out.error}`);
    }
  });

  await check('the probe bound is finite and not so tight it fails a healthy browser', () => {
    if (!PROBE_TIMEOUT_MS || PROBE_TIMEOUT_MS > 5 * 60 * 1000) {
      throw new Error(`probe bound is ${PROBE_TIMEOUT_MS}; an unbounded probe hangs the ladder`);
    }
    if (PROBE_TIMEOUT_MS < 5 * 1000) {
      throw new Error(`probe bound is ${PROBE_TIMEOUT_MS}; opening a context is local but not instant`);
    }
  });

  // treeRootOf is the whole of fix 3, so it is pinned directly as well.
  await check('treeRootOf names the tree a package lives in', () => {
    eq(treeRootOf('/x/y/node_modules/playwright/index.js'), '/x/y', 'plain');
    eq(treeRootOf('/x/node_modules/a/node_modules/playwright/index.js'), '/x/node_modules/a', 'nested');
    eq(treeRootOf('/no/modules/here.js'), null, 'no node_modules — no answer');
    eq(treeRootOf(''), null, 'empty');
    eq(treeRootOf(null), null, 'absent');
  });

  // ── #355 round 9: the same rule, the branch it did not cover ────────────

  // The BOUND killed the group; a leader terminated by an EXTERNAL signal did
  // not, so its descendants outlived the rung. Reproduced: the orphan wrote its
  // marker after realInstall had already returned "interrupted".
  await check('an externally signalled installer still takes its tree with it', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ladder-sig-')));
    const marker = join(dir, 'orphan.txt');
    const fake = join(dir, 'npx');
    // The orphan waits TEN seconds, so it is still alive when realInstall
    // returns -- otherwise the case cannot fail for the right reason: an orphan
    // that finished on its own before the return proves nothing about reaping.
    // `exec` makes the leader itself the thing a signal kills, promptly.
    writeFileSync(fake, `#!/bin/sh\n( sleep 10; echo alive > ${marker} ) &\nexec sleep 30\n`,
                  { mode: 0o755 });

    const started = Date.now();
    const out = await realInstall(['ignored'], dir, {
      // No bound in play: 60s, and the leader is signalled from outside at 300ms.
      timeout: 60000,
      spawn: (cmd, argv, opts) => {
        const child = spawnProcess(fake, argv, opts);
        setTimeout(() => { try { process.kill(child.pid, 'SIGTERM'); } catch { /* gone */ } }, 300);
        return child;
      },
    });
    const took = Date.now() - started;
    if (!out.interrupted) throw new Error('a signalled installer must read as interrupted');
    // Reaping on `close` instead of `exit` returned only when the orphan
    // finished by itself, ~10s in. Returning promptly is part of the property.
    if (took > 5000) {
      throw new Error(`realInstall waited ${took} ms — it is waiting on the descendant's stdio`);
    }
    await new Promise((r) => setTimeout(r, 11000));
    if (existsSync(marker)) {
      throw new Error('a descendant outlived a leader that was signalled from outside');
    }
  });

  // ── the exit path flushes EVERY stream, not just stdout ──────────────────
  // ⚠️ PINNED AS A MECHANISM, DELIBERATELY. The reported symptom -- a truncated
  // stderr -- did not reproduce here: ten runs on Node 22.22.2 with a
  // 100,000-char argument returned all 100,079 bytes every time. A completeness
  // assertion would therefore be green with AND without the fix, which is the
  // "cannot fail for the right reason" trap this PR has hit six times. So the
  // two things the fix actually consists of are pinned instead.
  await check('flushThenExit waits for every stream it is given', () => {
    const drained = [];
    let exited = null;
    const fake = (name) => ({ write: (_s, cb) => { drained.push(name); setImmediate(cb); } });
    flushThenExit(7, [fake('a'), fake('b')], (code) => { exited = code; });
    return new Promise((resolve, reject) => setTimeout(() => {
      try {
        eq(drained, ['a', 'b'], 'both streams were written to');
        eq(exited, 7, 'and the exit code is carried through');
        resolve();
      } catch (err) { reject(err); }
    }, 20));
  });

  await check('...and it does NOT exit before the last of them drains', () => {
    let exited = null;
    let release = null;
    const slow = { write: (_s, cb) => { release = cb; } };
    const fast = { write: (_s, cb) => setImmediate(cb) };
    flushThenExit(3, [fast, slow], (code) => { exited = code; });
    return new Promise((resolve, reject) => setTimeout(() => {
      try {
        eq(exited, null, 'the fast stream alone must not be enough');
        release();
        setTimeout(() => {
          try { eq(exited, 3, 'and the slow one releases it'); resolve(); }
          catch (err) { reject(err); }
        }, 20);
      } catch (err) { reject(err); }
    }, 20));
  });

  await check('the CLI flushes stdout AND stderr', () => {
    // The list the module tail actually passes — not a copy of it.
    if (FLUSHED_STREAMS.length !== 2
        || !FLUSHED_STREAMS.includes(process.stdout)
        || !FLUSHED_STREAMS.includes(process.stderr)) {
      throw new Error('every refusal in this file goes to stderr; it must be flushed too');
    }
  });

  if (failures.length) {
    console.log('\ncheck-browser-ladder-cases: FAILED');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\ncheck-browser-ladder-cases: OK — ${cases.length} pinned ladder outcomes.`);
})();
