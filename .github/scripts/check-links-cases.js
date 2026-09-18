#!/usr/bin/env node
// Guards check-links.js's SECTION CROSS-REFERENCE scan.
//
// Why this exists: that scan reports "N/N cross-references resolve", and a
// reference it cannot PARSE is silently absent from both sides of that fraction.
// Partial blindness therefore looks identical to full coverage — the #323
// fail-open family. It was not theoretical: both patterns used [^*\n], so every
// reference whose italicised name wrapped across a line was invisible, and
// twenty such references were live in this repo while CI reported all green
// (#363). Nothing else here would notice, because the tree's own references are
// the only input and a missed one produces no output at all.
//
// READ THIS BEFORE CHANGING THE SCAN. #365 fixed the wrap by letting NAME span a
// newline. Six review rounds each found another Markdown construct it should not
// have spanned — a following `→ *`, the same for `->`, a list bullet — and the
// exclusion added to stop the first made the checker invent a reference out of
// prose and fail a valid file. That PR was reverted. The set of constructs a
// multiline name must not cross is OPEN; do not reopen it.
//
// The shipped design is strictly SINGLE-LINE: the thirty-seven wrapped
// references were put on one line in the source, and the parser never crosses a
// break. Do not reintroduce joining or a multiline name — both were tried, both
// took three or more review rounds against an open set of Markdown constructs,
// and both were reverted (#365, #367). Widening what is parsed belongs in #366.
//
// Each case builds a throwaway tree and runs the SHIPPED checker against it, so
// these test the file that actually ships rather than a copy of its regexes.
// Re-prove discrimination with CHECK_LINKS_BIN=<mutant> node <this file>.
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
// Resolved against the CALLER's cwd, not left relative: each case spawns the
// checker with cwd set to a throwaway temp dir, so a relative
// CHECK_LINKS_BIN=./old-check-links.js would resolve there, fail to load, and
// every case would "discriminate" by crashing — a proof that proves nothing.
// Measured: #365's original proof passed only because the path handed to it
// happened to be absolute.
const BIN = process.env.CHECK_LINKS_BIN
  ? resolve(process.env.CHECK_LINKS_BIN)
  : join(HERE, 'check-links.js');

let failed = 0;

