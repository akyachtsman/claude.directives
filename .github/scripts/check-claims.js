import { readFileSync, existsSync } from 'fs';
import { resolve, relative } from 'path';
import { execFileSync } from 'child_process';

// CANONICAL-PHRASE GUARD (#300). Fails when a claim listed in claims.json stops
// being stated by a file that is required to state it.
//
// WHY IT EXISTS. Of PR #294's thirty-nine review rounds, most were not wrong
// claims — they were CORRECT claims that failed to reach a consumer. The same
// fact was fixed in one file and left stale, narrowed, or absent in six to nine
// others; round 35 found "check the PR's comments" in nine files while the
// source said "comments AND review threads". This repo's established answer to
// that class is a checker, not vigilance (check-exports, check-landing-cards,
// check-secret-scan, the paired-file diffs all exist for the same reason).
//
// ⚠️ WHAT THIS GUARD PROVABLY CANNOT CATCH — read before trusting a green run.
// A consistency check confirms a claim TRAVELLED. It never asks whether the
// claim is TRUE, and it cannot see a fix that says MORE than intended. #294
// surfaced eight ways a correction fails to land; this catches five:
//   ✅ copies of a claim (rounds 24, 30)      ✅ scope narrowing (round 35) — its best case
//   ⚠️ withdrawal/restoration consequences (21, 33) — only if the manifest is updated
//   ❌ regeneration from memory (34) — the file did not exist when the manifest was written
//   ❌ THE SOURCE IS WRONG (36) — round 36's defect was stated identically and
//      correctly-quoted in four files; this guard reports green while the gate
//      authorises merging over live findings
//   ❌ THE FIX OVER-REACHES (38, 39) — both were caused by a fix whose wording
//      was fine and whose SCOPE silently closed a documented exit
// So: a green check-claims does NOT mean the directives are correct. It means
// nobody dropped a pinned sentence. Anything citing this guard must say so too.
//
// MATCHING. Two normalisations, both earned by measurement, applied before any
// pattern is tested:
//   1. Whitespace collapsed across the WHOLE file. Round 30 of #294 wasted a
//      cycle because `grep -c "inline review-thread reply"` reported 0 for three
//      files that contained it — the phrase wrapped across lines. A line-oriented
//      match produces false failures on correct files, which is worse than no guard.
//   2. Markdown emphasis markers (* _ `) stripped. Measured while building the
//      first manifest: the same claim appears as `comments AND the review threads`
//      in one file and `comments **and its review threads**` in another. A literal
//      match would have declared the second file non-compliant.
// Entries therefore carry a `pattern` (a JS regex source, matched case-insensitively)
// rather than a fixed string, so one entry spans the wording variants a claim
// legitimately has. A `phrase` key is also accepted and is matched literally after
// the same normalisation, for claims whose wording is fixed.

const MANIFEST = '.github/scripts/claims.json';
const claims = JSON.parse(readFileSync(MANIFEST, 'utf8')).claims;

// An empty or non-array manifest checks NOTHING and would otherwise report
// "OK — 0 claim(s)". That is the fully vacuous pass every hygiene rule below
// exists to prevent, and a botched conflict resolution reaches it in one edit.
if (!Array.isArray(claims) || claims.length === 0) {
  console.error(`FAIL: ${MANIFEST} declares no claims — an empty manifest verifies nothing while reporting success.`);
  console.error('check-claims: FAIL');
  process.exit(1);
}

