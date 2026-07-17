---
description: "Write a delta-only handoff for a fresh session — only what no other repo file already captures"
phase: reflect
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
**Always deliver it as one self-contained, fenced block the user can paste
verbatim into the new session** — never prose scattered around the reply. The
block leads with **Unresolved** (pending issues, open concerns, decisions still
in the air — the things only this session's memory holds); if there is truly
nothing pending, it contains a 2–3 line summary of where the repo stands
instead. An empty or missing hand-over block is never an acceptable output of
this command.

**The block uses this exact visual format** — same header, same dividers, same
framing, in every repo (drop a section entirely rather than leaving it empty;
UNRESOLVED — or the nothing-pending summary in its place — always comes first):

```text
════════════════════ SESSION HANDOFF — <repo-name> ════════════════════
CLAUDE.md is the source of truth — read it first. This file holds only
what the repo doesn't capture.

── UNRESOLVED ─────────────────────────────────────────────────────────
1. SHORT CAPS TITLE (tracker ref + state, e.g. "PR #62, draft, CI
   pending") — one-line stance: what's contested/undecided and by whom.
   • Current observable state (what the live site / branch shows today).
   • The load-bearing facts or numbers the next session must not
     re-derive (measurements, thresholds, root cause).
2. NEXT ITEM …

── CONTEXT (in no file) ───────────────────────────────────────────────
• Out-of-band facts: cross-repo coordination, vendored/generated files
  (don't hand-edit), scope limits — anything you were TOLD, not read.

── GOTCHAS ────────────────────────────────────────────────────────────
• Things a fresh session would re-learn the hard way.

── BRANCHES TO DELETE ─────────────────────────────────────────────────
none — remote is clean            (or the per-branch checklist from §3)
═══════════════════════════════════════════════════════════════════════
```

Framing rules for UNRESOLVED items — the part that makes a handoff usable:
- **Title states the dispute/decision, not the task** ("USER DISPUTES the
  centering fix", not "fix centering").
- **Separate what IS from what SHOULD BE**: one bullet for today's observable
  state, one for the constraint/physics that explains it.
- **Carry the numbers**: measurements, breakpoints, IDs — whatever the next
  session would otherwise burn a round-trip re-deriving.

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
