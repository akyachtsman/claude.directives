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
  harness-side, with no tool call involved. **Keep that subscription for the PR's
  whole life** — never drop it earlier than the merge, and never poll a PR you
  could have stayed subscribed to. `subscribe_pr_activity` is for taking over a
  PR you did not open, or re-subscribing after unsubscribing
- **A subscription covers that PR and nothing else.** A Pages deploy, a live gate
  on `main`, a scheduled workflow, or a `workflow_dispatch` run **with no open PR
  on its branch** — none of it is PR activity, and no subscription reports it. For
  those, arm ONE scheduled check-in naming the specific outcome and drop it when
  the outcome lands. A check-in is the right tool there and the wrong tool on a
  PR; do not ban it in both places at once, or a non-PR gate can sit red
  indefinitely with nothing able to say so.

  A dispatched run on an open PR's branch is covered **only when both hold**, and
  the check is cheap enough that there is no excuse for assuming either:
  1. the run's workflow is **named in `ci-notify.yml`'s `workflows:` list** — it
     watches three by name, and a run outside that list produces no comment at
     all; and
  2. `ci-notify.yml` is already live **on the default branch**. `workflow_run`
     triggers are read from the default branch, so the workflow can never wake
     the PR that installs it (the file says so in its own header).

  When both hold, do not arm a check-in — `ci-notify` falls back to matching by
  branch when the run's SHA is not a PR head, and names `workflow_dispatch` as
  one of the two cases that fallback exists for. Arming one anyway is the
  redundant PR check-in this rule bans one sentence earlier.

  When **either** fails, no wake can occur and a check-in is the only thing that
  can observe the outcome — arm one. Getting this backwards is the worse error of
  the two: a redundant check-in costs a wasted wake, while a forbidden one costs
  an agent waiting indefinitely for a signal that cannot arrive.

  Read the green it does produce with the caveat the workflow itself attaches: a
  branch match can name a **superseded** commit, so verify the SHA is still head
  before treating it as a gate.
- A PR-wait is never idle time: the moment the PR's CI is in flight, start the
  next ready task (`global.md` → *Pipelined Execution*, whose turn-end test
  applies)
- Fix all CI failures before marking ready for review
- Mark PR ready only when all checks pass
- **Auto-merge on green:** squash-merge as soon as the gates hold — see
  *Conditional Auto-Merge on Green* below for the gate list and the two
  surviving stops. If any gate fails, pause and surface it instead of merging.
  Always report the merge result; reporting is not asking.
- **Never unsubscribe from your own PR.** The harness drops the subscription
  itself when the PR merges or closes; `unsubscribe_pr_activity` is for a PR you
  were asked to stop watching, not for one you are driving.
- A `codex-flagged` label is a **merge blocker**: triage Codex's review first —
  apply the fix, or remove the label with a one-line dismissal rationale in the
  PR. Check the PR's labels on GitHub before merging. The `codex-monitor`
  workflow adds the label on a flagged round and clears it itself on a Codex
  all-clear that names the current head SHA — so a label still present means
  either concerns not yet re-reviewed, or an all-clear that failed the SHA
  match; read the PR before overriding by hand.
- **Neither a missing label nor an empty review list is proof.** Before merging,
  clear the gate against the current head:
  - **Wait for a Codex response** — a review with inline comments, a plain comment
    naming the reviewed commit, or a bare 👍. Any one is the signal; the absence of
    all three is *pending*, never clean.
  - **Check the author.** Wording and a current SHA are forgeable; only the Codex
    bot's own response clears the gate.
  - **Match by SHA, not by clock.** Reviews and clean comments both name the commit
    — compare it to HEAD. Only the bare 👍 carries no SHA: accept it alone only when
    its triggering review request postdates the latest push.
  - **Read the inline comments** (`pull_request_read` → `get_review_comments`).
    `get_reviews` cannot tell a clean `COMMENTED` review from an actionable one.
  - **Check EVERY unresolved thread, not just this round's.** An all-clear
    covers only the round it reviews; it never re-raises threads left open by an
    earlier one, so a clean verdict can sit above unaddressed findings on the
    same head. Findings arrive as review THREADS while the issue comments show
    nothing — judging from comments alone reads an unreviewed PR as clean.
  - **Unreadable reviews do not clear the gate** — that call is GraphQL and fails
    when the pool is empty. Wait or surface; never fall back to the label.
  - **A usage-limit reply is a fourth outcome: _unavailable_ — not clean, not
    pending.** When the allowance is spent, Codex answers with a comment saying so
    instead of reviewing, and no amount of further waiting produces a review. The
    allowance is **weekly and shared across Codex, Work, Workspace Agents and
    ChatGPT for Excel**, so it can be exhausted by work in another repo entirely —
    check the account, not the repo, before concluding anything about config.
    Treat it as the gate being DOWN: it never counts as clean, but it does unblock
    the merge decision on one condition — **say so on the PR before merging**, one
    line naming the reset time, so the record shows the PR merged with one reader
    rather than two. Merging while silently omitting it is precisely the failure
    this gate exists to prevent: an absent signal read as a passing one.
  - **Codex reviews are metered per REQUEST, not per push.** Each request spends
    from that shared weekly pool, and requests come from opening a PR, flipping a
    draft to ready, and `@codex review` — the same three the bullet below names.
    So the expensive habit is re-requesting, not committing: measured 2026-08-17,
    thirteen reviews on one PR inside 100 minutes, one per commit, from a draft
    toggled ready over and over while the account's trigger was "On PR open".
    Whether that alone emptied the week is not knowable — the pool is shared
    across four products — but it was a material share of it, spent re-asking for
    a verdict on work the local gate should have settled first. Verify locally,
    open the PR once, and reserve `@codex review` for a fix you genuinely want
    re-read. **Check which trigger the account is on before assuming any of
    this**: the setting also offers "On every push", under which every commit
    does spend a review, and it is account-level — invisible from the repo.
  - **Request a review after pushing a fix**; Codex responds on open,
    ready-for-review and `@codex review`, not on a push. Un-drafting leaves no
    comment to carry a 👀, so silence is indistinguishable from a missed trigger.
  - **Ready-for-review fires SOMETIMES, at a rate that differs by repo — learn
    yours, don't assume.** Measured 2026-08-22/23, same account: in this repo 5
    of 7 un-drafts drew a review in ~3–4 minutes; a sibling project repo reported
    1 of 4, and ~5.7 minutes when it did fire. An explicit `@codex review`
    answered within ~2.5 minutes in both. Treat these as rates on small samples,
    not as an on/off setting — nothing here establishes *why* they differ.
    Default to waiting ~10 minutes, then request explicitly, **once only**. After
    **two consecutive un-drafts draw nothing in a repo, stop waiting there** and
    request as soon as CI is green.
  - **Re-test that judgement, or it never unsticks.** The trigger is
    intermittent, not binary — two misses in a row happen in a repo where it
    mostly works, and once you stop waiting you can no longer observe it
    recovering, so a transient fault or a fixed setting would go on costing a
    duplicate on every PR. So while in the no-wait state, **take the full wait
    again every ~5th PR in that repo**, and immediately after any change to the
    account's Codex settings. One firing returns the repo to the default; two
    consecutive misses re-enter no-wait.
  - Do not generalise either way: where the trigger works, a reflex explicit
    request is a duplicate, and reviews are metered per request from a pool that
    is weekly and account-wide — the waste lands on every other repo.