const normalize = (s) => s
  // LINE-LEADING COMMENT MARKERS FIRST. A claim that wraps across lines inside
  // a #-commented carrier collapses to "comments AND its # review threads",
  // which no pattern for the claim can match. Measured on
  // .github/workflows/codex-monitor.yml, which states the verdict-lookup claim
  // verbatim at lines 30-32 and was still absent from this guard's first
  // manifest BECAUSE the scan that built that manifest could not see it. The
  // round-30 lesson (never match line-oriented) is incomplete without this:
  // collapsing whitespace re-introduces the very markers it was meant to skip.
  .replace(/^[ \t]*(?:#+|\/\/|--)[ \t]?/gm, '')
  .replace(/[*_`]/g, '')
  .replace(/\s+/g, ' ');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let failed = false;
const fail = (msg) => { console.error(`FAIL: ${msg}`); failed = true; };

// --derive: report every tracked file that ALREADY states each claim, marking
// the ones the manifest does not list. Advisory, not a CI gate — a file may
// mention a phrase without being a file that MUST keep stating it, and only a
// human can tell those apart.
//
// It exists because of how this manifest's first two rounds went wrong. The
// consumer lists were built by a throwaway scan whose normalizer did not strip
// line-leading comment markers, so it was blind to every .yml/.sh carrier with
// a wrapped claim. Round 1 fixed the normalizer in THIS file and did not
// re-derive the lists, so the manifest stayed under-covered and review found
// the carriers one at a time. Deriving THROUGH the same normalizer the guard
// uses is the only version that cannot drift from it: there is one definition
// of "states this claim", and both the check and the derivation read it.
const DERIVE = process.argv.includes('--derive');
// EVERY tracked file, minus binaries detected BY CONTENT. An extension
// allowlist here would recreate the exact blindness --derive exists to end:
// this repo carries claims in .py guards, .json manifests, .html and
// extensionless files, and a scan that cannot read them reports full coverage
// over a subset. Binary detection is a NUL byte in the first 8KB — the same
// heuristic git itself uses — so a new text format needs no allowlist edit.
const trackedTextFiles = () => execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter((f) => !f.includes('node_modules/') && f !== MANIFEST)
  .filter((f) => {
    try {
      const head = readFileSync(f).subarray(0, 8192);
      return !head.includes(0);
    } catch { return false; }
  });

const seenIds = new Set();

for (const claim of claims) {
  const { id, why, source, consumers, pattern, phrase } = claim;

  // Manifest hygiene FIRST. A malformed entry must fail loudly rather than
  // silently checking nothing — a vacuous pass is the failure mode every
  // earlier version of this class of guard died from.
  if (!id) { fail(`manifest entry with no id: ${JSON.stringify(claim).slice(0, 120)}`); continue; }
  if (seenIds.has(id)) fail(`duplicate claim id: ${id}`);
  seenIds.add(id);
  if (!why) fail(`${id}: no "why" — an entry nobody can interpret cannot be maintained`);
  if (!source) fail(`${id}: no "source"`);
  // A consumer is either a path, or { file, pattern, why } when that carrier
  // needs a STRICTER match than the claim's own. wait-gate.sh is why: the
  // claim-level pattern matched its explanatory header comment, so deleting
  // the instruction from the message the hook actually DELIVERS left the guard
  // green on the highest-authority copy of the rule. A carrier whose file
  // states a rule twice — once as prose, once as the thing users receive —
  // needs the delivered form pinned, not the prose.
  const consumerList = (Array.isArray(consumers) ? consumers : [])
    .map((c) => (typeof c === 'string' ? { file: c } : c));

  // Compare NORMALIZED paths: './directives/git.md' and
  // 'directives/../directives/git.md' name the same file, and raw-string
  // comparison lets either alias its way past both the source check and the
  // duplicate check — restoring the vacuous pass those rules exist to stop.
  const norm = (f) => relative('.', resolve(f)) || f;
  const consumerFiles = consumerList.map((c) => norm(c.file));
  const sourceNorm = norm(source);
  for (const f of consumerFiles) {
    // Both of these produce a non-empty consumer list that verifies nothing
    // beyond what the source check already did — a vacuous pass wearing the
    // shape of coverage.
    if (f === sourceNorm) fail(`${id}: consumer is the source itself (${f}) — that verifies nothing the source check does not`);
  }
  const dupes = consumerFiles.filter((f, i) => consumerFiles.indexOf(f) !== i);
  if (dupes.length) fail(`${id}: duplicate consumer path(s): ${[...new Set(dupes)].join(', ')}`);

  if (consumerList.length === 0 && !claim.sourceOnly) {
    // A claim can legitimately live in ONE file today and still be worth
    // pinning — the git.md split (#299) is exactly the event that would drop
    // it. But an ACCIDENTALLY empty consumer list looks identical, so the
    // single-file case must be declared, not inferred.
    fail(`${id}: no consumers — an entry that checks nothing passes vacuously. If the claim genuinely lives only in its source today, set "sourceOnly": true and say so in "why".`);
    continue;
  }
  if (!pattern && !phrase) { fail(`${id}: needs "pattern" or "phrase"`); continue; }
  if (pattern && phrase) { fail(`${id}: has both "pattern" and "phrase" — pick one`); continue; }

  let re;
  try {
    re = new RegExp(pattern ?? esc(normalize(phrase)), 'i');
  } catch (err) {
    fail(`${id}: invalid pattern — ${err.message}`);
    continue;
  }
  // A pattern that matches the empty string matches every file, so every
  // consumer would pass no matter what it says.
  if (re.test('')) { fail(`${id}: pattern matches the empty string — it would certify anything`); continue; }

  // The SOURCE must state the claim too. A claim whose source has lost it is
  // worse than one a consumer dropped: every consumer is then quoting a rule
  // that no longer exists where the rule is supposed to live. This is the case
  // the git.md split (#299) makes reachable, which is why that split waits on
  // this guard.
  const targets = [{ file: source, role: 'source' },
                   ...consumerList.map((c) => ({ file: c.file, role: 'consumer', override: c.pattern }))];

  for (const { file, role, override } of targets) {
    if (!existsSync(file)) { fail(`${id}: ${role} file does not exist: ${file}`); continue; }
    let useRe = re;
    if (override !== undefined) {
      // A stricter override that does not actually constrain anything is worse
      // than none: an empty string falls back to the claim-level pattern (so
      // the loose match this override existed to replace silently returns),
      // and an empty-matching one certifies any file at all.
      if (typeof override !== 'string' || override === '') {
        fail(`${id}: per-consumer pattern for ${file} is empty — an override that does not constrain anything silently restores the claim-level match it was added to replace`);
        continue;
      }
      try { useRe = new RegExp(override, 'i'); }
      catch (err) { fail(`${id}: invalid per-consumer pattern for ${file} — ${err.message}`); continue; }
      if (useRe.test('')) {
        fail(`${id}: per-consumer pattern for ${file} matches the empty string — it would certify anything`);
        continue;
      }
    }
    if (useRe.test(normalize(readFileSync(file, 'utf8')))) {
      console.log(`OK:   ${id} → ${file}${override ? ' (strict)' : ''}`);
    } else {
      fail(`${id}: ${role} no longer states the claim: ${file}\n      pattern: ${useRe.source}\n      why:     ${why}`);
    }
  }

  if (DERIVE) {
    const listed = new Set([source, ...consumerFiles]);
    const alsoStates = trackedTextFiles()
      .filter((f) => !listed.has(f))
      .filter((f) => { try { return re.test(normalize(readFileSync(f, 'utf8'))); } catch { return false; } });
    if (alsoStates.length) {
      console.log(`      ↳ DERIVE: ${alsoStates.length} unlisted file(s) also state ${id}:`);
      for (const f of alsoStates) console.log(`         ${f}`);
    }
  }
}

if (failed) { console.error('check-claims: FAIL'); process.exit(1); }
console.log(`check-claims: OK — ${claims.length} claim(s) still stated by every listed file`);
