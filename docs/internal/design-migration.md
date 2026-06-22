# Design migration — from a fixed company system to per-project generative design

> **Status: proposed spec, for review.** Nothing is deleted or rewritten until
> this plan is approved. Execution is staged (Phase 1 additive → Phase 2 cutover)
> so CI stays green throughout.

## Why
The current `directives/design.md` is a **fixed, company-wide** design system (10
shared themes) that every project inherits, enforced by CI parity/contrast
checks. The decision: **drop cross-project conformity.** Each project should own
its own look; the only consistency that matters is **page-to-page within a single
project**. The look is **generated** (from Stitch / Figma / an image) rather than
dictated by a directive.

## The new model
- **No company-wide look.** The shared theme system goes away.
- **Per-project consistency contract** — created at kickoff, lives in the project
  repo:
  - `styles/tokens.css` — the project's brand primitives (color, type, spacing,
    radius, shadow) as CSS custom properties.
  - `styles/components.css` — the project's reusable button/card/input/header,
    built once and referenced by every page.
  - one approved **reference page** (the look-gate).
- **Generation:** the `frontend-design` skill authors markup in-session; **Google
  Stitch's remote MCP** is the optional visual generator. Both are instructed to
  use *this project's* `tokens.css`/`components.css`, never a global system.

## What `directives/design.md` becomes
**Rewritten in place** (keeps the downstream import URL stable). Split: drop the
single-look prescription, keep the look-independent craft rules.

| Drop (the fixed look) | Keep (universal craft — applies to any look) |
|---|---|
| The 10 color schemes / `[data-theme]` system | iPad rules (44px tap targets, 16px+ inputs) |
| Fixed type scale, radii, component shapes | Accessibility (WCAG AA, `:focus-visible`, `prefers-reduced-motion`) |
| "Structure is fixed, only color changes" mandate | Motion principles (no bounce/spin/flash) |
| The expressive-vs-utility prescription | Editorial / copy / number-formatting rules |

New `design.md` = *"establish your project's `tokens.css` + `components.css` at
kickoff (via `/design-intake`); generate pages against them; meet these universal
craft bars."*

## `/design-intake` (new command)
A dedicated, reusable command — **called by `/kickoff`** as a step, also runnable
standalone to re-theme later. Phase: `build`. Flow:

1. **Import a look** (cleanest browser-only path first):
   - **Image** (default) — attach a screenshot/mockup from Figma, Stitch, or
     anywhere; `frontend-design` reads it (Stitch also accepts image input). No
     MCP needed.
   - **Stitch HTML** — pull real markup via Stitch's remote MCP (`getHtml()`) or
     paste a download. Higher fidelity.
   - **Figma** — read Variables + styles via the Figma/Framelink MCP (needs MCP
     wiring; official Figma MCP is React-biased, so Framelink's JSON → Claude
     authors vanilla HTML is the path for plain output).
2. **Distill → contract:** extract recurring values into `styles/tokens.css`,
   repeated elements into `styles/components.css`, and produce one cleaned
   **reference page**.
3. **Approve** the reference page (look-gate), then hand off: `/sdd-loop`
   builds the remaining pages against the contract — consistent page-to-page.

Writes: `styles/tokens.css`, `styles/components.css`, `specs/<slug>/design.md`
(the look decisions + reference-page path). `sdd-loop implement` reads these.

## Generators & wiring (browser-only)
- **`frontend-design`** (Anthropic official skill) — in-session, no server/key;
  the primary author. Added to `scripts/install-toolkit.sh` so every environment
  installs it.
- **Google Stitch** — optional, via its **official remote MCP**
  (`https://stitch.googleapis.com/mcp`, `X-Goog-Api-Key` header) added in Claude
  Code's web MCP settings — **no local install**. Doc'd in a new setup note. (The
  third-party `npx` Stitch MCPs are avoided — they require local install.)
- **Figma** — optional, only if designing visually in Figma; Framelink hosted MCP
  for vanilla output.

## Accessibility guardrail (kept, repurposed)
The WCAG contrast check moves from "validate the 10 company schemes" to a
**per-project template** that runs against the project's `tokens.css`. Ships in
`templates/` and is wired into the project's `qa.yml`.

## File-by-file change list

**DELETE**
- `docs/design-system.html` — its Pages slot is taken by `docs/repo-map.html`
- `.github/scripts/check-theme-parity.js`, `.github/scripts/parse-themes.js`
- `tests/theme.spec.js`, `tests/playwright.config.js`, `tests/package.json`

**REWRITE / MOVE**
- `directives/design.md` → thin design-method directive (above)
- `.github/scripts/check-contrast.js` → moved to `templates/` as a per-project guardrail

**ADD**
- `plugins/directives-toolkit/commands/design-intake.md`
- `templates/styles/tokens.css`, `templates/styles/components.css`
- `templates/scripts/check-contrast.js` (the repurposed guardrail)
- a Stitch-MCP setup doc (browser-only wiring)

**UPDATE**
- `.github/workflows/qa.yml` — drop theme-parity/contrast steps + the non-blocking Theme-contract job
- `.github/scripts/required-sections.json` — new `design.md` section names
- `templates/CLAUDE-template.md` — remove `Design Theme: [choose one of 10]`; note the look is set at kickoff
- `scripts/install-toolkit.sh` — add the `frontend-design` plugin
- `plugins/directives-toolkit/commands/`: `kickoff.md` (call `/design-intake`), `new-repo.md` (scaffold `styles/`), `sdd-loop.md` (look-gate sources from the contract)
- `docs/dev-pipeline.md` — reverse the earlier "frontend-design rejected" note (now adopted); add `frontend-design` + Stitch MCP to the delegation map; add the design-intake step
- `directives/global.md` — soften "never deviate from the design directive"
- site/links: root `index.html`, `README.md`, `docs/README.md`, `docs/index.html`, `CLAUDE.md` — feature `repo-map.html`, drop design-system references

## Phasing (CI stays green)
- **Phase 1 — additive** (no deletions): add `/design-intake`, the `styles/`
  templates, the contrast guardrail template, the Stitch-MCP doc; add
  `frontend-design` to `install-toolkit.sh`. Nothing breaks.
- **Phase 2 — cutover** (one PR, interdependent): rewrite `design.md` + update
  `required-sections.json` together; delete `design-system.html` /
  theme-parity / parse-themes / theme-tests; drop the `qa.yml` jobs; relink the
  site to `repo-map.html`; update the toolkit + global references.

## Decided options
1. **`/design-intake`** dedicated command, called by `/kickoff`, reusable standalone.
2. Generators: **`frontend-design` primary + Stitch remote MCP optional**; Figma optional.
3. **Image import** is the default browser-only path; Stitch-HTML / Figma-MCP for higher fidelity.
4. **Rewrite `design.md` in place** (stable import URL).
5. **Keep the contrast guardrail** as a per-project check.
6. Ship a **neutral `tokens.css` starter** projects regenerate at intake.
