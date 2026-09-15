#!/usr/bin/env node
// Guards check-links.js's SECTION CROSS-REFERENCE scan.
//
// Why this exists: that scan reports "N/N cross-references resolve", and a
// reference it cannot PARSE is silently absent from both sides of that fraction.
// A partial blindness therefore looks identical to full coverage — the #323
// fail-open family. It was not theoretical: both patterns used [^*\n], so every
// reference whose italicised name wrapped across a line was invisible, and
// twenty such references were live in this repo while CI reported all green
// (#363). Nothing else here would have noticed, because the tree's own
// references are the only input and a missed one produces no output at all.
//
// Each case builds a throwaway tree and runs the SHIPPED checker against it, so
// these test the file that actually ships rather than a copy of its regexes.
// Re-prove discrimination with CHECK_LINKS_BIN=<mutant> node <this file>.
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = process.env.CHECK_LINKS_BIN || join(HERE, 'check-links.js');

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

// Counts the "N/N" the summary reports, or null when the line is absent.
const parsed = (out) => {
  const m = out.match(/(\d+)\/(\d+) section cross-references resolve/);
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

// 6. …and an absurdly long match is an unclosed delimiter, not a section name.
{
  const long = 'x'.repeat(200);
  const r = run({ 'a.md': HEADINGS, 'b.md': `see \`a.md\` → *${long}*\n` });
  check('an over-long name is skipped, not reported as broken',
    r.code === 0 && parsed(r.out)?.total === 0,
    `exit=${r.code} out=${r.out.trim()}`);
}

// 7. The undelimited form cannot be parsed — its name has no end. It must be
//    NAMED as unchecked rather than silently dropped, which is the whole point:
//    the summary must stop implying coverage it does not have.
{
  const r = run({ 'a.md': HEADINGS, 'b.md': 'see `a.md` → Gamma Delta here\n' });
  check('undelimited reference is reported as NOT checked',
    /NOT checked/.test(r.out) && /b\.md/.test(r.out),
    `out=${r.out.trim()}`);
  check('undelimited reference does not fail the build',
    r.code === 0, `exit=${r.code}`);
  check('undelimited reference is not counted as resolved',
    parsed(r.out)?.total === 0,
    `got ${JSON.stringify(parsed(r.out))}`);
}

// 8. Prose arrows are everywhere ("work → refresh", "PR → green → merge"). The
//    undelimited report keys off a backticked .md filename precisely so those
//    are not swept in; if that ever loosens, this repo's own files light up.
{
  const r = run({ 'a.md': `${HEADINGS}\nthe flow is work → refresh → duplicate → exit\n` });
  check('bare prose arrows are not reported as references',
    !/NOT checked/.test(r.out) && r.code === 0,
    `out=${r.out.trim()}`);
}

// 9. Fenced blocks are documentation OF the syntax, not live references —
//    preserved behaviour, and a regex change is exactly what would break it.
{
  const r = run({
    'a.md': HEADINGS,
    'b.md': 'text\n\n```\nsee `a.md` → *Totally Absent*\n```\n\nmore\n',
  });
  check('a reference inside a fence is not collected',
    r.code === 0 && parsed(r.out)?.total === 0,
    `exit=${r.code} out=${r.out.trim()}`);
}

// 10. An explicit file that resolves to nothing is still an error — the arm that
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
