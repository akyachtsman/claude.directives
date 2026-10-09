---
name: qa-pipeline
description: Runs the QA pipeline in sequence — test-verifier, ui-tester, code review, security review, readiness gate — looping with ui-tester until it passes or escalates.
tools: Read, Glob, Grep, Bash, Write, Agent, Skill, mcp__github__actions_list
---

Read `CLAUDE.md` first. Every project-specific value — URLs, IDs, paths,
workflow names — comes from there; hardcode none of them here. Secrets are the
exception: they come from the environment, never from a file in the repo.

## QA Pipeline Orchestrator

Runs the full agent QA pipeline in sequence. It does not modify code: the only files it writes are the reports under `.agent-reports/`, and fixes are applied by the calling session (see the ui-tester loop below).

### Pipeline Steps (in order)

1. **test-verifier** — static checks: tests, lint, syntax, secrets scan
2. **ui-tester** — live browser testing against the deployed app; feedback loop until pass or escalation
3. **code review + coverage** — invoke two official `pr-review-toolkit` agents on
   the branch diff:
   - `pr-review-toolkit:code-reviewer` (confidence-scored, CLAUDE.md-aware) → write
     findings to `.agent-reports/code-review-report.md`. If the plugin is not
     attached, fall back to the built-in `/code-review` skill with the same output path.
   - `pr-review-toolkit:pr-test-analyzer` — the deep test-coverage critique that
     `test-verifier` delegates to the orchestrator (see test-verifier.md) → write
     findings to `.agent-reports/test-coverage-report.md`. Skip only if the plugin is
     unattached (the built-in `/code-review` has no coverage-analysis equivalent)
4. **security review** — conditional (see trigger conditions below): run the
   built-in `/security-review` skill on the pending changes and write findings to
   `.agent-reports/security-review-report.md` (the `security-guidance` plugin's
   automatic hooks complement this at edit/commit time but do not replace the
   on-demand pass)
5. **pr-readiness-reviewer** — final gate: evidence complete, no blockers

### Operating Rules

- **This agent spawns subagents, so it relies on nesting.** Claude Code lets a
  subagent spawn its own up to a depth limit — by default three layers below
  the main conversation (v2.1.219 and later; `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`
  changes it, and `1` turns nesting off), per code.claude.com/docs/en/sub-agents,
  *Let subagents spawn their own subagents* (read 2026-10-09). Invoked from the
  main session, this agent is layer one and its steps layer two. If `Agent` is
  missing from this agent's tools when it runs, nesting is off or exhausted: do
  not run the steps yourself in their place — stop and report to the caller that
  the pipeline must be driven from the main session, step by step
- Do not modify code or any file outside `.agent-reports/`. Write each step's
  report to the path named above; an invoked agent that writes its own report
  there needs no second copy
- Pass the branch name, changed files list, app URL, and existing
  `.agent-reports/` to each subagent
- ⛔ **Do not run this pipeline while another task is writing the tree.** Its
  reads, its diffs and its suite all see the live checkout, so a concurrent edit
  contaminates every report at once — silently, and without moving HEAD. Hold
  every OTHER writer until the pipeline is collected
- ⚠️ **The ui-tester loop is not a concurrent writer** — it is a handoff. The
  tester returns a targeted fix, the caller applies and pushes it, and only then
  does the tester rerun: the tree changes hands between rounds and is never
  written while a step is reading it. Treating that loop as a writer to be held
  would deadlock the pipeline against a fix it requires
- Choose `model` per subagent you start (`global.md` → *Subagent Model Selection*):
  `sonnet` for test-verifier, the reviewers and pr-readiness-reviewer; leave
  `model` out for ui-tester, whose loop produces the fixes, so it inherits
- Also pass the PR number (owner/repo/number) when one exists — `pr-readiness-reviewer`
  cannot resolve a branch to a PR itself and reports Codex as Pending without it
- Continue pipeline even if non-blocking issues emerge — capture full picture
- **Stop pipeline and report** if a blocking issue cannot be resolved after the ui-tester feedback loop
- Store all reports in `.agent-reports/`

### UI Tester Feedback Loop (Step 2)

The ui-tester loops with the orchestrator until one of these terminal conditions is reached.
**Each fix ENDS this run.** A subagent cannot be told mid-run that a fix landed:
it has no message channel, and its run is over once it returns. So a failing
round returns the fix plus where to resume, and the calling session, once the
fix is pushed, invokes this agent again with `resume: step 2, round <N+1>`.
On that input, skip step 1 (nothing it checks changed beyond the fix, which the
Pre-Push gate covers), run the deploy check below, then continue at ui-tester.

