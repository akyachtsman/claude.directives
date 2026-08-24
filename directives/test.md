# Claude Test & QA Directives

This is the exportable directive for downstream projects. Import it into your
project's `CLAUDE.md` or agent configuration.

## Key docs — index (read on demand)

Know this index; fetch a doc when working in its area. Do **not** bulk-read
everything at session start — that burns context on material the task may never
touch.

### docs/
- `docs/standards/automations.md` — CI monitor workflow, PR lifecycle additions, escalation additions
- `docs/standards/cicd-setup.md` — canonical CI/CD install procedure (workflow templates, monitors, secrets/variables)
- `docs/standards/code-review-standard.md` — Blocking vs. non-blocking review criteria
- `docs/guides/usage-guide.md` — Agent installation, review boundaries, and .agent-reports/ organization
- `docs/standards/ci-triage.md` — Expected vs. real CI failures, workflow trigger rules

### QA/data agents — ship in the directives-toolkit plugin
Agents arrive via the `directives-toolkit` plugin (see `global.md` → *Skill
Bootstrap*) and are namespaced `directives-toolkit:*`. Nothing is fetched into
`.claude/`; the full body loads when an agent is invoked. Source:
`claude.directives/plugins/directives-toolkit/agents/`.
- `test-verifier` — independent QA verification agent (runs the suite, merge verdict)
- `pr-readiness-reviewer` — final merge gate agent
- `qa-pipeline` — full pipeline orchestrator
- `ui-tester` — Playwright browser testing agent
- `supabase` — data/backend specialist (per `data.md`)

Code review and security review are **not** toolkit agents — they come from
Anthropic-official sources, enabled in each project's `.claude/settings.json`
and installed by the environment setup script:
- Code review → `pr-review-toolkit:code-reviewer`; deep test-coverage critique →
  `pr-review-toolkit:pr-test-analyzer`
- Security review → the built-in `/security-review` skill on demand, plus the
  official `security-guidance` plugin's automatic hooks (edit/turn/commit-time)
- Quick CI status checks are done inline via `mcp__github__actions_list`; the
  always-on monitor remains `ci-monitor.yml`

### templates/ — fill-in artifacts
- `templates/CLAUDE-template.md` — project CLAUDE.md scaffold (used by `/new-repo`)
- `templates/implementation-summary-template.md` — required before invoking reviewers
- `templates/pr-checklist.md` — PR readiness checklist
- `templates/project-test-plan-template.md` — test plan structure

The test-verifier report format lives inline in its agent definition inside the
plugin; code/security review findings are written to `.agent-reports/` by the
official reviewers per qa-pipeline's adapter instructions. Workflow and
Playwright-kit installation is `docs/standards/cicd-setup.md`'s job — don't
re-derive it from the tree.

## Session start — required actions

Execute these before any task work:
1. Read `CLAUDE.md` for current project state (and any Project-Specific Test Scenarios)
2. Do not subscribe to open PRs as a session-start step — subscription is
   harness-side on open and governed by `git.md` → *PR Lifecycle*
3. Read the last run's status ONCE via `mcp__github__actions_list` to catch up on
   failures since the last session — a single catch-up read, never a poll loop
   (`git.md` → *GitHub API Quota Economy*)
4. Confirm `ci-monitor.yml`, `codex-monitor.yml`, and (for Pages projects) `pages-monitor.yml`
   are present in `.github/workflows/` — add any missing from `templates/workflows/`

## Playwright
- Always use `page.goto('./')`, never `page.goto('/')`
- Normalize `APP_URL` to end with `/` in `playwright.config.js`
- `API status: no call` is expected for a local run that cannot reach the backend;
  the auth-gated scenarios self-skip on an empty `TEST_AUTH_CREDENTIAL`. The
  `UI Tests (local server)` job itself is **blocking** — only those skipped
  scenarios are exempt, never a real Playwright failure (→ *CI triage*)
