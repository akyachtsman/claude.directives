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
a poll.** `ci-notify` fires only on `conclusion == 'success'`, only for workflows
it watches by name, and only when one of its two lookups resolves the run to
exactly one open PR — otherwise it stays silent. ⚠️ **Unique is not the same as
correct.** Uniqueness stops it picking arbitrarily among duplicate matches; it
does not prove the one match is related to the run. A `repository_dispatch` run
carries the DEFAULT-BRANCH SHA, so if the default branch is the head of exactly
one open PR (a `main` → `release` promotion), that unrelated PR is commented
while the session that dispatched waits — see `git.md` → *PR Lifecycle*. So a
**cancelled** run always ends with no wake, and a dispatched run
or an ordinary success ends with none when both lookups come back ambiguous or
empty. Neither of the latter two is silent by category: the branch-plus-owner
fallback exists precisely to catch dispatched PR-branch runs. `git.md` →
*PR Lifecycle* carries the list and the rule: **arm a check-in for any awaited outcome that can end without
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
   head — which does happen, and clears the label with no action from you.
   ⚠️ **But a clean rerun can equally arrive as a bare 👍 reaction, or as an
   inline reply inside a review thread** — the monitor watches neither, so the
   label sits there with nothing to remove it. All three forms were observed in
   `claude.directives` on 2026-08-23, so do not assume any of them: check the
   PR's **comments and its review threads**, and when the clear arrives in
   either unwatched form **request another pass** so the verdict lands in the
   form the monitor acts on. Read the PR rather than reading the stuck label as
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
- Do not remove `codex-flagged` by hand as a routine path. Address the inline
  comments, then request another pass and let the monitor clear it — it only
  sees a **commented** all-clear, and a clean rerun may instead arrive as a 👍
  reaction or an inline review-thread reply, so check the comments AND the
  review threads. Hand removal is a last resort bounded to two exits by
  `directives/git.md` → *PR Lifecycle*, and needs the rationale named there
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

- **Read the auth answer's EVIDENCE before reading its verdict.** The kit's
  `auth-result` attachment carries `gateEvidence: 'windowed' | 'proven'`, and S2's
  own skip and failure text names it inline. `windowed` means nothing was visible
  before the settle expired — which is not the same as nothing existing. A green
  or skipped auth scenario on `windowed` evidence is **not** a statement that the
  app has no gate; it is a statement that none appeared in time. Turn it into a
  decided answer with `TEST_AUTH_READY_SELECTOR` / `TEST_AUTH_READY_REQUEST`
  (`test.md` → *Playwright*). If S2 fails with `Auth-readiness condition never
  resolved`, the project's own declared condition did not hold — that is a real
  app or config problem, not a flake, and re-running will not change it.
- **A skipped auth scenario is not always an exemption.** S2 skips when there is
  genuinely no gate and no credential; it now **fails** when credentials ARE
  supplied and no gate is found, because config asserting a gate while the
  scenario lands on a page without one is a contradiction — usually a gate on a
  sub-route while the suite navigated to the baseURL. Check `APP_URL` first.
- `UI Tests (local server)` **skips** in the auth scenario or interaction sweep
  (upstream kit: S2/S3) when no credential is available from either source
  (`TEST_AUTH_CREDENTIAL`, or a login form that ships a working one)
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
- **A scenario TIMEOUT** (`Test timeout of Ns exceeded`) → a real failure, and the
  one most often waved through. It reads as infra noise, so nobody chases it —
  the same shape as *"a cancelled run is not a red one"*, one layer down at the
  test level. It means the budget sits below the work the scenario actually does.
  ⚠️ **First question, before any of the below: did this scenario just stop
  skipping?** A previously-green suite that starts timing out usually has a
  scenario whose precondition was just satisfied — a credential set, a page
  declared, a flag flipped. Its recorded duration was zero on every prior run, so
  its budget was never sized against anything, and the run that reveals that is
  its FIRST one, not a regression (`test.md` → *Playwright*). The tell is cheap:
  compare the timing-out scenario's history — skips, not fast passes — and check
  what changed in repo config rather than in the app. Rule this in or out before
  you go looking at profiles or at the app, because everything below assumes a
  scenario whose cost you have observed before.
  ⚠️ **Check the OTHER profiles before concluding anything**: the interaction
  sweep is uncapped and costs (element count × project count), and a WIDER
  viewport clips fewer controls, so it sweeps MORE of them. In `claude.trading`
  the phones passed at 97.5% of budget and tablet crossed first — a healthy-
  looking pass at the wall is the same finding as the timeout beside it.
  ⚠️ **Then establish the work is EXPECTED and FINITE before touching the
  budget.** Raising a timeout is the right fix only when the scenario is doing
  work it is supposed to do and simply needs longer. A hung app, an infinite
  render loop, a request that never settles or a genuine performance regression
  ALSO present as a timeout — and there, re-sizing masks a product defect and
  buys a slower red later. The discriminator is whether the cost scales with
  something you can name (elements, projects, depth) and lands where that
  arithmetic predicts. If it does not, the defect is in the app, not the bound.
  Only once it does: re-size from the measured worst case with real headroom,
  never to just-above-observed, and re-check the ENCLOSING job bound — a
  per-test ceiling raised past its job converts a test failure into a job
  cancellation

### Checking for a post-event workflow run

1. Compare the newest run's `created_at` against the triggering event timestamp
2. If nothing is newer → stop parsing, trigger manually
3. Never re-query the same cached tool result looking for a run that does not exist

### When to trigger qa-live.yml manually

- After a PR merges and the live app has not redeployed within ~2 minutes
- After any fix pushed directly to the main branch
- Any time live app behavior needs verification and auto-trigger cannot be waited on
