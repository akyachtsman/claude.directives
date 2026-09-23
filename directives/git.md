# Claude Git Directives

## Purpose
Git/GitHub repo hygiene and PR mechanics for every project — branch → PR →
merge → cleanup. Split out of `global.md` (2026-07-14), which keeps pointer
stubs under the original headings so older references still resolve. Branch
policy itself (fresh `claude/<name>` per change, PR to `main`) stays in
`global.md` → *GitHub Workflow*.
A `docs/…` path in these directives resolves against claude.directives:
`https://raw.githubusercontent.com/akyachtsman/claude.directives/main/<path>`.

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

  **The exception is any awaited outcome that can end WITHOUT emitting a wake,
  and the rule for it is: arm the check-in, then drop it when THAT OUTCOME is
  observed terminal — not when any wake arrives.** A session subscribed to a PR
  is woken by unrelated activity on it constantly; treating those as the signal
  drops the fallback while the run is still going, and if it is then cancelled
  nothing reports it. Re-check and re-arm until terminal
  (`global.md` → *Async Operations*, item 2). This is not a licence to ignore wakes — `ci-notify` usually does
  comment. It is a refusal to *depend* on one where the outcome may produce none.

  Known cases — evidence that the class is broad, **not a list to check
  against**:
  - **a dispatched run on a PR branch** — `ci-notify` has seven verified ways to
    emit no wake: the workflow is not on its watch list; the watcher is not yet
    on the default branch; the watch list is read from the default branch, so a
    rename on the PR fires the old name; a `repository_dispatch` run carries the
    default-branch SHA; a lookup that fills its 100-PR page refuses it; neither
    lookup resolves exactly one PR; the run was cancelled;
  - **any run that is CANCELLED**, ordinary `pull_request` CI included —
    `ci-notify` fires only on success, and the `check_suite.completed` wake
    excludes cancelled suites. `ci-monitor.yml` may still file a `ci-failure`
    issue, but **none of it reaches the session waiting on the PR.** Arm the
    check-in.
  - **an ordinary successful run whose PR cannot be resolved unambiguously** —
    each `ci-notify` lookup (head SHA, then branch plus owner) must match exactly
    one open PR, and silence needs **both** to fail. A `repository_dispatch`
    run carries the DEFAULT-BRANCH SHA, and if the default branch is the head of
    exactly one open PR (a `main` → `release` promotion, say) that unrelated PR
    is commented while the session that triggered the dispatch waits.

  Do not try to enumerate your way to "covered": a check-in armed unnecessarily
  costs **one wasted wake**; one withheld on a false promise of coverage costs an
  agent **waiting forever**. Each case in full, with its evidence:
  `docs/standards/pr-mechanics.md` → *Wakes that never arrive*.

  Read the green it does produce with the caveat the workflow itself attaches: a
  branch match can name a **superseded** commit, so verify the SHA is still head
  before treating it as a gate.
- A PR-wait is never idle time: the moment the PR's CI is in flight, start the
  next ready task — a launched verification is the start signal, and the queue
  is worked until drained (`global.md` → *Parallel Tasking via Subagents*)
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
  apply the fix, then request another review pass (next bullet). Check the PR's
  labels on GitHub before merging.
  The `codex-monitor` workflow adds the label on a flagged round and clears it
  itself on a Codex all-clear **comment** that names the current head SHA — the
  only form it can act on, and the form that cleared #293. A clean rerun can
  equally be a 👍 reaction or an inline review-thread reply; the monitor sees
  neither, and the label then sits with nothing to remove it. Which form arrives
  is not predictable: check the comments AND the review threads before assuming
  any of them. A label still present means concerns not yet re-reviewed, a clean
  round delivered in a form the monitor cannot see, or an all-clear that failed
  the SHA match — read the PR, never the label alone.
