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
  if (proc.error) {
    return {
      code,
      output: `${output}\n[this ladder could not run the installer to completion: ${proc.error.message}]`.trim(),
      interrupted: true,
    };
  }
  return { code, output };
}

function realInstall(argv) {
  return classifyInstall(spawnSync('npx', argv, {
    encoding: 'utf8',
    maxBuffer: INSTALL_MAX_BUFFER,
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
          const alive = b.isConnected();
          try { await b.close(); } catch { /* cleanup, not the verdict */ }
          return alive
            ? { ok: true, error: null }
            : { ok: false, error: 'the browser started and then disconnected before it could be used' };
        })
        .catch((err) => ({ ok: false, error: err && err.message ? err.message : String(err) }));
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  };
}

async function main(argv) {
  const flag = argv.indexOf('--tests-dir');
  const testsDir = flag >= 0 && argv[flag + 1] ? argv[flag + 1] : DEFAULT_TESTS_DIR;
  const positional = argv.filter((a, i) => a !== '--tests-dir' && i !== flag + 1);
  const browser = positional[0] || 'chromium';
  if (!BROWSERS.includes(browser)) {
    console.error(`browser-ladder: unknown browser "${browser}" — expected one of ${BROWSERS.join(', ')}`);
    return 2;
  }
  console.log(`browser-ladder: ${browser} — grading on whether it LAUNCHES`);
  console.log(`  resolving playwright from ${testsDir} (then the working directory)`);

  // ONE implementation. main() wires the real effects into the same `ladder()`
  // the cases file drives with stubs; if it looped over RUNGS itself, the tested
  // logic and the shipped logic would be two things that merely look alike.
  const outcome = await ladder({
    browser,
    install: realInstall,
    launch: realLaunch(browser, testsDir),
    log: (line) => console.log(line),
  });
  return report(browser, outcome);
}

module.exports = { ladder, report, RUNGS, BROWSERS, firstLine, realInstall, realLaunch,
  resolvePlaywright, classifyInstall, INSTALL_MAX_BUFFER };

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
