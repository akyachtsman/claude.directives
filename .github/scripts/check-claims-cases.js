#!/usr/bin/env node
// THE CANONICAL-CLAIM GUARD'S OWN GUARD (#342).
//
// WHY IT EXISTS. check-claims.js was the last guard in this repo without one,
// and the one that grew fastest — 24 review rounds on #336 alone, 100 findings.
// Every sibling cases file was added because the guard it tests had shipped
// broken: check-ui-viewports-cases.js (the static read failed twelve ways, every
// failure silent, #282), check-job-bounds-cases.py (#334), check-contrast-cases.js
// (#334), check-ui-suite-env-cases.py (a NameError inside a failure path, #333).
//
// THE MEASUREMENT THAT MOTIVATED IT (2026-09-01, against the real manifest):
//   `const exercises = true`                     -> exit 0, NOT CAUGHT
//   override continuation probes never invoked   -> exit 0, NOT CAUGHT
// Both guards ran on every real run and both could be deleted with no signal.
// That is the fail-open family (#323): a pass and a did-not-look are the same
// output. The two cases marked META below exist to make those two mutations
// fail; if you change the override machinery, run them against the mutation and
// confirm they go red, or you have re-created the hole this file closes.
//
// ⚠️ WHAT THIS FILE DOES NOT PROVE. It exercises check-claims' BEHAVIOUR against
// synthetic manifests. It says nothing about whether the real claims.json pins
// the right sentences, and nothing about whether those sentences are TRUE — the
// guard's own header is explicit that it proves a claim TRAVELLED, never that it
// is correct. A green run here plus a green run there still permits a wrong rule
// stated consistently everywhere.
//
// HOW IT WORKS. check-claims.js has no exports and resolves MANIFEST relative to
// cwd, so each case builds a temp directory containing .github/scripts/claims.json
// plus its consumer files and runs the REAL script there. That tests the shipped
// CLI contract rather than a copy of the logic. `git ls-files` is reached only
// under --derive, so only those cases need a git fixture.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { execFileSync, spawnSync } from 'child_process';

// CHECK_CLAIMS_BIN points the suite at a MUTATED copy of the guard. That is how
// the two META cases below are proven to discriminate: run this file once
// unmutated (all green), then once per mutation (the matching META case red).
// A cases file nobody has run against a mutant is an assertion, not a test.
const SCRIPT = resolve(process.env.CHECK_CLAIMS_BIN || '.github/scripts/check-claims.js');
const REAL = JSON.parse(readFileSync('.github/scripts/claims.json', 'utf8'));

let failures = 0;
let ran = 0;

// The manifest-level blocks are infrastructure every run needs: the condition
// floor is asserted against the hardcoded CONDITION_OPENERS at startup, so a
// synthetic manifest that omits it fails for a reason no case is about. Cases
// vary `claims` and `continuationRequired`; everything else comes from the real
// file, which also means a change to those blocks surfaces here.
function manifest({ claims, continuationRequired = [] }) {
  return {
    negators: REAL.negators,
    continuations: REAL.continuations,
    continuationRequired,
    negatorFloor: REAL.negatorFloor,
    claims,
  };
}

