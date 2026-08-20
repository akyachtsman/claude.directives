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
  // Presence is not a value. `{"ts":null,"key":"","text":null}` satisfied every
  // check below (the truthy `d.ts &&` guard skipped date parsing) and reported
  // well-formed — and a keyless entry cannot take part in latest-key-wins at all.
  for (const k of ['key', 'text']) {
    if (k in d && !(typeof d[k] === 'string' && d[k].trim())) {
      fail(`line ${n}: "${k}" must be a non-empty string, got ${JSON.stringify(d[k])}`);
    }
  }
  if ('ts' in d && !(typeof d.ts === 'string' && d.ts.trim())) {
    fail(`line ${n}: "ts" must be an ISO-8601 string, got ${JSON.stringify(d.ts)}`);
  }
  // Test a PRESENT type directly. `d.type && ...` lets null and "" skip the enum
  // check entirely, so the entry is reported well-formed while consumers filtering
  // by type silently miss it — the drift this gate exists to prevent.
  if ('type' in d && !TYPES.has(d.type)) {
    fail(`line ${n}: type ${JSON.stringify(d.type)} is not one of ${[...TYPES].join(' | ')} (see commands/learn.md)`);
  }
  // Guard the TYPE first: `typeof x === 'number' && out-of-range` passes a string
  // "high" straight through, so the gate certified an entry whose numeric contract
  // consumers rely on was never numeric.
  if ('confidence' in d && !(typeof d.confidence === 'number' && Number.isFinite(d.confidence)
      && d.confidence >= 1 && d.confidence <= 10)) {
    fail(`line ${n}: confidence ${JSON.stringify(d.confidence)} must be a number 1-10`);
  }
  if (typeof d.ts === 'string' && d.ts.trim() && Number.isNaN(Date.parse(d.ts))) {
    fail(`line ${n}: ts "${d.ts}" is not a valid date`);
  }
  if (d.key) keys.set(d.key, (keys.get(d.key) ?? 0) + 1);
});

// Duplicate keys are LEGAL — latest-key-wins is the documented rule — so this
// reports them rather than failing, since a same-day duplicate is usually a typo.
for (const [k, n] of keys) if (n > 1) console.log(`note: key "${k}" appears ${n}x (latest wins)`);

if (failed) { console.error('check-learnings: FAIL'); process.exit(1); }
console.log(`check-learnings: OK — ${lines.length} entries, all well-formed`);
