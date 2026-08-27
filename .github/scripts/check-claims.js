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
//   ❌ A CARRIER THAT STATES A CLAIM TWICE is pinned only as strongly as its
//      most permissive occurrence. docs/standards/ci-triage.md states the
//      verdict-lookup claim in two different sentences; inverting either one
//      alone leaves this guard green, correctly — the file DOES still state the
//      claim, from the other sentence. But the two are not equal in authority,
//      and the guard cannot tell which one a reader will act on. wait-gate.sh
//      was the first instance (explanatory header vs. delivered message) and is
//      why the per-consumer `pattern` escape hatch exists; reach for it whenever
//      one occurrence in a file carries more weight than the others.
// So: a green check-claims does NOT mean the directives are correct. It means
// nobody dropped a pinned sentence. Anything citing this guard must say so too.
//
// ⚠️ NEGATION — the limit that took four review rounds to bound, so that the
// next person does not re-derive it. A pattern matching a claim's WORDS also
// matches its INVERSION, and reports the inversion as coverage:
//   `disarm a check-in`               (fixed: \b before the verb)
//   `non-unique match is not proof`   (fixed: lookbehind before `unique`)
//   `ignore the PR's comments AND its review threads`
//                                     (fixed: require a lookup verb — check /
//                                      read / look for — which all ten real
//                                      carriers happen to have)
//   `never arm a check-in`            (fixed: reject a negator immediately
//                                      before the verb)
//   `inline review-th{READ} reply — so ignore the comments AND the review
//    threads`                         (fixed: \b around the verb alternation.
//                                      This one appeared INSIDE the fix for the
//                                      line above: an unanchored `read` matched
//                                      the tail of `thread`, so the sentence
//                                      that had just been inverted supplied its
//                                      own positive verb. Fourth instance of
//                                      one class, third of them inside a fix
//                                      for the previous. That is why every
//                                      claim now carries `mustNotMatch`.)
// A GENERAL negation guard — scan the clause before any match for a negator —
// was designed, MEASURED, and rejected. It false-positives on a real carrier:
// ci-notify.yml says "a green run is NOT a guaranteed wake and a waiting
// session still arms a check-in", where the negator belongs to a different
// proposition in the same clause and the carrier is entirely correct. Failing
// that file would be worse than the gap, so the per-claim fixes above stand and
// no clause-level negation check exists. Do not add one without re-measuring.
// WHAT REMAINS UNCAUGHT, precisely: a negator separated from the verb by any
// other word. `never explicitly arm a check-in` still passes. Narrowing that
// needs the claim's CONDITION pinned too, not just its verb, and the eleven
// carriers word that condition eleven different ways — which is what the
// per-consumer `pattern` escape hatch is for when one of them matters enough.
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
const MANIFEST_DOC = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const claims = MANIFEST_DOC.claims;

// ONE NEGATOR DEFINITION, expanded into every pattern's {{NEG}} placeholder.
// Round 6 claimed to have unified two copies of this alternation and instead
// wrote the same string twice; round 7 deleted `avoid` from a single copy and
// every declared case still passed while an inverted carrier was accepted.
// Two literals are not one definition, however the commit message describes
// them. A placeholder is, because there is then no second copy to edit.
const NEGATORS = MANIFEST_DOC.negators;

// ── ONE DEFINITION OF "STILL INSIDE THIS SENTENCE", expanded into {{S}} ─────
// Every guard here scopes itself to a sentence, and every one of them spelled
// that as `[^.]` -- "any character that is not a period". Round 18(d) showed
// what that actually means: an ABBREVIATION period ends the scope. Changing a
// carrier to "If the owner approves (e.g. in a review), a RESPONSE is not a
// verdict" left check-claims green, because the periods in `e.g.` stopped the
// lookbehind before it could reach the `If`. The condition was preposed, in
// plain sight, and the guard could not see past a full stop that was not one.
//
// A period ends a sentence when it is followed by whitespace and then something
// that starts one -- a capital -- or by nothing at all. A period inside `e.g.`
// is followed by a letter, or by whitespace and a lowercase word. That is the
// rule, written once:
// The discriminator is the LETTER BEFORE the period, not the word after it.
// The obvious rule -- a stop is a stop when followed by whitespace and a
// capital -- cannot be written here: these patterns compile with the `i` flag,
// so `[A-Z]` and `[a-z]` both fold and neither can say "uppercase". Keying on
// what precedes is case-free and more accurate anyway: `e.`, `g.`, `i.` are a
// period after a LONE letter, which is what an abbreviation is; `SHA.`,
// `head.`, `verdict.` are periods after a word, which is what a sentence end
// is. A first draft keyed on the following character and read "SHA. ⚠️ A clean
// rerun" as one sentence, because an emoji is not a capital -- it dragged two
// carriers' scopes back into the previous sentence and turned them red.
const SENTENCE_CHAR = '[^\\u0001]';
// A claim that requires its assertion to END a sentence looks for the stop and
// then whitespace-or-EOF. The mark now sits between the two, so {{EOS}} is that
// alternation written once — the pattern says "a stop that ends a sentence"
// rather than restating where the reader happens to put its bookkeeping.
const END_OF_SENTENCE = '(?:\\u0001|\\s|$)';
// And the other end. A claim whose own sentence legitimately OPENS with a
// conditional word cannot use an "no opener earlier in this sentence"
// lookbehind — the guard would reject the carrier it is there to certify.
// `no-label-no-escalation` is exactly that: every carrier states it as "Where
// no codex-flagged label is present, …", and `where` is an opener. What that
// claim needs is not "no opener before me" but "nothing before me at all", so
// a gate preposed in front of its own scoping clause has nowhere to sit.
const START_OF_SENTENCE = '(?<=(?:^|\\u0001)\\s{0,4})';
// It is ONE definition on purpose. `[^.]` appeared in the lookbehind, in the
// trailing lookahead, and in both tempered gaps -- four copies of one idea, in
// a file whose recurring defect is a check that exists on one path and not its
// twin. Fixing the lookbehind alone would have left the lookahead reading a
// different sentence than the lookbehind, which is that defect exactly.
const expand = (src) => src.replace(/\{\{SOS\}\}/g, () => START_OF_SENTENCE).replace(/\{\{EOS\}\}/g, () => END_OF_SENTENCE).replace(/\{\{S\}\}/g, () => SENTENCE_CHAR).replace(/\{\{COND\}\}/g, () => COND).replace(/\{\{NEG\}\}/g, () => {
  if (typeof NEGATORS !== 'string' || NEGATORS === '') {
    console.error('FAIL: a pattern uses {{NEG}} but the manifest declares no "negators" string.');
    process.exit(1);
  }
  return NEGATORS;
});

