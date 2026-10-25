---
description: "Set up a project's look — adopt the house tokens.css + components.css (or, by owner ruling, import a palette into them), or move an existing project onto them, build an approved reference page, then hand off to /sdd-loop."
phase: build
benefits-from: [kickoff]
---
Set up this project's **design contract**. Run at kickoff (`/kickoff` calls
this) or when the owner rules a re-theme. Per `design.md`: there is ONE house
style for every project (owner rulings, 2026-10-19), so this command adopts it;
it never invents a look. Browser-only throughout.

## 1. Adopt the house style (default)
Copy `templates/styles/tokens.css` and `templates/styles/components.css` from
claude.directives into `styles/` unchanged, if `/new-repo` has not already, and
mark the project as on the house style (`design.md` → *Tokens & components*), creating
the file as `{}` first if it is absent:

```bash
jq '.house_style = true' .claude/directive-sync.json > .claude/directive-sync.tmp \
  && mv .claude/directive-sync.tmp .claude/directive-sync.json
```

From then on `/refresh-repo` keeps both files current. A project that already
has its own stylesheets does not start here: it moves with 1c. A palette the
owner ruled keeps its values (1b). The words, icons, components and patterns in
`design.md` (sections 1 to 19) apply as they are.

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

## 1c. Move an existing project (#470)
For a project that already has screens and stylesheets of its own. It moves
once, by owner ruling (2026-10-19), in three steps that are each their own PR,
and never from `/refresh-repo`. Before step 1, the owner's palette decision:
keep the project's own colours and fonts (recorded as a palette ruling in its
`CLAUDE.md`, so 1b applies) or take the house's. Use a ruling `CLAUDE.md`
already records; otherwise ask once.

**Step 1: make room, with no visible change.**
1. Run the inventory, from the project root:
   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/scripts/house-style-inventory.sh"
   ```
   Each `COLLISION` line is a class name the project's own stylesheets share
   with the house `components.css`; the `TOKENS` lines name the house token
   names nothing declares yet. Exit 1 while any collision remains.
2. Screenshot every screen before changing anything: each view, in the states
   that matter (empty, with data, a dialog or pop-over open), at 390 px and
   1440 px wide, with the project's Playwright kit. Keep them out of git.
3. Rename each collision to `legacy-<name>` in the project's CSS, HTML, JS and
   tests. Match the whole class token, never a word: `btn` must not catch
   `btn--primary` or `btn-sm`, and `input` or `page` as plain words far
   outnumber their class uses. Rename its `--` and `__` family with it
   (`btn--primary` becomes `legacy-btn--primary`), so step 3's search finds
   every old use. Search each name in strings, `className`,
   `classList`, `querySelector`, `closest`, `matches` and template literals,
   and in data passed into a template (`variant: "btn-secondary"`). A class
   built by joining strings (`'pill ' + kind`) shows up only by reading, so
   search its prefix too. Give each screen's root element `legacy-screen` as
   well: step 7 scopes anything it must hold back under it.
4. Move the project's own components stylesheet off the house path: a
   `styles/components.css` that is the project's becomes `styles/legacy.css`.
   Its other stylesheets stay where they are.
5. Put the tokens in `styles/tokens.css` (move them there from `css/tokens.css`
   or wherever they live, and repoint what loads them), declaring every house
   token name. Keeping the palette: the project's values stay, and each new
   name gets a value in that palette (a dark palette needs dark status pairs).
   Taking the house's: copy the house values. The project's own tokens stay in
   the file. Run the contrast guardrail, then the hand-check list in
   `design.md` → *Accessibility*.
6. Install `templates/styles/components.css` verbatim at
   `styles/components.css`, loaded on every page after `tokens.css` and BEFORE
   the project's own stylesheets, so the project's own rules still win where
   they overlap the house page base.
7. Screenshot again and compare. With the palette kept, every difference comes
   from the house page base (box-sizing, the body font and line height,
   headings, link colour, images, `[hidden]`, the form controls' font). Keep a
   difference only if it moves toward the house look and breaks nothing, and
   show it in the PR. Otherwise pin the old value in `styles/legacy.css`,
   scoped to the old screens: on the `legacy-` class that needs it, or under
   `.legacy-screen` for an element (`.legacy-screen h2`), never on a bare
   element selector, which would also hold back the screens already moved.
   The ones to look for: `body`'s `overflow-wrap: anywhere` (narrow rails and
   tickers), the h1 to h3 sizes and margins, the font of buttons and fields,
   and `a:focus-visible`, which outranks a bare `:focus-visible` whatever the
   load order. Taking the house palette changes colours on every
   screen by design: say so in the PR, with before and after.
8. Run the inventory again: it must print no `COLLISION`.
9. Write `DESIGN-GAPS.md` (the known-gaps file `design.md` describes at its top): one line per screen
   and group that does not meet the standard yet, each with its file.
10. Mark the project as on the house style (the `jq` line in 1). In
    `CLAUDE.md`, replace any line saying the look is the project's own with
    the 2026-10-19 ruling, and record the palette ruling when the palette is
    kept. Update every other list that names the stylesheets (an asset
    manifest, a cache-busting version, a `<noscript>` fallback).

**Step 2: move the screens**, one (or a few small ones) per PR, in the order
the owner picks from `DESIGN-GAPS.md`. Each screen takes the house components
and the patterns in `design.md` (words, icons, archive and restore,
confirmations, never a native `confirm()`), drops its `legacy-` classes and
`legacy-screen`, and deletes the lines it fixes. Map by meaning, not by name:
an old bare `.btn` that was filled is `.btn-primary` in the house set. Behaviour every page shares lives in one shared
script (`design.md` → *Tokens & components*): use the project's own until the
shared page script ships (#471).

**Step 3: finish.** When `git grep -n 'legacy-'` finds no use outside the
legacy stylesheet, delete it and what loads it, and the emptied
`DESIGN-GAPS.md`. The project's own rules that remain (layout, its modifiers)
live in its own stylesheet, never in `styles/components.css`.

## 2. Build the reference page
One cleaned **reference page** (`index.html` or a representative screen) built
only from `styles/tokens.css` + `styles/components.css`: semantic, plain
HTML/CSS, no framework, no new classes, its content inside `.page`. It shows at least the buttons, a card
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

Writes: `styles/tokens.css`, `styles/components.css`, the `house_style` marker
in `.claude/directive-sync.json`, the reference page, `specs/<slug>/design.md`;
for a move (1c), also the renames, `styles/legacy.css` and `DESIGN-GAPS.md`.
