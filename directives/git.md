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

  **The exception is any awaited outcome that can end WITHOUT emitting a wake,
  and the rule for it is: arm the check-in, then drop it when THAT OUTCOME is
  observed terminal — not when any wake arrives.** A session subscribed to a PR
  is woken by unrelated activity on it constantly; treating those as the signal
  drops the fallback while the run is still going, and if it is then cancelled
  nothing reports it. Re-check and re-arm until terminal
  (`global.md` → *Async Operations*, item 2). This is not a licence to ignore wakes — `ci-notify` usually does
  comment. It is a refusal to *depend* on one where the outcome may produce none.

  Instances found so far — treat this as evidence that the class is broad, **not
  as a list to check against.** Three rounds of review added one each; a fourth
  is not knowable in advance, which is why the rule is the question above and not
  this list:
  - **a dispatched run on a PR branch** — seven ways below;
  - **any run that is CANCELLED**, ordinary `pull_request` CI included.
    `ci-notify` is gated on `conclusion == 'success'`, so a cancellation emits
    **no PR wake**. Nor does the `check_suite.completed` wake cover it: that
    event's own delivery note says *"Cancelled suites, suites with no runs, this
    App's own suites and legacy commit statuses are not covered"* — so the one
    mechanism that would otherwise prompt a look at a terminal run is excluded
    for exactly this conclusion. Do not reason from "a suite completed, so a wake
    fires"; read what the wake excludes. Be precise about what that does and does not mean:
    `ci-monitor.yml` may classify it (`cancelled_unsuperseded`) and file the
    `ci-failure` issue. How much it covers is genuinely intricate — its
    `workflow_run:` list is read from the default branch and names three
    workflows in the template and one here, while its `workflow_dispatch` scan
    ignores that list and sweeps a lookback window — **one `per_page=100` page
    per status, unpaginated, filtered by time afterwards**, so in a busy repo an
    older qualifying run falls off the page. A page-bounded backstop, not
    complete coverage. **Read the file
    before asserting coverage**; four successive attempts to summarise it here
    were each wrong in a different direction, which is why this text no longer
    tries. What matters for THIS rule is unchanged either way: **none of it
    reaches the session waiting on the PR.** Arm the check-in.
  - **an ordinary successful run whose PR cannot be resolved unambiguously.**
    Neither dispatched nor cancelled: since `ba1f7ba` both `ci-notify` lookups
    require **exactly one** match, so two open PRs sharing a head commit make the
    SHA step ambiguous. That alone is not silence: the branch-plus-owner fallback
    still runs, and where those PRs sit on *distinct* branches it uniquely
    resolves the one matching `workflow_run.head_branch` and comments it. Silence
    needs **both** steps ambiguous or empty — same head AND same branch. (Before
    `ba1f7ba` the SHA lookup took
    the first match and one PR got a wrong-PR green — do not go looking for that
    comment; the shipped notifier no longer emits it.) A `repository_dispatch`
    run is a live case of this rather than a separate one — it carries the
    DEFAULT-BRANCH SHA, and if the default branch is the head of exactly one open
    PR (a `main` → `release` promotion, say) that unrelated PR is commented while
    the session that
    triggered the dispatch waits.

  That refusal is earned, not cautious. Seven ways the dispatched-run wake fails
  to arrive, each verified in the workflow's own source:
  1. the run's workflow is not in `ci-notify.yml`'s `workflows:` list — it watches
     three **by name**;
  2. `ci-notify.yml` is not yet live on the **default branch**, so it cannot wake
     the PR that installs it (its header says so);
  3. the list is *read* from the default branch, so a PR that renames a watched
     workflow and updates the watcher together still fires the OLD name;
  4. `repository_dispatch` runs carry the **default-branch SHA**. Usually that
     matches no open PR and the run exits silent — a documented limitation
     (`docs/standards/automations.md` → *Known limitation*). When the default
     branch IS an open PR's head, it is worse than silent: that unrelated PR is
     commented and the waiting session still gets nothing;
  5. **both** lookups fetch at most 100 and refuse a full page, since uniqueness
     cannot be proven from a truncated set — but they are scoped differently and
     the boundary is **per query, not repo-wide**. The SHA lookup lists open PRs
     unfiltered, so **100 or more** open PRs silences *it* — the guard is
     `length >= 100`, and a full page is refused even when it happens to be
     exhaustive, because a full page cannot prove it was not truncated. The
     branch fallback filters by `--head`, so its boundary is **100 or more PRs
     sharing that branch name**. A repo
     with 500 open PRs on distinct branches still gets its wake from the
     fallback. (Until `ba1f7ba` the SHA lookup had no `--limit` at all and saw
     only `gh pr list`'s default 30 — worse than silent, since a truncated page
     can make an ambiguous SHA look unique.);
  6. **both** lookups require **exactly one** match and stay silent otherwise —
     no PR, or more than one. Two open PRs can share a head commit (the same tip
     proposed against `main` and against a release branch), and two same-owner
     PRs can share a branch name; commenting green on the wrong one is worse than
     no wake, since it names a base the run never tested. Silence needs **both
     steps ambiguous or empty** — a shared head commit alone is not enough, since
     the branch fallback still runs and resolves PRs on distinct branches;
  7. the job is gated on `conclusion == 'success'`, so a **cancelled** run emits
     nothing — the case above, which reaches ordinary PR CI too.

  Do not attempt to enumerate your way to a "covered" test. That list grew from
  one item to seven under review, and the eighth is not knowable in advance.
  Compare the costs instead: a check-in armed unnecessarily costs **one wasted
  wake**; a check-in withheld on a false promise of coverage costs an agent
  **waiting forever** for a signal that cannot arrive. Those are not close.

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
  all-clear **comment** that names the current head SHA — the only form it can
  act on, and the form that cleared #293. A clean rerun can equally be a 👍
  reaction or an inline review-thread reply; the monitor sees neither, and then
  manual removal with a rationale is required. Which form arrives is not
  predictable: check before assuming either. A label still present means concerns not yet
  re-reviewed, a clean round delivered in a form the monitor cannot see, or an
  all-clear that failed the SHA match; read the PR before overriding by hand.
