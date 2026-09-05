#!/usr/bin/env node
// browser-ladder.js — can this sandbox actually LAUNCH a browser?
// (test.md -> Sandboxed local runs -> Recording what your project cannot run here.)
//
// WHY THIS IS A SCRIPT AND NOT A PARAGRAPH. Four review rounds produced four
// different defects in one paragraph of prose, each introduced by the fix for
// the one before (#332, split from #331):
//
//   1. "a missing browser has no shipped override; the scenario is unrunnable"
//      — false: ui-suite/action.yml installs browsers as a normal step.
//   2. "try `playwright install <b>`; record a ceiling only if the INSTALL fails"
//      — false: an install can exit 0 and leave a binary that will not start,
//        so the rule forbade recording a ceiling that genuinely exists.
//   3. "install `--with-deps`, launch, record a ceiling when the LAUNCH fails"
//      — false: `--with-deps` runs installDeps BEFORE install, and dependency
//        installation needs privileges, so without them it aborts BEFORE
//        downloading. The launch then fails because nothing was ever fetched,
//        and the rule records a ceiling that is an artefact of the ladder.
//   4. not attempted. That is the point of the issue.
//
// THE ONE RULE THAT SURVIVED ALL FOUR:
//
//     Grade on whether the browser LAUNCHES. Never on an install's exit code,
//     and never let a dependency-phase abort stand in for "unavailable".
//
// This file is that rule as code. Every rung ends in a launch; an install's exit
// status is recorded as context and is never itself a verdict. `--with-deps`
// runs AFTER a plain install for exactly the reason defect 3 names: the plain
// install fetches the binary first, so a later privilege failure in the
// dependency phase cannot retroactively un-download it.
//
// WHAT A CEILING MEANS HERE. Exit 1 says: on this machine, now, with these
// rungs, the browser did not start — and the launch error is quoted so the next
// reader can judge it rather than trust this line. It does NOT say the browser
// is unavailable in principle. `test.md` requires the limit be recorded with the
// date, the causes and what would make it wrong; this prints the material for
// all three.
//
// WHAT IT CANNOT ESTABLISH. That a browser which launches can also reach the
// network, render your app, or pass your suite. It answers one question --
// does it start -- because that is the question the four prose attempts kept
// getting wrong.
//
// ⚠️ WHAT IT DOES NOT SUPERVISE -- two recorded limits, not oversights. Both are
// tracked in #358; the owner's ruling (2026-09-05) was to keep this file's scope
// at "does the browser launch" rather than grow a process-supervision layer,
// because five consecutive review rounds showed each lifecycle fix exposing the
// next one. Read #358 before adding either, and read this paragraph before
// assuming they are bugs nobody noticed.
//
//   1. THE PARENT'S OWN DEATH. The installer runs `detached`, which is what lets
//      a timeout kill its whole process group -- but that also puts it OUTSIDE
//      this process's foreground group, so a Ctrl-C aimed at the ladder does not
//      reach it. Nothing here registers SIGINT/SIGTERM cleanup, so interrupting
//      the ladder mid-install can leave `playwright install` (and, on the
//      --with-deps rung, apt) running. If you interrupt it, check for
//      stragglers.
//
//   2. AN UNREAD PIPE HANGS THE EXIT. `flushThenExit` waits for every stream to
//      drain and that wait is UNBOUNDED, so a consumer that opens stdout as a
//      pipe and never reads it, with a report past the ~64 KiB pipe buffer, hangs
//      instead of exiting. Measured: a 5 MB launch error with an unread stdout
//      pipe was still running after 4 s. This is a REGRESSION I introduced in
//      round 9 while fixing a truncation, and it is recorded as such rather than
//      dressed up as a pre-existing limit -- it turned a truncated report into a
//      hung one. It does not arise at a terminal (writes are synchronous there)
//      or under a consumer that drains, which is every caller this repo ships.

'use strict';

const { spawn: spawnProcess, spawnSync } = require('child_process');
const { createRequire } = require('module');
const { dirname, join, resolve, sep } = require('path');
const { existsSync } = require('fs');

const BROWSERS = ['chromium', 'firefox', 'webkit'];

// The rungs, in the order they must be attempted. Order is load-bearing, not
// stylistic: see defect 3 above.
const RUNGS = [
  {
    name: 'as-is',
    // No install at all. A browser already in the image is the common case in a
    // sandbox and the cheapest correct answer; attempting an install first would
    // spend a network round trip to learn what a launch answers immediately.
    argv: null,
  },
  {
    name: 'install',
    // Plain install: downloads the browser, touches no system packages, needs no
    // privileges. If host libraries are already sufficient this is enough.
    argv: (browser) => ['playwright', 'install', browser],
  },
  {
    name: 'install --with-deps',
    // Only now. This installs system packages first and needs privileges; when
    // it aborts there, the binary from the rung above is still on disk and the
    // launch below still reports the REAL reason rather than "never downloaded".
    argv: (browser) => ['playwright', 'install', '--with-deps', browser],
  },
];

