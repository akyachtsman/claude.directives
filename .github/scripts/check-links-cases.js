#!/usr/bin/env node
// Guards check-links.js's SECTION CROSS-REFERENCE scan.
//
// Why this exists: that scan reports "N/N cross-references resolve", and a
// reference it could not PARSE was silently absent from both sides of that
// fraction. Partial blindness therefore looked identical to full coverage — the
// #323 fail-open family. It was not theoretical: both patterns used [^*\n], so
// every reference whose italicised name wrapped across a line was invisible,
// and twenty such references were live in this repo while CI reported all green
// (#363). Nothing else here would have noticed, because the tree's own
// references are the only input and a missed one produces no output at all.
//
// SCOPE, and why it is this narrow. #365 first tried to make the scan report
// everything it could not parse. Three review rounds each found another
// Markdown spelling that escaped the enumeration — an unterminated `*`, a wrap
// before the arrow, a filename outside the character class — so the set of
// "references I failed to see" is open, and every claim to have closed it was
// itself a fail-open. The checker now states its scope as a disposition instead
// and reports only its OWN discards, which is a set closed by construction.
// #366 carries the widening. Cases here test that narrower contract; do not add
// one asserting that some new malformed spelling is reported.
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
// every case would "discriminate" by crashing — a discrimination proof that
// proves nothing. Measured: the original proof passed only because the path
// handed to it happened to be absolute.
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
// because it could not read the output is indistinguishable from a case that
// caught something. Case 9 tests the wording, deliberately and alone.
const parsed = (out) => {
  const m = out.match(/(\d+)\/(\d+) (?:PARSED )?section cross-references resolve/);
  return m ? { good: +m[1], total: +m[2] } : null;
};

const HEADINGS = '# Alpha Beta\n\n## Gamma Delta\n\ntext\n';

// 1-2. The blind spot itself, in both directions. A wrapped name must be SEEN,
//      which means a broken one must fail and a correct one must count.
{
  const wrappedGood = run({
    'a.md': HEADINGS,
    'b.md': 'see `a.md` → *Gamma\n   Delta* here\n',
  });
  check('wrapped name that resolves is counted',
    parsed(wrappedGood.out)?.total === 1 && wrappedGood.code === 0,
    `got ${JSON.stringify(parsed(wrappedGood.out))} exit=${wrappedGood.code}`);

  const wrappedBad = run({
    'a.md': HEADINGS,
    'b.md': 'see `a.md` → *Gamma\n   Nonexistent* here\n',
  });
  check('wrapped name that does NOT resolve fails',
    wrappedBad.code !== 0 && /Gamma Nonexistent/.test(wrappedBad.out),
    `exit=${wrappedBad.code} out=${wrappedBad.out.trim()}`);
}

// 3. The self form (no file named) wraps too, and was blind for the same reason.
{
  const r = run({ 'a.md': `${HEADINGS}\nsee → *Gamma\n   Nonexistent* here\n` });
  check('wrapped SELF reference that does not resolve fails',
    r.code !== 0 && /Gamma Nonexistent/.test(r.out),
    `exit=${r.code} out=${r.out.trim()}`);
}

// 4. Single-line references must still work — the fix must not trade one form
//    for another.
{
  const r = run({ 'a.md': HEADINGS, 'b.md': 'see `a.md` → *No Such Heading*\n' });
  check('single-line broken reference still fails',
    r.code !== 0 && /No Such Heading/.test(r.out),
    `exit=${r.code}`);
}

// 5. The cost of allowing newlines: an unclosed `*` must not run away and
//    swallow prose up to the next asterisk. A BLANK line stops it.
{
  const r = run({
    'a.md': `${HEADINGS}\nan arrow → *Gamma\n\nDelta* and later *some emphasis* here\n`,
  });
  check('a blank line stops a runaway match',
    parsed(r.out)?.total === 0 && r.code === 0,
    `got ${JSON.stringify(parsed(r.out))} exit=${r.code} out=${r.out.trim()}`);
}

// 5b. …and a CRLF blank line stops it too. `\r\n\r\n` puts a `\r` where the
//     lookahead expected the blank line, so the runaway crossed it and matched
//     the next emphasis marker — on LF input the identical file was ignored.
{
  const r = run({
    'a.md': HEADINGS,
    'b.md': 'text → *not a reference\r\n\r\nlater *emphasis* here\r\n',
  });
  check('a CRLF blank line stops a runaway match',
    parsed(r.out)?.total === 0 && r.code === 0,
    `got ${JSON.stringify(parsed(r.out))} exit=${r.code} out=${r.out.trim()}`);
}

// 6. An absurdly long match is an unclosed delimiter, not a section name. It is
//    NOT checked — so it must be NAMED. Dropping it silently is the same
//    fail-open this file exists to catch, and an earlier revision of this case
//    asserted the drop as correct behaviour. These discards are a CLOSED set:
//    matches the parser made and rejected, not a guess at what it never saw.
{
  const long = 'x'.repeat(200);
  const r = run({ 'a.md': HEADINGS, 'b.md': `see \`a.md\` → *${long}*\n` });
  check('an over-long name is not reported as broken',
    r.code === 0 && parsed(r.out)?.total === 0,
    `exit=${r.code} out=${r.out.trim()}`);
  check('an over-long name is NAMED as discarded, not silently dropped',
    /DISCARDED/.test(r.out) && /b\.md:1:/.test(r.out),
    `out=${r.out.trim()}`);
}

