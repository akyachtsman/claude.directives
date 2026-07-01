# Design Method

This is the exported design directive for all projects. Import it via:
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/design.md

There is **no company-wide look.** Each project owns its own visual identity.
The only consistency that matters is **page-to-page within a single project** —
carried by that project's own design tokens and components, established once at
kickoff and reused everywhere. Across projects, nothing has to match.

## Establishing your project's look
At project kickoff, run **`/design-intake`** (the `/kickoff` flow calls it for
you). It takes a starting point and turns it into your project's reusable design
contract:

1. **Import a look** — fastest first:
   - **An image** (default, browser-only): attach a screenshot/mockup from Google
     Stitch, Figma, or anywhere — the `frontend-design` skill reads it.
   - **Stitch HTML** — pull real markup via Stitch's remote MCP, or paste a download.
   - **Figma** — read variables/styles via a Figma MCP (for plain HTML, use a
     descriptive MCP and let Claude author the markup).
2. **Distill** the import into the project's contract (below) + one approved
   **reference page** (the look-gate).
3. **Build** the remaining pages against that contract via `/sdd-loop` — so every
   page matches page one.

See `docs/design-tooling.md` for generator setup (the `frontend-design` skill and
wiring Stitch's remote MCP for a browser-only session).

## Tokens & components (the per-project consistency contract)
Two files, committed in the project repo, are the single source of truth for its
look:
- **`styles/tokens.css`** — the brand primitives as CSS custom properties:
  `--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--shadow-*`. Every rule
  references `var(--…)`, never a hardcoded value. Change a token → the whole
  project re-themes.
- **`styles/components.css`** — the reusable elements (button, card, input,
  checkbox, header) built once and used on every page, so structure stays
  consistent page-to-page.

Generators (`frontend-design`, Stitch) are always instructed to **use this
project's `tokens.css`/`components.css`**, never invent a parallel system. Starter
versions ship in `templates/styles/` for `/new-repo` to scaffold.

## Stack
Plain HTML + CSS + vanilla JS, no *local* build (per `global.md`). Tokens are
plain CSS custom properties; components are plain CSS — both drop straight onto
GitHub Pages, **and carry over unchanged if the project graduates to the
production tier** (React / Next.js on Vercel): `tokens.css` is imported in the
Next app's global stylesheet, `components.css` becomes the React components'
styles. The design contract is framework-agnostic by design — never rebuild it
per framework. File layout:
```
styles/
  tokens.css       ← brand primitives (this project's look)
  components.css    ← reusable components
  base.css          ← reset + typography (optional)
  layout.css        ← page structure (optional)
```

## iPad Rules
Every project's UI must work on iPad Safari, whatever its look:
- Tap targets: min **44×44px** always
- Input fields: min **48px** height; font on inputs **never below 16px** (prevents iOS zoom)
- Checkboxes: min **24×24px**
- Gap between tappable elements: min **8px**
- **No hover-only states** — pair every `:hover` affordance with a tap/focus equivalent

## Accessibility
Non-negotiable, independent of the chosen look — enforced per-project by the
contrast guardrail (`templates/scripts/check-contrast.js`, run in CI against
`styles/tokens.css`):
- **WCAG AA contrast:** normal text ≥ 4.5:1, large/icon ≥ 3.0:1
- Visible keyboard focus: pair `:hover` with `:focus-visible`
- Honor `prefers-reduced-motion`
- Use `textContent` for DOM text from any backend/user input — never `innerHTML` (per `global.md`)

## Motion
- Keep transitions short and calm (≈0.15s ease is a good default)
- **Never** bounce, spin, flash, or use heavy keyframes that fight readability
- Always honor `prefers-reduced-motion`

## Tables & sorting
Any table/grid of rows sorts the **same way in every project** — same
interaction, same rules — so a user never relearns it:
- **The column header IS the sort control.** Clicking (or Enter/Space on) a header
  sorts the rows by that column. No separate sort pills or menus.
- **Toggle direction:** the first activation of a column sorts **ascending**;
  re-activating the active column flips to **descending**. Exactly one column is
  active at a time.
- **Type-aware:** numeric columns compare as numbers, text as case-insensitive
  `localeCompare`. Keep the sortable value in `data-sort` on each cell, separate
  from the display text — so `$42,000` sorts by `42000` and `Jun 4` by an ISO date.
- **No-data sinks last:** empty / `—` cells always sort to the bottom in *both*
  directions (pairs with the `—` = no-data rule under Number & Data Formatting).
- **State is visible + accessible:** set `aria-sort` on the active `<th>` and show
  a direction arrow (`↑`/`↓`); headers are keyboard-operable, 44px tap targets,
  `:focus-visible` outlined.

Reference implementation — wire `makeSortable(table)` once per table; the markup
carries the raw value in `data-sort` and the column type in `data-type`:
```html
<th data-type="number" tabindex="0" aria-sort="none">Value</th>   <!-- header = control -->
<td data-sort="42000">$42,000</td>                                 <!-- data-sort = raw, text = display -->
```
```js
function makeSortable(table){
  const heads = [...table.tHead.rows[0].cells], body = table.tBodies[0];
  const blank = v => v === '' || v === '—' || v == null;
  const go = th => {
    const i = th.cellIndex, num = th.dataset.type === 'number';
    const dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
    const s = dir === 'ascending' ? 1 : -1;
    heads.forEach(h => h.setAttribute('aria-sort', 'none'));
    th.setAttribute('aria-sort', dir);
    const val = tr => { const c = tr.cells[i]; return c.dataset.sort ?? c.textContent.trim(); };
    [...body.rows].sort((a, b) => {
      const x = val(a), y = val(b);
      if (blank(x) && blank(y)) return 0;   // no-data always last,
      if (blank(x)) return 1;               // regardless of direction
      if (blank(y)) return -1;
      return (num ? x - y : ('' + x).localeCompare(y, undefined, {sensitivity:'base', numeric:true})) * s;
    }).forEach(tr => body.appendChild(tr));
  };
  heads.forEach(th => {
    th.onclick = () => go(th);
    th.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(th); } };
  });
}
```

## Editorial Preferences
Look-independent copy and formatting rules — apply to every project.

### Tone & Voice
Professional but approachable. No jargon. Short sentences. Prefer active voice.
Avoid "please" and "simply". Write for someone busy and competent.

### UI Copy Rules
- Buttons: verb-first ("Save Changes", "Export Report" — not "Click to Save")
- Error messages: what happened + what to do ("No data found — try a wider date range")
- Empty states: explain why, then the next action ("No tasks yet — add one above")
- Section headers: noun phrases, no verbs ("Team Activity", not "View Team Activity")
- Tooltips: one sentence max, no period
- Confirmation dialogs: state the consequence ("This will permanently delete 3 tasks.")

### Number & Data Formatting
- Percentages: whole numbers (53%, not 53.2%)
- Large numbers: K/M suffix above 999 (1.2K, 2.4M)
- Dates: "Jun 4" — not "06/04", not "June 4th", not "2026-06-04"
- Date ranges: "May 4 – Jun 4" (en-dash, spaces both sides)
- Zero vs no-data: "0" = measured zero · "—" = not measured / no data
- Rates: always pair with context ("8% — last 7 days with data")
