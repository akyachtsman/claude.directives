import { readFileSync, existsSync } from 'fs';

const CHECKS = JSON.parse(readFileSync('.github/scripts/required-sections.json', 'utf8'));

// Match a real markdown HEADING, never a prose mention. A substring test over the
// whole file passes when the section is deleted but its name survives in a
// cross-reference ("…from its own Session Start"), which is the gate reporting
// health precisely when the required section is gone.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Strip fenced code blocks first (as check-paths.js does): this repo's Markdown
// contains fenced snippets whose lines start with `#`, so a deleted section whose
// name survives inside an example would satisfy a raw heading match.
const stripFences = (content) => content.replace(/^```[\s\S]*?^```/gm, '');
const hasHeading = (content, section) =>
  new RegExp(`^#{1,6}[ \\t]+.*${esc(section)}`, 'm').test(stripFences(content));

let failed = false;

for (const { file, sections } of CHECKS) {
  if (!existsSync(file)) {
    console.error(`MISSING FILE: ${file}`);
    failed = true;
    continue;
  }
  const content = readFileSync(file, 'utf8');
  for (const section of sections) {
    if (!hasHeading(content, section)) {
      console.error(`MISSING SECTION HEADING in ${file}: "${section}"`);
      failed = true;
    } else {
      console.log(`OK: ${file} → "${section}"`);
    }
  }
}

if (failed) process.exit(1);
