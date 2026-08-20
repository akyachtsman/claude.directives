// Asserts the canonical secret-scan regex stays byte-identical everywhere it is
// embedded: the global directive and the qa workflow templates that run it.
// The regex cannot be DRY'd away — a Markdown directive and a YAML `grep` step
// cannot share a literal at runtime — so the "keep identical to ..." comments are
// the contract. This check turns that comment into an enforced invariant: if the
// copies drift, CI fails here instead of silently shipping mismatched scans.
import { readFileSync } from 'fs';

const SOURCES = [
  'directives/global.md',
  'templates/actions/secret-scan/action.yml',
];

// The alternation starts at the first `pat...` token and runs to the closing
// quote delimiter (double quotes in the directive, single quotes in the yml) —
// anchoring on the delimiter rather than on the final alternation token means
// a pattern appended at the end or a reorder can never drift undetected.
// (This comment deliberately names no token literally: the repo now runs the
// actual scan on itself, and a literal prefix here would trip it.)
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

// The regex is only half the contract: two copies can share it and still scan
// DIFFERENT FILE SETS, so a coverage fix (adding *.ts, say) can land in one copy
// and CI stays green while the other keeps its blind spot. Compare the filters
// too. They cannot be compared byte-for-byte across a one-line Markdown command
// and a backslash-continued YAML block, so compare the normalized flag SET.
const FLAG_RE = /--(?:include|exclude-dir)=(?:"[^"\n]*"|[^\s\\]+)/g;
const flagsOf = (text) => {
  const idx = text.search(PATTERN);
  if (idx === -1) return null;
  // Look only at the invocation: from the pattern to the end of the command
  // (the directive ends at a backtick, the action at the redirect/`|| rc=`).
  const tail = text.slice(idx, idx + 800);
  return [...tail.matchAll(FLAG_RE)]
    .map((m) => m[0].replace(/"/g, ''))
    .sort()
    .join(' ');
};

const flags = {};
for (const file of SOURCES) flags[file] = flagsOf(readFileSync(file, 'utf8'));
const flagValues = Object.values(flags);
if (flagValues.some((v) => !v)) {
  console.error('check-secret-scan: FAIL — could not read scan filters from every source');
  process.exit(1);
}
if (!flagValues.every((v) => v === flagValues[0])) {
  console.error('check-secret-scan: FAIL — secret-scan FILE FILTERS have diverged (same regex, different coverage):');
  for (const [file, value] of Object.entries(flags)) console.error(`  ${file}: ${value}`);
  process.exit(1);
}

console.log(`check-secret-scan: OK — pattern and file filters identical across ${values.length} sources`);
console.log(`  filters: ${flagValues[0]}`);
