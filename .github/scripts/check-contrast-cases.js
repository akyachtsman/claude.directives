// check-contrast-cases.js — pinned cases for templates/scripts/check-contrast.js.
//
// WHY THIS EXISTS. #334 filed three guards that reported green about something
// they never checked. The contrast one measured a token's SUPERSEDED value: the
// capture regex read only #hex, so `--color-accent: rgb(255 255 255)` declared
// after the hex was invisible, and the gate printed "OK — 9/9 assumed pairs meet
// WCAG AA", exit 0, on a button rendering white on white. That is the failure
// mode this file exists to keep closed, and it is silent by construction — the
// only observable difference between a working gate and a broken one here is a
// number nobody re-derives.
//
// #334 also states the requirement every case below is written against:
//   "a case where the checked thing is present and UNREADABLE, not merely
//    absent. A fix verified only against … tokens that are all hex is inert."
// So each refusal case is paired with a twin that must NOT fail, and each case
// pins BOTH the exit code and a required diagnostic substring — the script has
// six distinct ways to exit 1, and a case asserting only "exit 1" can keep
// passing while the branch it was written for is reverted and a different check
// catches the input instead (the lesson check-workflow-ref-guard.py records).
//
// NOT exported: .github/ is outside every EXPORTS.json category path, so no
// manifest entry is required for this file.
// ESM (.github/scripts/package.json declares "type": "module").
//
// Run: node .github/scripts/check-contrast-cases.js
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECK = join(REPO_ROOT, 'templates', 'scripts', 'check-contrast.js');
const SHIPPED_TOKENS = join(REPO_ROOT, 'templates', 'styles', 'tokens.css');

// A self-contained palette, deliberately NOT the shipped one. The mutation cases
// below assert exact ratios' worth of behaviour; pinning them to templates/styles
// would make this suite fail whenever the starter palette is re-themed, which is
// a different thing going wrong. One case does read the shipped file, on purpose.
const BASE = `:root {
  --color-bg:             #F5F7FA;
  --color-surface:        #FFFFFF;
  --color-border:         #DAE2EE;
  --color-text-primary:   #181B22;
  --color-text-secondary: #5F6573;
  --color-accent:         #1565C0;
  --color-accent-hover:   #114F98;
  --color-danger:         #C0392B;
  --color-on-accent:      #FFFFFF;
}
`;
const plus = (extra) => BASE + extra;

const OK9 = 'OK — 9/9 assumed pairs meet WCAG AA';
const DUP = 'a measured token is declared more than once';