/**
 * Run the ladder. Pure with respect to its effects: `install` and `launch` are
 * injected so the shipped logic can be exercised without a network or a browser.
 *
 * `install(argv)`  -> { code, output }   -- never consulted for the verdict
 * `launch()`       -> { ok, error }      -- the ONLY thing that decides
 */
async function ladder({ browser, install, launch, log = () => {} }) {
  const attempts = [];

  for (const rung of RUNGS) {
    let installed = null;
    if (rung.argv) {
      const argv = rung.argv(browser);
      log(`  rung "${rung.name}": ${argv.join(' ')}`);
      installed = await install(argv);
      // DELIBERATELY NOT A BRANCH. A non-zero install is recorded and the ladder
      // continues to the launch: defect 2 was reading this exit code as the
      // answer, and defect 3 was letting the dependency phase's failure end the
      // ladder before anything was ever launched.
      log(`    install exited ${installed.code} (context, not a verdict)`);
      // AN INTERRUPTED INSTALL CANNOT SUPPORT A CEILING -- BUT IT STILL ENDS IN A
      // LAUNCH. Round 2 learned to DETECT a spawn the ladder cut short and then
      // carried on as though the rung had completed, so a launch failing for want
      // of a browser this ladder never finished fetching was reported as a
      // CEILING. Round 3 fixed that by returning before the launch -- and
      // overshot: the install result then decided the outcome, which is defect 2
      // wearing the other sleeve, and a signal arriving after the download
      // actually landed produced CANNOT CHECK for a browser that starts fine
      // (Codex, #355).
      //
      // The rule does not have an exception. EVERY RUNG ENDS IN A LAUNCH, and a
      // browser that starts, launched -- however the installer ended. What the
      // interruption costs is only the ability to read a FAILURE: after one, a
      // launch that fails cannot be told apart from a browser this ladder never
      // finished fetching, so that direction is CANNOT CHECK and never a ceiling.
      if (installed.interrupted) {
        const result = await launch();
        attempts.push({ rung: rung.name, install: installed, launch: result });
        if (result.ok) {
          log(`    LAUNCHED (despite an interrupted install -- a launch is a launch)`);
          return { ok: true, rung: rung.name, attempts };
        }
        // A harness failure is the more specific diagnosis and has its own
        // report, so it is not folded into the interrupted one.
        if (result.harness) {
          log(`    cannot check: ${firstLine(result.error)}`);
          return { ok: false, harness: true, rung: null, attempts };
        }
        log(`    launch failed after an install this ladder cut short -- not a ceiling`);
        return { ok: false, harness: true, interrupted: true, rung: null, attempts };
      }
    } else {
      log(`  rung "${rung.name}": no install, launching what is already here`);
    }

    // `await` on a non-promise is the identity, so an injected synchronous
    // launch works unchanged while the real one -- which returns a promise --
    // is resolved before the next rung starts an install.
    const result = await launch();
    attempts.push({ rung: rung.name, install: installed, launch: result });
    if (result.ok) {
      log(`    LAUNCHED`);
      return { ok: true, rung: rung.name, attempts };
    }
    // A HARNESS FAILURE ENDS THE LADDER WITHOUT A VERDICT. Climbing further
    // installs browsers for a Playwright that cannot be loaded, and the rungs
    // then all fail identically -- which reads exactly like a ceiling and is not
    // one (Codex, #355).
    if (result.harness) {
      log(`    cannot check: ${firstLine(result.error)}`);
      return { ok: false, harness: true, rung: null, attempts };
    }
    log(`    launch failed: ${firstLine(result.error)}`);
  }

  return { ok: false, rung: null, attempts };
}

function firstLine(text) {
  return String(text == null ? '' : text).split('\n').find((l) => l.trim()) || '(no message)';
}

