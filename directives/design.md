# UI Design System

This is the exported design directive for all projects. Import it via:
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/design.md

The complete design directive for all projects. Import this one file and follow
it exactly — there is nothing to choose. Every rule below applies; use the parts
your screens need and ignore the rest.

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

## Color Palette
```
--color-bg:             #F5F5F3
--color-surface:        #FFFFFF
--color-border:         #E2E0DB
--color-border-hover:   #C8C5BE
--color-text-primary:   #1A1A1A
--color-text-secondary: #6B6860
--color-accent:         #3D6B4F
--color-accent-hover:   #2F5540
--color-accent-light:   #EAF2ED
--color-danger:         #C0392B
--shadow-sm: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)
--shadow-md: 0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)
--shadow-lg: 0 10px 15px rgba(0,0,0,0.08), 0 4px 6px rgba(0,0,0,0.04)
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
box-shadow:   0 0 0 3px rgba(61,107,79,0.12)

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
  variables.css   ← all CSS vars from this file
  base.css        ← reset + typography
  components.css  ← buttons, cards, inputs, checkboxes
  forms.css       ← form layouts
  layout.css      ← page structure