// 6b. The same for the SELF form — it has its own copy of the length check, and
//     a fix applied to one arm and not the other is how this blind spot began.
//     Line 8 is the reference; the consumed-newline bug reported line 7.
{
  const long = 'y'.repeat(200);
  const r = run({ 'a.md': `${HEADINGS}\nintro\n→ *${long}*\n` });
  check('an over-long SELF name is NAMED as discarded',
    r.code === 0 && /DISCARDED/.test(r.out) && parsed(r.out)?.total === 0,
    `exit=${r.code} out=${r.out.trim()}`);
  check('a column-1 self reference reports its OWN line',
    /a\.md:8:/.test(r.out) && !/a\.md:7:/.test(r.out),
    `out=${r.out.trim()}`);
}

// 7. Heading whitespace is normalised on BOTH sides. Collapsing only the
//    reference broke an EXACT single-line match against a heading carrying a
//    double space — a regression the wrapped-name fix itself introduced.
{
  const r = run({
    'a.md': '# Top\n\n## Alpha  Beta\n\ntext\n',
    'b.md': 'see `a.md` → *Alpha  Beta*\n',
  });
  check('a double space in the heading still resolves',
    r.code === 0 && parsed(r.out)?.good === 1 && parsed(r.out)?.total === 1,
    `exit=${r.code} got ${JSON.stringify(parsed(r.out))} out=${r.out.trim()}`);
}

// 8. …and normalising both sides made an EMPTY name reachable: every string
//    contains the empty string, so `→ *   *` resolved against any file with a
//    heading at all. A nameless reference resolves to nothing, by definition.
{
  const r = run({ 'a.md': HEADINGS, 'b.md': 'see `a.md` → *   *\n' });
  check('a whitespace-only name does NOT resolve',
    r.code !== 0 && parsed(r.out)?.good === 0,
    `exit=${r.code} got ${JSON.stringify(parsed(r.out))} out=${r.out.trim()}`);
}

// 9. The summary states its SCOPE every run. Without that line, "187/187
//    resolve" reads as "every reference is checked", which is the half of #363
//    that no pattern can fix: the set of spellings this parser cannot see is
//    open, so it is disclosed rather than enumerated.
{
  const r = run({ 'a.md': HEADINGS, 'b.md': 'see `a.md` → Gamma Delta here\n' });
  check('an unparseable form is not counted as resolved',
    parsed(r.out)?.total === 0 && r.code === 0,
    `got ${JSON.stringify(parsed(r.out))} exit=${r.code}`);
  check('the summary discloses that PARSED is not ALL',
    /PARSED/.test(r.out) && /NOT verified/.test(r.out),
    `out=${r.out.trim()}`);
}

// 10. Prose arrows are everywhere ("work → refresh", "PR → green → merge") and
//     must never be mistaken for references.
{
  const r = run({ 'a.md': `${HEADINGS}\nthe flow is work → refresh → duplicate → exit\n` });
  check('bare prose arrows are not references',
    parsed(r.out)?.total === 0 && r.code === 0,
    `out=${r.out.trim()}`);
}

// 11. Fenced blocks are documentation OF the syntax, not live references —
//     preserved behaviour, and a regex change is exactly what would break it.
{
  const r = run({
    'a.md': HEADINGS,
    'b.md': 'text\n\n```\nsee `a.md` → *Totally Absent*\n```\n\nmore\n',
  });
  check('a reference inside a fence is not collected',
    r.code === 0 && parsed(r.out)?.total === 0,
    `exit=${r.code} out=${r.out.trim()}`);
}

// 12. Fences are replaced by equal newline padding, not deleted, so a reported
//     line number is the SOURCE line number. Deleting shifted every location
//     after a fence upward, pointing readers at the wrong line.
{
  const r = run({
    'a.md': HEADINGS,
    'b.md': `intro\n\`\`\`\nfenced\nmore\n\`\`\`\nsee \`a.md\` → *${'q'.repeat(200)}*\n`,
  });
  check('a line number after a fence is the SOURCE line',
    /b\.md:6:/.test(r.out), `out=${r.out.trim()}`);
}

// 13. An explicit file that resolves to nothing is still an error — the arm that
//     once returned "0/0 … resolve" and exited 0.
{
  const r = run({ 'a.md': HEADINGS, 'b.md': 'see `ghost.md` → *Gamma Delta*\n' });
  check('reference to a nonexistent file fails',
    r.code !== 0 && /ghost\.md/.test(r.out),
    `exit=${r.code} out=${r.out.trim()}`);
}

if (failed) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
}
console.log('\nOK: check-links cross-reference scan behaves as specified');
