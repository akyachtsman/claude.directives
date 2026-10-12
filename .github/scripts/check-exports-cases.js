// check-exports-cases.js — pinned cases for .github/scripts/check-exports.js,
// scoped to the swap-class expansion (audit M-46).
//
// WHY THIS EXISTS. `swap.permanent` used to re-list every `meta` path because the
// whole domain is permanent. M-46 made that derived: `swap.permanent_domains`
// names the domain and check-exports.js expands it from `domains`. A derivation
// is trusted when it is QUIET, and it fails quietly: an expansion that yields
// nothing, or an unknown domain name that expands to nothing, leaves the meta
// paths silently swappable and the check green. Each case pins BOTH the exit code
// and a required diagnostic substring, and each refusal has a twin that must
// pass, so a case cannot stay green for a reason other than the one it names.
//
// NOT exported: .github/ is outside every EXPORTS.json category path.
// ESM (.github/scripts/package.json declares "type": "module").
//
// Re-prove discrimination with a mutant (an absolute or relative path):
//   CHECK_EXPORTS_BIN=/tmp/mutant.mjs node .github/scripts/check-exports-cases.js
//
// Run: node .github/scripts/check-exports-cases.js
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { binPath, writeTree, runNode } from './cases_lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK = binPath('CHECK_EXPORTS_BIN', join(HERE, 'check-exports.js'));

// A minimal tree the guard can pass on: one permanent path outside any permanent
// domain (std.md), one meta file (meta/tool.md), one meta DIRECTORY (metadir/),
// a non-meta file whose name merely starts like it (metadir.md), and one
// swappable path (free.md). Every path is exported, in a domain, and in exactly
// one class, so the only thing a case varies is `swap`.
const FILES = {
  'std.md': 'x\n', 'meta/tool.md': 'x\n', 'metadir/x.md': 'x\n', 'metadir.md': 'x\n', 'free.md': 'x\n',
};
const PATHS = ['std.md', 'meta/tool.md', 'metadir/', 'metadir.md', 'free.md'];
const manifest = (swap) => JSON.stringify({
  categories: { docs: { paths: PATHS } },
  domains: {
    _comment: 'fixture',
    global: { core: ['std.md', 'metadir.md'], misc: ['free.md'] },
    meta: { _comment: 'fixture', session: ['meta/tool.md'], kit: ['metadir/'] },
  },
  swap,
  classes: { standard: { paths: PATHS } },
}, null, 2);

const DERIVED = 'OK:   [swap:permanent] meta/tool.md (domain meta)';
const UNKNOWN = '[swap:permanent_domains] unknown domain:';
const REDUNDANT = 'is already permanent via permanent_domains (meta)';

// [label, swap, expected exit, substring that MUST appear, substring that must NOT]
const CASES = [
  ['expansion: permanent_domains ["meta"] makes the meta path permanent',
    { permanent_domains: ['meta'], permanent: ['std.md'] }, 0, DERIVED, null],
  ['expansion: an enumerated permanent path is still read alongside the derived ones',
    { permanent_domains: ['meta'], permanent: ['std.md'] }, 0, 'OK:   [swap:permanent] std.md\n', null],
  ['twin: without permanent_domains the meta path is NOT permanent',
    { permanent: ['std.md'] }, 0, 'check-exports: OK', DERIVED],
  ['twin: a swappable path is never made permanent by the expansion',
    { permanent_domains: ['meta'], permanent: ['std.md'] }, 0, 'check-exports: OK', '[swap:permanent] free.md'],
  ['refusal: an unknown domain name fails instead of expanding to nothing',
    { permanent_domains: ['nope'], permanent: ['std.md'] }, 1, `${UNKNOWN} nope`, null],
  ['refusal: a "_"-prefixed key is not a domain',
    { permanent_domains: ['_comment'], permanent: ['std.md'] }, 1, `${UNKNOWN} _comment`, null],
  ['refusal: permanent_domains must be a list',
    { permanent_domains: 'meta', permanent: ['std.md'] }, 1, '[swap:permanent_domains] must be a list', null],
  ['refusal: an explicit null is not "no domains" (Codex, #443)',
    { permanent_domains: null, permanent: ['std.md'] }, 1, '[swap:permanent_domains] must be a list', null],
  ['refusal: a meta path re-enumerated under permanent fails (the duplication M-46 removed)',
    { permanent_domains: ['meta'], permanent: ['std.md', 'meta/tool.md'] }, 1, `meta/tool.md ${REDUNDANT}`, null],
  ['refusal: a file under a derived DIRECTORY re-enumerated under permanent fails (Codex, #443)',
    { permanent_domains: ['meta'], permanent: ['std.md', 'metadir/x.md'] }, 1, `metadir/x.md ${REDUNDANT}`, null],
  ['refusal: an enumerated directory over a derived file fails (Codex, #443)',
    { permanent_domains: ['meta'], permanent: ['std.md', 'meta/'] }, 1, `meta/ ${REDUNDANT}`, null],
  ['twin: a path that only starts like a derived directory is not under it',
    { permanent_domains: ['meta'], permanent: ['std.md', 'metadir.md'] }, 0, 'check-exports: OK', REDUNDANT],
  ['refusal: a derived permanent path missing from the tree still fails as permanent',
    { permanent_domains: ['meta'], permanent: ['std.md'], __drop: 'meta/tool.md' }, 1,
    '[swap:permanent] path missing from tree: meta/tool.md', null],
];

function runCase(swap) {
  const tmp = mkdtempSync(join(tmpdir(), 'exports-cases-'));
  try {
    const { __drop, ...realSwap } = swap;
    const files = { ...FILES, 'EXPORTS.json': manifest(realSwap) };
    if (__drop) delete files[__drop];
    writeTree(tmp, files);
    // The guard enumerates tracked files through `git ls-files`.
    for (const args of [['init', '-q'], ['add', '-A']]) {
      const g = spawnSync('git', args, { cwd: tmp, encoding: 'utf8' });
      if (g.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${g.stderr}`);
    }
    const { code, out } = runNode(CHECK, [], { cwd: tmp });
    return { code, out };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const failures = [];
for (const [label, swap, expected, must, mustNot] of CASES) {
  const { code, out } = runCase(swap);
  if (code !== expected) {
    failures.push(`${label}\n      expected exit ${expected}; got ${code}.\n      ${out.trim()}`);
  } else if (!out.includes(must)) {
    failures.push(`${label}\n      exited ${code} as expected, but for the wrong stated reason.\n`
      + `      expected the output to contain: ${JSON.stringify(must)}\n      ${out.trim()}`);
  } else if (mustNot && out.includes(mustNot)) {
    failures.push(`${label}\n      output contains what it must not: ${JSON.stringify(mustNot)}\n      ${out.trim()}`);
  } else {
    console.log(`OK:   ${label} (exit ${code})`);
  }
}

if (failures.length) {
  console.error('\ncheck-exports-cases: FAILED\n');
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log(`check-exports-cases: OK — ${CASES.length} swap-class shapes read correctly.`);
