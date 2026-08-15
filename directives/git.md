# Claude Git Directives

## Purpose
Git/GitHub repo hygiene and PR mechanics for every project — branch → PR →
merge → cleanup. Split out of `global.md` (2026-07-14), which keeps pointer
stubs under the original headings so older references still resolve. Branch
policy itself (fresh `claude/<name>` per change, PR to `main`) stays in
`global.md` → *GitHub Workflow*.

## PR Lifecycle
- Open a draft PR as soon as a branch has a first commit
- PR activity arrives on its own: opening a PR subscribes the session
  harness-side, with no tool call involved. `subscribe_pr_activity` is for taking
  over a PR you did not open, or re-subscribing after unsubscribing
- A PR-wait is never idle time: the moment the PR's CI is in flight, start the
  next ready task (`global.md` → *Pipelined Execution*, whose turn-end test
  applies)
- Fix all CI failures before marking ready for review
- Mark PR ready only when all checks pass
- **Auto-merge on approval:** once the user approves a change, that approval
  covers merging it — don't ask a second time. Squash-merge as soon as the
  required CI checks are green, **provided** the PR has no `codex-flagged`
  label, no unresolved review threads, and a diff limited to the intended files.
  If any condition fails, pause and surface it instead of merging. Always report
  the merge result. To merge on green **without** a per-change approval, classify
  the diff per *Conditional Auto-Merge on Green* below.
- **Unsubscribe before merging** via `unsubscribe_pr_activity` — past that point
  every delivered event is a notice about the merge you are performing. If the
  merge is then blocked, re-subscribe (the call is idempotent).
- A `codex-flagged` label is a **merge blocker**: triage Codex's review first —
  apply the fix, or remove the label with a one-line dismissal rationale in the
  PR. Check the PR's labels on GitHub before merging; the `codex-monitor`
  workflow adds the label and never clears it for you.
- **Label-absence is not proof.** `codex-monitor` applies `codex-flagged`
  asynchronously, so a review landing seconds before the merge leaves the label
  unset and a labels-only check passes a PR Codex has already flagged. Read the
  reviews directly (`pull_request_read` → `get_reviews`) as well as the labels,
  on the current head, immediately before merging.
- Before merging, confirm the PR's file list is **only** what you changed. A
  surprise file count signals a stale or tangled branch — verify against
  GitHub's own PR diff, not a possibly-stale local clone (re-fetch/prune, or
  re-cut from `main`, if they disagree)
- **Any PR touching `.github/workflows/**` gets a line-by-line read of that diff
  before approval or merge** (owner ruling, 2026-07-19), regardless of source or
  green CI. Workflow files run with secrets and outlive the session that wrote
  them. They're already excluded from auto-merge; this adds that the approval
  itself must be eyes-on-the-diff, never approval-by-momentum. A workflow file
  appearing in a PR that wasn't supposed to touch workflows is a
  stop-and-diagnose, not a merge-and-see.
- Never force-push to `main`

## Conditional Auto-Merge on Green (owner ruling, 2026-07-12)
All projects deploy GitHub Pages from `main`, so work is invisible until merged
and waiting has a real cost. When a PR's CI gates are fully green, classify the
diff and act:

**Auto-merge immediately, without asking** — squash, then follow the
update-pages flow (watch the Pages build for the merged sha to a terminal state
and confirm the live site serves it):
- Frontend code, styles, static assets, data-pipeline scripts
- Docs, specs, tests, CLAUDE.md, .claude/ config
- Anything fully undone by a plain `git revert`

**Hold for explicit owner approval, even on green CI** — the PR waits, with a
clear note of what it touches and why it's held:
1. Secrets, tokens, PINs, or personal data anywhere in the diff — on a public
   repo a merge is irreversible in the only way that matters; this class is
   never merged, it's fixed first.
2. Environment variables / repo or workflow configuration that runs with
   elevated secrets.
3. ANY Supabase backend change — migrations, RPCs, RLS, grants, edge functions
   — regardless of how safe it looks. These follow `data.md` →
   *Reversible-by-Design*; the owner approves the merge per instance.

The safety net for the auto-merge class is reversibility, not hesitation: a
regression found after merge is handled revert-first (`git revert` or GitHub's
Revert button), investigate second; a small roll-forward fix is fine when
clearly faster.

