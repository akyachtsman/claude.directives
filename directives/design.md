# Design Standard

This is the exported design directive for all projects. Import it via:
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/design.md

**There is one house style, and it binds every project** (owner rulings,
2026-10-19). It was built and proven in the RSO project, and it replaces the
2026-10-16 ruling that each project owned its own look and patterns:
- *"RSO's style is the house style for all projects."*
- *"Use familiar, universal controls and icons; never invent a custom design.
  The same act gets the same word, icon, place and confirmation everywhere.
  A case the standard does not cover gets asked, then added to the standard."*

The standard groups every kind of thing a person sees or presses and gives each
group ONE way of working, taken from conventions people already know from the
apps they use every day (Gmail, Google Drive, iOS, Windows, Material, Apple's
Human Interface Guidelines). Every screen of every project follows it.

How to use it:
- **Building or changing a screen:** find the group below and do exactly what it
  says, with the shared component it names (→ *Tokens & components*). Never
  write a second one beside it.
- **A group does not fit what you are building:** do not invent a pattern. Ask
  the owner in product terms, record the answer as an owner ruling in the
  project's `CLAUDE.md`, and tell the owner it belongs here, so the next project
  gets it too. This file grows by those answers.
- **A project ruling and this file disagree:** the project's ruling wins in that
  project; say so to the owner so this file can be corrected or the ruling
  recorded here as an exception.
- **Known gaps:** a project that does not yet meet the standard lists where it
  breaks it in its own `DESIGN-GAPS.md` at the repo root, one line per screen
  and group, each with the file it lives in. That list is the project's, never
  this file's. A change that touches a listed screen brings it up to the
  standard, or says in the PR why not, and deletes the line it fixes.

## Establishing your project's look
Every project starts from the house look: `templates/styles/tokens.css` and
`templates/styles/components.css`, which `/new-repo` copies into `styles/`.
`/design-intake` (`/kickoff` calls it) adopts them, builds one approved
**reference page** from them, and the remaining pages are built against that
contract so every page matches page one.

**A project that already exists** moves to the house style by `/refresh-repo`,
never by a rewrite: it diffs the project's `styles/` against the house
templates and applies approved changes file by file. A palette the owner ruled
for that project keeps its values, while new token names arrive with the house
values. A screen that does not yet match goes into `DESIGN-GAPS.md` (below) and
is brought up to the standard by the next change that touches it.

A project changes its **palette or fonts** (tokens only) only by owner ruling,
for example a client's brand colour. `/design-intake` then imports that look
from an image or screenshot (default, read by the `frontend-design` skill),
Stitch HTML via Stitch's remote MCP, or Figma variables via a Figma MCP (owner
ruling, 2026-10-12). The components, words, icons and patterns below never
change with the palette. A project offering several themes (a per-customer
accent) keeps every theme's tokens complete and still follows every group.
Generator setup: `docs/guides/design-tooling.md`.

## Tokens & components (the consistency contract)
Two committed files are the single source of truth for a project's look:
- **`styles/tokens.css`**: brand primitives as CSS custom properties
  (`--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--shadow-*`). Every rule
  uses `var(--…)`, never a hardcoded value. A token means what its name says: a
  token named green is green.
  The house font is Inter where a project loads it; otherwise `--font-sans`
  falls back to the platform's own UI font, by design. The shared files load no
  outside font, because an outside request breaks offline use and sandboxed
  test runs.
- **`styles/components.css`**: the standard's components, built once and used
  on every page: the page base (canvas, text, font, headings, links), buttons
  (`.btn` plus `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-delete`),
  card with its opening title (`.card-open`) and corner actions, the Add card,
  a table that scrolls inside its own box,
  field and label, checkbox, status pill and tag, empty state, dialog shell,
  Archived (N) pop-over, upload box, inline message, toast, segmented control,
  section header.

A screen never adds its own button, card, pill or dialog class; a size or layout
need is a modifier on the shared one. Script behaviour that every page shares
(the confirmation dialog, the archived pop-over, the empty state, the inline
message, the icon set, the table comparator) lives in ONE shared script loaded
by every page, never copied into a page. Every generator is told to **use this
project's `tokens.css` and `components.css`**, never to invent a parallel
system.

