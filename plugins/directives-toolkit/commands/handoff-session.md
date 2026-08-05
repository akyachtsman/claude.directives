---
description: "Write a delta-only handoff for a fresh session."
phase: reflect
---
Produce a session handoff as a **paste-ready chat message** — never write a
handoff file (anything durable belongs in CLAUDE.md, not a sidecar that goes
stale the moment the repo changes).

## 0. The only test for including anything
The rule itself is `global.md` → *Handoffs Carry Only What Dies With the
Session*, which applies whether or not this command is installed. What follows
is how to apply it.

> **Would this be lost forever the moment this session ends?**

Not "is it useful", not "is it relevant", not "would it save time" — those let
everything through. Only what lives *solely* in this session's memory qualifies.
Apply it to every line before writing it, not as a pass afterwards.

**Almost nothing survives this test. That is the intended outcome.** A handoff of
two lines is a good handoff. A handoff of twenty is a session that failed to
apply the test.

Fails the test — the repo already holds it, and the next session reads the repo:
- what changed, and why → the diff, the commit messages, the PR body
- the current state of anything → the working tree, the live site, CI, `main`
- open PRs / issues / labels / branches → GitHub, which the next session queries
- any rule from CLAUDE.md or an imported directive → re-fetched at Session Start
- what was tried and shipped → the merged history

Passes the test — said aloud, never written down:
- a question you asked the user that they have **not answered yet**
- something the user said in chat that **contradicts or overrides** a file
- an approach **already tried and abandoned**, where the repo shows no trace of
  the attempt, so the next session would repeat it
- a commitment made to **another session or repo** that nothing here records
- a constraint you were **told**, not read (access limits, vendor quirks, "don't
  touch X")

Two traps that pass the literal test but are still wrong:

- **A dead end worth remembering is worth a FILE.** If an abandoned approach
  should outlive the next session, `/learn` it into `learnings.jsonl` or record
  the decision in CLAUDE.md — a handoff dies when the next session ends, so
  parking a durable decision there loses it one session later. If it is not
  worth a file, it is not worth the block either.
- **A concern the owner has declined to act on is not unresolved — it is
  decided.** Raised twice with no answer means no. Do not carry your own
  proposals forward as if they were open questions; a later session can raise
  them fresh from the repo if they still matter.

If nothing passes, say exactly that in one line and stop. "Nothing to hand off —
the repo holds everything" is a **correct and complete** output of this command.
Never pad to fill the format.

**Hard cap: 5 items, ~15 lines inside the block.** If more seem to qualify, the
test is being applied too loosely — re-apply it and keep the ones that would
actually cost the next session a wrong turn.

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
**Deliver it as one self-contained, fenced block the user can paste verbatim
into the new session** — never prose scattered around the reply. It leads with
**Unresolved**: decisions still in the air, questions the user has not answered,
positions taken but not recorded.

Do **not** substitute a status summary when nothing is pending — the repo states
its own status better than a paraphrase of it can. Nothing pending means a
one-line block saying so.

**The block uses this exact visual format** — same header, same dividers, same
framing, in every repo. When the block carries sections at all, UNRESOLVED comes
first, and an empty section is dropped rather than left blank — but a session
with nothing to hand off emits the one-line block from §0 with no sections
whatsoever, which is not an exception to be worked around but the expected
result. Nothing in the block restates a standing
instruction — the receiving session already reads CLAUDE.md and the directives
at Session Start, so a header saying so is a paraphrased directive rule and
belongs nowhere near a handoff:

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

Self-check every line against §0. If it's already in CLAUDE.md, the README, a
workflow file, **a PR body, a commit message, an issue thread, the diff**, or an
imported directive (`global.md`, `git.md`, `test.md`, `design.md`, `data.md`),
drop it — or move it THERE and drop it. A merged PR is not session memory: the
next session can read it, so restating its reasoning is the single most common
way this command bloats. Never paraphrase a directive rule into the handoff —
not in an item, and not in a header: the receiving session's own
Session Start already re-fetches the live directive text, and a paraphrase
can drift stale or lossy in the meantime — the receiving session then
treats the paraphrase as authoritative and skips the real fetch (observed
2026-07-22: a session worked off a stale handoff paraphrase of `git.md`'s
merge-authorization rule instead of reading the live file, and mis-applied
it until it read the source directly). If a directive's *application* to
this repo needs a decision record, that belongs in CLAUDE.md, not a
handoff.

## 3. Leave the remote clean (hard exit gate)
Re-run `git ls-remote --heads origin 'refs/heads/claude/*'` as the last act
before handing off. Every stray branch is **this** session's work to finish, not
a line item for the next one — the block never carries a "branches to delete"
list, because a branch that still exists means §1 was not completed.

If one genuinely cannot be removed (some proxied git remotes refuse branch
deletion outright), that is a request for the **human, now** — put it in the
chat reply, outside the block, with the reliable removal path: *its merged PR →
"Delete branch"*, or the repo's **`/branches/all`** page (the plain Branches
overview often omits merged branches; don't send them there). Never defer it
into the handoff: the next session cannot action it either, so it would just be
copied forward until someone happens to read it.

The same rule generalises — **anything only the human can do goes in the reply,
not the block.** The block addresses the next session; if the next session cannot
act on a line, it does not belong in it.
