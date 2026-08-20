---
description: "Spec-driven build loop with the inherited directives as the constitution."
argument-hint: "[specify|plan|implement|status] [feature-slug]"
phase: plan
benefits-from: [kickoff, diagnose]
---
Run a Spec-Driven Development (SDD) loop: refine a feature through ordered
phases, each emitting a Markdown artifact that feeds the next. Core principle
(from `github/spec-kit`, MIT): **separate WHAT from HOW, and refine in phases —
never one-shot.** We port the methodology, not the CLI (spec-kit needs
uv/Python and won't run browser-only).

Invoked as `/sdd-loop <phase> [feature-slug]`. **Stepwise by design** — run ONE
phase per invocation so the human supplies intent between phases (the feature
idea at `specify`, stack decisions at `plan`). Never auto-run all phases; that
defeats the methodology. With no phase, print `status` (below).

## Where artifacts live
One directory per feature, committed in the project repo:
```
specs/<feature-slug>/
  brief.md      ← written by /diagnose (Think), when run — `specify` reads it first
  spec.md       ← specify (WHAT & WHY, plus the clarifications it resolved)
  plan.md       ← plan (HOW: stack, architecture, task list, consistency check)
  research.md   ← written by /kickoff (competitive discovery), when run
  design.md     ← written by /design-intake (visual identity record), when run
```
Derive `<feature-slug>` (kebab-case) from the feature name if omitted. Each
phase first **reads the prior artifact** and refuses if it's missing — order is
specify → plan → implement.

**Constitution: inherited, never regenerated.** spec-kit's first phase writes a
constitution of principles. We already have one — the directives imported via
`CLAUDE.md` (`global.md`, `git.md`, `design.md`, `data.md`, `test.md`). Every phase treats
those as binding: read them, cite the relevant rules, flag any violation. Do not
generate a fresh principles file.

## Phase 1 — specify  (`/sdd-loop specify <feature>`)
Read `specs/<slug>/brief.md` first if it exists — `/diagnose` writes it and hands
off here, so its problem statement and chosen approach are this phase's input.
Write `specs/<slug>/spec.md`: WHAT and WHY only — user stories, functional
requirements, success criteria, explicit non-goals. **No tech stack, no
"how".** Keep it testable: each requirement should map to something verifiable
later.

**Resolve the unknowns in the same pass — do not defer them to a later phase.**
Mark each open assumption, then interrogate the spec: collect those plus any
gaps, ambiguities and contradictions you find, ask the user, and append the
answers under `## Clarifications`. Planning may not start while an unresolved
item remains. (This absorbs what used to be a separate `clarify` phase —
writing a spec and closing its unknowns is one activity, and splitting it only
added a round trip.)

## Phase 2 — plan  (`/sdd-loop plan <feature>`)
Now HOW. Write `specs/<slug>/plan.md`: tech stack, architecture, data shapes,
key decisions and their trade-offs. Must honor the constitution — default to
the global directive's stack (plain HTML + JS, no frameworks/build) unless the
user explicitly chose otherwise here. Reference back to the spec's requirements;
do not introduce scope the spec didn't ask for.

**Build to the brief's ambition bar — don't reflexively minimize.** Honor the
brief's **Ambition & references** and the project's established look (its
`styles/tokens.css` + `styles/components.css` from `/design-intake`).
Phasing/MVP‑slicing is a *deliberate choice the user makes*, not the default —
when the brief asks for an elaborate, multi-section, polished experience, the plan
must deliver that (real pages/sections, hero/imagery patterns), not a stack of
plain cards. "Smallest slice" is for risk, not the finish line.

**End the plan with the task list.** An ordered, dependency-aware checklist
derived from the plan above it, under `## Tasks`. Number tasks and give **every
task an explicit `depends:` line** (task IDs it must wait for, or `none`) —
required for every task list, one item or more (`global.md` → Pipelined
Execution); tag parallel-safe tasks `[P]`. Size each task to roughly **2–5
minutes** — ideally failing test → implement → verify → commit. **Reject
placeholders** ("TBD", "similar to Task N", vague "handle errors"): every task
must name concrete files and changes. The tasks live in `plan.md` because they
are the plan made executable — a separate `tasks.md` only split one thought
across two files.

**Consistency check before you show it.** Confirm every requirement traces to a
task and every task to a requirement, and record contradictions, missing
coverage or over-engineering under `## Consistency`. **Delegate, don't
reinvent** — run the official `pr-review-toolkit` reviewers (or `/code-review`)
over spec + plan rather than hand-rolling a review.

**Plan self-review (one adaptive pass) — before showing it to the user.** After
drafting, launch a **fresh reviewer subagent** (Agent tool, clean context —
browser-only path, same model, no extra servers) to score the plan 0–10 on
completeness vs the spec, simplicity matched to the brief's ambition, **failure-mode
coverage**, and constitution-fit. Revise `plan.md` in place for anything under
~8, and require it to spell out the **data flow and main failure modes** before
it's ready. One consolidated pass — not separate CEO/design/eng personas.

**Show what you're approving — never gate on an unseen artifact.** When you pause
for the user here or at any approval point, **present the artifact in the chat**
(a tight summary of the key decisions + trade-offs, plus the file path) — not
just "approve `plan.md`?" The user can't sign off on a file they have to go find.

## Phase 3 — implement  (`/sdd-loop implement <feature>`)
**Look gate — establish the look before building out.** The project's look comes
from **`/design-intake`** (`styles/tokens.css` + `styles/components.css` + an
approved reference page). If it hasn't run yet for an ambitious build, run it
first. Build the remaining pages against that contract; for an elaborate brief,
**deploy 1–2 key screens to Pages (or attach a screenshot) and get the user's
sign-off on the *look*** before doing the rest — cheapest to fix on one screen.

Then execute the plan's `## Tasks` **pipelined, not step-serialized**
(`global.md` → Pipelined Execution): implement a task, launch its verification
in the background, and immediately start the next task whose `depends:` are
all satisfied — never idle-wait for a suite to finish before beginning
independent work. **Batch verification**: group completed independent tasks
and run the `directives-toolkit:qa-pipeline` agent (test-verifier → ui-tester
→ code review → pr-readiness) once over the batch rather than once per task.
A failure routes back as the priority — its downstream tasks pause, the rest
keep going. Loop until every task is done AND every verification round is
green; the completion bar is unchanged. Honor the Pre-Push gate
(`/commit-chk`) and PR lifecycle from the global directive. Check tasks off in
`plan.md` as they land.

**Polish pass before "done" (elaborate builds).** "Passes tests" is not the finish
line — the bar is the brief's ambition + reference targets. Before calling the
feature done, hold it to the project's established look and `design.md`'s universal
craft: consistent use of `styles/tokens.css`/`components.css`, strong visual
hierarchy, considered empty/loading/success states, accessibility (WCAG AA,
`:focus-visible`), and tasteful motion (`prefers-reduced-motion` honored) — judged
against the named references, not "does it function."

## status  (`/sdd-loop` with no phase)
List each `specs/*/` feature and which artifacts exist, to show where each
feature sits in the loop and what the next phase is.

## Notes
- Three phases, not six. `clarify` folded into `specify` (closing a spec's
  unknowns is part of writing it), and `tasks` + `analyze` folded into `plan`
  (the task list is the plan made executable, and the consistency check was
  already delegated). Each surviving phase is a genuine hand-off where the human
  supplies intent — which is the only thing a phase boundary is for.
- This command **owns** WHAT and HOW; it **delegates** review, test and PR
  machinery to the toolkit's agents and `qa-pipeline` rather than re-implementing
  them.
- Keep WHAT (spec) and HOW (plan) in separate artifacts — never let stack
  decisions leak into `spec.md`. This is the one split that carries the method;
  it is why the collapse stops at three.
