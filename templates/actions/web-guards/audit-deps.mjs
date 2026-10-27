// audit-deps.mjs — `npm audit` of EVERY npm dependency tree in the repository,
// failing on any advisory at or above AUDIT_LEVEL (default high).
//
//   AUDIT_LEVEL=high AUDIT_SKIP='' node audit-deps.mjs
//
// Ported from apfp.claude's .github/scripts/audit-deps.mjs (2026-10-27), which
// exists because one hand-written audit line was found wrong three times in an
// hour (apfp #1002). Each lesson stays:
//   1. THE TREES ARE DERIVED, NEVER LISTED: every package.json outside
//      node_modules. A named directory missed a whole tree.
//   2. EVERY TREE IS AUDITED BEFORE THE VERDICT, and each failure counts. A
//      `find -execdir` swallowed the child's status and passed with a
//      high-severity advisory present.
//   3. A SEARCH THAT FINDS NOTHING SAYS SO. Run from the wrong place, the old
//      loop audited zero trees and reported success.
//
// What changed for the fleet:
//   - A manifest with no dependencies and no lockfile (the commonjs
//     package.json the shared scripts ship) has nothing to audit and is listed
//     as such. A lockfile is always audited: a workspace root declares nothing
//     itself and locks every workspace's dependencies.
//   - A manifest with dependencies but no lockfile is resolved into a lockfile
//     in a scratch directory (never in the checkout) and that is audited: what
//     an install would fetch today. apfp's hard failure here would have turned
//     every project red on the package.json the shared scripts install.
//   - A workspace package with no lockfile of its own is covered by the root
//     lockfile that lists it, and is not resolved alone.
//   - The verdict is read from `npm audit --json`, so an audit that did not run
//     (the registry down, a bad lockfile) fails as "did not run", never as clean.
//   - AUDIT_SKIP names a manifest (its directory or its package.json) this run
//     leaves out, and an entry naming nothing on disk fails.
//   - NPM_BIN names the npm to run; the cases suite points it at a fake.

import { pathToFileURL } from 'node:url';
import { readdirSync, readFileSync, existsSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const LEVELS = ['info', 'low', 'moderate', 'high', 'critical'];
const NPM = process.env.NPM_BIN || 'npm';

function manifests(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.claude-directives') continue;
    const p = dir === '.' ? e.name : join(dir, e.name);
    if (e.isDirectory()) manifests(p, out);
    else if (e.isFile() && e.name === 'package.json') out.push(p);
  }
  return out;
}

