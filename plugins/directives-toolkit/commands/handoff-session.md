---
description: "Write a delta-only handoff for a fresh session."
phase: reflect
---
Produce a session handoff as a **paste-ready chat message** — never write a
handoff file (anything durable belongs in CLAUDE.md, not a sidecar that goes
stale the moment the repo changes).

## 0. The only test for including anything
The rule — the test, what fails it, and where everything else routes (durable →
a file, human-actionable → the reply, declined twice → decided) — is
`global.md` → *Handoffs Carry Only What Dies With the Session*, which applies whether or not this command is installed. What follows
is how this command applies it, to every line *before* writing it.

Not "is it useful", not "is it relevant", not "would it save time" — those let
everything through. **Almost nothing survives, and that is the intended
outcome:** a handoff of two lines is a good handoff; one of twenty is a session
that failed to apply the test.

Passes the test — said aloud, never written down:
- a question you asked the user that they have **not answered yet**
- something the user said in chat that **contradicts or overrides** a file
- an approach **already tried and abandoned**, where the repo shows no trace of
  the attempt, so the next session would repeat it
- a commitment made to **another session or repo** that nothing here records
- a constraint you were **told**, not read (access limits, vendor quirks, "don't
  touch X")

If nothing passes, say exactly that in one line and stop.

**Hard cap: 5 items, ~15 lines inside the block.** If more seem to qualify, the
test is being applied too loosely — re-apply it and keep the ones that would
actually cost the next session a wrong turn.

## 1. Settle the working state first
A handoff over a messy tree is worthless:
- Commit and push everything; `git status` clean, nothing unpushed.
- Drive every open PR to a terminal state — merged, closed, or reported blocked
  with its reason (`git.md` → *PR Lifecycle*), nothing dangling.
- Branch hygiene — **verify against the remote, never assert from local state**:
  `git ls-remote --heads origin` (local `git branch` says nothing about merged
  refs still on the remote). Unmerged work on a branch is yours to finish: push
  it and drive its PR to a terminal state. A merged branch that is still there is
  **not** yours to delete: a session's push scope covers its designated branch
  only, so branch-delete pushes are refused, and `git.md` → *Repo-settings preflight*
  says not to try. With **Settings → General → "Automatically delete head
  branches"** enabled (the standard), merged branches self-delete; where it is
  off, the deliverable is that preflight's one warning with the settings path.

## 2. Write the handoff
**Deliver it as one self-contained, fenced block the user can paste verbatim
into the new session** — never prose scattered around the reply.

**The block uses this exact visual format** — same header, same dividers, same
framing, in every repo. UNRESOLVED (decisions still in the air, questions the
user has not answered, positions taken but not recorded) comes first; an empty
section is dropped rather than left blank. Nothing pending means the one-line
block from §0 with no sections at all — never a status summary, which the repo
states better than a paraphrase can. No header restates a standing instruction:
the receiving session reads CLAUDE.md and the directives at Session Start.

```text
════════════════════ SESSION HANDOFF — <repo-name> ════════════════════

── UNRESOLVED ─────────────────────────────────────────────────────────
1. SHORT CAPS TITLE (tracker ref + state, e.g. "PR #62, draft, CI
   pending") — one-line stance: what's contested/undecided and by whom.
   • The state that is actually IN DISPUTE — not a status report; the
     next session can look. Only what it would misread without you.
   • The load-bearing facts or numbers the next session must not
     re-derive (measurements, thresholds, root cause).
2. NEXT ITEM …

── CONTEXT (in no file) ───────────────────────────────────────────────
• Only what you were TOLD and never wrote down: cross-repo commitments,
  scope limits, access constraints. If it can be read anywhere, cut it.

═══════════════════════════════════════════════════════════════════════
```

Framing rules for UNRESOLVED items — the part that makes a handoff usable:
- **Title states the dispute/decision, not the task** ("USER DISPUTES the
  centering fix", not "fix centering").
- **Separate what IS from what SHOULD BE**: one bullet for the state *in
  dispute* — the reading the next session would get wrong on its own — one for
  the constraint that explains it. Neither is a status report: if the next
  session can simply look and see it, cut the bullet.
- **Carry the numbers**: measurements, breakpoints, IDs — whatever the next
  session would otherwise burn a round-trip re-deriving.
- **A claim about an UPSTREAM file names the SHA it was verified at**, re-resolved from the upstream tip as the item is written: `global.md` → *One Session, One Repo*.

Self-check every line against §0. If it's already in CLAUDE.md, the README, a
workflow file, **a PR body, a commit message, an issue thread, the diff**, or an
imported directive (`global.md`, `git.md`, `test.md`, `design.md`, `data.md`),
drop it — or move it THERE and drop it. Restating a merged PR's reasoning is the
single most common way this command bloats. Never paraphrase a directive rule,
in an item or a header: the receiving session treats the paraphrase as
authoritative and skips the live text (observed 2026-07-22, a stale paraphrase
of `git.md`'s merge-authorization rule mis-applied until the source was read). A
decision about a directive's *application* to this repo goes in CLAUDE.md.

## 3. Leave the remote clean (hard exit gate)
Re-run `git ls-remote --heads origin 'refs/heads/claude/*'` as the last act
before handing off. A branch carrying unmerged work is **this** session's to
finish, not a line item for the next one: the block never carries a "branches to
delete" list.

A merged branch that is still there is a request for the **human, now**, since
a session cannot delete it (§1). Put it in the chat reply, outside the block,
with the reliable removal path: *its merged PR → "Delete branch"*, or the repo's
**`/branches/all`** page (the plain Branches overview often omits merged
branches; don't send them there), plus the auto-delete setting if it is off.
Never defer it into the handoff: the next session cannot action it either, so
it would just be copied forward until someone happens to read it.

The message still ends with the status line (`global.md` → *Status Line on Every Stop*).
