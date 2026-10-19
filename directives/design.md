# Design Method

This is the exported design directive for all projects. Import it via:
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/design.md

**The company look is the RSO app's look, and the company UI standard is RSO's
object standard** (owner ruling, 2026-10-19: *"I spend most of the time with RSO
app, so the design elements from this project should be used for all the
others."*). It supersedes the 2026-10-16 ruling that there was no company-wide
look and no cross-project interaction or copy standard. Every project starts from
the look and the object standards below, so an act looks and works the same in
every app the owner uses. **Where this file and the RSO app disagree, RSO wins**
and this file is corrected to match it; a project with a brand of its own may
change the *values* in `styles/tokens.css`, never the object standards.

The rules are written here, not linked, because the RSO repo is private. Its own
file, with RSO's product words and its breach list, is `DESIGN.md` in
`akyachtsman/apfp.claude`; the company-level rules are this file.

## Company look (from RSO)
Light, calm, warm-neutral surfaces with one blue accent. The values ship as the
starter `templates/styles/tokens.css`:

| Role | Value |
|---|---|
| Page background | warm off-white `#F5F5F3` |
| Card / surface | white `#FFFFFF`, 1px border `#E2E0DB` (hover `#C8C5BE`), soft shadow |
| Text | near-black `#1A1A1A`; secondary warm grey `#6B6860` |
| Accent (brand, primary button, links, selection) | blue `#1273E0` (RSO's `#1275E2`, one shade darker so white text passes AA); hover `#0E5EB5`; tint `#E7F1FD` |
| Danger | red `#C0392B` on tint `#fee2e2` |
| Waiting / attention | amber `#d97706` on tint `#fef3c7` (amber text needs a darker shade to pass AA on its tint) |
| Font | Inter, then the system sans-serif |
| Corners | cards 14px; buttons and inputs smaller (6–10px); pills fully rounded |

**Emoji are allowed** as decoration and in content (RSO, owner ruling
2026-08-11: *"emoji stays"*), but an **action** button always uses the one icon
named in *Object standards → Icons*.

## Object standards (from RSO)
One way of working per kind of object, taken from conventions people already
know (Gmail, Google Drive, iOS, Windows, Material, Apple's guidelines). Building
something these groups do not cover: ask the owner in product terms, then add
the answer here; never invent a pattern.

**Principles.** Familiar over clever: the control and icon a person already
recognises, never a new look for a known job. One job, one look: the same act
has the same word, icon, place and confirmation on every screen. Simple and
calm: cards show the essentials, details live in the opened view. Safe by
default: nothing irreversible on one press. Never lose the person: after any
button in a window finishes or is cancelled they are back in that window, and
Back returns them to where they were, scroll included. Never truncate a label
(wrap it), and never hide information people relied on.

**Words — one verb per act.**
| Act | Say | Never say |
|---|---|---|
| Put away, recoverably | **Archive** | Remove, Delete, Deactivate, Retire, Hide |
| Bring back | **Restore** | Unarchive, Reactivate, Undo |
| Destroy for good (rare) | **Delete permanently** | Remove, Archive |
| Take an assignment off, nothing lost | **Remove** | Delete, Archive |
| Create | **Add** *thing* (`+ Add item`) | New, Create, `＋` alone |
| Keep a form's changes | **Save** | OK, Done, Apply, Submit |
| Leave a dialog, nothing changed | **Cancel** | Close, No |
| Leave a read-only dialog | **Close** | Cancel, OK |

Busy labels are the verb in -ing form with one "…" character: **Saving…**,
**Uploading…**, **Archiving…**.

**Icons — one icon per act**, from one line-icon set (Lucide shapes); an icon
the set lacks is added to it, never drawn inline. Add: `+` and a word · Edit:
pencil ✎ · Archive: archive box (never ✕, ×, 🗄️ or 📦) · Restore: a text button
**Restore** · Delete permanently: trash can · Close a dialog or remove a chip or
unsaved attachment: × · More actions (3+ on one card or row): ⋮ · Upload:
cloud-up or tray-up arrow beside a **Choose file** button · Attach in a small
composer: 📎 · Download: arrow into a tray · Search: magnifying glass inside the
field · "You cannot change this": 🔒 · Reorder: ⋮⋮ grip · Sort: ▲ / ▼ · Back: ←.
Every icon-only button has an `aria-label` and a `title` naming the act
("Archive Walk-in fridge").

**Buttons — three kinds only.** Primary: filled accent, white text, at most one
per view and one per dialog. Secondary: white with a grey border, every other
act including Cancel. Destructive: red text and border, filled red only for the
final button of a Delete permanently confirmation. Right-aligned at the end of
the row they act on. While working the button is disabled and shows its busy
label; on error it comes back. A button this person can never press is not
shown; one that will become pressable says why in its `title`.

**Cards and grids.** The whole card opens it (one press, Enter and Space too).
A card shows its name, one line of context and its status pill; everything else
is in the opened view. At most two corner actions, top-right, in the order Edit
then Archive; three or more become one ⋮ menu. Never hover-only. The **Add card**
is the grid's last card, the same size as the others, dashed, `+ Add` *thing*.
Grids auto-fill: 3 columns on a laptop, 2 on a tablet, 1 on a phone.

**Lists and tables.** A row opens its detail with one press; extra actions at the
row's right end. Sortable headers show ▲ / ▼ after a space and set `aria-sort`;
blanks sort last. A table wider than the screen scrolls inside its own box with
a visible scroll bar; the page never scrolls sideways. Spreadsheet-style grids
save as you type.

**Archive and restore — the one pattern.**
1. The control: the archive-box icon on the card or row, **Archive** in the ⋮
   menu, or a destructive **Archive** button in the opened view.
2. Confirmation in the shared dialog: "Archive *name*?", one sentence saying
   where it can be restored from, **Cancel** and **Archive**.
3. After archiving the item leaves the list and a toast says "*Name* archived."
4. Archived things live behind one **Archived (N)** button — the archive icon,
   then the words — that opens a **pop-over** listing them. Hidden when N is 0;
   shown only to people allowed to restore; placed with the list's own tools, or
   under the grid. ⛔ Never an inline archived list that grows the page.
5. The pop-over always stays fully inside the visible window (it moves sideways
   and opens upward where the room is), a long list scrolls inside it, and Esc or
   a press outside closes it. One shared fit does this for every Archived (N).
6. Each archived row: the item's full name, wrapped, on the left; a secondary
   **Restore** button on the right. Restore needs no confirmation and toasts
   "*Name* restored."
7. A dialog never promises a restore the screen cannot offer.

**Delete permanently.** Only for what is truly destroyed. Trash can or **Delete
permanently** in the ⋮ menu, confirmed with "This cannot be undone." and a filled
red button; keyboard focus starts on Cancel.

**Confirmations.** One shared dialog for every confirmation. **No native
`confirm()`, `alert()` or `prompt()`** — they cannot be styled and break the
person's place on a phone; naming or typing a link uses a small dialog with a
labelled field. Ask only when the act loses something or is hard to reverse;
never confirm Restore, Save or Cancel. Title: a question naming the act and the
thing. Buttons: **Cancel**, then the act's verb, right-aligned.

**Dialogs.** Small pop-ups for one short task; a task with many fields or a long
list is its own page. One dialog shell for every page: title left, × right,
labelled fields, footer right-aligned with **Cancel** then the primary act (a
read-only dialog has one **Close**). ×, Cancel, Esc and the backdrop close it,
except while saving or with unsaved typing. Closing returns focus to the button
that opened it. Size `width: min(<cap>px, 94vw)`, `max-height: 88vh`, never a
fixed pixel width. Esc closes only the top dialog.

**Pages and Back.** A detail view is its own page. Exactly one Back control per
page, ← at the top-left (never ‹), returning to the same list, filters and
scroll position; the phone's back gesture does the same. Tabs and segmented
choices use one segmented control with tab roles, the selected one filled.

**Forms.** Labels above their field, always visible; a placeholder is only an
example (a search box is the one exception, with an `aria-label`). Required: a
red `*` after the label and "* required" once per form; a missing field is named
beside it on Save, not only in a toast. Locked fields: greyed, not focusable, 🔒
after the label, one sentence saying who can change them. A form or dialog has
**Save** and **Cancel** and stores nothing until Save; a spreadsheet grid saves
each cell; a switch takes effect when switched.

**Upload — one control everywhere a file is added.** A bordered box with the
upload icon, "Drag a file here, or", a visible **Choose file** button, and one
line naming the allowed types and size limit ("PDF only, up to 10 MB"). Drag and
drop works on the whole box; the button opens the device picker. Types are
declared in `accept` and checked by contents where it matters. After choosing,
the file's name (a thumbnail for a photo) shows with a × to remove it. While
uploading the box shows **Uploading…** and cannot be pressed again; long uploads
show progress. Refusals are red text under the box naming the file and why,
never only a toast. Small places (a composer, a table row) use the 📎 **Attach**
button with the same rules. In a card grid the upload box is the **Add card**
(the grid's last card); pressing it or dropping a file on it opens a small
dialog.

**Status pills and colours.** A status is words in a fully rounded pill, never
colour alone, one meaning per colour: green = good, done, approved, paid;
amber = waiting or needs attention soon; red = problem, refused, failed,
overdue; grey = not started, inactive, archived; blue = information, the brand,
selection. Kinds of things (a type, a shift) are tags in neutral colours, never
status colours.

**Empty states.** One component, centred where the list would be: "No *things*
yet." then what to do; when the viewer can add one, the empty state carries the
**+ Add** button itself. "Nothing matches" and "you cannot see this" read
differently from "nothing exists".

**Search, filter, sort.** Toolbar left to right: search box, filters, and the
primary **+ Add** at the right end. Search is `type="search"` with a magnifying
glass, "Search *things*…" and an `aria-label`, filtering as you type. A **Clear
filters** link appears when any filter is on.

**Loading and messages.** "Loading…" (or a grey placeholder) where content will
appear, never a blank area; a full-screen spinner only for acts that must not be
interrupted. Success: a short toast in the past tense naming the thing. Errors:
shown next to what failed with `role="alert"`, staying until the person acts,
saying what happened and what to do next, never a code and never a control the
product does not have. Warnings go in the confirmation before the act.
Announcements and banners are full-width bars at the top of the content, in
flow, never floating over controls.

## Establishing your project's look
At kickoff, run **`/design-intake`** (`/kickoff` calls it). By default it applies
the company look above; for a project with a brand of its own it turns a starting
point into new token values, keeping the object standards:
1. **Import a look:** an image or screenshot (default, read by the
   `frontend-design` skill), Stitch HTML via Stitch's remote MCP, or Figma
   variables via a Figma MCP (owner ruling, 2026-10-12).
2. **Distill** it into the contract below plus one approved **reference page**.
3. **Build** the remaining pages against that contract, so every page matches
   page one.

Generator setup: `docs/guides/design-tooling.md`. `frontend-design` and Stitch
are current practice, not a ruling; propose another generator to the owner if
it fits better.

## Tokens & components (the consistency contract)
Two committed files are the single source of truth for a project's look:
- **`styles/tokens.css`**: brand primitives as CSS custom properties
  (`--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--shadow-*`). Every rule
  uses `var(--…)`, never a hardcoded value.
- **`styles/components.css`**: reusable elements (button, card, input,
  checkbox, header), built once and used on every page.

Every generator is told to **use this project's `tokens.css` and
`components.css`**, never to invent a parallel system. Starter versions carrying
the company look ship in `templates/styles/` for `/new-repo`.

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
