'use strict';
// Per-project WCAG AA contrast guardrail. Reads this project's styles/tokens.css
// and checks the meaningful foreground/background pairs. Copy into the project's
// .github/scripts/ and run it from qa.yml. If styles/tokens.css doesn't exist yet
// (before /design-intake), it prints a notice and exits 0 — safe in a fresh repo.
// CommonJS (matches the other .github/scripts/ helpers, e.g. notify-email.js).
//
// ── What a green run does NOT prove ─────────────────────────────────────────
// The pair list below is a FLOOR, not a coverage report. It encodes the roles
// these tokens are ASSUMED to play; it cannot see what your project renders.
// Where the assumption is wrong this gate certifies a broken state, and that
// certification is indistinguishable from a correct one. Three ways, all
// measured downstream (claude.prop, 2026-08-23):
//   1. WRONG ROLE. --color-danger is checked as a FOREGROUND over page
//      surfaces. A project whose only use of it is a hover BACKGROUND under a
//      hard-coded #fff agrees with these numbers only while surfaces stay light
//      — contrast is symmetric. Forced to a dark theme with --color-danger:
//      #fff, this script printed 17.30 and 18.50, "OK", 9/9, exit 0, while the
//      delete control rendered white-on-white.
//   2. WRONG FLOOR. accent/surface is checked at AA_LARGE (3.0). A project
//      using --color-accent for 12-13px labels gets 3.54 certified "OK" while
//      every one of those labels fails AA. Our own starter kit is one re-theme
//      from this: templates/styles/components.css renders .btn-secondary:hover
//      and :focus-visible in --color-accent over --color-surface at 15px/500 —
//      normal text, so the real floor is 4.5 — and only the 3.0 pair below
//      measures that combination. (The starter palette is 5.75, so it passes
//      today; nothing here would notice if it stopped.)
//   3. NOT LISTED, NOT MEASURED. Downstream, a chip shipped --color-accent on
//      --color-accent-light at 4.32:1, 11px bold, visible on the dashboard,
//      failing AA the whole time. No hand-written pair described it, and none
//      here does either.
// DERIVING the pairs from components.css instead — every rule declaring both a
// color: and a background: from tokens — catches (3), and is also incomplete:
// it cannot see text that sets a colour and INHERITS its background, which is
// every selector in (2). It also misses what enumeration catches (.btn:hover
// declares a background and no colour). Neither method subsumes the other. A
// complete check resolves each element's EFFECTIVE background through the
// cascade — a different program from this one, and nobody has written it.
// So: "9/9 OK" means the nine listed pairs passed. Before trusting it, confirm
// your token roles match the ones assumed below, derive your own pairs from
// your components.css, and check by hand any text using --color-accent below
// 18.66px (or below 24px when not bold).
// ────────────────────────────────────────────────────────────────────────────
const { readFileSync, existsSync, readdirSync } = require('fs');
const { join } = require('path');

// styles/tokens.css is the design contract's single home (design.md -> Tokens &
// components). Kept as a list so a project with a second token file can add it
// here; every candidate that exists is checked, never just the first.
const CANDIDATES = ['styles/tokens.css'];
const FILES = CANDIDATES.filter((f) => existsSync(f));
if (FILES.length === 0) {
  // A repo with no CSS at all has nothing to check (a fresh scaffold before
  // /design-intake). A repo that HAS stylesheets but none at a known token path
  // is a real gap: failing here is the whole point of a guardrail.
  //
  // "Has CSS" must mean an actual .css file. Treating index.html — or a `styles/`
  // directory that exists but is empty — as proof of CSS failed the static-check
  // job for a fresh project that had a page and no stylesheet yet, contradicting
  // the bootstrap behaviour documented at the top of this file.
  // Recursive, because projects keep stylesheets in src/, public/css/,
  // assets/styles/ and elsewhere. A shallow look at styles/ + app/ + root
  // answered "no CSS" for those and exited 0 — the vacuous green this branch
  // exists to reject.
  const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '.next', 'vendor']);
  // No depth cap. A cutoff turns "I stopped looking" into "there is no CSS" —
  // a monorepo keeping its only stylesheet at packages/client/src/features/…
  // would have passed green. The ignore list below bounds the walk instead,
  // and the search short-circuits on the first .css file found.
  const hasCssUnder = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.css')) return true;
      if (e.isDirectory() && !e.name.startsWith('.') && !IGNORED_DIRS.has(e.name)) {
        if (hasCssUnder(join(dir, e.name))) return true;
      }
    }
    return false;
  };
  const hasCss = hasCssUnder('.');
  if (!hasCss) {
    console.log(`::notice::no stylesheet yet — run /design-intake to establish this project's look. Skipping contrast check.`);
    process.exit(0);
  }
  console.error(`FAIL  this project has CSS but no tokens file at ${CANDIDATES.join(' or ')}.`);
  console.error('      design.md makes tokens.css the single source of truth — the contrast');
  console.error('      guardrail cannot run without it. Create one via /design-intake.');
  process.exit(1);
}