- **`waitForFunction`'s page function must be SYNCHRONOUS.** An `async` one is
  invoked exactly **once**. Playwright adopts the Promise it returns, and whatever
  that Promise settles to — `false` included — ends the wait. It never polls
  again. So the condition is evaluated at t≈0 and never actually waited *for*.
  Poll from Node instead: `expect.poll()`, or a loop over `page.evaluate`, both of
  which await.

  Measured on `playwright-core` 1.62.1. A page flag flipped to `true` at 300ms,
  2000ms budget, one character between the two rows — and identical in every
  polling mode (`raf`, default, and a fixed interval):

  | page function | outcome |
  |---|---|
  | `() => window.ok` | resolved at **307ms**, value `true` — polled, correct |
  | `async () => window.ok` | resolved at **4ms**, value `false` — one shot, wrong |

  **The `timeout` is not the broken part.** An async function awaiting 1500ms
  under a 1200ms budget does raise `TimeoutError`, at 1202ms — the bound still
  holds over that single invocation. What is missing is the *waiting*: the call
  returns a handle to `false` and the spec proceeds as though the condition held.

  That is why it survives review. It reads as a guard, it is a guard everywhere
  except in the one mode nobody tests, and a green run is exactly what it
  produces. Found in `claude.prop`'s S28, where a 15-second seed poll had been
  resolving instantly since the day it was written.
- **Poll the side of the write you are about to assert on.** A store whose
  `save()` writes a local cache synchronously and then fires an UNAWAITED remote
  upsert has two observable states, and a poll that watches the cache reports
  success while the remote still holds nothing. Any assertion that reloads in
  between is racing a write it never waited for. Poll the persisted side — read
  back what the reload will read.

  Measured in `claude.prop`, POSTs throttled to 400ms to stand in for a loaded CI
  runner:

  | observation | at |
  |---|---|
  | page cache hit 4 rows | 83ms — the account held **0** |
  | the account reached 4 rows | 492ms |

  Unthrottled the gap measures 0ms — which is the **resolution of the
  measurement, not the absence of a window**. The unawaited upsert is still
  unsettled for some interval after the synchronous cache write on an idle
  runner; load only widens it enough to observe. Do not read an unthrottled
  green as intrinsically safe: it is the same race, sampled too coarsely to see.
  That is why five weeks of local runs never found it and one shared runner did.

## Authenticated flows (auth-gated apps)
Local CI (`qa.yml`) runs Playwright against a local server that **cannot reach
the backend**, so auth-gated views (login, portal, drill-downs) are untestable
there and those scenarios self-skip on an empty `TEST_AUTH_CREDENTIAL`. The
`ui-tests` job itself stays **blocking** for everything it can reach (→ *CI
triage*); only the auth-gated scenarios are exempt, by skipping. The **canonical
mechanism for testing authenticated flows is `qa-live.yml`**: it runs Playwright
against the deployed URL and logs in with a per-project seeded test account
(`TEST_AUTH_CREDENTIAL` secret + `APP_URL` variable). Its live step is blocking —
a failure there must be fixed before work is done.
- **Why live, not local:** agent sandboxes and CI runners are commonly firewalled
  from the live backend (e.g. a Supabase `403` at the proxy), so local Playwright
  cannot render authenticated views. Seed a test account and test against the
  deploy.
- Any app with an auth gate must wire `qa-live.yml` + the seeded credential. An
  authenticated flow with no live coverage is a **coverage gap, not
  "untestable"** — and a UI change shipped without a `ui-tester` run is a
  readiness blocker (see the `pr-readiness-reviewer` gate).

## Rendered-verification gate (visual changes)

A change that alters rendered UI is not "done" until Playwright has actually
rendered the changed surface and asserted the *visible outcome* — never a proxy
(`node --check`, html-validate, boot-smoke, a DB/SQL check, or reading the
diff). Add or extend a scenario that asserts the **specific** change (the new
value, the now-visible control), not merely that the screen loads.
- **Unauthenticated surfaces** (public pages, pre-auth/login states, static
  components): run the check **locally before pushing**.