## Stack
Plain HTML, CSS and vanilla JS on GitHub Pages, no build by default. This is set
by `global.md` → *Hosting & Deployment* (owner ruling, 2026-08-21; build rule
2026-10-06), which owns it. Tokens and components are plain CSS; a utility
library such as Tailwind needs the CI-build opt-in, and replacing `tokens.css`
and `components.css` with one is a further owner decision.

## 1. Principles
1. **Familiar over clever.** Use the control and icon a person already
   recognises (a paperclip to attach, a trash can to delete, an up-arrow cloud
   and a **Choose file** button to upload). Never invent a new look for a known
   job.
2. **One job, one look, everywhere.** The same act has the same word, icon,
   place and confirmation on every screen.
3. **Simple, elegant, calm.** Cards show the essentials; details live in the
   opened view.
4. **Safe by default.** Nothing irreversible happens on one press. Reversible
   acts can always be undone from where the person expects to find them.
5. **Never lose the person.** After any button in a window finishes or is
   cancelled, the person is back in that same window. Back returns to where they
   were, scroll position included.
6. **Never hide information the owner relied on**, and **never truncate a
   label**: wrap it.
7. **Say what happened, in plain words** (section 18).

## 2. Words: one verb per act
| Act | Say | Never say for this act |
|---|---|---|
| Put something away, recoverably | **Archive** | Remove, Delete, Deactivate, Retire, Hide, ✕ |
| Bring an archived thing back | **Restore** | Unarchive, Reactivate, Activate, Undo |
| Destroy for good (rare) | **Delete permanently** | Remove, Archive |
| A one-way archive (only by owner ruling) | **Permanently archive** | Archive, Retire, Delete |
| Take an assignment off (access, a group member, an attachment not yet saved); nothing is lost | **Remove** | Delete, Archive |
| Create a new thing | **Add** *thing* (`+ Add item`) | New, Create, ＋ alone; **Create** only where the product already names the act so |
| Keep the changes in a form | **Save** | OK, Done, Apply, Submit |
| Leave a dialog without changing anything | **Cancel** | Close (when changes are discarded), No |
| Leave a read-only dialog | **Close** | Cancel, OK |
| Withdraw an invitation | **Revoke invite** | Delete, Cancel |

- Button labels are a verb plus the thing when it helps: **Save**, **Send
  invitation**, **Archive document**.
- Busy labels are the same verb in -ing form with one "…" character:
  **Saving…**, **Uploading…**, **Archiving…**.
- The product's own nouns come from the project's `CLAUDE.md`. A translated
  screen sends every word above through the project's dictionary.

## 3. Icons: one icon per act
Action icons come from **one line-icon set** (Lucide shapes), drawn by one shared
icon helper. When an act needs an icon the set lacks, add that Lucide shape to
the set rather than drawing one inline. Emoji are allowed as decoration and in
content, never as an action's icon.

| Act | Icon | Notes |
|---|---|---|
| Add | `+` followed by a word (`+ Add row`) | plain ASCII plus; never `＋` alone |
| Edit / rename | pencil | |
| Archive | archive box | never ✕, ×, a cabinet or a parcel |
| Restore | text button **Restore** | |
| Delete permanently | trash can | only where the act really destroys |
| Close a dialog / remove a chip or an unsaved attachment | × | top-right of a dialog; right of a chip |
| More actions | ⋮ (vertical ellipsis) | opens a menu; use when a card or row has 3+ actions |
| Upload | cloud or tray with an up arrow, beside a **Choose file** button | section 13 |
| Attach (small composer) | paperclip | |
| Photo | camera, with the word **Photo** | |
| Download | down arrow into a tray | |
| Search | magnifying glass inside the field | |
| Lock: "you cannot change this" | padlock | that meaning only; a permission note ("Only a manager can see …") is words |
| Favourite | star, outline / filled | |
| Reorder by dragging | ⋮⋮ grip | |
| Sort direction | ▲ ascending / ▼ descending | |
| Back | ← | section 11 |

**Every icon-only button has both `aria-label` and `title`** naming the act and
the thing ("Archive Walk-in fridge").

## 4. Buttons
Three kinds, and only three:

