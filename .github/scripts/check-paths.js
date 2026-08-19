// Extracts all file paths from backtick references in CLAUDE.md and verifies each exists.
// Paths are matched as: `path/to/file.ext` — must contain a / and a . to qualify.
// Dot-paths (.claude/, .github/) ARE validated here: this script runs only in
// claude.directives CI, where those files are committed. (Downstream projects,
// where dot-paths may not exist until bootstrap, do not run this script.)
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const raw = readFileSync('CLAUDE.md', 'utf8');
// Strip fenced code blocks first so their contents aren't matched as inline-code paths.
const content = raw.replace(/```[\s\S]*?```/g, '');
const matches = [...content.matchAll(/`([^`\n]+\/[^`\n]+\.[^`\n]+)`/g)].map(m => m[1]);
const paths = [...new Set(matches)]
  // Skip URLs (e.g. https://, schema://).
  .filter(p => !/^[a-z][a-z0-9+.-]*:\/\//i.test(p));

let failed = false;

for (const p of paths) {
  if (existsSync(p)) {
    console.log(`OK:     ${p}`);
  } else {
    console.error(`MISSING: ${p}`);
    failed = true;
  }
}

// --- Second pass: doc references inside SHIPPED files ------------------------
// A template that tells a maintainer to read a document is an instruction, and
// an instruction pointing at a missing file is worse than no instruction. These
// references live in YAML comments and command prose rather than markdown
// links, so check-links.js never sees them -- a real miss on 2026-08-19, where
// a template cited docs/guides/cicd-setup.md and the guide is under
// docs/standards/. Canonicalisation makes this load-bearing: every rule now
// states its reasoning once and the other sites POINT at it, so a rotted
// pointer silently costs a reader the reasoning entirely.
// DERIVE the surface from EXPORTS.json rather than hand-listing it. A list of
// what to scan rots the moment the exported set changes -- the same failure this
// repo removed from /refresh-repo on 2026-08-19, and one this check had already
// reproduced twice: it silently skipped directives/ and the plugin's agents and
// skills while claiming to cover shipped files. check-exports.js already
// validates every path named here exists, so the two checks cannot disagree.
const EXPORTED = Object.values(
  JSON.parse(readFileSync('EXPORTS.json', 'utf8')).categories,
).flatMap((c) => c.paths || []);

// Plus two surfaces EXPORTS.json deliberately omits: this repo's own paired
// workflow copies (live files, not exports) and the maintainer runbook
// (internal-only by design). Both cite docs and both can rot.
const EXTRA = ['.github/workflows', 'MAINTAIN-REPO-USER-INSTRUCTIONS.md'];

// Never descend into installed or generated trees. templates/ui-tests carries a
// package.json, so a developer who has run the suite locally has a node_modules
// under it -- and vendored docs cite their own paths, which this check would
// then read as repo-owned and fail on. Reported with a reproduction:
// templates/ui-tests/node_modules/safer-buffer/Porting-Buffer.md cites a
// docs/rules/*.md that does not exist here. A check that breaks after a normal
// local install is a check people learn to skip.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage',
  'playwright-report', 'test-results', '.next', '.venv']);

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(ya?ml|md|sh|[cm]?js)$/.test(e.name)) out.push(full);
  }
  return out;
}

const refFiles = [...new Set([...EXPORTED, ...EXTRA].flatMap((entry) => {
  const p = entry.replace(/\/$/, '');
  if (!existsSync(p)) return [];
  return statSync(p).isDirectory() ? walk(p) : [p];
}))];
const refs = new Map(); // path -> Set(files citing it)

for (const f of refFiles) {
  for (const m of readFileSync(f, 'utf8').matchAll(/docs\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md/g)) {
    if (!refs.has(m[0])) refs.set(m[0], new Set());
    refs.get(m[0]).add(f);
  }
}

for (const [ref, citedBy] of [...refs].sort()) {
  if (existsSync(ref)) {
    console.log(`OK:     ${ref}  (${citedBy.size} citation${citedBy.size === 1 ? '' : 's'})`);
  } else {
    console.error(`MISSING: ${ref}  cited by: ${[...citedBy].join(', ')}`);
    failed = true;
  }
}

if (failed) {
  console.error('\nOne or more referenced paths do not exist in the repo.');
  process.exit(1);
}
