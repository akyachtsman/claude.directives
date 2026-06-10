# CI Triage

This repo carries two CI concerns, merged here from the former
`claude.global.directives` and `claude.test.directives` triage docs:

1. **Directive self-test triage** — failures in *this* repo's own validation CI
   (link/section/path checks). See "Directive repo self-test" below.
2. **Project Playwright triage** — failures in *downstream project* CI
   (`qa.yml` / `qa-live.yml`). See "Project CI (Playwright)" below.

---

## Directive repo self-test

### Detection sources

Failures surface through two GitHub-event-driven monitors — no session or email
polling required:

| Signal | Source | Surfaces as |
|---|---|---|
| Validation workflow failed | `workflow_run` event → `ci-monitor.yml` | `ci-failure` tracking issue |
| Codex raised PR concerns | `pull_request_review` event → `codex-monitor.yml` | `codex-flagged` PR label |

### Triage rules

#### `ci-failure` issue is open
1. Read the issue body — each line names the failed workflow, branch, SHA, and run URL
2. Open the run URL and read the failing step's logs
3. Diagnose root cause before touching any code
4. If the failure is in an **internal link** or **required section** check → it's this
   repo's defect; fix it and push
5. If the failure is in the **external links** job → it's a sibling repo or rate-limit
   issue; investigate the URL before suppressing (see `.github/scripts/check-links.js`
   and `.github/workflows/qa.yml` for the split-locality policy)
6. If the failure recurs 3+ times on the same issue with different fixes → escalate

#### `codex-flagged` label on a PR
1. Open the PR and read Codex's inline comments
2. Address each suggestion or explicitly note why it's declined
3. Remove the label once resolved — do not merge while the label is present

### What not to do
- Do not close a `ci-failure` issue without fixing the underlying failure
- Do not remove `codex-flagged` without addressing the inline comments
- Do not re-run a failed workflow repeatedly hoping it passes — diagnose first

---

## Project CI (Playwright)

### Detection source

CI failures are detected by two event-driven infra workflows — no session, no polling:

- **`ci-monitor.yml`** — triggers on `workflow_run` (fires GitHub-side the instant a watched
  workflow finishes; `workflow_dispatch` for manual scans). Findings surface as a `ci-failure`
  GitHub tracking issue.
- **`codex-monitor.yml`** — triggers on `pull_request_review` by Codex bot. Findings surface
  as a `codex-flagged` label on the PR.

GitHub automatically emails both — issue comments and label events — so the inbox is
notified without any polling. For in-session fast feedback, poll via `mcp__github__actions_list`.

### Two-tier CI architecture

Every project using these agents runs two Playwright workflows:
- `qa.yml` — static checks + Playwright against local server (runs on every PR/push)
- `qa-live.yml` — Playwright against live deployed URL (runs after deployment, authoritative gate)

### Expected failures — do not investigate

> Scenario **numbers are per-project** — projects renumber as their suite grows
> (check the project CLAUDE.md scenario table). Match rules by the scenario's
> **role**, never by its number alone.

- `UI Tests (local server)` failures in the **auth scenario** or **interaction
  sweep** (upstream kit: S2/S3) — and any backend-dependent project scenarios —
  with `API status: no call` or `API status: 4xx`
  → Backend API is blocked on GitHub Actions runners — expected, non-blocking, `continue-on-error: true`
- Any sandbox-run Playwright failure with "Host not in allowlist"
  → Environment network policy blocks the live URL — not an app defect

### Real failures — must investigate

- **Page-load scenario** failure (upstream kit: S1) in local runner → app fails to load entirely, investigate immediately
- **Responsive-layout scenario** failure (upstream kit: S4) in local runner → layout-only, no backend dependency, should always pass
- Any failure in `qa-live.yml` → real failure against the live app, must fix before done

### Checking for a post-event workflow run

1. Compare the newest run's `created_at` against the triggering event timestamp
2. If nothing is newer → stop parsing, trigger manually
3. Never re-query the same cached tool result looking for a run that does not exist

### When to trigger qa-live.yml manually

- After a PR merges and the live app has not redeployed within ~2 minutes
- After any fix pushed directly to the main branch
- Any time live app behavior needs verification and auto-trigger cannot be waited on