- **Taking `codex-flagged` off by hand is the last resort — request another
  review pass and let the monitor clear the label.** Removing it asserts the
  concern is resolved, which is the author claiming what the reviewer should
  say; requesting a pass makes Codex say it, in the form the monitor watches.

  **The opening is a TEST — the *unreachable-review test*.** Hand removal is
  permitted only where an **observable terminal state**, recorded on the PR,
  shows that a further request cannot produce a verdict. Record what was
  requested, when, and what you observed. This same test opens the verdict gate
  below; one test, so the two cannot drift into disagreeing about which states
  count. Two states qualify today, and a state not listed still has to satisfy
  the test — the observable is what makes it an exit rather than a shortcut.
  **Never request a series**: Codex is metered per request from a shared weekly
  pool (below).
  - ***unavailable*** — Codex replied that the allowance is spent. Do not spend
    another request while that reply holds; it already says none will be
    reviewed. It **expires at the reset time it names**: past that the allowance
    may be back, so request a current-head pass rather than merging on a stale
    refusal.
  - **outage** — the request could not be made or accepted at all: the App is
    not installed, the trigger errors, GitHub reports it undeliverable.

  The two states are an *unavailable* reply still inside its reset window, or a
  request that could not be made or accepted at all — never elapsed silence.

  **SILENCE IS NEVER THE EVIDENCE, AND NEITHER IS A REACTION.** A user holds one
  reaction per type, so the only 👍 present is the first, with its original
  timestamp — a further pass answered that way leaves nothing new to observe
  (the ladder below records this).

  **So a stuck label with no observable terminal state is not a removal case:
  the PR stays blocked and you SAY SO** — one line to the owner naming what you
  requested, when, and what you checked. That is the escape valve and it is
  deliberately a person: a reviewer that has silently stopped answering is not a
  state a session resolves alone. A stalled PR is loud; a PR merged past a review
  in progress is not.

  ⚠️ **All of this is about a label that is THERE.** The reaction ladder below
  clears the verdict gate; it never clears the label. So on a PR carrying no
  `codex-flagged` — a first pass that came back clean as a reaction, which the
  monitor never labels — the ladder is the whole gate and the merge proceeds
  unattended. The escalation above applies only where a label from an earlier
  flagged round is still sitting there and no observable terminal state explains
  it.
