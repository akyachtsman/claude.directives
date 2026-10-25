#!/usr/bin/env node
// release-plan-cases.js — release-plan.js's own guard.
//
// The release workflow runs only when the owner presses it, so a wrong version
// or a release cut from the wrong commit would first show up as a published,
// immutable tag. These cases pin each rule in release-plan.js's header: the
// version arithmetic against the shipped nextRelease(), and the CLI's refusals
// and notes against a real throwaway git repository. Drive a mutated copy with
// RELEASE_PLAN_BIN.
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { binPath, runNode } from './cases_lib.mjs';

const BIN = binPath('RELEASE_PLAN_BIN', '.github/scripts/release-plan.js');
const { nextRelease } = await import(pathToFileURL(BIN).href);

const failures = [];
let count = 0;
function check(label, fn) {
  count++;
  try {
    fn();
    console.log(`OK:   ${label}`);
  } catch (err) {
    console.log(`FAIL: ${label}`);
    failures.push(`${label}\n      ${err.message}`);
  }
}
function eq(got, want, what) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) throw new Error(`${what}: got ${g}, want ${w}`);
}
function refuses(fn, pattern) {
  try { fn(); } catch (err) {
    if (!pattern.test(err.message)) throw new Error(`refused for the wrong reason: ${err.message}`);
    return;
  }
  throw new Error('did not refuse');
}

// ── version arithmetic ───────────────────────────────────────────────
const plan = (tags, bump, onSha = []) => nextRelease({ tags, onSha, bump });

check('the first release is v1.0.0, whatever the bump', () => {
  for (const bump of ['major', 'minor', 'patch']) {
    eq(plan([], bump), { version: 'v1.0.0', major: 'v1', previous: null, existing: false }, bump);
  }
});
check('minor, patch and major bump from the latest release', () => {
  const tags = ['v1.0.0', 'v1.1.0', 'v1'];
  eq(plan(tags, 'minor').version, 'v1.2.0', 'minor');
  eq(plan(tags, 'patch').version, 'v1.1.1', 'patch');
  eq(plan(tags, 'major'), { version: 'v2.0.0', major: 'v2', previous: 'v1.1.0', existing: false }, 'major');
});
check('versions compare as numbers, not text (v1.10.0 follows v1.9.0)', () => {
  eq(plan(['v1.9.0', 'v1.10.0', 'v1.2.0'], 'minor').previous, 'v1.10.0', 'previous');
});
check('only vX.Y.Z tags are releases: v1, v0.1.0-rc and other names are ignored', () => {
  eq(plan(['v1', 'v9', 'v0.1.0-rc', 'release-5', 'v2.0'], 'minor').version, 'v1.0.0', 'version');
});
check('the commit already carrying the latest release is that release again', () => {
  eq(plan(['v1.0.0', 'v1.1.0', 'v1'], 'minor', ['v1.1.0', 'v1']),
    { version: 'v1.1.0', major: 'v1', previous: 'v1.0.0', existing: true }, 'repair');
  eq(plan(['v1.0.0'], 'patch', ['v1.0.0']).previous, null, 'first-release repair');
});
check('a commit carrying an older release is refused', () => {
  refuses(() => plan(['v1.0.0', 'v1.1.0'], 'minor', ['v1.0.0']), /already v1\.0\.0, older than the latest release v1\.1\.0/);
});
check('an unknown bump is refused', () => {
  refuses(() => plan([], 'huge'), /bump must be one of/);
});

// ── the CLI against a real repository ─────────────────────────────────
const dir = realpathSync(mkdtempSync(join(tmpdir(), 'release-plan-')));
const git = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim();
git('init', '-q', '-b', 'main');
git('config', 'user.email', 'cases@example.invalid');
git('config', 'user.name', 'cases');
git('config', 'commit.gpgsign', 'false');
const commit = msg => { git('commit', '-q', '--allow-empty', '-m', msg); return git('rev-parse', 'HEAD'); };
const cli = (sha, bump, extra = []) => runNode(BIN, ['--sha', sha, '--bump', bump, '--notes-out', join(dir, 'notes.md'), ...extra],
  { cwd: dir, env: { ...process.env, GITHUB_OUTPUT: '' } });
