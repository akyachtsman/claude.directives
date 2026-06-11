---
description: "Write a delta-only handoff for a fresh session — only what no other repo file already captures"
---
Produce a session handoff as a **paste-ready chat message** — never write a
handoff file (anything durable belongs in CLAUDE.md, not a sidecar that goes
stale the moment the repo changes). Capture ONLY the delta: facts no repo file
records.

## 1. Settle the working state first
A handoff over a messy tree is worthless:
- Commit and push everything; `git status` clean, nothing unpushed.
- Drive every open PR to a terminal state — merged or closed, nothing dangling.
- Branch hygiene — **verify against the remote, never assert from local state**:
  `git ls-remote --heads origin` (local `git branch` says nothing about merged
  refs still on the remote). Delete every merged/dead branch you can.
  With **Settings → General → "Automatically delete head branches"** enabled
  (the standard — recommend enabling it wherever it's off), merged branches
  self-delete and this step is a no-op.

## 2. Write the handoff
Lead with this pointer, verbatim:
> CLAUDE.md is the source of truth — read it first. This file holds only what
> the repo doesn't capture.

Include only:
- **Loose ends with no tracker** — pending manual/UI steps, credential or
  secret expiry dates, half-done work no PR or issue records.
- **Out-of-band context that lives in no file** — cross-repo coordination,
  vendored/generated files (don't hand-edit), scope limits; anything you were
  *told* rather than read.
- **Gotchas** a fresh session would otherwise re-learn the hard way.

Self-check every line: if it's already in CLAUDE.md, the README, or a workflow
file, drop it — or move it THERE and drop it.

## 3. End with the branch checklist (hard exit gate)
Re-run `git ls-remote --heads origin 'refs/heads/claude/*'` and close the
message with a `Branches to delete` checklist: every stray branch the session
could not delete itself, each with the reliable removal path — *its merged PR →
"Delete branch"*, or the repo's **`/branches/all`** page (the plain Branches
overview often omits merged branches; don't send the human there). With
auto-delete enabled this should read: "Branches to delete: none — remote is
clean."
