---
name: handoff.session
description: Write a delta-only handoff for a fresh session — only what no other repo file already captures
trigger: slash_command_and_auto
---
Write a session handoff that captures ONLY the delta — the things no other file in
the repo already records. It is NOT a project summary: CLAUDE.md, the README, and
the workflow files already cover that, and re-stating them just creates a second
file to keep in sync that goes stale the moment they change.

First, settle the working state — a handoff over a messy tree is worthless:
- Commit and push every change; confirm `git status` is clean and nothing is unpushed.
- Drive every open PR to a terminal state (merged or closed) — leave nothing dangling.
- Clean up branches: a session should end with **no stray `claude/<name>` branches**.
  Delete every merged/dead branch you can. For any the session **cannot** delete
  itself (tooling or permission limits, e.g. the host blocks ref deletion), list it
  in the handoff as an explicit **manual user action** — name the branch and where to
  remove it (GitHub → Branches) — so it is never silently left behind.

Lead the handoff with this pointer, verbatim:
> CLAUDE.md is the source of truth — read it first. This file holds only what the
> repo doesn't capture.

Include only:
- **Open loose ends with no other tracker** — pending manual steps that need a human
  or a UI action (incl. any leftover branch the session couldn't delete itself),
  credential/secret expiry dates, unbuilt backlog items; anything half-done that no
  PR or issue is already tracking.
- **Out-of-band context that lives in no file** — the cross-repo coordination model,
  which files are vendored or generated (don't hand-edit), scope limits; anything you
  had to be *told* rather than read.
- **Gotchas** a fresh session would otherwise re-learn the hard way — a non-obvious
  failure mode, an ordering constraint, a "looks broken but isn't."

Explicitly exclude anything already in CLAUDE.md, the README, or workflow files. If a
fact belongs in a repo file, put it THERE and leave it out of the handoff — the
handoff is the home only for facts that have no home.

Self-check before writing: for each line ask — is this already in a repo file? If
yes, drop it.