// Runs the checker over a temp tree. `files` maps relative path -> contents.
function run(files) {
  const dir = mkdtempSync(join(tmpdir(), 'xref-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      const abs = join(dir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, body);
    }
    const r = spawnSync(process.execPath, [BIN, '--internal'], {
      cwd: dir, encoding: 'utf8',
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function check(name, cond, detail) {
  if (cond) { console.log(`ok   ${name}`); return; }
  console.error(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
  failed++;
}

// Counts the "N/N" the summary reports, or null when the line is absent. The
// word PARSED is OPTIONAL here on purpose: a mutant that only reverts the
// wording would otherwise make every count-based case fail, and a case failing
// because it could not read the output is indistinguishable from one that
// caught something. The wording has its own case, alone.
const parsed = (out) => {
  const m = out.match(/(\d+)\/(\d+) (?:PARSED )?section cross-references resolve/);
  return m ? { good: +m[1], total: +m[2] } : null;
};

const HEADINGS = '# Alpha Beta\n\n## Gamma Delta\n\ntext\n';

// ── The defect this file exists for (#363), and how it was actually fixed ──
// 1-2. A wrapped name is NOT parsed, and the summary says so. Thirty-seven were
//      live here and invisible; the fix put them on ONE LINE in the source
//      rather than teaching the parser to read across a break. Two designs tried
//      that and both failed the same way — #365 let the name span a newline,
//      #367 joined lines first — because the set of Markdown constructs a
//      reference must not cross is open. This pins the honest state: a split
//      reference is outside PARSED, and the fraction does not pretend otherwise.
{
  const r = run({ 'a.md': HEADINGS, 'b.md': 'see `a.md` → *Gamma\n   Delta* here\n' });
  check('a name split across a line is NOT counted',
    r.code === 0 && parsed(r.out)?.total === 0,
    `exit=${r.code} got ${JSON.stringify(parsed(r.out))} out=${r.out.trim()}`);
  check('…and the summary discloses that split references are unverified',
    /ON ONE LINE/.test(r.out) && /NOT verified/.test(r.out), `out=${r.out.trim()}`);
}

// 3. The break can also fall between the FILENAME and its arrow, and that case
//    is UNFIXABLE in the parser — which is the strongest argument for fixing the
//    source. `main` matched it, because `\s*` spans a newline, and seventeen
//    references here were matched that way. Tightening every separator to
//    `[ \t]*` stops the explicit form matching across the break — but the self
//    form still claims the arrow line on its own, and checks the name against
//    the CURRENT file. The author wrote `a.md`; the checker reads b.md. No rule
//    recovers the intent once the break is there, so the reference has to be on
//    one line. This pins the behaviour honestly rather than claiming a fix.
{
  const r = run({
    'a.md': '# Top\n\n## Other\n\ntext\n',
    'b.md': '## Absent\n\nsee `a.md`\n → *Absent*\n',
  });
  check('a break before the arrow leaves a SELF reference, not a check of a.md',
    r.code === 0 && parsed(r.out)?.total === 1 && !/a\.md/.test(r.out),
    `exit=${r.code} got ${JSON.stringify(parsed(r.out))} out=${r.out.trim()}`);
}

// 4. Single-line references must still work — the fix must not trade one form
//    for another.
{
  const r = run({ 'a.md': HEADINGS, 'b.md': 'see `a.md` → *No Such Heading*\n' });
  check('single-line broken reference still fails',
    r.code !== 0 && /No Such Heading/.test(r.out), `exit=${r.code}`);
}

// ── #365 round 4/5: the only defect that turned a RED into a GREEN ──────────
// 5. A name must not run through a FOLLOWING reference and take its opening `*`
//    as a closing delimiter. The pre-#365 checker caught this and failed it; the
//    multiline name passed it silently. Both arrow spellings, because #365's
//    first fix covered `→` and not `->`.
for (const [label, arrow] of [['→', '→'], ['ASCII ->', '->']]) {
  const r = run({
    'a.md': `# Decoy ${arrow}\n\n## Real Heading\n\ntext\n`,
    'b.md': `see \`a.md\` ${arrow} *Decoy\n${arrow} *Missing*\n`,
  });
  check(`a name does not swallow the next reference (${label})`,
    r.code !== 0 && /Missing/.test(r.out), `exit=${r.code} out=${r.out.trim()}`);
}

// ── #365 round 6: what the fix for round 4 broke ────────────────────────────
// 6. A name legitimately ENDING in an arrow must resolve. #365 excluded arrows
//    from names to stop case 5; that made this reference fail, restart at the
//    embedded arrow, and invent a reference named "later" out of the prose
//    below — a false FAILURE on a correct file, the only one of its kind in
//    that PR. Delimiter flanking handles case 5 without excluding anything.
{
  const r = run({
    'a.md': '# Top\n\n## Alpha ->\n\ntext\n',
    'b.md': 'see `a.md` -> *Alpha ->*\nlater *ordinary emphasis* here\n',
  });
  check('a name ending in an arrow resolves, and prose after it is not a reference',
    r.code === 0 && parsed(r.out)?.good === 1 && parsed(r.out)?.total === 1,
    `exit=${r.code} got ${JSON.stringify(parsed(r.out))} out=${r.out.trim()}`);
}

// 7. An unclosed name followed by a list bullet must not take the bullet's `*`
//    as its close. Markdown starts a block there, so the paragraph ends.
{
  const r = run({ 'a.md': '# Top\n\n## Alpha\n\ntext\n', 'b.md': 'see `a.md` -> *Alpha\n* bullet item\n' });
  check('a bullet ends the paragraph, so the name is not closed by it',
    r.code === 0 && parsed(r.out)?.total === 0,
    `exit=${r.code} got ${JSON.stringify(parsed(r.out))} out=${r.out.trim()}`);
}

// 8. A parsed reference naming a missing file belongs IN the fraction. It was
//    printed as a failure and then omitted, so the summary read `0/0 … resolve`
//    directly beneath a failure.
{
  const r = run({ 'a.md': HEADINGS, 'b.md': 'see `ghost.md` → *Gamma Delta*\n' });
  check('reference to a nonexistent file fails AND is counted',
    r.code !== 0 && /ghost\.md/.test(r.out) && parsed(r.out)?.total === 1
      && parsed(r.out)?.good === 0,
    `exit=${r.code} got ${JSON.stringify(parsed(r.out))}`);
}

// ── #365 round 2/3: whitespace normalisation, and what it made reachable ────
// 9. Both operands are normalised, so a heading carrying a double space still
//    matches an exact single-line reference.
{
  const r = run({ 'a.md': '# Top\n\n## Alpha  Beta\n\ntext\n', 'b.md': 'see `a.md` → *Alpha  Beta*\n' });
  check('a double space in the heading still resolves',
    r.code === 0 && parsed(r.out)?.good === 1,
    `exit=${r.code} got ${JSON.stringify(parsed(r.out))}`);
}

// 10. …and a nameless reference must not resolve against everything, which is
//     what normalising both sides made possible: `''` is a substring of every
//     heading. Rejected twice over — the opening delimiter cannot be followed by
//     a space, and `resolves` refuses an empty name.
{
  const r = run({ 'a.md': HEADINGS, 'b.md': 'see `a.md` → *   *\n' });
  check('a whitespace-only name does not resolve',
    r.code === 0 && parsed(r.out)?.total === 0,
    `exit=${r.code} got ${JSON.stringify(parsed(r.out))} out=${r.out.trim()}`);
}

// ── Things that must NOT be read as references ──────────────────────────────
// 11. Prose arrows are everywhere ("work → refresh", "PR → green → merge").
{
  const r = run({ 'a.md': `${HEADINGS}\nthe flow is work → refresh → duplicate → exit\n` });
  check('bare prose arrows are not references',
    r.code === 0 && parsed(r.out)?.total === 0, `out=${r.out.trim()}`);
}

// 12. `→ **Bold**` is emphasis, not a reference. Eleven correct sentences in
//     this repo were misread as broken references by one #365 revision.
{
  const r = run({ 'a.md': `${HEADINGS}\nopen → **Settings** → **Notifications**\n` });
  check('bold after an arrow is not a reference',
    r.code === 0 && parsed(r.out)?.total === 0, `out=${r.out.trim()}`);
}

// 13. Fenced blocks document the syntax; they are not live references.
{
  const r = run({
    'a.md': HEADINGS,
    'b.md': 'text\n\n```\nsee `a.md` → *Totally Absent*\n```\n\nmore\n',
  });
  check('a reference inside a fence is not collected',
    r.code === 0 && parsed(r.out)?.total === 0, `exit=${r.code} out=${r.out.trim()}`);
}

// 14. A blank line ends a paragraph, so a name cannot span one.
{
  const r = run({ 'a.md': `${HEADINGS}\nan arrow → *Gamma\n\nDelta* and later *some emphasis* here\n` });
  check('a blank line stops a name',
    r.code === 0 && parsed(r.out)?.total === 0,
    `exit=${r.code} got ${JSON.stringify(parsed(r.out))} out=${r.out.trim()}`);
}

// 15. …including a CRLF blank line, where the first newline is preceded by `\r`.
{
  const r = run({
    'a.md': HEADINGS,
    'b.md': 'text → *not a reference\r\n\r\nlater *emphasis* here\r\n',
  });
  check('a CRLF blank line stops a name',
    r.code === 0 && parsed(r.out)?.total === 0,
    `exit=${r.code} got ${JSON.stringify(parsed(r.out))} out=${r.out.trim()}`);
}

// 16. A CRLF file is not special: a split name is unparsed there too. The
//     carriage return used to be joined into the middle of a logical line and
//     retarget the reference; with no joining there is nothing to carry it.
{
  const r = run({ 'a.md': HEADINGS, 'b.md': 'see `a.md` → *Gamma\r\n   Delta* here\r\n' });
  check('a split name in a CRLF file is not counted either',
    r.code === 0 && parsed(r.out)?.total === 0,
    `exit=${r.code} got ${JSON.stringify(parsed(r.out))} out=${r.out.trim()}`);
}

// 17. The summary states its SCOPE every run. Without that line "187/187
//     resolve" reads as "every reference is checked", which is the half of #363
//     no pattern can fix: the set of spellings this parser cannot see is open,
//     so it is disclosed rather than enumerated (#366).
{
  const r = run({ 'a.md': HEADINGS, 'b.md': 'see `a.md` → Gamma Delta here\n' });
  check('an unparseable form is not counted as resolved',
    r.code === 0 && parsed(r.out)?.total === 0,
    `got ${JSON.stringify(parsed(r.out))} exit=${r.code}`);
  check('the summary discloses that PARSED is not ALL',
    /PARSED/.test(r.out) && /NOT verified/.test(r.out), `out=${r.out.trim()}`);
}

if (failed) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
}
console.log('\nOK: check-links cross-reference scan behaves as specified');
