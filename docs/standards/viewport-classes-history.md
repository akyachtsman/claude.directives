# Viewport classes — history and evidence

Reference: read on demand, binds nothing on its own. The rule is `test.md` →
*UI coverage gates*, the fifth gate (*Three viewport classes, declared in the
runner's project list*); where the two read differently, `test.md` wins. What
follows is the evidence behind each part of that rule — the measurements, the
designs that were built and withdrawn, and the review rounds that shaped it —
moved verbatim from that bullet on 2026-10-08 so the directive carries the rule
and this file carries the reasons.

## Why the config is imported, why both flags, and what the report adds

That gate works in two stages, and both are needed. It IMPORTS the config, so
Node expands `...devices[…]` and the declared widths are read rather than
pattern-matched — a static read does not work and is not worth retrying, three
attempts produced twelve findings. That half runs before the suite and answers
what is DECLARED — and it writes that reading to a `--declared` mapping, which
the post-run invocation passes back. **Both flags, every time: `--report`
without `--declared` is refused (exit 22).** A verdict rests on two independent
observations — the widths declared before the run, and a fresh import after —
and a single import taken after the run is one observation wearing the shape of
two, so a config that changes what it declares during the run certifies itself
(measured: 390/390/390 before, 1280/900/390 after, exit 0 for all three bands).
Then, after the run, it is invoked again with
`--report <playwright json>` and reads the run's own report: a band is covered
only when a project declared at that width has a NON-SKIPPED result — a test
the run scheduled under it. That is not the same as one that ran: a hook
failing before the test body starts still produces a result, which is why the
verdict is named SCHEDULED and why proving the stronger thing is #348.
Since #348 the same line also prints a per-class disposition: **RENDERED**
where a project declaring that class has a result carrying the kit's
`rendered-viewport` witness at a width inside the class — a test *body* started
with the page that wide — and **SCHEDULED-only** for the rest. It never changes
the exit code, so a suite that predates the witness passes as before.

## Why the report is read, not predicted or listed

Predicting discovery from the config was tried for eight rounds and
produced twenty findings, every one a rule correct for its example and wrong
one step out: a `.gitignore` under `testDir`, a per-project `respectGitIgnore`,
a symlinked `testDir`, a reporter excluding every test, a `shard` set only when
a credential is present. Each is now caught without the gate knowing the
mechanism exists.

A listing (`playwright test --list`) was the first design and was measured out.
It is not the run: it announces itself in `process.argv`, it loads with
`filterOnly:false` so a stray `test.only` over-counts, it skips `globalSetup`,
and it carries no disposition at all — a reporter calling `testRun.skip()` on
every test lists a full inventory. Don't reintroduce it.

Reading the report also changed what the gate refuses: a selection key that
narrows nothing — `testIgnore: []`, `grep: /(?:)/`,
`shard: {current:1,total:1}` — no longer trips anything; the gate used to refuse
those on presence because it could not tell.

## Why the verdict is SCHEDULED, and how RENDERED was earned

**The verdict is SCHEDULED, and the word is chosen carefully.** A Playwright
report names the PROJECT that owned each result and carries no viewport, so it
establishes that a test was *scheduled in a project declaring* a width — not
that a page was ever that wide, and not even that the test body ran, since a
hook failing first still leaves a non-skipped result. The gate says exactly
that and no more.

Three mechanisms for the stronger claim were built and withdrawn across #347
rounds 5-7: a `viewport-override` marker, a fixture recording the viewport at
test teardown, and one recording it at navigation. Three variants of a single
finding defeated all three — a `beforeAll` that throws, a `beforeEach` that
throws, and a `beforeEach` that navigates *then* throws — each producing
evidence for a test whose body never ran. Every fix was right for the variant
that motivated it and wrong one step out, which is the same pattern that made
config-prediction unworkable in the first place. Proving a page rendered needs
a signal tied to the test body starting, and only the body itself gives one.
The kit's `renderWitness` fixture yields a function and records nothing at
setup; each scenario body CALLS `renderWitness();` as its first statement, and
that call records `page.viewportSize()` as the witness. Only code inside the
test callback can make the call, so a witness proves the callback was entered
with the page at that width. Requesting the fixture proves nothing: #348 first
recorded at setup, and a sibling fixture set up after it that throws leaves a
witness for a body Playwright never invoked (Codex, #384 round 1) — so a test
that requests it but never calls it stays SCHEDULED-only. It does not see a
`setViewportSize()` later in the body; keep it non-`auto`, and a hook or
fixture that calls it forges it (#349). Request it and call it first in any
test you write.

## DRIFT, not FORGERY

**What this gate catches is DRIFT, not FORGERY, and that boundary is stated
rather than defended.** The evidence it reads — the JSON report, and the
project list it imports — is produced by processes the config runs in, and
there is no authenticated channel out of a process you do not control. A
config's own exit handler can replace the report after the reporter has
written it; a corrupted array primitive can put a forged row among the declared
ones. Both were reproduced (#347 round 11). Six rounds of hardening moved the
exit path, the timeout, the kill signal, the verdict file and the band
arithmetic out of the config's reach, and every one of those closed a way to
subvert code the gate OWNS — neither of these is that. They are the config
lying about itself, in the only evidence that exists about it.

So: a config that narrows silently is what this gate exists for and what it
catches — a shard, a `.gitignore`, a filter, a device spread overwriting a
literal, a project quietly deleted. A config written to deceive it defeats it,
as it would defeat any check that reads a run through the run's own output.
Do not read a green SCHEDULED verdict as a security property. Tracked as
directives#349; reopen it only with a mechanism, since every candidate so far
either lives inside the same process or is an enumeration.

## Why the declaration is checked twice

**The declaration is checked twice, and the two must agree.** The pre-run pass
writes the widths it read; the post-run pass imports the config again and
compares. Where they differ the gate reports CANNOT CHECK (exit 21) rather than
a verdict, because the widths it would band by are not the ones the run used.
The verdict, when they agree, is still computed from the PRE-RUN reading.

⚠️ **This makes post-run importability a prerequisite, which it was not
before.** A suite that leaves the config unable to load — a deleted fixture, a
marker a test writes, a `globalTeardown` — now refuses even though its widths
never changed. That is a real cost and the opposite direction from what
`--declared` originally bought. It is kept because the alternative, falling back
to the carried mapping when the second import fails, would certify without
corroboration *and* be the way to evade the check.

This exists because the gate creates the difference itself: the `--declared`
sidecar does not exist when the pre-run pass imports your config and does exist
when Playwright imports it, so a config that reads the filesystem can answer
the two differently. Agreement proves the config answered **consistently**, not
that it answered **honestly** — a config that lies the same way twice is
believed, which is directives#349's family.

## The override routes

**A test that sets its own viewport must still say so — by EITHER route.**
Two things replace the project's viewport, and the rule named only one of them
until directives#347 round 31:
- `setViewportSize()` inside the test body.
- `test.use({ viewport })` at file or `describe` scope — the fixture form.
  Measured on 1.62.1, again on 1.63.0 (2026-10-06) and on 1.64.0 (2026-10-08): a spec carrying it ran at 390px in the laptop, tablet
  AND phone projects, and the JSON report carried **no annotation at all** —
  neither per-test nor per-result. Playwright does not mark it, so nothing
  downstream can infer it.
- `base.extend({ viewport })` — a fixture EXTENSION replacing the built-in
  option, and any other route that replaces it. Measured the same way and with
  the same result: 390px in all three projects, empty annotation arrays, exit 0
  certifying every band.

The list is deliberately open-ended. Round 31 of directives#347 named
`setViewportSize()` and `test.use()`; round 32 found `test.extend()` the next
hour, because the rule was written as an enumeration of routes and Playwright
has more of them than an enumeration can hold. **The test to apply is the
property, not the list: if a test can end up at a width its project did not
declare, it must carry the marker.**

Either way that test runs at the width IT chose in *every* project. Push
`{ type: 'viewport-override' }` onto `test.info().annotations` in any such test
and the gate stops counting the result; the kit's S4 (the 390px overflow check)
carries it. Skip it and a run selecting only viewport-overriding tests
certifies every band.

This is the marker rule doing the work the verdict cannot. The gate's verdict
is **SCHEDULED** — a non-skipped result in a project *declaring* that width —
and it says so; it has never established that a page was rendered at it. The
RENDERED disposition (directives#348) records the width a test body STARTED
at, so it misses a later `setViewportSize()` as well. The marker is how an
author states the one thing the report does not carry, so a rule that names
only half the ways to override it leaves the other half silent.

## The report path

The `outputFile` itself need not match `report-path`: the composite exports
`PLAYWRIGHT_JSON_OUTPUT_FILE` set to the validated path, and that variable
takes precedence over the configured `outputFile` (measured on 1.62.1, 1.63.0 and 1.64.0 — with
it set, the configured file is not written at all). The composite pins it for
the opposite reason too: a job that already exported that variable used to
redirect the report away from the path the gate reads, failing an otherwise
valid run. Note the precedence runs one way only — the variable redirects a
json reporter, it does not add one, so declaring the reporter stays on you.

## One spec set, one viewport source

**One spec set, one viewport source.** This kit ships a single suite —
`tests/app.spec.js` under `playwright.config.js` — and runs it against two
targets: the bundled local server in `qa.yml`, and the live URL in
`qa-live.yml` / `qa-response.yml`. Both targets inherit the SAME `projects`
list, and exactly one test in the kit sets a viewport of its own. So the
`projects` list is the only thing deciding what widths this app is ever
rendered at, and there is no second tier to compensate: drift it to phone-only
and nothing anywhere renders the app at laptop width. A project that wants a
laptop-width safety net independent of that list has to build one — an
offline/stubbed harness tier with explicit per-test viewports, which this kit
does not provide. `apfp.claude` built exactly that, which is why its own drift
stayed catchable; a project running the standard kit alone has no such margin.
