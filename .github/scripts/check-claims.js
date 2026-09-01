import { readFileSync } from 'fs';
import { resolve, relative } from 'path';
import { execFileSync } from 'child_process';

// CANONICAL-PHRASE GUARD (#300, rewritten for #341). Fails when a claim listed
// in claims.json stops being stated by a file that is required to state it.
//
// WHY IT EXISTS. Of PR #294's thirty-nine review rounds, most were not wrong
// claims — they were CORRECT claims that failed to reach a consumer. The same
// fact was fixed in one file and left stale, narrowed, or absent in six to nine
// others; round 35 found "check the PR's comments" in nine files while the
// source said "comments AND review threads". This repo's established answer to
// that class is a checker, not vigilance (check-exports, check-landing-cards,
// check-secret-scan, the paired-file diffs all exist for the same reason).
//
// ── WHY IT LOOKS LIKE THIS: THE INFERENCE LAYER WAS DELETED (#341) ──────────
// The previous version decided whether a carrier's claim was CONDITIONED —
// gated behind an `unless`/`while`/`after` clause, an owner approval, a
// negation — by matching lexical openers inside reader-computed sentence
// scopes. It cost 24 review rounds and 100 accepted findings on #336 with no
// downward trend: rounds 19, 21 and 24 were entirely against the immediately
// preceding round, each fix producing about one new finding.
//
// The last six each needed a SEMANTIC distinction no lexical proxy makes, and
// every proxy tried had a live counter-example on one side or the other:
// `while polling continues` gates but `while reporting that the head FAILED`
// does not; `after all checks pass` gates but `not, after all, a verdict` does
// not; an em dash joins two independent clauses or sets off an aside. Three of
// the six were HOLES and three were FALSE REFUSALS — the guard rejecting
// correct prose. Round 21 settled that a guard refusing correct prose is a
// defect, not a safe error, after it refused `A RESPONSE, however, is not a
// verdict`: the strongest possible statement of the claim it protects.
//
// The cost was paid in the directives themselves. Six carriers on #336 were
// reworded to satisfy the guard rather than to say something truer, and four
// openers were evicted by real prose — every one of which had entered the list
// from grammar rather than from a carrier.
//
// So there is no inference. A claim lists the exact phrasings that count as
// stating it; a carrier contains one or it does not. Gone with the machinery:
// CONDITION_OPENERS and its floor, the negator alternation and ITS floor,
// derived continuation probes, constructed probe positions, `markSentences`
// and its abbreviation table, the {{S}}/{{B}}/{{SOS}}/{{EOS}}/{{COND}}/{{NEG}}
// placeholders, the typed bracket stack, code-span delimiter tracking, and
// every condition lookahead. Rounds 18–24 are structurally unreachable rather
// than individually fixed.
//
// ⚠️ THE TRADE-OFF, STATED. Literal pinning cannot recognise a NEW correct
// phrasing. Every legitimate rewording becomes a manifest edit. That is the
// intended cost: it converts silent drift into a visible diff. A carrier
// rewritten in good faith turns this guard red, and the fix is to add the new
// wording to `phrasings` — a reviewable line, not a regex negotiation.
//
// ── HOW NEGATION IS HANDLED WITHOUT INFERRING IT ───────────────────────────
// A pattern matching a claim's WORDS also matches its INVERSION. Literal
// pinning does not escape that by itself: `arm the check-in` is a substring of
// `never arm the check-in`. Two rules close it, and neither infers anything.
//
//   1. MATCHING IS CASE-SENSITIVE. A carrier stating the claim at the head of a
//      sentence pins the capital: `Arm the check-in whenever …` is not
//      contained in `Never arm the check-in whenever …`. The old version
//      compiled every pattern with the `i` flag, which is also why it could
//      never write "uppercase" in a pattern and had to key sentence ends on the
//      letter BEFORE the period instead.
//   2. NO REJECTED STRING MAY CONTAIN A PHRASING — checked mechanically, at
//      load, for every claim. `mustNotMatch` therefore changes job: it was a
//      test of a hand-written regex, and is now a CONSTRAINT ON THE PHRASINGS.
//      Pin `arm the check-in` while rejecting `never arm a check-in whenever …`
//      and the manifest fails, naming both and telling the author to extend the
//      phrasing leftward until it excludes the rejected form.
//
// Rule 2 is the property the old design could not state. There, a reviewer had
// to think of each inversion and hand-write a pattern that dodged it; four got
// through anyway, three of them inside the fix for the previous one. Here, an
// inversion someone thought of is enough to force the phrasing that excludes
// it, and the check runs on every load rather than on a reviewer's memory.
//
// ── ⚠️ THE LIMIT, STATED ONCE AND BOUNDED ──────────────────────────────────
// Substring matching answers exactly one question: is this text present. A
// carrier can therefore contain an approved phrasing and still mean the
// opposite, by putting the negation or condition somewhere the phrasing does
// not cover. #346 produced six instances of that one class across two review
// rounds — a negator preposed inside the sentence, a condition APPENDED after
// the assertion, a gate written as a separate preceding sentence, an UPPERCASE
// negation in front of an uppercase phrasing, and two owner gates whose
// rejections were the wrong case to constrain anything.
//
// Every one is closed the same way, and the way generalises: EXTEND THE PIN SO
// THE MUTATION FALLS INSIDE IT. A phrasing carries its connector on the left
// and its terminator on the right, so any in-span edit — negate it, condition
// it, reword it — changes the pinned text and the guard goes red.
//
// What that does NOT reach, and cannot: a gate placed OUTSIDE the pinned span.
// Measured on #346 — prefixing CLAUDE.md's bullet with "Everything in this
// bullet applies only with owner approval." leaves every pinned phrasing
// byte-identical and the guard green. Extending the pin further moves the
// boundary; it never removes it, because the next sentence out is always
// available. No substring method closes this, and the lexical inference layer
// #341 deleted did not close it either — it just failed in both directions
// while appearing to try.
//
// So the guard's claim is scoped: it proves the WORDING TRAVELLED. It does not
// prove the rule is UNCONDITIONED at its carrier.
//
// ── ROUND 3 ARRIVED, AND THIS IS WHERE THE EXTENDING STOPS ─────────────────
// It found the round-2 rule applied only to the claim it had pointed at, so the
// rule was applied across all eight claims: extend a phrasing by the one
// punctuation mark every carrier of it agrees on.
//
// ROUND 6 THEN FOUND THAT RULE ADMITTING THE WRONG MARKS. A `,`, `:` or `;` is a
// CLAUSE mark, not a terminator: a phrasing ending at one stops mid-sentence, so
// a condition appended after it leaves every pinned character in place. Twelve
// of the then-21 "terminated" entries ended that way, and rewriting global.md's
// `never instead of it,` to `never instead of it, but only after owner
// approval,` kept this guard green while the run reported the phrasing as
// closed. Only `.`, `!` and `?` end an assertion, and only those count now.
// Seven of the twelve had a carrier-unanimous continuation running to a real
// terminator; FOUR were extended through it, the three whose continuations run
// 79-100+ characters were not. Pinning a hundred characters of tail buys one
// append and costs a red on every later edit to that sentence. So eight of the
// twelve are still open, and the count line is the place to read that.
//
// The counts are PRINTED on every run rather than written here: three separate
// sentences in this header describing this tool's own output have been measured
// false — read the run, not the prose.
//
// THE REST ARE DELIBERATELY LEFT SHORT, for one of two reasons: the next
// character is a space, or the continuation to a terminator is long enough that
// pinning it turns an innocuous rewording red. Either way, closing them needs
// the END of the assertion, and a scan for it stops inside `git.md` and
// `codex-monitor.yml`. That is sentence detection, rebuilt badly, in a build
// script — the exact machinery #341 deleted for failing in both directions.
// Extending those pins would reintroduce it one layer out, which is the
// treadmill, not an escape from it.
//
// So: an appended condition on a carrier whose assertion has no unambiguous
// terminator is NOT caught, and closing it costs more than it buys. If a future
// round wants it, the answer is a different mechanism — not a longer string.
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
//   ❌ A CARRIER THAT STATES A CLAIM TWICE has ONE of its occurrences pinned,
//      and the manifest author picks which. docs/standards/ci-triage.md states
//      verdict-lookup in two sentences; only the step-3 procedure sentence
//      carries an approved phrasing, so inverting THAT one turns this guard red
//      and inverting the other — the "What not to do" restatement — leaves it
//      green. This comment previously said inverting either one alone was
//      green; Codex measured the opposite on #346 round 6. It then said both
//      directions were pinned by cases when NO case existed — round 8, the
//      fifth sentence in this header asserting behaviour nothing held. Three
//      cases now do, named for what they hold: the pinned inversion is caught,
//      the unpinned one is not, and pinning BOTH turns the first green.
//      PINNING BOTH OCCURRENCES DOES NOT FIX IT AND MAKES IT WORSE. Phrasings
//      are an OR: add a phrasing for the second sentence and the file passes on
//      either one, so each occurrence individually becomes deletable. Measured
//      on this branch — adding it turned the previously-red inversion of the
//      authoritative sentence green, and the phrasing was reverted. So the rule
//      is: pin exactly the occurrence a reader acts on, and accept that the
//      restatement beside it is unpinned.
//      wait-gate.sh was the first instance — its explanatory header comment and
//      the message its hook DELIVERS both state the rule — and under literal
//      pinning that one is settled by wording rather than by choice: the header
//      says "arms a check-in alongside it", the message says "ARM A CHECK-IN
//      ALONGSIDE IT", and case-sensitive matching pins the delivered
//      occurrence. What stays uncovered is a file stating a claim twice in the
//      SAME wording; pin that occurrence's surrounding text if it happens.
// So: a green check-claims does NOT mean the directives are correct. It means
// nobody dropped a pinned sentence. Anything citing this guard must say so too.
//
// ── NORMALISATION: three rules, each earned by a measured false failure ─────
// Applied to the carrier AND to the phrasing, so a manifest author pastes the
// text as written and does not hand-collapse it.
//   1. Line-leading comment markers (`#`, `//`, `--`) stripped. A claim that
//      wraps inside a #-commented carrier otherwise collapses to
//      "comments AND its # review threads". Measured on codex-monitor.yml,
//      which states the verdict-lookup claim verbatim and was absent from this
//      guard's first manifest BECAUSE the scan that built it could not see it.
//   2. Emphasis and code markers (`*`, `_`, backtick) stripped. The same claim
//      appears as `comments AND the review threads` in one file and
//      `comments **and its review threads**` in another.
//   3. Whitespace collapsed across the WHOLE file. Round 30 of #294 wasted a
//      cycle because `grep -c` reported 0 for three files that contained the
//      phrase — it wrapped across lines. A line-oriented match produces false
//      failures on correct files, which is worse than no guard.
// Nothing else is interpreted. In particular NO sentence boundaries are
// computed: that reader is what rounds 18-24 were arguing about, and no check
// here needs to know where a sentence ends.

