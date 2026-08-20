// learnings.jsonl is append-only project memory read at session start and by
// /diagnose. Nothing validated it, so entries drifted to types the /learn command
// does not declare — a reader filtering by type silently misses them.
import { readFileSync } from 'fs';

const TYPES = new Set(['pattern', 'pitfall', 'preference', 'architecture', 'tool']);
const REQUIRED = ['ts', 'type', 'key', 'text', 'confidence', 'files'];

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
  // `files` is part of every entry /learn declares, and the /diagnose pipeline
  // greps it for file attribution — but it was absent from REQUIRED, so an entry
  // omitting it (or setting it to null) was certified well-formed. An empty array
  // stays legal: that is how a file-independent lesson is written.
  if ('files' in d && !(Array.isArray(d.files) && d.files.every((f) => typeof f === 'string' && f.trim()))) {
    fail(`line ${n}: "files" must be an array of non-empty path strings (use [] when the lesson concerns none), got ${JSON.stringify(d.files)}`);
  }
  // Validate the FORMAT, not just that JS can read it: Date.parse accepts many
  // implementation-dependent forms ("2026", "August 20, 2026") whose meaning can
  // differ between consumers, while /learn declares ISO-8601.
  if (typeof d.ts === 'string' && d.ts.trim()) {
    const ts = d.ts.trim();
    const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
    const m = ISO.exec(ts);
    if (!m) {
      fail(`line ${n}: ts "${d.ts}" is not ISO-8601 (expected YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)`);
    } else {
      // Date.parse is not a calendar check: it NORMALIZES, so 2026-02-30 becomes
      // 2026-03-02 and returns a valid timestamp. Round-trip the Y/M/D components
      // instead — if the date the parser produced differs from the one written,
      // the written one does not exist.
      const [, y, mo, day] = m;
      const utc = new Date(`${y}-${mo}-${day}T00:00:00Z`);
      const roundTrips = !Number.isNaN(utc.getTime())
        && utc.getUTCFullYear() === Number(y)
        && utc.getUTCMonth() + 1 === Number(mo)
        && utc.getUTCDate() === Number(day);
      if (!roundTrips) fail(`line ${n}: ts "${d.ts}" is ISO-shaped but not a real calendar date`);
      else if (Number.isNaN(Date.parse(ts))) fail(`line ${n}: ts "${d.ts}" is not a parseable date`);
    }
  }
  if (d.key) keys.set(d.key, (keys.get(d.key) ?? 0) + 1);
});

// Duplicate keys are LEGAL — latest-key-wins is the documented rule — so this
// reports them rather than failing, since a same-day duplicate is usually a typo.
for (const [k, n] of keys) if (n > 1) console.log(`note: key "${k}" appears ${n}x (latest wins)`);

if (failed) { console.error('check-learnings: FAIL'); process.exit(1); }
console.log(`check-learnings: OK — ${lines.length} entries, all well-formed`);