/** Render the verdict. Separated from `ladder` so the cases file can pin both. */
function report(browser, outcome, print = console.log) {
  if (outcome.ok) {
    print(`browser-ladder: LAUNCHES — ${browser} started at rung "${outcome.rung}"`);
    // SAY ONLY WHAT WAS TESTED. These two lines used to read "a failure in your
    // suite is about your code or your app" -- which contradicts this file's own
    // header three screens up. A browser that opens an empty context proves
    // nothing about egress, DNS, TLS, the filesystem, or any other runner
    // constraint, so a suite failing on one of those would have been reported
    // here as an application regression (Codex, #355). An instrument that
    // over-claims in its PASS is the same defect as one that over-claims in its
    // failure; this one just reads as reassurance.
    print('  No ceiling for BROWSER STARTUP. That is the only thing this tested:');
    print('  the browser process came up and answered. If your suite fails, browser');
    print('  startup is not the demonstrated cause — but network egress, DNS, TLS,');
    print('  filesystem limits and every other sandbox constraint are all still');
    print('  open questions, and this says nothing about any of them.');
    return 0;
  }

  const last = outcome.attempts[outcome.attempts.length - 1];

  // CANNOT CHECK IS NOT A CEILING. Saying "this browser will not start here" when
  // the truth is "this ladder could not load Playwright" records a limit about
  // the wrong thing, and `test.md` asks projects to write these limits down.
  if (outcome.interrupted) {
    const last = outcome.attempts[outcome.attempts.length - 1];
    print('browser-ladder: CANNOT CHECK — this ladder could not run the installer to completion');
    print('');
    // FIRST, and outside the truncation: this is the only line that says WHICH
    // way the installer was cut short.
    print(`  WHY: ${last.install.reason || '(reason not recorded)'}`);
    print('');
    print('  What the installer had said before that (first 10 lines):');
    for (const line of String(last.install.output || '').split('\n').slice(0, 10)) print(`  ${line}`);
    print('');
    print('  The launch was attempted anyway, and failed:');
    for (const line of String(last.launch.error || '(no message)').split('\n').slice(0, 8)) {
      print(`    ${line}`);
    }
    print('');
    print('  That failure is NOT read as a ceiling. A browser this ladder never');
    print('  finished fetching fails to start for a reason this ladder caused, and');
    print('  nothing here can tell that apart from a browser that genuinely will');
    print('  not run. Had it launched, that would have been a pass — a launch is a');
    print('  launch however the installer ended.');
    return 2;
  }
  if (outcome.harness) {
    print(`browser-ladder: CANNOT CHECK — Playwright itself could not be loaded`);
    print('');
    for (const line of String(last.launch.error || '').split('\n')) print(`  ${line}`);
    print('');
    print('  This says nothing about whether the browser works. Install the UI kit\'s');
    print('  dependencies, or point --tests-dir at the directory that holds them:');
    print('    node browser-ladder.js chromium --tests-dir <dir with node_modules>');
    return 2;
  }

  print(`browser-ladder: CEILING — ${browser} did not launch after ${outcome.attempts.length} rung(s)`);
  print('');
  print('  THE EVIDENCE IS THE LAUNCH ERROR, quoted verbatim so you can judge it:');
  for (const line of String(last.launch.error || '(no message)').split('\n').slice(0, 12)) {
    print(`    ${line}`);
  }
  print('');
  print('  What each rung did (install exit codes are CONTEXT, never the verdict):');
  for (const attempt of outcome.attempts) {
    const code = attempt.install ? `install exit ${attempt.install.code}` : 'no install attempted';
    print(`    ${attempt.rung.padEnd(20)} ${code} -> launch failed`);
  }
  for (const attempt of outcome.attempts) {
    if (attempt.install && attempt.install.output && attempt.install.code !== 0) {
      print('');
      print(`  Install output from "${attempt.rung}", for diagnosis only — this text is`);
      print('  NOT classified here, because a rule that pattern-matches an error string');
      print('  is a rule about a message rather than about what happened:');
      for (const line of String(attempt.install.output).split('\n').slice(0, 8)) {
        print(`    ${line}`);
      }
    }
  }
  print('');
  print('  Record this in the project\'s CLAUDE.md per test.md -> Sandboxed local');
  print('  runs: the DATE, the causes above, and what would make it wrong.');
  return 1;
}

// A LADDER THAT KILLS ITS OWN INSTALLER MANUFACTURES THE CEILING IT REPORTS.
// spawnSync's default maxBuffer is ~1 MiB; `playwright install`, and especially
// the apt/dpkg output of `--with-deps`, exceeds that routinely. On overflow Node
// terminates the child with SIGTERM and sets `proc.error` (ENOBUFS) -- so the
// install is cut off part-way, the browser is half-fetched, and the launch below
// fails for a reason THIS FUNCTION CAUSED. That is defect 3 wearing different
// clothes: a ceiling that is an artefact of the ladder (Codex, #355).
//
// The buffer is raised, and an overflow is reported as what it is rather than
// folded into the exit code -- `code: -1` alone is indistinguishable from a
// spawn that never started.
const INSTALL_MAX_BUFFER = 64 * 1024 * 1024;