// ── ONE CONTINUATION DEFINITION, for claims whose statement must END ────────
// Three claims here are only true if nothing takes them back inside the same
// sentence: "the merge proceeds unattended", "could not be made or accepted at
// all", the canonical test's name. Each grew a terminator, and rounds 10, 11
// and 12 each found the SAME class of hole in the terminator chosen: `;`
// continues a sentence, five punctuation marks continue a clause, the first dot
// of an ellipsis is a period, and `\b` treats a hyphen as the end of a word.
// Three rounds, three hand-written probe sets, three misses — because each
// round I probed the continuation I had just thought of.
// So the continuations are DERIVED. A claim declares the shape of its statement
// once; every continuation below is rendered into it and must be REJECTED. A
// future claim with a terminator gets the whole set free, and adding a
// continuation here tests every such claim at once — which is the difference
// between a probe set and a definition, the same argument as {{NEG}} above.
// TWO KINDS, because a claim pins one of two things and they fail differently.
// A STATEMENT ("the merge proceeds unattended") is undone by a clause that takes
// it back; a NAME ("the unreachable-review test") is undone by a suffix that
// renames the token, and a clause after it is just prose. Feeding one kind's
// list to the other produced fifteen failures that were not defects — proof the
// distinction is real rather than tidiness.
const CONTINUATIONS = MANIFEST_DOC.continuations;
// A FLOOR, for the same reason `negatorFloor` exists: deleting an entry from
// `continuations` deletes its derived probe IN THE SAME EDIT, so narrowing the
// definition and widening a pattern back can pass together with nothing failing.
// The floor is checked alongside the definition, never instead of it: the
// definition covers what continuations currently says, the floor covers what it
// must never stop saying.
// THE FLOOR LIVES HERE, NOT IN THE MANIFEST, and it holds EVERY known
// continuation rather than representative ones. Round 13 put a partial floor in
// claims.json; round 14 showed that leaves most of the definition unprotected —
// removing a non-floor entry while widening a pattern is the same combined edit
// the floor exists to catch, and it passed. Two changes fix that:
//   1. COMPLETE. Every continuation that must not regress is here. A floor of
//      examples defends the examples.
//   2. IN CODE. A floor sitting beside the definition it backstops is edited by
//      the same hand in the same file; here, narrowing it is a change to the
//      CHECKER, which is a different review. The manifest's `continuations` is
//      additive on top — it can grow the set, never shrink it below this.
// ⚠️ A FOURTH STANDING BLIND SPOT, measured in round 15 while verifying a fix.
// This guard asks "does this FILE state the claim", not "is every statement of
// it intact". `directives/git.md` states `response-is-not-a-verdict` twice, and
// corrupting one of them — appending `unless it contains no findings` — leaves
// the guard green, because the other still matches. A reader following the
// corrupted sentence is misled; the guard sees the file as compliant.
// Fixing it means matching EVERY occurrence rather than the first, which is a
// different scan and would newly fail files that mention a claim in passing.
// Recorded rather than fixed, alongside the three in this file's header.
// ── ONE CONDITION DEFINITION, expanded into {{COND}} ────────────────────────
// The openers that make an assertion conditional. This was written inline in
// THREE patterns (a claim, its override, and the verdict-lookup claim), which
// is the arrangement round 15 recorded as "a rule stated in more than one place
// will disagree with itself" — and it did, twice: `only if` was there without
// `if` (round 16), then `except where` without `where` (round 17).
//
// Both are the same property, so it is ASSERTED rather than remembered: every
// multi-word opener's LAST WORD must itself be an opener. A compound is the
// special case; the bare head is the common one, and shipping the compound
// alone guards the wording nobody writes. Named in round 16 as something the
// checker could assert; round 17 is what it cost to not have done it then.
//
// TWO ENTRIES CARRY A LOOKAHEAD, and the reason is round 18(b): `provided` is
// both a conditional opener and an ordinary past participle. Rejecting the bare
// word in every position turned "A response PROVIDED BY Codex is not a verdict"
// -- a sentence that states the intended rule -- into a guard failure, so the
// guard was blocking the natural wording of the thing it protects. A false
// refusal is not the harmless direction here: it is what makes a maintainer
// reword a carrier to please a regex, which this PR has already paid for three
// times. The participial use is the one followed by a preposition; the
// conditional use is followed by its clause.
const CONDITION_OPENERS = [
  // `until` is round 18(c). It is as ordinary a conditional opener as `if`, and
  // it was missing, so "A response is not a verdict UNTIL it contains no
  // findings" passed every check while reversing the assertion for the exact
  // state that matters -- the clean response, which is the one a session merges
  // on. Same shape as round 16's missing bare `if`: the list was assembled from
  // the openers I happened to write, not from the ones that reverse a claim.
  'unless', 'until', 'except', 'if', 'when', 'whenever', 'where', 'wherever',
  // The former CLAUSE_OPENERS, folded in by round 20 (see the note below).
  'after', 'once', 'although', 'subject to', 'following',
  // `yet` was here for two rounds and is out. As a gate it is archaic
  // ("yet the owner objects"); in ordinary prose it is a coordinating
  // contrast, and `That establishes a RESPONSE, yet not a verdict` states
  // this claim ABSOLUTELY while the guard refused it. Third opener removed
  // for over-firing after `only`, `assuming` (round 17) and `pending`
  // (round 20) — every one of them arrived from grammar rather than from a
  // carrier, and every one was evicted by prose.
  // `however` carries a lookahead because it is TWO WORDS in one spelling. As a
  // gate it introduces a clause — "however the owner decides". Comma-flanked it
  // is a discourse marker and changes nothing — "A RESPONSE, however, is not a
  // verdict" states this claim absolutely, and round 21 caught the guard
  // REFUSING it. That direction is not the safe one: it is how a maintainer
  // gets taught to reword correct prose until a regex stops complaining, and
  // this PR has already paid that five times.
  'however(?![ \t]*,)',
  // `pending` was here for one run and came back out, for the reason round 17
  // removed `only` and `assuming`: it is a conditional opener in grammar and an
  // ordinary word in this repo's prose. `reading as "still pending"` turned four
  // consumers red. A list drawn from grammar over-fires on writing, and the
  // consumers going red is what says so — not review.
  'provided(?!\\s+(?:by|in|to|for|with|from|as|at|on)\\b)',
  'providing', 'as long as', 'so long as',
];
// ⚠️ RECORDED, NOT FIXED: `providing` has the same participial/conditional
// ambiguity and no lookahead, because its participial form is followed by a
// NOUN ("providing a rationale") rather than a preposition, so the same trick
// does not reach it. Narrowing it needs a different discriminator; it is
// written down here rather than left as a surprise for whoever hits it.
// THE ASSERTION IS ABOUT REDUNDANCY, and finding the right one took a false
// start worth recording. The first version required every compound's LAST WORD
// to be a member, and it immediately failed on my own `provided that` — whose
// head is `provided`, the FIRST word. Compounds are irregular that way.
//
// The property that IS regular: with every bare opener present, a compound is
// REDUNDANT, because the bare member already matches inside it — `\bif\b`
// matches within `only if`, `\bexcept\b` within `except where`, `\bprovided\b`
// within `provided that`. So a compound in this list is either redundant or it
// is a genuinely irreducible phrase (`as long as`, whose words are not openers).
// Rejecting redundant compounds is what stops the two-round pattern: `only if`
// without `if` (r16) and `except where` without `where` (r17) were BOTH someone
// adding the compound and believing the head was covered.
for (const opener of CONDITION_OPENERS) {
  if (!opener.includes(' ')) continue;
  const covered = CONDITION_OPENERS.find((o) => !o.includes(' ')
    && new RegExp(`\\b${o}\\b`).test(opener));
  if (covered) {
    console.error(`FAIL: CONDITION_OPENERS contains "${opener}", which the bare opener "${covered}" already matches inside — a redundant compound is how a missing bare head hides, twice on this PR. Drop the compound; the head covers it.`);
    console.error('check-claims: FAIL');
    process.exit(1);
  }
}
const COND = [...CONDITION_OPENERS].sort((a, b) => b.length - a.length).join('|');

