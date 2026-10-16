# PR Mechanics

The reasoning, mechanism, measurements and history behind the rules in
`git.md` → *PR Lifecycle*. The rules themselves are stated there, and that is the
copy every project reads at session start; this file is read on demand, when a
rule needs its evidence or its edge cases, and does not restate them — each
section names the rule it supports. The passages here were moved out of
that section (#299); positional references ("above", "below") were replaced with
explicit section references, since their targets moved.

## Wakes that never arrive

*Supports:* the rule to arm a check-in for any awaited outcome that can end without emitting a wake, and drop it when that outcome is terminal.

Instances found so far — treat them as evidence that the class is broad, **not
as a list to check against.** The next one is not knowable in advance, which is
why the rule is the question — could this outcome end without emitting a wake? (`git.md` → *PR Lifecycle*) — and not
this list:
- **any run that is CANCELLED**, ordinary `pull_request` CI included. The
  `check_suite.completed` wake's own delivery note says *"Cancelled suites,
  suites with no runs, this App's own suites and legacy commit statuses are not
  covered"* — so the one mechanism that would otherwise prompt a look at a
  terminal run is excluded for exactly this conclusion. Do not reason from "a
  suite completed, so a wake fires"; read what the wake excludes.
- **a delivery that is lost** — the event fires and never reaches the session;
  the one `send_later` check-in is the safety net for it.

Do not attempt to enumerate your way to a "covered" test. Compare the costs
instead: a check-in armed unnecessarily costs **one wasted
wake**; a check-in withheld on a false promise of coverage costs an agent
**waiting forever** for a signal that cannot arrive. Those are not close.

## Exits from the verdict gate

*Supports:* every exit from the Codex verdict gate stays reachable, and none clears the gate silently.

The exits themselves, and what each needs before it clears the gate, are stated
in `git.md` → *PR Lifecycle*. Two things about them are not:

Why the gate takes the *unreachable-review test* rather than a copy of its
instances: an enumeration here would disagree with the test the first time a
fourth state appears, which is the disagreement this wording exists to end.

Why none of them is a way past a verdict you can READ: the ladder requires that
nothing from Codex **names** the current head — a bare 👍 names nothing, which is
why it is the ladder's TRIGGER and never its bar — *unavailable* requires that no
review can be obtained at all, and outage requires that the request could not be
MADE OR ACCEPTED — never that one was accepted and stayed quiet, which is the
same silence the unreachable-review test (`git.md` → *PR Lifecycle*) rejects.

## Reading reactions

*Supports:* a bare 👍 never clears the gate from the embedded summary.

- **What the embedded summary carries.** `issue_read` → `get` returns reactions
  as counts only (`{"total_count":1,"+1":1}`) — no author, no timestamp.

  **The summary is not useless, but it is decisive only in the NEGATIVE and only
  in second place.** The counts are per emoji, so `"+1": 0` means no 👍 exists —
  which distinguishes *not yet run* from *ran clean and I cannot attribute it*,
  and those call for opposite actions. It comes second because a clean verdict
  delivered as a comment or an inline reply may leave no reaction at all, so
  `"+1": 0` is equally consistent with *already cleared* — reading it as "keep
  waiting" without first checking for a SHA-bearing response can strand a PR
  whose gate is open.

  Measured on this repo 2026-08-23 — #293 `{"eyes":1,"+1":0}` and #294
  `{"total_count":0}`, both with no response at their heads, both genuinely
  pending.

  Codex reacts 👀 to acknowledge a request it has started. Two reactions, two
  meanings, and only the per-emoji counts tell them apart — a `total_count` of 1
  says nothing.

  ⚠️ Read reactions with `issue_read` → **`get`**, passing the PR number.
  `pull_request_read` → `get` returns no `reactions` field, and `issue_read` →
  `get_labels` fails outright on a PR number (*"Could not resolve to an
  Issue"*) while `get` accepts the same number — verified 2026-10-09. Read that way, a 👍 left by an earlier clean round
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
  outstanding.** The push → request → reaction ordering is *necessary and not sufficient*. If
  request A (on the old head) is still running when you push and send request
  B, A's reaction lands after B and satisfies every timestamp comparison while
  describing A's commit. A reaction carries no SHA, so nothing in it
  distinguishes the two. Rung 1 is therefore available **only when every earlier
  request already has a SHA-bearing response on record** — then a reaction after
  the current request can only belong to the current request. If any earlier
  request is unanswered, you cannot tell, and this rung does not apply.

  Note what that implies: an unanswered earlier request is *exactly* what a
  previous clean round answered by REACTION alone looks like, so on a PR that
  has already run clean that way, rung 1 is usually unavailable and rungs 2–3
  are the real path. A clean round that came as a SHA-bearing comment or inline
  reply is different: it answered its request and left no 👍, so a later 👍 can
  still satisfy rung 1 when the ordering conditions hold. Compounding the
  reaction-only case, a GitHub user holds at most one reaction of a given type per subject, so a
  second clean verdict from Codex adds **no new reaction at all** — the only 👍
  present is the first one, with its original timestamp. (That follows from the
  documented reaction model rather than from measurement here; treat it as the
  conservative reading until someone observes otherwise.)

  Verify reachability rather than assuming it. From a Claude Code remote session
  on 2026-08-23 the list was not reachable — direct REST to `api.github.com`
  returned *"GitHub access is not enabled for this session"*, WebFetch returned
  403, and the MCP surface exposes only the summary. On 2026-10-08 a web
  session's `gh api` (its GitHub proxy) returned the list, `user` and
  `created_at` included — so it can change either way between sessions.

## The reaction ladder

*Supports:* the clean-round escape hatch, used only when nothing from Codex names the current head.

- **Why the comments and review threads come first.** A clean verdict can
  arrive as a plain comment naming the reviewed commit — the form that merged
  #293 — or as an inline reply in a review thread. Earlier rounds'
  reviews, comments and replies are irrelevant — they are history, and history
  is what made the previous wording unsatisfiable. Entering the ladder while a
  SHA-bearing all-clear names the current head means attesting your way past a
  gate that had already opened.

  ⚠️ **Why the test is scoped to the current head, not to the lists.** "Both
  lists empty" was the previous wording here and it is wrong: after any flagged
  round the review list is permanently non-empty, and the comment list holds
  your own `@codex review` request — so a later reaction-only clean rerun could
  never satisfy it, and the hatch was unreachable in exactly the case it exists
  for. A test phrased over a whole history cannot work here: the lists
  accumulate, the head does not.

  In that genuinely reaction-only case the problem is real: no SHA-bearing
  response will arrive, and each retry spends the shared weekly allowance to
  produce another reaction. A gate with no reachable exit is not a gate. What
  each rung adds beyond its statement in `git.md` → *PR Lifecycle*:
  1. **Reaction list** — verifiable, and often unavailable; its three
     conditions and why each is needed are in → *Reading reactions*.
  2. **Ask, don't re-review** — verifiable where Codex answers, and cheaper than
     a review round, since the answer is a *comment* carrying an author and a
     timestamp. **Untested as of 2026-08-23** — record the outcome the first
     time it is used.
  3. **Attest, never infer** — not verifiable. **State the count from before the
     request only if you captured one, and say plainly that you did not if you
     didn't.** Requiring a snapshot nothing told you to take would make the last
     reachable rung unreachable in exactly the case it exists for — the failure
     this ladder was written to prevent. Cheap prevention: read `issue_read` →
     `get` once BEFORE each `@codex review`, so the before-count exists when you
     need it. This is the same shape as the *documented-unavailable* path
     (`git.md` → *PR Lifecycle*): the protection worth keeping is not that a
     reaction is provable, but that **nobody clears this gate silently**.
  A gate that cannot be cleared is not stricter than one that can — it just
  moves the failure from a bad merge to a stalled PR and a drained quota.

## Codex delivery forms

*Supports:* a clean verdict can arrive as a comment, an inline reply or a reaction.

- **Observed forms.** Codex's boilerplate says *"If Codex has suggestions, it
  will comment; otherwise it will react with 👍,"* and that reads as *clean ⇒
  reaction only*. **Do not rely on it.** Observed in this repo on 2026-08-23, a
  clean verdict arrived **twice as a plain comment** naming the reviewed commit —
  *"Codex Review: Didn't find any major issues"* at `ecf9a05` and again at
  `b64ff09`. `claude.trading` separately observed the reaction-only form.
  Since 2026-10-15 that comment opens with a hidden `<!-- codex-review-receipt:v1 -->`
  line before the verdict (#457).
  Which of the three forms (comment, inline reply, reaction) you get is not
  predictable from here.

  A session watching only the review list waits forever either way, and the
  natural escalation is to spend an `@codex review` from the weekly pool, which
  buys nothing because Codex already ran. `claude.trading` lost ~30 minutes to
  exactly this.

## Stale SHAs in wakes and records

*Supports:* a `check_suite.completed` wake is a prompt to look, never evidence about the current head.

Measured in `claude.prop`, 2026-08-23: **five** such events across two PRs,
every one naming a superseded head, and four would have merged a stale commit
if read as clearance — including one Codex had just shown was still racing. On a
PR under active push, a suite's `head_sha` is routinely a commit already
replaced. This is the specific delivery mechanism that most often tempts a
session past the rule to clear the gate against the current head (`git.md` →
*PR Lifecycle*); the general case is in `global.md` → *Async Operations*: **any
recorded SHA is stale from the moment it is written**, and a stale one does not
error — it resolves perfectly and answers about the wrong commit.

## Review metering

*Supports:* Codex reviews are metered per request, not per push.

The expensive habit is re-requesting, not committing: measured 2026-08-17,
thirteen reviews on one PR inside 100 minutes, one per commit, from a draft
toggled ready over and over while the account's trigger was "On PR open".
Whether that alone emptied the week is not knowable — the pool is shared
across four products — but it was a material share of it, spent re-asking for
a verdict on work the local gate should have settled first. The account-level
"On every push" setting is the one case where every commit does spend a review,
and it is invisible from the repo.

## Review triggers

*Supports:* ready-for-review fires sometimes; learn the repo's rate and re-test it.

- **The rates.** Measured 2026-08-22/23, same account: in this repo 5 of 7
  un-drafts drew a review in ~3–4 minutes; a sibling project repo reported 1 of
  4, and ~5.7 minutes when it did fire. An explicit `@codex review` answered
  within ~2.5 minutes in both. Treat these as rates on small samples, not as an
  on/off setting — nothing here establishes *why* they differ.
- **Why the judgement is re-tested.** The trigger is intermittent, not binary —
  two misses in a row happen in a repo where it mostly works, and once you stop
  waiting you can no longer observe it recovering, so a transient fault or a
  fixed setting would go on costing a duplicate on every PR.
