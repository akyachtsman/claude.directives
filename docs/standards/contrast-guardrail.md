# Contrast guardrail: limits and what it refuses

The reference behind `design.md` → *Accessibility*: what the per-project contrast
guardrail (`templates/scripts/check-contrast.js`) measures, what it cannot see,
and every file shape it refuses. Read on demand, when a contrast run disagrees
with what renders or a tokens file is refused.

**The contrast guardrail is a floor, not a coverage report — read its pair list
against your own token roles.** It measures a hand-written list of token pairs,
which encodes the roles those tokens are *assumed* to play. Where your project
gives a token a different role the green means nothing and looks exactly like a
real pass. Measured downstream: a `--color-danger` used as a hover *background*
under a hard-coded `#fff` scored 17.30 and 18.50 "OK" while the delete control
rendered white-on-white; a `--color-accent` checked at the 3.0 large-text floor
certified 3.54 "OK" for 12-13px labels that all fail AA. Pairs the list does not
name are never measured at all — a chip at 4.32:1, 11px bold, shipped visible on
a dashboard. So, per project: (1) read the pair list in `check-contrast.js` and
confirm each token really plays the role assumed; (2) remember WCAG's large-text
floor is 3.0 only at ≥18.66px bold or ≥24px — anything smaller needs 4.5, so
check accent-coloured small text by hand; (3) as a second pass, derive pairs from
your `styles/components.css` — every rule declaring both a `color:` and a
`background:` from tokens — which catches combinations no hand-written list
names. That derivation is also incomplete: it cannot see text that sets a colour
and inherits its background. Only resolving each element's effective background
through the cascade would be complete, and no tool here does that.

**The control edge is measured on the house style, and wherever it is declared.**
Besides the nine text and button pairs, the guardrail checks a form field's edge —
`--color-border-input` on `--color-surface` and on `--color-bg`, at 3:1 (WCAG
1.4.11; #470). A project marked as on the house style — `.claude/directive-sync.json`
containing `"house_style": true`, meaning its `styles/tokens.css` and
`styles/components.css` are the house files — must declare the token: a missing
one fails the run like any other required token, and the count reads `11/11`.
An unmarked project is measured when a tokens file declares the token, and
otherwise keeps its `9/9`, with one line saying the control-edge pairs were not
measured and why — so a project still on the older starter `tokens.css`, which
has no such token, stays green. Only the literal `true` marks; a sync file that
is not valid JSON counts as unmarked and the run says so. The token is a
*measured* token either way, so the placement and one-declaration rules below
apply to it in every project.

**One declaration per measured token, in `#hex`.** The guardrail reads
declarations, not the cascade, so a token declared twice left it measuring
whichever came last — and saying nothing about the other. Appending one line to
the starter palette (`:root { --color-accent: rgb(255 255 255); }`) produced
`OK — 9/9 assumed pairs meet WCAG AA`, exit 0, on a `.btn` rendering white on
white: CSS applied the `rgb()`, the gate measured the superseded hex. It now
refuses that file instead of picking a value, for both shapes — a non-hex
override, and a second, different hex under a `[data-theme]` block or a
`prefers-color-scheme` query. So a themed project gives **each theme its own
tokens file** holding that theme's resolved values and lists every one — as
repeated `--tokens <file>` on the `qa.yml` run line, `CHECK_CONTRAST_TOKENS`, or
`CANDIDATES` at the top of the script — every listed file is measured, one
palette per run, and each theme file must carry a **complete** palette rather
than an override fragment. A listed file that does not exist is a **hard
failure**, not a skip: filtering the list through "does it exist" measured the
surviving theme and printed green, while the renamed one was never opened.
(Unconfigured, the script checks whichever default — `styles/tokens.css`,
`css/tokens.css` — exists; with neither, it is the bootstrap notice in a fresh
repo and still a hard failure in a repo that has CSS elsewhere.)
Tokens no pair reads are unaffected.

**Where measured tokens must live.** Every token a contrast pair reads must be
declared in a **`:root` rule at the top level of the file** — not inside a media
query, a cascade layer, a `[data-theme]` block, or any other selector. A measured
token found anywhere else is a **hard failure**.

That is narrower than CSS allows, and deliberately so. Whether a declaration
applies depends on the selector, the media condition and the cascade, and this
gate resolves none of them: nine review rounds produced a scanner that read
`@media print { :root { … } }`, `.e:not-a-real-pseudo { … }` and
`unknown: !important { … }` as live palettes and printed `OK — 9/9` on pages that
render none of them. Rather than keep guessing which contexts apply, it reads one
and refuses the rest. Tokens **no pair measures** are unaffected and may live
anywhere.

**What the guardrail accepts.** It reads the file with a small CSS scanner rather
than a regex, so a comment inside a value, a `url()` containing a `;` or a `/*`,
a `!important` flag, a string spanning an escaped newline, and any selector or
at-rule that does not hold a measured token are all read the way CSS reads them.
What it **refuses outright**, because a partial read of a palette is worse than
none:

- **a measured token outside a top-level `:root`** — see above;
- **any at-rule this gate cannot vouch for.** The membership question is *can
  this at-rule change what a top-level `:root` palette means?* — `@media`,
  `@supports`, `@layer`, `@container`, `@scope`, `@font-face`, `@keyframes` and
  `@charset` cannot, and are allowed. Everything else is refused, including
  `@import`/`@use`/`@forward` (they name a stylesheet this check never reads, so
  a theme override living there is invisible) and a default `@namespace` (it
  re-points the implied universal selector, so `:root` stops matching the
  document root and the whole palette is inert). A **new** at-rule is refused
  until someone checks it against that question — the list will lag CSS, and a
  loud refusal is the survivable direction;
- **an `@property` registration of a *measured* token.** Registering
  `--color-accent` with `inherits: false` and an initial value leaves the root
  declaration intact and measurable while every descendant renders the initial
  value instead. Registering an unmeasured property is fine;
- **a backslash escape outside a string.** CSS would read `--color-\61 ccent` as
  `--color-accent`; this refuses it instead of decoding it, so **spell
  identifiers plainly**;
- an HTML comment delimiter (`<!--` / `-->`);
- **a custom property whose value is a `{ }` block** — `--x: { … }` is legal CSS
  and this cannot resolve one;
- **a custom-property name outside `[A-Za-z0-9_-]`.** CSS treats every code point
  at U+0080 and up as an identifier character, so `--color-bg` followed by a
  non-breaking space is a *different property*. This gate measures names by
  comparing them literally, so one it cannot compare is refused rather than
  skipped — **spell token names in plain ASCII**;
- **a non-UTF-8 `@charset`.** This gate decodes every file as UTF-8 whatever the
  preamble says, so it would read different characters than the browser does.
  **A UTF-8 BOM outranks it:** the BOM is itself the encoding signature, so text
  following one is not an encoding declaration at all and the file is accepted;
- an unterminated string or comment, or an unbalanced bracket of any kind —
  including a closing `}`, `)` or `]` with nothing open.

Keep `styles/tokens.css` self-contained.
