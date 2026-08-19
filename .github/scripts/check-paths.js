// Extracts all file paths from backtick references in CLAUDE.md and verifies each exists.
// Paths are matched as: `path/to/file.ext` — must contain a / and a . to qualify.
// Dot-paths (.claude/, .github/) ARE validated here: this script runs only in
// claude.directives CI, where those files are committed. (Downstream projects,
// where dot-paths may not exist until bootstrap, do not run this script.)
import { readFileSync, existsSync, readdirSync } from 'fs';
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
const REF_ROOTS = [
  'templates', '.github/workflows', 'plugins/directives-toolkit/commands',
];
const REF_FILES = [
  'MAINTAIN-REPO-USER-INSTRUCTIONS.md', 'NEW-REPO-USER-INSTRUCTIONS.md',
];

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(ya?ml|md|sh)$/.test(e.name)) out.push(full);
  }
  return out;
}

const refFiles = [...REF_ROOTS.flatMap(walk), ...REF_FILES.filter(f => existsSync(f))];
const refs = new Map(); // path -> Set(files citing it)

for (const f of refFiles) {
  for (const m of readFileSync(f, 'utf8').matchAll(/docs\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.md/g)) {
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
