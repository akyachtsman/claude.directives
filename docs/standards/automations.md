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

⚠️ **"Add" is literal, and the existing arm is the load-bearing one.** Keep
`page_build:` on the monitor and `pages-build-deployment` on `qa-live`; the new
name goes alongside. Those arms watch the **legacy managed build**, which
`global.md` → *Hosting & Deployment* documents as still firing on a **repo
visibility flip even while Actions-source is configured** — unfiltered, and able
to finish later and republish the whole tree over a filtered copy. A reader who
*replaces* rather than adds keeps a green-looking watcher and deletes the only
thing that observes that republish live. This is why the row says "add" rather
than "point it at your deploy": the wording is doing work.

⚠️ **The monitor/retry split is about RE-RUNNING, not about Pages** — state it
this way and the table stops needing to be memorised. A watcher that only
**observes** (monitor, live gate) may name both sources at no cost, because a
second name is only a second thing it looks at. A watcher that **re-runs** what
it watches may not, because a second name is a second thing it may replay. Apply
that test to any watcher added later, rather than copying this table's rows.

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

⚠️ **That record must name a REVISIT TRIGGER — the condition that ends the
exception — not just the reasoning that opened it.** The reasoning is a
statement about the deploy *today*; the exception survives the change that
invalidates it unless something says what that change is. An exception with no
stated end condition is indistinguishable from one nobody thought about, which
is the failure this rule is actually guarding against.

⚠️ **AND WHEN THE TRIGGER FIRES, DELETE THE WATCHER — DO NOT NARROW IT.**
Narrowing leaves a file that passes every check and watches a name that can no
longer fire.

⚠️ **STATE THIS RULE IN BOTH BRANCHES, EVERYWHERE IT APPEARS. "Branch-source
only" is a one-sided sentence and the exception lives in the half it drops.**
Every surface that installs, describes or inventories `pages-retry.yml` must
carry both arms:

> **branch-source** → install it, with its `REQUIRED` entry.
> **Actions-source** → delete it and drop the `REQUIRED` entry; **or** repoint it
> under the exception above, **updating** the `REQUIRED` entry to the project's
> own deploy name rather than dropping it.

