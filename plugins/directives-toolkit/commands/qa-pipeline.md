---
description: "Run the QA pipeline over a batch from the main session — test-verifier, ui-tester with a bounded fix loop, code + coverage review, security review, readiness gate."
argument-hint: "[PR number]"
phase: test
benefits-from: [sdd-loop]
---
Read `CLAUDE.md` first. Every project-specific value — URLs, IDs, paths,
workflow names — comes from there; hardcode none of them here. Secrets are the
exception: they come from the environment, never from a file in the repo.

Run the full QA pipeline over the current branch, in order. **This session is
the orchestrator**: it launches each step as a subagent and integrates the
results. It changes no code except a ui-tester fix in step 2, which it applies
itself between rounds; every report goes under `.agent-reports/`.

## Run it from the main session

Every step is an agent this session launches directly, one level down. That is
why this is a command and not an agent: a subagent that spawns its own steps
needs nesting, which a session's environment can turn off
(`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` disables it, and web sessions have
been measured running with that setting). If the `Agent` tool is missing here,
this command was loaded inside a subagent: stop, and report that the pipeline
must run from the main session. Never run the steps yourself in their place.

For every Agent call, choose `model` per `global.md` → *Subagent Model Selection*:
`sonnet` for test-verifier, the reviewers and pr-readiness-reviewer; leave it out
for ui-tester, whose diagnosis drives the fixes.

Pass each step the branch name, the changed-files list
(`git diff --name-only origin/main...HEAD`), the app URL, the existing
`.agent-reports/`, and the PR number (owner/repo/number) when one exists —
`pr-readiness-reviewer` cannot resolve a branch to a PR itself and reports Codex
as Pending without it. The PR number this command was given, if any: `$ARGUMENTS`.

## One writer: the pipeline's tree is pinned

⛔ **Nothing else writes this checkout while the pipeline runs.** Its reads, its
diffs and its suite all see the live tree, so a concurrent edit contaminates
every report at once — silently, and without moving HEAD (`global.md` →
*Parallel Tasking via Subagents*: never point a reader at a tree you are
editing). Work that continues meanwhile — `/sdd-loop`'s next independent
tasks — goes into an **isolated worktree**, and lands after the pipeline is
collected. The ui-tester fix in step 2 is not a concurrent writer: this session
applies it between rounds, when no step is reading.

## Steps

1. **test-verifier** — `directives-toolkit:test-verifier`: static checks — tests,
   lint, syntax, secrets scan. Wait for it; ui-tester runs after it.

2. **ui-tester, a bounded fix loop** — `directives-toolkit:ui-tester`, live browser
   testing against the deployed app. At most **3 rounds**; this session counts
   them, because a one-shot agent cannot.
   - **Each round:** launch ui-tester with `round: <N> of 3` and, from round 2,
     the previous round's `.agent-reports/ui-test-report.md` (the agent has no
     memory of the last run; the report is the record). Read its Feedback Loop
     result.
   - **Pass** → step 3.
   - **Escalate: yes**, or not fixable by an agent (production credentials,
     infrastructure, an ambiguous root cause) → stop the loop, record it for the
     human, and go on to step 3 to capture the full picture.
   - **Fail with a targeted fix** → read the diagnostic data first, never guess
     (for an S2 login failure, the auth-diagnostics attachment and ui-tester's
     diagnostic decision tree). Compare with the previous round: improvement or
     regression. Apply the minimum fix (file + line + exact change), run the
     Pre-Push gate (`/commit-chk`), commit, push, and confirm the deploy caught
     up before the next round — the deploy run's `head_sha` equals the commit
     that deploy publishes (for a deploy from `main`, the squash-merge commit,
     never the branch head: `update-pages` step 2), read from the Actions API,
     never a timed wait. Then start round N+1, skipping step 1: nothing it
     checks changed beyond the fix, which the Pre-Push gate covered.
   - **After round 3 without a pass** → escalate to the human with every
     round's findings, and go on to step 3 anyway.

3. **Code review + coverage** — launch both official `pr-review-toolkit` agents
   on the branch diff, in parallel, alongside step 4:
   - `pr-review-toolkit:code-reviewer` (confidence-scored, CLAUDE.md-aware) →
     `.agent-reports/code-review-report.md`. If the plugin is not attached, run
     the built-in `/code-review` skill on the branch's changes instead, same
     output path.
   - `pr-review-toolkit:pr-test-analyzer` — the deep test-coverage critique that
     test-verifier delegates here → `.agent-reports/test-coverage-report.md`.
     Skip only if the plugin is unattached (the built-in `/code-review` has no
     coverage-analysis equivalent).

4. **Security review** — when the changes meet a trigger below: run the
   built-in `/security-review` skill on the pending changes →
   `.agent-reports/security-review-report.md`. The `security-guidance`
   plugin's automatic hooks complement this at edit and commit time; they do
   not replace the on-demand pass.

5. **pr-readiness-reviewer** — `directives-toolkit:pr-readiness-reviewer`, after
   steps 3 and 4 are collected: the final gate — evidence complete, no blockers.

Continue past non-blocking issues to capture the full picture. An agent that
writes its own report at the path above needs no second copy. A ui-test report
whose *Occlusion & Transition Evidence* section is empty means Phase 6 did not
run: count it as a skipped phase, not a pass.

### Security review triggers

Run step 4 when the changes touch any of:
- Authentication, session, or credential handling
- API token usage, scoping, or storage
- HTML rendering of user-supplied or API-sourced strings (innerHTML risk)
- GitHub Actions secrets or environment variables
- External HTTP calls or third-party integrations
- Dependencies (package.json changes)
- Infrastructure, CORS, or hosting config

### CI while it runs

See `docs/standards/ci-triage.md` for expected vs. real failure classification
and workflow trigger rules. CI monitoring is infra-resident and event-driven,
not session-scoped: `ci-monitor.yml` fires on `workflow_run` events, and
`codex-monitor.yml` adds and clears `codex-flagged` from Codex's verdicts.
What the label does and does not prove is `git.md` → *PR Lifecycle*
— read the PR's comments AND its review threads. For a quick CI snapshot, call
`mcp__github__actions_list` once: report failures and the last success, then
move on. Session-start steps are in `directives/test.md` → "Session start —
required actions"; they are not repeated here.

## Report

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

## UI Tester Loop
| Round | Scenarios Passed | Failures | Fix Applied |
| --- | --- | --- | --- |
| 1 | X/Y | <list> | <fix or none> |

## Blocking Issues
- <list or `None`>

## Human Escalation Required
<Reason and full context, or `None`>

## Follow-ups
- <non-blocking items or `None`>

## Required Next Step
<open PR / fix blockers / human must intervene / wait for CI>
```