- **Neither a missing label nor an empty review list is proof.** Before merging,
  clear the gate against the current head. **On the normal path — some
  SHA-bearing Codex response names HEAD — every check below is NECESSARY and
  only the clean-verdict test is sufficient**: a check that passes narrows what
  you are looking at; it never opens the gate on its own.
  ⚠️ **Any state the _unreachable-review test_ above admits sits OUTSIDE that
  framing, and it must not be read as closing them** — a gate that cannot be
  cleared is not stricter than one that can, it just moves the failure from a bad
  merge to a stalled PR. The exits known today: the **reaction ladder** below,
  when NOTHING from Codex names HEAD; **_unavailable_**, a usage-limit reply
  stated on the PR while still current; and **outage**, a request that could not
  be made or accepted at all. ⚠️ The ladder clears this gate and NOT the
  `codex-flagged` label — the label rule above governs that. None of them is a
  way past a verdict you can READ, and none ever bypasses an adverse verdict that
  exists. **Every exit stays reachable, and none clears the gate silently.**
  What each exit requires: `docs/standards/pr-mechanics.md` → *Exits from the verdict gate*.
  The checks:
  - **Wait for a Codex response naming the current head** — a review, a plain
    comment naming the reviewed commit, or an inline reply inside a review thread
    (`pull_request_review_comment`), which Codex also uses. All three count as a
    RESPONSE on the same terms: Codex-authored, naming the current head. Absence
    is *pending*, never clean. A bare 👍 is **not** one of these: see below.
  - ⚠️ **A response is not a verdict.** Codex-authored and naming HEAD proves the
    head was REVIEWED — not that it PASSED. A review carrying live inline findings
    satisfies both tests while saying the opposite, so treating "a response at the
    current head" as the gate authorises merging straight over Codex's own open
    findings, and contradicts the *no unresolved review threads* gate below.
    The gate clears only on a **clean** response: a comment or inline reply
    reporting no issues, or a review whose every inline finding has been fixed or
    explicitly dismissed on its thread. A response ends *pending* — it is the
    start of the check, not the end of it.
    ⚠️ The inline-reply form clears the GATE but not the LABEL — `codex-monitor`
    does not watch that event, so the last-resort rule above governs the label
    (`docs/standards/pr-mechanics.md` → *The inline-reply form and the label*).
  - **Check the author — it validates the SOURCE, not the outcome.** Wording and
    a current SHA are both forgeable, so a response that is not the Codex bot's
    own cannot clear the gate. Authorship is necessary and never sufficient: a
    Codex-authored review carrying live findings passes this check and still
    leaves the gate shut, per the rung above.
  - **Match by SHA, not by clock.** Reviews, clean comments and inline replies all
    name the commit — compare it to HEAD.
  - **A bare 👍 never clears the gate FROM THE EMBEDDED SUMMARY.** `issue_read` →
    `get` returns reactions as counts only — no author, no timestamp — so a 👍
    there cannot be tied to Codex or to the current head, and treating it as
    clean can merge an **unreviewed head**. **Check for a SHA-bearing response at
    the current head FIRST**: only once nothing from Codex names HEAD does
    `"+1": 0` mean genuinely pending. A 👀 means *received*, not *clean*. How to
    read the counts, and what the reaction LIST endpoint adds:
    `docs/standards/pr-mechanics.md` → *Reading reactions*.
  - **The clean-round escape hatch — for when the reaction really is all there
    is.** ⚠️ **Check the COMMENTS and the REVIEW THREADS first.** The ladder
    applies **only when no SHA-bearing Codex response names the CURRENT head** —
    judge that by the current head, never by whether the lists are empty, since
    they only grow. Work down it and stop at the first rung that is available:
    1. **Reaction list** — author + `created_at`, the push → request → reaction
       ordering, AND no earlier request left unanswered.
    2. **Ask, don't re-review** — a direct `@codex` question naming the SHA,
       answered as a comment.
    3. **Attest, never infer** — merge on the reaction only by stating on the
       PR: the head SHA, when the review was requested, the reaction count now,
       and that the reaction cannot be attributed on this tool surface. A
       missing before-count weakens the record; it never blocks this rung.
    A second clean pass adds no new 👍 when an earlier clean pass already left
    one, so on such a PR rungs 2–3 are the usual path; if the earlier pass came
    as a comment or inline reply instead, a new 👍 still counts for rung 1. Each rung's conditions and why:
    `docs/standards/pr-mechanics.md` → *The reaction ladder*.
  - **A CLEAN verdict leaves NO REVIEW — but it may still leave a comment.**
    It arrives in one of the three forms the `codex-flagged` bullet above names,
    none of them a review, so an empty REVIEW list means nothing on its own. A SHA-bearing
    CLEAN verdict in a comment or a review thread clears the gate normally; a
    review carrying live findings is a response, not a clearance. A label left
    by a 👍 or inline-reply rerun follows the last-resort rule above — **do not
    read the stuck label as unaddressed concerns; read the PR.** Observed forms
    and the four delivery modes: `docs/standards/pr-mechanics.md` → *Codex delivery forms*.
  - **A `check_suite.completed` wake is a PROMPT TO LOOK, never evidence about the
    current head.** Its `head_sha` is whatever the suite ran against, often a
    commit you have already replaced. **Resolve the head from the API at use
    time, never from the record** — an event, a check-in prompt, a PR body, a
    handoff or a relay message, including a SHA you wrote yourself
    (`global.md` → *Async Operations*). The measurements:
    `docs/standards/pr-mechanics.md` → *Stale SHAs in wakes and records*.
  - **Read the inline comments** (`pull_request_read` → `get_review_comments`).
    `get_reviews` cannot tell a clean `COMMENTED` review from an actionable one.
  - **Check EVERY unresolved thread, not just this round's.** An all-clear
    covers only the round it reviews; it never re-raises threads left open by an
    earlier one, so a clean verdict can sit above unaddressed findings on the
    same head. Findings arrive as review THREADS while the issue comments show
    nothing — judging from comments alone reads an unreviewed PR as clean.
  - **Unreadable reviews do not clear the gate** — that call is GraphQL and fails
    when the pool is empty. Wait or surface; never fall back to the label, which
    is REST and stays readable at exactly the moment the correct check is
    blocked. Where the repo's ruleset requires conversation resolution the server
    refuses that merge for you (→ *Conditional Auto-Merge on Green*) — a backstop
    against the fall-back, never a licence to stop looking: it is not on in every
    repo, and it says nothing about the Codex verdict.
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
    from that shared weekly pool, and every trigger the next bullet names is a
    request. Verify locally, open the PR once, and reserve `@codex review` for a fix you
    genuinely want re-read. Check which trigger the account is on first: under
    "On every push" every commit spends a review, and the setting is
    account-level. The measurement: `docs/standards/pr-mechanics.md` → *Review metering*.
  - **Request a review after pushing a fix**; Codex responds on open,
    ready-for-review and `@codex review`, not on a push. Un-drafting leaves no
    comment to carry a 👀, so silence is indistinguishable from a missed trigger.
  - **Ready-for-review fires SOMETIMES, at a rate that differs by repo — learn
    yours, don't assume.** Default to waiting ~10 minutes, then request
    explicitly, **once only**. After **two consecutive un-drafts draw nothing in
    a repo, stop waiting there** and request as soon as CI is green.
  - **Re-test that judgement, or it never unsticks.** While in the no-wait
    state, **take the full wait again every ~5th PR in that repo**, and
    immediately after any change to the account's Codex settings. One firing
    returns the repo to the default; two consecutive misses re-enter no-wait.
    Rates and reasoning: `docs/standards/pr-mechanics.md` → *Review triggers*.
  - Do not generalise either way: where the trigger works, a reflex explicit
    request is a duplicate, and its metered cost (above) lands on every other repo.
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
gates hold — CI green on the head SHA; a **clean** current-head Codex verdict per
the gate above (a response naming the head is not a verdict, since a review with
live findings names it too), or the reaction ladder's attestation, or any state
the *unreachable-review test* admits, recorded on the PR;
no `codex-flagged` label — request a pass to clear it, or, on a state that test
admits, remove it with the observable the last-resort rule requires. ⚠️ These two
are separate gates and the ladder clears only the first. Where no `codex-flagged`
label is present, the ladder is the whole gate and the merge proceeds unattended. Where one
from an earlier flagged round IS present, a reaction-only round leaves it, and the
label rule escalates rather than removing it, so that PR is not mergeable without
the owner; no unresolved review
threads; diff limited to the
intended files — squash-merge WITHOUT
asking, then follow the update-pages flow (watch the Pages build for the merged
SHA to a terminal state and confirm the live site serves it). This covers every
diff class, including Supabase record files and workflow config: the prior
hold-for-approval list is SUPERSEDED — asking the owner permission to merge is
now a directive violation, not caution. Always report the merge result;
reporting is not asking.

