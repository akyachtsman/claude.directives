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

See `docs/guides/design-tooling.md` for generator setup.

## Tokens & components (the per-project consistency contract)
Two files, committed in the project repo, are the single source of truth for its
look:
- **`styles/tokens.css`** — the brand primitives as CSS custom properties:
  `--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--shadow-*`. Every rule
  references `var(--…)`, never a hardcoded value. Change a token → the whole
  project re-themes.
- **`styles/components.css`** — the reusable elements (button, card, input,
  checkbox, header) built once and used on every page.

Generators (`frontend-design`, Stitch) are always instructed to **use this
project's `tokens.css`/`components.css`**, never invent a parallel system.
Starter versions ship in `templates/styles/` for `/new-repo` to scaffold.

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

## Script loading
**Inline scripts run after their DOM.** An inline `<script>` that binds event
listeners must not execute before the elements it targets are parsed: place it at
the very end of `<body>`, or wrap the bindings in a function run on
`DOMContentLoaded` (with a `document.readyState` fast-path). Binding a listener
to a not-yet-parsed element throws — and silently kills the rest of the script,
so **every handler after the throw never attaches** while the page still "looks"
rendered. Never bind to an element defined later in the document than the script.
(`test.md`'s console-error gate exists to catch exactly this.)

## Cross-platform & responsive
Every project's UI must work across the platforms it ships to — laptop/desktop,
tablet (iPad), and phone (iPhone/Android). Design responsive-first:
- **Fluid layout:** adapt from phone to desktop widths — no fixed desktop-only
  canvas. Content reflows; nothing is clipped or scrolls horizontally at phone
  width. Use responsive units and breakpoints, not hardcoded pixel layouts.
- **Touch *and* pointer:** every action works by tap, click, and keyboard.
  **No hover-only states** — pair every `:hover` with a tap/focus equivalent.
- Targets: tap/click min **44×44px**; checkboxes min **24×24px**; min **8px**
  gap between adjacent targets.
- Inputs: min **48px** height; font on inputs **never below 16px** (prevents iOS
  zoom on focus).

## Accessibility
Non-negotiable, independent of the chosen look — enforced per-project by the
contrast guardrail (`templates/scripts/check-contrast.js`, run in CI against
`styles/tokens.css`):
- **WCAG AA contrast:** normal text ≥ 4.5:1, large/icon ≥ 3.0:1
- Visible keyboard focus: pair `:hover` with `:focus-visible`
- Honor `prefers-reduced-motion`
- Use `textContent` for DOM text from any backend/user input — never `innerHTML`;
  re-audit sinks when a value becomes user-editable (both per `global.md`)

## Motion
- Keep transitions short and calm (≈0.15s ease is a good default)
- **Never** bounce, spin, flash, or use heavy keyframes that fight readability
- Always honor `prefers-reduced-motion`

## Tables & sorting
Any table/grid of rows sorts the **same way in every project** — same
interaction, same rules — so a user never relearns it:
- **The column header IS the sort control.** Clicking (or Enter/Space on) a
  header sorts the rows by that column. No separate sort pills or menus.
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

## List & summary surfaces
For a short, triage-style list of items (tasks, alerts, posts, entries) a user
scans at a glance, use **one** consistent card pattern across the project. Use it
for **≤ ~10 rows** with a title + context per item; reach for **Tables & sorting**
instead when the data is tabular or needs comparison/sorting.

**Anatomy** — a titled card holds hairline-divided rows; each row is the control:
- **Card** — `--surface`, `1px solid --border`, radius from `--radius-*`, `--shadow`;
  a small header (weight 700, `--muted`), optional count.
- **Row = a full-width `<button>`** (`font: inherit`, left-aligned), **44px** min tap
  target, with a `1px --border` **top divider between rows** (first row none) — the
  framed-card + hairline look is the defining trait.
- **Leading indicator** in a **fixed-width column** so every title left-aligns: a
  status **pill** or a line **icon** (`stroke: currentColor`, so it follows the
  theme). **One indicator style per card** (all pills or all icons). **No emoji.**
- **Title** — single line, weight 500, **ellipsis on overflow (never wraps)**.
- **Subline** — `--muted`, the context ("Open · Maria · 8:20").

**Rules**
- **Status is conveyed by the pill's text, never colour alone** (WCAG + screen
  readers): colour reinforces, the label carries the meaning. Map each status to a
  semantic token consistently — the palette is **per-project**.
