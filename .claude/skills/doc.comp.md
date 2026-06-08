---
name: doc.comp
description: Compare two documents into a self-contained side-by-side HTML diff
trigger: slash_command_and_auto
---
When asked to compare two documents, produce a self-contained downloadable HTML
file with a line-by-line side-by-side comparison. Provide a link to the file
after creation.

Layout:
- Left column:  original / baseline document
- Right column: revised / new document
- Columns aligned by section heading, exhibit, schedule, notice, and signature block

Change markup:
- Deletions from original:  black text with strikethrough
- Additions in revised:     red underlined text
- Unchanged text:           default styling, no markup

Annotation rules:
- Add a brief margin note only when a change has legal or business significance
- Do not annotate stylistic or formatting-only changes
- Do not omit sections because numbering changed — compare by substance, not numbering

Uncertainty handling:
- If text extraction from either document is incomplete or ambiguous, state so
  explicitly at the top of the output before the comparison begins

Default assumption:
- First document provided = original / baseline
- Second document provided = revised / new
- Override only when context clearly indicates otherwise
