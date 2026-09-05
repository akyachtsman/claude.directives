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
  INSTALL_MAX_BUFFER } = require(LADDER);
import { tmpdir } from 'os';
import { mkdtempSync, realpathSync } from 'fs';

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

  await check('the install buffer is large enough that apt output cannot trip it', () => {
    if (INSTALL_MAX_BUFFER < 16 * 1024 * 1024) {
      throw new Error(`buffer is ${INSTALL_MAX_BUFFER}; Node's ~1 MiB default is what killed the installer`);
    }
  });

  // ── #355 round 1: a clean close is not a healthy browser ─────────────────
  // Browser.close() catches TargetClosedError and resolves, so a browser that
  // starts and dies immediately closed "successfully" and reported ok:true --
  // the exact start-then-die case the code claimed to catch.
  await check('a browser that disconnects before use is a failure, not a pass', async () => {
    const stub = { chromium: { launch: async () => ({ isConnected: () => false, close: async () => {} }) } };
    const result = await realLaunch('chromium', '.', stub)();
    eq(result.ok, false, 'a disconnected browser must not pass');
    if (!/disconnected/.test(result.error)) throw new Error(`error must say why: ${result.error}`);
  });

  await check('a connected browser passes even if closing it throws', async () => {
    const stub = { chromium: { launch: async () => ({
      isConnected: () => true,
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
  const CWD_PROBE = ['node', '-e', 'process.stdout.write(process.cwd())'];

  await check('the installer runs in the directory it is given', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ladder-cwd-')));
    const out = realInstall(CWD_PROBE, dir);
    if (out.output.trim() !== dir) {
      throw new Error(`installer ran in ${JSON.stringify(out.output.trim())}, expected ${dir}`);
    }
  });

  await check('and it does NOT silently fall back to the process cwd', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ladder-cwd2-')));
    const out = realInstall(CWD_PROBE, dir);
    // Positive assertion, not a negative one: the output must BE the given
    // directory. `!== process.cwd()` was satisfied by any noise at all.
    if (out.output.trim() !== dir) {
      throw new Error('the cwd argument was ignored — this is the round-1 defect');
    }
    if (out.output.trim() === process.cwd()) {
      throw new Error('installer ran in the process cwd despite being given another');
    }
  });

  if (failures.length) {
    console.log('\ncheck-browser-ladder-cases: FAILED');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log(`\ncheck-browser-ladder-cases: OK — ${cases.length} pinned ladder outcomes.`);
})();
