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

## Watcher Rules — canonical

Every `workflow_run` watcher below (`ci-monitor`, `ci-notify`, `qa-live`,
`pages-monitor`, `pages-retry`) obeys these three rules. **They are stated here
and nowhere else.** Each workflow file and setup step carries the ACTION it
needs and points back here for the reasoning — a rule explained in five places
is a rule corrected in four (learned the hard way, 2026-08-19).

### W1 — Every watched name must resolve to a workflow this repo has

A `workflow_run` entry naming a workflow you did not install can never fire. It
is not harmless: by reading, it is indistinguishable from an entry that used to
fire and has silently stopped. One exception, and only one — names GitHub
itself manages, currently just `pages-build-deployment`. Everything else is
project-owned.

- `/new-repo` installs the **full standard set**, so `'QA — Static + UI Tests'`,
  `'QA — UI Tests (live)'` and `'QA — Event-Driven Response'` all resolve in a
  standard scaffold, and `ci-monitor`/`ci-notify` ship watching all three.
- A project that deliberately omits `qa-response.yml` must remove
  `'QA — Event-Driven Response'` from **both** watchers in the same edit.
- Rename a workflow's `name:` and every watcher of it in the **same pull
  request**. A `name:` is also its check name, so a rename can additionally
  break branch-protection required checks.

### W2 — Pages has two sources, and only one name is ours to supply

The managed branch build is `pages-build-deployment`, created by GitHub — that
is the only Pages name a template can pre-fill. An Actions-sourced deploy runs
the project's own workflow, whose `name:` this template set neither ships nor
can guess. Setting Settings → Pages → Source to "GitHub Actions" makes the
managed build inert, so a watcher naming only it stops firing with no error —
and a repo scaffolded on the Actions source from day one gets a watcher that has
never fired at all, with no "it used to work" phase to notice.

| Watcher | Actions-source Pages |
|---|---|
| `qa-live.yml` | **add** your deploy workflow's exact `name:` |
| `pages-monitor.yml` | **add** a `workflow_run` trigger naming it (header has the snippet) |
| `pages-retry.yml` | **do not add it** — see W3 |

### W3 — Retry is source-specific; monitoring is not

Verifying a deploy is not re-running one. `pages-monitor` and `qa-live` may
watch either source. `pages-retry` may not: it re-runs the whole watched run, so
pointing it at a project-owned deploy replays that workflow's entire build,
which this template neither intends nor bounds. Actions-source projects build
retry into their own deploy workflow instead (Automation 4b).

A project MAY extend it anyway if its deploy is genuinely idempotent — no build,
no compile, no tests, same commit in and same tree out — but must record that
reasoning in its own CLAUDE.md, which routes the difference through
`/refresh-repo`'s documented-customization path rather than being preserved
silently.

### Known limitation — `ci-notify` and `repository_dispatch`

`ci-notify` comments on the open PR its lookups resolve the run to — head SHA
first, then head branch plus head-repo owner — and only when exactly one
candidate survives. A
`qa-response.yml` run triggered by `repository_dispatch` carries the default
branch SHA, which normally matches no open PR, so it exits "No open PR" and
emits no wake. Watching it in `ci-monitor` (failure tracking) works; the success
wake does not, for that path. Tracked separately — do not "fix" it by removing
the watcher.

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

**Drop-in:** ships pre-wired to watch all three QA workflows that come with it
(`qa.yml` → `QA — Static + UI Tests`, `qa-live.yml` → `QA — UI Tests (live)`,
`qa-response.yml` → `QA — Event-Driven Response`), so copying them verbatim
needs no edits. Change `workflow_run.workflows` to rename (workflow and every
watcher in the same PR), to watch an extra workflow, or to REMOVE the name of a
standard workflow you chose not to install — see *Watcher Rules* (W1) above.
Optionally verify with a manual `workflow_dispatch` run.

**To install:** `docs/standards/cicd-setup.md` → Step 9a (that doc is the single
canonical install procedure; carrying a second copy here is how a correction
lands in one place and not the other).