| Kind | Look | Use |
|---|---|---|
| **Primary** (`.btn-primary`) | filled accent, on-accent text | the one main act of the view or dialog: at most ONE per view and ONE per dialog |
| **Secondary** (`.btn` / `.btn-secondary`) | surface with a grey border | every other act, including Cancel |
| **Destructive** (`.btn-danger`) | red text and red border | archive, revoke, delete |

The filled red **`.btn-delete`** is only the final button of a Delete
permanently or Permanently archive confirmation.
- Placement: at the end of the row the act applies to, right-aligned in
  toolbars, dialog footers and forms.
- Size: at least 44×44 px (→ *Cross-platform & responsive*). Full-width only on
  a phone-width sign-in form.
- **While working:** the button is disabled and shows its busy label until the
  answer arrives; on error it comes back enabled with its label.
- A button this person can never press is not shown at all; a disabled button
  that will become pressable says why on hover and press (`title`).

## 5. Cards and grids
- **The whole card opens it:** one press anywhere on the card. A card with no
  actions of its own may itself be the `<button>`. A card WITH actions is a
  plain container: its title is the opening `<button>` (or link), stretched over
  the card with a `::after` overlay, and the action buttons sit above that
  overlay. Never put a button inside a button, and never let an action's press
  also open the card.
- **A card shows the essentials only:** its name, one line of context (type,
  person, date) and its status pill. Everything else is in the opened view.
- **Card actions** (besides opening): at most two icon buttons in the
  **top-right corner**, in this fixed order from left to right: **Edit**, then
  **Archive**. With three or more actions, one ⋮ menu in that corner instead.
  Never actions above the card, never hover-only (they must show on a phone).
- **The Add card**, when a grid offers adding, is the LAST card: dashed border,
  `+` and **Add** *thing*.
- Grids take 3 columns on a laptop (1200px and wider), 2 on a tablet, 1 on a phone
  (below 700px). `.grid` sets exactly these.
- **Names wrap; they are never cut with "…"** or a line clamp. A picture preview
  inside a card may be clipped; its name may not.
- Things of one kind (every document, every form) use ONE card design across the
  project.

## 6. Lists and tables
- A row opens its detail page through its name: the name cell holds the
  opening link (or button), which keyboard users reach with Tab. A press
  elsewhere on the row may open it too, but extra actions sit at the row's
  right end (a ⋮ menu when more than one), and an action's press never opens
  the row. Never give the `<tr>` itself a button or link role.
- **Sortable columns:** press the header; it shows " ▲" or " ▼" after a space and
  carries `aria-sort`. One shared comparator sorts every table, blanks last.
- **A table wider than the screen scrolls inside its own box** with a visible
  scroll bar; the page itself never scrolls sideways.
- The header row stays visible when the table scrolls vertically.
- An editable grid (a spreadsheet-style table) saves as you type (section 12).

## 7. Archive and restore: the one pattern
Every screen uses this for anything a person can put away and get back.
1. **The control:** the archive-box icon button on the card or row (section 5),
   **Archive** in the ⋮ menu, or a destructive **Archive** button inside the
   opened view. Never ✕ or × (those mean *close*).
2. **Confirmation:** the shared confirmation dialog (section 9). Title "Archive
   *name*?", one sentence saying where it can be restored from, buttons
   **Cancel** and **Archive**.
3. **After archiving:** the item leaves the list and a toast says "*Name*
   archived." Cancel or a press on the backdrop returns to the window the person
   was in.
4. **Where archived things live:** an **Archived (N)** button (the archive
   icon, then the words) that opens a pop-over listing what is archived, so the
   list never pushes the page down as it grows. Hidden when N is 0; shown only to
   people allowed to restore. It sits with the list's own tools, or under the
   grid where the list has none. One shared renderer draws every Archived (N);
   a screen never builds its own markup for it.
   **The pop-over always stays inside the visible window:** never under a
   sidebar, never past a card's edge. It moves sideways and opens upward where
   the room is, and a long list scrolls inside it. Esc or a press outside closes
   it. One shared fit does this for every Archived (N) on every page.
5. **Each archived row:** the item's full name, wrapped and never cut (with when
   and by whom it was archived, if useful), on the left; a secondary
   **Restore** button on the right. Restore needs no confirmation: it puts the
   item back and toasts "*Name* restored."
