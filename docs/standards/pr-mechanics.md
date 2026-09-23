# PR Mechanics

The reasoning, mechanism, measurements and history behind the rules in
`git.md` → *PR Lifecycle*. The rules themselves are stated there, and that is the
copy every project reads at session start; this file is read on demand, when a
rule needs its evidence or its edge cases. Everything below was moved here
verbatim from that section (#299), so "above" and "below" inside a passage keep
the meaning they had there.

## Wakes that never arrive

*Supports:* the rule to arm a check-in for any awaited outcome that can end without emitting a wake, and drop it when that outcome is terminal.

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

## Exits from the verdict gate

*Supports:* every exit from the Codex verdict gate stays reachable, and none clears the gate silently.

⚠️ **Any state the _unreachable-review test_ above admits sits OUTSIDE that
framing, and it must not be read as closing them** — a gate that cannot be
cleared is not stricter than one that can, it just moves the failure from a bad
merge to a stalled PR. This gate takes the test, not a copy of its instances:
an enumeration here would disagree with the test the first time a fourth state
appears, which is the disagreement this wording exists to end. The instances
known today:
the **reaction ladder** below, which applies precisely when NOTHING from Codex
names HEAD, so a current-head response is not required on it;
**_unavailable_**, a usage-limit reply that is never clean and still unblocks
the merge once stated on the PR and still current; and **outage** — something
terminal and observable, never elapsed silence. ⚠️ The ladder clears this gate
and NOT the `codex-flagged` label. Where no label is present — a first pass
that came back clean as a reaction, so `codex-monitor` never added one — that
is the whole gate and the merge proceeds. Where a label from an earlier flagged
round is still there, the ladder does not take it off: the rule above does, and
on a reaction-only round it escalates instead.
None of them is a way past a verdict you can READ:
the ladder requires that nothing from Codex **names** the current head — a bare
👍 names nothing, which is why it is the ladder's TRIGGER and never its bar —
*unavailable* requires that no review can be obtained at all, and outage
requires that the request could not be MADE OR ACCEPTED — never that one was
accepted and stayed quiet, which is the same silence the rule above rejects.
None ever
bypasses an adverse verdict that exists, and none clears the gate silently.

## The inline-reply form and the label

*Supports:* a clean inline reply clears the verdict gate but not the `codex-flagged` label.

⚠️ The inline-reply form clears the GATE but not the LABEL — `codex-monitor`
does not watch that event. **Request another review pass rather than removing
`codex-flagged` by hand**, per the last-resort rule above: a clean verdict in
the COMMENT form names the head and the monitor clears the label itself
(observed 2026-08-27 on #333 at `63bed51`), and hand removal is reserved for
the states that rule's test admits.

## Reading reactions

*Supports:* a bare 👍 never clears the gate from the embedded summary.

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

## The reaction ladder

*Supports:* the clean-round escape hatch, used only when nothing from Codex names the current head.

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

## Codex delivery forms

*Supports:* a clean verdict can arrive as a comment, an inline reply or a reaction, and `codex-monitor` acts only on the comment.

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
  blocker in place with nothing to remove it automatically. **Request another
  pass so the verdict lands as a comment the monitor acts on** — an inline
  reply clears the verdict gate but is not evidence that a comment cannot
  arrive, so it is not an opening on its own. Hand removal is governed solely
  by the last-resort rule above. **Do not read the stuck label as unaddressed
  concerns; read the PR.**

## Stale SHAs in wakes and records

*Supports:* a `check_suite.completed` wake is a prompt to look, never evidence about the current head.

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

## Review metering

*Supports:* Codex reviews are metered per request, not per push.

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

## Review triggers

*Supports:* ready-for-review fires sometimes; learn the repo's rate and re-test it.

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