// AND BOUND IT IN TIME. `spawnSync` waits forever by default, so an installer
// stalled on a network blackhole, a package-manager lock or a hung child blocked
// the ladder before any launch or any report could run -- and a ladder whose
// whole purpose is diagnosing restricted egress is exactly the one that meets
// blackholes (Codex, #355). A timeout kills the child and Node reports
// `status: null, signal: 'SIGTERM', error.code: 'ETIMEDOUT'` (measured), which
// `classifyInstall` already reads as an interruption -- so a stall becomes
// CANNOT CHECK rather than a hang or a manufactured ceiling.
//
// TEN MINUTES, not one. A browser download on a slow link, and `--with-deps`
// fetching apt packages, legitimately take minutes; a bound tight enough to trip
// on a slow network would turn every slow machine into CANNOT CHECK, which is
// safe in direction and useless in practice. This is a bound on HUNG, not on
// SLOW.
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;

// Split out so the overflow branch is testable. The command is always `npx`,
// which exists, so a genuine spawn error here is almost always ENOBUFS -- and
// that is precisely the branch worth pinning, because it is the one that
// silently turns a truncated install into a reported ceiling.
function classifyInstall(proc) {
  const output = `${proc.stdout || ''}${proc.stderr || ''}`.trim();
  const code = proc.status == null ? -1 : proc.status;
  // A SIGNAL IS AN INTERRUPTION EVEN WITHOUT AN `error`. Node reports a
  // signal-terminated child as `status: null, signal: 'SIGTERM'` and sets NO
  // `proc.error` -- so keying only on `error` classified an installer the OS (or
  // a CI job timeout, or the maxBuffer kill on a Node build that does not
  // populate `error`) cut short as a rung that completed with code -1. The
  // launch then failed for want of a browser this ladder never finished
  // fetching, and that was reported as a CEILING: defect 3 again, arriving
  // through the one door round 3 left open (Codex, #355).
  const reason = proc.error ? proc.error.message
    : proc.signal != null ? `the installer was terminated by ${proc.signal}`
    : null;
  if (reason) {
    // THE REASON IS A FIELD. It used to be appended to the END of the captured
    // output, and `report()` prints the FIRST ten lines -- so any installer that
    // had already said ten lines (a download, an apt run: routinely more) lost
    // the one sentence saying whether it timed out, overflowed its buffer or was
    // signalled. The actionable cause vanished from the report written to carry
    // it (Codex, #355). Text that must survive cannot live inside text that gets
    // truncated.
    return {
      code,
      reason,
      output: `${output}\n[this ladder could not run the installer to completion: ${reason}]`.trim(),
      interrupted: true,
    };
  }
  return { code, output };
}

// RUN THE INSTALLER WHERE THE HARNESS LIVES. `npx` resolves the package from its
// working directory, and the shipped kit installs Playwright under the UI-test
// directory -- so running from a repository root either cannot find it (offline:
// `npm exec playwright` fails ENOTCACHED) or fetches a DIFFERENT Playwright than
// the suite uses. Either way the browser it installs is not the browser the next
// rung launches, and the launch failure that follows gets reported as a ceiling
// (Codex, #355). Round 1 fixed where Playwright is RESOLVED and left where the
// installer RUNS -- half a fix, which is how the same defect arrived twice.
// A BOUND THAT LEAVES THE INSTALLER RUNNING IS NOT A BOUND. `spawnSync`'s
// `timeout` kills the direct child only, and `playwright install --with-deps`
// spawns apt (and sudo) beneath it -- so the ladder returned "interrupted",
// climbed on and launched while a PRIVILEGED package manager was still
// modifying the system and holding dpkg's locks. Measured here: `realInstall`
// returned after 402 ms and an orphaned grandchild wrote its marker two seconds
// later (Codex, #355).
//
// So the installer is started `detached`, which on POSIX gives it its own
// process group, and the bound kills the GROUP with a signal it cannot catch.
// That requires the asynchronous `spawn` -- `spawnSync` gives no handle to kill
// while it is blocking -- so this returns a promise, and `ladder()` awaits it.
//
// `spawn` and `timeout` are injectable so the SHIPPED call can be inspected. The
// first case for the bound called `spawnSync` itself with its own 500 ms
// timeout, which proved that Node honours a timeout -- a fact about Node, not
// about this file. Deleting the bound from the call left all 42 cases green
// (Codex measured it, #355). A case that tests a COPY of the call cannot notice
// the call changing.
function killGroup(child) {
  // The group id equals the pid of a detached leader. Falling back to the pid
  // alone is strictly better than nothing when the platform has no groups.
  try { process.kill(-child.pid, 'SIGKILL'); return; } catch { /* fall through */ }
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
}

