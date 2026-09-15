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
// The shipped design removes the wrap before matching and keeps the original
// single-line pattern, so most of these cases are regression pins for defects
// that design makes unreachable. Each is labelled with the round that found it.
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

// ── The defect this file exists for (#363) ──────────────────────────────────
// 1-3. A wrapped name must be SEEN: a broken one fails, a correct one counts,
//      and the self form (no file named) wrapped for the same reason.
{
  const good = run({ 'a.md': HEADINGS, 'b.md': 'see `a.md` → *Gamma\n   Delta* here\n' });
  check('wrapped name that resolves is counted',
    good.code === 0 && parsed(good.out)?.total === 1,
    `got ${JSON.stringify(parsed(good.out))} exit=${good.code}`);

  const bad = run({ 'a.md': HEADINGS, 'b.md': 'see `a.md` → *Gamma\n   Nonexistent* here\n' });
  check('wrapped name that does NOT resolve fails',
    bad.code !== 0 && /Gamma Nonexistent/.test(bad.out),
    `exit=${bad.code} out=${bad.out.trim()}`);

  const self = run({ 'a.md': `${HEADINGS}\nsee → *Gamma\n   Nonexistent* here\n` });
  check('wrapped SELF reference that does not resolve fails',
    self.code !== 0 && /Gamma Nonexistent/.test(self.out),
    `exit=${self.code} out=${self.out.trim()}`);
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

// 16. A wrapped name in a CRLF file still resolves — joining must not leave the
//     carriage return embedded in the compared name.
{
  const r = run({ 'a.md': HEADINGS, 'b.md': 'see `a.md` → *Gamma\r\n   Delta* here\r\n' });
  check('a wrapped name resolves in a CRLF file',
    r.code === 0 && parsed(r.out)?.good === 1,
    `exit=${r.code} got ${JSON.stringify(parsed(r.out))} out=${r.out.trim()}`);
}

// ── #367 round 1: the joining step's own failure modes ─────────────────────
// 18. A block that INTERRUPTS a paragraph must not be joined into it. Joining
//     across one manufactures a reference out of two unrelated blocks — an HTML
//     block produced `*draft <div>*` and FAILED a valid file, which is the
//     dangerous direction: erring the other way only leaves a reference unseen.
for (const [label, second] of [
  ['an HTML block', '<div>*</div>'],
  ['a setext underline', '==='],
  ['a table delimiter', '---|---'],
]) {
  const r = run({ 'a.md': '# Top\n\n## Gamma\n\ntext\n', 'b.md': `The status is → *draft\n${second}\n` });
  check(`${label} is not joined into the paragraph above it`,
    r.code === 0 && parsed(r.out)?.total === 0,
    `exit=${r.code} got ${JSON.stringify(parsed(r.out))} out=${r.out.trim()}`);
}

// 19. The closing delimiter's right-flanking half. Without it `*Wow!*now` closed
//     on a star CommonMark does not treat as a closer, certifying prose as a
//     reference — the summary promises the italic form and this was not one.
{
  const r = run({ 'a.md': '# Top\n\n## Wow!\n\ntext\n', 'b.md': 'see `a.md` → *Wow!*now\n' });
  check('a closing star followed by a word character does not close',
    r.code === 0 && parsed(r.out)?.total === 0,
    `exit=${r.code} got ${JSON.stringify(parsed(r.out))} out=${r.out.trim()}`);
}

// 20. A trailing CR must be dropped, not joined. Left in, it sits between tokens
//     the patterns separate with [ \t]*, so a CRLF wrap between a filename and
//     its arrow stopped matching the explicit-file form and was silently
//     re-matched as a SELF reference — resolving against the WRONG file, and
//     reporting 1/1 when the named file has no such heading.
{
  const r = run({
    'a.md': '# Top\n\n## Other\n\ntext\n',
    'b.md': '## Absent\n\nsee `a.md`\r\n → *Absent*\r\n',
  });
  check('a CRLF wrap before the arrow still names the EXPLICIT file',
    r.code !== 0 && /Absent/.test(r.out) && /a\.md/.test(r.out),
    `exit=${r.code} out=${r.out.trim()}`);
}

// 21. The offset map must actually be USED. It was built, paid for per
//     character, and discarded — so the fence padding and the lookbehind bought
//     nothing and diagnostics named only the file. A failure now carries the
//     source line, and the fence case proves padding keeps it honest.
{
  const r = run({ 'a.md': '# Top\n\n## Gamma\n\ntext\n', 'b.md': 'intro\n\nsee `a.md` → *Nope*\n' });
  check('a failure names the source line, not just the file',
    /b\.md:3:/.test(r.out), `out=${r.out.trim()}`);

  const fenced = run({
    'a.md': '# Top\n\n## Gamma\n\ntext\n',
    'b.md': 'intro\n```\nfenced\nmore\n```\nsee `a.md` → *Nope*\n',
  });
  check('that line number survives a fence above it',
    /b\.md:6:/.test(fenced.out), `out=${fenced.out.trim()}`);
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
