#!/usr/bin/env node
/**
 * Guard check-claims.js — the canonical-claim guard.
 *
 * WHY IT EXISTS. #342 measured two of the old guard's override checks fail-open:
 * forcing `exercises` true, and never invoking the override probe loop, each
 * left the whole suite green. Both checks ran on every real run and both could
 * have been deleted with no signal. That is the fail-open family (#323) — a pass
 * and a did-not-look produce identical output.
 *
 * #341 then replaced the guard's core: lexical condition-detection is gone, and
 * a claim now pins the exact phrasings that count as stating it. The checks are
 * different, so the cases are different, but the reason for having them is not.
 *
 * WHAT THIS DRIVES. check-claims.js has no exports and resolves MANIFEST
 * relative to cwd, so each case writes a synthetic manifest and carrier files
 * into a temp directory and runs the REAL script there as a subprocess. That is
 * the shipped CLI contract, which is also what qa.yml runs.
 *
 * A case asserts BOTH the exit code and a needle from the diagnostic. Exit code
 * alone is not enough — #344's suite had a case that reddened on the unmutated
 * guard AND on the mutant, passing for a reason it was not about, and #345 had
 * two more of the same shape. A crash is rejected outright: a stack trace is not
 * a catch.
 *
 * MEASURED 2026-09-01. Mutations applied to the guard via CHECK_CLAIMS_BIN, and
 * the cases that reddened for each:
 *
 *   A  containment check neutered (a phrasing may sit inside a rejection)
 *      -> "a phrasing contained in a mustNotMatch is refused"
 *   B  matching made case-INsensitive (the old `i` flag)
 *      -> "case distinguishes a claim from its capitalised negation"
 *      -> "case distinguishes an authoritative copy from a weaker one"
 *   C  empty-phrasing rejection removed
 *      -> "an empty phrasing is refused, never a wildcard"
 *   D  the mustNotMatch requirement removed
 *      -> "a claim with no mustNotMatch is refused"
 *   E  `sourceOnly` accepted as truthy rather than boolean
 *      -> "sourceOnly must be a literal boolean"
 *   G  the shadowed-phrasing check neutered
 *      -> "a phrasing CONTAINED IN another is refused as dead coverage"
 *   H  the duplicate-phrasing check neutered
 *      -> "an exactly duplicated phrasing is refused"
 *   I  clause marks counted as terminators again ('.,:;!?')
 *      -> "the run counts a comma-stopping phrasing as OPEN, not terminated"
 *   J  the excluded-artifact count line removed
 *      -> "the run PRINTS what each excluded guard artifact contains"
 *   K  the --derive artifact exclusion removed
 *      -> both "--derive excludes the guard's own …" cases
 *   L  a plain `Error` thrown after a diagnostic (the HARNESS's own contract)
 *      -> every negative-path case, via the stack-frame check
 *   M  the consumer `file` validation removed
 *      -> all three malformed-consumer cases
 *   N  the CHECKER dropped from GUARD_ARTIFACTS (the one member no case reached)
 *      -> both "…own CHECKER…" cases, target-validation and derive
 *   P  `throw 'boom'` — a PRIMITIVE, which prints no stack frame at all
 *      -> every negative-path case, via the terminal-summary check
 *   Q  the terminator classified on the RAW phrasing instead of the normalised one
 *      -> "a terminator inside markdown emphasis still counts as closed"
 *   R1 the failing path prints `check-claims: OK` while still exiting 1
 *      -> every negative-path case (the summary must AGREE with the exit)
 *   R2 a raw `pattern` accepted as a non-string and coerced by RegExp
 *      -> "a raw \"pattern\" that is not a string is refused, not coerced"
 *   R3 only GUARD_ARTIFACTS[0] reported in the excluded-artifact line
 *      -> "the run PRINTS what each excluded guard artifact contains"
 *   R4 the per-consumer `pattern` (or `mustNotMatch`) refusal dropped
 *      -> that field's own override case; the other two stay green
 *   R5 `!` or `?` removed from SENTENCE_END
 *      -> that mark's own closed-count case
 *   S1 `:` or `;` ADDED to SENTENCE_END
 *      -> that mark's own open-count case
 *   S2 a comment marker dropped from normalize()'s alternation
 *      -> that marker's own wrapping case
 *   S2b `_` dropped from the emphasis class -> the underscore case
 *   S2c whitespace collapsed per-line instead of across the file
 *      -> all four wrapping cases
 *   S3 the raw `mustNotMatch` rejection disabled
 *      -> "a raw pattern that MATCHES its own mustNotMatch is refused"
 *   S4 the CONSUMER read's try/catch removed
 *      -> both missing-consumer cases
 *   F  a comment reworded (control) -> nothing reddens
 *
 * The normalisation cases had to be rewritten before they discriminated: with
 * the marker merely PRECEDING the phrase, every mutant stayed green, because a
 * leading marker leaves the phrase a substring either way. The marker has to
 * land INSIDE the phrase — which is the measured failure the rule exists for.
 *
 * G-K were added on #346 round 6 and each reddens EXACTLY ONE case (K, two),
 * with no collateral — so each names a behaviour nothing else here covers.
 *
 * B is the load-bearing one. Case-sensitivity is the whole of rule 1 in the
 * guard's header, it is what makes negation and delivered-vs-header work without
 * inference, and nothing else in this repo would notice if it were dropped.
 *
 * Two things this table records because measuring produced them rather than
 * confirming them. B originally reddened only ONE of its two cases: the
 * authoritative-copy fixture wrote "arms a check-in" in the weaker copy, and the
 * trailing `s` distinguished it without any help from case — a case whose name
 * promised case-sensitivity and did not test it. The fixture now differs in case
 * alone. And C and E redden on the NEEDLE, not the exit code: the mutated guard
 * still exits 1 for an unrelated reason, so an exit-code-only assertion would
 * have called both of them caught while they checked nothing.
 */

import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve } from 'path';

