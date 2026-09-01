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
 *   F  a comment reworded (control) -> nothing reddens
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
  if (/SyntaxError|ReferenceError|TypeError|Cannot find module/.test(out)) {
    problems.push('the guard CRASHED — a stack trace is not a catch, so this proves nothing');
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

testCase('a per-consumer override is refused with the reason', {
  manifest: manifest([claim({
    consumers: [{ file: 'docs/consumer.md', phrasings: ['so check the comments AND the review threads'], why: 'x', mustNotMatch: ['y'] }],
  })]),
  files: FILES, expectExit: 1, needle: 'per-consumer override, which no longer exists',
});

// ── raw: the one structural exception ──────────────────────────────────────
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

testCase('a legacy inference field is refused, not ignored', {
  // continuationProbe/negatorProbe/phrase read as live condition protection and
  // do nothing. The check is an allowlist, so an unlisted key of any name fails.
  manifest: manifest([claim({ continuationProbe: { kind: 'condition', shapes: { x: '%s' } } })]),
  files: FILES, expectExit: 1, needle: 'unknown manifest key(s): continuationProbe',
});

testCase('…and so is any other key the schema does not name', {
  manifest: manifest([claim({ someFutureField: true })]),
  files: FILES, expectExit: 1, needle: 'unknown manifest key(s): someFutureField',
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
  absent: 'check-claims-cases.js',
});

testCase('--derive excludes the guard\'s own manifest from its candidates', {
  // claims.json contains every phrasing by construction, so without the
  // exclusion it is reported as an unlisted carrier on every single run — which
  // is how an advisory list gets ignored.
  manifest: manifest([claim()]), files: FILES,
  args: ['--derive'], git: true, expectExit: 0, needle: 'check-claims: OK',
  absent: 'claims.json',
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
