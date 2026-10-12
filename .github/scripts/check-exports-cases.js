// check-exports-cases.js — pinned cases for .github/scripts/check-exports.js,
// scoped to the per-path records (audit B6) and the swap-class expansion over
// them (audit M-46).
//
// WHY THIS EXISTS. EXPORTS.json used to enumerate the same exported paths three
// times — `domains`, `classes`, `swap` — and the guard proved the three agreed.
// B6 replaced them with ONE record per path under `paths`, so the views can no
// longer disagree; what can still go wrong is a record that names nothing real
// (an unknown domain or class, no compartment, a misspelt field) and reads as
// fine. `swap.permanent_domains` is a derivation over the records: the whole
// `meta` domain is permanent without any record saying so. A derivation is
// trusted when it is QUIET, and it fails quietly: an expansion that yields
// nothing, or an unknown domain name that expands to nothing, leaves the meta
// paths silently swappable and the check green. Each case pins BOTH the exit
// code and a required diagnostic substring, and each refusal has a twin that
// must pass, so a case cannot stay green for a reason other than the one it
// names.
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
// swappable path (free.md). Every path is exported and has one well-formed
// record, so the only thing a case varies is what its edit changes.
const FILES = {
  'std.md': 'x\n', 'meta/tool.md': 'x\n', 'metadir/x.md': 'x\n', 'metadir.md': 'x\n', 'free.md': 'x\n',
};
const rec = (domain, compartment, extra = {}) => ({ domain, compartment, class: 'standard', ...extra });
const base = () => ({
  categories: { docs: { paths: ['std.md', 'meta/tool.md', 'metadir/', 'metadir.md', 'free.md'] } },
  domains: { _comment: 'fixture', names: ['global', 'meta'] },
  swap: { _comment: 'fixture', permanent_domains: ['meta'] },
  classes: { _comment: 'fixture', standard: { label: 'Standards', blurb: 'fixture' } },
  paths: {
    _comment: 'fixture',
    'std.md': rec('global', 'core', { swap: 'permanent' }),
    'metadir.md': rec('global', 'core'),
    'free.md': rec('global', 'misc'),
    'meta/tool.md': rec('meta', 'session'),
    'metadir/': rec('meta', 'kit'),
  },
});

const DERIVED = 'swap:permanent] meta/tool.md (domain meta)';
const UNKNOWN = '[swap:permanent_domains] unknown domain:';
const REDUNDANT = 'is already permanent via permanent_domains (meta)';
const OK = 'check-exports: OK';
const sw = v => m => { m.swap.permanent_domains = v; };
const at = (p, fn) => m => { fn(m.paths[p]); };

