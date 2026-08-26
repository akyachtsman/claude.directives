import { readFileSync, existsSync } from 'fs';

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
  const consumerList = Array.isArray(consumers) ? consumers : [];
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
                   ...consumerList.map((file) => ({ file, role: 'consumer' }))];

  for (const { file, role } of targets) {
    if (!existsSync(file)) { fail(`${id}: ${role} file does not exist: ${file}`); continue; }
    if (re.test(normalize(readFileSync(file, 'utf8')))) {
      console.log(`OK:   ${id} → ${file}`);
    } else {
      fail(`${id}: ${role} no longer states the claim: ${file}\n      pattern: ${re.source}\n      why:     ${why}`);
    }
  }
}

if (failed) { console.error('check-claims: FAIL'); process.exit(1); }
console.log(`check-claims: OK — ${claims.length} claim(s) still stated by every listed file`);
