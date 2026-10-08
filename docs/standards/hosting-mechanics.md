# Hosting Mechanics

The reasoning, mechanism, measurements and history behind the rules in
`directives/global.md` → *Hosting & Deployment*. The rules themselves are stated there, and that is the
copy every project reads at session start; this file is read on demand, when a
rule needs its evidence or its edge cases, and does not restate them — each
section names the rule it supports. The passages here were moved out of
that section (#299); positional references ("above", "below") were replaced with
explicit section references, since their targets moved.

## Choosing the Pages source

*Supports:* the rule that how Pages is sourced is a security decision, chosen by whether the repository holds any file that must not be public.

That rule read "branch-source … the push *is* the deploy" until 2026-08-26 —
and branch-source publishes the whole repository, not just the app.

Why the test is "must not be public" and not "is internal-facing":
`claude.directives` is the worked example. It is a public repo, its `CLAUDE.md`,
`learnings.jsonl`, `EXPORTS.json` and `docs/internal/` all serve 200 from its
Pages URL (verified 2026-08-26), and that exposes nothing `github.com` does not
already serve to anyone. It stays on branch-source, correctly. Reading the
trigger as "has internal-looking files" would send every repo with a `CLAUDE.md`
to do pointless work and make the rule read as wrong to the first person who
checks.

## Deny-list, not allow-list

*Supports:* the rule to publish a deny-list-filtered copy and verify the live URL after publishing.

An allow-list means every new app file needs a manifest edit to ship, and its
failure mode is a missing file — annoying but visible. A deny-list fails the
other way only when someone adds a new *internal* path and forgets it, which is
why the rule pairs it with the post-publish 200/404 check against the live URL:
that check is what catches the forgotten path.

## Monitoring after a switch to Actions-source

*Supports:* the rule to ADD a `workflow_run` trigger to `pages-monitor.yml`, and not to repoint `pages-retry.yml` except under W3's idempotent exception.

Why the switch disables monitoring silently: `page_build` and the managed
`pages-build-deployment` fire only for branch-source builds, so an Actions-source
repo keeps both workflow files and gets no runs from them — monitoring that looks
present and reports nothing, which is worse than none. The exception is the
visibility flip, which can still run `pages-build-deployment`, and with it the
retry; that case is what W3 exists for (`docs/standards/automations.md` →
*Automation 4 — Pages Monitor Workflow*, and *Automation 4b — Pages Deploy
Retry*; the table and its reasoning are in *Watcher Rules*, W2 and W3).

Why the retry is not repointed by default: it re-runs the **whole** watched run,
so a second name would replay an Actions-source project's entire build. Why W3's
idempotent exception needs a **revisit trigger** as well as its reasoning: the
reasoning describes the deploy today, and without a stated end condition the
exception outlives the change that invalidates it.

## Keep the existing arms

*Supports:* the rule to ADD the deploy workflow's name alongside `page_build:` and `pages-build-deployment`, never to replace them.

The reason is the visibility flip (`directives/global.md` → *Hosting &
Deployment*). Those arms are what see the **legacy managed build**, which a
visibility flip can fire *even while Actions-source is configured*, unfiltered,
and which can finish later and republish the whole tree. Drop them and that
rogue build runs with **nothing watching it at all** — no gate, no monitor, only
the after-the-fact forensics of looking for a `pages build and deployment` run.
The templates are written additively for exactly this reason (`qa-live.yml`:
*"+ your Actions deploy workflow's `name:`"*); a reader who "repoints" instead of
adding silently removes the only thing that runs when the legacy build does.

## Arms are not detection

*Supports:* the rule to declare forbidden paths in `.github/pages-deny.txt` so the monitor asserts each serves 404.

By default `pages-monitor.yml` asserts two things — the build did not error, and
the live URL returns **200** — and `qa-live.yml` runs the ordinary UI suite.
**A rogue build that republishes the unfiltered tree serves the app as 200 and
passes both.** The internal paths are exposed and every watcher is green. So the
arm buys a run at the right moment and nothing more; what turns that run into
detection is a forbidden-path assertion — the same 200/404 deny-list check the
deploy workflow carries, evaluated by the watcher, against paths the template
cannot know and the project must declare.

## Observers versus re-runners

*Supports:* the rule that a watcher that only observes may name both Pages sources, and one that re-runs what it watches must not.

The asymmetry between the monitor and the retry is about RE-RUNNING, not about
Pages. A watcher that only observes — a monitor, a live gate — names a second
source at no cost; one that re-runs what it watches would replay it. That is the
whole of W2 vs W3.

## Why an unrepointed retry must go

*Supports:* the rule to delete an unrepointed `pages-retry.yml` and its `REQUIRED` entry, or repoint it under W3's exception.

The reason is worse than dead coverage. In ordinary operation the retry is
inert: it watches `pages-build-deployment`, a GitHub-managed name that still
**resolves** after the switch (so the workflow-ref guard stays green) while
nothing triggers it. **But on the visibility-flip path
(`directives/global.md` → *Hosting & Deployment*), that name is exactly what
fires** — and a retry left installed will faithfully **re-run the rogue
unfiltered deployment** it was never meant to see, turning a one-off exposure
into a retried one. So this is not the monitor case one file over:
an unrepointed monitor merely fails to notice, while an unrepointed retry participates.

## Verification versus the monitor

*Supports:* the rule that the post-publish verification is mandatory and is not a substitute for the monitor.

They catch different failures, and swapping one for the other loses coverage
silently. A deploy that **fails before reaching its own assertions** reports
nothing about the live site: the steps that would have checked it never ran, so
as far as verification is concerned the failure is **silent** — and only an
external watcher turns that silence into a tracking issue. A `workflow_run`
watcher on `types: [completed]` fires on a **failed** run as well as a successful
one and reads the conclusion, which is why **adding** that trigger restores
precisely the coverage the source switch removed. (Adding — never repointing;
→ *Keep the existing arms*.)

## The bound on completed-run watchers

*Supports:* the rule that a deploy which hangs and never completes is covered by neither the in-run assertions nor the watcher.

`types: [completed]` means the watcher sees runs that reach a **terminal
state**. A deploy that hangs and never completes emits no `workflow_run` event
either, so neither instrument sees it — catching that needs timeout or staleness
monitoring, which is a third thing.
*(Raised by `apfp.claude`, whose Pages incident prompted the sourcing rules in `directives/global.md` → *Hosting & Deployment*: the
earlier wording there made the verification the monitor's replacement, which would
have retired the only watcher that can see a deploy that **failed before
reaching its own assertions**.)*

## Where these rules came from

*Supports:* every Pages-sourcing rule in `directives/global.md` → *Hosting & Deployment*.

*Written from an incident: on 2026-08-18 a repo's internal docs were public for
~18 minutes on exactly this path. The rule as it stood would have sent a session
doing routine directive alignment to reproduce it — which is the worst property a
rule can have, since following it correctly was the failure.*