// Points the suite at a MUTATED copy of the guard, so "these cases discriminate"
// is re-provable rather than a claim made once in a commit message.
const SCRIPT = resolve(process.env.CHECK_CLAIMS_BIN || '.github/scripts/check-claims.js');

const PASS = [];
const FAIL = [];

function run(root, args = []) {
  try {
    const out = execFileSync('node', [SCRIPT, ...args], { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status === undefined ? -1 : err.status, out: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

/**
 * files: { path: contents }. manifest: the claims.json object.
 */
function build(manifest, files) {
  const root = mkdtempSync(join(tmpdir(), 'claims-cases-'));
  mkdirSync(join(root, '.github/scripts'), { recursive: true });
  writeFileSync(join(root, '.github/scripts/claims.json'), JSON.stringify(manifest, null, 2));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
}

function testCase(name, { manifest, files, expectExit, needle, absent, args = [], git = false }) {
  const root = build(manifest, files);
  // --derive enumerates via `git ls-files`, so a case exercising it needs a real
  // repository with the fixtures TRACKED. Without this the scan returns nothing
  // and the case passes for the wrong reason.
  if (git) {
    const q = { cwd: root, stdio: 'ignore' };
    execFileSync('git', ['init', '-q'], q);
    execFileSync('git', ['add', '-A'], q);
  }
  const { code, out } = run(root, args);
  rmSync(root, { recursive: true, force: true });

  const problems = [];
  // THE GUARD'S OWN TERMINAL SUMMARY — a contract it keeps, NOT a pattern a
  // crash makes. Two attempts to recognise a crash by its shape each missed one,
  // in consecutive rounds: a list of four error NAMES let a plain `Error`
  // through (#346 round 7), and a V8 stack frame let `throw 'boom'` through,
  // because a primitive throw prints a source excerpt and no frame at all
  // (round 8). Both mutants exited 1 with the expected needle already printed,
  // so every negative-path case reported OK against a dead process — the exact
  // fail-open the harness exists to find, twice, inside its own fix.
  //
  // Guessing at the shape of failure was the wrong direction. Every exit path in
  // check-claims.js prints `check-claims: OK` or `check-claims: FAIL`
  // immediately before terminating, so the ABSENCE of that line means the run
  // did not reach its own end — whatever was thrown, whether or not it printed,
  // and however Node chooses to report it in some later version.
  const summaries = [...out.matchAll(/^check-claims: (OK|FAIL)/gm)];
  if (!summaries.length) {
    problems.push('the guard never reached its terminal summary — it died mid-run, so the exit code and the needle prove nothing');
  } else {
    // AND IT MUST AGREE WITH THE EXIT. Accepting either word made the check a
    // liveness test only: changing the failing path to print `check-claims: OK`
    // while still exiting 1 left all 59 cases green, so the harness would certify
    // a guard whose human-facing verdict contradicts its own exit code — and the
    // verdict is what a person reads in a CI log. Codex, #346 round 9.
    // Compared against the ACTUAL exit code rather than the expected one, so this
    // stays an invariant of the guard and not a restatement of the case.
    const want = code === 0 ? 'OK' : 'FAIL';
    const got = summaries[summaries.length - 1][1];
    if (got !== want) {
      problems.push(`the terminal summary says ${got} but the run exited ${code} — the verdict a reader sees contradicts the one CI acts on`);
    }
  }
  if (code !== expectExit) problems.push(`expected exit ${expectExit}, got ${code}`);
  if (needle && !out.includes(needle)) problems.push(`expected ${JSON.stringify(needle)} in the output`);
  // A case whose NAME promises an absence must assert that absence. Two of the
  // --derive cases below originally asserted only "check-claims: OK", which any
  // green run satisfies — they were named for a property they did not test, the
  // third decorative case caught in three PRs.
  if (absent && out.includes(absent)) problems.push(`expected ${JSON.stringify(absent)} to be ABSENT from the output`);

  if (problems.length) {
    FAIL.push(name);
    console.log(`FAIL: ${name} (exit ${code})`);
    for (const p of problems) console.log(`        ${p}`);
    for (const line of out.trim().split('\n').slice(0, 6)) console.log(`      | ${line}`);
  } else {
    PASS.push(name);
    console.log(`OK:   ${name} (exit ${code})`);
  }
}

// A minimal well-formed claim, cloned and perturbed per case.
const claim = (over = {}) => ({
  id: 'demo',
  why: 'why this claim is pinned',
  source: 'directives/src.md',
  phrasings: ['so check the comments AND the review threads'],
  consumers: ['docs/consumer.md'],
  mustNotMatch: ['so never check the comments AND the review threads'],
  ...over,
});
const manifest = (claims) => ({ _comment: 'test fixture', claims });

const SRC = 'Which form arrives is not predictable, so check the comments AND the review threads.\n';
const CONS = 'Per the source: so check the comments AND the review threads before merging.\n';
const FILES = { 'directives/src.md': SRC, 'docs/consumer.md': CONS };

// ── the shipped shape, and the two failures it must report ─────────────────
testCase('a well-formed claim stated by both files passes', {
  manifest: manifest([claim()]), files: FILES, expectExit: 0,
  needle: 'check-claims: OK',
});

testCase('a consumer that dropped the claim is refused', {
  manifest: manifest([claim()]),
  files: { ...FILES, 'docs/consumer.md': 'Per the source: check the comments.\n' },
  expectExit: 1, needle: 'consumer no longer states the claim',
});

testCase('a SOURCE that dropped the claim is refused', {
  manifest: manifest([claim()]),
  files: { ...FILES, 'directives/src.md': 'Which form arrives is not predictable.\n' },
  expectExit: 1, needle: 'the SOURCE no longer states the claim',
});

// ── rule 2: a phrasing may not sit inside a string the claim rejects ───────
testCase('a phrasing contained in a mustNotMatch is refused', {
  manifest: manifest([claim({
    phrasings: ['check the comments AND the review threads'],   // no connector
    mustNotMatch: ['so never check the comments AND the review threads'],
  })]),
  files: FILES, expectExit: 1,
  needle: 'is contained in a string this claim must REJECT',
});

testCase('…and the connector that excludes it is accepted', {
  manifest: manifest([claim()]), files: FILES, expectExit: 0,
  needle: 'check-claims: OK',
});

// ── the NORMALISATION contract: every alternative, one case each ──────────
// Literal matching rests entirely on normalize(), and its three rules name six
// alternatives between them. Every fixture in this suite used unformatted,
// unwrapped prose, so five of the six were never exercised: mutants dropping
// `//`, dropping `--`, and dropping `_` from the emphasis class each left the
// real manifest AND all 65 cases green. Each rule is in normalize() because a
// measured false failure put it there (see the guard's header), so a rule that
// can silently disappear is one of those failures waiting to return.
// Codex, #346 round 10.
//
// The phrasing is plain in every case; only the CARRIER is decorated, which is
// the direction that matters — a manifest author pastes text as written and the
// carrier is whatever the repo happens to contain.
const PHRASE = 'so check the comments AND the review threads';

// THE MARKER MUST LAND INSIDE THE PHRASE, or the case proves nothing. A marker
// merely PRECEDING the phrase leaves it a substring either way — written that
// way first, and all three mutants stayed green. Stripping only matters where
// the claim WRAPS inside a commented block and the marker collapses into the
// middle of it, which is the measured failure the rule exists for: the guard's
// first manifest could not see codex-monitor.yml at all.
for (const marker of ['#', '//', '--']) {
  testCase(`a claim WRAPPING inside a "${marker}" comment block still matches`, {
    manifest: manifest([claim()]),
    files: { ...FILES, 'docs/consumer.md': `${marker} so check the comments AND the\n${marker} review threads before merging.\n` },
    expectExit: 0, needle: 'check-claims: OK',
  });
}

// Same requirement: emphasis WITHIN the phrase, not around it.
for (const [name, wrap] of [['asterisk', '**'], ['underscore', '_'], ['backtick', '`']]) {
  testCase(`a carrier with ${name} emphasis inside the claim still matches`, {
    manifest: manifest([claim()]),
    files: { ...FILES, 'docs/consumer.md': `Per the source: so check the ${wrap}comments${wrap} AND the review threads before merging.\n` },
    expectExit: 0, needle: 'check-claims: OK',
  });
}

testCase('a carrier whose claim WRAPS across lines still matches', {
  // Round 30 of #294 wasted a cycle on this: `grep -c` reported 0 for three
  // files that did contain the phrase, because it wrapped. Whitespace is
  // collapsed across the whole file for that reason, and nothing tested it.
  manifest: manifest([claim()]),
  files: { ...FILES, 'docs/consumer.md': 'Per the source: so check the comments\n  AND the review\n  threads before merging.\n' },
  expectExit: 0, needle: 'check-claims: OK',
});

testCase('…and a comment marker mid-line is NOT stripped', {
  // The rule is line-LEADING only, and a rule that strips a marker anywhere
  // would quietly rewrite carriers. The discriminator for the three cases above.
  manifest: manifest([claim()]),
  files: { ...FILES, 'docs/consumer.md': `Per the source: so check the # comments AND the review threads\n` },
  expectExit: 1, needle: 'consumer no longer states the claim',
});

// ── rule 1: case-sensitivity, which nothing else in the repo would notice ──
testCase('case distinguishes a claim from its capitalised negation', {
  manifest: manifest([claim({
    phrasings: ['Check the comments AND the review threads'],
    mustNotMatch: ['Never check the comments AND the review threads'],
  })]),
  files: {
    'directives/src.md': 'Check the comments AND the review threads.\n',
    // The consumer NEGATES it. Under case-insensitive matching the phrasing
    // matches inside "Never check …" and this passes — the exact hole #341
    // found by inverting a real carrier.
    'docs/consumer.md': 'Never check the comments AND the review threads.\n',
  },
  expectExit: 1, needle: 'consumer no longer states the claim',
});

testCase('case distinguishes an authoritative copy from a weaker one', {
  // wait-gate.sh's real shape: the rule appears in an explanatory comment AND in
  // the message the hook delivers. Only the delivered form is pinned.
  manifest: manifest([claim({
    phrasings: ['ARM A CHECK-IN ALONGSIDE IT'],
    mustNotMatch: ['never arm a check-in alongside it'],
    consumers: ['scripts/gate.sh'],
  })]),
  files: {
    'directives/src.md': 'The rule: ARM A CHECK-IN ALONGSIDE IT.\n',
    // The comment and the delivered message differ ONLY in case here, on
    // purpose: an earlier draft wrote "arms a check-in" in the comment, which
    // the trailing `s` already distinguished — so the case reddened under a
    // case-insensitive mutant for the wrong reason, and its name promised
    // something it did not test.
    'scripts/gate.sh': "# the hook will arm a check-in alongside it via send_later\necho 'BLOCKED: rely on the wake alone.'\n",
  },
  expectExit: 1, needle: 'consumer no longer states the claim',
});

// ── the vacuous-pass family: every way an entry can check nothing ──────────
testCase('an empty phrasing is refused, never a wildcard', {
  manifest: manifest([claim({ phrasings: [''] })]), files: FILES,
  expectExit: 1, needle: 'every phrasing must be a non-empty string',
});

testCase('an empty phrasings array is refused', {
  manifest: manifest([claim({ phrasings: [] })]), files: FILES,
  expectExit: 1, needle: 'needs a non-empty "phrasings" array',
});

testCase('a claim with no mustNotMatch is refused', {
  manifest: manifest([claim({ mustNotMatch: [] })]), files: FILES,
  expectExit: 1, needle: 'no "mustNotMatch"',
});

testCase('a claim with no consumers and no sourceOnly is refused', {
  manifest: manifest([claim({ consumers: [] })]), files: FILES,
  expectExit: 1, needle: 'no consumers',
});

testCase('sourceOnly must be a literal boolean', {
  // "false" is truthy in JS, so a string switches ON the waiver it appears to
  // decline — restoring the vacuous pass the boolean check exists to stop.
  manifest: manifest([claim({ consumers: [], sourceOnly: 'false' })]), files: FILES,
  expectExit: 1, needle: '"sourceOnly" must be a boolean',
});

testCase('…and sourceOnly: true genuinely waives the consumer requirement', {
  manifest: manifest([claim({ consumers: [], sourceOnly: true })]), files: FILES,
  expectExit: 0, needle: 'check-claims: OK',
});

testCase('an empty manifest is refused', {
  manifest: manifest([]), files: FILES,
  expectExit: 1, needle: 'declares no claims',
});

testCase('a duplicate claim id is refused', {
  manifest: manifest([claim(), claim()]), files: FILES,
  expectExit: 1, needle: 'duplicate claim id',
});

testCase('a consumer that is also the source is refused', {
  manifest: manifest([claim({ consumers: ['directives/src.md'] })]), files: FILES,
  expectExit: 1, needle: 'consumer is the source itself',
});

testCase("the guard's own manifest cannot evidence a claim", {
  manifest: manifest([claim({ consumers: ['.github/scripts/claims.json'] })]), files: FILES,
  expectExit: 1, needle: "this guard's own artifact",
});

testCase('a duplicate consumer path is refused', {
  manifest: manifest([claim({ consumers: ['docs/consumer.md', './docs/consumer.md'] })]), files: FILES,
  expectExit: 1, needle: 'duplicate consumer path',
});

// ── the removed mechanisms must stay removed, and say so ──────────────────
testCase('a non-raw "pattern" is refused, not silently honoured', {
  // #341 deleted the inference layer; accepting a pattern here would let it back
  // in one entry at a time, which is how the old opener list grew.
  manifest: manifest([claim({ pattern: 'check the comments' })]), files: FILES,
  expectExit: 1, needle: '"pattern" is only for "raw"',
});

// ONE FIXTURE PER FIELD. A single fixture carrying `phrasings` AND `mustNotMatch`
// proves only that SOME override is refused: removing the `c.pattern` test alone,
// or the `c.mustNotMatch` test alone, left all 59 cases green because `phrasings`
// kept firing the shared diagnostic. A bundled fixture under an `||` tests the
// first operand and nothing else. Codex, #346 round 9 — the same shape as the
// bundled crash check two rounds earlier.
for (const [field, value] of [
  ['phrasings', ['so check the comments AND the review threads']],
  ['pattern', 'so check'],
  ['mustNotMatch', ['y']],
]) {
  testCase(`a per-consumer "${field}" override is refused with the reason`, {
    manifest: manifest([claim({
      consumers: [{ file: 'docs/consumer.md', why: 'x', [field]: value }],
    })]),
    files: FILES, expectExit: 1, needle: 'per-consumer override, which no longer exists',
  });
}

// ── raw: the one structural exception ──────────────────────────────────────
testCase('a raw pattern that MATCHES its own mustNotMatch is refused', {
  // The raw negative branch had no case: the passing raw fixture supplies a
  // counterexample its regex already rejects, and the failing one fails through
  // source matching instead — so disabling `re.test(n)` entirely left the real
  // manifest and all 65 cases green. A structural regex broadened over time
  // could then accept every counterexample it declares. Codex, #346 round 10.
  manifest: manifest([claim({
    raw: true, phrasings: undefined, sourceOnly: true, consumers: [],
    pattern: 'The two states are',
    // The pattern matches this, which is the whole point — it is declared as a
    // string the claim must NOT accept, and it does.
    mustNotMatch: ['a third bullet — and The two states are'],
  })]),
  files: { 'directives/src.md': 'The two states are two.\n' },
  expectExit: 1, needle: 'pattern MATCHES a string it must reject',
});

testCase('a raw "pattern" that is not a string is refused, not coerced', {
  // `new RegExp` coerces anything, so `"pattern": 123` compiled to /123/ and
  // certified a structural claim off a JSON type mistake. Truthiness reads
  // neither end of a field's meaning: `""` was the round-8 half, this is the
  // other. Codex, #346 round 9.
  manifest: manifest([claim({
    raw: true, phrasings: undefined, sourceOnly: true, consumers: [],
    pattern: 123, mustNotMatch: ['nothing like it'],
  })]),
  files: { 'directives/src.md': 'the list has 123 in it\n' },
  expectExit: 1, needle: 'needs a non-empty string "pattern"',
});

testCase('a raw claim matches unnormalised structure', {
  manifest: manifest([claim({
    raw: true, phrasings: undefined, sourceOnly: true, consumers: [],
    pattern: 'outage(?:(?!\\n[ \\t]*[-*+][ \\t])[^])*?The two states are',
    mustNotMatch: ['outage — a state\n  - third — another\n\n  The two states are'],
  })]),
  files: { 'directives/src.md': '  - outage — the request failed\n\n  The two states are two.\n' },
  expectExit: 0, needle: 'check-claims: OK',
});

testCase('…and a third list item breaks it', {
  manifest: manifest([claim({
    raw: true, phrasings: undefined, sourceOnly: true, consumers: [],
    pattern: 'outage(?:(?!\\n[ \\t]*[-*+][ \\t])[^])*?The two states are',
    mustNotMatch: ['nothing relevant'],
  })]),
  files: { 'directives/src.md': '  - outage — the request failed\n  - third — another\n\n  The two states are two.\n' },
  expectExit: 1, needle: 'the SOURCE no longer states the claim',
});

testCase('a raw pattern matching the EMPTY STRING is refused', {
  // Restored: the rewrite kept `re.test('')` and dropped the case proving it.
  // Codex disabled that single line on #346 round 4 and all 35 cases still
  // passed, because every raw fixture used a nonempty-matching pattern — so a
  // regression would let terminal-states-list-is-closed certify any source.
  manifest: manifest([claim({
    raw: true, phrasings: undefined, sourceOnly: true, consumers: [],
    pattern: 'x*',
    mustNotMatch: ['nothing relevant'],
  })]),
  files: { 'directives/src.md': 'anything at all\n' },
  expectExit: 1, needle: 'matches the empty string',
});

testCase('the guard\'s own CASES FILE cannot evidence a claim', {
  // The SELF set excluded the manifest and the guard but not this file, so a
  // fixture quoting an approved wording could vacuously evidence propagation.
  // Round 3 fixed the same omission in --derive; round 4 found it here, because
  // the two exclusions were separate literals. They are one list now.
  manifest: manifest([claim({ consumers: ['.github/scripts/check-claims-cases.js'] })]),
  files: { ...FILES, '.github/scripts/check-claims-cases.js': 'fixture: so check the comments AND the review threads\n' },
  expectExit: 1, needle: "this guard's own artifact",
});

testCase("the guard's own CHECKER cannot evidence a claim", {
  // The THIRD member of GUARD_ARTIFACTS, and the only one no case reached.
  // Removing just this entry left all 53 cases green while the run reported the
  // checker as containing an approved phrasing — so the one list that was
  // supposed to end the two-copies problem had an unexercised member instead.
  // Every member of a shared list needs its own case, or the list is only as
  // constrained as the members someone happened to test. Codex, #346 round 8.
  manifest: manifest([claim({ consumers: ['.github/scripts/check-claims.js'] })]),
  files: { ...FILES, '.github/scripts/check-claims.js': '// header: so check the comments AND the review threads\n' },
  expectExit: 1, needle: "this guard's own artifact",
});

testCase('a non-raw EMPTY pattern is refused on presence, not truthiness', {
  // `"pattern": ""` is falsey, so a truthiness test read it as absent.
  manifest: manifest([claim({ pattern: '' })]), files: FILES,
  expectExit: 1, needle: '"pattern" is only for "raw"',
});

testCase('a mustNotMatch entry empty after normalisation is refused', {
  // Non-empty as a string, empty once normalised — coverage in name only.
  manifest: manifest([claim({ mustNotMatch: ['   \n\t'] })]), files: FILES,
  expectExit: 1, needle: 'empty after normalisation',
});

testCase('a legacy ROOT-level field is refused', {
  // The allowlist was applied to the claim object only, so the removed
  // top-level fields stayed silently accepted. One helper, three levels now.
  manifest: { ...manifest([claim()]), negators: 'never|not|avoid' },
  files: FILES, expectExit: 1, needle: 'unknown root key(s): negators',
});

testCase('a legacy CONSUMER-level field is refused', {
  manifest: manifest([claim({
    consumers: [{ file: 'docs/consumer.md', why: 'x', continuationProbe: { kind: 'condition' } }],
  })]),
  files: FILES, expectExit: 1, needle: 'unknown consumer key(s): continuationProbe',
});

testCase('a legacy inference field is refused, not ignored', {
  // continuationProbe/negatorProbe/phrase read as live condition protection and
  // do nothing. The check is an allowlist, so an unlisted key of any name fails.
  manifest: manifest([claim({ continuationProbe: { kind: 'condition', shapes: { x: '%s' } } })]),
  files: FILES, expectExit: 1, needle: 'unknown claim key(s): continuationProbe',
});

testCase('…and so is any other key the schema does not name', {
  manifest: manifest([claim({ someFutureField: true })]),
  files: FILES, expectExit: 1, needle: 'unknown claim key(s): someFutureField',
});

testCase('a raw claim carrying phrasings is refused', {
  manifest: manifest([claim({ raw: true, pattern: 'outage', sourceOnly: true, consumers: [] })]),
  files: FILES, expectExit: 1, needle: 'carry a "pattern", not "phrasings"',
});

// ── the in-span/out-of-span boundary, pinned in both directions ───────────
// Six instances of one class arrived over two review rounds (#346). These fix
// the boundary so a seventh cannot arrive silently, and the last case pins the
// LIMIT — a guard that quietly started catching it would mean the pin had grown
// in a way nobody reviewed.
testCase('a condition APPENDED after the assertion is refused', {
  manifest: manifest([claim({
    phrasings: ['A response is not a verdict.'],
    mustNotMatch: ['A response is not a verdict unless it contains no findings.'],
    consumers: ['docs/consumer.md'],
  })]),
  files: {
    'directives/src.md': 'A response is not a verdict.\n',
    'docs/consumer.md': 'A response is not a verdict unless it contains no findings.\n',
  },
  expectExit: 1, needle: 'consumer no longer states the claim',
});

testCase('a gate written as a separate PRECEDING sentence is refused', {
  manifest: manifest([claim({
    phrasings: ['instead. Arm the check-in whenever the SHA differs'],
    mustNotMatch: ['instead. Only if the owner asks. Arm the check-in whenever the SHA differs'],
    consumers: ['docs/consumer.md'],
  })]),
  files: {
    'directives/src.md': 'It goes elsewhere instead. Arm the check-in whenever the SHA differs.\n',
    'docs/consumer.md': 'It goes elsewhere instead. Only if the owner asks. Arm the check-in whenever the SHA differs.\n',
  },
  expectExit: 1, needle: 'consumer no longer states the claim',
});

testCase('an UPPERCASE negation before an uppercase phrasing is refused', {
  manifest: manifest([claim({
    phrasings: ['— and ARM A CHECK-IN ALONGSIDE IT'],
    mustNotMatch: ['— and DO NOT ARM A CHECK-IN ALONGSIDE IT'],
    consumers: ['docs/consumer.md'],
  })]),
  files: {
    'directives/src.md': 'let the wake fire — and ARM A CHECK-IN ALONGSIDE IT.\n',
    'docs/consumer.md': 'let the wake fire — and DO NOT ARM A CHECK-IN ALONGSIDE IT.\n',
  },
  expectExit: 1, needle: 'consumer no longer states the claim',
});

testCase('a gate OUTSIDE the pinned span is NOT caught — the stated limit', {
  // Not a defect to fix: extending the pin moves the boundary and never removes
  // it, because the next sentence out is always available. Pinned so the limit
  // stays honest — if this ever starts failing, the pin grew unreviewed.
  manifest: manifest([claim({
    phrasings: ['so check the comments AND the review threads'],
    mustNotMatch: ['so never check the comments AND the review threads'],
    consumers: ['docs/consumer.md'],
  })]),
  files: {
    ...FILES,
    'docs/consumer.md': 'Everything below applies only with owner approval. Per the source: so check the comments AND the review threads before merging.\n',
  },
  expectExit: 0, needle: 'check-claims: OK',
});

testCase('an appended condition displaces a terminator-carrying pin', {
  // Round 3 (#346): the round-2 terminator rule had been applied only to the
  // claim Codex pointed at. This pins the rule itself, on a different claim.
  manifest: manifest([claim({
    phrasings: ['the merge proceeds unattended.'],
    mustNotMatch: ['the merge proceeds unattended only after escalating to the owner.'],
    consumers: ['docs/consumer.md'],
  })]),
  files: {
    'directives/src.md': 'Where no label is present, the merge proceeds unattended.\n',
    'docs/consumer.md': 'Where no label is present, the merge proceeds unattended only after escalating to the owner.\n',
  },
  expectExit: 1, needle: 'consumer no longer states the claim',
});

// ── --derive: retained, and its semantics CHANGED, so it needs coverage ────
// The rewrite narrowed what --derive can find (approved wordings only) while
// this suite stopped passing the flag at all. Codex, #346: changing a mode's
// matching and deleting its only test in the same commit leaves regressions in
// the `git ls-files` scan and the advisory output invisible.
testCase('--derive names an unlisted file that states an approved phrasing', {
  manifest: manifest([claim()]),
  files: { ...FILES, 'docs/unlisted.md': 'Also: so check the comments AND the review threads.\n' },
  args: ['--derive'], git: true, expectExit: 0, needle: 'docs/unlisted.md',
});

testCase('--derive is advisory: an unlisted carrier does not fail the run', {
  manifest: manifest([claim()]),
  files: { ...FILES, 'docs/unlisted.md': 'Also: so check the comments AND the review threads.\n' },
  args: ['--derive'], git: true, expectExit: 0, needle: 'check-claims: OK',
});

testCase('--derive does NOT name a file stating the rule in unapproved words', {
  // The narrowing, pinned. A regex could surface this; literal pinning cannot,
  // and the header says so — this case is what keeps that statement honest.
  manifest: manifest([claim()]),
  files: { ...FILES, 'docs/unlisted.md': 'Consult the comments together with every review thread.\n' },
  args: ['--derive'], git: true, expectExit: 0, needle: 'check-claims: OK',
  absent: 'docs/unlisted.md',
});

testCase('--derive excludes the guard\'s own CASES FILE from its candidates', {
  // It quotes approved wordings as fixtures, so it matches by construction. The
  // exclusion covered the manifest and the guard but not this file, and it was
  // reported as an unlisted carrier on every real run — which also made the
  // header's "derive reports nothing" claim false. Codex, #346 round 3.
  manifest: manifest([claim()]),
  files: { ...FILES, '.github/scripts/check-claims-cases.js': 'fixture: so check the comments AND the review threads\n' },
  args: ['--derive'], git: true, expectExit: 0, needle: 'check-claims: OK',
  // The DERIVE LISTING's own line shape, not the bare filename: the run also
  // prints each excluded artifact's live match count, and a bare-filename
  // absence assertion would fail on that line while the property it names holds.
  absent: '\n         .github/scripts/check-claims-cases.js',
});

testCase("--derive excludes the guard's own CHECKER from its candidates", {
  // The derive half of the case above. The checker quotes claim text in its
  // header as worked examples, so what it matches moves with an ordinary header
  // edit — which happened inside this very PR, taking it from 0 phrasings to 1.
  manifest: manifest([claim()]),
  files: { ...FILES, '.github/scripts/check-claims.js': '// header: so check the comments AND the review threads\n' },
  args: ['--derive'], git: true, expectExit: 0, needle: 'check-claims: OK',
  absent: '\n         .github/scripts/check-claims.js',
});

testCase('--derive excludes the guard\'s own manifest from its candidates', {
  // claims.json contains every phrasing by construction, so without the
  // exclusion it is reported as an unlisted carrier on every single run — which
  // is how an advisory list gets ignored.
  manifest: manifest([claim()]), files: FILES,
  args: ['--derive'], git: true, expectExit: 0, needle: 'check-claims: OK',
  absent: '\n         .github/scripts/claims.json',
});

// ── a phrasing that shadows another pins nothing extra ────────────────────
// `states()` ORs over the set, so a phrasing containing another can never be the
// sole match: deleting it changes no verdict, while the printed count and a
// reading reviewer both treat it as coverage. Found live in
// `unreachable-review-test-name`, where both entries occurred in one carrier.
// Codex, #346 round 6.
testCase('a phrasing CONTAINED IN another is refused as dead coverage', {
  manifest: manifest([claim({
    phrasings: [
      'check the comments AND the review threads',
      'so check the comments AND the review threads',
    ],
    mustNotMatch: ['so never look at anything'],
  })]),
  files: FILES, expectExit: 1,
  needle: 'one phrasing CONTAINS another',
});

testCase('…and two phrasings that merely overlap are accepted', {
  // The discriminator for the case above: sharing words is not containment, and
  // a rule that rejected overlap would refuse most real manifests.
  manifest: manifest([claim({
    phrasings: [
      'so check the comments AND the review threads',
      'check the review threads AND the comments',
    ],
    mustNotMatch: ['so never look at anything'],
  })]),
  files: FILES, expectExit: 0, needle: 'check-claims: OK',
});

testCase('an exactly duplicated phrasing is refused', {
  manifest: manifest([claim({
    phrasings: [
      'so check the comments AND the review threads',
      'so check the comments AND the review threads',
    ],
  })]),
  files: FILES, expectExit: 1, needle: 'duplicate phrasing',
});

// ── a clause mark is NOT a terminator ─────────────────────────────────────
// A phrasing ending in `,`, `:` or `;` stops mid-sentence, so a condition
// appended after that mark leaves the pin matching. The count line called those
// "terminated", overstating exactly the coverage it exists to report. Measured
// on the real tree: `never instead of it,` survived an inserted
// `but only after owner approval,`. Codex, #346 round 6.
testCase('a comma-terminated phrasing does NOT survive an appended condition', {
  manifest: manifest([claim({
    phrasings: ['so check the comments AND the review threads, every time.'],
    mustNotMatch: ['so never check anything'],
  })]),
  files: {
    'directives/src.md': 'so check the comments AND the review threads, every time.\n',
    // The append lands INSIDE the pinned span because the pin runs to the
    // sentence terminator. Stop the phrasing at the comma and this passes.
    'docs/consumer.md': 'so check the comments AND the review threads, when it matters, every time.\n',
  },
  expectExit: 1, needle: 'consumer no longer states the claim',
});

// ONE CASE PER EXCLUDED MARK, for the same reason as the three included ones.
// The comment names `,`, `:` and `;` as clause marks, and only the comma was
// exercised — so adding `:` or `;` to SENTENCE_END left all 65 cases green and
// the audit boundary could regress to reporting those pins as closed. The
// positive and negative sides of one constant both need every member.
// Codex, #346 round 10.
for (const mark of [',', ':', ';']) {
  testCase(`the run counts a "${mark}"-stopping phrasing as OPEN, not terminated`, {
    manifest: manifest([claim({
      phrasings: [`so check the comments AND the review threads${mark}`],
      mustNotMatch: ['so never check anything'],
    })]),
    files: {
      'directives/src.md': `so check the comments AND the review threads${mark} every time.\n`,
      'docs/consumer.md': `so check the comments AND the review threads${mark} when it matters.\n`,
    },
    expectExit: 0,
    needle: '1 total — 0 run to a sentence terminator, 1 stop short',
  });
}

// EVERY MARK IN `SENTENCE_END`, NOT JUST THE COMMON ONE. Only `.` was exercised,
// so dropping `!` or `?` from the set left all 59 cases green and the audit
// boundary could regress to calling those pins open with nothing noticing. A
// constant naming three members needs three cases for the same reason a shared
// list needs one per member — round 8's finding, one layer down. Codex, round 9.
for (const mark of ['.', '!', '?']) {
  testCase(`a phrasing closed by "${mark}" counts as closed`, {
    manifest: manifest([claim({
      phrasings: [`so check the comments AND the review threads${mark}`],
      mustNotMatch: ['so never check anything'],
    })]),
    files: {
      'directives/src.md': `so check the comments AND the review threads${mark}\n`,
      'docs/consumer.md': `Per the source: so check the comments AND the review threads${mark}\n`,
    },
    expectExit: 0,
    needle: '1 total — 1 run to a sentence terminator, 0 stop short',
  });
}

testCase('…and a full-stop phrasing counts as closed', {
  manifest: manifest([claim({
    phrasings: ['so check the comments AND the review threads.'],
    mustNotMatch: ['so never check anything'],
  })]),
  files: {
    'directives/src.md': 'so check the comments AND the review threads.\n',
    'docs/consumer.md': 'Per the source: so check the comments AND the review threads.\n',
  },
  expectExit: 0,
  needle: '1 total — 1 run to a sentence terminator, 0 stop short',
});

testCase('a terminator inside markdown emphasis still counts as closed', {
  // The count has to read the phrasing the way MATCHING reads it. normalize()
  // strips `*` from both sides, so `…threads.*` pins the period and an appended
  // condition IS caught — but the raw string ends in `*`, so the unnormalised
  // test called it open and the run reported a residue that did not exist.
  // Codex, #346 round 8.
  manifest: manifest([claim({
    phrasings: ['*so check the comments AND the review threads.*'],
    mustNotMatch: ['so never check anything'],
  })]),
  files: {
    'directives/src.md': 'Rule: *so check the comments AND the review threads.* Always.\n',
    'docs/consumer.md': 'Per source: *so check the comments AND the review threads.* Yes.\n',
  },
  expectExit: 0,
  needle: '1 total — 1 run to a sentence terminator, 0 stop short',
});

// ── the exclusion's effect is PRINTED, not asserted in a comment ───────────
// Three separate sentences in this guard's header describing its own output have
// been measured false. The counts move with an ordinary header or fixture edit,
// so the run reports them and no comment states a number. Codex, #346 rounds 3
// and 6.
testCase('the run PRINTS what each excluded guard artifact contains', {
  manifest: manifest([claim()]), files: FILES, expectExit: 0,
  // ALL THREE entries. Ending the needle after the first let a reporting path
  // that mapped only `GUARD_ARTIFACTS[0]` pass — the case is named for what the
  // run prints about EACH artifact, so a prefix does not hold it.
  needle: 'guard artifacts excluded by identity — phrasings each happens to contain: '
    + 'claims.json 1/1, check-claims.js ?/1, check-claims-cases.js ?/1',
});

// ── a MISSING CONSUMER fails like a missing source, and does not abort ────
// The two missing-file cases exercised the SOURCE read only, and the malformed
// consumer cases fail before any read is attempted — so removing the consumer
// read's try/catch left the real manifest and all 65 cases green. That `catch`
// is the twin of the one round 1 added to the source read; a deleted or renamed
// consumer would have gone back to killing the process without its terminal
// summary, taking every later claim with it. Codex, #346 round 10.
testCase('a missing CONSUMER file FAILS rather than crashing the run', {
  manifest: manifest([claim({ consumers: ['docs/GONE.md'] })]),
  files: FILES,
  expectExit: 1, needle: 'cannot read consumer docs/GONE.md',
});

testCase('…and the claims after a missing consumer are still checked', {
  manifest: manifest([
    claim({ id: 'first', consumers: ['docs/GONE.md'] }),
    claim({ id: 'second', consumers: ['docs/other.md'] }),
  ]),
  files: { ...FILES, 'docs/other.md': CONS },
  expectExit: 1, needle: 'OK:   second → docs/other.md',
});

// ── a malformed consumer FAILS the entry, and does not abort the run ──────
// `resolve(undefined)` throws ERR_INVALID_ARG_TYPE, so an object-form consumer
// with no `file` killed the process before the refusal meant to catch it, and
// every claim after it went unchecked. Third instance on this PR of a malformed
// manifest aborting rather than failing. Codex, #346 round 7.
testCase('a consumer object with no "file" FAILS rather than crashing the run', {
  manifest: manifest([
    claim({ id: 'first', consumers: [{}] }),
    claim({ id: 'second', consumers: ['docs/other.md'] }),
  ]),
  files: { ...FILES, 'docs/other.md': CONS },
  expectExit: 1, needle: 'consumer entry with no usable "file"',
});

testCase('…and the claims after a malformed consumer are still checked', {
  manifest: manifest([
    claim({ id: 'first', consumers: [{}] }),
    claim({ id: 'second', consumers: ['docs/other.md'] }),
  ]),
  files: { ...FILES, 'docs/other.md': CONS },
  // The SECOND claim's OK line is the half a crash-only assertion misses: the
  // process dying and the entry failing both produce exit 1. This must use the
  // SAME `{}` fixture as the case above — `{ file: '' }` was tried and does not
  // crash the unvalidated guard (`resolve('')` is legal), so the case passed
  // against the mutant and proved nothing. The condition a case's name claims
  // has to be the condition its fixture actually creates.
  expectExit: 1, needle: 'OK:   second → docs/other.md',
});

testCase('a whitespace-only consumer "file" gets the same refusal', {
  // The non-crashing half of the same validation. Without it the guard reaches
  // the read and reports `cannot read consumer` — true, less useful, and it
  // describes the filesystem rather than the manifest entry at fault.
  manifest: manifest([claim({ consumers: [{ file: '   ' }] })]),
  files: FILES,
  expectExit: 1, needle: 'consumer entry with no usable "file"',
});

// ── a carrier stating one claim TWICE: which occurrence is pinned ─────────
// The guard's header describes this boundary in both directions and, until
// round 8, nothing tested it — the fifth sentence in that header asserting
// behaviour no case held. These two are the measurement, and they must move
// together: pinning the second occurrence as well would turn the first one
// GREEN, which is why the header says to pin one and declare the other open.
const TWICE = 'Procedure: so check the comments AND the review threads before merging.\n'
  + '\nReminder elsewhere in the file: read the comments and the threads.\n';

testCase('inverting the PINNED occurrence of a doubly-stated claim is caught', {
  manifest: manifest([claim({ consumers: ['docs/consumer.md'] })]),
  files: { ...FILES, 'docs/consumer.md': TWICE.replace('so check the comments AND the review threads', 'check only the comments') },
  expectExit: 1, needle: 'consumer no longer states the claim',
});

testCase('PINNING BOTH occurrences unpins both — measured, not argued', {
  // The reason the header says to pin ONE. `states()` ORs over the set, so with
  // both wordings approved the file passes on either, and the inversion the
  // first case catches goes GREEN. This was tried on the real ci-triage.md
  // carrier during round 6 and reverted; the case is what stops it being tried
  // again, and it is the discriminator for the two cases above — a phrasing
  // added to cover the restatement turns this green case and that red one
  // simultaneously.
  manifest: manifest([claim({
    consumers: ['docs/consumer.md'],
    phrasings: [
      'so check the comments AND the review threads',
      'read the comments and the threads',
    ],
    mustNotMatch: ['so never look at anything'],
  })]),
  files: { ...FILES, 'docs/consumer.md': TWICE.replace('so check the comments AND the review threads', 'check only the comments') },
  expectExit: 0, needle: 'check-claims: OK',
});

testCase('…and inverting the UNPINNED restatement is not — the documented limit', {
  // Not a defect being enshrined. If this case ever starts failing, a phrasing
  // grew to cover the restatement too, and the case above has silently stopped
  // protecting the occurrence a reader acts on.
  manifest: manifest([claim({ consumers: ['docs/consumer.md'] })]),
  files: { ...FILES, 'docs/consumer.md': TWICE.replace('read the comments and the threads', 'read the comments only') },
  expectExit: 0, needle: 'check-claims: OK',
});

// ── a missing SOURCE fails like a missing consumer, and does not abort ─────
testCase('a missing source file FAILS rather than crashing the run', {
  manifest: manifest([
    claim({ id: 'first', source: 'directives/GONE.md' }),
    claim({ id: 'second', source: 'docs/consumer.md', consumers: ['docs/other.md'] }),
  ]),
  files: { ...FILES, 'docs/other.md': CONS },
  expectExit: 1, needle: 'cannot read source directives/GONE.md',
});

testCase('…and the claims after it are still checked', {
  manifest: manifest([
    claim({ id: 'first', source: 'directives/GONE.md' }),
    claim({ id: 'second', source: 'docs/consumer.md', consumers: ['docs/other.md'] }),
  ]),
  files: { ...FILES, 'docs/other.md': CONS },
  expectExit: 1, needle: 'second → docs/consumer.md',
});

console.log();
if (FAIL.length) {
  console.log(`check-claims-cases: FAIL — ${FAIL.length} of ${PASS.length + FAIL.length} case(s) failed`);
  process.exit(1);
}
console.log(`check-claims-cases: OK — ${PASS.length} pinned guard behaviours read correctly.`);
