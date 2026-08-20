// learnings.jsonl is append-only project memory read at session start and by
// /diagnose. Nothing validated it, so entries drifted to types the /learn command
// does not declare — a reader filtering by type silently misses them.
import { readFileSync } from 'fs';

const TYPES = new Set(['pattern', 'pitfall', 'preference', 'architecture', 'tool']);
const REQUIRED = ['ts', 'type', 'key', 'text', 'confidence'];

let failed = false;
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true; };

const lines = readFileSync('learnings.jsonl', 'utf8').split('\n').filter((l) => l.trim());
const keys = new Map();

lines.forEach((line, i) => {
  const n = i + 1;
  let d;
  try {
    d = JSON.parse(line);
  } catch (e) {
    return fail(`line ${n}: not valid JSON — ${e.message}`);
  }
  for (const k of REQUIRED) if (!(k in d)) fail(`line ${n}: missing required field "${k}"`);
  if (d.type && !TYPES.has(d.type)) {
    fail(`line ${n}: type "${d.type}" is not one of ${[...TYPES].join(' | ')} (see commands/learn.md)`);
  }
  if (typeof d.confidence === 'number' && (d.confidence < 1 || d.confidence > 10)) {
    fail(`line ${n}: confidence ${d.confidence} outside 1-10`);
  }
  if (d.ts && Number.isNaN(Date.parse(d.ts))) fail(`line ${n}: ts "${d.ts}" is not a valid date`);
  if (d.key) keys.set(d.key, (keys.get(d.key) ?? 0) + 1);
});

// Duplicate keys are LEGAL — latest-key-wins is the documented rule — so this
// reports them rather than failing, since a same-day duplicate is usually a typo.
for (const [k, n] of keys) if (n > 1) console.log(`note: key "${k}" appears ${n}x (latest wins)`);

if (failed) { console.error('check-learnings: FAIL'); process.exit(1); }
console.log(`check-learnings: OK — ${lines.length} entries, all well-formed`);
