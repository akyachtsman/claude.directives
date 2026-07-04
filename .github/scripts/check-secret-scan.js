// Asserts the canonical secret-scan regex stays byte-identical everywhere it is
// embedded: the global directive and the qa workflow templates that run it.
// The regex cannot be DRY'd away — a Markdown directive and a YAML `grep` step
// cannot share a literal at runtime — so the "keep identical to ..." comments are
// the contract. This check turns that comment into an enforced invariant: if the
// copies drift, CI fails here instead of silently shipping mismatched scans.
import { readFileSync } from 'fs';

const SOURCES = [
  'directives/global.md',
  'templates/workflows/qa.yml',
  'templates/workflows/qa-response.yml',
];

// The alternation starts at the first `pat...` token and runs to the closing
// quote delimiter (double quotes in the directive, single quotes in the yml) —
// anchoring on the delimiter, not on a token like `xoxb-`, means a pattern
// appended at the end or a reorder can never drift undetected.
// `\\\.` matches a literal backslash-dot; the body holds no quotes or newlines.
const PATTERN = /pat\[A-Za-z0-9\]\{14\}\\\.[^\n'"`]*/;

const found = {};
let failed = false;

for (const file of SOURCES) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    console.error(`MISSING FILE: ${file}`);
    failed = true;
    continue;
  }
  const match = text.match(PATTERN);
  if (!match) {
    console.error(`NO SECRET-SCAN PATTERN: ${file}`);
    failed = true;
    continue;
  }
  found[file] = match[0];
  console.log(`  ${file}`);
}

if (failed) {
  console.error('check-secret-scan: FAIL — missing file or pattern');
  process.exit(1);
}

const values = Object.values(found);
if (!values.every((v) => v === values[0])) {
  console.error('check-secret-scan: FAIL — secret-scan pattern has diverged across sources:');
  for (const [file, value] of Object.entries(found)) console.error(`  ${file}: ${value}`);
  process.exit(1);
}

console.log(`check-secret-scan: OK — pattern identical across ${values.length} sources`);
