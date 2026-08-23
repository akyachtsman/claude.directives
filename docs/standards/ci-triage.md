# CI Triage

Triage for **project** CI in any repo using these agents. Three failure surfaces,
all detected by event-driven infra workflows — no session, no polling:

| Signal | Source | Surfaces as |
|---|---|---|
| A watched workflow failed | `workflow_run` → `ci-monitor.yml` | `ci-failure` tracking issue |
| Codex raised PR concerns | `pull_request_review` / `issue_comment` → `codex-monitor.yml` | `codex-flagged` PR label (auto-cleared on a SHA-matched all-clear) |
| Playwright failure | `qa.yml` / `qa-live.yml` | failing CI check on the PR |

GitHub automatically emails issue comments and label events, so the inbox is
notified without polling. A watching session is woken by the PR-comment webhook
(`ci-notify.yml`) on green and natively on failure — never poll (`git.md` →
*GitHub API Quota Economy*); a single catch-up read at session start is fine.

⚠️ **"Woken on green" is not universal, and the exceptions need a check-in, not
a poll.** `ci-notify` fires only on `conclusion == 'success'` and only for
workflows it watches by name, and its PR lookup can resolve to the wrong PR or to
none. A cancelled run, a dispatched run, and an ordinary success whose PR is
ambiguous can all end with no wake at all. `git.md` → *PR Lifecycle* carries the
list and the rule: **arm a check-in for any awaited outcome that can end without
emitting a wake, and drop it when THAT outcome is terminal.** That is not the
polling this line bans — polling is asking for something that would have arrived
anyway.

> This repo's own `ci-failure` issues come from its **directive-validation**
> checks (link / section / path); a downstream project's come from its build /
> Playwright suite. The triage steps below are the same either way — see
> `docs/internal/repo-monitors.md` for this repo's specifics.

## `ci-failure` issue is open

1. Read the issue body — each line names the failed workflow, branch, SHA, and run URL
2. Open the run URL and read the failing step's logs
3. Diagnose root cause before touching any code
4. If the failure is in an **internal link** or **required section** check → it's a
   repo defect; fix it and push
5. If the failure is in the **external links** job → it's a sibling repo or rate-limit
   issue; investigate the URL before suppressing (see `.github/scripts/check-links.js`
   and `.github/workflows/qa.yml` for the split-locality policy)
6. If the failure recurs 3+ times on the same issue with different fixes → escalate

## `codex-flagged` label on a PR

1. Open the PR and read Codex's inline comments
2. Address each suggestion or explicitly note why it's declined
3. Request a fresh Codex pass (`@codex review`). The monitor clears the label
   itself only when the all-clear arrives as a **comment** naming the current
   head — which does happen, and is the ordinary happy path. ⚠️ **But a clean rerun
   can instead arrive as a bare 👍 reaction**, which fires neither monitor trigger,
   leaving the label with nothing to remove it. Both forms were observed in
   `claude.directives` on 2026-08-23, so do not assume either: check the PR's
   comments first, and if the clear is reaction-only remove the label **by hand
   with a rationale**, and read the PR rather than reading the stuck label as
   unaddressed concerns. Never merge while the label is present, and clear the
   Codex gate itself per `git.md` → *PR Lifecycle* (a reaction is not a verdict
   you can attribute; that section carries the ladder).

## CI never registered on a PR

No run at all is a different failure from a red run — usually nothing in the
repo is broken. Follow the escalation ladder in `directives/git.md` → *PR
Lifecycle* (close→reopen → empty commit → fresh branch/PR → scope diagnosis).
The distinguishing test: if push-to-main runs fire while `pull_request` runs
don't, it's a GitHub event-delivery outage, not your workflow file — run the
gate manually via `qa.yml`'s `workflow_dispatch` on the PR's branch, and do
not edit workflows chasing a bug that isn't there.

## What not to do

- Do not close a `ci-failure` issue without fixing the underlying failure
- Do not remove `codex-flagged` without addressing the inline comments. Let the
  monitor clear it when it can — but it only sees a **commented** all-clear, and a
  clean rerun may instead be reaction-only, so manual removal with a rationale is
  a routine path rather than an exception
- Do not re-run a failed workflow repeatedly hoping it passes — diagnose first

---

## Project CI (Playwright)

### Two-tier CI architecture

Every project using these agents runs two Playwright workflows:
- `qa.yml` — static checks + Playwright against local server (runs on every PR/push)
- `qa-live.yml` — Playwright against live deployed URL (runs after deployment, authoritative gate)

### Expected outcomes — do not investigate

> Scenario **numbers are per-project** — projects renumber as their suite grows
> (check the project CLAUDE.md scenario table). Match rules by the scenario's
> **role**, never by its number alone.

- `UI Tests (local server)` **skips** in the auth scenario or interaction sweep
  (upstream kit: S2/S3) when no `TEST_AUTH_CREDENTIAL` is set
  → The kit self-skips these rather than failing; a skip is the exemption, and it
  is the ONLY one. `advisory-run` ships `'false'`, so the job is blocking: an
  actual red in those scenarios — a credential IS supplied and the backend is
  unreachable or returns `4xx`, printed as `API status: no call` / `API status:
  4xx` — is a real failure to fix, not an expected one to wave through.
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