const MANIFEST = '.github/scripts/claims.json';
// ONE LIST, used by the target check AND by --derive. They were kept as two
// literals, and #346 found the same omission in each ONE ROUND APART — the cases
// file missing from --derive (round 3) and then from the SELF set (round 4),
// because round 3's fix was applied to the copy Codex pointed at. Two literals
// are not one definition, however the commit message describes them.
//
// WHY EACH IS EXCLUDED — and the reason is NOT the same for all three, which is
// what the previous version of this comment got wrong. It said each quotes every
// claim and therefore matches by construction. Only the manifest does:
//   * the manifest       — IS the phrasing list; contains every phrasing, always.
//   * check-claims-cases — quotes approved phrasings as fixtures.
//   * check-claims.js    — quotes claim text in its header as worked examples.
// So for two of the three, what they match is an ACCIDENT OF THE CURRENT WORDING,
// and a header or fixture edit changes it silently in either direction. Codex
// removed the checker from this list on #346 round 6 and --derive's output did
// not change; the very next edit to this header quoted a phrasing and it did.
// That is why the exclusion is by IDENTITY and can never be by a match count,
// and why NO NUMBER APPEARS IN THIS COMMENT — the run prints them (see the tail).
// None of the three is an operational carrier: nothing downstream reads a rule
// out of them, so a match here would be the guard finding its own test data.
const GUARD_ARTIFACTS = [
  MANIFEST,
  '.github/scripts/check-claims.js',
  '.github/scripts/check-claims-cases.js',
];
const MANIFEST_DOC = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const claims = MANIFEST_DOC.claims;