- Before merging, confirm the PR's file list is **only** what you changed. A
  surprise file count signals a stale or tangled branch — verify against
  GitHub's own PR diff, not a possibly-stale local clone (re-fetch/prune, or
  re-cut from `main`, if they disagree)
- **Any PR touching `.github/workflows/**` gets a line-by-line read of that diff
  before merge** (owner ruling, 2026-07-19), regardless of source or green CI.
  Workflow files run with secrets and outlive the session that wrote them.
  They auto-merge on green like every other class (2026-08-18) — this gate
  makes the merging session read the diff eyes-on first, never
  merge-by-momentum. A workflow file appearing in a PR that wasn't supposed to
  touch workflows is a stop-and-diagnose, not a merge-and-see. Modifying a
  workflow's TRIGGER conditions remains stop-and-ask before making the change
  (`global.md` → Escalation Rules) — a change-authority gate, not a merge gate.
- Never force-push to `main`

## Conditional Auto-Merge on Green (owner rulings, 2026-07-12 / 2026-08-18)
All projects deploy GitHub Pages from `main`, so work is invisible until merged
and waiting has a real cost.

**Auto-merge on green is the RULE, not a class (owner ruling, 2026-08-18: "all
sessions auto-merge — don't ask me permission to merge each time").** When the
gates hold — CI green on the head SHA, a current-head Codex response per the
gate above (or its documented unavailable outcome, noted on the PR), no
`codex-flagged` label, no unresolved review threads, diff limited to the
intended files — squash-merge WITHOUT
asking, then follow the update-pages flow (watch the Pages build for the merged
SHA to a terminal state and confirm the live site serves it). This covers every
diff class, including Supabase record files and workflow config: the prior
hold-for-approval list is SUPERSEDED — asking the owner permission to merge is
now a directive violation, not caution. Always report the merge result;
reporting is not asking.

Two stops survive, neither a permission ask:
1. **Secrets, tokens, PINs, or personal data anywhere in the diff** — the PR is
   defective: scrub first, never merge as-is.
2. **Merge authority covers requested or standing-scope changes only** —
   invented scope needs approval for the CHANGE, after which the merge again
   needs none.

Applying changes to the live database still follows `data.md` →
*Reversible-by-Design* and each project's escalation rules — that governs the
operation, never the merge.

The safety net is reversibility, not hesitation: a regression found after merge
is handled revert-first (`git revert` or GitHub's Revert button), investigate
second; a small roll-forward fix is fine when clearly faster.

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
  changes beats three PRs. On a throttled write, arm ONE scheduled completion
  check-in sized to the rolling hour; never retry-loop or burst. That single
  check-in is both the retry and the heartbeat's next opportunity — it carries
  the liveness line per `global.md` → *Status Line on Every Stop*, which never
  justifies a second wake.
- **Stagger heavy sessions across repos.** Many PR cycles, audits, or migration
  sweeps in two repos within the same hour share one pot — sequence them.
- **The owner's browser is the unmetered fallback**: for a green, gate-clean PR,
  "Ready for review → Squash and merge" in the UI costs no API budget and is
  always the fastest path out of a throttle. When only GraphQL is exhausted, the
  owner clicking *Ready for review* alone is enough — the session can then merge
  over REST without waiting for the hour.