- **Tokens, not literals** — every value reads `var(--…)`.
- **States:** hover / `:focus-visible` → `--primary-bg`; a selected or deep-linked
  row keeps `--primary-bg`; **empty** → one centred muted line (per Editorial →
  Empty states).
- **Deep-link + arrive-flash:** clicking a row opens its source and flashes the exact
  target row — scroll into view, pulse `--primary-bg` + a `2px --primary` outline
  (~2.4s), and move focus to it. **Honor `prefers-reduced-motion`** — highlight and
  focus without the pulse.
- A header action (e.g. "+ New") must `stopPropagation()` so it can't fire the row.

Reference implementation — `makeSummaryList(card)` + `flashRow(row)`; the markup
carries the item id in `data-id`:
```html
<button class="summary-row" data-id="…">
  <span class="row-lead"><span class="pill pill--alert">Alert</span></span>
  <span class="row-main">
    <span class="row-title">One-line title, ellipsis on overflow</span>
    <span class="row-sub">Context · author · time</span>
  </span>
</button>
```
```js
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
function flashRow(row){                      // the "arrived from a deep-link" affordance
  row.scrollIntoView({block:'center', behavior: reduce ? 'auto' : 'smooth'});
  row.classList.remove('flash'); void row.offsetWidth;   // restart the animation
  row.classList.add('flash'); row.focus({preventScroll:true});
  setTimeout(() => row.classList.remove('flash'), reduce ? 1200 : 2400);
}
function makeSummaryList(card){
  const rows = [...card.querySelectorAll('.summary-row')];
  rows.forEach(row => row.addEventListener('click', () => {
    rows.forEach(r => r.classList.toggle('selected', r === row));
    // real app: open row.dataset.id's source screen, then flashRow(target).
  }));
}
```

## Charts & data display
There is **no chart standard written here.** Use the native **`dataviz`** skill
— a Claude Code built-in, so there is nothing to install or enable —
it is the authority for chart-type choice, categorical/sequential palettes that
survive both themes, stat tiles, legends, axes and tooltips. Load it before
writing the first line of chart code, in any medium (HTML/React artifact, inline
SVG, matplotlib/plotly/d3/Recharts).
- The project's `tokens.css` still wins on brand: swap `dataviz`'s placeholder
  palette for this project's `--color-*` tokens rather than shipping its defaults.
- Accessibility above is not waived by it — contrast ratios and
  never-colour-alone apply to series colours and legends too.

## Diagrams & connectors
For any node-and-edge surface (relationship maps, flow/architecture diagrams, org
charts — SVG or canvas). The invariant: **every connector stays individually
traceable to exactly one source→target pair**, at any zoom.

**Rules**
- **No collinear overlap between different relationships.** Two edges from
  *different* sources must never lie on the same line — they read as one.
  Same-orientation runs sharing a corridor each get their **own lane** (a fixed
  per-edge offset within the corridor).
- **A bus is one relationship.** A single source fanning to several targets may
  share a trunk — that trunk *is* the relationship, drawn once. Never let two
  different relationships merge into something that reads as a bus.
- **Route around boxes, never behind them.** An edge passing under a node is
  untraceable; add a bend instead.
- **Crossings break with a gap, never an arc.** Where perpendicular edges cross,
  interrupt the lower edge with a small gap. Arcs/hop-loops read as nodes at
  small sizes.
- If edges carry labels, each label sits on its own edge's lane — never in a
  shared corridor where it could attach to a neighbour.

**Native authority.** The `artifact-diagramming` skill covers this ground and
should be read before drawing one — it owns when a diagram earns its place and
the inline-SVG mechanics that keep it legible in both themes. The rules above are
the blocking criteria this directive adds on top; where the skill is silent, it
decides.

**Verify geometrically, not visually, before shipping.** A glance misses
collinear overlaps. From the edge geometry itself (path data / computed
polylines), assert: no two segments from different edges overlap collinearly, and
no segment intersects a node's rect. Then confirm against the **served** build,
not the local file — hash-nav and CDN caching can serve a stale build that hides
the change (cache-bust with `?v=` or incognito).

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
