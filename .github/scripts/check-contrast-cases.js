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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'fs';
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

// A second, genuinely dark palette for the multi-candidate cases: each theme
// file is measured on its own, so a themed project's second file must carry a
// COMPLETE palette, not an override fragment.
const DARK = `:root {
  --color-bg:             #12141A;
  --color-surface:        #1B1E26;
  --color-border:         #2A2E3A;
  --color-text-primary:   #F2F4F8;
  --color-text-secondary: #B7BEC9;
  --color-accent:         #7FB3F5;
  --color-accent-hover:   #A9CBFA;
  --color-danger:         #F58A7F;
  --color-on-accent:      #10131A;
}
`;

const OK9 = 'OK — 9/9 assumed pairs meet WCAG AA';
const DUP = 'a measured token is declared more than once';
const BLOCK = 'value is a { } block';

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

  // ── Strings are not declarations ──────────────────────────────────────────
  // Codex, #337: appending a rule whose `content` is a string containing
  // declaration-like text made the scanner record a second `--color-accent` and
  // reject a palette whose rendered accent never changed. Same family as the
  // comment cases above — text that looks like a declaration somewhere CSS does
  // not read one.
  ['a declaration inside a CSS string must NOT fail (#337)',
    { 'styles/tokens.css': plus('.example::before { content: "--color-accent: #0D47A1;"; }\n') }, 0, OK9],

  ['the same in single quotes must NOT fail',
    { 'styles/tokens.css': plus(".example::after { content: '--color-accent: #0D47A1;'; }\n") }, 0, OK9],

  ['an escaped quote inside the string does not end it early',
    { 'styles/tokens.css': plus('.e::before { content: "a\\" --color-accent: #0D47A1; b"; }\n') }, 0, OK9],

  // The twin that makes the strip a strip and not a delete. A string used as a
  // measured token's VALUE is still a second declaration of that token — CSS
  // accepts any token stream for a custom property — so collapsing the string to
  // "" has to leave the declaration standing.
  ['a string VALUE for a measured token is still a second declaration',
    { 'styles/tokens.css': plus(':root { --color-accent: "not a colour"; }\n') }, 1, DUP],

  // Ordering: comments are stripped first, so a lone quote inside a comment must
  // not open a string that swallows the real override after it.
  ['a quote inside a comment does not swallow the override that follows',
    { 'styles/tokens.css': plus('/* the " old accent */\n:root { --color-accent: rgb(255 255 255); }\n') },
    1, DUP],

  // ── #337 round 2: nine findings against the regex scanner ─────────────────
  // Five silent (a wrong value measured and certified) and four spurious (a
  // valid palette rejected). They did not converge — the round-1 comment strip
  // became a round-2 defect — so the scanner was replaced with a single-pass
  // tokenizer. These pin what a regex over raw text cannot see.

  // An escape in an identifier: CSS reads --color-\61 ccent as --color-accent,
  // so this changes the rendered accent, and the old name pattern never matched
  // it — exit 0 with the original contrast result. A decoder fixed that and
  // opened three more holes (round 3), so a backslash outside a string is now
  // refused instead. Loud, and there is no decoder left to be wrong.
  ['an escape in a custom-property name is refused',
    { 'styles/tokens.css': plus(':root { --color-\\61 ccent: #0D47A1; }\n') }, 1, 'backslash escape'],

  // …and the three the decoder itself introduced, all refused by the same rule.
  ['an out-of-range escape does not crash the guard',
    { 'styles/tokens.css': plus(':root { --x-\\FFFFFF: 1; }\n') }, 1, 'backslash escape'],

  ['an escaped at-keyword cannot smuggle an import past the check',
    { 'styles/tokens.css': '@\\69mport "theme.css";\n' + BASE }, 1, 'backslash escape'],

  ['an escaped !important spelling is refused, not misread as a value',
    { 'styles/tokens.css': plus(':root { --color-accent: #1565C0 !\\69mportant; }\n') }, 1, 'backslash escape'],

  // CSS discards a CDO at the top level and applies what follows, so a file can
  // hide an at-rule behind one. The prelude check read the raw text and saw
  // `<!--`, not `@import`.
  ['a CDO cannot hide an at-rule from the check',
    { 'styles/tokens.css': '<!--\n@import "theme.css";\n' + BASE }, 1, 'HTML comment delimiter'],

  // Block-form at-rules terminate at `{`, not `;`, so a check that only ran at
  // `;` never saw one. @media and @supports wrap declarations this gate reads;
  // everything else is refused.
  ['@media still wraps declarations this check reads',
    { 'styles/tokens.css': BASE + '@media (min-width: 40em) { .a { color: red; } }\n' }, 0, OK9],

  ['an at-rule outside the allow-list is refused at its brace',
    { 'styles/tokens.css': BASE + '@font-face { font-family: x; }\n' }, 1, '@font-face rule'],

  // CSS normalises CRLF to one newline before tokenizing, so a backslash
  // continues the string across both characters.
  ['a string continued across an escaped CRLF is still a string',
    { 'styles/tokens.css': plus('.e::before { content: "x\\\r\nnext"; }\n') }, 0, OK9],

  // A qualified rule whose selector starts with two dashes: the pseudo-class
  // colon made colonAt nonnegative, and the brace was misread as opening a
  // custom-property value, recording the whole block as a second declaration.
  // Deliberately reversed at round 5, and worth stating: `--color-accent:hover`
  // is not a valid selector (a custom-property name is not a type selector), so
  // CSS discards the whole rule and refusing a token file containing one costs
  // nothing real. Distinguishing it from a brace-valued declaration is what
  // cost four rounds.
  ['a brace after a plain identifier and colon is refused wherever it appears',
    { 'styles/tokens.css': plus('--color-accent:hover { color: red; }\n') }, 1, BLOCK],

  // `content: "/*"` does not open a comment. Stripping comments first deleted
  // everything from there to the next real `*/` — including the real override.
  ['a comment marker inside a string does not open a comment',
    { 'styles/tokens.css': plus('.e::before { content: "/*"; }\n:root { --color-accent: #0D47A1; }\n/* note */\n') },
    1, DUP],

  // Deleting a comment welds its neighbours: CSS reads `#15/**/65c0` as two
  // components and does NOT produce #1565c0, but the strip made it exactly that
  // and canonicalised the two declarations as identical.
  ['a comment inside a value is a boundary, not a join',
    { 'styles/tokens.css': plus(':root { --color-accent: #15/**/65c0; }\n') }, 1, DUP],

  // A backslash-newline continues a string. The old `\.` did not match a newline
  // and the character class excluded it, so the string stayed unstripped and its
  // contents were read as a declaration.
  ['a string continued across an escaped newline is still a string',
    { 'styles/tokens.css': plus('.e::before { content: "x\\\n--color-accent: #0D47A1;"; }\n') }, 0, OK9],

  // A `;` inside an unquoted url() is not a separator.
  ['declaration-shaped data inside an unquoted url() must NOT fail',
    { 'styles/tokens.css': plus('.e { background-image: url(data:image/foo,--color-accent:#0D47A1;); }\n') },
    0, OK9],

  // !important is a declaration FLAG, not part of the value. Including it made
  // an identical colour read as a second, different, non-hex value.
  ['the same colour repeated with !important must NOT fail',
    { 'styles/tokens.css': plus(':root { --color-accent: #1565C0 !important; }\n') }, 0, OK9],

  ['a sole !important declaration is still evaluable',
    { 'styles/tokens.css': BASE.replace('--color-danger:         #C0392B;', '--color-danger: #C0392B !important;') },
    0, OK9],

  // ── A CUSTOM PROPERTY'S VALUE MAY NOT CONTAIN A BLOCK ─────────────────────
  // Five rounds of trying to READ a brace-valued declaration produced five
  // findings: record it as a value (r3), only inside a declaration list (r4),
  // CSS Nesting and ordinary-property blocks broke both (r5), and refusing every
  // "plain identifier before a colon" then refused `button:hover` (r6).
  // The rule that survived is not a shape but a property: a block survives as a
  // value for a CUSTOM property only. Everything else with a `{` is a rule and
  // is descended into — see the ordinary-property case below for what that
  // costs, and note the cost is always a refusal, never a green.
  ['a brace-valued custom property is refused',
    { 'styles/tokens.css': plus(':root { --color-accent: { #FFFFFF }; }\n') }, 1, BLOCK],

  ['…and inside a grouping rule nested in a qualified rule',
    { 'styles/tokens.css': plus('.e { @media (min-width: 1px) { --color-accent: { #0D47A1 }; } }\n') },
    1, BLOCK],

  // An ORDINARY property with a block value is an invalid declaration, which CSS
  // re-parses as a qualified rule and then drops (`unknown:` is not a selector),
  // so these declarations apply NOTHING. This scanner descends anyway and reads
  // them, which is why the answer is a duplicate refusal rather than a green —
  // the deliberate, one-directional cost of not deciding selector validity.
  // Pinned so that cost stays visible: if this ever prints OK, the scanner has
  // started silently dropping declarations it used to see.
  ['a brace-valued ORDINARY property is read as a rule, so its contents conflict',
    { 'styles/tokens.css': plus('.e { unknown: { --color-accent: #0D47A1; }; }\n') }, 1, DUP],

  // ── #337 round 6: a TYPE selector with a pseudo-class ─────────────────────
  // `button:hover {` puts a plain identifier before a colon before a brace, so
  // the round-5 test called it a brace-valued declaration of `button` and
  // refused an ordinary stylesheet. The `.e:hover` twin below missed it only
  // because it starts with a dot — a fixture that agreed with the code for a
  // reason unrelated to the property it was meant to hold.
  ['a type selector with a pseudo-class still opens a rule',
    { 'styles/tokens.css': plus('button:hover { color: red; }\n') }, 0, OK9],

  ['a type selector with a pseudo-element still opens a rule',
    { 'styles/tokens.css': plus('html:root { color: red; }\n') }, 0, OK9],

  // …and it must still be READ, not merely tolerated: a live override inside one
  // is a real duplicate. Without this, refusing to descend would also pass.
  ['declarations inside a type-selector pseudo-class rule are live',
    { 'styles/tokens.css': plus('button:hover { --color-accent: #0D47A1; }\n') }, 1, DUP],

  // The must-NOT-over-refuse twin: a pseudo-class selector also puts a colon
  // before a brace, and `.e` is not a plain identifier, so it stays a selector.
  ['a pseudo-class selector still opens a rule',
    { 'styles/tokens.css': plus('.e:hover { color: red; }\n') }, 0, OK9],

  ['a selector list with a pseudo-class still opens a rule',
    { 'styles/tokens.css': plus('@media (min-width: 1px) { .a:focus, .b::before { color: red; } }\n') },
    0, OK9],

  // ── #337 round 4: three more parser states ────────────────────────────────
  // Inside an unquoted url(), `/*` is URL DATA. Bracket nesting protected the
  // `;` (round 2) and left comment recognition inside the URL, so the strip ate
  // from the URL's `/*` to a later real `*/` — override included — and exited 0.
  // The fixture is BALANCED CSS on purpose. It used to carry a stray `)`, which
  // meant nothing (round 4) and then meant everything (round 6 refuses bracket
  // underflow) — a case passing for a reason unrelated to the property it holds.
  ['a comment marker inside an unquoted url() is URL data',
    { 'styles/tokens.css': plus('.btn { background: url(x/*); }\n:root { --color-accent: #0D47A1; }\n/* note */\n') },
    1, DUP],

  // CSS turns a lone CR and a form feed into newlines, so both end an unescaped
  // string. Recognising only \n ran the "string" past a live override and
  // certified the palette instead of refusing it.
  ['a lone CR ends an unescaped string',
    { 'styles/tokens.css': plus('.btn { content:"x\r; --color-accent:#fff; /* " */ }\n') },
    1, 'unterminated'],

  ['a form feed ends an unescaped string',
    { 'styles/tokens.css': plus('.btn { content:"x\f; --color-accent:#fff; /* " */ }\n') },
    1, 'unterminated'],

  // `blocks > 0` was a proxy for "in a declaration list" and a grouping rule
  // breaks it: inside @media the block holds RULES, so the qualified rule's
  // brace was read as opening a custom-property value.

  // ── #337 round 5 ──────────────────────────────────────────────────────────
  // `myurl(` is an ordinary function; CSS does not enter the URL state for it.
  // An unanchored match closed the "URL" at a `)` inside a comment and read the
  // rest as declarations.
  ['url( only matches at an identifier boundary',
    { 'styles/tokens.css': plus('.e { unknown: myurl(/* ) */ ; --color-accent: #0D47A1;); }\n') },
    0, OK9],

  // A backslash inside url() was an undocumented exception to the grammar,
  // which refuses escapes outside strings everywhere else.
  ['a backslash inside a url() is refused like any other escape',
    { 'styles/tokens.css': plus('.e { background: url(foo\\ bar); }\n') }, 1, 'backslash escape'],

  // pop() on an empty stack was a no-op, so a file closing more blocks than it
  // opens reached the end "balanced" and exited 0 — contradicting the refusal
  // this same scanner documents.
  ['an unmatched closing brace is refused',
    { 'styles/tokens.css': BASE + '}\n' }, 1, 'closing brace with no matching open'],

  // Dirent.isFile() is FALSE for a symlink, so a project whose only stylesheet
  // was one reported "no CSS at all" and took the bootstrap exit — the vacuous
  // green that branch exists to reject, by the one path nobody checked.
  // The link is the ONLY .css name in the tree — a real .css file beside it
  // would satisfy the old code too and the case would prove nothing.
  ['a symlinked stylesheet counts as CSS',
    { 'src/styles.txt': '.a { color: red; }\n', __symlink: ['src/app.css', 'styles.txt'] },
    1, 'no tokens file at'],

  ['a BROKEN symlink is not a stylesheet',
    { 'index.html': '<!doctype html>\n', __symlink: ['src/app.css', 'gone.txt'] },
    0, 'no stylesheet yet'],

  // ── Input this gate refuses outright ──────────────────────────────────────
  // An @import names a stylesheet this gate never reads, so a theme override
  // living there is invisible: the guard exited 0 on a palette whose rendered
  // contrast failed. Refusing beats measuring the half it can see.
  ['an @import is refused, not partially measured',
    { 'styles/tokens.css': '@import "theme.css";\n' + BASE }, 1, '@import rule'],

  ['an unterminated string is refused',
    { 'styles/tokens.css': plus('.e::before { content: "oops;\n}\n') }, 1, 'unterminated'],

  ['an unterminated comment is refused',
    { 'styles/tokens.css': plus('/* oops\n') }, 1, 'unterminated /* comment'],

  // ── #337 round 6: `#url(` is a HASH token, not a URL token ────────────────
  // The boundary test excluded name characters only, so `#url(` entered the URL
  // state CSS never enters — closing the false URL at the `)` inside the comment
  // and reading the tail as declarations, which rejected a valid palette.
  ['a url( preceded by # is a hash token, not a URL',
    { 'styles/tokens.css': plus('.e { unknown: #url(/* ) */ ; --color-accent: #0D47A1;); }\n') },
    0, OK9],

  ['a url( preceded by @ is part of an at-keyword, not a URL',
    { 'styles/tokens.css': plus('.e { unknown: @url(/* ) */ ; --color-accent: #0D47A1;); }\n') },
    0, OK9],

  // The must-still-work twin: excluding prefixes must not stop the real URL
  // state, whose whole job is that `/*` inside it is data. Without this, deleting
  // the url() branch outright would also pass the two cases above.
  ['a genuine unquoted url() still suppresses comment recognition',
    { 'styles/tokens.css': plus('.e { background: url(y/*); }\n:root { --color-accent: #0D47A1; }\n/* note */\n') },
    1, DUP],

  // ── #337 round 6: ) and ] underflow like } ────────────────────────────────
  // A non-matching top fell through into `buf`, so the stack was empty at EOF
  // and the file read as "balanced" — the underflow the closing brace already
  // refused, surviving in the two bracket types nobody re-checked.
  ['an unmatched closing paren is refused',
    { 'styles/tokens.css': BASE + ')\n' }, 1, 'closing ) with no matching open'],

  ['an unmatched closing bracket is refused',
    { 'styles/tokens.css': BASE + ']\n' }, 1, 'closing ] with no matching open'],

  ['a mismatched closer is refused',
    { 'styles/tokens.css': plus('.e { width: calc(1px[ ); }\n') }, 1, 'with no matching open'],

  // The must-NOT-over-refuse twin: legitimately nested brackets still balance.
  ['nested balanced brackets are not underflow',
    { 'styles/tokens.css': plus('.e { transform: translate(calc(1px + (2px * 3))); grid-area: e[a]; }\n') },
    0, OK9],

  // ── #337 round 6: @layer and the other grouping rules ─────────────────────
  // Listing only @media and @supports refused `@layer tokens { … }` — the
  // standard way a token file keeps its precedence below component overrides.
  // A grouping rule's block cascades as if the wrapper were not there, so this
  // is the derived set, not two names.
  ['a token file wrapped in @layer is read, not refused',
    { 'styles/tokens.css': '@layer tokens {\n' + BASE + '}\n' }, 0, OK9],

  ['the @layer statement form is read too',
    { 'styles/tokens.css': '@layer tokens, components;\n@layer tokens {\n' + BASE + '}\n' },
    0, OK9],

  ['@container wraps declarations this check reads',
    { 'styles/tokens.css': plus('@container (min-width: 1px) { :root { --color-accent: #0D47A1; } }\n') },
    1, DUP],

  // …and declarations inside a layer are LIVE, not merely tolerated.
  ['a declaration inside @layer is read as live',
    { 'styles/tokens.css': plus('@layer overrides { :root { --color-accent: #0D47A1; } }\n') },
    1, DUP],

  // The must-still-refuse twin: widening the set must not turn it into a
  // deny-list. @font-face declarations are not element tokens; @import is text
  // this gate never sees.
  ['@font-face is still refused',
    { 'styles/tokens.css': plus('@font-face { font-family: x; src: url(x.woff2); }\n') },
    1, '@font-face rule'],

  ['@property is still refused',
    { 'styles/tokens.css': plus('@property --color-accent { syntax: "<color>"; inherits: true; initial-value: #0D47A1; }\n') },
    1, '@property rule'],

  // ── #337 round 6: a CONFIGURED candidate that is gone ─────────────────────
  // design.md tells a themed project to give each theme its own file and add it
  // to CANDIDATES. existsSync filtered both, so renaming one measured the
  // survivor and printed green — the every-theme guarantee reported about a file
  // nobody opened. These two run a COPY of the script with the CANDIDATES line
  // rewritten, which is exactly the edit design.md documents.
  ['a configured token file that no longer exists is fatal',
    { 'styles/light.css': BASE, __candidates: ['styles/light.css', 'styles/dark.css'] },
    1, 'configured token files do not exist'],

  ['…and the same configuration passes when both files are there',
    { 'styles/light.css': BASE, 'styles/dark.css': DARK,
      __candidates: ['styles/light.css', 'styles/dark.css'] },
    0, OK9],

  // Each theme is measured on its own terms, so the guarantee is per-file: a
  // dark palette failing AA fails even while the light one passes. Without this,
  // the pair above would hold with the second file read and never checked.
  ['a failing second theme fails the run',
    { 'styles/light.css': BASE,
      'styles/dark.css': DARK.replace('--color-text-secondary: #B7BEC9;', '--color-text-secondary: #3A404C;'),
      __candidates: ['styles/light.css', 'styles/dark.css'] },
    1, 'check-contrast: FAIL — fix'],

  // The must-NOT-over-refuse twin: with the single default candidate, an absent
  // file is still the bootstrap notice, not this new failure.
  ['a single absent candidate is still the bootstrap case',
    { 'index.html': '<!doctype html>\n' }, 0, 'no stylesheet yet'],

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

  // ── #337 round 6: a DIRECTORY symlink ─────────────────────────────────────
  // Dirent reports a symlink as neither file nor directory. Round 5 patched the
  // file half only, so `assets -> …` holding the project's only stylesheet was
  // not counted AND not descended into, and the walk answered "no CSS at all" —
  // the vacuous green this branch exists to reject, surviving in the half nobody
  // re-checked.
  // The target is inside node_modules, which the walk ignores, so the LINK is
  // the only route to it — a project consuming a design system as a package and
  // linking it into place. The first attempt at this case put the target in a
  // plain directory, where the ordinary walk found it and the case passed with
  // the fix reverted: it proved nothing.
  ['a stylesheet reachable only through a directory symlink counts as CSS',
    { 'node_modules/@acme/theme/app.css': '.a { color: red; }\n',
      __symlink: ['assets', 'node_modules/@acme/theme'] },
    1, 'no tokens file at'],

  // The twin that keeps the ignore list meaningful: without the link, the same
  // stylesheet is invisible and the repo bootstraps. Otherwise the case above
  // would also pass by simply walking node_modules.
  ['…and the same file with no link into it is still ignored',
    { 'node_modules/@acme/theme/app.css': '.a { color: red; }\n', 'index.html': '<!doctype html>\n' },
    0, 'no stylesheet yet'],

  // A cycle through the repo root must not hang the walk. READ THE LIMIT: this
  // case passes with the visited-set removed too, because Linux bounds symlink
  // resolution (ELOOP) and readdir then throws into the catch. So it is a
  // regression guard against a HANG, not evidence that the visited set is what
  // prevents one — it stays because termination should not depend on an OS
  // limit that a bind mount or a hardlinked directory would not trip.
  ['a symlink cycle terminates instead of recursing forever',
    { 'index.html': '<!doctype html>\n', __symlink: ['loop', '.'] },
    0, 'no stylesheet yet'],

  ['CSS present but no tokens file is a gap, not a skip',
    { 'src/app.css': '.a { color: red; }\n' }, 1, 'no tokens file at'],

  ['a repo with no CSS at all bootstraps green',
    { 'index.html': '<!doctype html><title>x</title>\n' }, 0, 'no stylesheet yet'],
];