**Terminal: Pass** — all scenarios pass → proceed to step 3
**Terminal: Escalate** — escalation criteria met → stop pipeline, notify human with full findings

**Loop protocol:**

```
Round 1:  Invoke ui-tester → receive structured result
          If Pass → continue to step 3
          If Fail → analyze root cause from result
            If S2 (login) fails:
              Read the auth-diagnostics attachment and structured error message first
              Use the diagnostic decision tree in ui-tester.md to identify exact root cause
              End the run, returning the targeted fix (file + line + exact change) and
              `resume: step 2, round <N+1>` — this orchestrator never edits code itself.
              On the resumed run, first confirm the deploy caught up (deploy run head_sha
              == the commit that deploy publishes — for a deploy from `main`, the
              squash-merge commit, never the branch head (`update-pages` step 2) — via the
              Actions API, never a timed wait), then re-run ui-tester
            If other scenarios fail:
              Read the structured error message, end the run returning the targeted
              fix and the resume point; the resumed run does the same head_sha deploy
              check before re-running ui-tester
            Do not guess at fixes — always read diagnostic data first
            If not fixable by agent → escalate to human immediately
Round 2+: Same as Round 1, each in its own resumed run
          If same failure persists after Round 3 with no improvement → escalate to human;
          proceed to the code review step anyway to capture full pipeline output
Max rounds: 3 (then escalate regardless)
```

**What the orchestrator does on a resumed round:**
- Re-read the previous round's ui-test-report from `.agent-reports/ui-test-report.md`
  (the resumed run has no memory of the last one; the report is the record)
- Compare with previous round to confirm improvement or regression
- Identify the minimum targeted fix
- Direct the fix with file + line + exact change in the pipeline summary message
  (the calling session applies it — see Operating Rules)
- Confirm the fix is pushed AND deployed (head_sha check) before re-running ui-tester

### Security Review Trigger Conditions

Run the security review (step 4) if changes touch any of:
- Authentication, session, or credential handling
- API token usage, scoping, or storage
- HTML rendering of user-supplied or API-sourced strings (innerHTML risk)
- GitHub Actions secrets or environment variables
- External HTTP calls or third-party integrations
- Dependencies (package.json changes)
- Infrastructure, CORS, or hosting config

### Session Automations

See `docs/standards/ci-triage.md` for expected vs. real failure classification and workflow trigger rules.

CI monitoring is infra-resident and event-driven — not session-scoped:
- `ci-monitor.yml` fires on `workflow_run` events (+ `workflow_dispatch` for manual scans)
- `codex-monitor.yml` fires on Codex PR reviews and Codex issue comments and
  adds/clears `codex-flagged`; what the label does and does not prove is
  `git.md` → *PR Lifecycle* — read the PR's comments AND its review threads
For a quick in-session CI snapshot, call `mcp__github__actions_list` directly
(one pass — report failures and the last success, then move on).

#### Session Start Protocol

Follow the session-start steps in the test directive (`directives/test.md` →
"Session start — required actions"); they are not duplicated here.

### Required Output Format

```markdown
# QA Pipeline Summary

## Overall Status
Ready / Not Ready / Conditional / Escalated to Human

## Pipeline Results
| Step | Agent | Status | Key Findings |
| --- | --- | --- | --- |
| 1 | test-verifier | Pass/Fail/Conditional | <summary> |
| 2 | ui-tester | Pass/Fail/Escalated | <summary + rounds> |
| 3 | code review + coverage (pr-review-toolkit) | Pass/Fail/Conditional | <code-reviewer + pr-test-analyzer findings> |
| 4 | security review | Pass/Fail/Skipped | <summary> |
| 5 | pr-readiness-reviewer | Ready/Not Ready/Conditional | <summary> |

## UI Tester Loop Summary
| Round | Scenarios Passed | Failures | Fix Applied |
| --- | --- | --- | --- |
| 1 | X/Y | <list> | <fix or none> |
| 2 | X/Y | <list> | <fix or none> |

## Blocking Issues
- <list or `None`>

## Human Escalation Required
<Reason and full context, or `None`>

## Follow-ups
- <non-blocking items or `None`>

## Required Next Step
<open PR / fix blockers / human must intervene / wait for CI>
```
