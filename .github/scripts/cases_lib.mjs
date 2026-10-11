// Shared plumbing for this repo's JavaScript case suites (`*-cases.js`), the
// counterpart of cases_lib.py for the Python ones.
//
// Each suite pins a guard's behaviour by running the REAL guard -- or a mutant
// named by the suite's own `*_BIN` variable -- against fixtures. What lives here
// is only the scaffolding the suites repeated: resolving that variable, writing
// a fixture tree, and running a Node script. The cases, their reporting and
// every fixture builder that says something about a guard stay in the suite
// that owns them.
//
// NOT exported, and not a guard: it lives beside the suites in .github/scripts/.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// The script under test: the mutant `envVar` names, else `fallback`. Resolved
// against the CALLER's cwd, never left relative: cases run the script with cwd
// set to a temp dir, so a relative mutant path would resolve there, fail to
// load, and every case would "discriminate" by crashing -- a proof that proves
// nothing (check-links-cases.js, #365).
export function binPath(envVar, fallback) {
  return process.env[envVar] ? resolve(process.env[envVar]) : resolve(fallback);
}

// Write { relative path: text } under `root`, creating directories.
export function writeTree(root, files) {
  for (const [rel, body] of Object.entries(files)) {
    const dest = join(root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, body, 'utf8');
  }
}

// Run a Node script; return { code, out } with stdout + stderr. A process killed
// by a signal has no status: that is reported as -1, never as a pass.
export function runNode(script, args = [], opts = {}) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', ...opts });
  return { code: r.status ?? -1, out: `${r.stdout || ''}${r.stderr || ''}` };
}
