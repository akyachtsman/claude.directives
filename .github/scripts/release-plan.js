#!/usr/bin/env node
// release-plan.js — what the one-click release (.github/workflows/release.yml)
// publishes: the next repo-wide version and its release notes (#460 step 4,
// Phase B; owner, 2026-10-25).
//
// One version covers the whole repo: a release stamps everything on `main` at
// one commit. Release tags are `vX.Y.Z` and never move. Beside them, a moving
// `v<major>` tag (`v1`) names the latest release of that major, and is what a
// project pins by default.
//
//   node .github/scripts/release-plan.js --sha <commit> --bump minor|patch|major \
//        [--summary "<one line>"] [--notes-out <file>]
//
// Prints `version=`, `major=`, `previous=` and `existing=` lines, and appends
// them to $GITHUB_OUTPUT when that is set. Exit 1 refuses, with the reason.
//
// The rules, each pinned by release-plan-cases.js:
//   - The first release is v1.0.0, whatever the bump.
//   - Only `vX.Y.Z` tags count as releases; `v1` and anything else is ignored.
//     Versions compare as numbers, so v1.10.0 follows v1.9.0.
//   - A commit that already carries the latest release is that release again
//     (`existing=true`): pressing the button twice, or after a run that failed
//     between the release and the `v1` move, repairs instead of refusing. A
//     commit carrying an OLDER release is refused.
//   - The commit must descend from the previous release: a release only moves
//     forward along main.
//   - The notes list the first-parent subjects since the previous release:
//     main is squash-merged, so each line is one merged PR's title.
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = 'akyachtsman/claude.directives';
const RELEASE = /^v(\d+)\.(\d+)\.(\d+)$/;
const BUMPS = ['major', 'minor', 'patch'];

const parse = t => RELEASE.exec(t)?.slice(1).map(Number) ?? null;
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const name = v => `v${v.join('.')}`;

// tags: every tag in the repo. onSha: the tags pointing at the commit.
// Returns { version, major, previous, existing }; throws to refuse.
export function nextRelease({ tags, onSha, bump }) {
  if (!BUMPS.includes(bump)) throw new Error(`bump must be one of ${BUMPS.join(', ')}, not "${bump}"`);
  const releases = tags.map(parse).filter(Boolean).sort(cmp);
  const latest = releases.at(-1) ?? null;
  const here = onSha.map(parse).filter(Boolean).sort(cmp).at(-1) ?? null;

  if (here) {
    if (cmp(here, latest) !== 0) {
      throw new Error(`this commit is already ${name(here)}, older than the latest release ${name(latest)}`);
    }
    const below = releases.filter(v => cmp(v, here) < 0).at(-1) ?? null;
    return { version: name(here), major: `v${here[0]}`, previous: below && name(below), existing: true };
  }

  let next;
  if (!latest) next = [1, 0, 0];
  else if (bump === 'major') next = [latest[0] + 1, 0, 0];
  else if (bump === 'minor') next = [latest[0], latest[1] + 1, 0];
  else next = [latest[0], latest[1], latest[2] + 1];
  return { version: name(next), major: `v${next[0]}`, previous: latest && name(latest), existing: false };
}

// The release body. subjects: first-parent commit subjects, newest first.
export function releaseNotes({ version, major, previous, sha, subjects, summary }) {
  const out = [];
  if (summary && summary.trim()) out.push(summary.trim(), '');
  if (previous) {
    out.push(`## What changed since ${previous}`, '');
    for (const s of subjects) out.push(`- ${s}`);
  } else {
    out.push('## First release', '', 'Everything on `main` up to this commit. Later releases list what changed since the one before.');
  }
  out.push(
    '',
    `Commit: \`${sha}\``,
    '',
    `A project pins \`@${version}\` to stay on exactly this release, or \`@${major}\` to follow the latest one of this major:`,
    '',
    `    uses: ${REPO}/.github/workflows/shared-qa.yml@${major}`,
    '',
  );
  return out.join('\n');
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function main(argv) {
  const opt = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!['--sha', '--bump', '--summary', '--notes-out'].includes(k) || i + 1 >= argv.length) {
      throw new Error(`usage: release-plan.js --sha <commit> --bump minor|patch|major [--summary <text>] [--notes-out <file>] (bad argument: ${k})`);
    }
    opt[k.slice(2)] = argv[i + 1];
  }
  if (!opt.sha) throw new Error('--sha is required');
  const sha = git('rev-parse', '--verify', `${opt.sha}^{commit}`);

  const tags = git('tag', '--list').split('\n').filter(Boolean);
  const onSha = git('tag', '--points-at', sha).split('\n').filter(Boolean);
  const p = nextRelease({ tags, onSha, bump: opt.bump ?? 'minor' });

  let subjects = [];
  if (p.previous) {
    try {
      git('merge-base', '--is-ancestor', p.previous, sha);
    } catch {
      throw new Error(`${sha.slice(0, 7)} does not descend from ${p.previous}; a release only moves forward along main`);
    }
    // Never empty: a commit equal to the previous release carries its tag, so
    // it is either the repair above or refused as an older release.
    subjects = git('log', '--first-parent', '--format=%s', `${p.previous}..${sha}`).split('\n').filter(Boolean);
  }

  if (opt['notes-out']) {
    writeFileSync(opt['notes-out'], releaseNotes({ ...p, sha, subjects, summary: opt.summary }), 'utf8');
  }
  const lines = [`version=${p.version}`, `major=${p.major}`, `previous=${p.previous ?? ''}`, `existing=${p.existing}`];
  console.log(lines.join('\n'));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`release-plan: REFUSED — ${err.message}`);
    process.exit(1);
  }
}