If CI never registers on a PR (no run at all — different from a red run), walk
this ladder in order; each rung is a fresh event source:
1. Close→reopen the PR — re-fires the `pull_request` event.
2. Push an empty commit — fires a `synchronize` event.
3. Re-cut the branch under a new name and open a new PR — fresh event stream.
4. Still nothing? **Diagnose scope before more retries**: if push-to-main runs
   fire while `pull_request` runs don't, it's a GitHub event-delivery outage,
   not your workflow file — stop burning retries. Run the gate manually
   (`qa.yml` has `workflow_dispatch` for exactly this) on the PR's branch, or
   arm a timed watch for recovery. Either way, surface status and options to the
   owner within ~30 minutes — never wait silently.

A manual-dispatch run on the PR's head SHA satisfies the merge gate: the policy
requires the gate to pass on that SHA, not a particular trigger.

## Repo-settings preflight (warn once per session)
Two GitHub repo settings make the merge rules above work end-to-end. Agents
cannot change repo settings themselves, so the deliverable is a **single warning
per session** with the exact settings path. Never block work on it; never re-nag
in the same session. Check at `/env-chk` or the session's first PR.

1. **Allow auto-merge** — `Settings → General → Pull Requests → Allow
   auto-merge`. If off, warn once with that path. Until it's enabled, the
   *Conditional Auto-Merge on Green* fallback applies: the agent watches CI and
   squash-merges itself once green. Detection: where `gh api` works,
   `GET /repos/{owner}/{repo}` exposes `allow_auto_merge`; in remote sessions
   where api.github.com is blocked, the practical signal is the
   `enable_pr_auto_merge` MCP call being rejected with "Auto-merge is not
   enabled for this repository" — treat that rejection as the trigger to warn,
   not an error to retry.

2. **Automatically delete head branches** — same settings path. If off, warn
   once: squash-merged `claude/*` branches otherwise pile up forever. Detection:
   `GET /repos/{owner}/{repo}` exposes `delete_branch_on_merge`. Do NOT delete
   stale branches as a workaround — in remote sessions branch-delete pushes are
   rejected (403; push scope covers the designated branch only). The fix is the
   setting; the warning is the deliverable.

## GitHub API Quota Economy (owner ruling, 2026-07-21)
Every Claude session, in EVERY repo, acts on GitHub as one user identity and
draws from that identity's single primary REST quota (5,000 calls/hour). Git
transport (push/fetch/clone) is not metered; API/MCP reads and writes are. Quota
hygiene is fleet-wide — one repo session's polling can starve another repo's
merge in the same hour.

**REST and GraphQL have SEPARATE pools.** A strike on one says nothing about the
other, and the GitHub MCP silently mixes both: merging a PR is REST, but marking
one ready-for-review is GraphQL-only (`markPullRequestReadyForReview` — GitHub
exposes no REST equivalent). A GraphQL-exhausted session can still merge a PR
that is already non-draft, while a draft one is stuck behind the one call it
cannot make. So:
- **Un-draft as soon as CI goes green**, not at merge time. Draft-on-first-push
  still stands (*PR Lifecycle* above); this only moves *when* you leave draft,
  so the GraphQL call happens while budget is likely available.
- Tell REST from GraphQL by the failing verb: a 4xx from the merge/comment/label
  endpoints is REST; a failure to un-draft, resolve a review thread, or read
  review threads is GraphQL.

**Diagnose from the error text** (rate-limit headers are usually invisible in MCP
results):
- `API rate limit already exceeded for user ID …` → **primary** quota; resets on
  the rolling hour. Retry after rollover, not in minutes.
- A message naming a **secondary rate limit** explicitly → burst throttle; back
  off a few minutes and slow the write cadence.
- Either way a throttled call is **retryable, not fatal** — never diagnose it as
  a broken repo, account, or permission problem.

**Rules:**
- **Never poll** for CI, deploy, or PR status — webhook wakes + `ci-notify`
  (`global.md` → *Async Operations*). A watching session is woken by success; it
  does not ask for it.
- **Reads:** request small pages (`per_page` 5–10, minimal output); reuse
  already-fetched payloads (jq the saved file) instead of re-fetching; when
  throttled, route reads through WebFetch (server-side — does not draw on the
  shared quota).
- **Writes:** batch related changes into fewer PR cycles — one PR carrying three
  changes beats three PRs. On a throttled write, arm ONE scheduled check-in
  sized to the rolling hour; never retry-loop or burst.
- **Stagger heavy sessions across repos.** Many PR cycles, audits, or migration
  sweeps in two repos within the same hour share one pot — sequence them.
- **The owner's browser is the unmetered fallback**: for a green, gate-clean PR,
  "Ready for review → Squash and merge" in the UI costs no API budget and is
  always the fastest path out of a throttle. When only GraphQL is exhausted, the
  owner clicking *Ready for review* alone is enough — the session can then merge
  over REST without waiting for the hour.