---

## Automation 3 — Codex Monitor Workflow (infra-resident, event-driven)

**Goal:** Flag Codex PR reviews that contain concerns so they aren't silently merged,
especially under auto-merge.

**How it works:**
- Triggers: `pull_request_review` AND `issue_comment`, both filtered to
  `chatgpt-codex-connector[bot]`. Two triggers because Codex splits its verdicts:
  flagged rounds arrive as reviews, and an all-clear ("Didn't find any major
  issues") arrives as a plain issue comment — a monitor listening only for
  reviews hears the complaint and never the all-clear.
  ⚠️ **Two more delivery modes exist and the monitor sees NEITHER.** A clean rerun
  can leave only a 👍 reaction on the PR body, which fires neither trigger. And a
  substantive verdict can arrive as an **inline review comment** — Codex replying
  in a review thread with "no additional changes were necessary", naming the head
  — which fires `pull_request_review_comment`, an event this workflow does not
  watch at all (verified against its `on:` block, 2026-08-23). Neither can clear
  the label. It can also arrive as a SHA-bearing comment, which
  does. Both were observed in this repo on 2026-08-23 — the comment form cleared
  #293 automatically — so **treat neither as the default and check the PR's
  comments before concluding the monitor has failed.** When the clear really is
  reaction-only, remove `codex-flagged` by hand with a rationale, per `git.md` →
  *PR Lifecycle*; waiting for the monitor in that case blocks the PR
  indefinitely.
- On a flagged review (`changes_requested`, or `commented` with inline
  comments): adds a `codex-flagged` label to the PR.
- **The label is two-way.** On an all-clear whose named commit matches the PR's
  current head, the monitor removes the label. The SHA match is load-bearing —
  the label is a merge blocker, and a delayed all-clear for an older commit must
  not unblock a head Codex never cleared. A verdict with no SHA, or for a stale
  SHA, holds the label. (One-way was the original design; it converted "Codex
  has concerns" into "Codex once had concerns" — permanently red until cleared
  by hand. Reasoning lives in the workflow's own header.)
- Does not repost Codex suggestions — Codex already comments inline.
- Uses `GITHUB_TOKEN` only.

**Template:** `templates/workflows/codex-monitor.yml` — drop-in, no customization needed.

**To install:** `docs/standards/cicd-setup.md` → Step 9b.

---

## Automation 4 — Pages Monitor Workflow (infra-resident, event-driven)

**Goal:** Catch a broken GitHub Pages deploy the moment it happens — build errored
or live URL not serving — with no session required.

**How it works:**
- Trigger: `page_build` — fires on every **branch-source** Pages build.
  `workflow_dispatch` allows a manual liveness re-check.
- ⚠️ **GitHub Actions Pages source: `page_build` goes inert** and this monitor
  then never runs — silently, which reads as "no deploy problems" when it means
  "nothing is watching". Add a `workflow_run` trigger naming your own deploy
  workflow's exact `name:`; the template's header carries the snippet, and the
  job already normalises the two status vocabularies. Unlike Automation 4b, the
  monitor DOES apply to both sources — verifying a deploy is not re-running one.
- Reads the build status from the event and verifies the live URL
  (`https://<owner>.github.io/<repo>/`) returns 200, with cache-busted retries.
- On a problem: opens/updates a single deduplicated `pages-deploy-failure` tracking
  issue. A healthy deploy closes it and reports green in the job summary only.
- The live URL comes from the Pages API (user-site repos and custom domains work),
  with a generic derivation as fallback — the file is portable to any project as-is.
- Uses `GITHUB_TOKEN` only.

**Template:** `templates/workflows/pages-monitor.yml` — drop-in for branch-source
Pages; Actions-source projects add the one `workflow_run` trigger above.

**To install:** `docs/standards/cicd-setup.md` → Step 9c.

---

## Automation 4b — Pages Deploy Retry (infra-resident, event-driven)

**Goal:** Auto-heal the transient *"Deployment failed, try again later."* Pages
publish blip without a session — the failure class that otherwise leaves the site
on the previous version until someone re-runs the deploy by hand.

**How it works:**
- Trigger: `workflow_run` on the managed `pages-build-deployment` workflow
  (branch-source Pages), on completion.
- On a failed deploy with `run_attempt < 4`: re-runs the whole deploy run. At the
  ceiling it stops and lets `pages-monitor.yml` (Automation 4) open the tracking issue.
- Projects deploying Pages via their own GitHub **Actions** source should build the
  retry into that workflow instead — this template covers the branch source by
  default. One narrow exception, per *Watcher Rules* → W3: a project MAY point it
  at its own deploy if that deploy is provably idempotent (no build, no compile,
  no tests) and records the reasoning in its own CLAUDE.md.
- Uses `GITHUB_TOKEN` only (`actions: write`).

**Template:** `templates/workflows/pages-retry.yml` — drop-in, no customization
needed. Full detail: `docs/standards/cicd-setup.md` Step 9d.

---

## Automation 4c — CI-Success Wake Signal (infra-resident, event-driven)

**Goal:** Let a watching web session wake on CI **success** without polling —
GitHub delivers failures natively but never green. **Coverage is partial by
design:** the wake fires only on `conclusion == 'success'`, only for the
workflows named in the watch list, and only when **either** lookup resolves the
run to exactly one open PR — the head SHA first, then head branch plus head-repo
owner as a fallback. A SHA that no longer matches any PR head is therefore not
outside coverage on its own; the branch step still catches the common case of a
head that moved while the run was in flight. For any awaited outcome outside
that set, arm a check-in — that is not polling (`git.md` → *PR Lifecycle*,
*GitHub API Quota Economy*).

**How it works:**
- Trigger: `workflow_run` (completed) on the QA workflows shipped in the set.
- On `conclusion == success`: resolves the run to **exactly one** open PR and
  posts a one-line "✅ green" comment — the comment webhook wakes the subscribed
  session. Two steps, each requiring uniqueness: the head SHA first, then the
  head branch **plus head-repository owner** as a fallback (for a dispatched run
  or a head that moved mid-flight), which is labelled *matched by branch* because
  the SHA it names may already be superseded.
- **Ambiguity exits silent, by design.** Two open PRs can share a head commit —
  the same tip proposed against `main` and against a release branch is ordinary —
  and posting to the first of them signals green for a base the run never tested.
  A reader treating that as a gate signal is reading another PR's result, so the
  lookup takes a match only when one candidate survives. No PR, or more than one
  → exits quietly, and the waiting session's check-in is what covers it.
- Failures are deliberately NOT commented (delivered natively; `ci-monitor.yml`
  tracks them repo-side).
- Uses `GITHUB_TOKEN` only (`pull-requests: write`).

**Template:** `templates/workflows/ci-notify.yml` — drop-in, no customization needed.

---

## Automation 5 — In-Session Reactive Subscription

When a Claude Code session opens a PR, it receives that PR's activity for fast
feedback. The subscription is **harness-side and automatic** — no tool call:
- **Do not subscribe at session start.** `subscribe_pr_activity` exists for
  taking over a PR this session did not open, or re-subscribing after an
  unsubscribe (`git.md` → *PR Lifecycle*)
- **Never unsubscribe from a PR you are driving.** The harness drops it at merge
  or close. Dropping it yourself disables `ci-notify.yml`'s wake (Automation 4c)
  and leaves a review round with no push signal at all; a scheduled check-in is
  not a substitute, because a timer cannot know whether anything changed
- Webhooks don't deliver new pushes or merge-conflict transitions — and deliver
  CI success only via `ci-notify.yml`'s PR comment (Automation 4c) — so re-check
  PR state on wake and re-arm silently if nothing changed
- This is the fast-feedback layer; `ci-monitor.yml` is the always-on backbone

---

## Activation Checklist for New Sessions

- [ ] Confirm `ci-monitor.yml` is present and its `workflow_run.workflows` list is correct
- [ ] Confirm `codex-monitor.yml` is present
- [ ] Confirm `pages-monitor.yml` is present (any project with a GitHub Pages site)
- [ ] Confirm `pages-retry.yml` is present (branch-source Pages projects)
- [ ] Confirm `ci-notify.yml` is present (wakes web sessions on CI green — success only, watched workflows only, unambiguous PR only; Automation 4c)
- [ ] Check for any open `ci-failure` tracking issues before starting work
- [ ] Do **not** subscribe to open PRs as a blanket session-start step — subscription is harness-side on open. The one exception stands: a session TAKING OVER a PR it did not open subscribes explicitly (Automation 5)
- [ ] Read `CLAUDE.md` for full project context

---

## PR Lifecycle Rules

The canonical lifecycle (draft-first, auto-subscribed on open, green-before-ready,
diff verification, no force-push to `main`) lives in `directives/git.md` →
*PR Lifecycle*. Additions for automated sessions:

### Superseded PRs
Post a comment on the **previous PR** pointing to the new one:

```
Handoff → PR #N
This PR is [merged/closed]. Follow-up work is in PR #N (`branch` → `main`). Please direct any further comments there.
Generated by [Claude Code](https://claude.ai/code)
```

### Merging
- Static Checks AND UI Tests (local server) must pass — the shipped template sets
  `advisory-run: 'false'`, so a real Playwright failure blocks the merge. Only the
  auth-gated scenarios are exempt, and they self-skip rather than fail
  (`directives/test.md` → *CI triage*). A project mid-fix on a known UI failure may
  set `advisory-run: 'true'` temporarily and must flip it back.
- The `codex-flagged` label is **asymmetric**: a label still present blocks the merge
  until triaged, but its absence proves nothing — it is written asynchronously. The
  monitor clears it itself on a Codex all-clear **comment** that names the current head
  (Automation 3 above) — never on a 👍, which fires no trigger — so a label still
  present means concerns not yet re-reviewed, a reaction-only
  clean round needing manual removal, an all-clear that
  failed the SHA match, or a monitor run that has not landed yet — read the PR before
  removing it by hand, and remove with a rationale when you do. Apply `git.md` →
  *PR Lifecycle*'s source-review gate: match a Codex review — or its clean comment, which
  names the commit too — to HEAD by commit SHA, confirm the Codex bot authored it, read
  the review's inline comments, and treat unreadable reviews as uncleared. **A bare 👍
  never clears the gate from the EMBEDDED SUMMARY.** `issue_read` → `get` returns
  reactions as counts only — no author, no timestamp — so read that way a 👍 cannot be
  attributed to Codex or correlated with a request, and "accept it when the request
  postdates the push" (the rule here until 2026-08-23) has nothing to compare against
  and would merge an **unreviewed head**. But the data is missing from that VIEW, not
  from GitHub: the reaction LIST endpoint (`GET /repos/{owner}/{repo}/issues/{number}/
  reactions`) returns `user` and `created_at`. A clean round is therefore reachable —
  `git.md` → *PR Lifecycle* carries the ladder. Its test is an ORDERING (push →
  review request → Codex-authored reaction), not merely a reaction after the push,
  since a review of the previous head can land after a newer commit — **and the
  ordering alone is not sufficient**: a request still in flight when you push will
  produce a reaction that satisfies every timestamp comparison while describing the
  old commit. That rung applies only when no earlier request is left unanswered,
  which on a PR that has already run clean is usually false. Where that
  endpoint is out of reach, ask Codex a direct question or attest on the PR; what is
  forbidden is clearing the gate **silently**. A reaction-only clean round also cannot
  clear `codex-flagged` — the monitor triggers on reviews and comments, never
  reactions — so the label must come off by hand with a rationale
- After merge, trigger `qa-live.yml` manually if Pages hasn't redeployed within ~2 minutes
- Do not unsubscribe at all on a PR you are driving — the harness drops it at merge (`git.md` → *PR Lifecycle*)

### CI triage
See `docs/standards/ci-triage.md` for the full triage rules (expected vs real failures,
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