// (label, {relative path: contents}, expected exit, required diagnostic)
const CASES = [
  ['baseline palette, every measured token declared once in hex',
    { 'styles/tokens.css': BASE }, 0, OK9],

  // The shipped contract must satisfy its own guardrail. This is the one case
  // that reads templates/styles/ — a starter kit that fails the gate it ships
  // beside is a bootstrap that cannot go green on day one.
  ['the shipped starter tokens.css', { __shipped: true }, 0, OK9],

  // ── #334's repro, verbatim ────────────────────────────────────────────────
  // CSS applies the rgb(); before the fix the gate measured #1565C0 and printed
  // OK. Reverting the ambiguity check must make this case exit 0 again — that is
  // what makes it a test of the fix rather than of the script.
  ['non-hex override of a measured token (#334)',
    { 'styles/tokens.css': plus(':root { --color-accent: rgb(255 255 255); }\n') }, 1, DUP],

  ['non-hex override in var() form',
    { 'styles/tokens.css': plus(':root { --color-danger: var(--color-text-primary); }\n') }, 1, DUP],

  ['non-hex override in oklch() form',
    { 'styles/tokens.css': plus(':root { --color-on-accent: oklch(0.98 0 0); }\n') }, 1, DUP],

  // The scoping twin. --color-border is read by no pair, so a second declaration
  // of it is none of this gate's business: failing here would red-build a valid
  // palette to defend a number nobody computes.
  ['non-hex override of an UNMEASURED token must NOT fail',
    { 'styles/tokens.css': plus(':root { --color-border: rgb(1 2 3); }\n') }, 0, OK9],

  // Same argument as the non-hex override, one shape over: the gate kept the last
  // hex and said nothing about the other theme.
  // Both overrides below are chosen to PASS every pair on their own. A second
  // value that happened to fail would make these cases red before the fix and red
  // after it, for different reasons — indistinguishable from a working check, and
  // exactly the non-discriminating fixture #333 spent a round on. With a passing
  // override, removing the refusal returns them to exit 0.
  ['a second, different hex for a measured token (theme block)',
    { 'styles/tokens.css': plus('[data-theme="dark"] { --color-accent: #0D47A1; }\n') }, 1, DUP],

  ['a prefers-color-scheme override of a measured token',
    { 'styles/tokens.css': plus('@media (prefers-color-scheme: dark) {\n  :root { --color-bg: #FFFFFF; }\n}\n') },
    1, DUP],

  // ── The must-NOT-fail twins for the ambiguity check ───────────────────────
  // A repeated declaration of the SAME colour has nothing to resolve. If these
  // fail, the check is refusing on declaration COUNT rather than on ambiguity,
  // which is a different rule than the one documented.
  ['the identical hex declared twice must NOT fail',
    { 'styles/tokens.css': plus(':root { --color-accent: #1565C0; }\n') }, 0, OK9],

  ['#FFF and #FFFFFF are the same colour and must NOT fail',
    { 'styles/tokens.css': plus(':root { --color-on-accent: #FFF; }\n') }, 0, OK9],

  ['#FFFFFFFF and #FFFFFF are the same colour and must NOT fail',
    { 'styles/tokens.css': plus(':root { --color-on-accent: #FFFFFFFF; }\n') }, 0, OK9],

  ['case-differing hex for the same colour must NOT fail',
    { 'styles/tokens.css': plus(':root { --color-accent: #1565c0; }\n') }, 0, OK9],

  // ── The terminator class the two capture jobs share ───────────────────────
  // The last declaration in a block may legally omit its semicolon. If the
  // regex required one, this token would go missing and the run would fail as
  // "not evaluable" — a red build on valid CSS.
  ['a measured token whose declaration omits the trailing semicolon',
    { 'styles/tokens.css': BASE.replace('  --color-on-accent:      #FFFFFF;\n}', '  --color-on-accent: #FFFFFF }') },
    0, OK9],

  // The other side of that terminator class. A semicolon missing MID-block is
  // invalid CSS, and the value pattern then runs on to the next `;` — swallowing
  // the following declaration. That must surface, and it does: the swallowed
  // token goes missing and the run fails as not-evaluable. Pinned because the
  // alternative reading of the same input — quietly measuring one token fewer —
  // is the vacuous green this whole file is about.
  ['a semicolon missing MID-block fails loudly rather than passing',
    { 'styles/tokens.css': BASE.replace('--color-danger:         #C0392B;', '--color-danger: #C0392B') },
    1, 'pairs were evaluable'],

  // …and its unreadable twin: the same missing semicolon on a NON-hex override
  // must still be seen as a second declaration. A terminator class that differed
  // between the two jobs would lose exactly this one.
  ['a non-hex override whose declaration omits the trailing semicolon',
    { 'styles/tokens.css': plus(':root { --color-accent: rgb(255 255 255) }\n') }, 1, DUP],

  // ── Comments are not declarations ─────────────────────────────────────────
  // CSS never applies these, so neither reading of them is a finding: the old
  // code let a commented-out line overwrite the live token in `t` (last match
  // wins, and a comment is a match), and the duplicate refusal would reject a
  // valid file over it. Both directions pinned.
  ['a commented-out override of a measured token must NOT fail',
    { 'styles/tokens.css': plus('/* :root { --color-accent: rgb(255 255 255); } */\n') }, 0, OK9],

  ['a commented-out hex must not overwrite the live token',
    { 'styles/tokens.css': plus('/* --color-text-secondary: #C9CDD4; */\n') }, 0, OK9],

  // ── Pre-existing branches, pinned so the new code cannot swallow them ─────
  ['a measured token declared only in non-hex form is not evaluable',
    { 'styles/tokens.css': BASE.replace('--color-danger:         #C0392B;', '--color-danger: rgb(192 57 43);') },
    1, 'pairs were evaluable'],

  ['a malformed hex fails loudly rather than being skipped',
    { 'styles/tokens.css': BASE.replace('--color-accent:         #1565C0;', '--color-accent: #1565C0F;') },
    1, 'invalid hex value'],

  ['a translucent token is refused, not composited',
    { 'styles/tokens.css': BASE.replace('--color-on-accent:      #FFFFFF;', '--color-on-accent: #FFFFFF00;') },
    1, 'carries an alpha channel'],

  ['a real contrast failure still fails',
    { 'styles/tokens.css': BASE.replace('--color-text-secondary: #5F6573;', '--color-text-secondary: #C9CDD4;') },
    1, 'check-contrast: FAIL — fix'],

  ['CSS present but no tokens file is a gap, not a skip',
    { 'src/app.css': '.a { color: red; }\n' }, 1, 'no tokens file at'],

  ['a repo with no CSS at all bootstraps green',
    { 'index.html': '<!doctype html><title>x</title>\n' }, 0, 'no stylesheet yet'],
];

function runCase(files) {
  const tmp = mkdtempSync(join(tmpdir(), 'contrast-cases-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      if (rel === '__shipped') {
        mkdirSync(join(tmp, 'styles'), { recursive: true });
        writeFileSync(join(tmp, 'styles', 'tokens.css'), readFileSync(SHIPPED_TOKENS, 'utf8'));
        continue;
      }
      const dest = join(tmp, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, body, 'utf8');
    }
    const r = spawnSync(process.execPath, [CHECK], { encoding: 'utf8', cwd: tmp });
    return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const failures = [];
for (const [label, files, expected, diagnostic] of CASES) {
  const { code, out } = runCase(files);
  if (code !== expected) {
    failures.push(`${label}\n      expected exit ${expected}; got ${code}.\n      ${out}`);
  } else if (!out.includes(diagnostic)) {
    failures.push(`${label}\n      exited ${code} as expected, but for the wrong stated reason.\n`
      + `      expected the output to contain: ${JSON.stringify(diagnostic)}\n      ${out}`);
  } else {
    console.log(`OK:   ${label} (exit ${code})`);
  }
}

if (failures.length) {
  console.error('\ncheck-contrast-cases: FAILED\n');
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log(`check-contrast-cases: OK — ${CASES.length} pinned token-file shapes read correctly.`);
