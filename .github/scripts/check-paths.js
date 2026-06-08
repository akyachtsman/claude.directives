// Extracts all file paths from backtick references in CLAUDE.md and verifies each exists.
// Paths are matched as: `path/to/file.ext` — must contain a / and a . to qualify.
// Paths starting with . (e.g. .claude/) are per-project files — skipped intentionally.
import { readFileSync, existsSync } from 'fs';

const raw = readFileSync('CLAUDE.md', 'utf8');
// Strip fenced code blocks first so their contents aren't matched as inline-code paths.
const content = raw.replace(/```[\s\S]*?```/g, '');
const matches = [...content.matchAll(/`([^`\n]+\/[^`\n]+\.[^`\n]+)`/g)].map(m => m[1]);
const paths = [...new Set(matches)]
  // Skip per-project runtime files (e.g. .claude/) and URLs (e.g. https://, schema://).
  .filter(p => !p.startsWith('.') && !/^[a-z][a-z0-9+.-]*:\/\//i.test(p));

let failed = false;

for (const p of paths) {
  if (existsSync(p)) {
    console.log(`OK:     ${p}`);
  } else {
    console.error(`MISSING: ${p}`);
    failed = true;
  }
}

if (failed) {
  console.error('\nOne or more paths listed in CLAUDE.md do not exist in the repo.');
  process.exit(1);
}