// [label, edit(manifest) or null, expected exit, substring that MUST appear,
//  substring that must NOT, file to drop from the tree]
const CASES = [
  // --- the records themselves (B6)
  ['records: a well-formed fixture passes and reports every record',
    null, 0, '[paths] 5 records, each with a known domain (2), a compartment, and a known class (1)', 'FAIL'],
  ['refusal: a record beneath a directory record fails, marked or not (Codex, #445)',
    m => { m.paths['metadir/x.md'] = rec('global', 'core'); }, 1,
    '[paths] metadir/x.md is already covered by the directory record metadir/', null],
  ['refusal: a record naming an unlisted domain fails',
    at('free.md', r => { r.domain = 'nope'; }), 1, '[paths] free.md: unknown domain: nope', null],
  ['refusal: a record with no domain fails',
    at('free.md', r => { delete r.domain; }), 1, '[paths] free.md: unknown domain: undefined', null],
  ['refusal: a record with no compartment fails',
    at('free.md', r => { delete r.compartment; }), 1, '[paths] free.md: no compartment', null],
  ['refusal: an empty compartment is no compartment',
    at('free.md', r => { r.compartment = ''; }), 1, '[paths] free.md: no compartment: ""', null],
  ['refusal: a record naming an undefined class fails',
    at('free.md', r => { r.class = 'nope'; }), 1, '[paths] free.md: unknown class: nope', null],
  ['refusal: a record with no class fails',
    at('free.md', r => { delete r.class; }), 1, '[paths] free.md: unknown class: undefined', null],
  ['refusal: a "_"-prefixed class key is a comment, not a class',
    at('free.md', r => { r.class = '_comment'; }), 1, '[paths] free.md: unknown class: _comment', null],
  ['refusal: an unknown swap value fails instead of reading as swappable',
    at('free.md', r => { r.swap = 'perm'; }), 1, '[paths] free.md: swap must be one of permanent/orchestrator: "perm"', null],
  ['twin: swap orchestrator is a known swap class',
    at('free.md', r => { r.swap = 'orchestrator'; }), 0, 'swap:orchestrator] free.md', null],
  ['refusal: a misspelt field fails instead of being ignored',
    at('std.md', r => { delete r.swap; r.Swap = 'permanent'; }), 1, '[paths] std.md: unknown field: Swap', null],
  ['refusal: a record that is not an object fails',
    m => { m.paths['free.md'] = 'global.misc'; }, 1, '[paths] free.md: a record must be an object', null],
  ['refusal: a non-string domains.names entry fails, not filtered out (Codex, #445)',
    m => { m.domains.names.push(7); }, 1, '[domains] not a domain name: 7', null],
  ['refusal: an empty or "_"-prefixed domains.names entry fails',
    m => { m.domains.names.push('_x'); }, 1, '[domains] not a domain name: "_x"', null],
  ['refusal: a domain listed twice fails',
    m => { m.domains.names.push('meta'); }, 1, '[domains] listed twice: meta', null],
  ['refusal: domains.names must be a list',
    m => { m.domains.names = 'global'; }, 1, '[domains] names must be a list', null],
  ['refusal: a listed domain no record names fails',
    m => { m.domains.names.push('data'); }, 1, '[domains] data is listed but no record names it', null],
  ['refusal: a record path missing from the tree fails',
    null, 1, '[global.misc · standard] path missing from tree: free.md', null, 'free.md'],
  ['refusal (reverse pass): a shipped file with no record fails',
    m => { delete m.paths['free.md']; }, 1, 'shipped file inside no record under paths', null],

  // --- the permanent-domain expansion over the records (M-46)
  ['expansion: permanent_domains ["meta"] makes the meta path permanent',
    null, 0, DERIVED, null],
  ['expansion: a record marked swap: permanent is still read alongside the derived ones',
    null, 0, '[global.core · standard · swap:permanent] std.md\n', null],
  ['twin: without permanent_domains the meta path is NOT permanent',
    m => { delete m.swap.permanent_domains; }, 0, OK, DERIVED],
  ['twin: a swappable path is never made permanent by the expansion',
    null, 0, OK, 'swap:permanent] free.md'],
  ['refusal: an unknown domain name fails instead of expanding to nothing',
    sw(['nope']), 1, `${UNKNOWN} nope`, null],
  ['refusal: a "_"-prefixed key is not a domain',
    sw(['_comment']), 1, `${UNKNOWN} _comment`, null],
  ['refusal: permanent_domains must be a list',
    sw('meta'), 1, '[swap:permanent_domains] must be a list', null],
  ['refusal: an explicit null is not "no domains" (Codex, #443)',
    sw(null), 1, '[swap:permanent_domains] must be a list', null],
  ['refusal: a meta record also marked swap: permanent fails (the duplication M-46 removed)',
    at('meta/tool.md', r => { r.swap = 'permanent'; }), 1, `meta/tool.md ${REDUNDANT}`, null],
  ['refusal: a file under a derived DIRECTORY marked swap: permanent fails (Codex, #443)',
    m => { m.paths['metadir/x.md'] = rec('global', 'core', { swap: 'permanent' }); }, 1,
    `metadir/x.md ${REDUNDANT}`, null],
  ['refusal: a marked directory over a derived file fails (Codex, #443)',
    m => { m.paths['meta/'] = rec('global', 'core', { swap: 'permanent' }); }, 1, `meta/ ${REDUNDANT}`, null],
  ['twin: a path that only starts like a derived directory is not under it',
    at('metadir.md', r => { r.swap = 'permanent'; }), 0, OK, REDUNDANT],
  ['refusal: a derived permanent path missing from the tree still fails as permanent',
    null, 1, 'swap:permanent] path missing from tree: meta/tool.md (domain meta)', null, 'meta/tool.md'],
];

function runCase(edit, drop) {
  const tmp = mkdtempSync(join(tmpdir(), 'exports-cases-'));
  try {
    const m = base();
    if (edit) edit(m);
    const files = { ...FILES, 'EXPORTS.json': JSON.stringify(m, null, 2) };
    if (drop) delete files[drop];
    writeTree(tmp, files);
    // The guard enumerates tracked files through `git ls-files`.
    for (const args of [['init', '-q'], ['add', '-A']]) {
      const g = spawnSync('git', args, { cwd: tmp, encoding: 'utf8' });
      if (g.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${g.stderr}`);
    }
    return runNode(CHECK, [], { cwd: tmp });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const failures = [];
for (const [label, edit, expected, must, mustNot, drop] of CASES) {
  const { code, out } = runCase(edit, drop);
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
console.log(`check-exports-cases: OK — ${CASES.length} record and swap-class shapes read correctly.`);
