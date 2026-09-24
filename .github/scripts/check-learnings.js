// learnings.jsonl is append-only project memory read at session start and by
// /diagnose. Nothing validated it, so entries drifted to types the /learn command
// does not declare — a reader filtering by type silently misses them.
//
// FILES (#370). Every path in a key's LATEST entry's `files` must exist in the
// tree (superseded lines are inert under latest-key-wins, #377), and such an
// entry whose text names `workflow_run` must have each listed workflow file
// (under a `workflows/` dir) still CONTAIN the literal text `workflow_run`.
// Deliberately that narrow: its input space is closed (a path exists or not; a
// substring is present or not).
//
// COMPLETENESS (#370) is by INVERTED OWNERSHIP, not derivation. For each rule in
// COMPLETE below, every workflow file (in the named dirs) whose text CONTAINS the
// substring must be either listed by that key's latest entry or exempted here
// with a reason. So adding a watcher turns this red until someone DECIDES —
// the same shape as workflow-ref-guard.py's REQUIRED list, which gets louder
// when something breaks. The input stays closed: a directory listing and a
// substring. It does NOT decide whether a file watches `completed` — that
// judgement is the human's, recorded as the listing or the exemption reason.
// A stale exemption (file gone, or no longer containing the text) also fails.
// The substring does not prove a file WATCHES workflow_run either — a comment
// instructing the reader to add one counts as listed-worthy, which is intended
// (pages-monitor.yml; #370's comment: the prescribed edit site is where the
// lesson applies), and a comment that merely mentions it is what an exemption
// records. What stays out of scope: a watcher whose YAML spells the key without
// the literal substring (an escape sequence), which is not an honest form.
// Do NOT grow this into parsing YAML or
// deriving the list from the tree: that design was withdrawn after 27 rounds on
// #368 because the accepted YAML forms never converged (#370).
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { posix } from 'path';

const TYPES = new Set(['pattern', 'pitfall', 'preference', 'architecture', 'tool']);
const REQUIRED = ['ts', 'type', 'key', 'text', 'confidence', 'files'];

// Inverted-ownership completeness rules (#370) — see the header. An exemption
// is a decision that the file names the text without being a watcher of the kind
// the entry is about; the reason is part of the record.
const COMPLETE = [{
  key: 'a-terminal-state-watcher-cannot-see-a-hang',
  dirs: ['.github/workflows', 'templates/workflows'],
  text: 'workflow_run',
  exempt: {
    '.github/workflows/watcher-liveness.yml': 'triggers on schedule/workflow_dispatch; it READS workflow_run run history via the API and watches nothing',
    'templates/workflows/qa.yml': 'triggers on pull_request/push; names workflow_run only in a comment about the ref guard',
  },
}];

let failed = false;
const fail = (m) => { console.error(`FAIL: ${m}`); failed = true; };

const lines = readFileSync('learnings.jsonl', 'utf8').split('\n').filter((l) => l.trim());
const keys = new Map();
const latest = new Map(); // key -> { n, files, text } of its LAST line (file order = append order)

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
  } else if (Array.isArray(d.files) && typeof d.key === 'string' && d.key.trim()) {
    // Liveness is checked AFTER the loop, on each key's LATEST entry only: a
    // superseded line is inert under latest-key-wins, and /learn's way to fix a
    // stale path is to APPEND a corrected entry — checking the old line too would
    // leave that correction unable to turn CI green (#377).
    latest.set(d.key, { n, files: d.files, text: d.text });
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

// A stale path is how a hand-kept list rots silently: /diagnose routes on it and
// simply never matches. Repo-relative only, so "exists" means IN THE TREE.
for (const { n, files, text } of latest.values()) {
  const wr = typeof text === 'string' && text.includes('workflow_run');
  for (const f of files) {
    if (f.startsWith('/') || f.split('/').includes('..')) {
      fail(`line ${n}: files entry "${f}" must be a repo-relative path inside the tree`);
    } else if (!existsSync(f)) {
      fail(`line ${n}: files entry "${f}" does not exist in the tree (renamed or removed?)`);
    } else if (wr && /(^|\/)workflows\//.test(f) && statSync(f).isFile()
        && !readFileSync(f, 'utf8').includes('workflow_run')) {
      fail(`line ${n}: entry names workflow_run but listed workflow "${f}" no longer contains the text "workflow_run"`);
    }
  }
}

for (const c of COMPLETE) {
  const e = latest.get(c.key);
  if (!e) {
    fail(`completeness rule names key "${c.key}", which has no valid latest entry — the rule would silently stop applying (#370)`);
    continue;
  }
  // Normalised, so `./templates/workflows/qa.yml` and `templates/workflows/qa.yml`
  // are the same file on both sides of every comparison below (#383).
  const listed = new Set(e.files.map((f) => posix.normalize(f)));
  for (const dir of c.dirs) {
    let names;
    try { names = readdirSync(dir); } catch (err) { fail(`completeness: cannot read ${dir} — ${err.message}`); continue; }
    for (const name of names.filter((x) => /\.ya?ml$/.test(x)).sort()) {
      const f = `${dir}/${name}`;
      if (!statSync(f).isFile() || !readFileSync(f, 'utf8').includes(c.text)) continue;
      if (!listed.has(f) && !Object.hasOwn(c.exempt, f)) {
        fail(`line ${e.n}: ${f} contains "${c.text}" but entry "${c.key}" does not list it — append a corrected entry listing it (/learn), or exempt it in check-learnings.js COMPLETE with the reason it is not such a watcher (#370)`);
      }
    }
  }
  for (const [f, why] of Object.entries(c.exempt)) {
    // The reason IS the decision record; an empty one is an unrecorded decision.
    if (!(typeof why === 'string' && why.trim())) {
      fail(`completeness exemption "${f}" has no reason — an exemption must say why the file is not such a watcher (#370)`);
    }
    if (posix.normalize(f) !== f) {
      fail(`completeness exemption "${f}" is not in normal form — write it as "${posix.normalize(f)}" (#383)`);
    }
    if (!existsSync(f) || !statSync(f).isFile() || !readFileSync(f, 'utf8').includes(c.text)) {
      fail(`completeness exemption "${f}" is stale — the file is gone or no longer contains "${c.text}"; remove the exemption (#370)`);
    } else if (listed.has(f)) {
      fail(`"${f}" is both listed by "${c.key}" and exempted — pick one (#370)`);
    }
  }
}

// Duplicate keys are LEGAL — latest-key-wins is the documented rule — so this
// reports them rather than failing, since a same-day duplicate is usually a typo.
for (const [k, n] of keys) if (n > 1) console.log(`note: key "${k}" appears ${n}x (latest wins)`);

if (failed) { console.error('check-learnings: FAIL'); process.exit(1); }
console.log(`check-learnings: OK — ${lines.length} entries, all well-formed; every listed file of each key's latest entry exists (workflow_run entries: each listed workflow still contains the text). completeness by inverted ownership: every workflow naming workflow_run is listed or exempted with a reason (#370)`);