function runCase(files) {
  const tmp = mkdtempSync(join(tmpdir(), 'contrast-cases-'));
  try {
    // A copy of the script with the CANDIDATES line rewritten — the edit
    // design.md documents for a themed project. Substitution over the shipped
    // source, never a re-implementation: if that line's shape changes this
    // throws instead of silently testing the unedited default.
    let check = CHECK;
    if (files.__candidates) {
      const src = readFileSync(CHECK, 'utf8');
      const line = /^const CANDIDATES = \[.*\];$/m;
      if (!line.test(src)) throw new Error('check-contrast.js no longer declares CANDIDATES on one line');
      check = join(tmp, 'check-contrast.js');
      writeFileSync(check, src.replace(line, `const CANDIDATES = ${JSON.stringify(files.__candidates)};`), 'utf8');
    }
    for (const [rel, body] of Object.entries(files)) {
      if (rel === '__candidates') continue;
      if (rel === '__symlink') {
        const [linkRel, target] = body;
        const dest = join(tmp, linkRel);
        mkdirSync(dirname(dest), { recursive: true });
        symlinkSync(target, dest);
        continue;
      }
      if (rel === '__shipped') {
        mkdirSync(join(tmp, 'styles'), { recursive: true });
        writeFileSync(join(tmp, 'styles', 'tokens.css'), readFileSync(SHIPPED_TOKENS, 'utf8'));
        continue;
      }
      const dest = join(tmp, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, body, 'utf8');
    }
    const r = spawnSync(process.execPath, [check], { encoding: 'utf8', cwd: tmp });
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