// ── Reading declarations: a SCAN, not a regex ───────────────────────────────
// This was three regexes — strip comments, strip strings, match declarations —
// and #337 round 2 returned NINE findings against them in one pass: five silent
// (a wrong value measured and certified) and four spurious (a valid palette
// rejected). They did not converge. Each fix drew a reshaped one, and the last
// round's own fix became the next round's defect: deleting comments merges the
// tokens either side, so `#15/**/65c0` — which CSS does NOT read as a colour —
// became exactly `#1565c0` and matched the value it was overriding.
// The cause is not any one pattern. Raw-text matching cannot see what CSS sees:
//   * `--color-\61 ccent` is `--color-accent` — an escape in an identifier
//   * `content: "/*"` does not open a comment, and a later `*/` does not close one
//   * a `\` before a newline continues a string
//   * `url(data:…;…)` contains a `;` that is not a separator
//   * `--x: { … }` is a legal custom-property value containing braces
//   * `!important` is a flag on the declaration, not part of the value
// So this walks the file once, in CSS's own terms: comments become a SPACE
// (a boundary, never a join), strings and their escapes are consumed whole,
// brackets nest, and identifier escapes are decoded before the name is read.
// It is not a full CSS parser and does not need to be — it needs to agree with
// one about where a declaration starts and ends, which is all this gate reads.
// Anything it cannot reason about is FATAL, never skipped: `@import` brings in a
// stylesheet this gate never sees, and an unterminated string or comment means
// the rest of the file is not what it appears to be.

// `\` + 1-6 hex digits + optional single whitespace → that code point;
// `\` + anything else → that character literally. Applied to NAMES only: two
// spellings of one custom property must not read as two properties.
function decodeIdent(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '\\') { out += text[i]; continue; }
    const hex = /^[0-9a-fA-F]{1,6}/.exec(text.slice(i + 1));
    if (hex) {
      out += String.fromCodePoint(parseInt(hex[0], 16));
      i += hex[0].length;
      if (/\s/.test(text[i + 1] || '')) i++;   // one whitespace terminator
    } else {
      out += text[i + 1] || '';
      i++;
    }
  }
  return out;
}