function parseSkip(text) {
  const out = [];
  for (const raw of String(text || '').split(/[\s,]+/)) {
    if (!raw) continue;
    let p = raw.replace(/^\.\//, '').replace(/\/+$/, '');
    if (!existsSync(p)) throw new Error(`audit-skip entry "${raw}" names ${p}, which does not exist. Remove the entry.`);
    if (!p.endsWith('package.json')) p = join(p, 'package.json');
    out.push(p);
  }
  return out;
}

/* A workspace package has no lockfile of its own: the lockfile of the root
 * that lists it under `packages` covers it, and auditing it alone would fail to
 * resolve its sibling workspaces. The nearest such root, or null. */
function workspaceRoot(dir) {
  const parts = dir === '.' ? [] : dir.split(/[\\/]/);
  for (let i = parts.length - 1; i >= 0; i--) {
    const root = parts.slice(0, i).join('/') || '.';
    const lockPath = join(root, 'package-lock.json');
    if (!existsSync(lockPath)) continue;
    try {
      const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
      if (lock.packages && Object.prototype.hasOwnProperty.call(lock.packages, parts.slice(i).join('/'))) return lockPath;
    } catch { /* an unreadable lockfile covers nothing; its own tree reports it */ }
  }
  return null;
}

const DEP_KEYS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

/* One tree: { verdict: 'clean' | 'failed' | 'error' | 'none', lines } */
function auditTree(manifest, level) {
  const dir = dirname(manifest);
  let pkg;
  try { pkg = JSON.parse(readFileSync(manifest, 'utf8')); }
  catch (e) { return { verdict: 'error', lines: [`${manifest} is not valid JSON: ${e.message}`] }; }
  // A lockfile is always audited, whatever the manifest declares itself: a
  // workspace root may declare nothing and lock every workspace's dependencies
  // (Codex, #493). Only a manifest with neither has nothing to audit.
  let cwd = dir, scratch = null, note = '';
  const lock = ['package-lock.json', 'npm-shrinkwrap.json'].find(f => existsSync(join(dir, f)));
  if (!lock) {
    const owner = workspaceRoot(dir);
    if (owner) return { verdict: 'none', lines: [`a workspace of ${owner}, audited with it`] };
    if (pkg.workspaces) {
      return { verdict: 'error', lines: ['a workspace root with no lockfile: its workspaces cannot be resolved one by one.',
        'Commit the package-lock.json npm install writes here.'] };
    }
    if (!DEP_KEYS.some(k => pkg[k] && Object.keys(pkg[k]).length)) return { verdict: 'none', lines: [] };
    scratch = mkdtempSync(join(tmpdir(), 'audit-deps-'));
    copyFileSync(manifest, join(scratch, 'package.json'));
    // The project's own npm config (a private registry, its auth) travels with
    // it: npm reads a .npmrc beside package.json as that project's (Codex, #493).
    if (existsSync(join(dir, '.npmrc'))) copyFileSync(join(dir, '.npmrc'), join(scratch, '.npmrc'));
    const r = spawnSync(NPM, ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
      { cwd: scratch, encoding: 'utf8' });
    if (r.status !== 0) {
      rmSync(scratch, { recursive: true, force: true });
      return { verdict: 'error', lines: [`no lockfile, and npm could not resolve one: ${(r.stderr || r.error || '').toString().trim().split('\n').slice(-3).join(' ')}`,
        'Commit a package-lock.json beside it, or name it in audit-skip.'] };
    }
    cwd = scratch; note = ' (no lockfile: audited what an install would resolve today)';
  }
  const r = spawnSync(NPM, ['audit', '--json', `--audit-level=${level}`], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  let report;
  try { report = JSON.parse(r.stdout); } catch { report = null; }
  if (!report || report.error || !report.metadata || !report.metadata.vulnerabilities) {
    const why = report && report.error ? `${report.error.code || ''} ${report.error.summary || ''}`.trim()
      : (r.stderr || r.error || 'no JSON report').toString().trim().split('\n').slice(-3).join(' ');
    return { verdict: 'error', lines: [`npm audit did not run: ${why}`] };
  }
  const floor = LEVELS.indexOf(level);
  const bad = Object.entries(report.vulnerabilities || {})
    .filter(([, v]) => LEVELS.indexOf(v.severity) >= floor)
    .map(([name, v]) => {
      const adv = (v.via || []).find(x => typeof x === 'object') || {};
      return `${v.severity}: ${name}${adv.title ? ' — ' + adv.title : ''}${adv.url ? ' (' + adv.url + ')' : ''}${v.fixAvailable ? '; a fix is available (npm audit fix)' : '; no fix released yet'}`;
    });
  const counts = LEVELS.slice().reverse().map(l => `${report.metadata.vulnerabilities[l] || 0} ${l}`).join(', ');
  return { verdict: bad.length ? 'failed' : 'clean', lines: [`${counts}${note}`, ...bad] };
}

export function run({ level = 'high', skipText = '' } = {}) {
  if (!LEVELS.includes(level)) throw new Error(`audit-level "${level}" is not one of ${LEVELS.join(', ')}.`);
  const skip = parseSkip(skipText);
  const found = manifests('.').sort();
  const results = found.map(m => skip.includes(m) ? { manifest: m, verdict: 'skipped', lines: [] } : { manifest: m, ...auditTree(m, level) });
  return { found, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const level = process.env.AUDIT_LEVEL || 'high';
    const { found, results } = run({ level, skipText: process.env.AUDIT_SKIP });
    if (!found.length) {
      console.log('audit-deps: no package.json in this repository; no npm dependency to audit.');
      process.exit(0);
    }
    console.log(`audit-deps: ${found.length} manifest(s), failing at ${level} or above:`);
    for (const r of results) {
      const head = { clean: 'clean', failed: 'FAILED', error: 'DID NOT RUN', none: 'no dependencies', skipped: 'skipped (audit-skip)' }[r.verdict];
      console.log(`  ${r.manifest}: ${head}`);
      for (const l of r.lines) console.log(`      ${l}`);
      if ((r.verdict === 'failed' || r.verdict === 'error') && process.env.GITHUB_ACTIONS) {
        console.log(`::error file=${r.manifest}::npm audit ${r.verdict === 'failed' ? `found advisories at ${level} or above` : 'did not run'} for ${r.manifest}`);
      }
    }
    const bad = results.filter(r => r.verdict === 'failed' || r.verdict === 'error');
    if (bad.length) {
      console.error(`audit-deps: ${bad.length} manifest(s) failed: ${bad.map(r => r.manifest).join(', ')}. ` +
        'Update the dependency (npm audit fix), or, for a tree that ships nothing, name it in audit-skip.');
      process.exit(1);
    }
    console.log(`audit-deps: clean (${results.filter(r => r.verdict === 'clean').length} audited, nothing at ${level} or above).`);
  } catch (e) {
    console.error('audit-deps: ' + e.message);
    process.exit(1);
  }
}