function sandbox({ claims, continuationRequired, files = {}, args = [], git = false }) {
  const dir = mkdtempSync(join(tmpdir(), 'claims-cases-'));
  try {
    mkdirSync(join(dir, '.github', 'scripts'), { recursive: true });
    writeFileSync(join(dir, '.github', 'scripts', 'claims.json'),
                  JSON.stringify(manifest({ claims, continuationRequired }), null, 2));
    for (const [rel, body] of Object.entries(files)) {
      const p = join(dir, rel);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, body);
    }
    if (git) {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      execFileSync('git', ['add', '-A'], { cwd: dir });
    }
    const r = spawnSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
    return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// `expect` is 0 or 1; `needle` must appear in the output when a failure is
// expected. A case that asserts only the exit code is the near-miss this repo
// has logged repeatedly — a red for an unrelated reason reads as a pass. A
// SyntaxError is never a legitimate red.
function assertCase(name, result, expect, needle) {
  ran += 1;
  const problems = [];
  if (result.code !== expect) problems.push(`exit ${result.code}, expected ${expect}`);
  if (/SyntaxError/.test(result.out)) problems.push('SyntaxError — the run crashed, so it proves nothing');
  if (expect === 1 && needle && !result.out.includes(needle)) {
    problems.push(`expected diagnostic not found: ${JSON.stringify(needle)}`);
  }
  if (expect === 0 && /^FAIL/m.test(result.out)) problems.push('unexpected FAIL line on a case that must pass');
  if (problems.length) {
    failures += 1;
    console.error(`FAIL: ${name}`);
    for (const p of problems) console.error(`      ${p}`);
    const shown = result.out.split('\n').filter((l) => /FAIL|Error/.test(l)).slice(0, 3);
    for (const l of shown) console.error(`      | ${l.slice(0, 200)}`);
  } else {
    console.log(`OK:   ${name}`);
  }
}

// ---------------------------------------------------------------------------
// A minimal, VALID claim. Every case below is this shape with one thing changed,
// so a red says which single property the guard is enforcing.
// ---------------------------------------------------------------------------
const SENTENCE = 'The merge proceeds unattended.';
const CONSUMER = 'docs/consumer.md';
const SOURCE = 'docs/source.md';

// Guarded at BOTH ends. A claim pattern guarded only at the trailing end still
// fails the `constructed:preposed` probe, so any case built on it reds for a
// reason the case is not about.
const GUARDED = '(?<!\\b(?:{{COND}})\\b{{B}}*)The merge proceeds unattended(?!{{S}}*\\b(?:{{COND}})\\b)';

const basicClaim = (over = {}) => ({
  id: 'demo',
  why: 'A synthetic claim used only by check-claims-cases.js.',
  source: SOURCE,
  consumers: [CONSUMER],
  pattern: 'The merge proceeds unattended',
  mustNotMatch: ['The merge does not proceed unattended'],
  ...over,
});

const bothFiles = { [SOURCE]: SENTENCE, [CONSUMER]: SENTENCE };

// 1. Baseline — the shape every other case mutates.
assertCase('baseline: a stated claim passes',
  sandbox({ claims: [basicClaim()], files: bothFiles }), 0);

// 2. The guard's whole purpose: a consumer that stopped stating the claim.
assertCase('a consumer that dropped the claim fails',
  sandbox({ claims: [basicClaim()], files: { [SOURCE]: SENTENCE, [CONSUMER]: 'Nothing relevant here.' } }),
  1, 'no longer states the claim');

// 3. An empty manifest verifies nothing while reporting success.
assertCase('an empty claims list fails rather than passing vacuously',
  sandbox({ claims: [], files: bothFiles }), 1, 'declares no claims');

// 4. Every pattern must carry the inversions it rejects — see the guard's
//    header for the four inversions that got through without this.
assertCase('a claim with no mustNotMatch fails',
  sandbox({ claims: [basicClaim({ mustNotMatch: undefined })], files: bothFiles }),
  1, 'no "mustNotMatch"');

// 5. The inversion check itself: a mustNotMatch case the pattern ACCEPTS means
//    the pattern certifies the opposite of its claim.
assertCase('a mustNotMatch case the pattern accepts fails',
  sandbox({ claims: [basicClaim({ mustNotMatch: ['The merge proceeds unattended'] })], files: bothFiles }),
  1, 'MATCHES a string it must reject');

// 6. A pattern matching the empty string certifies every file.
assertCase('a pattern matching the empty string fails',
  sandbox({ claims: [basicClaim({ pattern: '(?:)' })], files: bothFiles }),
  1, 'matches the empty string');

// 7. An entry with no consumers checks nothing.
assertCase('no consumers without sourceOnly fails',
  sandbox({ claims: [basicClaim({ consumers: [] })], files: bothFiles }),
  1, 'no consumers');

// 8. A truthy non-boolean silently waives the requirement it appears to set.
assertCase('a non-boolean sourceOnly fails',
  sandbox({ claims: [basicClaim({ consumers: [], sourceOnly: 'yes' })], files: bothFiles }),
  1, '"sourceOnly" must be a boolean');

// 9/10. The two halves of the derived-continuation opt-out: a claim leaves the
//       suite either by dropping the probe or by leaving the required list.
const probed = basicClaim({
  pattern: 'The merge proceeds unattended(?!{{S}}*\\b(?:{{COND}})\\b)',
  continuationProbe: { kind: 'condition', shapes: { appended: 'The merge proceeds unattended%s.' } },
});
assertCase('a continuationProbe outside continuationRequired fails',
  sandbox({ claims: [probed], continuationRequired: [], files: bothFiles }),
  1, 'not in continuationRequired');

assertCase('continuationRequired without a continuationProbe fails',
  sandbox({ claims: [basicClaim()], continuationRequired: ['demo'], files: bothFiles }),
  1, 'declares no "continuationProbe"');

// 11. The probe doing its job: a pattern with no trailing guard lets the
//     statement be taken back inside its own sentence.
assertCase('an unguarded pattern is caught by its continuation probe',
  sandbox({
    claims: [basicClaim({
      continuationProbe: { kind: 'condition', shapes: { appended: 'The merge proceeds unattended%s.' } },
    })],
    continuationRequired: ['demo'],
    files: bothFiles,
  }), 1, 'is NOT rejected');

// 12. Baseline for the override cases: a strict per-consumer pattern that is
//     genuinely stricter, with a case only it rejects.
const STRICT_LINE = 'Delivered: the merge proceeds unattended.';
const overrideConsumer = (over = {}) => ({
  file: CONSUMER,
  why: 'Synthetic override.',
  pattern: 'Delivered: the merge proceeds unattended',
  // The third case is the exercising one: the CLAIM pattern matches it, this
  // override rejects it, so it can only pass by the override doing work.
  mustNotMatch: ['The merge does not proceed unattended', 'The merge proceeds unattended'],
  ...over,
});

assertCase('baseline: a working override passes',
  sandbox({
    claims: [basicClaim({ consumers: [overrideConsumer()] })],
    files: { [SOURCE]: SENTENCE, [CONSUMER]: STRICT_LINE },
  }), 0);

// 13. META (#342). An override whose mustNotMatch cases are ALL rejected by the
//     claim pattern too proves nothing — deleting the override entirely would
//     fail none of them. This case is the exerciser for `const exercises = …`:
//     force that value true and this case goes green.
assertCase('META: an override that never does work fails (guards `exercises`)',
  sandbox({
    claims: [basicClaim({
      consumers: [overrideConsumer({ mustNotMatch: ['The merge does not proceed unattended'] })],
    })],
    files: { [SOURCE]: SENTENCE, [CONSUMER]: STRICT_LINE },
  }), 1, 'never exercises the override');

// 14. META (#342). An override pattern that omits the trailing guard must be
//     caught by the probes run against the OVERRIDE, not the claim. This case is
//     the exerciser for the override probe loop: delete that loop and this case
//     goes green while the claim-level probes still pass.
// The CLAIM pattern here is guarded at BOTH ends, so the claim-level probes pass
// and the only thing that can fail is the override. A trailing-only guard leaves
// `constructed:preposed` failing at the claim level, which reds the case for the
// wrong reason — measured, and the reason the needle below names the override.
assertCase('META: an unguarded override pattern is caught (guards the override probe loop)',
  sandbox({
    claims: [basicClaim({
      pattern: GUARDED,
      continuationProbe: { kind: 'condition', shapes: { appended: 'The merge proceeds unattended%s.' } },
      consumers: [overrideConsumer({
        pattern: 'Delivered: the merge proceeds unattended',   // no guard at either end
        continuationProbe: { kind: 'condition', shapes: { appended: 'Delivered: the merge proceeds unattended%s.' } },
      })],
    })],
    continuationRequired: ['demo'],
    files: { [SOURCE]: SENTENCE, [CONSUMER]: STRICT_LINE },
  }), 1, 'is NOT rejected by the override for');

// 15. Round 16's defect: an empty shapes map runs zero probes.
assertCase('an override continuationProbe with no shapes fails',
  sandbox({
    claims: [basicClaim({
      pattern: 'The merge proceeds unattended(?!{{S}}*\\b(?:{{COND}})\\b)',
      continuationProbe: { kind: 'condition', shapes: { appended: 'The merge proceeds unattended%s.' } },
      consumers: [overrideConsumer({
        pattern: 'Delivered: the merge proceeds unattended(?!{{S}}*\\b(?:{{COND}})\\b)',
        continuationProbe: { kind: 'condition', shapes: {} },
      })],
    })],
    continuationRequired: ['demo'],
    files: { [SOURCE]: SENTENCE, [CONSUMER]: STRICT_LINE },
  }), 1, 'declares no shapes');

// 16. Round 17's defect: a PARTIAL map opts out of the position it omits, and a
//     non-empty count check cannot see that.
assertCase('an override continuationProbe missing a position fails',
  sandbox({
    claims: [basicClaim({
      pattern: 'The merge proceeds unattended(?!{{S}}*\\b(?:{{COND}})\\b)',
      continuationProbe: {
        kind: 'condition',
        shapes: {
          appended: 'The merge proceeds unattended%s.',
          trailing: 'The merge proceeds unattended%s, and nothing else.',
        },
      },
      consumers: [overrideConsumer({
        pattern: 'Delivered: the merge proceeds unattended(?!{{S}}*\\b(?:{{COND}})\\b)',
        continuationProbe: {
          kind: 'condition',
          shapes: { appended: 'Delivered: the merge proceeds unattended%s.' },
        },
      })],
    })],
    continuationRequired: ['demo'],
    files: { [SOURCE]: SENTENCE, [CONSUMER]: STRICT_LINE },
  }), 1, 'missing position');

// 17. --derive names a carrier nobody listed. This is the only path reaching
//     `git ls-files`, so it is the only case needing a git fixture.
const derived = sandbox({
  claims: [basicClaim()],
  files: { ...bothFiles, 'docs/unlisted.md': SENTENCE },
  args: ['--derive'],
  git: true,
});
assertCase('--derive reports an unlisted carrier', derived, 0);
ran += 1;
if (!derived.out.includes('docs/unlisted.md')) {
  failures += 1;
  console.error('FAIL: --derive did not name the unlisted carrier docs/unlisted.md');
  console.error('      Without this the flag reports success while finding nothing.');
} else {
  console.log('OK:   --derive names the unlisted file');
}

// ---------------------------------------------------------------------------
if (failures) {
  console.error(`check-claims-cases: FAIL — ${failures} of ${ran} case(s)`);
  process.exit(1);
}
console.log(`check-claims-cases: OK — ${ran} case(s)`);