// Returns { decls } or { fatal: '…' }. `decls` maps a DECODED custom-property
// name to every value declared for it, in source order.
function scanDeclarations(css) {
  const decls = {};
  let buf = '';          // the declaration candidate being accumulated
  let colonAt = -1;      // index in buf of its first top-level `:`
  const closers = [];    // open ( [ and value-level { , innermost last
  let blocks = 0;        // rule-block nesting

  const flush = () => {
    if (colonAt >= 0) {
      const name = decodeIdent(buf.slice(0, colonAt)).trim();
      if (name.startsWith('--')) {
        // !important is a declaration FLAG; CSS does not put it in the value.
        const value = buf.slice(colonAt + 1).replace(/\s*!\s*important\s*$/i, '').trim();
        (decls[name] ||= []).push(value);
      }
    }
    buf = '';
    colonAt = -1;
  };

  for (let i = 0; i < css.length; i++) {
    const c = css[i];

    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      // A SPACE, not nothing: removing a comment must not weld its neighbours
      // into a token CSS never saw.
      if (end < 0) return { fatal: 'an unterminated /* comment — the rest of the file is inside it' };
      buf += ' ';
      i = end + 1;
      continue;
    }

    if (c === '"' || c === "'") {
      let j = i + 1;
      for (; j < css.length; j++) {
        if (css[j] === '\\') { j++; continue; }   // covers \" and a line continuation
        if (css[j] === c) break;
        if (css[j] === '\n') return { fatal: `an unterminated ${c === '"' ? 'double' : 'single'}-quoted string` };
      }
      if (j >= css.length) return { fatal: `an unterminated ${c === '"' ? 'double' : 'single'}-quoted string` };
      buf += c + c;       // the string stays, its contents do not
      i = j;
      continue;
    }

    if (c === '\\') { buf += c + (css[i + 1] || ''); i++; continue; }   // escape, never a delimiter

    if (c === '(' || c === '[') { closers.push(c === '(' ? ')' : ']'); buf += c; continue; }
    if ((c === ')' || c === ']') && closers[closers.length - 1] === c) { closers.pop(); buf += c; continue; }

    if (c === '{') {
      // A custom property may legally take a value containing balanced braces.
      // Anywhere else, `{` means the text so far was a selector or at-rule
      // prelude, not a declaration.
      if (closers.length > 0 || (colonAt >= 0 && decodeIdent(buf.slice(0, colonAt)).trim().startsWith('--'))) {
        closers.push('}');
        buf += c;
        continue;
      }
      buf = ''; colonAt = -1; blocks++;
      continue;
    }
    if (c === '}') {
      if (closers[closers.length - 1] === '}') { closers.pop(); buf += c; continue; }
      flush();                       // the last declaration may omit its `;`
      if (blocks > 0) blocks--;
      continue;
    }

    if (c === ';' && closers.length === 0) {
      const head = buf.trim().toLowerCase();
      if (head.startsWith('@import') || head.startsWith('@use')) {
        return { fatal: `an ${head.split(/[\s(]/)[0]} rule — it brings in a stylesheet this check never reads` };
      }
      flush();
      continue;
    }

    if (c === ':' && colonAt < 0 && closers.length === 0) colonAt = buf.length;
    buf += c;
  }
  flush();
  if (closers.length > 0 || blocks > 0) return { fatal: 'unbalanced brackets — the file does not parse as CSS' };
  return { decls };
}

