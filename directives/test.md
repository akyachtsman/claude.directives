# Claude Test & QA Directives

This is the exportable directive for downstream projects. Import it into your project's `CLAUDE.md` or agent configuration.

## Key docs — index (read on demand)

Know this index; fetch a doc when working in its area. Do **not** bulk-read
everything at session start — that burns context on material the task may
never touch.

### docs/
- `docs/standards/automations.md` — CI monitor workflow, PR lifecycle additions, escalation additions
- `docs/standards/cicd-setup.md` — canonical CI/CD install procedure (workflow templates, monitors, secrets/variables)
- `docs/standards/code-review-standard.md` — Blocking vs. non-blocking review criteria
- `docs/guides/usage-guide.md` — Agent installation, review boundaries, and .agent-reports/ organization
- `docs/standards/ci-triage.md` — Expected vs. real CI failures, workflow trigger rules

### QA/data agents — ship in the directives-toolkit plugin
Agents arrive via the `directives-toolkit` plugin (see global.md → Skill
Bootstrap; web environments install it in the setup script) and are namespaced
`directives-toolkit:*`. Nothing is fetched into `.claude/`; the full body loads
when an agent is invoked. Inventory (source:
`claude.directives/plugins/directives-toolkit/agents/`):
- `test-verifier` — independent QA verification agent (runs the suite, merge verdict)
- `pr-readiness-reviewer` — final merge gate agent
- `qa-pipeline` — full pipeline orchestrator
- `ui-tester` — Playwright browser testing agent
- `supabase` — data/backend specialist (per `data.md`)

Code review and security review are **not** toolkit agents anymore — they come
from Anthropic-official sources (enabled in each project's `.claude/settings.json`
and installed by the environment setup script):
- Code review → `pr-review-toolkit:code-reviewer` (official plugin; confidence-scored,
  CLAUDE.md-aware); deep test-coverage critique → `pr-review-toolkit:pr-test-analyzer`
- Security review → the built-in `/security-review` skill on demand, plus the
  official `security-guidance` plugin's automatic hooks (edit/turn/commit-time)
- Quick CI status checks are done inline via `mcp__github__actions_list` (the
  retired `test-monitor` agent's one-pass job; the always-on monitor remains
  `ci-monitor.yml`)

### templates/ — fill-in artifacts
- `templates/CLAUDE-template.md` — project CLAUDE.md scaffold (used by `/new-repo`)
- `templates/implementation-summary-template.md` — required before invoking reviewers
- `templates/pr-checklist.md` — PR readiness checklist
- `templates/project-test-plan-template.md` — test plan structure
  (the test-verifier report format lives inline in its agent definition inside
  the plugin; code/security review findings are written to `.agent-reports/` by
  the official reviewers per qa-pipeline's adapter instructions)

Workflow and Playwright-kit installation — which template goes where, and the
monitors — is `docs/standards/cicd-setup.md`'s job; don't re-derive it from the tree.

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

## Authenticated flows (auth-gated apps)
Local CI (`qa.yml`) runs Playwright against a local server that **cannot reach the
backend**, so auth-gated views (login, portal, drill-downs) are untestable there
and its `ui-tests` job is non-blocking by design. The **canonical mechanism for
testing authenticated flows is `qa-live.yml`**: it runs Playwright against the
deployed URL and logs in with a per-project seeded test account
(`TEST_AUTH_CREDENTIAL` secret + `APP_URL` variable). Its live step is blocking —
a failure there must be fixed before work is done.
- **Why live, not local:** agent sandboxes and CI runners are commonly firewalled
  from the live backend (e.g. a Supabase `403` at the proxy), so local Playwright
  cannot render authenticated views. Seed a test account and test against the
  deploy rather than relying on local runs.
- Any app with an auth gate must wire `qa-live.yml` + the seeded credential. An
  authenticated flow with no live coverage is a **coverage gap, not "untestable"** —
  and a UI change shipped without a `ui-tester` run is a readiness blocker (see the
  `pr-readiness-reviewer` gate).

## Required UI scenario patterns
`ui-tester` emits these generic scenarios by default (beyond S1–S4) for every app;
runnable source is the `NAV:`/`CTRL:` tests in `templates/ui-tests/tests/app.spec.js`:
- **Back-flow / no-loop** — for each drill-down hierarchy, go deepest, then press
  the in-app back control once per level and assert the path **strictly unwinds**:
  each back lands on the prior page and never revisits the page just left. Catches
  circular/ping-pong back navigation.
- **Single primary action** — assert each view exposes exactly one primary CTA of
  a kind (one "Add X"). Catches duplicate/ghost controls.

Any new client-side navigation or back affordance **requires a back-flow test**
(companions the origin-aware-back coding standard: a back control returns to the
page you came from, tracked via a nav stack — not the last page visited).

## CI triage
- `qa.yml` runs on push to `main` and on PRs targeting `main` (branch commits are
  covered by the PR trigger — listing `claude/**` under push would run everything twice)
- Static Checks must pass before merge; the local `UI Tests` job is
  `continue-on-error: true` (backend unreachable on runners) — `qa-live.yml` is the
  authoritative, blocking UI gate
- `qa-live.yml` failures against the live app must be fixed before marking work done
- **Quarantine, don't blanket-disable** — when a single UI spec is flaky, skip that
  one spec with a tracking note; never wrap the whole UI job in `continue-on-error`
  to get green, which silently drops all coverage
- Workflow YAML is validated on every CI run — keep it parseable

## Circuit breakers (autonomous fix loops)
When fixing failures without a human in the loop (the `qa-pipeline` ui-tester
loop, CI triage), stop before thrashing:
- **Cap attempts** — at most 3 fix attempts on the same failure, then escalate
  (the `global.md` 3-failures gate; `qa-pipeline` already enforces this for the
  ui-tester loop).
- **Watch the diff** — if a "fix" balloons or starts touching files unrelated to
  the failure, stop: that signals the diagnosis is wrong. Re-diagnose from the
  evidence rather than piling on more changes.
- **Re-verify each attempt fresh** (`global.md` → Evidence before assertions) —
  never assume the previous fix held.

## Escalation
Canonical stop-and-ask gates live in `global.md` → Escalation Rules; they apply
here unchanged (file deletion, workflow triggers, 3+ CI failures, multi-file
core logic).