6. **Nothing that says "can be restored" may be unrestorable.** A screen with no
   Archived (N) button must not promise recovery in its dialog.
7. **Reasons:** archiving does not ask for a reason, unless the owner rules one
   is needed for a specific record.
8. **Exceptions are owner rulings, not choices:** a one-way **Permanently
   archive** has no restore and says so before it happens; a thing held by
   someone else shows the padlock instead of the archive icon.
9. **People** (staff, members) follow the same pattern: the menu says
   **Archive** and the archived people are in **Archived (N)**, not behind a
   "Show archived" switch.

## 8. Delete permanently
- Only for things that are truly destroyed and cannot come back.
- Trash-can icon, or **Delete permanently** in the ⋮ menu.
- Always confirmed in the shared dialog with the words "This cannot be undone."
  and a filled red **Delete permanently** button. Default focus is on Cancel.

## 9. Confirmations
- **One dialog for every confirmation**, the shared confirmation dialog loaded
  by every page and never copied into one. It answers in three forms: yes / no;
  typed text, or nothing on Cancel; and a notice with one **Close** button.
  Disable the control that asked while the question is open, and re-check
  anything that may have changed once the answer comes back.
- **No native `confirm()`, `alert()` or `prompt()` anywhere:** they look
  different on every browser, cannot be styled, and break the person's place on
  a phone. A project may enforce this with a guard in CI.
- Ask only when the act loses something or is hard to reverse (archive, delete,
  revoke, send to everyone, lock down). Never confirm Restore, Save or Cancel.
- The title is a question naming the act and the thing: "Archive Walk-in
  fridge?". The body is one or two sentences: what happens, and how to undo it
  (or that it cannot be undone).
- Buttons: **Cancel** (secondary), then the act's verb (destructive or primary),
  right-aligned.
- Renaming, naming and typing a link use a small dialog with a labelled field,
  never `prompt()`.

## 10. Pop-ups (dialogs)
- **Small pop-ups over big forms:** a dialog is for one short task (confirm,
  rename, set a date, add an attachment). A task with many fields or a long list
  is its own page (section 11).
- **One dialog shell for every page** (`.dialog` in `components.css`).
- **Header:** the title on the left, × on the right (`aria-label="Close"`).
- **Body:** labelled fields (section 12); it scrolls inside the dialog when tall.
- **Footer:** right-aligned, **Cancel** (secondary) on the left and the primary
  act on the right. A read-only dialog has one **Close** button.
- **Closing:** ×, Cancel, Esc and a press on the dark backdrop all close it,
  unless it is busy saving or holds unsaved typing; then Esc and the backdrop
  do nothing.
- **Returning:** closing puts the person back in the window that opened it, with
  keyboard focus on the button that opened it.
- **Size:** `width: min(<cap>px, 94vw)` and `max-height: 88vh`, never a fixed
  pixel width.
- **Stacking:** one dialog at a time where possible; a dialog opened from another
  sits above it, and Esc closes only the top one. Stacking comes from one shared
  scale of layers, not per-dialog z-index values.

## 11. Pages, detail views and Back
- **A detail view is its own page** (a person, a document, a report, a
  conversation).
- **Exactly one Back control per page:** ← at the top-left (in the top bar, or
  "← *Parent name*" at the top-left of the content). Always ←, never ‹, and
  never a second Back inside the content.
- **Back returns to the exact place the person left:** the same list, the same
  filters, the same scroll position. The phone's own back gesture does the same
  (history entries).
- Tabs and segmented choices (Draw / Type, Live / Archived) use one segmented
  control with `role="tablist"` / `role="tab"` / `aria-selected`, the selected
  one filled.

## 12. Forms and fields
- **Labels sit above their field and are always visible.** A placeholder is only
  an example ("e.g. Walk-in fridge"), never the label. Search boxes are the one
  exception: the magnifying glass and the placeholder "Search *things*…" are the
  label, plus an `aria-label`.
- **Required fields:** a red `*` after the label, and "* required" once per
  form. Missing required fields are named next to the field when Save is
  pressed, not only in a toast.
