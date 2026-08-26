---
description: "Establish a project's visual identity — import a look, distil it to tokens.css + components.css + an approved reference page, then hand off to /sdd-loop."
phase: build
benefits-from: [kickoff]
---
Turn a starting look into this project's reusable **design contract**. Run at
kickoff (`/kickoff` calls this) or any time to re-theme. Per `design.md`: there's
no company-wide look — this command creates *this project's* identity and the
contract that keeps it consistent page-to-page. Browser-only throughout.

## 1. Import a look (pick the simplest that fits)
- **Image (default, zero setup):** ask the user to attach a screenshot/mockup
  (from Google Stitch, Figma, Dribbble, a sketch — anywhere). The
  `frontend-design` skill reads the image directly. Best browser-only path.
- **Stitch HTML:** if Stitch's remote MCP is wired (see `docs/guides/design-tooling.md`),
  generate a screen and pull its markup (`getHtml()`); or paste a Stitch download.
  Higher fidelity than an image.
- **Figma:** if a Figma MCP is wired, read the file's variables + styles. For
  plain-HTML output prefer a *descriptive* MCP (returns structure as JSON) and let
  Claude author the markup — the official Figma codegen is React/Tailwind-biased.
- If the user has none of these, ask 2–3 quick taste questions (mood, reference
  sites, accent color) and generate a first direction with `frontend-design`.

## 2. Distill into the contract
From the imported look, **extract** rather than copy verbatim:
- `styles/tokens.css` — the recurring values as CSS custom properties
  (`--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--shadow-*`). No
  hardcoded colors/sizes anywhere downstream — everything reads `var(--…)`.
- `styles/components.css` — the repeated elements (button, card, input, checkbox,
  header) as reusable classes, referencing the tokens.
- one cleaned **reference page** (`index.html` or a representative screen) built
  from those tokens + components — semantic, plain HTML/CSS, no framework.

Honor `design.md`'s universal rules while distilling: iPad tap/inputs sizes, WCAG
AA contrast, `:focus-visible`, `prefers-reduced-motion`, `textContent` for dynamic
text.

## 3. Verify & gate
- Run the contrast guardrail against the new tokens
  (`node .github/scripts/check-contrast.js`); fix any pair below AA.
- **Then read its pair list against the roles this project actually gives its
  tokens.** It measures assumed roles, so a token used the other way round — an
  accent that is small text, a danger colour that is a background — passes
  vacuously and the green looks identical to a real one. Also check by hand any
  accent-coloured text below 18.66px bold / 24px regular: the guardrail holds
  accent/surface only to the 3.0 large-text floor (`design.md` →
  *Accessibility*).
- **Present the reference page for sign-off** (deploy to Pages or attach a
  screenshot) — this is the look-gate. Don't build out until the user approves the
  look; the look is cheapest to fix on one page.

## 4. Hand off
Record the look decisions + the reference-page path in `specs/<slug>/design.md`,
then: "Next: `/sdd-loop` — it builds the remaining pages against
`styles/tokens.css` + `styles/components.css`, so every page matches this one."

Writes: `styles/tokens.css`, `styles/components.css`, the reference page,
`specs/<slug>/design.md`.