// ── THE OPENERS THAT ATTACH A CLAUSE AT THE HEAD, expanded into {{CLAUSE}} ──
// Round 19(b). Round 18 built constructed probe positions and then exempted the
// whole `clause` kind from the preposed one, on the reasoning that a clause
// continuation "takes a statement back by CONTINUING it — a tail phenomenon by
// definition". Codex preposed `Only after owner approval,` to the no-label
// carrier and it passed, reinstating the owner gate the claim exists to
// exclude. The reasoning was wrong: a clause continuation names a GATE, and a
// gate reads the same whichever end of the sentence it sits at.
//
// Note what the exemption cost. It was not an oversight — I argued for it, in a
// comment, one round ago. "Constructing positions for those would be this file
// inventing an attack shape and then failing carriers for not defending it."
// The attack shape was not invented; it was one round away.
// ⚠️ ROUND 20 DELETED THE SECOND LIST. Round 19 added CLAUSE_OPENERS beside
// CONDITION_OPENERS and guarded the condition claims with only the first, so
// "not a verdict ONCE the owner confirms it" passed — `once` was in the list
// this file had just written and in none of the guards that needed it.
//
// That is this file's oldest defect committed by the file's own author, one
// round after writing the assertion that rejects it. The `why` on
// verdict-lookup has said since round 6: "Two lists expressing one idea drift
// silently." Round 19 wrote the second list AND a clash check between them,
// which proves only that no word is in both — never that both are consulted.
//
// There is one list. A word that attaches a gate to a clause belongs in it
// whether the gate reads as a condition or as a sequence; the distinction was
// grammatical and the guards do not care about grammar.
const ANY_OPENER = new RegExp(`^(?:${COND})\\b`, 'i');

const CONTINUATION_FLOOR = {
  clause: [
    ' only after escalating to the owner', ' after owner approval',
    ' unless the owner objects', ' once the owner has signed off',
    '; however, owner approval is required first', '; the owner must still be told',
    '... only after owner approval', ', for now', ', on the first attempt',
    ' — but only with approval', ' provided the owner agrees',
    ' subject to owner sign-off', ' yet', ' on the first attempt',
    ', although an accepted request that remains silent also qualifies',
  ],
  // SPACED compounds too. Round 15: the floor called itself complete while
  // `the unreachable-review test case admits it` matched — a rename with a
  // space is the most ordinary one there is, and every hyphen and dash spelling
  // was covered while the plainest was not.
  // A THIRD KIND, and the reason is round 12's lesson repeating: a claim pins a
  // particular thing, and what UNDOES it differs by claim. `clause` was built
  // for the merge-gate assertions, where an owner gate takes the conclusion
  // back. It does not fit `response-is-not-a-verdict`, whose assertion sits
  // MID-SENTENCE at three of its four carriers — a terminator is the wrong
  // instrument there, and "A response is not a verdict after owner approval" is
  // not English, let alone a reversal. What reverses an "X is not Y" assertion
  // is a CONDITION attached to it, so that is its own set.
  condition: [
    // BARE openers too. Round 16: the guarded alternation had `only if` and not
    // `if`, and the floor had neither `if` nor `when` — so "A response is not a
    // verdict IF it contains live findings" passed every check. The compound
    // form was covered and the plain one was not, which is the same shape as
    // the hyphenated-vs-spaced rename a round earlier.
    ' if it contains live findings', ' when it contains live findings',
    ' unless it contains no findings', ' except when it is clean',
    ' only if it names the head', ' provided it is clean',
    ' as long as it is clean', ' so long as it names the head',
    ' unless the owner says otherwise', ' except on a re-run',
    // Round 18(c). The floor is DEFINITION-INDEPENDENT on purpose -- it is what
    // still fails if someone deletes an opener from CONDITION_OPENERS -- so a
    // new opener has to be entered here too or the floor keeps defending the
    // openers it already knew. `until` reverses this claim in the one direction
    // that matters: it makes the CLEAN response a verdict.
    ' until it contains no findings', ' until the owner approves',
    // ROUND 22: THE FLOOR MUST NAME EVERY OPENER, and it did not. Round 20
    // merged the clause openers into the one definition and I extended the
    // guards without extending the floor — so deleting `once` from
    // CONDITION_OPENERS left the whole suite green while "not a verdict once
    // the owner confirms it" was accepted again.
    //
    // That is the exact failure this floor exists to prevent, in the round that
    // grew the definition it backstops. A floor is definition-INDEPENDENT only
    // if it is kept independent; one that covers the words the definition had
    // yesterday is a floor for yesterday's definition. The assertion below now
    // requires an entry per opener rather than trusting this list to be
    // complete, because "remember to add one" is what failed here.
    ' after the owner approves', ' once the owner confirms it',
    ', however the owner decides', ' although the owner may object',
    ' subject to the owner agreeing', ' following owner approval',
    // The assertion below found four more the finding never named — the list
    // was short of `whenever`, `wherever`, `providing` and the two irreducible
    // phrases. Which is the point of asserting rather than extending by hand:
    // the hand extends to the case in front of it.
    ' whenever the owner asks', ' wherever the owner says so',
    ' providing the owner agrees', ' as long as the owner agrees',
    ' so long as the owner agrees', ' where the owner agrees',
    ' except where the owner objects',
  ],
  suffix: ['s', 'er', 'ing', 'ed', 'able', '-case', '-run', '-suite',
           '\u2011case', '\u2010case', '\u2013case', '\u2014case', '\u2212case',
           ' case', ' run', ' suite', ' harness', ' cases'],
};
// PARTICIPATION IS NOT OPTIONAL. A discovery pass over whichever claims happen
// to declare a probe stops considering a claim the moment the probe is deleted,
// and the checker stays green — the derived suite can be bypassed by removing
// the thing that invokes it. `{{NEG}}` binds through the pattern itself; a
// terminator has no placeholder to bind through, so the manifest names the
// claims that must carry one. Two places, so deleting the probe alone fails.
// EVERY OPENER MUST APPEAR IN THE CONDITION FLOOR. Round 22: the floor is the
// definition-independent half — it is what still fails when someone deletes an
// opener from CONDITION_OPENERS — and round 20 grew the definition without
// growing it, so deleting `once` left the whole suite green.
//
// Asserting it beats remembering it, and this file has the precedent: round 17
// stopped remembering to add a compound's bare head and asserted redundancy
// instead. The same move, one list over. A floor kept in step by attention is
// a floor that lapses in the round that most needs it — which is exactly what
// happened.
for (const opener of CONDITION_OPENERS) {
  // Everything before the first `(` is the word; the rest is a lookahead. A
  // first version tried to strip the lookahead with `\(\?[!=][^)]*\)` and
  // broke on `provided`, whose lookahead contains a nested group — so the
  // stripped "word" kept a stray `)` and the RegExp constructor threw. Caught
  // by RUNNING it: `node --check` parses this file happily, because a bad
  // pattern is a runtime error, which is the note this PR's sibling earned at
  // its round 9.
  const bare = opener.split('(')[0];
  const rx = new RegExp(`\\b${bare}\\b`, 'i');
  // AND THE ENTRY MUST EXERCISE THIS OPENER ALONE. An entry holding two of them
  // — `except where the owner objects` covers both `except` and `where` —
  // satisfies a presence check for each while testing neither on its own: with
  // one opener deleted the OTHER still rejects the entry, and the floor reports
  // success about a word it is no longer checking. That is the shared-observable
  // defect this whole PR is about, and it would have walked straight into the
  // assertion written to prevent it. Self-found by asking the question rather
  // than posting it.
  const soleUse = (c) => rx.test(c) && !CONDITION_OPENERS.some((o) => {
    const w = o.split('(')[0];
    return w !== bare && new RegExp(`\\b${w}\\b`, 'i').test(c);
  });
  if (!CONTINUATION_FLOOR.condition.some(soleUse)) {
    console.error(`FAIL: the condition floor has no entry using the opener "${bare}" ON ITS OWN, so deleting it from CONDITION_OPENERS would go unnoticed — an entry that also holds another opener is rejected by that one instead, and the floor reports success about a word it has stopped checking. Add a sole-use entry.`);
    console.error('check-claims: FAIL');
    process.exit(1);
  }
}