function realInstall(argv, cwd, { spawn = spawnProcess, timeout = INSTALL_TIMEOUT_MS } = {}) {
  return new Promise((settle) => {
    let child;
    try {
      child = spawn('npx', argv, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      settle(classifyInstall({ status: null, signal: null, stdout: '', stderr: '', error: err }));
      return;
    }

    let stdout = '';
    let stderr = '';
    let cause = null;
    let done = false;

    const collect = (stream, onto) => {
      if (!stream) return;
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        if (onto === 'out') stdout += chunk; else stderr += chunk;
        // The buffer is a bound too, and overflowing it is an interruption
        // rather than a truncation: a browser half-fetched cannot support a
        // verdict either way.
        if (stdout.length + stderr.length > INSTALL_MAX_BUFFER && !cause) {
          cause = new Error(`the installer produced more than ${INSTALL_MAX_BUFFER} bytes`);
          killGroup(child);
        }
      });
    };
    collect(child.stdout, 'out');
    collect(child.stderr, 'err');

    const timer = setTimeout(() => {
      if (!cause) {
        cause = Object.assign(
          new Error(`the installer exceeded ${timeout} ms and its process group was killed`),
          { code: 'ETIMEDOUT' },
        );
      }
      killGroup(child);
    }, timeout);

    // THE GROUP IS REAPED WHEN THE LEADER EXITS — one handler, every cause.
    //
    // The bound killed the group; a leader terminated by an EXTERNAL signal (an
    // admin, a runner shutting down, the OS) did not, so its descendants kept
    // running after `realInstall` returned. Measured (Codex, #355). That is the
    // timeout fix's own rule, applied to one branch and not the other.
    //
    // ⚠️ AND IT CANNOT BE DONE ON `close`. `close` fires when the child's STDIO
    // has closed, and a grandchild INHERITS those pipes -- so with a descendant
    // still running, `close` waits for the descendant. Measured: reaping in the
    // settle path returned after 10 006 ms, exactly when the orphan finished on
    // its own, and the marker was written anyway. `exit` fires when the LEADER
    // dies, which is the moment the group becomes orphaned and the only moment
    // early enough to matter.
    child.on('exit', () => killGroup(child));

    const finish = (status, signal, err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      settle(classifyInstall({ status, signal, stdout, stderr, error: cause || err || null }));
    };
    child.on('error', (err) => finish(null, null, err));
    child.on('close', (status, signal) => finish(status, signal, null));
  });
}

// A MISSING HARNESS IS NOT A BROWSER CEILING, and it must not be reported as
// one. The shipped kit installs `@playwright/test` under the UI-test directory
// -- `.github/scripts/ui-tests/node_modules` -- because that is the composite's
// `working-directory`. Node does not search a nested sibling directory, so
// resolving from the repository root finds nothing even when the browser is
// installed and healthy, and every rung then fails identically and the run ends
// in CEILING (Codex, #355). Two separate defects in one line: the wrong search
// base, and a harness problem classified as a browser problem.
//
// So the base is the tests directory, defaulting to the shipped kit's location,
// and an unresolvable harness is its own outcome -- CANNOT CHECK, exit 2 --
// never a launch failure.
const DEFAULT_TESTS_DIR = '.github/scripts/ui-tests';

// THE PROBE NEEDS ITS OWN BOUND. Playwright sends `newContext()` and
// `context.close()` with `kNoTimeout`, so a browser that starts and then stops
// answering the protocol -- alive, but not responding -- hangs this file
// forever, before the next rung and before any verdict is printed. Bounding the
// INSTALLER did not make the ladder bounded (Codex, #355); the launch side needs
// the same treatment, and a diagnostic that can hang is not a diagnostic.
//
// Thirty seconds: opening an empty context is a local operation with no network
// in it, so a browser that has not answered in that time is not slow, it has
// stopped answering.
const PROBE_TIMEOUT_MS = 30 * 1000;

/**
 * Resolve to `{ value }`, `{ error }` or `{ timedOut: true }`.
 *
 * WHAT THIS CANNOT DO, said plainly: cancel the underlying call. A `kNoTimeout`
 * protocol request stays outstanding, and its handle can keep Node alive after
 * the verdict is printed -- which is why the CLI flushes and then exits rather
 * than waiting for the loop to drain. The bound buys a REPORT, not a clean
 * teardown, and those are different things.
 */
function bounded(promise, ms) {
  let timer = null;
  const stop = () => { if (timer) clearTimeout(timer); };
  return Promise.race([
    Promise.resolve(promise).then(
      (value) => { stop(); return { value }; },
      (error) => { stop(); return { error }; },
    ),
    // ⚠️ NOT `unref()`ed. An unref'd timer does not keep Node alive, so if the
    // awaited call is the only thing outstanding -- exactly the hang this bound
    // exists for -- the process exits BEFORE the bound fires, with code 0 and no
    // verdict. Measured: it ended this file's own case suite silently, mid-run.
    // A bound that cannot fire is not a bound; the timer is cleared on every
    // settled path instead, which is what keeps it from holding the loop open.
    new Promise((res) => { timer = setTimeout(() => res({ timedOut: true }), ms); }),
  ]);
}