- **Auth-gated surfaces** (portals, drill-downs, anything behind login): local
  runs can't reach the backend, so the check is **`qa-live`** — do **not** report
  the change verified until qa-live's live step has **passed for it**. "Static
  checks are green" / "it will run in CI" is not verification. If the gate hasn't
  passed yet, report status as *pending visual verification*, not done.

## Assert the outcome, not the mechanism (owner ruling, 2026-08-01)
The gate above says *render it*. This one says *what to assert once you have*. A
test written from the implementation confirms the implementation.

**Name the observable outcome first, then write the assertion against it.** "The
legend opens", "no arrow crosses a box it doesn't connect", "no filename is shown
until asked for" — not "the click handler fires", "the router returns a path",
"the toggle sets a class".

Three failure shapes:
- **Driving the app the way you built it.** `page.click('.rs')` by selector hits
  an 18px handle a real hand cannot find; `mouse.down()` + `move()` never sends a
  wheel or touch event at all. Exercise the **whole input surface** — pointer,
  wheel/trackpad (`deltaX` with `deltaY` of 0 is a real gesture), touch
  (multi-pointer), keyboard — not just the one path you coded against.
- **Testing only the shipped state.** A layout check that runs on the default
  arrangement proves nothing about the arrangement a reader makes. Perturb it —
  drag, resize, collapse, filter — then re-assert. Where a feature crosses a
  browser-session boundary (auth, magic links, impersonation, tokens,
  sessionStorage, multi-tab), enumerate the **transitions**, not the landing
  state: *arrive → work → refresh → duplicate tab → exit → expiry*. Two
  individually-correct rules can leave a live gap between them.
- **Asserting a proxy.** "The handler ran" / "the class is set" / "CI is green"
  are not the outcome. If the assertion would still pass with the visible result
  wrong, it is testing the wrong thing.

Two more shapes, from data and identity rather than interaction:
- **Selecting the subject from live data.** "Pick the first X and assert its rows"
  breaks the day someone creates an empty X, and auto-skips forever if no X ever
  existed — green while covering nothing. The selection predicate must encode the
  property asserted (pick an X *with rows*), and the fixture must be **seeded, not
  skipped**: a missing fixture fails review **whatever reason the skip carries**,
  since a reason is not a fixture. Only an approved N/A is an accepted skip. CI
  cannot enforce this yet — the skips live in
  `templates/ui-tests/tests/app.spec.js`, not the `ui-suite` action, and no
  skipped-result gate exists.
- **One identity cannot see multi-identity bugs.** Anything tenant-, role- or
  user-scoped needs a scenario where two identities touch the same feature —
  a write landing under the wrong identity is indistinguishable from "not
  saving". Asserting that the surface *names* its tenant is a partial mitigation,
  not a substitute: it still passes while the write goes to the wrong place. The
  kit wires one identity only (`TEST_AUTH_CREDENTIAL` is singular throughout), so
  a project needing this scenario adds the second credential itself first.

When a human reports a defect the suite passed through, the fix is **two**
commits' worth of work: the defect, and the assertion that would have caught it.
Shipping only the first guarantees the next one in that class also ships. Name
which of the seven shapes it was — untested input modality, untested state or
transition, asserted proxy, unmodelled data, single identity, **stubbed
subject**, or **occluded control** (the last two below).
A "more tests" response that names none of them is rigor applied to the part
already covered.

## Stub the collaborators, never the subject (owner ruling, 2026-08-18)

A stub stands in for something the test does not claim to prove. The moment the
stubbed thing IS the claim, every pass is vacuous — and it fails in the worst
way available: green forever while the feature has never worked once.

The shipped incident that names this shape: the 🐛 bug-report screenshot. The
harness stubbed the capture library with a tiny canvas, proving the whole flow —
open, capture, upload, insert, degrade — while the REAL library (html2canvas
1.4.1) threw on the first `oklch()`/`color-mix()` in the app's own CSS. The
capture had **never succeeded in production**; every stubbed run passed. The
owner found it by using the feature.