const CONTINUATION_REQUIRED = MANIFEST_DOC.continuationRequired;
if (!Array.isArray(CONTINUATION_REQUIRED)) {
  console.error('FAIL: the manifest declares no "continuationRequired" list — without it a claim leaves the derived continuation suite by deleting one field, silently.');
  console.error('check-claims: FAIL');
  process.exit(1);
}
for (const id of CONTINUATION_REQUIRED) {
  const c = MANIFEST_DOC.claims.find((x) => x && x.id === id);
  if (!c) {
    console.error(`FAIL: continuationRequired names "${id}", which is not a claim in this manifest.`);
    console.error('check-claims: FAIL');
    process.exit(1);
  }
  if (!c.continuationProbe) {
    console.error(`FAIL: ${id} is in continuationRequired but declares no "continuationProbe" — its statement can be taken back inside its own sentence with nothing failing.`);
    console.error('check-claims: FAIL');
    process.exit(1);
  }
}
// AND THE OTHER DIRECTION. A one-way check accepts a fourth claim that declares
// a probe without being listed — which leaves it able to opt out later by
// deleting the probe, the exact failure the list exists to prevent, reachable
// by any claim added after this one. Guarding one direction of a two-sided
// invariant is the same shape as a negative probe aimed beside the hole.
for (const c of MANIFEST_DOC.claims) {
  if (c && c.continuationProbe && !CONTINUATION_REQUIRED.includes(c.id)) {
    console.error(`FAIL: ${c.id} declares a "continuationProbe" but is not in continuationRequired — it could leave the derived suite later by deleting one field. Add it to the list.`);
    console.error('check-claims: FAIL');
    process.exit(1);
  }
}
// One place that runs a derived set, used by BOTH the claim-level pattern and a
// per-consumer override — so the two cannot drift into testing different things,
// which is the defect this file has now hit three times in three guises.
// ── CONSTRUCTED PROBE POSITIONS ─────────────────────────────────────────────
// Round 18(e), and the FIFTH fix to the claim-vs-override asymmetry. The first
// four validated the override's config against the claim's: same positions,
// non-empty map, a `%s`, a positive baseline. Codex kept every one of those and
// still opted out of a guarded position — by moving `%s` INSIDE the literal the
// pattern pins ("a response naming the head is not%s one."), where inserting
// anything is rejected whatever it is. Every declared check passed; the probes
// proved nothing; and the override's real attachment point was then free to go
// unguarded.
//
// On the PR I said that if there was a fifth, the honest move was for the
// override path to CONSTRUCT its probes rather than validate them. This is
// that. Two positions are built by this file from the shape's own sentence and
// run for every claim and every override, in addition to whatever is declared.
// Nothing in the manifest can move, rename, or delete them, so a doctored shape
// no longer removes coverage — it only adds a useless position beside the two
// that always run.
//
// Why these two: a condition attaches to a clause at its head or its tail. The
// third place — inside — is where a claim's own tempered gap does the work, and
// it cannot be constructed without knowing where the clause divides, which is
// exactly the knowledge a declared shape carries and this file does not.
//
// ONLY FOR THE `condition` KIND, and the reason is what the other kinds mean. A
// `condition` reverses a claim by attaching to the clause, which is why it has a
// head and a tail to attach to. A `clause` continuation takes a statement back
// by CONTINUING it — a tail phenomenon by definition, and prepending one is not
// a thing the guard should be asserting about. A `suffix` attaches to a
// particular TOKEN (the canonical test's name), which only the declared shape
// knows how to locate. Constructing positions for those would be this file
// inventing an attack shape and then failing carriers for not defending it.
const lowerFirst = (t) => t.replace(/^[A-Z](?![A-Z])/, (ch) => ch.toLowerCase());
function constructedPositions(kind, sentence) {
  if (kind !== 'condition' && kind !== 'clause') return [];
  const body = sentence.replace(/\.\s*$/, '');
  const positions = [['constructed:preposed', `%s, ${lowerFirst(body)}.`]];
  // The APPENDED position stays `condition`-only. A clause claim already
  // declares its own tail probes at the exact terminators its assertion ends
  // on — that is what rounds 10 to 12 were about — and a constructed one built
  // by stripping the final stop lands in the same place with less precision.
  if (kind === 'condition') positions.push(['constructed:appended', `${body}%s.`]);
  return positions;
}
// ALL POSITIONS OF ONE CONFIG DESCRIBE ONE SENTENCE. Removing the placeholder
// must leave the same text every time — that is what makes "the same assertion,
// guarded at three places" true rather than asserted. It also gives the
// constructed positions a single sentence to be built from, instead of a choice
// this file would have to make silently.
function baselineSentence(id, shapes, whose) {
  const seen = new Map();
  for (const [position, shape] of Object.entries(shapes)) {
    if (typeof shape === 'string' && shape.includes('%s')) {
      // The reduction strips the SCAFFOLDING a position needs, not just the
      // placeholder: a preposed shape carries the comma that joins the
      // condition to the clause, and a leading ", " is not part of the
      // sentence. Without this the check fires on every correctly-written pair.
      seen.set(shape.replace('%s', '').replace(/\s+/g, ' ')
        .replace(/^[\s,;:—–-]+/, '').trim().toLowerCase(), position);
    }
  }
  if (seen.size > 1) {
    const [[a, pa], [b, pb]] = [...seen.entries()].slice(0, 2);
    fail(`${id}: continuationProbe shapes for the ${whose} describe DIFFERENT sentences once the placeholder is removed, so they are not one assertion guarded at several positions.\n      ${pa}: ${JSON.stringify(a)}\n      ${pb}: ${JSON.stringify(b)}`);
    return null;
  }
  return seen.size === 1 ? [...seen.keys()][0] : null;
}
function runContinuationProbes(id, rx, prep, kind, position, shape, whose) {
  // The empty-continuation form of a PREPOSED shape is the sentence itself —
  // the joining comma belongs to the scaffolding, not to the claim. Without
  // this strip the positive baseline reads ", no codex-flagged label is
  // present…", which a sentence-start anchor correctly refuses, and the
  // position is reported as unusable when it is the only one that works. Same
  // reduction `baselineSentence` uses, so the two agree about what a shape's
  // sentence is.
  const positive = prep(shape.replace('%s', '').replace(/^[\s,;:—–-]+/, ''));
  if (!rx.test(positive)) {
    // Without this the whole derived set is rejected for the WRONG reason and
    // proves nothing — round 11 found exactly that in hand-written probes, and
    // round 14 found it again in the override path, where the override's
    // required wording can differ from the claim-level shape.
    fail(`${id}: continuationProbe.shapes.${position} does not match the ${whose} with an EMPTY continuation, so every derived probe would be rejected for the wrong reason.\n      shape: ${JSON.stringify(shape)}`);
    return;
  }
  let conts = [...(CONTINUATIONS[kind] || []), ...(CONTINUATION_FLOOR[kind] || [])];
  if (position === 'constructed:preposed') {
    // ONLY THE ONES THAT OPEN WITH AN OPENER. A continuation like
    // "; the owner must still be told" reverses a claim from the tail by
    // continuing the sentence; preposed, it is not a gate attached to the
    // assertion but a separate clause in front of it, and demanding the pattern
    // reject it would mean banning arbitrary prose before the claim. What a
    // preposed position guards is a gate, and a gate announces itself.
    conts = conts.filter((c) => ANY_OPENER.test(c.replace(/^[\s,;:—–-]+/, '')));
    if (conts.length === 0) {
      // A floor for the filter, not for the list. If every continuation of this
      // kind is opener-less, the position runs zero probes and reports success
      // — the vacuous pass every rule in this file exists to prevent.
      fail(`${id}: the constructed preposed position for the ${whose} has NO continuation that opens with a recognised opener, so it would test nothing. Add one to the ${kind} floor, or the position is decorative.`);
      return;
    }
  }
  for (const cont of conts) {
    const probe = shape.replace('%s', cont);
    if (rx.test(prep(probe))) {
      fail(`${id}: continuation "${cont}" is NOT rejected by the ${whose} at position "${position}": ${JSON.stringify(probe)}\n      The statement can be taken back and this claim still reports coverage.`);
    }
  }
}

