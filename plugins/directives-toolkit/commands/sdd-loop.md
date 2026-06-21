---
description: "Spec-Driven Development loop — stepwise specify → clarify → plan → tasks → analyze → implement, with the inherited directives as the constitution. Ports the github/spec-kit methodology (not the CLI)."
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
  spec.md       ← phase 1 (WHAT & WHY) + phase 2 clarifications appended
  plan.md       ← phase 3 (HOW: stack + architecture)
  tasks.md      ← phase 4 (ordered, dependency-aware; [P] = parallel-safe)
  analysis.md   ← phase 5 (consistency findings + optional cross-check)
```
Derive `<feature-slug>` (kebab-case) from the feature name if omitted. Each
phase first **reads the prior artifact** and refuses if it's missing — order is
specify → clarify → plan → tasks → analyze → implement.

## Phase 0 — constitution (INHERITED, never regenerated)
spec-kit's first phase writes a constitution of principles. **We already have
one:** the directives imported via `CLAUDE.md` (`global.md`, `design.md`,
`data.md`, `test.md`). Every phase below treats those as binding constraints —
read them, cite the relevant rules, and flag any spec/plan that violates one.
Do **not** generate a fresh principles file.

## Phase 1 — specify  (`/sdd-loop specify <feature>`)
Write `specs/<slug>/spec.md`: WHAT and WHY only — user stories, functional
requirements, success criteria, explicit non-goals. **No tech stack, no
"how".** Mark every open assumption `[NEEDS CLARIFICATION: …]`. Keep it
testable: each requirement should map to something verifiable later.

## Phase 2 — clarify  (`/sdd-loop clarify <feature>`)
Interrogate the spec **before** any planning. Collect every
`[NEEDS CLARIFICATION]` plus gaps/ambiguities/contradictions you find, ask the
user, and append the resolved answers to `spec.md` under a `## Clarifications`
section. Do not proceed to `plan` while unresolved items remain.

## Phase 3 — plan  (`/sdd-loop plan <feature>`)
Now HOW. Write `specs/<slug>/plan.md`: tech stack, architecture, data shapes,
key decisions and their trade-offs. Must honor the constitution — default to
the global directive's stack (plain HTML + JS, no frameworks/build) unless the
user explicitly chose otherwise here. Reference back to the spec's requirements;
do not introduce scope the spec didn't ask for.

**Build to the brief's ambition bar — don't reflexively minimize.** Honor the
brief's **Ambition & references** and design mode (`design.md`: utility vs
expressive). Phasing/MVP‑slicing is a *deliberate choice the user makes*, not the
default — when the brief asks for an elaborate, multi-section, polished experience,
the plan must deliver that (real pages/sections, the design mode's hero/imagery
patterns), not a stack of plain cards. "Smallest slice" is for risk, not the
finish line.

**Show what you're approving — never gate on an unseen artifact.** When you pause
for the user at `clarify`, `plan`, or any approval point, **present the artifact in
the chat** (a tight summary of the key decisions + trade-offs, plus the file path) —
not just "approve `plan.md`?" The user can't sign off on a file they have to go find.

## Phase 4 — tasks  (`/sdd-loop tasks <feature>`)
Write `specs/<slug>/tasks.md`: an ordered, dependency-aware checklist derived
from the plan. Number tasks, note dependencies, and tag parallel-safe tasks
`[P]`. Size each task to roughly **2–5 minutes** of work — ideally failing test
→ implement → verify → commit. **Self-review before finishing: reject
placeholders** ("TBD", "similar to Task N", vague "handle errors") — every task
must name concrete files and changes.

## Phase 5 — analyze  (`/sdd-loop analyze <feature>`)
Cross-artifact consistency check — **delegate, don't reinvent.** Spin up the
official `pr-review-toolkit` reviewers (or run `/code-review`) over
spec/plan/tasks to surface contradictions, missing coverage, and
over-engineering, and write findings to `specs/<slug>/analysis.md`. Confirm
every requirement traces to a task and every task to a requirement.

**Optional cross-check (Claude-native, not spec-kit) — OFF by default.** Only
when the user opts in (`/sdd-loop analyze <feature> --cross-check`): launch a
**fresh reviewer subagent** via the Agent tool to re-review the artifacts with
clean context and return structured notes. This is a fresh-context second
opinion using the same model — **not** a different vendor, and **not** an A2A /
multi-server agent relay (those need persistent servers, hostile to
browser-only). No API key, no terminal. Append its notes to `analysis.md` under
`## Cross-check`.

## Phase 6 — implement  (`/sdd-loop implement <feature>`)
**Expressive builds — visual mockup first (a look gate).** Before building out a full
expressive/elaborate app, implement just **1–2 key screens** (e.g. the landing + one
representative content/detail page) to **real Expressive-Mode quality** — hero, display
type, an inline-SVG illustration, a section band, motion — then **deploy to Pages (or
attach a screenshot) and get the user's sign-off on the *look*** before building the
rest. The look is cheapest to fix on one screen, not the whole app. (Utility-mode apps
skip this.)

Then execute `tasks.md` against `plan.md`, task by task — **delegate to the existing
pipeline, don't duplicate it.** Implement each task, then run the
`directives-toolkit:qa-pipeline` agent (test-verifier → ui-tester → code review
→ pr-readiness) to verify before moving on. Honor the Pre-Push gate
(`/commit-chk`) and PR lifecycle from the global directive. Check tasks off in
`tasks.md` as they land.

**Polish pass before "done" (expressive / elaborate builds).** "Passes tests" is
not the finish line — the bar is the brief's ambition + reference targets. Before
calling the feature done, meet `design.md`'s **Expressive Mode**: a real hero/landing,
strong visual hierarchy (display type scale), iconography/imagery, considered
empty/loading/success states, and tasteful motion (`prefers-reduced-motion` honored)
— judged against the named references, not "does it function." Utility-mode apps skip
this and stay calm by design.

## status  (`/sdd-loop` with no phase)
List each `specs/*/` feature and which artifacts exist, to show where each
feature sits in the loop and what the next phase is.

## Notes
- This command **owns** phases 1–4 (the planning chain spec-kit adds); it
  **delegates** 5–6 to the toolkit's review agents and `qa-pipeline` rather than
  re-implementing review/test/PR machinery.
- Keep WHAT (spec) and HOW (plan) in separate artifacts — never let stack
  decisions leak into `spec.md`.
