---
description: "Set up a project's look — adopt the house tokens.css + components.css (or, by owner ruling, import a palette into them), build an approved reference page, then hand off to /sdd-loop."
phase: build
benefits-from: [kickoff]
---
Set up this project's **design contract**. Run at kickoff (`/kickoff` calls
this) or when the owner rules a re-theme. Per `design.md`: there is ONE house
style for every project (owner rulings, 2026-10-19), so this command adopts it;
it never invents a look. Browser-only throughout.

## 1. Adopt the house style (default)
Copy `templates/styles/tokens.css` and `templates/styles/components.css` from
claude.directives into `styles/` unchanged, if `/new-repo` has not already. In a
project that already has its own stylesheets, stop and say so: moving an
existing project to the house style is a separate change (#470), by owner
ruling. A palette the owner ruled keeps its values (1b). How later fixes to the
house files reach a project that has adopted them is part of #470 too.
The words, icons, components and patterns in `design.md` (sections 1 to 19)
apply as they are.

## 1b. Import a palette (only by owner ruling)
Only when the owner has ruled this project gets its own palette or fonts (a
client's brand, say), import them and **replace token values, never names**.
Components, words, icons and patterns stay the house ones.
- **Image (default, zero setup):** ask the user to attach a screenshot or
  mockup. The `frontend-design` skill reads the image directly.
- **Stitch HTML:** if Stitch's remote MCP is wired (see `docs/guides/design-tooling.md`),
  generate a screen and pull its markup (`getHtml()`); or paste a Stitch download.
- **Figma:** if a Figma MCP is wired, read the file's variables + styles. For
  plain-HTML output prefer a *descriptive* MCP (returns structure as JSON) and let
  Claude author the markup — the official Figma codegen is React/Tailwind-biased.
Keep every status token (`--color-success`, `--color-warning`, …) meaning its
colour, whatever the new accent is.

## 2. Build the reference page
One cleaned **reference page** (`index.html` or a representative screen) built
only from `styles/tokens.css` + `styles/components.css`: semantic, plain
HTML/CSS, no framework, no new classes. It shows at least the buttons, a card
grid with its Add card, a form, a status pill of each colour, an empty state, a
confirmation dialog and an Archived (N) pop-over, so the look-gate sees the
whole standard on one page.

Honor `design.md`'s universal rules: 44px targets, 48px inputs at 16px, WCAG AA
contrast, `:focus-visible`, `prefers-reduced-motion`, `textContent` for dynamic
text.

## 3. Verify & gate
- Run the contrast guardrail against the new tokens
  (`node .github/scripts/check-contrast.js`); fix any pair below AA.
- **Then read its pair list against the roles this project actually gives its
  tokens.** It measures assumed roles, so a token used the other way round — an
  accent that is small text, a danger colour that is a background — passes
  vacuously and the green looks identical to a real one.
- Check by hand, at 4.5:1, every pair on the list in `design.md` →
  *Accessibility*: the text pairs the house components draw that the guardrail
  does not measure.
- **Present the reference page for sign-off** (deploy to Pages or attach a
  screenshot) — this is the look-gate. Don't build out until the user approves the
  look; the look is cheapest to fix on one page.

## 4. Hand off
Record the look decisions (house style, or the ruling behind an imported palette) + the reference-page path in `specs/<slug>/design.md`,
then: "Next: `/sdd-loop` — it builds the remaining pages against
`styles/tokens.css` + `styles/components.css`, so every page matches this one."

Writes: `styles/tokens.css`, `styles/components.css`, the reference page,
`specs/<slug>/design.md`.