The rule, with its trigger:
- **A third-party library that processes the project's own content** (its CSS,
  DOM, PDFs, images, fonts — anything the project authors and the library must
  parse) gets at least ONE harness block running the REAL library against the
  REAL content. Pin it as a devDependency and route its CDN URL to the
  node_modules copy (the `check-acroform-fill` pdf-lib pattern; now also
  `check-bug-report` + html2canvas-pro). Stub blocks remain right for flow,
  error-path, and speed — the real block is the one that catches "the library
  rejects our content".
- **The smell:** if writing the stub required assuming what the library accepts
  ("returns a canvas", "parses the page"), that assumption is a claim, and a
  claim needs a real-dependency proof. A stub that encodes the answer is the
  test grading its own homework.
- CDN-loaded libraries make this worse: no install step, no version bump in a
  lockfile, nothing in CI ever executes the real code unless a harness routes
  it in deliberately.

## Layered UI: rendered is not reachable (owner ruling, 2026-08-18)

`offsetParent` proves an element is painted. It does not prove a hand can reach
it. Overlays, menus, drawers, sticky bars and toasts sit ON TOP of controls that
still pass every render assertion — the control is visible in the DOM's opinion
and covered in the user's. (Companion to the existing lesson that `.hidden` is
intent and only layout proves it took effect — this is that lesson one layer
higher.)

