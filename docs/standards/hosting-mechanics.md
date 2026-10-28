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

*Supports:* the rule to ADD the deploy workflow's name to `qa-live.yml`'s `workflow_run` trigger.

Why the switch disables monitoring silently: the managed `pages-build-deployment`
fires only for branch-source builds, so an Actions-source repo whose `qa-live.yml`
names only it gets no runs from it — monitoring that looks present and reports
nothing, which is worse than none (`docs/standards/automations.md` → *Watcher Rules*, W2).

## Keep the existing arms

*Supports:* the rule to ADD the deploy workflow's name alongside `pages-build-deployment`, never to replace it.

The reason is the visibility flip (`directives/global.md` → *Hosting &
Deployment*). That arm is what sees the **legacy managed build**, which a
visibility flip can fire *even while Actions-source is configured*, unfiltered,
and which can finish later and republish the whole tree. Drop it and that
rogue build runs with **nothing watching it at all** — no gate, only
the after-the-fact forensics of looking for a `pages build and deployment` run.
The templates are written additively for exactly this reason (`qa-live.yml`:
*"+ 'Pages Deploy' (pages-deploy.yml), or your own deploy's `name:`, on
Actions-source"*); a reader who "repoints" instead of
adding silently removes the only thing that runs when the legacy build does.

## Arms are not detection

*Supports:* the rule that keeping the arm is not detecting the exposure.

`qa-live.yml`'s UI suite is the ordinary one. **A rogue build that republishes
the unfiltered tree serves the app as 200 and passes it.** So the arm buys a run
at the right moment, and the detection is a second job in that run:
the job named "Deny-listed paths serve 404" in `shared-qa-live.yml` reads the project's
`.github/pages-deny.txt` and probes each entry, plus up to three tracked files
under an entry that is a directory, twice and 30s apart, failing on anything
but 404. It runs after every watched build, so it sees the legacy build a
visibility flip fires; `pages-deploy.yml`'s verify job still makes the full
per-file check after its own deploy. Until 2026-10-27 the check lived only in
the deploy, and a flip had to be checked by hand (#460 step 1 leftover).
What it cannot see is a flip's build that never completes, or an arm that was
dropped (*Keep the existing arms*, above).

## The bound on completed-run watchers

*Supports:* the rule that a deploy which hangs and never completes is covered by neither the in-run assertions nor the watcher.

`types: [completed]` means the watcher sees runs that reach a **terminal
state**. A deploy that hangs and never completes emits no `workflow_run` event
either, so neither instrument sees it — catching that needs timeout or staleness
monitoring, which is a third thing.

## Where these rules came from

*Supports:* every Pages-sourcing rule in `directives/global.md` → *Hosting & Deployment*.

*Written from an incident: on 2026-08-18 a repo's internal docs were public for
~18 minutes on exactly this path. The rule as it stood would have sent a session
doing routine directive alignment to reproduce it — which is the worst property a
rule can have, since following it correctly was the failure.*