- **Locked fields** (the person may not change them): greyed, not focusable, a
  padlock after the label, and one sentence on the form saying who can change
  them.
- **Read-only values** that were never editable are plain text, not greyed
  inputs, and the two are never mixed on one form.
- **Saving:**
  - A **form or dialog** has an explicit **Save** (primary) and **Cancel**;
    nothing is stored until Save.
  - A **spreadsheet-style grid** saves each cell as you type or leave it, like
    Google Sheets, and shows a brief "Saved" or the error beside it. It has no
    Save button.
  - A **switch** (an on/off setting) takes effect when switched and needs no
    Save.

## 13. Upload
One upload control, everywhere a person adds a file:
1. **The box:** a bordered area with the upload icon at the top, the words "Drag
   a file here, or", a visible secondary **Choose file** button, and one small
   line naming the allowed types and the size limit ("PDF only, up to 10 MB").
2. **Drag and drop** works on the whole box, which highlights while a file is
   over it; the button opens the device's file picker (camera and photos on a
   phone).
3. **Accepted types are declared** on the input (`accept`) **and** checked by
   contents where it matters (a PDF is read as a PDF, not trusted by its name).
4. **After choosing:** the file's name (and a thumbnail for a photo) appears in
   the box with a × to remove it before saving.
5. **While uploading:** the box and its button show **Uploading…** and cannot be
   pressed again; a long upload shows a progress bar.
6. **Refusals** appear as red text directly under the box, naming the file and
   why ("menu.docx is not a PDF. Save it as a PDF first."). Never only a toast.
7. **Small places** (a message composer, one table row) use the paperclip
   **Attach** button instead of the box; photo posts use the camera with the
   word **Photo**. The same refusal and progress rules apply.
8. **Limits:** 10 MB per file unless a ruling or the storage says otherwise; the
   control states the limit it enforces.

## 14. Status pills and colours
A status is always **words in a pill**, never colour alone. One meaning per
colour across the whole product, each from its own token pair in `tokens.css`:

| Colour | Means | Examples |
|---|---|---|
| **Green** (`--color-success`) | good, done, approved, active, paid | Verified, Signed, Paid |
| **Amber** (`--color-warning`) | waiting, needs attention soon | Awaiting approval, Expiring soon, Due |
| **Red** (`--color-danger`) | problem, refused, failed, overdue | Rejected, Payment failed, Action needed |
| **Grey** (`--color-neutral`) | not started, inactive, archived | Not uploaded, Draft, Archived |
| **Blue** (`--color-info`) | information, neutral selection | Info, the active tab |
| **Purple** (`--color-expired`) | **Expired** only | Expired |

- Kinds of things (a post type, a shift, a tier) are **tags**, not statuses:
  neutral or their own tag colours, never the status colours above.
- Pills are fully rounded, 11–12 px, sentence case. At that size each pill's
  text needs 4.5:1 on its own background (→ *Accessibility*).

## 15. Empty states
- One shared empty-state component (`.empty-state`), centred in the area the
  list would fill, with a small variant inside a card or table cell.
- One sentence in the form **"No *things* yet."**, then one sentence on what to
  do.
- **When the viewer can add one, the empty state carries the Add button
  itself** (`+ Add thing`), not a sentence pointing at a button elsewhere.
