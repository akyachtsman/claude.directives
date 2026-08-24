---
name: qa-pipeline
description: Runs the QA pipeline in sequence — test-verifier, ui-tester, code review, security review, readiness gate — looping with ui-tester until it passes or escalates.
tools: Read, Glob, Grep, Bash, Agent, Skill
---

Read `CLAUDE.md` first. Every project-specific value — URLs, IDs, paths,
workflow names — comes from there; hardcode none of them here. Secrets are the
exception: they come from the environment, never from a file in the repo.

## QA Pipeline Orchestrator

Runs the full agent QA pipeline in sequence. Does not modify code or files directly — directs other agents to do so.

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

- Do not modify code or files
- Pass the branch name, changed files list, app URL, and existing `.agent-reports/` to each subagent
- Also pass the PR number (owner/repo/number) when one exists — `pr-readiness-reviewer`
  cannot resolve a branch to a PR itself and reports Codex as Pending without it
- Continue pipeline even if non-blocking issues emerge — capture full picture
- **Stop pipeline and report** if a blocking issue cannot be resolved after the ui-tester feedback loop
- Store all reports in `.agent-reports/`

### UI Tester Feedback Loop (Step 2)

The ui-tester runs interactively with the orchestrator until one of these terminal conditions is reached:

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
              Return the targeted fix to the calling session (file + line + exact change) —
              this orchestrator never edits files itself. Once the caller reports the fix
              pushed, confirm the deploy caught up (deploy run head_sha == the fix commit,
              via the Actions API — never a timed wait), then re-run ui-tester
            If other scenarios fail:
              Read the structured error message, return the targeted fix to the caller,
              re-run ui-tester after the same head_sha deploy check
            Do not guess at fixes — always read diagnostic data first
            If not fixable by agent → escalate to human immediately
Round 2+: Same as Round 1
          If same failure persists after Round 3 with no improvement → escalate to human;
          proceed to the code review step anyway to capture full pipeline output
Max rounds: 3 (then escalate regardless)
```

**What the orchestrator does between rounds:**
- Re-read the ui-test-report from `.agent-reports/ui-test-report.md`
- Compare with previous round to confirm improvement or regression
- Identify the minimum targeted fix
- Direct the fix with file + line + exact change in the pipeline summary message
  (the calling session applies it — see Operating Rules)
- Confirm the fix is pushed AND deployed (head_sha check) before invoking next round

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
- `codex-monitor.yml` fires on Codex PR reviews and Codex issue comments — it
  adds `codex-flagged` on concerns and clears it on a SHA-matched all-clear
  **comment**. A clean rerun can instead be a 👍 reaction or an inline
  review-thread reply, and the monitor watches neither, so a still-present label
  may mean nothing is wrong — read the PR's comments AND its review threads
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