// AN EXPLICIT DIRECTORY IS AUTHORITATIVE FOR RESOLUTION, NOT ONLY FOR EXISTENCE.
// main() already refuses a --tests-dir the caller named that does not exist. This
// fallback quietly undid half of that: a named directory that EXISTS but holds no
// Playwright resolved from the working directory instead, while the installer
// still ran in the named one -- so the ladder installed into one tree and
// launched from another, and a version or browser-revision mismatch between them
// came out as a CEILING (Codex, #355). The cwd fallback survives only for the
// DEFAULT, which is a guess this file makes rather than something the caller
// asserted.
// THE BASE WE ASKED FROM IS NOT THE BASE IT CAME FROM. `createRequire` walks
// EVERY ancestor's `node_modules`, so resolution succeeds from a directory that
// does not exist -- and the first version of this returned that directory as the
// installer's cwd, which `spawnSync` would have rejected with ENOENT while the
// banner announced it as the tree in use. Caught by this file's own case, which
// is the reason the case asserts the announced directory rather than only the
// exit code (#355 round 7).
//
// `npx` walks ancestors the same way, so the nearest EXISTING ancestor of the
// requested base resolves through exactly the chain `createRequire` used: the
// directories that do not exist contribute nothing to either search.
// THE TREE THE PACKAGE LIVES IN, derived from the package itself.
// `/x/y/node_modules/playwright/index.js` -> `/x/y`. This is the directory whose
// `node_modules` holds the module, so `npx` run there finds the same package's
// local CLI -- no search, no ambiguity, and no second computation to diverge.
//
// It also closes the symlink case. `createRequire` searches the ancestors of the
// LEXICAL path it is given, while a process spawned with that path as `cwd`
// observes the CANONICAL target and searches ITS ancestors -- two different
// trees again, and a Playwright resolved from one while the installer fetched
// another (Codex, #355). `require.resolve` returns a real path, so the tree
// derived from it is canonical by construction and both sides agree.
function treeRootOf(packagePath) {
  const parts = String(packagePath || '').split(sep);
  const marker = parts.lastIndexOf('node_modules');
  if (marker <= 0) return null;
  return parts.slice(0, marker).join(sep) || sep;
}

function nearestExisting(dir) {
  let current = resolve(dir);
  for (;;) {
    if (existsSync(current)) return current;
    const up = dirname(current);
    if (up === current) return process.cwd();
    current = up;
  }
}

function resolvePlaywright(testsDir, explicit) {
  const bases = explicit ? [resolve(testsDir)] : [resolve(testsDir), process.cwd()];
  const tried = [];
  for (const asked of bases) {
    try {
      const require_ = createRequire(join(asked, 'noop.js'));
      const mod = require_('playwright');
      // Where the module ACTUALLY came from, reported alongside the working
      // directory so a reader can see both rather than infer one from the other.
      let packagePath = null;
      try { packagePath = require_.resolve('playwright'); } catch { /* informational only */ }
      // The package's own tree when it can be derived; the nearest existing
      // ancestor of what we asked for only when it cannot.
      const base = treeRootOf(packagePath) || nearestExisting(asked);
      return { mod, asked, base, packagePath };
    } catch (err) {
      tried.push(`${asked}: ${err.message.split('\n')[0]}`);
    }
  }
  return { mod: null, tried };
}