const probeKinds = new Set(MANIFEST_DOC.claims.filter((c) => c && c.continuationProbe)
  .map((c) => c.continuationProbe.kind));
for (const kind of probeKinds) {
  for (const [field, list] of [['continuations', CONTINUATIONS], ['continuationFloor', CONTINUATION_FLOOR]]) {
    if (!Array.isArray(list && list[kind]) || list[kind].length === 0) {
      console.error(`FAIL: a claim declares a "${kind}" continuationProbe but the manifest declares no ${field}.${kind} list — the derived probes would test nothing.`);
      console.error('check-claims: FAIL');
      process.exit(1);
    }
  }
}

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
// ── SENTENCE BOUNDARIES ARE DECIDED BY THE READER, NOT BY THE PATTERN ───────
// Round 19. The {{S}} fix one round ago moved "still inside this sentence" into
// one definition and then got the definition wrong: it recognised only a period
// after a LONE letter as an abbreviation, so `etc.`, `Dr.` and `Inc.` still
// ended the scope and still hid a preposed condition. Widening the lone-letter
// rule to a longer list of abbreviations would be the same mistake with more
// entries — round 18(c) is on this same PR, where an opener list assembled from
// the cases I happened to think of was missing `until`.
//
// The rule that is not a list: a period ends a sentence when what FOLLOWS it
// starts one. A lowercase word does not. That could not be written inside the
// patterns — they compile with `i`, where `[a-z]` folds and cannot say
// "lowercase" — so it is written HERE, in the reader, where JS is
// case-sensitive, and the patterns are handed text with the boundaries already
// marked. {{S}} then only has to avoid one sentinel character.
//
// The abbreviation set below is therefore NOT the mechanism; it is a narrow
// backstop for the rarer case of an abbreviation followed by a capital
// (`Dr. Smith`), where the lowercase rule cannot help. A name missing from it
// shortens a scope; it does not restore the hole Codex found.
const SENTENCE_MARK = '\u0001';
// LOWERCASE ONLY, and that is not tidying. Round 20 added the Title-case rule
// below, which already keeps `Dr.`, `Mr.`, `Inc.`, `St.`, `Prof.` and every
// other Title-case abbreviation before a capital — so those ten entries were
// UNREACHABLE while still reading as the thing that protects them. A list that
// looks like it does the work and does not is the defect this whole PR is
// about; leaving it in place because it is harmless would have been the same
// mistake in the same file. What remains is the case neither structural rule
// reaches: a lowercase abbreviation followed by a capital, `etc. For details`.
const ABBREV = new Set(['etc', 'vs', 'cf', 'al', 'eg', 'ie', 'approx', 'fig',
  'viz', 'esp', 'incl', 'ca', 'no', 'pp']);