**One of those gates has a mechanism where the repo provides one.** Where the
default-branch ruleset ticks *Require conversation resolution before merging*
(`MAINTAIN-REPO-USER-INSTRUCTIONS.md` → *Branch Protection*), GitHub refuses the
merge while any review thread is unresolved — every unresolved thread, not just
the current round's — with no model in the loop. That closes the failure this
gate kept producing: the thread read is GraphQL and fails exactly when the pool
is empty, while the `codex-flagged` label is REST and stays readable at that same
moment, so the cheap wrong path was always available precisely when the correct
one was not. Read it as a backstop, never a delegation:
- **Do not assume it is on.** An agent cannot set a repo rule and usually cannot
  read one. Until you have seen this refusal in THIS repo, the thread gate is
  still yours to check by hand — a rule you assumed into existence protects
  nothing.
- **The other gates stay agent-checked.** CI green on the head SHA, the Codex
  verdict, the `codex-flagged` label and the diff's file list have no server-side
  rule behind them, and this one says nothing about any of them.
- **A merge refused as blocked with everything else green is this rule firing**,
  not a transient error and not a broken repo: go resolve the threads. Do not
  retry the merge.
- **It converts a bad merge into a stalled PR, deliberately.** Resolving a thread
  is GraphQL too, so a GraphQL-exhausted session can neither read nor resolve
  them — wait out the rolling hour, or hand it to the owner's browser
  (→ *GitHub API Quota Economy*). A stalled PR is the failure this standard
  prefers.

Two stops survive, neither a permission ask:
1. **Secrets, tokens, PINs, or personal data anywhere in the diff** — the PR is
   defective: scrub first, never merge as-is.
2. **Merge authority covers requested or standing-scope changes only** —
   invented scope needs approval for the CHANGE, after which the merge again
   needs none.

Applying changes to the live database still follows `data.md` → *Reversible-by-Design* and each project's escalation rules — that governs the
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
Three GitHub repo settings make the merge rules above work end-to-end. Agents
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

3. **Require conversation resolution before merging** — `Settings → Rules →
   Rulesets →` the default-branch ruleset `→ Require a pull request before
   merging → Require conversation resolution before merging`. This is the only
   mechanism the *no unresolved review threads* gate has; without it the gate is
   one GraphQL call an agent must remember to make, and that call fails exactly
   when the quota is out. If it is off, warn once with that path. Detection is
   usually unavailable: `GET /repos/{owner}/{repo}/rules/branches/{branch}`
   exposes it where `gh api` works, and in remote sessions it returns *"GitHub
   access is not enabled for this session"* (measured 2026-08-26). Absent a
   reading, do not report either way — check the threads yourself and treat a
   blocked merge with every other gate green as the rule being present.

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
  - **Polling is asking for something that would have arrived anyway.** A
    check-in armed for an outcome that COULD end with no wake path is not
    polling, and this ban does not reach it. Phrased that way on purpose:
    whether a run actually emits one is knowable only once it is terminal. See
    *PR Lifecycle* on dispatched PR-branch runs, where seven verified failure
    modes mean the comment may never come.

    The test is not "is this a PR?", and it is not **"will THIS outcome produce a
    wake?"** either — that one needs the run to be terminal, which is the thing
    you are still waiting for. Ask instead **"could this run end in a way that
    emits no wake?"**, evaluated over every conclusion still possible
    (`global.md` → *Async Operations*, item 2). Any run can be cancelled and a
    cancelled run emits no PR wake, so for an in-flight CI run the answer is
    essentially always yes: arm, and drop it when the outcome is terminal.

    Ask it per outcome, not per session: a session already subscribed to a PR
    will be woken by that PR while a Pages deploy it is also waiting on finishes
    unobserved, so "will anything wake me" answers yes and hides the gap.
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