This shape is not a style preference. Writing the default and trailing the
exception as a clause failed **three times inside one pull request** (#317) —
`global.md`, `new-repo.md`, then `dev-pipeline.md` and this refresh row — each
time producing an absolute prohibition that overrode a documented exception, and
each time caught by review rather than by the author. A two-branch statement
makes an omitted exception a **visibly empty branch** instead of a missing
sentence nobody can see.

The worked example is a near-miss, kept in that form because the clean version
teaches less. `apfp.claude` runs this exception deliberately and wrote the
revisit trigger this rule asked for — *"if `pages.yml` ever gains a build or
test stage, move the retry INSIDE it and drop `Pages` from `pages-retry.yml` and
its REQUIRED entry."* Followed literally, that leaves `pages-retry.yml` watching
**only `pages-build-deployment`**: a GitHub-managed name that still resolves, is
allow-listed with a justification, passes every static check, and under
Actions-source never fires again. **The exemplary revisit trigger manufactured
the exact artifact the rule above forbids.** It should say *delete
`pages-retry.yml` and its REQUIRED entry*, not *drop a name from it*.

Note what that shares with the defect in `global.md` that occasioned this
section — "repoint" where the scaffolding said "add". Neither verb is careless;
both are locally sensible, and both leave a watcher that satisfies its guard and
observes nothing. The common cause is that **our tooling can check whether a
name RESOLVES and nothing checks whether a workflow can still FIRE** — the
limitation `workflow-ref-guard`'s own scope warning states. Any rule written in
the language of names inherits that blind spot, so a rule about watchers must
say what happens to the FILE, not only to the names inside it.

⚠️ **After a source switch, an unrepointed `pages-retry.yml` is DEAD, not
dormant — DELETE it, or repoint it under the exception above.** The template
watches `pages-build-deployment` by name. That name still *resolves* after the
switch (GitHub manages it, so W1 and `workflow-ref-guard` both stay green),
which is why nothing warns you.

⚠️ **The reason is NOT that it goes quiet — that would only be dead weight.**
Day to day it is inert. But a **repo visibility flip fires the legacy managed
build even while Actions-source is configured** (`global.md` → *Hosting &
Deployment*), publishing the **unfiltered tree** — and that build is exactly what
this watcher names. A retry left installed will faithfully **re-run a rogue
unfiltered deploy** on failure, turning a one-off exposure into a retried one.
So this is **not** the monitor case one file over: an unrepointed monitor fails
to notice, an unrepointed retry **participates**.

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
  does. All three were observed in this repo on 2026-08-23 — the comment form
  cleared #293 automatically — and **which one arrives is not predictable, so
  check the PR's comments AND its review threads before concluding the monitor
  has failed.** Checking only the comments misses the inline-reply form entirely:
  that verdict never enters the comment list, so the search comes back empty and
  reads as "still pending" on a head Codex has in fact cleared. Where no `codex-flagged` label is present, the ladder
  is the whole gate and the merge proceeds unattended. None of this triage applies there. Where a label
  from an earlier flagged round IS present and the clear
  arrives in an unwatched form, **request another pass** so the
  verdict lands as a comment the monitor acts on; hand removal is reserved for
  the states `git.md` → *PR Lifecycle*'s *unreachable-review test* admits, with the
  evidence that rule requires. Waiting on the monitor without doing either blocks the PR
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
  no tests) and records in its own CLAUDE.md both the reasoning **and a revisit
  trigger** ending the exception. When that trigger fires the watcher is
  **deleted, not narrowed** (*Watcher Rules* → W3).
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
  A reader treating that as a gate signal is reading another PR's result, so each
  lookup takes a match only when one candidate survives. Note that an ambiguous
  SHA is not itself silence: the branch fallback still runs and resolves PRs on
  distinct branches. Silence needs **both steps ambiguous or empty**, and then
  the waiting session's check-in is what covers it.
- ⚠️ **Unique is not the same as correct, so a unique match is not a guaranteed
  wake for YOUR session.** Uniqueness only stops it choosing arbitrarily among
  duplicates. A `repository_dispatch` run carries the DEFAULT-BRANCH SHA, so when
  that branch is the head of exactly one open PR (a `main` → `release`
  promotion), the comment lands on that unrelated PR — the coverage condition
  above is satisfied and the dispatching session still gets nothing. Arm the
  check-in whenever the run's SHA is not your PR's head (`git.md` →
  *PR Lifecycle*).
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

## Automation 6 — Cross-Session Messaging (session-to-session, manual)

One session can message another directly: `create_trigger` with the target's
`persistent_session_id`, then `fire_trigger`, then `delete_trigger`. `ListAgents`
shows nothing (cloud sessions are not local peers) and `SendMessage` fails, so
this is the channel. It is written down here because it was not: the procedure
ran the fleet for a day while existing only inside chat messages, and the version
in circulation had the defect below.

**Send POKE-ONLY. Never give the trigger a `cron_expression` or a `run_once_at`.**
This one is **contractual, not observed** — the `create_trigger` schema says so
on `cron_expression`: *"Mutually exclusive with `run_once_at`. Omit both for a
poke-only Routine that never fires on its own."* And `run_once_at`'s own text
confirms the other half: *"After the one-shot **fires** the Routine disables
itself"* — it fires first, then disables. So a poke-only trigger cannot deliver
late by construction, and a missed `delete_trigger` is inert.

Give it a `run_once_at` and a missed delete becomes a **time bomb**: the
scheduled copy lands hours later carrying nothing that distinguishes it from a
live instruction. Under poke-only it cannot, which makes the delete tidiness
rather than load-bearing — the only version of the recipe that is safe by
construction instead of by discipline.

⚠️ **Note the two rules in this section carry DIFFERENT epistemic weight, and
filing them alike would misstate both.** Poke-only is a documented guarantee: it
will not quietly stop being true. The delivery correlation below is six samples
with no mechanism. Understating the first or overstating the second is the error
to avoid; `learnings.jsonl` scores only the second, deliberately.