- **Neither a missing label nor an empty review list is proof.** Before merging,
  clear the gate against the current head. **On the normal path — some
  SHA-bearing Codex response names HEAD — every check below is NECESSARY and
  only the clean-verdict test is sufficient**: a check that passes narrows what
  you are looking at; it never opens the gate on its own.
  ⚠️ **Two documented exits sit OUTSIDE that framing and it must not be read as
  closing them** — a gate that cannot be cleared is not stricter than one that
  can, it just moves the failure from a bad merge to a stalled PR:
  the **reaction ladder** below, which applies precisely when NOTHING from Codex
  names HEAD, so a current-head response is not required on it; and
  **_unavailable_**, a usage-limit reply that is never clean and still unblocks
  the merge once stated on the PR. Neither is a way past a verdict you can READ:
  the ladder requires that nothing from Codex **names** the current head — a bare
  👍 names nothing, which is why it is the ladder's TRIGGER and never its bar —
  and *unavailable* requires that no review can be obtained at all. Neither ever
  bypasses an adverse verdict that exists, and neither clears the gate silently.
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
    does not watch that event. **Request another review pass rather than removing
    `codex-flagged` by hand** (→ `global.md` → *"Proceed" — the Standing
    Directive*, item 4). A clean verdict in the COMMENT form names the head and
    the monitor clears the label itself; observed 2026-08-27 on #333 at
    `63bed51`. Removing the label asserts the concern is resolved, which is the
    author claiming what the reviewer should say.
  - **Check the author — it validates the SOURCE, not the outcome.** Wording and
    a current SHA are both forgeable, so a response that is not the Codex bot's
    own cannot clear the gate. Authorship is necessary and never sufficient: a
    Codex-authored review carrying live findings passes this check and still
    leaves the gate shut, per the rung above.
  - **Match by SHA, not by clock.** Reviews, clean comments and inline replies all
    name the commit — compare it to HEAD.
  - **A bare 👍 never clears the gate FROM THE EMBEDDED SUMMARY.** `issue_read` →
    `get` returns reactions as counts only (`{"total_count":1,"+1":1}`) — no
    author, no timestamp.

    **The summary is not useless, but it is decisive only in the NEGATIVE and only
    in second place.** The counts are per emoji, so `"+1": 0` means no 👍 exists —
    which distinguishes *not yet run* from *ran clean and I cannot attribute it*,
    and those call for opposite actions.

    ⚠️ **Check for a SHA-bearing response at the current head FIRST.** A clean
    verdict delivered as a comment or an inline reply may leave no reaction at
    all, so `"+1": 0` is equally consistent with *already cleared* — reading it as
    "keep waiting" without that check can strand a PR whose gate is open. Only
    once **nothing from Codex names HEAD — no review, no comment, no inline
    review-thread reply** — does `"+1": 0` mean genuinely pending.

    Measured on this repo 2026-08-23 — #293 `{"eyes":1,"+1":0}` and #294
    `{"total_count":0}`, both with no response at their heads, both genuinely
    pending.

    A 👀 is also not a 👍. Codex reacts 👀 to acknowledge a request it has
    started; that is *received*, not *clean*. Two reactions, two meanings, and
    only the per-emoji counts tell them apart — a `total_count` of 1 says
    nothing.

    ⚠️ Read reactions with `issue_read` → **`get`**, passing the PR number.
    `pull_request_read` → `get` returns no `reactions` field, and `issue_read` →
    `get_labels` fails outright on a PR number (*"Could not resolve to an
    Issue"*) while `get` accepts the same number — verified 2026-08-23. Read that way, a 👍 left by an earlier clean round
    survives every later push and is indistinguishable from a fresh one, and a
    human's is indistinguishable from Codex's. "Accept it when the review request
    postdates the push" does not work there: there is nothing to correlate with
    the request, and treating it as admissible merges an **unreviewed head**.

    Be precise about WHY, because the reason is what the next reader reuses: the
    data is missing from *that view*, not from GitHub. `GET /repos/{owner}/{repo}/
    issues/{number}/reactions` — the reaction LIST, not the embedded summary —
    returns `user` and `created_at` per reaction. Where a session can reach it,
    that is a real clean-round path — with two preconditions, because timestamps
    establish ORDER and order is not attribution.

    **First, the ordering.** "Created after the push" is not enough: a review of
    the PREVIOUS head can still be in flight when a new commit lands, and its
    clean reaction is then created *after* that push while describing the old SHA
    — the same out-of-order landing this file already warns about for reviews. So
    require **push → review request → Codex-authored reaction**, each strictly
    after the last.

    **Second, and this is the one that actually bites: no earlier request may be
    outstanding.** The ordering above is *necessary and not sufficient*. If
    request A (on the old head) is still running when you push and send request
    B, A's reaction lands after B and satisfies every timestamp comparison while
    describing A's commit. A reaction carries no SHA, so nothing in it
    distinguishes the two. Rung 1 is therefore available **only when every earlier
    request already has a SHA-bearing response on record** — then a reaction after
    the current request can only belong to the current request. If any earlier
    request is unanswered, you cannot tell, and this rung does not apply.

    Note what that implies: an unanswered earlier request is *exactly* what a
    previous clean round looks like, so on a PR that has already run clean once,
    rung 1 is usually unavailable and rungs 2–3 are the real path. Compounding
    it, a GitHub user holds at most one reaction of a given type per subject, so a
    second clean verdict from Codex adds **no new reaction at all** — the only 👍
    present is the first one, with its original timestamp. (That follows from the
    documented reaction model rather than from measurement here; treat it as the
    conservative reading until someone observes otherwise.)

    Verify reachability rather than assuming it; from a Claude Code remote session
    on 2026-08-23 the list was not reachable — direct REST to `api.github.com`
    returned *"GitHub access is not enabled for this session"*, WebFetch returned
    403, and the MCP surface exposes only the summary.

  - **The clean-round escape hatch — for when the reaction really is all there
    is.** ⚠️ **Check the COMMENTS and the REVIEW THREADS first.** A clean verdict
    can arrive as a plain comment naming the reviewed commit — the form that
    merged #293, and the only one that also clears `codex-flagged` — or as an
    inline reply in a review thread, which clears the gate but leaves the label.
    This ladder applies **only when no SHA-bearing Codex response
    names the CURRENT head** — no review whose reviewed commit matches HEAD, no
    Codex comment naming it, and no Codex inline reply naming it. Earlier rounds'
    reviews, comments and replies are
    irrelevant — they are history, and history is what made the previous wording
    unsatisfiable. Entering the ladder while a SHA-bearing all-clear names the
    current head means attesting your way past a gate that had already opened.

    ⚠️ **Scope that to the current head, not to the lists.** "Both lists empty"
    was the previous wording here and it is wrong: after any flagged round the
    review list is permanently non-empty, and the comment list holds your own
    `@codex review` request — so a later reaction-only clean rerun could never
    satisfy it, and the hatch was unreachable in exactly the case it exists for.
    A test phrased over a whole history cannot work here: the lists accumulate,
    the head does not.

    In that genuinely reaction-only case the problem is real: no SHA-bearing
    response will arrive, and each retry spends the shared weekly allowance to
    produce another reaction. A gate with no reachable exit is not a gate — so
    work down this ladder and stop at the first rung that is available:
    1. **Reaction list** (verifiable, and often unavailable) — author +
       `created_at`, the push → request → reaction ordering, AND no earlier
       request left unanswered. All three, per the paragraph above.
    2. **Ask, don't re-review** (verifiable where Codex answers) — a direct
       `@codex` question naming the SHA is answered as a *comment*, which carries
       an author and a timestamp. Cheaper than a review round. **Untested as of
       2026-08-23** — record the outcome the first time it is used.
    3. **Attest, never infer** (not verifiable) — merge on the reaction only by
       stating on the PR: the head SHA, when the review was requested, the
       reaction count NOW, and explicitly that the reaction is unattributable on
       this tool surface. **State the count from before the request only if you
       captured one, and say plainly that you did not if you didn't.** A missing
       baseline weakens the record; it never blocks this rung. Requiring a
       snapshot nothing told you to take would make the last reachable rung
       unreachable in exactly the case it exists for — the failure this ladder
       was written to prevent. Cheap prevention: read `issue_read` → `get` once
       BEFORE each `@codex review`, so the before-count exists when you need it.
       This is the same shape as the *documented-unavailable* path below: the
       protection worth keeping is not that a reaction is provable, but that
       **nobody clears this gate silently**.
    A gate that cannot be cleared is not stricter than one that can — it just
    moves the failure from a bad merge to a stalled PR and a drained quota.
  - **A CLEAN verdict leaves NO REVIEW — but it may still leave a comment.**
    Codex's boilerplate says *"If Codex has suggestions, it will comment;
    otherwise it will react with 👍,"* and that reads as *clean ⇒ reaction only*.
    **Do not rely on it.** Observed in this repo on 2026-08-23, a clean verdict
    arrived **twice as a plain comment** naming the reviewed commit — *"Codex
    Review: Didn't find any major issues"* at `ecf9a05` and again at `b64ff09` —
    and the second cleared `codex-flagged` automatically, exactly as the monitor
    intends. `claude.trading` separately observed the reaction-only form.

    **Three forms occur — a comment, an inline reply, a reaction — and which one
    you get is not predictable from here.** So: an empty REVIEW list means nothing
    on its own. Check the comments AND the review threads before concluding
    anything, since a SHA-bearing CLEAN verdict in either clears the gate normally;
    a review carrying live findings is a response, not a clearance.
    Only when **nothing from Codex names the
    current head** — not "when the comment list is empty", which after one round
    it never is — does the reaction become the discriminator, readable via
    `issue_read` → `get`
    (**`pull_request_read` → `get` returns no `reactions` field at all**, verified
    2026-08-23), and only then does the ladder below apply.

    A session watching only the review list waits forever either way, and the
    natural escalation is to spend an `@codex review` from the weekly pool, which
    buys nothing because Codex already ran. `claude.trading` lost ~30 minutes to
    exactly this.
    ⚠️ **Codex has FOUR delivery modes and `codex-monitor` watches two.** It fires
    on `pull_request_review` and `issue_comment` only, so a 👍 reaction clears
    nothing — and neither does an **inline review comment**, which is how Codex
    replies inside a review thread (`pull_request_review_comment`, an event the
    workflow does not watch; verified against its `on:` block 2026-08-23). Both
    leave the label sitting there looking like an open concern. The clear path
    requires an all-clear **comment** matching `"Codex Review: Didn't find any
    major issues"`. So a clean rerun delivered in either unwatched form leaves the
    blocker in place with nothing to remove it automatically: take the label off
    by hand, with the one-line dismissal rationale the rule above requires. **Do
    not read the stuck label as unaddressed concerns; read the PR.**
  - **A `check_suite.completed` wake is a PROMPT TO LOOK, never evidence about the
    current head.** Its `head_sha` is whatever the suite ran against, and on a PR
    under active push that is routinely a commit you have already replaced.
    Measured in `claude.prop`, 2026-08-23: **five** such events across two PRs,
    every one naming a superseded head, and four would have merged a stale commit
    if read as clearance — including one Codex had just shown was still racing.
    Read the run's own `head_sha` against the PR's current head before acting;
    the event tells you to check, not what the answer is. This is the specific
    delivery mechanism that most often tempts you past the rule above, and the
    general case is in `global.md` → *Async Operations*: **any recorded SHA is
    stale from the moment it is written**, and a stale one does not error — it
    resolves perfectly and answers about the wrong commit.
    The event is only the loudest instance. A check-in prompt, a PR body, a
    handoff and a relay message all hand you the same kind of record, and one
    line covers all of them: **resolve the head from the API at use time, never
    from the record.** That includes a SHA you yourself wrote into this PR's body
    ten minutes ago — re-read the PR before quoting it as the current head.
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
gates hold — CI green on the head SHA; a **clean** current-head Codex verdict per
the gate above (a response naming the head is not a verdict, since a review with
live findings names it too), or one of that gate's two documented exits noted on
the PR: the reaction ladder's attestation, or an *unavailable* usage-limit reply;
no `codex-flagged` label; no unresolved review threads; diff limited to the
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