const notes = () => readFileSync(join(dir, 'notes.md'), 'utf8');

const first = commit('Start (#1)');
check('CLI: the first release, with its notes and pin line', () => {
  const r = cli(first, 'minor');
  eq(r.code, 0, `exit (${r.out})`);
  if (!/^version=v1\.0\.0$/m.test(r.out) || !/^existing=false$/m.test(r.out)) throw new Error(r.out);
  if (!/## First release/.test(notes()) || !notes().includes(`Commit: \`${first}\``)) throw new Error(notes());
  if (!notes().includes('shared-qa.yml@v1')) throw new Error(`no pin line:\n${notes()}`);
});

git('tag', 'v1.0.0', first);
git('tag', 'v1', first);
const side = commit('Fix one (#2)');
git('checkout', '-q', '-b', 'feature');
commit('wip on the feature');
git('checkout', '-q', 'main');
git('merge', '-q', '--no-ff', 'feature', '-m', 'Fix two (#3)');   // a merge commit: its branch's commits are not main's
const head = git('rev-parse', 'HEAD');
check('CLI: the notes list every first-parent subject since the previous release, newest first', () => {
  const r = cli(head, 'minor', ['--summary', 'House style, batch two.']);
  eq(r.code, 0, `exit (${r.out})`);
  if (!/^version=v1\.1\.0$/m.test(r.out) || !/^previous=v1\.0\.0$/m.test(r.out)) throw new Error(r.out);
  const n = notes();
  if (!n.startsWith('House style, batch two.\n')) throw new Error(`summary not first:\n${n}`);
  if (!/## What changed since v1\.0\.0\n\n- Fix two \(#3\)\n- Fix one \(#2\)\n/.test(n)) throw new Error(n);
  if (/Start \(#1\)/.test(n)) throw new Error(`lists a commit from before v1.0.0:\n${n}`);
  if (/wip on the feature/.test(n)) throw new Error(`lists a merged branch's own commit, not first-parent only:\n${n}`);
});
git('tag', 'v1.1.0', head);
check('CLI: pressing again on the released commit repairs, it does not cut a new version', () => {
  const r = cli(head, 'minor');
  eq(r.code, 0, `exit (${r.out})`);
  if (!/^version=v1\.1\.0$/m.test(r.out) || !/^existing=true$/m.test(r.out)) throw new Error(r.out);
  if (!/## What changed since v1\.0\.0\n\n- Fix two \(#3\)\n- Fix one \(#2\)\n/.test(notes())) throw new Error(notes());
});
check('CLI: a commit behind the latest release is refused (main only moves forward)', () => {
  const r = cli(side, 'patch');
  eq(r.code, 1, `exit (${r.out})`);
  if (!/does not descend from v1\.1\.0/.test(r.out)) throw new Error(r.out);
});
check('CLI: a commit that does not descend from the previous release is refused', () => {
  git('checkout', '-q', '--orphan', 'other');
  const stray = commit('Unrelated (#9)');
  git('checkout', '-q', 'main');
  const r = cli(stray, 'minor');
  eq(r.code, 1, `exit (${r.out})`);
  if (!/does not descend from v1\.1\.0/.test(r.out)) throw new Error(r.out);
});
check('CLI: an unknown argument is refused with the usage line', () => {
  const r = runNode(BIN, ['--sha', head, '--force', 'yes'], { cwd: dir });
  eq(r.code, 1, 'exit');
  if (!/usage: release-plan\.js/.test(r.out)) throw new Error(r.out);
});

if (failures.length) {
  console.log('\nrelease-plan-cases: FAILED');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`\nrelease-plan-cases: OK — ${count} pinned release rules.`);
