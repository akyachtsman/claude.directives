# Automations — Agent Session Standard

Automations run autonomously and only escalate to the human when a fix requires
judgement or production access beyond the session's scope.

---

## Automation 1 — GitHub Email Notifications (always on)

**Goal:** Deliver CI/CD failure emails without any setup beyond a one-time account preference.

**Implementation:** GitHub built-in — zero code, always on regardless of session state.

**Setup (one-time per GitHub account):**
`github.com` → avatar (top-right) → **Settings** → **Notifications**
→ scroll to **GitHub Actions** → enable **"Send notifications for failed workflows"**

Applies to all repos automatically.

---

## Automation 2 — CI Monitor Workflow (infra-resident, event-driven)

**Goal:** File a tracked GitHub issue the moment any watched CI workflow fails —
no session required, no polling, no Gmail.

**How it works:**
- **Trigger:** `workflow_run` (types: `completed`) — fires GitHub-side the instant a
  watched workflow finishes. No session, no commit-hook, no polling timer.
  Listing CI workflows by name prevents self-recursion.
- **Manual scan:** `workflow_dispatch` with a `lookback_minutes` input — for testing only.
- On failure: opens or updates a single deduplicated tracking issue (label `ci-failure`).
  GitHub automatically emails the issue notification.
- On no new failures: exits silently.
- Uses `GITHUB_TOKEN` only — no extra secrets.

**Template:** `templates/workflows/ci-monitor.yml`

**Drop-in:** ships pre-wired to watch both QA workflows that come with it
(`qa.yml` → `QA — Static + UI Tests`, `qa-live.yml` → `QA — UI Tests (live)`),
so copying them verbatim needs no edits. Only change `workflow_run.workflows`
if you rename those `name:` values or want it to watch extra workflows.
Optionally verify with a manual `workflow_dispatch` run.

**To install in a project:**
```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/ci-monitor.yml \
  -o .github/workflows/ci-monitor.yml
```

---

## Automation 3 — Codex Monitor Workflow (infra-resident, event-driven)

**Goal:** Flag Codex PR reviews that contain concerns so they aren't silently merged,
especially under auto-merge.

**How it works:**
- Trigger: `pull_request_review` by `chatgpt-codex-connector[bot]`
- Acts only on flagged reviews: `changes_requested` state, or a `commented` review
  with inline comments. Approving/empty reviews are skipped.
- On a flagged review: adds a `codex-flagged` label to the PR.
- Does not repost Codex suggestions — Codex already comments inline.
- Uses `GITHUB_TOKEN` only.

**Template:** `templates/workflows/codex-monitor.yml` — drop-in, no customization needed.

**To install:**
```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/codex-monitor.yml \
  -o .github/workflows/codex-monitor.yml
```

---

## Automation 4 — Pages Monitor Workflow (infra-resident, event-driven)

**Goal:** Catch a broken GitHub Pages deploy the moment it happens — build errored
or live URL not serving — with no session required.

**How it works:**
- Trigger: `page_build` — fires on every Pages build. `workflow_dispatch` allows a
  manual liveness re-check.
- Reads the build status from the event and verifies the live URL
  (`https://<owner>.github.io/<repo>/`) returns 200, with cache-busted retries.
- On a problem: opens/updates a single deduplicated `pages-deploy-failure` tracking
  issue. A healthy deploy closes it and reports green in the job summary only.
- The live URL is derived generically — the file is portable to any project as-is.
- Uses `GITHUB_TOKEN` only.

**Template:** `templates/workflows/pages-monitor.yml` — drop-in, no customization needed.

**To install:**
```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/pages-monitor.yml \
  -o .github/workflows/pages-monitor.yml
```

---

## Automation 5 — In-Session Reactive Subscription

When a Claude Code session is live, it subscribes to PR activity for fast feedback:
- Call `subscribe_pr_activity` on every open PR at session start
- A subscription is active until the PR is merged or closed
- Webhooks don't deliver CI success, new pushes, or merge-conflict transitions —
  so re-check PR state periodically and re-arm the subscription silently if nothing changed
- This is the fast-feedback layer; `ci-monitor.yml` is the always-on backbone

---

## Activation Checklist for New Sessions

- [ ] Confirm `ci-monitor.yml` is present and its `workflow_run.workflows` list is correct
- [ ] Confirm `codex-monitor.yml` is present
- [ ] Confirm `pages-monitor.yml` is present (any project with a GitHub Pages site)
- [ ] Check for any open `ci-failure` tracking issues before starting work
- [ ] Subscribe to PR activity: `subscribe_pr_activity` on any open PRs
- [ ] Read `CLAUDE.md` for full project context

---

## PR Lifecycle Rules

The canonical lifecycle (draft-first, subscribe on open, green-before-ready,
diff verification, no force-push to `main`) lives in `directives/global.md` →
PR Lifecycle. Additions for automated sessions:

### Superseded PRs
Post a comment on the **previous PR** pointing to the new one:

```
Handoff → PR #N
This PR is [merged/closed]. Follow-up work is in PR #N (`branch` → `main`). Please direct any further comments there.
Generated by [Claude Code](https://claude.ai/code)
```

### Merging
- Only merge when Static Checks pass; UI Tests (local server) failures are non-blocking (`continue-on-error: true`)
- Do not merge if a `codex-flagged` label is present — review Codex's inline comments first
- After merge, trigger `qa-live.yml` manually if Pages hasn't redeployed within ~2 minutes
- Unsubscription from the merged PR is automatic — no action needed

### CI triage
See `docs/ci-triage.md` for the full triage rules (expected vs real failures,
two-tier CI architecture, and when to trigger `qa-live.yml`).

---

## Escalation Rules

The canonical stop-and-ask gates (file deletion, workflow triggers, 3+ CI
failures, multi-file core logic) live in `directives/global.md` → Escalation
Rules. Additional automation triggers — ping the human when:
1. Fix requires a secret or credential not available in the session
2. Fix would require destructive data operations (delete records, drop fields)
3. Root cause is diagnostically ambiguous after reading all available logs
4. The notification is from a human, not an automated system

Keywords that always escalate: production data loss or deletion; authentication
or secret rotation; billing or quota alerts; any message from a human.

---

## Bootstrap Step — Identify Project-Specific Test Scenarios

Before writing any application code, identify which UI features or data behaviors
are not covered by the 4 generic Playwright scenarios (S1–S4) and document them
in CLAUDE.md under a new section. (S1–S4/S5+ is the upstream kit's numbering for
NEW projects; an existing project's CLAUDE.md scenario table is authoritative for
its own numbering — match scenarios by role, not number.)

```markdown
## Project-Specific Test Scenarios
| # | Feature | What to verify | Failure indicator |
|---|---|---|---|
| S5 | [feature name] | [what correct behavior looks like] | [what broken looks like] |
```

Rules for identifying gaps:
- Any feature that groups, filters, or transforms backend data before display
- Any feature where a silent fallback exists (e.g. "Other", empty state, default value)
  that would hide a broken data fetch
- Any feature where layout or structure depends on data shape (grids, sections, cards)
- Any multi-step interaction beyond a single task toggle

This table becomes the input to the ui-tester agent when adding S5+ scenarios
to app.spec.js. If the table is empty, the agent must explicitly confirm that
S1–S4 fully cover the app's critical paths before proceeding.
