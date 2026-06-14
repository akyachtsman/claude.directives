# UI Design System

This is the exported design directive for all projects. Import it via:
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/design.md

The complete design directive for all projects. Import this one file and follow
it exactly. Structure, type, spacing and components are fixed — nothing to choose
there. The one choice each project makes is its **color scheme**: pick one of the
ten in "Color Schemes" below (a one-time setup decision, changeable later). Use
the parts your screens need and ignore the rest.

**Visual reference:** every token and component below is rendered live at
https://akyachtsman.github.io/claude.directives/docs/design-system.html
(browse all demos at https://akyachtsman.github.io/claude.directives/docs/).

## Source of Truth
All generated HTML/CSS must follow these rules exactly. The values below are
authoritative. If a `screen_recording.webm` exists at the repo root AND `ffmpeg`
is available in the environment, measured values may optionally be refined using:
```
ffmpeg -i screen_recording.webm -vf fps=2 frames/frame%04d.png
```
Examine each frame and update with exact measured values. Otherwise treat the
values below as authoritative — do not attempt ffmpeg in remote/web sessions.

## Philosophy
Neutral, calm, professional. iPad-first, mouse-friendly desktop.
No loud colors. Generous whitespace. Every element feels solid and tappable.
Data is the hero — UI chrome stays out of the way.

## Color Schemes
Structure is fixed; **color is the only thing a scheme changes.** Eleven color
tokens are swappable; everything else (shadows, type, radius, spacing, component
shapes) is identical across all schemes.

**Choosing a scheme (downstream).** Set `data-theme` on the root element —
`<html data-theme="slate-blue">` — and every component re-colors automatically
(they all read the tokens). **There is no house default:** each project picks one
scheme at adoption (a one-time decision recorded in its `CLAUDE.md` as
`Design Theme: <id>`; `/new-repo` forces the pick) and may change it any time
afterward in its own environment. Until one is set, the neutral "unselected"
fallback below renders — greyscale accent, deliberately undecided.

Swappable tokens (per scheme): `--color-bg`, `--color-surface`, `--color-border`,
`--color-border-hover`, `--color-text-primary`, `--color-text-secondary`,
`--color-accent`, `--color-accent-hover`, `--color-accent-light`,
`--color-accent-ring`, `--color-danger`.

Theme-independent (identical for every scheme):
```
--shadow-sm: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)
--shadow-md: 0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)
--shadow-lg: 0 10px 15px rgba(0,0,0,0.08), 0 4px 6px rgba(0,0,0,0.04)
```

### Neutral fallback — `:root`, no scheme chosen
```
--color-bg:#F5F5F3; --color-surface:#FFFFFF; --color-border:#E2E0DB; --color-border-hover:#C8C5BE;
--color-text-primary:#1A1A1A; --color-text-secondary:#6B6860;
--color-accent:#656562; --color-accent-hover:#51514E; --color-accent-light:#EDEDEB; --color-accent-ring:rgba(101,101,98,0.13);
--color-danger:#C0392B;
```

### The ten schemes
Authoritative values — copy the chosen block into `styles/variables.css`. `danger`
is constant `#C0392B`; `--color-accent-ring` is the accent at ~13% alpha (focus
ring). Neutrals shift only by a faint temperature; the accent carries the identity.
All ten render live at the visual reference above.
```
/* Forest   */ [data-theme="forest"]     { --color-bg:#EEF4F0; --color-surface:#FFFFFF; --color-border:#DCE6E0; --color-border-hover:#C4D3CA; --color-text-primary:#19211C; --color-text-secondary:#5F6B63; --color-accent:#1F7A45; --color-accent-hover:#186337; --color-accent-light:#E6F2EB; --color-accent-ring:rgba(31,122,69,0.13); --color-danger:#C0392B; }
/* Blue     */ [data-theme="slate-blue"] { --color-bg:#EDF1F8; --color-surface:#FFFFFF; --color-border:#DAE2EE; --color-border-hover:#BFCBDF; --color-text-primary:#181B22; --color-text-secondary:#5F6573; --color-accent:#1565C0; --color-accent-hover:#114F98; --color-accent-light:#E5EEF8; --color-accent-ring:rgba(21,101,192,0.13); --color-danger:#C0392B; }
/* Teal     */ [data-theme="teal"]       { --color-bg:#EDF4F2; --color-surface:#FFFFFF; --color-border:#D8E5E1; --color-border-hover:#BFD2CC; --color-text-primary:#172320; --color-text-secondary:#5E6E69; --color-accent:#0D745C; --color-accent-hover:#0A5C49; --color-accent-light:#E2F1ED; --color-accent-ring:rgba(13,116,92,0.13); --color-danger:#C0392B; }
/* Indigo   */ [data-theme="indigo"]     { --color-bg:#F0EFF9; --color-surface:#FFFFFF; --color-border:#E0DEF0; --color-border-hover:#C8C4E0; --color-text-primary:#1B1A26; --color-text-secondary:#64627A; --color-accent:#4A3FB5; --color-accent-hover:#3B3291; --color-accent-light:#ECEAF8; --color-accent-ring:rgba(74,63,181,0.13); --color-danger:#C0392B; }
/* Magenta  */ [data-theme="plum"]       { --color-bg:#F8EEF4; --color-surface:#FFFFFF; --color-border:#EEDCE7; --color-border-hover:#DEC2D3; --color-text-primary:#241A20; --color-text-secondary:#6F6068; --color-accent:#A52A78; --color-accent-hover:#84215F; --color-accent-light:#F6E6F0; --color-accent-ring:rgba(165,42,120,0.13); --color-danger:#C0392B; }
/* Rust     */ [data-theme="terracotta"] { --color-bg:#F8F1EC; --color-surface:#FFFFFF; --color-border:#ECDFD6; --color-border-hover:#DCC8BB; --color-text-primary:#241B16; --color-text-secondary:#6F635A; --color-accent:#A94925; --color-accent-hover:#8E3D1F; --color-accent-light:#F8EAE2; --color-accent-ring:rgba(169,73,37,0.13); --color-danger:#C0392B; }
/* Charcoal */ [data-theme="charcoal"]   { --color-bg:#F3F3F2; --color-surface:#FFFFFF; --color-border:#E0E0DE; --color-border-hover:#C7C7C4; --color-text-primary:#1A1A1A; --color-text-secondary:#67676A; --color-accent:#36383B; --color-accent-hover:#27282B; --color-accent-light:#ECEDED; --color-accent-ring:rgba(54,56,59,0.13); --color-danger:#C0392B; }
/* Wine     */ [data-theme="burgundy"]   { --color-bg:#F8EFF0; --color-surface:#FFFFFF; --color-border:#EEDDDF; --color-border-hover:#DEC4C8; --color-text-primary:#241A1C; --color-text-secondary:#6F6063; --color-accent:#9B2D3F; --color-accent-hover:#7C2433; --color-accent-light:#F6E5E8; --color-accent-ring:rgba(155,45,63,0.13); --color-danger:#C0392B; }
/* Amber    */ [data-theme="bronze"]     { --color-bg:#F7F2E9; --color-surface:#FFFFFF; --color-border:#ECE3D2; --color-border-hover:#DCCFB6; --color-text-primary:#221E14; --color-text-secondary:#6B6453; --color-accent:#8A5A0F; --color-accent-hover:#6F4A0C; --color-accent-light:#F5ECDA; --color-accent-ring:rgba(138,90,15,0.13); --color-danger:#C0392B; }
/* Cyan     */ [data-theme="deep-cyan"]  { --color-bg:#ECF3F6; --color-surface:#FFFFFF; --color-border:#D8E5EB; --color-border-hover:#BED3DC; --color-text-primary:#162126; --color-text-secondary:#5E6A6F; --color-accent:#0E6E93; --color-accent-hover:#0B5775; --color-accent-light:#E2EFF4; --color-accent-ring:rgba(14,110,147,0.13); --color-danger:#C0392B; }
```

## Typography
font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif
--font-xs:   12px
--font-sm:   13px
--font-base: 15px
--font-lg:   17px
--font-xl:   20px
--font-2xl:  24px
weights: 400 regular, 500 medium, 600 bold only

## Border Radius
--radius-sm: 6px    (inputs, tags)
--radius-md: 10px   (buttons, chips)
--radius-lg: 14px   (cards, grouped sections)
--radius-xl: 20px   (modals, page containers)

## Buttons

### Primary (submit, confirm)
background:    var(--color-accent)
color:         #ffffff
border:        none
border-radius: var(--radius-md)
padding:       12px 24px
font-size:     var(--font-base)
font-weight:   500
box-shadow:    var(--shadow-sm)
transition:    all 0.15s ease

### Primary :hover — RAISE effect
background:    var(--color-accent-hover)
box-shadow:    var(--shadow-md)
transform:     translateY(-1px)

### Primary :active
transform:     translateY(0)
box-shadow:    var(--shadow-sm)

### Secondary (cancel, back)
background:    var(--color-surface)
color:         var(--color-text-primary)
border:        1px solid var(--color-border)
border-radius: var(--radius-md)
padding:       11px 22px
box-shadow:    var(--shadow-sm)
transition:    all 0.15s ease

### Secondary :hover — HIGHLIGHT effect
background:    var(--color-accent-light)
border-color:  var(--color-accent)
color:         var(--color-accent)
box-shadow:    var(--shadow-md)
transform:     translateY(-1px)

### iPad minimum tap target
min-height: 44px
min-width:  44px

## Cards & Grouped Sections
background:    var(--color-surface)
border:        1px solid var(--color-border)
border-radius: var(--radius-lg)
padding:       20px 24px
box-shadow:    var(--shadow-sm)
margin-bottom: 16px

### Card :hover (interactive cards only)
box-shadow:   var(--shadow-md)
border-color: var(--color-border-hover)
transition:   all 0.15s ease

## Checkboxes & Task Rows

### Checkbox unchecked
width:         24px
height:        24px
border:        2px solid var(--color-border)
border-radius: 6px
background:    var(--color-surface)
transition:    all 0.15s ease

### Checkbox :hover
border-color: var(--color-accent)
background:   var(--color-accent-light)

### Checkbox checked
background:   var(--color-accent)
border-color: var(--color-accent)
checkmark:    white SVG icon

### Task row :hover
background:    var(--color-accent-light)
border-radius: var(--radius-sm)
cursor:        pointer

## Form Inputs
background:    var(--color-surface)
border:        1px solid var(--color-border)
border-radius: var(--radius-sm)
padding:       10px 14px
font-size:     var(--font-base)
min-height:    48px  (iPad — prevents iOS auto-zoom)
transition:    border-color 0.15s ease

### Input :focus
border-color: var(--color-accent)
outline:      none
box-shadow:   0 0 0 3px var(--color-accent-ring)

## Section Headers
font-size:      var(--font-sm)
font-weight:    600
color:          var(--color-text-secondary)
text-transform: uppercase
letter-spacing: 0.06em
margin-bottom:  12px
padding-bottom: 8px
border-bottom:  1px solid var(--color-border)

## Spacing Scale
--space-1:  4px
--space-2:  8px
--space-3:  12px
--space-4:  16px
--space-5:  20px
--space-6:  24px
--space-8:  32px
--space-10: 40px

## Animation Rules
- All transitions: 0.15s ease
- Hover raise: translateY(-1px) + shadow upgrade
- Hover highlight: bg tint + border color shift
- Never use: bounce, spin, flash, heavy keyframes
- Pair :hover with :focus-visible for keyboard/iPad nav

## iPad Rules
- Tap targets: min 44x44px always
- Input fields: min 48px height (prevents iOS zoom on focus)
- Checkboxes: min 24x24px
- Font on inputs: never below 16px
- Gap between tappable elements: min 8px
- No hover-only states

## Layout Rules
- Group related fields inside a card always
- Section labels sit above cards, never inside
- Primary action: bottom-right desktop, full-width mobile/iPad
- Destructive actions: red only, never styled as primary
- Loading: opacity 0.6 + cursor not-allowed

## Editorial Preferences

### Tone & Voice
Professional but approachable. No jargon. Short sentences.
Prefer active voice. Avoid "please" and "simply".
Write for someone who is busy and competent — not a beginner, not a lawyer.

### UI Copy Rules
- Buttons: verb-first ("Save Changes", "Export Report", "Cancel" — not "Click to Save")
- Error messages: what happened + what to do ("No data found — try a wider date range")
- Empty states: explain why, then suggest next action ("No tasks yet — add one above")
- Section headers: noun phrases, no verbs ("Team Activity", not "View Team Activity")
- Tooltips: one sentence max, no period at end
- Confirmation dialogs: state the consequence, not the action ("This will permanently delete 3 tasks.")

### Number & Data Formatting
- Percentages: whole numbers only (53%, not 53.2%)
- Large numbers: K/M suffix above 999 (1.2K not 1,200 · 2.4M not 2,400,000)
- Dates: "Jun 4" format — not "06/04", not "June 4th", not "2026-06-04"
- Date ranges: "May 4 – Jun 4" (en-dash, spaces either side)
- Zero vs. no-data: "0" means measured zero · "—" means not measured / no data available
- Rates: always pair with context ("8% — last 7 days with data", not just "8%")

## File Structure
styles/
  variables.css   ← all CSS vars + the chosen [data-theme] scheme block (set data-theme on <html>)
  base.css        ← reset + typography
  components.css  ← buttons, cards, inputs, checkboxes
  forms.css       ← form layouts
  layout.css      ← page structure
