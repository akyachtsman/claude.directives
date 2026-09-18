// learnings.jsonl is append-only project memory read at session start and by
// /diagnose. Nothing validated it, so entries drifted to types the /learn command
// does not declare — a reader filtering by type silently misses them.
import { readdirSync, readFileSync } from 'fs';

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

// ── Derived recall inventories ────────────────────────────────────────────
// An entry whose lesson applies to EVERY file with some property carries that
// file list by hand, and a hand-carried list goes stale silently: adding or
// renaming a watcher leaves the entry correct-looking and the new file
// unrouted, while this checker reports OK because it only validates shapes.
// #368 needed FOUR successive routing corrections to one such list before the
// derivation was written down, and even then it lived in a scratch script that
// nothing re-runs — the fail-open of #323, one level out.
//
// So the property is the source of truth and the list is compared against it.
// Add a row here when an entry's `files` is defined by a predicate rather than
// by judgement.
const DERIVED = [{
  key: 'a-terminal-state-watcher-cannot-see-a-hang',
  what: 'workflows using a terminal-state workflow_run trigger',
  // The canonical watcher set is automations.md -> Watcher Rules; this reads
  // the tree rather than restating it, so a new watcher is caught on arrival.
  match: terminalStateWatcher,
  roots: ['.github/workflows', 'templates/workflows'],
}];

// Reads the `types:` of a `workflow_run:` trigger. The first version of this
// matched the literal string `types: [completed]`, which MISSED `types: [
// completed ]` and the block-sequence form - two spellings of the same trigger,
// both of them real watchers, both silently excluded while the guard printed OK.
// That is the fail-open this guard exists to prevent, inside the guard.
//
// So it recognises both forms AND REFUSES on a third: a `workflow_run:` block
// carrying a `types:` this cannot parse throws rather than returning false,
// because "I did not recognise it" and "it does not match" must not be the same
// answer. There is no YAML parser in this checker's dependencies; a refusal is
// what keeps the gap visible until there is one.
function terminalStateWatcher(file, rawBody) {
  if (!/\.ya?ml$/.test(file)) return false;
  // Strip comments FIRST. pages-monitor.yml carries a commented-out
  // `workflow_run:` / `types: [completed]` snippet showing what a downstream
  // project should ADD - it has no such trigger itself (its triggers are
  // page_build and workflow_dispatch). Matching the raw body put it, and its
  // template twin, into the derived set as FALSE POSITIVES, and I asserted the
  // entry equal to that set for two rounds. An assertion against a wrong
  // predicate is indistinguishable from an assertion against a right one.
  const body = rawBody.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '$1')).join('\n');
  const wr = body.indexOf('workflow_run:');
  if (wr === -1) return false;
  const after = body.slice(wr);
  const types = after.match(/^(\s*)types:(.*)$/m);
  if (!types) return false;                      // no types: => all activity types
  const [, , inline] = types;
  const flow = inline.match(/^\s*\[([^\]]*)\]\s*$/);
  if (flow) return flow[1].split(',').map((t) => t.trim().replace(/['"]/g, '')).includes('completed');
  if (inline.trim() === '') {
    // block sequence: the lines under `types:` that are deeper-indented items
    const rest = after.slice(after.indexOf(types[0]) + types[0].length).split('\n');
    const items = [];
    for (const line of rest) {
      if (!line.trim()) continue;
      const item = line.match(/^\s+-\s*(.+?)\s*$/);
      if (!item) break;
      items.push(item[1].replace(/['"]/g, ''));
    }
    if (items.length) return items.includes('completed');
  }
  throw new Error(`${file}: workflow_run types: is in a form this guard cannot read `
    + `(${JSON.stringify(types[0].trim())}). Teach terminalStateWatcher that form `
    + `rather than letting it read as "no match".`);
}

for (const rule of DERIVED) {
  // `lines` holds raw JSONL strings; malformed ones already failed above, so
  // parse leniently here and skip what will not read.
  const parsed = lines.map((l, i) => { try { return [i, JSON.parse(l)]; } catch { return null; } })
    .filter(Boolean);
  const entries = parsed.filter(([, d]) => d && d.key === rule.key);
  if (!entries.length) continue;           // entry retired: nothing to guard
  const expected = rule.roots.flatMap((dir) => {
    let names = [];
    try { names = readdirSync(dir); } catch { return []; }
    return names
      .map((n) => `${dir}/${n}`)
      .filter((p) => {
        let body;
        try { body = readFileSync(p, 'utf8'); } catch { return false; }   // unreadable: not ours
        return rule.match(p, body);                                       // a REFUSAL propagates
      });
  }).sort();
  // Only the paths the predicate could ever produce are governed; an entry may
  // also list prose files, and those are judgement, not derivation.
  const governed = new Set(expected);
  const universe = rule.roots;
  for (const [i, d] of entries) {
    const listed = (d.files ?? [])
      .filter((f) => universe.some((d) => f.startsWith(`${d}/`)))
      .sort();
    const missing = expected.filter((f) => !listed.includes(f));
    const extra = listed.filter((f) => !governed.has(f));
    if (missing.length || extra.length) {
      fail(`line ${i + 1}: "${rule.key}" must list exactly the ${rule.what} `
        + `(${expected.length} found)`
        + (missing.length ? `\n  missing: ${missing.join(', ')}` : '')
        + (extra.length ? `\n  not matching: ${extra.join(', ')}` : ''));
    }
  }
}

// Duplicate keys are LEGAL — latest-key-wins is the documented rule — so this
// reports them rather than failing, since a same-day duplicate is usually a typo.
for (const [k, n] of keys) if (n > 1) console.log(`note: key "${k}" appears ${n}x (latest wins)`);

if (failed) { console.error('check-learnings: FAIL'); process.exit(1); }
console.log(`check-learnings: OK — ${lines.length} entries, all well-formed`);