let exitCode = 0;
for (const FILE of FILES) {
const scan = scanDeclarations(readFileSync(FILE, 'utf8'));
console.log(`\n── ${FILE}`);
if (scan.fatal) {
  console.error(`\ncheck-contrast: FAIL — ${FILE} contains ${scan.fatal}.`);
  console.error('  This gate refuses input it cannot read rather than measuring the part it');
  console.error('  can: a partial read of a palette produces a confident number about a');
  console.error('  colour the page may never render, which is the defect, not the fix.');
  exitCode = 1;
  continue;
}
const decls = scan.decls;   // decoded name -> [value, …] every declaration, in source order
const t = {};
// Validate and measure the HEX declarations. Non-hex values are RECORDED but not
// measured — they are never skipped, because the ambiguity check below fails on
// any measured token that carries one.
for (const [name, values] of Object.entries(decls)) {
  if (!name.startsWith('--color-')) continue;
  for (const hex of values) {
    if (!/^#[0-9a-fA-F]+$/.test(hex)) continue;
    if (![3, 4, 6, 8].includes(hex.length - 1)) {
      console.error(`check-contrast: ${name} has an invalid hex value "${hex}" (expected 3, 4, 6, or 8 digits)`);
      process.exit(1);
    }
    // ── Reject alpha, never drop it ────────────────────────────────────────────
    // A translucent colour has no contrast ratio of its own: it depends on
    // whatever is painted behind it at the point of use, which this script cannot
    // know. lum() used to drop the channel unconditionally, which scored a fully
    // transparent --color-on-accent: #FFFFFF00 as opaque white — 5.09, reported
    // OK, 9/9, exit 0, on button text that is invisible (claude.prop, 2026-08-23).
    // Compositing instead needs a background we do not have; inventing one is the
    // same confident-wrong-number defect pointed the other way. Refusing the input
    // is the only honest option, so this is fatal like the malformed-hex check
    // above, not a measurement failure.
    // Fully-opaque alpha (FF / F) is exempt: dropping THAT channel is exact rather
    // than an approximation, and design tools export #RRGGBBFF routinely.
    const digits = hex.slice(1);
    const alpha = digits.length === 4 ? digits[3].toLowerCase()
                : digits.length === 8 ? digits.slice(6).toLowerCase()
                : null;
    if (alpha !== null && alpha !== 'f' && alpha !== 'ff') {
      console.error(`check-contrast: ${name} carries an alpha channel ("${hex}") and cannot be measured.`);
      console.error('  A translucent colour has no contrast ratio of its own — it depends on');
      console.error('  whatever is painted behind it where it is used, and this script cannot');
      console.error('  know that. Dropping the channel scored a fully transparent #FFFFFF00 as');
      console.error('  opaque white: 5.09, "OK", on invisible text.');
      console.error('  Fix: declare an opaque #hex (or #RRGGBBFF) here. If the colour is purely');
      console.error('  decorative — a scrim or overlay that is never a text foreground and never');
      console.error('  a text background — declare it in rgba()/hsl() form, which this guardrail');
      console.error('  does not parse.');
      process.exit(1);
    }
    t[name] = hex;
  }
}

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
function lum(hex) {
  let h = hex.replace('#', '');
  // Only FULLY OPAQUE alpha reaches here: the capture loop above rejects any
  // token whose alpha is not FF/F, so dropping the channel is exact, not an
  // approximation. That guard is the only thing keeping this true — a future
  // caller that reaches lum() without passing through it reintroduces the bug
  // where #FFFFFF00 scored as opaque white and certified invisible text.
  if (h.length === 4) h = h.slice(0, 3);
  if (h.length === 8) h = h.slice(0, 6);
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return 0.2126 * lin(parseInt(h.slice(0, 2), 16)) + 0.7152 * lin(parseInt(h.slice(2, 4), 16)) + 0.0722 * lin(parseInt(h.slice(4, 6), 16));
}
const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };

const AA = 4.5, AA_LARGE = 3.0;
// Pairs name their TOKENS, not their values. Listing names and resolving them
// at evaluation time is what lets the ambiguity check below know which tokens
// are actually measured without a second, drift-prone list of names.
const pairs = [
  // No `|| '#FFFFFF'` fallback: substituting a default made the pair "evaluable"
  // while measuring a colour the page may not use, so a project that DROPPED the
  // token still scored 8/8. A missing required token must fail like any other.
  ['--color-on-accent', '--color-accent', AA, 'on-accent / accent (button)'],
  ['--color-text-primary', '--color-bg', AA, 'text-primary / bg'],
  ['--color-text-primary', '--color-surface', AA, 'text-primary / surface'],
  ['--color-text-secondary', '--color-bg', AA, 'text-secondary / bg'],
  ['--color-text-secondary', '--color-surface', AA, 'text-secondary / surface'],
  // Both button templates render the on-accent foreground over accent-hover on
  // hover (and the static one on keyboard focus), so the hover background is a
  // real background for this text and needs its own pair. Checking only the
  // resting state passed themes that go nearly-black-on-dark the moment a
  // pointer touches the control.
  ['--color-on-accent', '--color-accent-hover', AA, 'on-accent / accent-hover (button hover)'],
  ['--color-accent', '--color-surface', AA_LARGE, 'accent / surface (large)'],
  // design.md's error-message copy rule creates --color-danger; it carries meaning,
  // so it needs the same AA floor as any other body text.
  ['--color-danger', '--color-surface', AA, 'danger / surface'],
  ['--color-danger', '--color-bg', AA, 'danger / bg'],
];

// ── One token, two values: refuse, never pick one ──────────────────────────
// The capture loop keeps the LAST hex it sees and cannot see anything else, so
// a token declared twice was silently resolved to one of its declarations and
// the report claimed the file. Two shapes, one argument:
//   * hex then non-hex — `--color-accent: #1565C0` followed anywhere by
//     `--color-accent: rgb(255 255 255)`. CSS applies the rgb(); the gate
//     measured the hex. Reproduced on the shipped tokens.css by appending one
//     line: "OK — 9/9 assumed pairs meet WCAG AA", exit 0, on .btn rendering
//     white on white (#334).
//   * hex then a DIFFERENT hex — a second `:root`, a `[data-theme]` block, a
//     prefers-color-scheme media query. The gate measured whichever came last
//     and said nothing about the other theme.
// Which declaration wins is a cascade question — selector specificity, order,
// media context — and resolving it is the different, larger program this file's
// header already says nobody has written. So this is a refusal, like the
// malformed-hex and alpha branches above, not a measurement failure: picking
// either value produces a confident number about a colour the page may not
// render, which is the defect, not the fix.
// Scoped to MEASURED tokens on purpose. A token no pair reads can be declared
// per theme without this gate having an opinion — failing on it would red-build
// a valid palette to defend a number nobody computes.
const canon = (v) => {
  const raw = v.trim();
  if (!/^#[0-9a-fA-F]+$/.test(raw)) return raw.toLowerCase().replace(/\s+/g, ' ');
  let h = raw.slice(1).toLowerCase();
  if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
  if (h.length === 8 && h.slice(6) === 'ff') h = h.slice(0, 6);   // matches the alpha exemption above
  return `#${h}`;
};
const MEASURED = new Set(pairs.flatMap(([fg, bg]) => [fg, bg]));
const ambiguous = [...MEASURED]
  .map((name) => [name, [...new Set((decls[name] || []).map(canon))]])
  .filter(([, vals]) => vals.length > 1);
if (ambiguous.length > 0) {
  console.error(`\ncheck-contrast: FAIL — ${FILE}: a measured token is declared more than once.`);
  for (const [name, vals] of ambiguous) console.error(`  ${name}: ${vals.join('  |  ')}`);
  console.error('  This script reads declarations, not the cascade: it cannot know which of');
  console.error('  these the page actually renders, and measuring one of them would certify a');
  console.error('  colour that may never appear. It refuses instead of guessing.');
  console.error('  Fix: declare each measured token exactly once in this file, in #hex form.');
  console.error('  If the project themes, give each theme its own tokens file holding that');
  console.error('  theme\'s resolved values, add it to CANDIDATES at the top of this script, and');
  console.error('  let each be measured on its own — one palette per run, every one checked.');
  exitCode = 1;
  continue;
}

let failed = false;
let evaluated = 0;
for (const [fgName, bgName, thr, name] of pairs) {
  const fg = t[fgName], bg = t[bgName];
  if (!fg || !bg) { console.log(`  skip  ${name} (token missing)`); continue; }
  evaluated++;
  const r = ratio(fg, bg), ok = r >= thr;
  if (!ok) failed = true;
  console.log(`${ok ? '  ok' : 'FAIL'}  ${name.padEnd(30)} ${r.toFixed(2)} (need ${thr.toFixed(1)})`);
}

// A green report on zero evaluated pairs is the worst outcome available: it
// certifies WCAG AA having measured nothing. The token regex only reads #hex,
// so a tokens.css written in oklch()/rgb()/hsl()/var() skips every pair —
// exactly the palettes /design-intake now produces.
// ALL six pairs must be evaluable, not merely one. These are the standard token
// contract, and every pair is a required check — warning on a partial run let a
// palette be certified while normal-text contrast was never measured at all,
// which is the same vacuous pass as measuring nothing.
if (evaluated < pairs.length) {
  const missing = pairs.filter(([fg, bg]) => !t[fg] || !t[bg]).map(([, , , name]) => name);
  console.error(`\ncheck-contrast: FAIL — ${FILE}: only ${evaluated}/${pairs.length} pairs were evaluable.`);
  console.error(`  Not measured: ${missing.join('; ')}`);
  console.error('  Each needs both tokens declared in #hex form (oklch()/rgb()/hsl()/var()');
  console.error('  are not parsed). Declare the missing tokens, or extend this script.');
  exitCode = 1;
  continue;
}
// "OK" is scoped deliberately: the listed pairs passed. It is NOT a claim about
// the file — the pair list cannot see the roles this project actually gives its
// tokens (see the header). An unqualified "meets WCAG AA" in a CI log is a
// completeness this script has no basis for.
console.log(failed ? `check-contrast: FAIL — fix ${FILE}` : `check-contrast: OK — ${evaluated}/${pairs.length} assumed pairs meet WCAG AA in ${FILE}`);
if (!failed) console.log('        a floor, not a coverage report: pairs not listed, and tokens used in a role other than the one assumed, are NOT measured — read this script\'s header before trusting the count');
if (failed) exitCode = 1;
}
process.exit(exitCode);