- **Hit-test, don't just render-test.** For a control that must stay usable
  while an overlay/menu/panel is open: assert
  `document.elementFromPoint(cx, cy)` (the control's center) resolves to the
  control or a descendant. If the covering is intentional, assert THAT instead —
  a control silently swallowed by a layer is the "visible control that refuses"
  antipattern either way.
- **Every new layer gets an occlusion scenario**: open it over each screen
  family it can appear on and hit-test the controls that remain half-exposed at
  its edges. A layer tested only on the screen it was built against ships its
  overlaps with every other screen untested.
- **A cap is proven BINDING, never assumed.** When asserting a size/position
  cap, force the content past the cap first, then prove both halves: rendered
  extent on the capped axis ≤ cap, AND the content demands more than the cap.
  For height caps that demand is `scrollHeight`; for width caps it is the
  intrinsic (uncapped / `max-content`) width — wrapping content grows down,
  not sideways, so `scrollWidth` proves a width cap only where content
  genuinely overflows horizontally. A cap asserted against short content
  passes vacuously.
- **Interactions have transitional states, and they are testable.** A dialog
  that hides itself mid-flow, a button disabled during an await, a screen that
  flashes between two paints — assert the state DURING the transition (element
  still visible while capture runs, dialog gone immediately on send), not just
  the endpoints. "Clunky" is usually a transitional state nobody asserted.
- **Screenshot the new interaction at 1440×900** in its before/during/after
  states while authoring the harness, and look at the pixels before shipping.
  Assertions catch what they name; a screenshot catches what nobody thought to
  name. This class of bug (flicker, squeeze, cover) is invisible to the DOM
  query that causes it.

## Required UI scenario patterns
`ui-tester` emits these generic scenarios by default (beyond S1–S4) for every
app; runnable source is the `NAV:`/`CTRL:` tests in
`templates/ui-tests/tests/app.spec.js`:
- **Back-flow / no-loop** — for each drill-down hierarchy, go deepest, then press
  the in-app back control once per level and assert the path **strictly
  unwinds**: each back lands on the prior page and never revisits the page just
  left. Catches circular/ping-pong back navigation.
- **Single primary action** — assert each view exposes exactly one primary CTA of
  a kind (one "Add X"). Catches duplicate/ghost controls.

Any new client-side navigation or back affordance **requires a back-flow test**
(companions the origin-aware-back coding standard: a back control returns to the
page you came from, tracked via a nav stack — not the last page visited).

## UI coverage gates (blocking)
Five gates every project's UI suite must satisfy. The kit enforces the first
four with a scenario (named in parentheses); the fifth is a property of the
runner's config rather than of any test, and nothing enforces it automatically —
read it. Project-specific suites must keep all five:
- **Console-error gate.** Every UI test run attaches `page.on('pageerror')` and
  `page.on('console')` (type `error`) and **fails if either fires** during load
  or interaction (S1, S3, ENTRY). An uncaught error on load is a broken page even
  if the screen "looks" rendered — one throw silently kills every handler bound
  after it (see `design.md` → *Script loading*). No allow-lists without a written
  reason in the test file.
- **Dismissers are proven, not assumed.** For every modal, drawer, popover, or
  overlay: open it, then dismiss via its close/X/Cancel control AND Escape AND
  the backdrop (where one exists), asserting the container is actually hidden
  after each (DISMISS).
- **Coverage = controls clicked, not screens visited.** Every interactive control
  is exercised at least once (S3). A screen-level smoke test does not count as
  coverage for that screen's controls.
- **Every deployed HTML entry point is tested.** If a project ships more than one
  page (an app plus an admin/vendor console, say), declare the extra pages in
  `APP_PAGES` so each gets the load gate (ENTRY), and give rich pages their own
  suite. A page with zero tests is a release blocker.
- **Three viewport classes, declared in the runner's project list.**
  `global.md` requires laptop, tablet AND phone, so `playwright.config.js` must
  declare a project in each class. Two phone profiles read as coverage and are
  not — and what a phone-only list costs is every OTHER scenario, which runs at
  whatever widths the list declares: S1, S3, DISMISS and ENTRY simply never
  execute at laptop or tablet width, so a breakpoint regression there is
  untested. (S4 is the exception and not the evidence: it sets 390 explicitly,
  so it runs the same in every project — a phone-only list makes it redundant,
  not skipped.) Because this gate lives in the config and not in any scenario, a
  green suite is not evidence for it: read the `projects` list.

These are **completion gates, not sequencing gates**: everything must pass before
the work is called done, but a task never waits for the previous task's suite to
finish before starting (`global.md` → *Pipelined Execution*). Verification runs
concurrently with the next task; batching independent tasks into one suite run is
the norm, not a shortcut.

## CI triage
- `qa.yml` runs on push to `main` and on PRs targeting `main` (branch commits are
  covered by the PR trigger — listing `claude/**` under push would run everything
  twice)
- Static Checks must pass before merge. The local `UI Tests` job is **blocking by
  default** for the static/no-backend tier (the suite runs fully against the
  bundled local server); a repo may set the ui-suite composite's
  `advisory-run: 'true'` as an explicit, temporary opt-out while a known UI
  failure is mid-fix — flip it back once fixed. `qa-live.yml` remains the
  authoritative live gate for auth/backend-dependent flows
- `qa-live.yml` failures against the live app must be fixed before marking work done
- **Quarantine, don't blanket-disable** — when a single UI spec is flaky, skip
  that one spec with a tracking note; never wrap the whole UI job in
  `continue-on-error` to get green, which silently drops all coverage
- Workflow YAML is validated on every CI run — keep it parseable

## Circuit breakers (autonomous fix loops)
When fixing failures without a human in the loop (the `qa-pipeline` ui-tester
loop, CI triage), stop before thrashing:
- **Cap attempts** — at most 3 fix attempts on the same failure, then escalate
  (the `global.md` 3-failures gate; `qa-pipeline` already enforces this for the
  ui-tester loop).
- **Watch the diff** — if a "fix" balloons or starts touching files unrelated to
  the failure, stop: that signals the diagnosis is wrong. Re-diagnose from the
  evidence rather than piling on more changes.
- **Re-verify each attempt fresh** (`global.md` → *Behavior Rules* → evidence before assertions) —
  never assume the previous fix held.

## Escalation
Canonical stop-and-ask gates live in `global.md` → *Escalation Rules*; they apply
here unchanged (file deletion, workflow triggers, 3+ CI failures, multi-file core
logic).