- Tell apart **nothing exists**, **nothing matches** ("No items match your
  search." with **Clear search**) and **you cannot see this** ("Only a manager
  can see …").
- An icon is optional; when used, it is the screen's own icon from the icon set.

## 16. Search, filter and sort
- Toolbar order, left to right: **search box**, filters, and at the right end the
  primary **+ Add** *thing*.
- The search box is `type="search"`, with the magnifying glass, the placeholder
  "Search *things*…" and an `aria-label`, and it filters as you type.
- Filters: dropdowns with a visible label, or chips for a small fixed set; a
  **Clear filters** link while any is on.
- Tables sort by their header (section 6); a card grid that sorts uses a "Sort
  by" dropdown.

## 17. Loading and busy
- **Loading a list or page:** "Loading…" (or a grey placeholder shape) where the
  content will appear, never a blank area.
- **A button's act:** the button disables and shows its busy label until it
  finishes.
- **A full-screen spinner** only for acts that must not be interrupted (signing
  in, reading a long document). Uploads use the upload box's own progress.
- A wait longer than about 10 s says what it is doing ("Reading the invoice…").

## 18. Messages: success, errors, warnings
- **Success:** a short toast, past tense, naming the thing ("Document saved."),
  that disappears by itself and is announced politely.
- **Errors:** shown **next to what failed** (under the field, under the upload
  box, in the dialog), in red with `role="alert"`, and they stay until the person
  acts. A toast alone is not enough for an error; a toast that does carry one is
  red, stays longer the longer it is, and is announced.
- **Error wording:** what happened, then what to do next, in plain words. Never
  a code, and never a control the product does not have. "That file is larger
  than 10 MB. Choose a smaller file."
- **Warnings before an act** go in the confirmation dialog (section 9), never
  after it.
- **Announcements and banners** (a new version, maintenance, a lockdown) are
  full-width bars at the top of the content, in the flow, never floating over
  controls.
- One shared helper writes a message next to what it is about; a screen never
  writes its own.

## 19. Undo
- A product-wide undo, where a project has one, covers the person's last quick
  act (posting, ticking a task, adding an entry).
- Archive is undone by **Restore** from **Archived (N)** (section 7), not by
  undo.

## Script loading
**Inline scripts run after their DOM.** An inline `<script>` that binds event
listeners goes at the very end of `<body>`, or wraps its bindings in a
`DOMContentLoaded` handler (with a `document.readyState` fast-path). Binding to
a not-yet-parsed element throws and silently kills every handler after it,
while the page still looks rendered. (`test.md`'s console-error gate catches
this.)

## Cross-platform & responsive
Every UI works on desktop, tablet and phone. Design responsive-first:
- **Fluid layout:** content reflows from phone to desktop. Every screen fits a
  1440×900 laptop and works at phone width (390 px); the page itself never
  scrolls sideways.
- **Touch and pointer:** every action works by tap, click and keyboard. **No
  hover-only states or controls**; pair every `:hover` with a tap or focus
  equivalent.
- Targets: tap/click min **44×44px**; checkboxes min **24×24px**; min **8px**
  between adjacent targets.
- Inputs: min **48px** high; input font **never below 16px** (prevents iOS zoom
  on focus).

## Accessibility
Non-negotiable, whatever the palette:
- **WCAG AA contrast:** normal text ≥ 4.5:1, large text and icons ≥ 3.0:1. Large
  means ≥ 18.66px bold or ≥ 24px; anything smaller needs 4.5.
- Visible keyboard focus on everything pressable: pair `:hover` with
  `:focus-visible`.
- Honor `prefers-reduced-motion`.
- Status is never conveyed by colour alone.
- Use `textContent` for DOM text from any backend or user input, never
  `innerHTML` (per `global.md`).

The per-project contrast guardrail (`templates/scripts/check-contrast.js`, run in
CI against `styles/tokens.css`) is **a floor, not a coverage report**: it measures
a hand-written list of token pairs, so a token used in a different role passes
while rendering wrong. It does not measure the status-pill pairs of section 14;
check those by hand whenever a status token changes. Read its pair list against
your own token roles. A themed project gives **each theme its own complete
tokens file** and lists every one. Its limits and every file shape it refuses:
`docs/standards/contrast-guardrail.md`.

## Motion
Short, calm transitions (≈0.15s ease). No bounce, spin, flash or heavy
keyframes. Always honor `prefers-reduced-motion`.

## Charts & data display (owner ruling, 2026-09-24)
Use the native **`dataviz`** skill (built in, nothing to install) for chart type,
palettes, legends, axes and tooltips. Swap its placeholder palette for this
project's `--color-*` tokens, keeping section 14's colour meanings. The
accessibility rules above apply to series colours and legends too.

## Diagrams & connectors (owner ruling, 2026-09-24)
For any node-and-edge surface, **every connector stays individually traceable to
exactly one source→target pair**, at any zoom. The native `artifact-diagramming`
skill owns the rest (when a diagram earns its place, routing, legibility in both
themes); read it before drawing one. Verify from the edge geometry, not by eye:
no two edges from different sources overlap collinearly, and no edge crosses a
node.
