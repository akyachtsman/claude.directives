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
const { readFileSync, existsSync, readdirSync, statSync, realpathSync } = require('fs');
const { join } = require('path');

// styles/tokens.css is the design contract's single home (design.md -> Tokens &
// components). Kept as a list so a project with a second token file can add it
// here; every candidate that exists is checked, never just the first.
const CANDIDATES = ['styles/tokens.css'];
const FILES = CANDIDATES.filter((f) => existsSync(f));

// A CONFIGURED candidate that is gone is a broken configuration, not a fresh
// repo. The single default below is a path this script GUESSES; a second entry
// can only get there by a human editing this line to say "this project's tokens
// live in these files" (design.md -> a themed project gives each theme its own
// file). Filtering both through existsSync measured the surviving theme and
// printed green for it, while the renamed one was never read -- the every-theme
// guarantee reported about a file nobody opened. So once more than one is
// declared, a missing one is FATAL. With exactly one, a miss is already covered:
// absent + no CSS is the bootstrap notice, absent + CSS present is the gap below.
const MISSING = CANDIDATES.filter((f) => !existsSync(f));
if (CANDIDATES.length > 1 && MISSING.length > 0) {
  console.error(`FAIL  ${MISSING.length} of ${CANDIDATES.length} configured token files do not exist:`);
  for (const f of MISSING) console.error(`        ${f}`);
  console.error('      CANDIDATES names the files this project declares as its design contract.');
  console.error('      Measuring only the ones still present would certify a palette this gate');
  console.error('      never read. Restore the file, or drop it from CANDIDATES.');
  process.exit(1);
}
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
  // Dirent's isFile()/isDirectory() are BOTH false for a symlink, so link
  // handling used to be a special case bolted onto the file test — which left
  // the other half open: `assets -> ../shared/assets` holding the project's only
  // stylesheet was neither a file nor a directory, so it was not counted and not
  // descended into, and the walk answered "no CSS at all". One resolution step
  // for every entry replaces both special cases: ask the filesystem what the
  // entry IS, once, and let the file and directory branches read the answer.
  // realpath keys the visited set, so a link cycle (`a -> .`) terminates.
  const visited = new Set();
  const hasCssUnder = (dir) => {
    let entries;
    try {
      const real = realpathSync(dir);
      if (visited.has(real)) return false;   // a symlink cycle, already walked
      visited.add(real);
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const e of entries) {
      const path = join(dir, e.name);
      let isFile = e.isFile();
      let isDir = e.isDirectory();
      if (!isFile && !isDir) {
        // A symlink, or something this walk has no opinion about. statSync
        // follows the link; a broken one throws and is neither.
        try {
          const st = statSync(path);
          isFile = st.isFile();
          isDir = st.isDirectory();
        } catch { continue; }
      }
      if (isFile && e.name.endsWith('.css')) return true;
      if (isDir && !e.name.startsWith('.') && !IGNORED_DIRS.has(e.name)) {
        if (hasCssUnder(path)) return true;
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
//   * `--x: { … }` is a legal custom-property value containing braces
//   * `!important` is a flag on the declaration, not part of the value
// So this walks the file once, in CSS's own terms: comments become a SPACE
// (a boundary, never a join), strings and their escapes are consumed whole,
// brackets nest, and what it cannot read in CSS's terms it REFUSES rather than
// guessing at -- identifier escapes among them.
// It is not a full CSS parser and does not need to be — it needs to agree with
// one about where a declaration starts and ends, which is all this gate reads.
// Anything it cannot reason about is FATAL, never skipped: `@import` brings in a
// stylesheet this gate never sees, and an unterminated string or comment means
// the rest of the file is not what it appears to be.

// NO ESCAPE DECODER. There was one, for two rounds, and it was the wrong shape:
// `--color-\61 ccent` really is `--color-accent`, so a decoder unified them —
// and then `\FFFFFF` threw a RangeError out of String.fromCodePoint (CSS maps an
// invalid code point to U+FFFD), `@\69mport` slipped past the at-rule check
// because the raw text did not start with `@import`, and `!\69mportant` was not
// recognised as the flag. Three findings, one per surface the decoder touched.
// A backslash outside a string or a comment has no legitimate place in a design
// token file, so it is FATAL instead — one rule, no decoder, and none of those
// three classes can exist. Loud beats clever: refusing an escaped identifier
// tells the author to spell it plainly; decoding it correctly everywhere is a
// standing invitation to miss one surface.

// At-rules are checked at BOTH terminators, `;` and `{`. Checking only `;`
// missed every block-form at-rule, and an @import can be reached through a
// prelude the old check did not recognise. Allow-list rather than deny-list.
// The MEMBERSHIP RULE is derived — a GROUPING at-rule's block holds rules and
// declarations that cascade exactly as if the wrapper were not there, so
// reading through one reads the same declarations the browser applies — but
// THE LIST IS NOT CLAIMED COMPLETE, and saying it was cost two rounds: @layer
// was missing in round 5 and @starting-style in round 7, each refusing a valid
// stylesheet. CSS gains grouping rules over time and this list will lag them.
// That is survivable in exactly one direction: a short list REFUSES a valid
// file, loudly, and the fix is to add a name here. A long one would read a
// block whose declarations do not apply, which is silent. Add on evidence.
// Everything NOT in this set is refused because it is a different thing: it
// brings in text this gate never sees (`@import`, `@use`), or its declarations
// apply to something other than an element (`@font-face`, `@keyframes`,
// `@property`, `@page`), so reading them as live tokens would be wrong.
const AT_RULES_READ = new Set(['media', 'supports', 'layer', 'container', 'scope']);
const AT_RULES_LIST = [...AT_RULES_READ].map((n) => `@${n}`).join(', ');

// ── CSS whitespace, not JavaScript's ────────────────────────────────────────
// CSS whitespace is exactly these five code points. String.prototype.trim()
// removes a far larger set, U+00A0 among them — and U+00A0 is an IDENTIFIER
// character in CSS. Trimming it off a name RENAMES the property: a file
// declaring `--color-bg<NBSP>` (nine times over) left the browser with no
// palette at all, while this gate trimmed each name back to the token it
// measures and printed `OK — 9/9`, exit 0. One definition, used wherever a CSS
// token is bounded here, because the same trim runs on names, values and the
// !important flag and each one renames or revalues what it touches.
const cssTrim = (t) => t.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, '');

// A custom-property name this check can vouch for. CSS allows far more — every
// non-ASCII code point is an identifier character, and escapes spell anything —
// but this gate MEASURES these names by comparing them literally, so one it
// cannot compare is FATAL rather than skipped. A silent skip is what let `--é`
// past the brace refusal below, and a skipped name is indistinguishable from a
// file that never declared it.
const PLAIN_CUSTOM_NAME = /^--[A-Za-z0-9_-]*$/;
function atRuleProblem(buf) {
  const head = cssTrim(buf);
  if (!head.startsWith('@')) return null;
  // The WHOLE identifier, not a prefix of it. `[A-Za-z-]*` stopped at the first
  // character it did not know, so `@media_` yielded `media`, matched the
  // allow-list, and the scanner read a block CSS discards — nine tokens, exit 0.
  // CSS identifier characters are letters, digits, `_`, `-` and everything at
  // U+0080 and above, which is the same class the url() boundary uses; matching
  // it here means an unknown at-rule cannot masquerade as a known one by
  // sharing its opening letters.
  const name = (/^@([A-Za-z0-9_\u0080-\uFFFF-]*)/.exec(head) || [, ''])[1].toLowerCase();
  if (AT_RULES_READ.has(name)) return null;
  return `an @${name || '(unreadable)'} rule — only the grouping at-rules (${AT_RULES_LIST}) wrap declarations this check can read`;
}

// Returns { decls } or { fatal: '…' }. `decls` maps a custom-property name to
// every value declared for it, in source order. Names are AS SPELLED: an
// escaped identifier is refused, never decoded, so nothing here has unified two
// spellings of one property and no caller may assume it has.
function scanDeclarations(css) {
  const decls = {};
  let buf = '';          // the declaration candidate being accumulated
  let colonAt = -1;      // index in buf of its first top-level `:`
  const closers = [];    // open ( and [ , innermost last
  // Plain nesting depth. There was a block-KIND stack here, to decide whether a
  // `{` opened a rule or a custom-property value; the branch below refuses
  // brace-valued declarations outright instead, so nothing needs to know what a
  // block contains and the only question left is whether one is open.
  let depth = 0;
  // ── AMBIGUOUS BLOCKS ───────────────────────────────────────────────────────
  // One flag per open block: is this block, or any block containing it, opened
  // by a prelude that might be a DECLARATION rather than a selector?
  // `unknown: !important { … }` is such a prelude. CSS re-parses it as a rule,
  // finds the selector invalid and drops it, so its declarations apply nothing —
  // but round 7's test (only whitespace between the colon and the brace) reads
  // `!important` as tokens and calls it a selector, and nine tokens inside it
  // printed OK. Telling the two apart needs pseudo-class validity: `button:hover`
  // is a selector, `unknown:!important` is not, and no local test separates them
  // — that is the oscillation rounds 5 through 8 have been living in.
  // So this stops trying. It DESCENDS, and refuses only when the ambiguity
  // actually reaches the measurement: a MEASURED declaration inside an ambiguous
  // block is fatal. `button:hover { color: red }` still passes, because nothing
  // about its colour depends on which reading is right.
  const ambiguous = [];
  const inAmbiguous = () => ambiguous.length > 0 && ambiguous[ambiguous.length - 1];
  // A prelude that could be a declaration name: a plain identifier before the
  // top-level colon. `:root` (colon first, nothing before it) and `.a:focus`
  // (starts with a dot) are unambiguously selectors.
  const PLAIN_IDENT = /^[A-Za-z_\u0080-\uFFFF][A-Za-z0-9_\u0080-\uFFFF-]*$/;

  // Returns a fatal message, or null. It cannot just record any more: a name
  // this check is unable to compare literally must stop the run, and only the
  // caller can return out of the scan.
  const flush = () => {
    let problem = null;
    if (colonAt >= 0) {
      const name = cssTrim(buf.slice(0, colonAt));
      if (name.startsWith('--')) {
        if (depth === 0) {
          // CSS has no declaration list at stylesheet top level, so it discards
          // these outright. Every `;` still reached flush(), so a file whose
          // nine declarations sat outside any rule recorded a complete palette
          // and exited 0 while the rendered page had none of it.
          problem = `a custom property declared outside any rule (\`${name}\`)`
            + ' — CSS discards declarations at stylesheet top level, so this palette would never apply';
        } else if (inAmbiguous()) {
          problem = `a measured custom property inside a block this check cannot classify (\`${name}\`)`
            + ' — its prelude may be a declaration rather than a selector, and CSS drops the whole rule if it is';
        } else if (!PLAIN_CUSTOM_NAME.test(name)) {
          problem = `a custom property whose name this check cannot compare literally (\`${name}\`)`
            + ' — spell token names with ASCII letters, digits, - and _';
        } else {
          // !important is a declaration FLAG; CSS does not put it in the value.
          // Bounded with CSS whitespace for the same reason the name is: `\s`
          // would eat a U+00A0 that CSS reads as part of an identifier, turning
          // a declaration CSS DROPS into one this gate measures.
          const value = cssTrim(buf.slice(colonAt + 1).replace(/[ \t\n\r\f]*![ \t\n\r\f]*important[ \t\n\r\f]*$/i, ''));
          (decls[name] ||= []).push(value);
        }
      }
    }
    buf = '';
    colonAt = -1;
    return problem;
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
        // CSS normalises CRLF to one newline before tokenizing, so a backslash
        // continues the string across BOTH characters. Skipping only the \r
        // left the \n to trip the unterminated check on a CRLF file.
        if (css[j] === '\\') { j += (css[j + 1] === '\r' && css[j + 2] === '\n') ? 2 : 1; continue; }   // CRLF is ONE newline
        if (css[j] === c) break;
        // CSS preprocessing turns a lone CR and a form feed into newlines, so
        // all three end an unescaped string. Recognising only \n let a CR-only
        // file run the "string" past a live override and exit 0 -- a silent
        // certification where the intended answer was a loud refusal.
        if (css[j] === '\n' || css[j] === '\r' || css[j] === '\f') {
          return { fatal: `an unterminated ${c === '"' ? 'double' : 'single'}-quoted string` };
        }
      }
      if (j >= css.length) return { fatal: `an unterminated ${c === '"' ? 'double' : 'single'}-quoted string` };
      buf += c + c;       // the string stays, its contents do not
      i = j;
      continue;
    }

    // See "NO ESCAPE DECODER" above. Outside a string or comment this is fatal.
    if (c === '\\') return { fatal: 'a backslash escape outside a string — spell identifiers and values plainly here' };

    // CDO/CDC. CSS discards these at the top level and carries on, so a file can
    // hide an at-rule behind one. Nothing in a token file needs them.
    if ((c === '<' && css.startsWith('<!--', i)) || (c === '-' && css.startsWith('-->', i))) {
      return { fatal: 'an HTML comment delimiter (<!-- or -->), which CSS discards and this check will not read around' };
    }

    // An UNQUOTED url() is its own tokenizer state, and the point of it is what
    // it does NOT recognise: inside the URL, `/*` is data, not a comment opener.
    // Bracket nesting alone protected the `;` and left this open, so `url(x/*)`
    // followed later by a real `*/` deleted everything between them — a live
    // override included — and the guard exited 0. Consume it here, to the first
    // unescaped `)`, with no comment or string scanning inside: that is the
    // whole state, and modelling it REMOVES two recognitions rather than adding
    // one. `url("…")` is a function token, not this — the quote is handled by
    // the string rule above, so only an unquoted first character takes this path.
    // The boundary matters: `myurl(` is an ordinary function and CSS does not
    // enter the URL state for it, but an unanchored match did — closing the
    // "URL" at a `)` inside a comment and recording the rest as declarations.
    // A name character is not the only prefix that swallows the ident, though,
    // and the fix that only excluded those left `#url(` entering a URL state
    // CSS never enters: `#url` is a single HASH token, so its `(` is an
    // ordinary paren. Rather than collect prefixes as they are found, take the
    // closed set from the tokenizer: the token types that consume an ident
    // sequence after a leading character are hash (`#`) and at-keyword (`@`);
    // everything else that continues an ident IS a name character. Those three
    // classes are the whole boundary. (A `\` prefix cannot reach here — an
    // escape outside a string is fatal above.) Excluding a prefix can only make
    // this MISS a url token, never invent one, and CSS produces none after
    // `#` or `@` — so the exclusion costs nothing it was reading correctly.
    // ROUND 7: the derivation above said "name character" and the class spelled
    // ASCII. CSS makes EVERY code point at U+0080 and above an identifier
    // character, so `éurl(` is one function token — this opened a URL state
    // inside it, closed at a `)` sitting in a comment, and red-built a valid
    // file. The class now says what that sentence always claimed.
    const urlOpen = (i === 0 || !/[A-Za-z0-9_@#\u0080-\uFFFF-]/.test(css[i - 1]))
      ? /^url\(\s*(?!["'])/i.exec(css.slice(i)) : null;
    if (urlOpen) {
      let j = i + urlOpen[0].length;
      for (; j < css.length; j++) {
        // A backslash here would be an escape outside a string, which the
        // shipped grammar refuses everywhere else. Consuming it silently made
        // url() an undocumented exception to the contract.
        if (css[j] === '\\') return { fatal: 'a backslash escape inside a url() — spell identifiers and values plainly here' };
        if (css[j] === ')') break;
      }
      if (j >= css.length) return { fatal: 'an unterminated url() token' };
      buf += 'url()';
      i = j;
      continue;
    }
    if (c === '(' || c === '[') { closers.push(c === '(' ? ')' : ']'); buf += c; continue; }
    if (c === ')' || c === ']') {
      // A non-matching top used to fall through and land in `buf`, so a stray
      // `)` left the stack empty at EOF and the file read as "balanced" — the
      // same underflow the closing brace already refuses, surviving in the two
      // bracket types nobody re-checked. Both terminators, one rule.
      if (closers[closers.length - 1] !== c) {
        return { fatal: `a closing ${c} with no matching open — the file does not parse as CSS` };
      }
      closers.pop(); buf += c; continue;
    }

    if (c === '{') {
      // ── A DECLARATION VALUE MAY NOT CONTAIN A BLOCK ────────────────────────
      // CSS allows it — `--x: { … }` is a legal custom-property value, and an
      // ordinary `unknown: { … }` is a declaration whose contents apply nothing
      // — and four rounds of trying to READ those correctly produced four
      // findings, each a fix that was right about the case in front of it:
      // record the block as a value (round 3), only inside a declaration list
      // (round 4), and then nested grouping rules and ordinary-property blocks
      // broke both (round 5). Resolving it properly needs CSS Nesting
      // semantics, which is a different program.
      // So it is REFUSED, and round 7 showed the refusal has to cover MORE than
      // a custom property, not less.
      //
      // Round 6 narrowed it to `--` preludes and DESCENDED into everything else,
      // on the argument that over-reading a block CSS drops can only add a
      // duplicate and duplicates refuse — "it cannot turn a refusal into a
      // green." THAT ARGUMENT WAS WRONG, and the counter-example is one file:
      // `.e { unknown: { …the whole palette… } }` with no `:root` anywhere.
      // CSS re-parses `unknown:` as a selector, finds it invalid, and drops the
      // rule, so NOTHING is declared — but the scanner read all nine tokens as
      // live and printed `OK — 9/9`, exit 0. An added declaration is only a
      // duplicate when a real one exists; when none does, the over-read does not
      // duplicate the palette, it SUPPLIES it. Same for `--é: { … }`, which the
      // ASCII-only `--` test did not recognise as a custom property at all.
      //
      // The discriminator round 5 and round 6 both missed is not in the prelude
      // BEFORE the colon — it is what sits between the colon and the `{`:
      //   `unknown: {`        nothing  → the block IS the value. CSS drops it.
      //   `--x: {`            nothing  → a legal custom-property value.
      //   `button:hover {`    `hover`  → a type selector with a pseudo-class.
      //   `.a:focus, .b {`    a list   → a selector.
      // So: a `{` that follows the top-level colon with only whitespace between
      // is a brace-valued declaration and is REFUSED; anything else is a rule
      // and opens normally. One test, no selector validation, and no direction
      // in which reading a dropped block can be mistaken for a live one.
      // The `--` prefix is checked separately and first, because a custom
      // property's block IS its value even with tokens before the brace, and
      // `startsWith('--')` covers names this file refuses to spell elsewhere.
      const prelude = colonAt >= 0 ? cssTrim(buf.slice(0, colonAt)) : null;
      if (prelude !== null && prelude.startsWith('--')) {
        return { fatal: `a custom property whose value is a { } block (\`${prelude}\`) — this check cannot resolve one, and a token file does not need one` };
      }
      if (colonAt >= 0 && cssTrim(buf.slice(colonAt + 1)) === '') {
        return { fatal: `a declaration whose value is a { } block (\`${prelude}\`) — CSS drops it and applies nothing, so reading it would certify a palette the page never renders` };
      }
      // Anything else with a top-level colon whose left side is a bare
      // identifier is the ambiguous shape above: descend, but remember. Once
      // ambiguous, every nested block stays ambiguous — a rule CSS dropped
      // takes its children with it.
      const nowAmbiguous = inAmbiguous() || (prelude !== null && PLAIN_IDENT.test(prelude));
      const bad = atRuleProblem(buf);
      if (bad) return { fatal: bad };
      ambiguous.push(nowAmbiguous);
      depth++;
      buf = ''; colonAt = -1;
      continue;
    }
    if (c === '}') {
      // An unmatched `}` used to pop an empty stack as a no-op, so a file that
      // closes more blocks than it opens reached the end balanced and exited 0
      // — contradicting the refusal this same function documents.
      if (depth === 0) return { fatal: 'a closing brace with no matching open — the file does not parse as CSS' };
      const bad = flush();           // the last declaration may omit its `;`
      if (bad) return { fatal: bad };
      ambiguous.pop();
      depth--;
      continue;
    }

    if (c === ';' && closers.length === 0) {
      const bad = atRuleProblem(buf);
      if (bad) return { fatal: bad };
      const badName = flush();
      if (badName) return { fatal: badName };
      continue;
    }

    if (c === ':' && colonAt < 0 && closers.length === 0) colonAt = buf.length;
    buf += c;
  }
  flush();
  if (closers.length > 0 || depth > 0) return { fatal: 'unbalanced brackets — the file does not parse as CSS' };
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
const decls = scan.decls;   // name AS SPELLED -> [value, …] every declaration, in source order
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
  // cssTrim, not .trim(): the capture deliberately keeps a U+00A0 because CSS
  // reads it as part of a token, and trimming it HERE collapsed `#1565C0` and
  // `<NBSP>#1565C0` — a valid value and one CSS rejects — to the same hex, so
  // the ambiguity check saw one value and stayed silent about a live override.
  const raw = cssTrim(v);
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
