# claude.test.directives — Agent Directive

This is the exportable directive for downstream projects. Import it into your project's `CLAUDE.md` or agent configuration.

## Key docs — read ALL of these before starting any task

### docs/
- `docs/automations.md` — CI monitor workflow, PR lifecycle rules, escalation rules
- `docs/cicd-directives.md` — qa.yml / qa-live.yml / qa-response.yml workflow templates
- `docs/upgrade-directives.md` — S2 diagnostic protocol, captureApiCalls(), Playwright config rules
- `docs/session-handoff.md` — Per-project handoff template
- `docs/agent-workflow.md` — 11-step builder → reviewer sequence
- `docs/monitor-agent.md` — RETIRED; explains why Gmail polling was replaced by ci-monitor.yml
- `docs/testing-standard.md` — What to validate, report format requirements
- `docs/code-review-standard.md` — Blocking vs. non-blocking review criteria
- `docs/usage-guide.md` — Agent installation and .agent-reports/ organization
- `docs/how-to-copy-into-project.md` — How to install agents locally into a project
- `docs/ci-triage.md` — Expected vs. real CI failures, workflow trigger rules

### .claude/agents/qa/ — read ALL agent definitions
Agents are organized into purpose-based subfolders (`qa/` and `data/` today;
`scrape/`, … as new types appear) and load recursively into sessions on this repo.
Downstream projects inherit them by fetching `.claude/agents/` fresh from
`claude.directives` each session (the Skill Bootstrap), gitignored and never
committed — there is no separate template copy.
- `.claude/agents/qa/test-monitor.md` — thin in-session CI status helper (one-pass check, not the always-on monitor)
- `.claude/agents/qa/test-verifier.md` — independent QA verification agent
- `.claude/agents/qa/code-reviewer.md` — code quality review agent
- `.claude/agents/qa/security-reviewer.md` — security vulnerability review agent
- `.claude/agents/qa/pr-readiness-reviewer.md` — final merge gate agent
- `.claude/agents/qa/qa-pipeline.md` — full pipeline orchestrator
- `.claude/agents/qa/ui-tester.md` — Playwright browser testing agent

### templates/ — reference when scaffolding a new project
- `templates/CLAUDE-template.md` — CLAUDE.md starter with all required sections
- `templates/CICD-SETUP.md` — 9-step CI/CD setup checklist
- `templates/implementation-summary-template.md` — required before invoking reviewers
- `templates/test-report-template.md` — test-verifier report format
- `templates/code-review-report-template.md` — code-reviewer report format
- `templates/pr-checklist.md` — PR readiness checklist
- `templates/project-test-plan-template.md` — test plan structure
- `templates/workflows/qa.yml` — copy to .github/workflows/
- `templates/workflows/qa-live.yml` — copy to .github/workflows/
- `templates/workflows/qa-response.yml` — copy to .github/workflows/
- `templates/workflows/ci-monitor.yml` — event-driven CI failure tracker (workflow_run + workflow_dispatch); copy to .github/workflows/ and confirm watched workflow name
- `templates/workflows/codex-monitor.yml` — Codex PR review monitor; drop-in, copy to .github/workflows/
- `templates/ui-tests/playwright.config.js` — copy to .github/scripts/ui-tests/
- `templates/ui-tests/tests/app.spec.js` — copy to .github/scripts/ui-tests/tests/
- `templates/ui-tests/package.json` — copy to .github/scripts/ui-tests/

## Session start — required actions

Execute these steps at the start of every session, before any task work:
1. Fetch and read every file listed under "Key docs" above
2. Read `docs/session-handoff.md` in the target project (`.claude/session-handoff.md`) for current project state
3. Subscribe to PR activity on all open PRs via `subscribe_pr_activity`
4. Poll GitHub Actions API (`mcp__github__actions_list`) for any failures since the last session
5. Confirm `ci-monitor.yml` is present in `.github/workflows/` — add it if missing (see `templates/workflows/ci-monitor.yml`)
6. Confirm `codex-monitor.yml` is present in `.github/workflows/` — add it if missing (see `templates/workflows/codex-monitor.yml`)

## Playwright
- Always use `page.goto('./')`, never `page.goto('/')`
- Normalize `APP_URL` to end with `/` in `playwright.config.js`
- `UI Tests (local server)` failures with `API status: no call` are expected and non-blocking in CI

## CI triage
- `qa.yml` runs on push to `main` and `claude/**` branches, and on PRs targeting `main`
- Static Checks must pass before merge; UI Tests are `continue-on-error: true`
- `qa-live.yml` failures against the live app must be fixed before marking work done
- Workflow YAML is validated on every CI run — keep it parseable

## Escalation
- Stop and ask before deleting any file that exists on `main`.
- Stop and ask before modifying any workflow file's trigger conditions.
- Stop and ask if CI has failed 3+ times on the same issue without progress.
- Stop and ask if a change touches more than one file's core logic.
