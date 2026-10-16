# Design Method

This is the exported design directive for all projects. Import it via:
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/design.md

There is **no company-wide look, and no cross-project interaction or copy
standard** (owner ruling, 2026-10-16). Each project owns its visual identity,
its interaction patterns (tables, lists, cards) and its tone and copy. The only
consistency that matters is **page-to-page within a single project**, carried by
that project's own tokens and components.

## Establishing your project's look
At kickoff, run **`/design-intake`** (`/kickoff` calls it). It turns a starting
point into the project's design contract:
1. **Import a look:** an image or screenshot (default, read by the
   `frontend-design` skill), Stitch HTML via Stitch's remote MCP, or Figma
   variables via a Figma MCP (owner ruling, 2026-10-12).
2. **Distill** it into the contract below plus one approved **reference page**.
3. **Build** the remaining pages against that contract, so every page matches
   page one.

Generator setup: `docs/guides/design-tooling.md`. `frontend-design` and Stitch
are current practice, not a ruling; propose another generator to the owner if
it fits better.

## Tokens & components (the per-project consistency contract)
Two committed files are the single source of truth for a project's look:
- **`styles/tokens.css`**: brand primitives as CSS custom properties
  (`--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--shadow-*`). Every rule
  uses `var(--…)`, never a hardcoded value.
- **`styles/components.css`**: reusable elements (button, card, input,
  checkbox, header), built once and used on every page.

Every generator is told to **use this project's `tokens.css` and
`components.css`**, never to invent a parallel system. Starter versions ship in
`templates/styles/` for `/new-repo`.

## Stack
Plain HTML, CSS and vanilla JS on GitHub Pages, no build by default. This is set
by `global.md` → *Hosting & Deployment* (owner ruling, 2026-08-21; build rule
2026-10-06), which owns it. Tokens and components are plain CSS; a utility
library such as Tailwind needs the CI-build opt-in, and replacing `tokens.css`
and `components.css` with one is a further owner decision.

## Script loading
**Inline scripts run after their DOM.** An inline `<script>` that binds event
listeners goes at the very end of `<body>`, or wraps its bindings in a
`DOMContentLoaded` handler (with a `document.readyState` fast-path). Binding to
a not-yet-parsed element throws and silently kills every handler after it,
while the page still looks rendered. (`test.md`'s console-error gate catches
this.)

## Cross-platform & responsive
Every UI works on desktop, tablet and phone. Design responsive-first:
- **Fluid layout:** content reflows from phone to desktop; nothing clips or
  scrolls horizontally at phone width.
- **Touch and pointer:** every action works by tap, click and keyboard. **No
  hover-only states**; pair every `:hover` with a tap or focus equivalent.
- Targets: tap/click min **44×44px**; checkboxes min **24×24px**; min **8px**
  between adjacent targets.
- Inputs: min **48px** high; input font **never below 16px** (prevents iOS zoom
  on focus).

## Accessibility
Non-negotiable, whatever the look:
- **WCAG AA contrast:** normal text ≥ 4.5:1, large text and icons ≥ 3.0:1. Large
  means ≥ 18.66px bold or ≥ 24px; anything smaller needs 4.5.
- Visible keyboard focus: pair `:hover` with `:focus-visible`.
- Honor `prefers-reduced-motion`.
- Status is never conveyed by colour alone.
- Use `textContent` for DOM text from any backend or user input, never
  `innerHTML` (per `global.md`).

The per-project contrast guardrail (`templates/scripts/check-contrast.js`, run in
CI against `styles/tokens.css`) is **a floor, not a coverage report**: it measures
a hand-written list of token pairs, so a token used in a different role passes
while rendering wrong. Read its pair list against your own token roles. A themed
project gives **each theme its own complete tokens file** and lists every one.
Its limits and every file shape it refuses: `docs/standards/contrast-guardrail.md`.

## Motion
Short, calm transitions (≈0.15s ease). No bounce, spin, flash or heavy
keyframes. Always honor `prefers-reduced-motion`.

## Charts & data display (owner ruling, 2026-09-24)
Use the native **`dataviz`** skill (built in, nothing to install) for chart type,
palettes, legends, axes and tooltips. Swap its placeholder palette for this
project's `--color-*` tokens. The accessibility rules above apply to series
colours and legends too.

## Diagrams & connectors (owner ruling, 2026-09-24)
For any node-and-edge surface, **every connector stays individually traceable to
exactly one source→target pair**, at any zoom. The native `artifact-diagramming`
skill owns the rest (when a diagram earns its place, routing, legibility in both
themes); read it before drawing one. Verify from the edge geometry, not by eye:
no two edges from different sources overlap collinearly, and no edge crosses a
node.