let failed = false;
const fail = (msg) => { console.error(`FAIL: ${msg}`); failed = true; };

if (!Array.isArray(claims) || claims.length === 0) {
  console.error(`FAIL: ${MANIFEST} declares no claims — an empty manifest verifies nothing while reporting success.`);
  console.error('check-claims: FAIL');
  process.exit(1);
}

const normalize = (s) => s
  .replace(/^[ \t]*(?:#+|\/\/|--)[ \t]?/gm, '')
  .replace(/[*_`]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// CASE-SENSITIVE, and that is rule 1 above rather than an oversight.
const states = (haystack, phrasings) => phrasings.some((p) => haystack.includes(p));

// --derive: report every tracked file that ALREADY states each claim, marking
// the ones the manifest does not list. Advisory, not a CI gate — a file may
// state a phrase without being a file that MUST keep stating it, and only a
// human can tell those apart.
//
// It exists because of how this manifest's first two rounds went wrong. The
// consumer lists were built by a throwaway scan whose normalizer did not strip
// line-leading comment markers, so it was blind to every .yml/.sh carrier with
// a wrapped claim. Round 1 fixed the normalizer in THIS file and did not
// re-derive the lists, so the manifest stayed under-covered and review found
// the carriers one at a time. Deriving THROUGH the same normalizer the guard
// uses is the only version that cannot drift from it.
//
// ⚠️ #341 NARROWED WHAT IT CAN FIND, and this is a real loss rather than a
// detail. A regex spanning wording variants could surface a carrier stating the
// claim in words nobody had approved yet; literal phrasings cannot, because a
// file only matches if it uses an ALREADY-LISTED wording. So --derive now finds
// copies of an approved phrasing, and no longer discovers a carrier that states
// the same rule in new words. Finding those is back to review — which is how
// CLAUDE.md's anaphoric carrier was found in the first place, by a reader rather
// than by this flag.
//
// "Verified on the current tree: --derive reports nothing" was written here and
// was FALSE: the scan reported check-claims-cases.js as an unlisted carrier for
// response-is-not-a-verdict on every run, because the exclusion covered two of
// the three guard artifacts. Codex, #346 round 3. No sentence replaces it —
// every attempt to state this tool's own output in a comment has been wrong, so
// the exclusion is pinned by a case and its effect is printed by the run.
const DERIVE = process.argv.includes('--derive');
// EVERY tracked file, minus binaries detected BY CONTENT. An extension
// allowlist here would recreate the exact blindness --derive exists to end:
// this repo carries claims in .py guards, .json manifests, .html and
// extensionless files, and a scan that cannot read them reports full coverage
// over a subset. Binary detection is a NUL byte in the first 8KB — the same
// heuristic git itself uses — so a new text format needs no allowlist edit.
const trackedTextFiles = () => execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter((f) => !f.includes('node_modules/'))
  // ALL THREE guard artifacts, for the reasons set out at GUARD_ARTIFACTS. An
  // artifact that matches is a permanent false candidate in advisory output, and
  // one of these was reported as an unlisted carrier for
  // `response-is-not-a-verdict` on every run — which is how an advisory list gets
  // ignored. Excluding two of three was a check present on one path and absent
  // from its twin, for the second time in this file. Codex, #346 round 3.
  .filter((f) => !GUARD_ARTIFACTS.includes(f))
  .filter((f) => {
    try {
      const head = readFileSync(f).subarray(0, 8192);
      return !head.includes(0);
    } catch { return false; }
  });

// One definition, three callers. A key this guard does not read is not inert:
// it reads as condition/negation protection that is not there.
const CLAIM_KEYS = new Set(['id', 'why', 'source', 'sourceOnly', 'phrasings',
  'raw', 'pattern', 'consumers', 'mustNotMatch']);
const ROOT_KEYS = new Set(['_comment', 'claims']);
const CONSUMER_KEYS = new Set(['file', 'why',
  // Recognised here so the generic "unknown key" message does not pre-empt the
  // tailored per-consumer-override refusal below, which names the replacement.
  // A check that fails for a less useful reason is still a downgrade.
  'phrasings', 'pattern', 'mustNotMatch']);

function allowKeys(where, obj, allowed, kind) {
  const unknown = Object.keys(obj).filter((k) => !allowed.has(k));
  if (!unknown.length) return true;
  fail(`${where}: unknown ${kind} key(s): ${unknown.join(', ')}\n`
    + `      #341 removed the inference layer; a key it does not read is not inert, it reads as protection that is not there.\n`
    + `      Known ${kind} keys: ${[...allowed].join(', ')}`);
  return false;
}

if (!allowKeys(MANIFEST, MANIFEST_DOC, ROOT_KEYS, 'root')) {
  console.error('check-claims: FAIL');
  process.exit(1);
}

const seenIds = new Set();

for (const claim of claims) {
  const { id, why, source, consumers } = claim;

  // Manifest hygiene FIRST. A malformed entry must fail loudly rather than
  // silently checking nothing — a vacuous pass is the failure mode every
  // earlier version of this class of guard died from.
  if (!id) { fail(`manifest entry with no id: ${JSON.stringify(claim).slice(0, 120)}`); continue; }
  // AN ALLOWLIST AT EVERY LEVEL, via one helper. Round 4 added it to the claim
  // object only, so the removed ROOT fields (negators, continuations,
  // continuationRequired, negatorFloor) and a CONSUMER-level continuationProbe
  // stayed silently accepted — the structural fix applied at one level and not
  // its siblings, which is the fourth consecutive round of that shape on this
  // PR. Levels are data now, not three hand-written checks. Codex, #346 round 5.
  //
  // AN ALLOWLIST, not a list of the legacy fields someone remembers. #341
  // deleted continuationProbe, negatorProbe, phrase and the rest, and the
  // rewrite IGNORED them rather than refusing them — so a copied entry or a
  // merge resolution could carry fields that read as live condition/negation
  // protection while doing nothing, which is the whole failure mode this repo
  // calls fail-open. Naming the three removed fields would leave the fourth
  // silent, so the check is inverted: anything not in the new schema is an
  // error. Codex, #346 round 4.
  if (!allowKeys(`${id}`, claim, CLAIM_KEYS, 'claim')) continue;
  if (seenIds.has(id)) fail(`duplicate claim id: ${id}`);
  seenIds.add(id);
  if (!why) fail(`${id}: no "why" — an entry nobody can interpret cannot be maintained`);
  if (!source) fail(`${id}: no "source"`);

  // A consumer is either a path, or { file, phrasings, why } when that carrier
  // needs a STRICTER match than the claim's own. wait-gate.sh is why: the
  // claim-level phrasing matched its explanatory header comment, so deleting
  // the instruction from the message the hook actually DELIVERS left the guard
  // green on the highest-authority copy of the rule.
  const consumerList = (Array.isArray(consumers) ? consumers : [])
    .map((c) => (typeof c === 'string' ? { file: c } : c));
  let consumerKeysOk = true;
  for (const c of consumerList) {
    if (!c || typeof c !== 'object') { fail(`${id}: consumer entry is not a path or an object`); consumerKeysOk = false; continue; }
    // BEFORE the paths are normalised, because `resolve(undefined)` throws
    // ERR_INVALID_ARG_TYPE and kills the process — so `"consumers": [{}]` gave a
    // stack trace instead of this diagnostic and every claim after it went
    // unchecked. The `consumer entry with no "file"` refusal further down ran
    // too late to be reached. Same defect as the missing-source read earlier on
    // this PR: a malformed manifest must FAIL the entry, never abort the run.
    // Codex, #346 round 7.
    if (typeof c.file !== 'string' || c.file.trim() === '') {
      fail(`${id}: consumer entry with no usable "file": ${JSON.stringify(c).slice(0, 120)}`);
      consumerKeysOk = false;
      continue;
    }
    if (!allowKeys(`${id}: consumer ${c.file}`, c, CONSUMER_KEYS, 'consumer')) consumerKeysOk = false;
  }
  if (!consumerKeysOk) continue;

  // Compare NORMALIZED paths: './directives/git.md' and
  // 'directives/../directives/git.md' name the same file, and raw-string
  // comparison lets either alias its way past both the source check and the
  // duplicate check — restoring the vacuous pass those rules exist to stop.
  const norm = (f) => relative('.', resolve(f)) || f;
  const consumerFiles = consumerList.map((c) => norm(c.file));
  const sourceNorm = norm(source);
  // THE GUARD'S OWN FIXTURES ARE NOT EVIDENCE. This manifest quotes every claim
  // in its `why` and in its `phrasings`; check-claims.js quotes them in its
  // header as worked examples. Both therefore MATCH, and neither is an
  // operational carrier — nothing downstream reads a rule out of them. Listing
  // either as source or consumer produces a green run that proves only that the
  // guard still contains its own test data. Codex reproduced it: swap
  // arm-the-check-in's consumers for claims.json, or for check-claims.js, and
  // the guard reports OK while checking no consumer at all.
  const SELF = new Set(GUARD_ARTIFACTS.map(norm));
  for (const f of [sourceNorm, ...consumerFiles]) {
    if (SELF.has(f)) fail(`${id}: ${f} is this guard's own artifact — it states the claim only as rationale, phrasing or test data, so it can never evidence that the claim reached an operational consumer`);
  }
  for (const f of consumerFiles) {
    if (f === sourceNorm) fail(`${id}: consumer is the source itself (${f}) — that verifies nothing the source check does not`);
  }
  const dupes = consumerFiles.filter((f, i) => consumerFiles.indexOf(f) !== i);
  if (dupes.length) fail(`${id}: duplicate consumer path(s): ${[...new Set(dupes)].join(', ')}`);

  // `sourceOnly` waives the consumer requirement, so it is the one key in this
  // manifest whose mere PRESENCE can silence a check. A truthy non-boolean
  // therefore restores the vacuous pass: the string "false" is truthy in JS, so
  // `"sourceOnly": "false"` — which reads to a human as OFF — switched the
  // waiver ON. Only the literal boolean counts.
  if (claim.sourceOnly !== undefined && typeof claim.sourceOnly !== 'boolean') {
    fail(`${id}: "sourceOnly" must be a boolean, got ${JSON.stringify(claim.sourceOnly)} — a truthy non-boolean silently waives the consumer requirement it appears to decline`);
    continue;
  }
  if (consumerList.length === 0 && claim.sourceOnly !== true) {
    // A claim can legitimately live in ONE file today and still be worth
    // pinning — the git.md split (#299) is exactly the event that would drop
    // it. But an ACCIDENTALLY empty consumer list looks identical, so the
    // single-file case must be declared, not inferred.
    fail(`${id}: no consumers — an entry that checks nothing passes vacuously. If the claim genuinely lives only in its source today, set "sourceOnly": true and say so in "why".`);
    continue;
  }

  // ── raw: one narrow exception, for a claim that pins STRUCTURE ────────────
  // `terminal-states-list-is-closed` asserts that no third bullet was appended
  // to a two-item list. That is the absence of text, which no phrasing can say,
  // and normalize() destroys the evidence — it collapses newlines and strips
  // `*`, so a `- ` marker survives as prose while a `* ` marker is ERASED.
  // #336 round 10 found the entry detecting only the marker that happened to
  // survive: it read as a closed-list guarantee and was a hyphen check.
  //
  // A raw claim carries a plain JS regex over unnormalised text. It gets NO
  // placeholder expansion, because there are no placeholders left — the whole
  // point of #341. Do not reach for `raw` to express a wording variant: add the
  // wording to `phrasings` instead, where it is a reviewable line rather than
  // a regex only its author can evaluate.
  if (claim.raw !== undefined && typeof claim.raw !== 'boolean') {
    fail(`${id}: "raw" must be a boolean`);
    continue;
  }
  const isRaw = claim.raw === true;

  if (isRaw) {
    if (!claim.pattern) { fail(`${id}: "raw" needs "pattern"`); continue; }
    if (claim.phrasings !== undefined) { fail(`${id}: "raw" claims carry a "pattern", not "phrasings" — pick one`); continue; }
  } else {
    // PRESENCE, not truthiness. `"pattern": ""` is falsey, so a truthiness test
    // read the field as absent and the refusal never fired — a legacy entry kept
    // a field that looks like it influences matching and does not.
    if (claim.pattern !== undefined) {
      fail(`${id}: "pattern" is only for "raw": true structural claims. A wording variant belongs in "phrasings" — #341 deleted the inference layer that made patterns necessary, and a non-raw pattern would silently reintroduce it.`);
      continue;
    }
    if (!Array.isArray(claim.phrasings) || claim.phrasings.length === 0) {
      fail(`${id}: needs a non-empty "phrasings" array — the exact wordings that count as stating this claim`);
      continue;
    }
    if (claim.phrasings.some((p) => typeof p !== 'string' || normalize(p) === '')) {
      fail(`${id}: every phrasing must be a non-empty string — an empty phrasing is contained in every file and would certify anything`);
      continue;
    }
  }

  let re = null;
  if (isRaw) {
    try {
      re = new RegExp(claim.pattern);
    } catch (err) {
      fail(`${id}: invalid pattern — ${err.message}`);
      continue;
    }
    if (re.test('')) { fail(`${id}: pattern matches the empty string — it would certify anything`); continue; }
  }

  const phrasings = isRaw ? null : claim.phrasings.map(normalize);
  // NO PHRASING MAY CONTAIN ANOTHER, and no phrasing may repeat. `states()` is a
  // substring test over the whole set, so if phrasing A contains phrasing B then
  // every carrier A matches, B matches too: A can never be the sole reason a file
  // passes, and deleting A changes no verdict. That is not harmless redundancy.
  // The run's phrasing count treats the pair as two units of coverage, and a
  // reviewer reading the manifest sees a long specific pin that is enforced only
  // as far as the short one inside it. `unreachable-review-test-name` carried
  // exactly that — "its unreachable-review test, and" inside "bounds by its
  // unreachable-review test, and", both occurring only in ci-triage.md, so the
  // longer entry was dead audit data. Codex, #346 round 6.
  // Same shape and same justification as the mustNotMatch containment check
  // below: containment between two literals is a fact, not an inference, which is
  // the only kind of reasoning #341 left in this guard.
  if (!isRaw) {
    const dupe = phrasings.find((p, i) => phrasings.indexOf(p) !== i);
    if (dupe !== undefined) {
      fail(`${id}: duplicate phrasing (identical after normalisation): ${JSON.stringify(dupe)}`);
    }
    for (const short of phrasings) {
      const long = phrasings.find((p) => p !== short && p.includes(short));
      if (long !== undefined) {
        fail(`${id}: one phrasing CONTAINS another, so the longer one is never the sole match and pins nothing extra.\n`
          + `      shorter: ${JSON.stringify(short)}\n`
          + `      longer:  ${JSON.stringify(long)}\n`
          + `      Keep whichever pins the occurrence a reader acts on, and delete the other — two entries covering one occurrence read as two, and are one.`);
      }
    }
  }
  // Read a carrier exactly as the phrasings were read, or the two sides compare
  // different text — the one-path-and-not-its-twin defect this guard's own
  // review produced nine times.
  const prep = (t) => (isRaw ? t : normalize(t));
  const holds = (text, ph) => (isRaw ? re.test(text) : states(text, ph));

  // ── mustNotMatch: now a CONSTRAINT ON THE PHRASINGS ───────────────────────
  // Every entry is a string that must NOT count as stating this claim. Required,
  // not optional, because one class of defect appeared FOUR times in this
  // guard's own review and three of those were inside a fix for the previous:
  //   `disarm a check-in`     — `arms?` unanchored, matched inside `disarms`
  //   `non-unique match …`    — `unique` unanchored, matched inside `non-unique`
  //   `never arm a check-in`  — negation before the verb
  //   `review-thread reply …` — `read` unanchored, matched inside `thread`,
  //                             in the very alternation added to fix #3
  // Under literal pinning these stop being regex traps and become the rule of
  // rule 2 in the header: a phrasing contained in a rejected string is too
  // short to distinguish the claim from its inversion, and the fix is to extend
  // the phrasing until it is not. The check reports WHICH phrasing and WHICH
  // rejected string, because "some pair collides" is not actionable.
  const mustNot = claim.mustNotMatch;
  if (!Array.isArray(mustNot) || mustNot.length === 0) {
    fail(`${id}: no "mustNotMatch" — every claim must carry the inversions it is required to reject. See this guard's header for the four that got through without it.`);
    continue;
  }
  for (const bad of mustNot) {
    if (typeof bad !== 'string' || bad === '') {
      fail(`${id}: mustNotMatch entries must be non-empty strings`);
      continue;
    }
    const n = prep(bad);
    // EMPTY AFTER NORMALISATION is the same as empty. "   \n\t" satisfied the
    // non-empty test and then normalised to "", so it contained no phrasing and
    // constrained nothing while counting as the required negative coverage.
    // Non-raw matching runs on normalised text, so the check has to as well.
    if (!isRaw && n === '') {
      fail(`${id}: a mustNotMatch entry is empty after normalisation — it can constrain no phrasing, so it is coverage in name only: ${JSON.stringify(bad)}`);
      continue;
    }
    if (isRaw) {
      if (re.test(n)) fail(`${id}: pattern MATCHES a string it must reject: ${JSON.stringify(bad.slice(0, 140))}`);
      continue;
    }
    const collide = phrasings.find((p) => n.includes(p));
    if (collide !== undefined) {
      fail(`${id}: a phrasing is contained in a string this claim must REJECT, so the inversion would count as coverage.\n`
        + `      phrasing: ${JSON.stringify(collide)}\n`
        + `      rejected: ${JSON.stringify(normalize(bad).slice(0, 200))}\n`
        + `      Extend the phrasing leftward (or pin its capitalisation) until the rejected string no longer contains it.`);
    }
  }

  // ── per-consumer override: a stricter phrasing set for one carrier ────────
  const role = 'consumer';
  // READ THE SOURCE THE SAME WAY THE CONSUMERS ARE READ. An unguarded read here
  // threw ENOENT on a deleted, renamed or misspelled source and ABORTED the
  // process — so a stack trace replaced the diagnostic, and every claim after it
  // went unchecked. The consumer path below already caught this; having the
  // check on one path and not its twin is the defect this file's own review
  // produced nine times, and it reappeared in the rewrite that was supposed to
  // remove the machinery it kept appearing in. Found by Codex on #346.
  let sourceText;
  try {
    sourceText = prep(readFileSync(source, 'utf8'));
  } catch (err) {
    fail(`${id}: cannot read source ${source} — ${err.message}`);
    continue;
  }
  if (!holds(sourceText, phrasings)) {
    fail(`${id}: the SOURCE no longer states the claim: ${source}\n      why: ${why}`);
  } else {
    console.log(`OK:   ${id} → ${source} (source)`);
  }

  for (const c of consumerList) {
    const file = c.file;
    if (!file) { fail(`${id}: consumer entry with no "file"`); continue; }
    // PER-CONSUMER OVERRIDES ARE GONE, and their two users no longer need them.
    // An override let one carrier be matched by a STRICTER regex than the claim's
    // own. Both instances existed because a regex could not tell two occurrences
    // in one file apart:
    //   * wait-gate.sh states the rule twice — in its explanatory header comment
    //     and inside the echo the PreToolUse hook DELIVERS. The claim-level
    //     pattern matched the header, so deleting it from the delivered message
    //     left the guard green on the copy that carries the most authority.
    //   * CLAUDE.md states response-is-not-a-verdict anaphorically.
    // Case-sensitive literal pinning settles both without a mechanism. The
    // header says "arms a check-in alongside it"; the delivered message says
    // "ARM A CHECK-IN ALONGSIDE IT" — different text, so pinning the delivered
    // wording pins the delivered occurrence. Verified by deleting the rule from
    // the echo alone and watching this guard go red. The anaphoric CLAUDE.md
    // wording is simply another phrasing.
    // So the override branch ran ZERO times, and an unexercised branch in a
    // guard is the failure this repo keeps paying for — #342 found two of its
    // checks fail-open for exactly that reason. If a carrier ever again states a
    // claim twice in the SAME wording with one occurrence authoritative, pin
    // that occurrence's surrounding text as its own phrasing; reintroduce a
    // mechanism only with a case that exercises it.
    if (c.phrasings !== undefined || c.pattern !== undefined || c.mustNotMatch !== undefined) {
      fail(`${id}: consumer ${file} carries a per-consumer override, which no longer exists.\n      Pin the authoritative occurrence's own wording as a claim-level phrasing instead — case-sensitive matching distinguishes it from a weaker copy in the same file.`);
      continue;
    }

    let text;
    try {
      text = prep(readFileSync(file, 'utf8'));
    } catch (err) {
      fail(`${id}: cannot read ${role} ${file} — ${err.message}`);
      continue;
    }
    if (holds(text, phrasings)) {
      console.log(`OK:   ${id} → ${file}`);
    } else {
      const shown = (phrasings || []).map((p) => `\n        - ${JSON.stringify(p)}`).join('');
      fail(`${id}: ${role} no longer states the claim: ${file}\n`
        + `      none of its approved phrasing(s) appear:${shown || ' (raw pattern)'}\n`
        + `      why: ${why}\n`
        + `      If the carrier was reworded in good faith, add the new wording to "phrasings" — that edit is the point of literal pinning, not a workaround.`);
    }
  }

  if (DERIVE) {
    const listed = new Set([source, ...consumerFiles]);
    const alsoStates = trackedTextFiles()
      .filter((f) => !listed.has(f))
      .filter((f) => { try { return holds(prep(readFileSync(f, 'utf8')), phrasings); } catch { return false; } });
    if (alsoStates.length) {
      console.log(`      ↳ DERIVE: ${alsoStates.length} unlisted file(s) also state ${id}:`);
      for (const f of alsoStates) console.log(`         ${f}`);
    }
  }
}

if (failed) { console.error('check-claims: FAIL'); process.exit(1); }
const allPhrasings = claims.flatMap((c) => c.phrasings || []);
// `.`, `!`, `?` ONLY — NOT `,`, `:` or `;`. A phrasing ending in a clause mark
// stops MID-sentence, so a condition appended after that mark leaves the pin
// intact: the carrier still contains every character the phrasing names. That is
// the precise hole the terminator rule exists to close, and counting those
// entries as closed overstated the coverage this line was added to report.
// Measured: with `never instead of it,` pinned, rewriting global.md to
// `never instead of it, but only after owner approval,` kept the guard GREEN,
// and twelve of the then-21 "terminated" entries ended in `,` or `:`.
// Codex, #346 round 6. Four of the twelve were extended through a short
// carrier-unanimous continuation; the other eight are counted as open.
const SENTENCE_END = '.!?';
// CLASSIFY THE NORMALISED PHRASING, because that is the text matching uses.
// `*The merge proceeds unattended.*` pins the period — normalize() strips the
// emphasis markers from both sides before comparing — but the raw string ends in
// `*`, so the unnormalised test called it open and the run reported an audit
// residue that was not there. Reading a value one way for matching and another
// way for reporting is how the count stops describing the guard. Codex, #346
// round 8.
const isClosed = (p) => SENTENCE_END.includes(normalize(p).slice(-1));
const terminated = allPhrasings.filter(isClosed).length;
console.log(`check-claims: OK — ${claims.length} claim(s) still stated by every listed file`);
// COUNTED, NOT ASSERTED. The header carried "14 extended / 16 short" as prose
// and both were wrong by the next commit (really 21 and 15). A number nobody
// recomputes is the same defect as a comment claiming a tool's output — so the
// audit boundary for the deliberately unclosed appended-condition cases is
// printed every run instead of written down once. Codex, #346 round 5.
// MEASURED, NOT ASSERTED — the third time a sentence in this file about the
// file's own output turned out false. What each excluded artifact actually
// matches changes with an ordinary header or fixture edit, so the run reports it.
// A count is not the reason for the exclusion (that is identity, see
// GUARD_ARTIFACTS); it is the number a future comment would otherwise guess at.
const artifactMatches = GUARD_ARTIFACTS.map((f) => {
  let n = '?';
  try {
    const t = normalize(readFileSync(f, 'utf8'));
    n = String(allPhrasings.filter((p) => t.includes(normalize(p))).length);
  } catch { /* an unreadable artifact is already fatal above; do not add noise */ }
  return `${f.replace(/^.*\//, '')} ${n}/${allPhrasings.length}`;
});
console.log(`  guard artifacts excluded by identity — phrasings each happens to contain: ${artifactMatches.join(', ')}`);
console.log(`  phrasings: ${allPhrasings.length} total — ${terminated} run to a sentence terminator, `
  + `${allPhrasings.length - terminated} stop short (an appended condition is NOT caught on those; see the header)`);
if (DERIVE) {
  for (const c of claims) {
    for (const p of c.phrasings || []) {
      if (!isClosed(p)) console.log(`      open: ${c.id} — ${JSON.stringify(p)}`);
    }
  }
}
