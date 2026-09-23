# Hosting Mechanics

The reasoning, mechanism, measurements and history behind the rules in
`directives/global.md` → *Hosting & Deployment*. The rules themselves are stated there, and that is the
copy every project reads at session start; this file is read on demand, when a
rule needs its evidence or its edge cases. The passages here were moved out of
that section (#299); positional references ("above", "below") were replaced with
explicit section references, since their targets moved.

## Choosing the Pages source

*Supports:* the rule that how Pages is sourced is a security decision, chosen by whether the repository holds any file that must not be public.

⚠️ **HOW Pages is sourced is a SECURITY decision, not a convenience one, and
the rule in `directives/global.md` → *Hosting & Deployment* read "branch-source … the push *is* the deploy" until 2026-08-26.**
Branch-source publishes the **whole repository** at the public URL.

⚠️ **The test is "must not be public", NOT "is internal-facing".** A file can be
internal in purpose and harmless in public. `claude.directives` is the worked
example: it is a public repo, its `CLAUDE.md`, `learnings.jsonl`, `EXPORTS.json`
and `docs/internal/` all serve 200 from its Pages URL (verified 2026-08-26), and
that exposes nothing `github.com` does not already serve to anyone. It stays on
branch-source, correctly. Reading the trigger as "has internal-looking files"
would send every repo with a `CLAUDE.md` to do pointless work and make the rule
read as wrong to the first person who checks.

## Deny-list, not allow-list

*Supports:* the rule to publish a deny-list-filtered copy and verify the live URL after publishing.

⚠️ **Deny-list, never allow-list.** An allow-list means every new app file needs a
manifest edit to ship, and its failure mode is a missing file — annoying but
visible. A deny-list fails the other way only when someone adds a new *internal*
path and forgets it, which is why the deploy must **verify the live URL after
publishing**: assert the app serves 200, each named internal path serves 404, and
any internal-looking-but-public asset still serves 200. Fail the run otherwise.
Verify with `curl`, not by reading the config.

## Monitoring after a switch to Actions-source

*Supports:* the rule to ADD a `workflow_run` trigger to `pages-monitor.yml`, and not to repoint `pages-retry.yml` except under W3's idempotent exception.

⚠️ **Switching to Actions-source SILENTLY DISABLES this repo's Pages monitoring,
and that is not optional to handle.** `pages-monitor.yml` and `pages-retry.yml`
both trigger on `page_build`, which fires only for **branch-source** builds
(`docs/standards/automations.md` → *Automation 4 — Pages Monitor Workflow*, and
*Automation 4b — Pages Deploy Retry*). An Actions-source repo
keeps the workflow files and gets no runs from them — monitoring that looks
present and reports nothing, which is worse than none. **ADD to the monitor; do
NOT repoint the retry.** `docs/standards/automations.md` → *Watcher Rules*
(W2, W3) carries the table and the reasoning: `pages-monitor.yml` takes a
`workflow_run` trigger naming your own deploy workflow (its file header ships the
snippet), while `pages-retry.yml` must not **by default**, because it re-runs the
**whole** watched run and would replay your entire build — an Actions-source
project builds retry into its own deploy workflow instead (*Automation 4b*). W3
carries one narrow exception and this rule does not override it: a project MAY
extend the retry anyway **if its deploy is genuinely idempotent** — no build, no
compile, no tests, same commit in and same tree out — provided it records in its
own `CLAUDE.md` both that reasoning **and a revisit trigger**, the condition that
ends the exception (*"if the deploy ever gains a build or test stage, move the
retry inside it"*). The reasoning describes the deploy today; without a stated
end condition the exception outlives the change that invalidates it.

## Keep the existing arms

*Supports:* the rule to ADD the deploy workflow's name alongside `page_build:` and `pages-build-deployment`, never to replace them.

⚠️ **ADD the `workflow_run` trigger (→ *Monitoring after a switch to Actions-source*) — do NOT replace the existing arm — and the reason is the
visibility flip (`directives/global.md` → *Hosting & Deployment*).** `pages-monitor.yml`
keeps `page_build:` and `qa-live.yml`
keeps `pages-build-deployment`; the new name goes **alongside**. Those arms are
what see the **legacy managed build**, which a visibility flip can fire *even
while Actions-source is configured*, unfiltered, and which can finish later and
republish the whole tree. Drop them and that rogue build runs with **nothing
watching it at all** — no gate, no monitor, only the after-the-fact forensics of
looking for a `pages build and deployment` run. The templates are written additively for exactly this reason
(`qa-live.yml`: *"+ your Actions deploy workflow's `name:`"*); a reader who
"repoints" instead of adding silently removes the only thing that runs when the
legacy build does.

## Arms are not detection

*Supports:* the rule to declare forbidden paths in `.github/pages-deny.txt` so the monitor asserts each serves 404.

⚠️ **BUT KEEPING THE ARM IS NOT THE SAME AS DETECTING THE EXPOSURE, AND DO NOT
READ IT THAT WAY.** By default `pages-monitor.yml` asserts two things — the build
did not error, and the live URL returns **200** — and `qa-live.yml` runs the
ordinary UI suite. **A rogue build that republishes the unfiltered tree serves
the app as 200 and passes both.** The internal paths are exposed and every
watcher is green. So the arm buys you a run at the right moment and nothing
more; **what turns that run into detection is a forbidden-path assertion** — the
same 200/404 deny-list check the deploy workflow carries, evaluated by the
watcher, against paths the template cannot know and the project must declare.
**Declare them in `.github/pages-deny.txt`** (one path per line) and
`pages-monitor.yml` asserts each serves 404 on every run. Without that file, a
visibility-flip exposure is still caught only by someone looking.

## Observers versus re-runners

*Supports:* the rule that a watcher that only observes may name both Pages sources, and one that re-runs what it watches must not.

⚠️ **The asymmetry between the monitor and the retry is about RE-RUNNING, not
about Pages.** A watcher that only **observes** — a monitor, a live gate — can
name both sources at no cost, and should. A watcher that **re-runs** what it
watches can not: a second name is a second thing it may replay. That is the whole
of W2 vs W3, and it generalises to any watcher you add later.

## Why an unrepointed retry must go

*Supports:* the rule to delete an unrepointed `pages-retry.yml` and its `REQUIRED` entry, or repoint it under W3's exception.

⚠️ **And whichever way you go, DELETE an unrepointed `pages-retry.yml` — the
reason is worse than dead coverage.** In ordinary operation it is inert: it
watches `pages-build-deployment`, a GitHub-managed name that still **resolves**
after the switch (so the workflow-ref guard stays green) while nothing triggers
it. **But on the visibility-flip path (`directives/global.md` → *Hosting & Deployment*), that name is exactly what fires** —
and a retry left installed will faithfully **re-run the rogue unfiltered
deployment** it was never meant to see, turning a one-off exposure into a
retried one. So this is not the monitor case one file over: an unrepointed
monitor merely fails to notice, while an unrepointed retry participates. Delete
it and its `REQUIRED` entry, or repoint it under the exception in → *Monitoring after a switch to Actions-source*.

## Verification versus the monitor

*Supports:* the rule that the post-publish verification is mandatory and is not a substitute for the monitor.

⚠️ **The post-publish verification is mandatory and is NOT a substitute for the
monitor — they catch different failures, and swapping one for the other loses
coverage silently.** Put the 200/404 assertions **inside the deploy workflow**, where
a bad filter fails the run that produced it. But a deploy that **fails before
reaching its own assertions** reports nothing about the live site: the steps that
would have checked it never ran, so as far as verification is concerned the
failure is **silent** — and only an external watcher turns that silence into a
tracking issue. A `workflow_run` watcher on `types: [completed]` fires on a
**failed** run as well as a successful one and reads the conclusion, which is why
**adding** that trigger restores precisely the coverage the source switch
removed. (Adding — never repointing; → *Keep the existing arms*.)

## The bound on completed-run watchers

*Supports:* the rule that a deploy which hangs and never completes is covered by neither the in-run assertions nor the watcher.

⚠️ **Know the bound on that watcher (→ *Verification versus the monitor*), and do not overclaim it.** `types: [completed]`
means the watcher sees runs that reach a **terminal state**. A deploy that hangs
and never completes emits no `workflow_run` event either, so it is covered by
**neither** the in-run assertions nor the watcher — catching that needs timeout
or staleness monitoring, which is a third thing and not what either of these is.
*(Raised by `apfp.claude`, whose Pages incident prompted the sourcing rules in `directives/global.md` → *Hosting & Deployment*: the
earlier wording there made the verification the monitor's replacement, which would
have retired the only watcher that can see a deploy that **failed before
reaching its own assertions**. A deploy that literally never finishes is covered
by neither instrument — see the bound stated in this section.)*

## Where these rules came from

*Supports:* every Pages-sourcing rule in `directives/global.md` → *Hosting & Deployment*.

*Written from an incident: on 2026-08-18 a repo's internal docs were public for
~18 minutes on exactly this path. The rule as it stood would have sent a session
doing routine directive alignment to reproduce it — which is the worst property a
rule can have, since following it correctly was the failure.*