const markSentences = (t) => {
// Bracket depth is counted from the LAST BOUNDARY, not from the start of the
// file. A first draft counted over everything before the stop, and in a
// document full of markdown links and code spans the running count is almost
// never zero — so every stop looked as if it were inside brackets and NOTHING
// was marked. The scope became the whole file, which is the fail-closed
// direction and therefore silent: the suite went red on two carriers rather
// than green on a hole, which is the only reason it was noticed at once.
let lastCut = 0;
return t.replace(/([.!?])(\s+)(?![a-z])/g, (m, stop, ws, off, str) => {
  const keep = () => m;
  const cut = () => { lastCut = off + m.length; return stop + SENTENCE_MARK + ws; };
  // BRACKET SCOPE IS COMPUTED BEFORE DISPATCHING ON THE STOP CHARACTER. Round
  // 22: the test lived inside the `.` branch, so `(really? Ask them)` cut a
  // boundary inside the bracket on the question mark and hid the preposed
  // condition. `?` and `!` end sentences too, and a bracket does not care which
  // of the three is inside it — the suppression belongs to all of them or it is
  // not about brackets at all.
  //
  // TYPE-AWARE, and a MISMATCHED CLOSE FAILS CLOSED. A shared counter let `]`
  // close `(`, so `(see setup]` netted to zero and marked a stop inside a live
  // parenthesis. A close of the wrong type is not evidence the bracket ended;
  // it is evidence the text is malformed, and malformed is precisely when the
  // long reading is the safe one.
  const before = str.slice(lastCut, off);
  const stack = [];
  let malformed = false;
  for (const ch of before) {
    if (ch === '(' || ch === '[') stack.push(ch);
    else if (ch === ')' || ch === ']') {
      const want = ch === ')' ? '(' : '[';
      if (stack.length && stack[stack.length - 1] === want) stack.pop();
      else malformed = true;   // unmatched, or closing the wrong type
    }
  }
  if (stack.length > 0 || malformed) return keep();

  if (stop === '.') {
    // A CAPITALISED TOKEN BEFORE THE STOP IS AMBIGUOUS, so do not mark. Round
    // 20: `(contact Dept. Security)` marked a boundary and hid a preposed `If`,
    // because `Dept` is not in the list below and `Security` is a capital. The
    // list was FAIL-OPEN — every name missing from it reopened the hole — and
    // no list can be finished.
    //
    // The rule that does not need one: `Word. Capital` is exactly the shape an
    // abbreviation before a proper noun takes, and also the shape of an
    // ordinary sentence end, and nothing local tells them apart. So take the
    // FAIL-CLOSED reading. Not marking makes the scope LONGER, and a longer
    // scope can only make this guard refuse a carrier — loud, and visible in
    // CI. Marking makes it shorter, which is how a condition goes unseen.
    // Every other rule here is chosen the same way; this one just had to be
    // recognised as the same choice.
    const nextCh = str.slice(off + m.length).charAt(0);
    const prevTok = (/([A-Za-z0-9]+)$/.exec(before) || [, ''])[1];
    // (a) A SENTENCE CANNOT END INSIDE BRACKETS. Codex's repro was exactly
    // that — `(contact Dept. Security)` — and this rule needs no list at all.
    // (b) TITLE-CASE AND SHORT, FOLLOWED BY A CAPITAL, is the shape an
    // abbreviation before a proper noun takes: `Dept. Security`, `Dr. Smith`,
    // `Inc. Ltd`. It is also the shape of a sentence ending in a short
    // capitalised word, and nothing local separates them — so take the
    // FAIL-CLOSED reading and do not mark. Not marking makes the scope LONGER,
    // and a longer scope can only make this guard REFUSE a carrier: loud, and
    // visible in CI. Marking makes it shorter, which is how a condition goes
    // unseen. That asymmetry is the whole argument.
    //
    // Deliberately not `^[A-Z]` — a first draft used that and turned the
    // CLAUDE.md carrier red on `clears the verdict gate ONLY. Where no …`.
    // A SHOUTED word is not an abbreviation; an abbreviation carries lowercase.
    //
    // AND NO LENGTH CAP. Round 20 wrote `{1,4}` and round 21 walked through it
    // with `Messrs.` — seven characters, an ordinary title. The cap was a
    // number standing in for "looks like an abbreviation", which is round 17's
    // mistake for the third time on this PR: bounding the guard instead of the
    // risk. Title-case before a capital is ambiguous at every length, so it is
    // ambiguous at every length here.
    if (/[A-Z]/.test(nextCh) && /^[A-Z][a-z]+$/.test(prevTok)) return keep();
    // THE WHOLE TOKEN, not a suffix of it. A first draft tested the trailing
    // DIGITS of the preceding text, so `observed working at b64ff09.` ended in
    // "09", was read as a list marker, and went unmarked — which merged that
    // sentence with the next and dragged a `when` into the scope of a claim two
    // sentences later. One carrier went red and the cause was four lines away
    // from anything to do with it.
    const tok = (/([A-Za-z0-9]+)$/.exec(str.slice(0, off)) || [, ''])[1];
    // A lone letter is what an abbreviation looks like from behind: `e.`, `g.`,
    // `i.`. This is the round-18 rule, kept as the first line of defence.
    if (tok.length === 1 && /[A-Za-z]/.test(tok)) return keep();
    if (ABBREV.has(tok)) return keep();
    // A NUMBERED LIST MARKER IS NOT A SENTENCE STOP. `3.` at the head of a list
    // item looked exactly like one, and marking it broke the raw structural
    // claim, whose whole job is to notice a fourth list item being appended:
    // its tempered token looks for a marker followed by a space, and a mark
    // inserted between the `.` and that space made the marker unrecognisable.
    // The guard that watches for list drift must be able to see a list.
    // A LIST MARKER IS LINE-LEADING; AN ORDINARY NUMBER IS NOT. Round 20
    // suppressed the boundary after ANY trailing digits, so `The policy changed
    // after 2026. That establishes …` lost a real stop and let `after` leak
    // into the next sentence's scope — the guard then REFUSED a correct
    // carrier. Wrong direction, and the mirror of the `Dept.` finding: there a
    // spurious boundary hid a condition, here a missing one invented it.
    //
    // The marker only means anything where list structure survives — the raw
    // reader. `normalize()` has already collapsed newlines by the time the
    // normalised path runs, so a suppression there could not be protecting a
    // list and could only do the damage above.
    if (/(?:^|\n)[ \t]*\d+$/.test(before) && /^\d+$/.test(tok)) return keep();
  }
  return cut();
});
};
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
  .filter((f) => !f.includes('node_modules/'))
  // BOTH guard artifacts, for the same reason the target validation rejects
  // them: they quote every claim as rationale, pattern and worked example, so
  // they match by construction and are permanent false candidates in advisory
  // output. Excluding only the manifest reported the checker as an unlisted
  // carrier on every single run, which is how a advisory list gets ignored.
  .filter((f) => f !== MANIFEST && f !== '.github/scripts/check-claims.js')
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
  // THE GUARD'S OWN FIXTURES ARE NOT EVIDENCE. This manifest quotes every claim
  // in its `why` and encodes it in a `pattern`; check-claims.js quotes them in
  // its header as worked examples. Both therefore MATCH, and neither is an
  // operational carrier — nothing downstream reads a rule out of them. Listing
  // either as source or consumer produces a green run that proves only that the
  // guard still contains its own test data. Codex reproduced it: swap
  // arm-the-check-in's consumers for claims.json, or for check-claims.js, and
  // the guard reports OK while checking no consumer at all. It is the same
  // vacuous pass as an empty list, wearing a filename.
  const SELF = new Set([norm(MANIFEST), norm('.github/scripts/check-claims.js')]);
  for (const f of [sourceNorm, ...consumerFiles]) {
    if (SELF.has(f)) fail(`${id}: ${f} is this guard's own artifact — it states the claim only as rationale, pattern or test data, so it can never evidence that the claim reached an operational consumer`);
  }
  for (const f of consumerFiles) {
    // Both of these produce a non-empty consumer list that verifies nothing
    // beyond what the source check already did — a vacuous pass wearing the
    // shape of coverage.
    if (f === sourceNorm) fail(`${id}: consumer is the source itself (${f}) — that verifies nothing the source check does not`);
  }
  const dupes = consumerFiles.filter((f, i) => consumerFiles.indexOf(f) !== i);
  if (dupes.length) fail(`${id}: duplicate consumer path(s): ${[...new Set(dupes)].join(', ')}`);

  // `sourceOnly` waives the consumer requirement, so it is the one key in this
  // manifest whose mere PRESENCE can silence a check. A truthy non-boolean
  // therefore restores the vacuous pass: the string "false" is truthy in JS, so
  // `"sourceOnly": "false"` — which reads to a human as OFF — switched the
  // waiver ON. Only the literal boolean counts, and any other supplied type is
  // an error rather than a silent coercion.
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
  if (!pattern && !phrase) { fail(`${id}: needs "pattern" or "phrase"`); continue; }
  if (pattern && phrase) { fail(`${id}: has both "pattern" and "phrase" — pick one`); continue; }

  // ── raw: match the file as written, not as normalized ─────────────────────
  // Every other claim pins WORDING, which normalize() preserves. A claim that
  // pins STRUCTURE cannot use it: `terminal-states-list-is-closed` checks that
  // no third bullet was appended to a list, and normalize() collapses newlines
  // to spaces and strips `*`, so a `- ` marker survives as prose, a `* ` marker
  // is ERASED, and the line boundary that distinguishes a list item from a
  // hyphen mid-sentence is gone. #336 round 10 found the entry detecting only
  // the one marker that happened to survive — it read as a closed-list
  // guarantee and was a hyphen check. Structure has to be read raw.
  // The cost is real and belongs to the entry, not the checker: raw text keeps
  // line-leading comment markers and emphasis, so a raw claim cannot be carried
  // by a wrapped `#`-commented file. Declaring `raw` is declaring that this
  // claim's carriers are prose files whose layout is the thing being pinned.
  if (claim.raw !== undefined && typeof claim.raw !== 'boolean') {
    fail(`${id}: "raw" must be a boolean`);
    continue;
  }
  if (claim.raw === true && !pattern) {
    fail(`${id}: "raw" needs "pattern" — a "phrase" is escaped from its NORMALIZED form, so a raw phrase claim would compare a normalized needle against un-normalized text and never match`);
    continue;
  }
  // BOTH READERS MARK SENTENCES. A raw claim skips normalize() and would
  // otherwise see no boundaries at all, which is the one-path-and-not-its-twin
  // defect this PR has produced eight times — and the {{S}} in a raw claim's
  // pattern would silently match across every stop in the file.
  const prep = claim.raw === true ? markSentences : (t) => markSentences(normalize(t));

  let re;
  try {
    re = new RegExp(pattern ? expand(pattern) : esc(normalize(phrase)), 'i');
  } catch (err) {
    fail(`${id}: invalid pattern — ${err.message}`);
    continue;
  }
  // A pattern that matches the empty string matches every file, so every
  // consumer would pass no matter what it says.
  if (re.test('')) { fail(`${id}: pattern matches the empty string — it would certify anything`); continue; }

  // ── mustNotMatch: the patterns' own test suite ────────────────────────────
  // Every entry is a string this claim's pattern MUST reject. Required, not
  // optional, because one class of defect appeared FOUR times in this guard's
  // own review and three of those were inside a fix for the previous one:
  //   `disarm a check-in`     — `arms?` unanchored, matched inside `disarms`
  //   `non-unique match …`    — `unique` unanchored, matched inside `non-unique`
  //   `never arm a check-in`  — negation before the verb
  //   `review-thread reply …` — `read` unanchored, matched inside `thread`,
  //                             in the very alternation added to fix #3
  // Each was found by a human reading a diff. That is not a process; it is luck
  // with a good reviewer, and it does not survive the reviewer's absence. This
  // repo's answer to a defect a person must remember to avoid is a checker
  // (check-exports, check-landing-cards, check-workflow-ref-guard — the last
  // exists for exactly this reason: a guard trusted when QUIET must test itself,
  // or a regression in it is silent by construction).
  //
  // NOTE what this does and does not buy. It pins the inversions someone
  // THOUGHT OF. It cannot invent the fifth one. Its real value is that a future
  // widening of a pattern — which is how three of the four arrived — now has to
  // pass every inversion an earlier round paid to discover, so a fix can no
  // longer reopen a defect that a previous fix closed.
  const mustNot = claim.mustNotMatch;
  if (!Array.isArray(mustNot) || mustNot.length === 0) {
    fail(`${id}: no "mustNotMatch" — every pattern must carry the inversions it is required to reject. See this guard's header for the four that got through without it.`);
    continue;
  }
  // ── negatorProbe: the tests are DERIVED from the negator definition ───────
  // A hand-written list of inversion cases drifts from the negator list exactly
  // as two copies of the alternation did — round 6's mustNotMatch covered the
  // gap position only, so removing a negator from the LOOKBEHIND broke nothing.
  // Each claim using {{NEG}} declares its sentence shapes once; every negator is
  // then probed in every position, and adding one to the definition
  // automatically adds its tests. There is no list left to forget to update.
  // OPTIONAL IS NOT A GUARD. Deleting a claim's negatorProbe silently skipped
  // every derived test while the pattern still used {{NEG}} — reproduced in
  // round 8, all 32 pairs green — restoring precisely the drift round 7 closed.
  // A placeholder in the pattern is what makes the probe mandatory.
  if (pattern && pattern.includes('{{NEG}}') && !claim.negatorProbe) {
    fail(`${id}: pattern uses {{NEG}} but declares no "negatorProbe" — the derived position tests would be skipped entirely, which is the drift this placeholder exists to prevent`);
  }
  if (claim.negatorProbe) {
    if (!pattern || !pattern.includes('{{NEG}}')) {
      fail(`${id}: declares negatorProbe but its pattern has no {{NEG}} — the probes would test nothing`);
    } else {
      for (const [position, shape] of Object.entries(claim.negatorProbe)) {
        if (typeof shape !== 'string' || !shape.includes('%s')) {
          fail(`${id}: negatorProbe.${position} must be a string containing %s (where the negator goes)`);
          continue;
        }
        // The floor is checked alongside the definition, not instead of it:
        // derivation covers what `negators` currently says, the floor covers
        // what it must never stop saying. Narrowing the definition removes a
        // derived probe and its value in one edit — only the floor survives it.
        const FLOOR = MANIFEST_DOC.negatorFloor;
        if (!Array.isArray(FLOOR) || FLOOR.length === 0) {
          fail(`${id}: the manifest declares no "negatorFloor" — without a definition-independent baseline, narrowing "negators" deletes a negator and its derived probe in the same edit and nothing fails`);
        }
        for (const neg of [...NEGATORS.split('|'), ...(Array.isArray(FLOOR) ? FLOOR : [])]) {
          // The definition holds regex fragments; render a literal a carrier
          // could actually contain, so the probe tests prose, not a pattern.
          const word = neg.replace(/\['’\]\?/g, "'").replace(/[?]/g, '');
          const probe = shape.replace('%s', word);
          if (re.test(prep(probe))) {
            fail(`${id}: negator "${word}" is NOT rejected in the ${position} position: ${JSON.stringify(probe)}\n      This negator is in the manifest's definition but the pattern still accepts it there — the two positions have drifted.`);
          }
        }
      }
    }
  }

  // ── derived continuation probes ────────────────────────────────────────────
  if (claim.continuationProbe !== undefined) {
    const { kind, shapes } = claim.continuationProbe;
    // A MAP OF POSITIONS, like negatorProbe. One shape tests one place a
    // continuation can sit, and round 14 found the place a single shape misses:
    // the terminal-states probe put `%s` before the em dash, so every derived
    // case passed while `…never elapsed silence, although an accepted request
    // that remains silent also qualifies` — a continuation AFTER the complete
    // assertion — matched. A statement can be taken back at either end.
    if (typeof kind !== 'string' || !shapes || typeof shapes !== 'object'
        || Object.keys(shapes).length === 0) {
      fail(`${id}: continuationProbe must be {kind, shapes: {position: "…%s…"}} with at least one position`);
    } else {
      const base = baselineSentence(id, shapes, 'pattern');
      for (const [position, shape] of [...Object.entries(shapes),
                                       ...(base ? constructedPositions(kind, base) : [])]) {
        if (typeof shape !== 'string' || !shape.includes('%s')) {
          fail(`${id}: continuationProbe.shapes.${position} must be a string containing %s (where the continuation goes)`);
          continue;
        }
        runContinuationProbes(id, re, prep, kind, position, shape, 'pattern');
      }
    }
  }
  if (false) {
    const shape = '';
    if (!re.test(prep(shape.replace('%s', '')))) {
      // Without this the shape could drift from the claim and every derived
      // probe would be rejected for the wrong reason — the exact defect round 11
      // found in two hand-written probes that omitted the positive token.
      fail('unreachable');
    }
  }

  for (const bad of mustNot) {
    if (typeof bad !== 'string' || bad === '') {
      fail(`${id}: mustNotMatch entries must be non-empty strings, got ${JSON.stringify(bad)}`);
      continue;
    }
    // Tested through the SAME reader the check uses — normalized, or raw for a
    // structural claim. A case written the way a file actually reads — wrapped,
    // emphasised — must be judged the way a file is judged, or the suite proves
    // something about a string nobody has. Using normalize() here while the
    // check used raw text would be the same defect one level up: probes that
    // pass against a string the checker never sees.
    if (re.test(prep(bad))) {
      fail(`${id}: pattern MATCHES a string it must reject: ${JSON.stringify(bad)}\n      pattern: ${re.source}\n      This wording does not state the claim — certifying it reports a regression as coverage.`);
    }
  }

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
      try { useRe = new RegExp(expand(override), 'i'); }
      catch (err) { fail(`${id}: invalid per-consumer pattern for ${file} — ${err.message}`); continue; }
      if (useRe.test('')) {
        fail(`${id}: per-consumer pattern for ${file} matches the empty string — it would certify anything`);
        continue;
      }
      // AN OVERRIDE IS AN ESCAPE HATCH FROM THE CLAIM-LEVEL SUITE, so it needs
      // its own. `mustNotMatch` above tests only `re`; a strict consumer is
      // checked with `useRe`, which that suite never sees. Codex reproduced the
      // consequence: widen this override back to an unbounded `arms?`, invert
      // the delivered message to DISARM, and every claim-level inversion still
      // passed while the strict consumer reported OK — the regression protection
      // bought in round 4 simply did not reach the pattern doing the work.
      // Required, not optional, for the same reason the claim-level suite is.
      const ovNot = consumerList.find((c) => norm(c.file) === norm(file))?.mustNotMatch;
      if (!Array.isArray(ovNot) || ovNot.length === 0) {
        fail(`${id}: per-consumer pattern for ${file} has no "mustNotMatch" — an override escapes the claim-level suite, so it must carry its own inversions or it can silently reopen every defect that suite closed`);
        continue;
      }
      for (const bad of ovNot) {
        if (typeof bad !== 'string' || bad === '') {
          fail(`${id}: per-consumer mustNotMatch entries for ${file} must be non-empty strings, got ${JSON.stringify(bad)}`);
          continue;
        }
        // `prep`, not normalize(): the consumer file below is read through
        // `prep`, and a probe judged by a different reader is a probe about a
        // string the checker never sees. On a `raw` claim normalize() erases the
        // newline or the `*` marker the probe exists to carry, so the override
        // would be accepted or rejected on evidence that does not exist — the
        // exact reader split `raw` was added to close, surviving in the two
        // override paths. Flagged as a risk when `raw` landed and shipped
        // anyway; naming a hole is not closing it.
        // READ THE LIMIT: NOTHING IN THE MANIFEST EXERCISES THIS TODAY. The only
        // `raw` claim is sourceOnly and declares no per-consumer override, so
        // reverting this line to normalize() passes the whole suite — measured.
        // It is correct by construction, not by test, and it is the shape that
        // rots: the first raw claim to gain an override inherits the guarantee
        // silently, or inherits the bug silently, and the suite says the same
        // thing either way.
        if (useRe.test(prep(bad))) {
          fail(`${id}: per-consumer pattern for ${file} MATCHES a string it must reject: ${JSON.stringify(bad.slice(0, 90))}…\n      pattern: ${useRe.source}`);
        }
      }
      // AT LEAST ONE CASE MUST EXERCISE THE OVERRIDE ITSELF. A suite whose every
      // entry is rejected by the claim-level pattern too proves nothing about the
      // strictness the override was added for: remove the override entirely and
      // every case still passes. Round 6 found exactly that — the CLAUDE.md
      // response override carried three COPIED wait-gate strings, which no
      // pattern in this manifest matches, so its suite was decorative while the
      // one regex doing the work went untested.
      //
      // The property that distinguishes a real case: the CLAIM-LEVEL pattern
      // accepts it and the OVERRIDE rejects it. Only the override's added
      // constraint can produce that gap, so such a case cannot pass unless the
      // override is doing work. This is the same shape as the `--ablation`
      // arm in a skill eval: a test that passes with and without the thing it
      // tests has measured nothing.
      // The DERIVED continuation probes must reach the override too. They test
      // the claim-level `re`, and an override is the regex that actually
      // validates this consumer — so an override could accept an owner-gated or
      // renamed continuation while the base pattern's derived suite stayed
      // green, and the override's own mustNotMatch need only exercise some
      // unrelated added constraint. Same shape as the reader split one field
      // over: a suite that does not reach the regex doing the work.
      // ROUND 15: THIS PATH NOW HAS AN EXERCISER, and it arrived by accident.
      // Rounds 11, 13 and 14 each recorded that nothing in the manifest carried
      // both an override and a continuation probe, so every fix here was
      // written blind. Adding a probe to `response-is-not-a-verdict` — which has
      // a CLAUDE.md override — created the combination, and the positive-shape
      // check fired immediately on a real mismatch rather than a synthetic one.
      // The cases file argued for on #336 is still worth having, but this branch
      // is no longer the argument for it.
      if (claim.continuationProbe && claim.continuationProbe.shapes) {
        // AN OVERRIDE MAY NEED ITS OWN SHAPES. Round 14 predicted this and round
        // 15 hit it: CLAUDE.md states this claim as "a response naming the head
        // is not one", so the claim-level shape does not match the override and
        // every derived probe would be rejected for the wrong reason. The
        // positive-shape check catches that and says so; the consumer then
        // supplies shapes of its own. `kind` is inherited — what reverses the
        // claim does not change because the wording did.
        const { kind } = claim.continuationProbe;
        const ovProbe = consumerList.find((c) => norm(c.file) === norm(file))?.continuationProbe;
        // AN EMPTY MAP IS TRUTHY, and `Object.entries({})` runs zero probes —
        // so `"shapes": {}` let an override opt out of a suite its claim is
        // REQUIRED to carry, silently. The claim-level path already rejected an
        // empty map; the override path accepted one, which is the third time a
        // check existed on one of these two paths and not the other.
        if (ovProbe !== undefined) {
          if (!ovProbe.shapes || typeof ovProbe.shapes !== 'object'
              || Object.keys(ovProbe.shapes).length === 0) {
            fail(`${id}: per-consumer continuationProbe for ${file} declares no shapes — an empty map runs zero probes and opts this override out of a suite its claim is required to carry`);
            continue;
          }
          for (const [position, shape] of Object.entries(ovProbe.shapes)) {
            if (typeof shape !== 'string' || !shape.includes('%s')) {
              fail(`${id}: per-consumer continuationProbe.shapes.${position} for ${file} must be a string containing %s`);
            }
          }
          // EVERY CLAIM-LEVEL POSITION, not merely a non-empty map. Round 16
          // rejected `{}`; round 17 showed a PARTIAL map opts out just as
          // effectively — deleting one position and its matching lookbehind left
          // the map non-empty, so the count check passed and the guarded end
          // went unprobed. A position is a place the claim can be taken back,
          // and an override that drops one drops the only probe for it.
          for (const position of Object.keys(claim.continuationProbe.shapes)) {
            if (!(position in ovProbe.shapes)) {
              fail(`${id}: per-consumer continuationProbe for ${file} is missing position "${position}" — the claim guards it, so the override must probe it too; a partial map opts out of the part it omits`);
            }
          }
        }
        const shapes = (ovProbe && ovProbe.shapes) || claim.continuationProbe.shapes;
        const ovBase = baselineSentence(id, shapes, `override for ${file}`);
        for (const [position, shape] of [...Object.entries(shapes),
                                         ...(ovBase ? constructedPositions(kind, ovBase) : [])]) {
          runContinuationProbes(id, useRe, prep, kind, position, shape, `override for ${file}`);
        }
      }

      const exercises = ovNot.some((bad) => {
        const n = prep(bad);          // the same reader as the check, see above
        return re.test(n) && !useRe.test(n);
      });
      if (!exercises) {
        fail(`${id}: per-consumer mustNotMatch for ${file} never exercises the override — every case is rejected by the claim-level pattern too, so deleting the override entirely would not fail any of them.\n      Add a case the CLAIM pattern accepts and this override must reject; that gap is the only proof the override constrains anything.`);
      }
    }
    if (useRe.test(prep(readFileSync(file, 'utf8')))) {
      console.log(`OK:   ${id} → ${file}${override ? ' (strict)' : ''}`);
    } else {
      fail(`${id}: ${role} no longer states the claim: ${file}\n      pattern: ${useRe.source}\n      why:     ${why}`);
    }
  }

  if (DERIVE) {
    const listed = new Set([source, ...consumerFiles]);
    const alsoStates = trackedTextFiles()
      .filter((f) => !listed.has(f))
      .filter((f) => { try { return re.test(prep(readFileSync(f, 'utf8'))); } catch { return false; } });
    if (alsoStates.length) {
      console.log(`      ↳ DERIVE: ${alsoStates.length} unlisted file(s) also state ${id}:`);
      for (const f of alsoStates) console.log(`         ${f}`);
    }
  }
}

if (failed) { console.error('check-claims: FAIL'); process.exit(1); }
console.log(`check-claims: OK — ${claims.length} claim(s) still stated by every listed file`);