function realLaunch(browser, testsDir, injected, explicit) {
  return () => {
    const found = injected ? { mod: injected } : resolvePlaywright(testsDir, explicit);
    if (!found.mod) {
      return { ok: false, harness: true,
               error: `playwright could not be resolved:\n    ${found.tried.join('\n    ')}` };
    }
    const playwright = found.mod;
    try {
      const browserType = playwright[browser];
      if (!browserType) return { ok: false, error: `playwright exposes no "${browser}"` };
      // Launch and close synchronously from the caller's perspective: the CLI
      // awaits this promise. A launch that starts and immediately dies still
      // counts as a failure, which is why the browser is closed rather than
      // leaked -- close throwing is a browser that did not really come up.
      // CHECK IT IS STILL CONNECTED BEFORE CLOSING IT. `Browser.close()` treats an
      // already-closed target as an idempotent success -- it catches
      // TargetClosedError and resolves -- so a browser that starts and dies
      // immediately produced `ok: true` from a clean close, which is exactly the
      // case the comment above claims to catch (Codex, #355). A successful
      // cleanup is not a health signal; `isConnected()` asks the question
      // directly, and the close is then only cleanup.
      return browserType.launch()
        .then(async (b) => {
          // USE IT, do not merely ask whether it is connected. `isConnected()` is
          // a flag sampled at an instant, and a browser that dies between that
          // sample and the close still passed -- the start-then-die window round
          // 1 claimed to have closed (Codex, #355). Opening a context is the
          // cheapest operation that requires the process to still be answering,
          // which is the property "it launched" is supposed to mean.
          let error = null;
          const opened = await bounded(b.newContext(), PROBE_TIMEOUT_MS);
          if (opened.timedOut) {
            error = `the browser started but stopped answering: no context after ${PROBE_TIMEOUT_MS} ms`;
          } else if (opened.error) {
            error = `the browser started but could not be used: ${(opened.error && opened.error.message) || opened.error}`;
          } else {
            const closed = await bounded(opened.value.close(), PROBE_TIMEOUT_MS);
            if (closed.timedOut) {
              error = `the browser started but stopped answering: the context would not close within ${PROBE_TIMEOUT_MS} ms`;
            }
            // A close that THROWS is still a browser that answered, so it is
            // cleanup rather than the verdict -- unchanged from round 3.
          }
          // Best effort, and bounded for the same reason: cleanup must not be
          // able to outlast the thing it is cleaning up after.
          await bounded(Promise.resolve().then(() => b.close()).catch(() => {}), PROBE_TIMEOUT_MS);
          return error ? { ok: false, error } : { ok: true, error: null };
        })
        .catch((err) => ({ ok: false, error: err && err.message ? err.message : String(err) }));
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  };
}

// EXPORTED AND TESTED. This lived inline in main(), which no case exercised --
// so the round-3 mutant that restored the broken filter reddened NOTHING, and the
// most user-visible bug of that round (`browser-ladder.js firefox` silently
// running chromium) had no case at all. Untested argument parsing is where that
// bug lived for two rounds.
function parseArgs(argv) {
  // WALK THE ARGUMENTS. The first version filtered on `i !== flag + 1`, and with
  // no `--tests-dir` present `flag` is -1, so `flag + 1` is 0 and the filter
  // dropped argv[0] -- the browser (Codex, #355). An index computed from a
  // not-found result is the bug; walking the list cannot produce one.
  // SUPPLIED-BUT-EMPTY IS NOT OMITTED. `|| null` collapsed a trailing
  // `--tests-dir` and a bare `--tests-dir=` into the same value the omitted case
  // produces, so the caller's malformed option silently became the shipped
  // default -- the ladder then installed into and reported on a directory the
  // caller never named, which is the mistyped-directory defect round 3 refused,
  // reached by a different route (Codex, #355). `null` now means OMITTED and
  // nothing else; an empty string means the flag was there with no usable value,
  // and main() refuses it.
  const positional = [];
  let testsDirArg = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--tests-dir') { testsDirArg = argv[i + 1] == null ? '' : argv[i + 1]; i += 1; continue; }
    if (argv[i].startsWith('--tests-dir=')) {
      testsDirArg = argv[i].slice('--tests-dir='.length);
      continue;
    }
    positional.push(argv[i]);
  }
  return {
    browser: positional[0] || 'chromium',
    testsDir: testsDirArg == null ? DEFAULT_TESTS_DIR : testsDirArg,
    testsDirArg,
  };
}