**A fired trigger can silently fail to deliver, and the return value says so.**
`fire_trigger` returns `session_id`. Delivered into the persistent target ⇒ that
value carries the target's id with its prefix **SWAPPED**, not appended:
`session_<id>` → `cse_<id>`. Anything else ⇒ a fresh session ran the prompt and
nobody read it.

⚠️ **Compare the id AFTER the prefix — never the whole string.** A target
`session_01ABC` returns `cse_01ABC`, **not** `cse_session_01ABC`. This line
previously said *"`cse_` + the target's id verbatim"*, which describes an append;
a session applying that literally reads every SUCCESSFUL delivery as a mismatch,
and the remedy below for a mismatch is to re-send — so following it exactly
produces an unbounded loop of duplicate pokes at a target that received the
message the first time. **That is worse than the fault the check exists to
catch**: a lost send costs one message, this costs as many as the loop runs.
Found by `claude.trading` on 2026-08-26 by following the line as written, and
confirmed against three sends whose delivery had already been established
independently.

Then **re-send on a genuine mismatch** — a fresh session cannot coincidentally
carry the target's id, so a matching suffix is conclusive.

Measured across six sends between three sessions, with independent confirmation
from both peers: every matching id was received, every non-matching one was lost
— including a message a peer confirmed never arriving. Perfectly correlated with
passing `fire_trigger`'s optional `text` parameter — sends *with* it were lost,
sends without it landed — so **omit `text`**; put everything in the trigger's own
prompt. Six samples is strong for the correlation and thin for a mechanism, and
`learnings.jsonl` records it at that confidence deliberately.

Two consequences worth stating because both were learned the hard way:
- A lost send is **lost, not delayed**. Do not wait for it to turn up.
- The receiving session runs that turn possibly **without MCP connector tools**.
  Write the prompt so local work is still possible, and do not put the caveat in
  `text` — that is what loses the message.

**Why this section exists at all, which is the part worth carrying elsewhere.**
This procedure coordinated four sessions for a day while living only inside chat
messages. No checker could see it, no refresh could deliver it — and the only
copy in circulation was the defective one. So **every recipient followed it
correctly, and correct compliance is what propagated the defect.** That is a
sharper argument for pointer-not-value than the usual staleness one: the failure
mode is not that a copy drifts, it is that a wrong copy is obeyed faithfully and
its wrongness has no way to reach anyone. Any operating procedure two sessions
depend on belongs in a file under `docs/standards/`, not in the message that
first explained it.

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
  (Automation 3 above) — never on a 👍 and never on an inline review-thread reply,
  since it watches neither event — so a label still present means concerns not yet
  re-reviewed, a clean round delivered in either unwatched form and so needing
  another pass requested, an all-clear that
  failed the SHA match, or a monitor run that has not landed yet — read the PR,
  and clear the label by requesting the pass rather than removing it; hand
  removal is the last resort `git.md` → *PR Lifecycle* bounds by its *unreachable-review test*. Apply `git.md` →
  *PR Lifecycle*'s source-review gate: match a Codex **review, comment, or inline
  review-thread reply** — all three name the commit — to HEAD by commit SHA and confirm
  the Codex bot authored it. ⚠️ That establishes a RESPONSE, not a verdict: a review
  carrying live inline findings passes both checks while reporting that the head
  FAILED, so read the review's inline comments and clear the gate only on a clean
  comment or reply, or on a review whose findings are all fixed or explicitly
  dismissed. Treat unreadable responses as uncleared. The inline-reply form clears the
  GATE but not the LABEL. **A bare 👍
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
  forbidden is clearing the gate **silently**. A clean round delivered as a reaction
  OR as an inline review-thread reply also cannot clear `codex-flagged` — the
  monitor triggers on reviews and comments, and watches neither reactions nor
  `pull_request_review_comment` — so request another pass and let the monitor
  clear it; take the label off by hand only where `git.md` → *PR
  Lifecycle*'s *unreachable-review test* admits it
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
