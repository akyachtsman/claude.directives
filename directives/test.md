# Claude Test & QA Directives

This is the exportable directive for downstream projects. Import it into your project's `CLAUDE.md` or agent configuration.

## Key docs — index (read on demand)

Know this index; fetch a doc when working in its area. Do **not** bulk-read
everything at session start — that burns context on material the task may
never touch.

### docs/
- `docs/automations.md` — CI monitor workflow, PR lifecycle additions, escalation additions
- `docs/cicd-setup.md` — canonical CI/CD install procedure (workflow templates, monitors, secrets/variables)
- `docs/code-review-standard.md` — Blocking vs. non-blocking review criteria
- `docs/usage-guide.md` — Agent installation, review boundaries, and .agent-reports/ organization
- `docs/ci-triage.md` — Expected vs. real CI failures, workflow trigger rules

### QA/data agents — ship in the directives-toolkit plugin
Agents arrive via the `directives-toolkit` plugin (see global.md → Skill
Bootstrap; web environments install it in the setup script) and are namespaced
`directives-toolkit:*`. Nothing is fetched into `.claude/`; the full body loads
when an agent is invoked. Inventory (source:
`claude.directives/plugins/directives-toolkit/agents/`):
- `test-monitor` — thin in-session CI status helper (one-pass check, not the always-on monitor)
- `test-verifier` — independent QA verification agent
- `code-reviewer` — code quality review agent
- `security-reviewer` — security vulnerability review agent
- `pr-readiness-reviewer` — final merge gate agent
- `qa-pipeline` — full pipeline orchestrator
- `ui-tester` — Playwright browser testing agent
- `supabase` — data/backend specialist (per `data.md`)

### templates/ — fill-in artifacts
- `templates/CLAUDE-template.md` — project CLAUDE.md scaffold (used by `/new-repo`)
- `templates/implementation-summary-template.md` — required before invoking reviewers
- `templates/pr-checklist.md` — PR readiness checklist
- `templates/project-test-plan-template.md` — test plan structure
  (the test-verifier and code-reviewer report formats live inline in their agent
  definitions inside the plugin)

Workflow and Playwright-kit installation — which template goes where, and the
monitors — is `docs/cicd-setup.md`'s job; don't re-derive it from the tree.

## Session start — required actions

Execute these steps at the start of every session, before any task work:
1. Read `CLAUDE.md` for current project state (and any Project-Specific Test Scenarios)
2. Subscribe to PR activity on all open PRs via `subscribe_pr_activity`
3. Poll GitHub Actions API (`mcp__github__actions_list`) for any failures since the last session
4. Confirm `ci-monitor.yml`, `codex-monitor.yml`, and (for Pages projects) `pages-monitor.yml`
   are present in `.github/workflows/` — add any missing from `templates/workflows/`

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
Canonical stop-and-ask gates live in `global.md` → Escalation Rules; they apply
here unchanged (file deletion, workflow triggers, 3+ CI failures, multi-file
core logic).
