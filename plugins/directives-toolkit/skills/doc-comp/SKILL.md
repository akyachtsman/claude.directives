---
name: doc-comp
description: "Use whenever asked to compare, diff, redline, or say what changed between two documents, contracts, agreements, versions, drafts or revisions — whether they are files or pasted inline. Produces a side-by-side HTML diff with margin notes on substantive changes."
phase: cross-cutting
---
When asked to compare two documents, produce a self-contained HTML file with a
line-by-line side-by-side comparison, then **publish it with the `Artifact`
tool** and hand the user the returned URL. (Load the `artifact-design` skill
before writing it, and `artifact-capabilities` if the page needs any runtime
behaviour.) Do NOT promise a "downloadable file" and a local path: in a
web/remote session a path is not a link, and the viewer sandbox blocks
page-initiated downloads — the Artifact URL is the deliverable.

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
