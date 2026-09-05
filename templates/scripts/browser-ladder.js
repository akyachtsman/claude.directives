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

'use strict';

const { spawnSync } = require('child_process');
const { createRequire } = require('module');
const { join, resolve } = require('path');
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
      installed = install(argv);
      // DELIBERATELY NOT A BRANCH. A non-zero install is recorded and the ladder
      // continues to the launch: defect 2 was reading this exit code as the
      // answer, and defect 3 was letting the dependency phase's failure end the
      // ladder before anything was ever launched.
      log(`    install exited ${installed.code} (context, not a verdict)`);
      // AN INTERRUPTED INSTALL IS NOT A RUNG THAT HAPPENED. round 2 learned to
      // DETECT a spawn the ladder cut short and then carried on as though the
      // rung had completed -- so a launch failing for want of a browser this
      // ladder never finished fetching was still reported as a CEILING. Detecting
      // it and not acting on it is the same defect one step later (Codex, #355).
      if (installed.interrupted) {
        attempts.push({ rung: rung.name, install: installed, launch: null });
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
    print('  No ceiling for this browser. A failure in your suite is about your');
    print('  code or your app, not about the browser being missing here.');
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
    for (const line of String(last.install.output || '').split('\n').slice(0, 10)) print(`  ${line}`);
    print('');
    print('  No launch was attempted after it, because a browser this ladder never');
    print('  finished fetching cannot support a verdict either way.');
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
    return {
      code,
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
function realInstall(argv, cwd) {
  return classifyInstall(spawnSync('npx', argv, {
    encoding: 'utf8',
    maxBuffer: INSTALL_MAX_BUFFER,
    cwd,
  }));
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

function resolvePlaywright(testsDir) {
  const bases = [resolve(testsDir), process.cwd()];
  const tried = [];
  for (const base of bases) {
    try {
      return { mod: createRequire(join(base, 'noop.js'))('playwright'), base };
    } catch (err) {
      tried.push(`${base}: ${err.message.split('\n')[0]}`);
    }
  }
  return { mod: null, tried };
}

function realLaunch(browser, testsDir, injected) {
  return () => {
    const found = injected ? { mod: injected } : resolvePlaywright(testsDir);
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
          try {
            const context = await b.newContext();
            await context.close();
          } catch (err) {
            error = `the browser started but could not be used: ${(err && err.message) || err}`;
          }
          try { await b.close(); } catch { /* cleanup, not the verdict */ }
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
  console.log(`  resolving playwright from ${testsDir} (then the working directory)`);
  console.log(`  running any installer from ${existsSync(resolve(testsDir)) ? resolve(testsDir) : process.cwd()}`);

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
  // THE SAME DIRECTORY FOR BOTH. An installer and a launcher pointed at different
  // trees is the mismatch round 2 fixed; passing one value to both is what keeps
  // them from drifting apart again.
  const base = existsSync(resolve(testsDir)) ? resolve(testsDir) : process.cwd();
  const outcome = await ladder({
    browser,
    install: (argv) => realInstall(argv, base),
    launch: realLaunch(browser, testsDir),
    log: (line) => console.log(line),
  });
  return report(browser, outcome);
}

module.exports = { ladder, report, RUNGS, BROWSERS, firstLine, realInstall, realLaunch,
  resolvePlaywright, classifyInstall, INSTALL_MAX_BUFFER, parseArgs, DEFAULT_TESTS_DIR };

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