async function main(argv) {
  const { browser, testsDir, testsDirArg } = parseArgs(argv);
  if (!BROWSERS.includes(browser)) {
    console.error(`browser-ladder: unknown browser "${browser}" — expected one of ${BROWSERS.join(', ')}`);
    return 2;
  }
  console.log(`browser-ladder: ${browser} — grading on whether it LAUNCHES`);
  // NOT "running any installer from <predicted>". That line re-derived the
  // installer's directory from the existence rule the code no longer uses, so it
  // would have announced one tree while the run used another -- a banner that
  // lies quietly. The real base is printed below, after it is decided, by the
  // code that decides it.
  console.log(`  looking for playwright under ${testsDir}`
    + `${testsDirArg == null ? ', then the working directory' : ' (explicitly named — no fallback)'}`);

  // ONE implementation. main() wires the real effects into the same `ladder()`
  // the cases file drives with stubs; if it looped over RUNGS itself, the tested
  // logic and the shipped logic would be two things that merely look alike.
  // A DIRECTORY THE CALLER NAMED AND THAT DOES NOT EXIST IS A TYPO, NOT A
  // FALLBACK. Silently dropping to the working directory meant a mistyped
  // --tests-dir installed into, and reported on, a DIFFERENT harness than the
  // one asked for -- an invalid pass or an invalid ceiling, either way about
  // the wrong tree (Codex, #355). The fallback survives only for the default,
  // which is a guess this file makes rather than something the caller asserted.
  // ONLY the truly empty value is refused here. A directory whose name is
  // whitespace is legal on POSIX and resolves to a real path, so trimming before
  // this test would refuse a directory the OS accepts -- an over-broad refusal
  // where the existence check below already gives the right answer.
  if (testsDirArg === '') {
    console.error('browser-ladder: CANNOT CHECK — --tests-dir was given with no value');
    console.error('  A trailing "--tests-dir" or a bare "--tests-dir=" names no directory,');
    console.error('  and falling back to the default would install into and report on a tree');
    console.error('  you did not ask for. Pass a directory, or omit the flag entirely.');
    return 2;
  }
  if (testsDirArg && !existsSync(resolve(testsDirArg))) {
    console.error(`browser-ladder: CANNOT CHECK — --tests-dir ${testsDirArg} does not exist`);
    console.error(`  resolved: ${resolve(testsDirArg)}`);
    console.error('  This says nothing about the browser. Point it at the directory holding');
    console.error("  the UI kit's node_modules, or omit it to use the shipped default.");
    return 2;
  }
  // ONE RESOLUTION, ONE BASE — and that is why this happens HERE rather than at
  // launch time. The previous version chose the installer's directory by
  // EXISTENCE and let the launcher resolve Playwright INDEPENDENTLY, under a
  // comment claiming "the same directory for both". Two computations, and for
  // the default they disagree exactly when it matters: a default directory that
  // exists but holds no Playwright made `npx` install into it while every launch
  // used the working directory's Playwright, so the browser revision fetched was
  // not the one launched and the mismatch came out as a CEILING (Codex, #355).
  // Round 6 fixed this for an EXPLICIT --tests-dir and left the default branch —
  // a rule applied to one of the two places it governs, which is how it came
  // back a round later.
  //
  // So the tree is resolved once, and the base it resolved FROM is what the
  // installer runs in. There are no longer two values to keep in step.
  const found = resolvePlaywright(testsDir, testsDirArg != null);
  if (!found.mod) {
    // A MISSING HARNESS IS NOT A BROWSER CEILING. Reported through the shipped
    // report so there is one wording, not two.
    return report(browser, {
      ok: false,
      harness: true,
      rung: null,
      attempts: [{
        rung: 'as-is',
        install: null,
        launch: { ok: false, harness: true,
                  error: `playwright could not be resolved:\n    ${found.tried.join('\n    ')}` },
      }],
    });
  }
  console.log(`  playwright resolved from ${found.packagePath || '(path unavailable)'}`);
  console.log(`  the installer runs in ${found.base}, the same tree that resolution used`);

  const outcome = await ladder({
    browser,
    install: (argv) => realInstall(argv, found.base),
    launch: realLaunch(browser, testsDir, found.mod),
    log: (line) => console.log(line),
  });
  return report(browser, outcome);
}

// FLUSH, THEN EXIT — and flush EVERY stream this file writes to.
//
// `process.exit()` alone TERMINATES BEFORE A PIPE DRAINS, and this file's output
// is the evidence a reader keeps: quoted installer output and launch errors,
// neither length-bounded. A bare exit truncated exactly the material the CANNOT
// CHECK and CEILING reports exist to preserve.
//
// But `exitCode` alone does not guarantee LEAVING. The probe's bound cannot
// cancel a `kNoTimeout` protocol call, so its handle can hold the loop open
// after the verdict is printed -- a ladder that reports and then hangs is still a
// ladder that hangs.
//
// Writing an empty string queues a callback BEHIND everything already written,
// so it fires once that stream has drained. The first version waited for STDOUT
// ONLY, while every refusal in this file -- the unknown browser, the empty
// --tests-dir, the missing one -- goes to STDERR (Codex, #355). ⚠️ I could NOT
// reproduce the truncation here: ten runs on Node 22.22.2 with a 100,000-char
// argument returned all 100,079 stderr bytes every time. Node documents pipe
// writes as asynchronous on POSIX, so the report is credible and the fix is
// strictly more correct either way -- but the case below pins the MECHANISM
// (every stream is awaited), because a completeness assertion is green on this
// machine with or without the fix and would prove nothing.
const FLUSHED_STREAMS = [process.stdout, process.stderr];

function flushThenExit(code, streams = FLUSHED_STREAMS, exit = process.exit) {
  let pending = streams.length;
  if (!pending) { exit(code); return; }
  const settled = () => { pending -= 1; if (pending === 0) exit(code); };
  for (const stream of streams) {
    try {
      stream.write('', settled);
    } catch {
      // A stream that cannot be written to cannot be waited for either.
      settled();
    }
  }
}

module.exports = { ladder, report, RUNGS, BROWSERS, firstLine, realInstall, realLaunch,
  resolvePlaywright, classifyInstall, INSTALL_MAX_BUFFER, INSTALL_TIMEOUT_MS, parseArgs,
  DEFAULT_TESTS_DIR, PROBE_TIMEOUT_MS, bounded, treeRootOf, killGroup,
  flushThenExit, FLUSHED_STREAMS };

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
    flushThenExit(code);
  });
}
