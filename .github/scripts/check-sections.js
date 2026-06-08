import { readFileSync, existsSync } from 'fs';

const CHECKS = JSON.parse(readFileSync('.github/scripts/required-sections.json', 'utf8'));

let failed = false;

for (const { file, sections } of CHECKS) {
  if (!existsSync(file)) {
    console.error(`MISSING FILE: ${file}`);
    failed = true;
    continue;
  }
  const content = readFileSync(file, 'utf8');
  for (const section of sections) {
    if (!content.includes(section)) {
      console.error(`MISSING SECTION in ${file}: "${section}"`);
      failed = true;
    } else {
      console.log(`OK: ${file} → "${section}"`);
    }
  }
}

if (failed) process.exit(1);
