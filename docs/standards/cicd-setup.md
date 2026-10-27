# CI/CD Setup Checklist

> ## ⚠️ One-Time Human Step (per GitHub account)
>
> **Before any CI/CD email notifications will work, the repo owner must enable GitHub's built-in failure emails — this cannot be done by an agent:**
>
> `github.com → avatar → Settings → Notifications → GitHub Actions → enable "Send notifications for failed workflows"`
>
> Takes 30 seconds. Applies to all repos under the account automatically. Do this once.

Step-by-step guide for deploying the QA pipeline to a new project repo. Follow in order — each step must complete before the next.

> This is the **single canonical install procedure**. Other docs link here
> rather than carrying their own copy of these instructions.

## Overview

Three GitHub Actions workflows replace manual agent invocation for the mechanical parts of the QA pipeline:

| Workflow | Trigger | What it runs |
|---|---|---|
| `qa.yml` | PR to main, push to main, manual dispatch | Static checks + Playwright against local server |
| `qa-live.yml` | After GitHub Pages deployment completes, or manual dispatch | Playwright against the live deployed URL |
| `qa-response.yml` | `repository_dispatch` / manual dispatch | Static checks + Playwright against the live URL |

All three are standard (`global.md` → *Repo Structure Standard*). `pages-deploy.yml` (Step 9d-bis) is added only on Actions-source Pages, and the scheduled `cron-notify.yml` (Step 9f) only when the project has a scheduled task. `keepalive.yml` is not part of the standard (Step 9f).

The AI review steps (the official `pr-review-toolkit` code review, the `/security-review` skill, and `pr-readiness-reviewer`) remain manually invoked via Claude Code. Add them to CI only if `ANTHROPIC_API_KEY` is available as a repository secret.

Every workflow here is a **caller**: a short file in the project whose one job
runs a shared workflow of `claude.directives` (#460 step 4). The project copies
the caller from `templates/workflows/`, fills in its inputs, and carries nothing
else of the CI: the composites and the scripts the shared workflows run come
from `claude.directives` at the pinned release. Do not edit the templates in
place in `claude.directives`; copy each caller to the target project, then fill
it in.

## Callers and pins

A caller's job reads, for example,
`uses: akyachtsman/claude.directives/.github/workflows/shared-qa.yml@v1`. The
part after `@` is the pin:

- **`@v1`** (what every template ships) follows the latest `v1` release, so a
  fix released in `claude.directives` reaches the project on its next run.
- **`@vX.Y.Z`** stays on exactly that release until the project moves it.
- **A commit SHA** stays on that commit. Use it when nobody but the project's
  own owner may change what its CI runs: a caller on `@v1` passes its secrets
  by name to whatever `v1` names, so whoever can move `v1` can run code that
  receives them.

A release is cut by the owner in `claude.directives` (Actions → Release → Run
workflow), and a change that breaks an input or a secret starts `v2`, leaving
`v1` where it is. `/refresh-repo` prints a `PIN:` line under each caller: whether
the shared files changed between the commit the pin names and the head.

**What the project keeps, and what it does not.**

| The project keeps | Where it comes from instead |
|---|---|
| The callers in `.github/workflows/`, with their triggers, permissions, concurrency and inputs | — |
| Its own checks, in a sibling job of the `qa` caller that `qa` lists in `needs:` | — |
| The Playwright kit (`.github/scripts/ui-tests/`), Step 3 | — |
| `.github/scripts/package.json` and `browser-ladder.js`, which `test.md` names for local runs | — |
| `.github/scripts/check-contrast.js`, which `design.md` names for local runs (`/design-intake`) | CI runs the shared copy unless the caller's `contrast-script` names this one, which a project with added pairs does |
| A scheduled task's `notify-task.js` (Step 9f) | `notify-email.js` is staged beside it at run time |
| — | the `secret-scan` and `ui-suite` composites, `check-ui-viewports.js`, `notify-email.js`: read from `claude.directives` at the pinned commit |

Settings that a project once edited into a workflow's `env:` are the caller's
`with:` inputs, because `env` does not pass into a called workflow. Every input
and its default is in the shared workflow's `inputs:`. Secrets go by name
(`TEST_AUTH_CREDENTIAL: ${{ secrets.TEST_AUTH_CREDENTIAL }}`), never
`secrets: inherit`, which GitHub documents only within one organization or
enterprise. A called job's check is named `<caller job> / <job>`
(`qa / Static Checks`), so a branch rule that requires checks by name names
that form.

`claude.directives` is public, so any repository can call it. If it ever turns
private, every caller must be private too and pass a read-only token for it as
the optional `DIRECTIVES_READ_TOKEN` secret (`TIME-SENSITIVE.md` in
`claude.directives` records the GitHub facts behind this).


## Prerequisites

- Target repo exists on GitHub with source files committed to `main`
- `claude.directives` is accessible (public repo) for fetching templates and for the callers to run
- The app URL is known
- If the app's login needs a credential supplied from outside, it is ready to
  store as the `TEST_AUTH_CREDENTIAL` repository secret — never in `CLAUDE.md`
  or any committed file (`global.md` → *Security*). An app with no login, or
  one whose login ships a working credential in a password field, needs none
  (Step 5)
- Claude Code session is active with GitHub MCP access to the target repo

---

## Step 1 — Copy the workflow callers

Copy the QA callers from `claude.directives` into the target repo's
`.github/workflows/`: `qa.yml` and `qa-live.yml` here, `qa-response.yml` just
below, all three standard. They need no composite or script beside them. Beside
the scripts a directive names (below), every project carries the CommonJS manifest:

```bash
mkdir -p .github/workflows .github/scripts

# Fetch from the public template repo
curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/qa.yml \
  -o .github/workflows/qa.yml

curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/qa-live.yml \
  -o .github/workflows/qa-live.yml

# The .js scripts in .github/scripts/ are CommonJS, and this manifest is what
# says so: without it Node takes their module type from the ROOT package.json,
# and a Vite/Astro/SvelteKit root ("type": "module") makes every one of them die
# with "require is not defined in ES module scope". The shared workflows bring
# their own copy for the scripts they run; this one serves browser-ladder.js
# (Step 3) and any CommonJS script of the project's. An existing manifest is
# left alone, but it must not declare "type": "module".
# It makes EVERY .js here CommonJS, the project's own included: an ES-module
# .js of yours that ran before (with no manifest, Node detects ES syntax) dies
# with "Cannot use import statement outside a module" the moment this lands.
# Rename such a file to .mjs, and run `node --check` on each script and your
# own guards once after installing the manifest; both fail on it from then on
# (claude.insurance, 2026-10-15; node --check measured on Node 22).
if [ ! -f .github/scripts/package.json ]; then
  curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/scripts/package.json \
    -o .github/scripts/package.json
fi
```

Then copy each script a directive names (`/new-repo` step 5 derives the set:
today `browser-ladder.js` and `check-contrast.js`) from `templates/scripts/`, and
fill in each caller's inputs (Step 2). A project that adds contrast pairs of its
own (`design.md` → *Accessibility*) adds them to its
`.github/scripts/check-contrast.js` and names that copy in the `qa` caller's
`contrast-script` input.

⚠️ **One thing about the ui-suite browser cache is easy to over-generalise.**
Actions cache WRITE access is set by the triggering event, not the branch, and
only by default: `workflow_run` (like `pull_request_target` and `issue_comment`)
gets read-only access to the default branch's caches, while `push`,
`workflow_dispatch` and `schedule` among others may write. A workflow or job that
declares a write-capable `cache-mode` (`write`, `write-only`) overrides that
default, so a low-trust trigger carrying one is cache-poisonable — review it as
writing, never as read-only (GitHub docs, *Dependency caching*, re-checked
2026-10-09). So by default a `workflow_run`-triggered job can READ a key it was denied WRITING — measured in
`claude.insurance` on 2026-08-25 (run 32897692210), where a `qa-live` run
restored the exact key a manual `workflow_dispatch` had written two days and
three runs earlier. So narrow any statement of the limit to **saves**;
"`workflow_run` can't use the cache" is wrong. It changes nothing in this
procedure and there is deliberately **no manual warming step** here: the
cache-hit path still runs `install-deps`, apt dominates it (`claude.prop`
measured 114 MB of apt fetched on two runs with both caches hit), and warming
bought ~15s. The measurement and its provenance live in one place — the
composite's own comment at the cache step (`templates/actions/ui-suite/action.yml`
in `claude.directives`).

Event-driven QA dispatch hook — **part of the standard set**. Lets sessions and
automations trigger QA via `repository_dispatch`:

```bash
curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/qa-response.yml \
  -o .github/workflows/qa-response.yml
```

Alternatively, have the active Claude Code session fetch and write these files via GitHub MCP tools if no CLI is available.

---

## Step 2 — Fill in the callers' inputs

In each copied caller (`qa.yml`, `qa-live.yml`, `qa-response.yml`), confirm
`tests-dir` names the project's Playwright test directory (default:
`.github/scripts/ui-tests`). A project with the CI-build opt-in sets the `qa`
caller's `build-cmd` and `site-dir` to the same values as its `pages-deploy.yml`
(Step 9d-bis) and `BUILD_PATHS` to its build inputs. Everything else keeps its
default until the project needs it; each caller's header lists what it takes.

---

## Step 3 — Copy Playwright test templates

Copy the Playwright test scaffold into the target repo if not already present:

```bash
mkdir -p .github/scripts/ui-tests/tests/lib

curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/ui-tests/playwright.config.js \
  -o .github/scripts/ui-tests/playwright.config.js

curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/ui-tests/package.json \
  -o .github/scripts/ui-tests/package.json

curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/ui-tests/tests/app.spec.js \
  -o .github/scripts/ui-tests/tests/app.spec.js

curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/ui-tests/tests/lib/fixtures.js \
  -o .github/scripts/ui-tests/tests/lib/fixtures.js

curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/ui-tests/tests/lib/auth.js \
  -o .github/scripts/ui-tests/tests/lib/auth.js
```

The kit's viewport gate does not need installing: the shared workflows stage
`check-ui-viewports.js` from `claude.directives` for each run. It imports
`playwright.config.js` and fails the build when the `projects` list does not
declare a laptop, a tablet and a phone (`test.md` → *UI coverage gates*, fifth
gate). Every failure mode is loud and separately coded — a missing config, a
throwing config, an absent `node_modules` and zero projects each say so rather
than passing quiet. Bands default to phone <768 / tablet 768–1023 / laptop
>=1024 and print on every run.

**A separate script, for a different question.** `browser-ladder.js` answers
whether this machine can LAUNCH a browser at all — `test.md` calls for it when a
sandbox run fails and you need to know whether the browser is the reason. No
workflow invokes it, so take it deliberately:

```bash
curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/scripts/browser-ladder.js \
  -o .github/scripts/browser-ladder.js
```

No workflow passes it arguments: point `--tests-dir` at the directory holding the kit's
`node_modules` yourself. It grades on whether the browser launches, never on an
install's exit code, and reports `CANNOT CHECK` rather than a ceiling when
Playwright itself cannot be loaded.

Then generate and **commit** the lockfile — required: the shared `qa`, `qa-live`
and `qa-response` runs key setup-node's npm cache to the kit's `package-lock.json`,
and setup-node hard-fails ("Dependencies lock file is not found") without it:

```bash
cd .github/scripts/ui-tests && npm install && cd -
git add .github/scripts/ui-tests/package-lock.json
```

After copying, and before the first CI run, fill in the *Project-Specific Test Scenarios* table in the project's `CLAUDE.md` (it comes from `templates/CLAUDE-template.md`) and add one `app.spec.js` scenario per row, starting at S5. What counts as a gap, and the scenario shape, are in `agents/ui-tester.md` → *Project-Specific Scenarios*; the agent's own pass after the first successful run catches what this one missed.

---

## Step 4 — Set APP_URL repository variable

In the target repo on GitHub:

`Settings → Secrets and variables → Actions → Variables → New repository variable`

| Name | Value |
|---|---|
| `APP_URL` | Live app URL (e.g. `https://<username>.github.io/<repo>/`) |

Used by `qa-live.yml` and `qa-response.yml`, which take the live URL from this variable and nothing else: a baseURL default filled in to the kit's `playwright.config.js` is not read by their `Require APP_URL` gate, so a project that relied on one still has to set the variable (pilots claude.prop + claude.trading, 2026-10-13).

---

## Step 5 — Add TEST_AUTH_CREDENTIAL secret

Skip this step if the app has no login: with the secret unset, the
authenticated scenarios self-skip. For a login that ships a working credential
in a password field, see the exception below.

In the target repo on GitHub:

`Settings → Secrets and variables → Actions → Secrets → New repository secret`

| Name | Value |
|---|---|
| `TEST_AUTH_CREDENTIAL` | The test account's PIN, password or token — set it here only, never in a committed file |
| `TEST_AUTH_EMAIL` | The matching identifier — REQUIRED when the gate is email+password (directives#304) OR identifier-first/split-step, i.e. an email step before any password field (directives#310) — without it a split-step gate is not detected at all; omit for PIN/password-only gates. Not truly secret: failure screenshots record it, so use a throwaway test-account address |

**Exception — a login that already holds a working credential.** Some apps ship a
demo login with both fields prefilled, where a human signs in by clicking the
button. Set **NEITHER** secret for those: the suite submits the form as it stands
and records `credentialSource: prefilled` in the `auth-result` attachment.
Setting `TEST_AUTH_CREDENTIAL` there REPLACES a working value with a different
one, and the resulting "gate retained" failure is correctly reported for an
incorrect reason (directives#312). The field must be a visible, editable
`input[type=password]` — a prefilled text or PIN gate is deliberately not read
as a credential source, because a non-empty text input cannot be told apart from
a search box with a default query.

Add any additional backend API secrets the app requires (e.g. read-only API tokens for test accounts).

---

## Step 6 — Enable GitHub Pages

Pick the source first (`directives/global.md` → *Hosting & Deployment*), and set
only that one:

- **Branch-source** (nothing in the repo must stay private, no CI build):
  `Settings → Pages → Source → Deploy from a branch → Branch: main → / (root)`.
  Save. GitHub creates the `pages-build-deployment` workflow automatically; it
  is what triggers `qa-live.yml`. A transiently failed run of it is re-run by
  hand or by the session.
- **Actions-source** (a file that must not be public, or the CI-build opt-in):
  `Settings → Pages → Source → GitHub Actions`. ⚠️ **Never select "Deploy from
  a branch" here, not even briefly:** it publishes the whole repository,
  unfiltered, before `pages-deploy.yml` (Step 9d-bis) ever runs. The deploy is
  `Pages Deploy`, and it is what triggers `qa-live.yml`.

---

## Step 7 — Verify the deploy workflow appears

Go to the target repo's `Actions` tab and confirm the deploy for the source you
picked appears in the workflow list: `pages-build-deployment` on branch-source,
`Pages Deploy` on Actions-source (once Step 9d-bis has merged). It may take one
push to appear.

---

## Step 8 — Keep the work on a branch

Everything from Steps 1–9 goes on one `claude/<name>` branch, never straight to
`main`: the default-branch ruleset this procedure requires (Verification
Checklist) refuses a direct push. Do Step 9 on the same branch, then verify
through the setup PR (Step 10).

---

## Step 9 — Hand-kept rules and conditional workflows

### 9c-bis — Workflow cross-references

A `workflow_run` trigger names another workflow's `name:` as a string, and GitHub
raises **no error** when that name matches nothing — the watcher simply never
fires. No script checks this, so keep it by hand: rename a workflow and every
watcher of it in the same PR (`docs/standards/automations.md` → *Watcher Rules*),
and on Actions-source keep `"Pages Deploy"` on the `qa-live.yml` caller's watch
list. The watch list lives in the caller, so no release of the shared workflows
can drop it, and no release can add it either.

### 9c-ter — Job bounds

An unbounded job runs to GitHub's 6-hour default showing neither pass nor fail,
and a bound set BELOW the work it bounds cancels healthy runs, which read as
inconclusive rather than red, so nobody chases them. No script checks bounds;
keep three rules by hand, per JOB rather than per repo:

1. Every job declares `timeout-minutes` (except a job that `uses:` a reusable
   workflow, where GitHub does not accept it: a caller's job takes its bound
   from the shared workflow, whose UI jobs read the `ui-timeout-minutes` input).
2. No bound `>= 360` — GitHub's default IS 360, so declaring it changes nothing
   while reading as protection.
3. A job using the **ui-suite** composite sets `>= 120`; a job running
   `playwright install` directly wants `>= 30`.

The 120 is a fleet-wide MINIMUM sized for the slow end, so being far under it is
expected, not a reason for an exemption. Set HIGHER where your suite needs it,
never lower, through `ui-timeout-minutes`. Its sizing record is the CALLER BOUND section of `templates/actions/ui-suite/action.yml`'s header:
record that pointer, not the value, and where the format forces the literal, as
`timeout-minutes` does, keep the pointer in the comment beside it (`MAINTAIN-REPO-USER-INSTRUCTIONS.md` → *Propagation Matrix*).

### 9d-bis — Pages Deploy (Actions-source only)

⚠️ **ACTIONS-SOURCE ONLY.** Install this where Settings →
Pages → Source is "GitHub Actions": a repo holding files that must not be public,
or a project with the CI-build opt-in (`directives/global.md` → *Hosting & Deployment*). A branch-source
project does not install it; there the push is the deploy.

```bash
curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/pages-deploy.yml \
  -o .github/workflows/pages-deploy.yml
```

**What it does:** the caller runs `claude.directives`' `shared-pages-deploy.yml`,
which builds (only with the opt-in: the caller's `build-cmd` and `site-dir`),
copies the site minus every `.github/pages-deny.txt` path, publishes it,
retries GitHub's transient publish failure from the same artifact, then asserts
the root serves 200, each denied path 404, and each path in
`.github/pages-public.txt` (internal-looking files that must stay public) 200.
The caller's header lists the rest of the switch: a watcher named "Pages Deploy"
in `qa-live.yml` (add, never replace; Step 9c-bis). Installed before the
project's first page exists, it publishes nothing until `index.html` arrives: a
run with no build and no Pages deployment ever skips its Publish job, and
`qa-live.yml` skips its suite.

### 9f — Scheduled-job notifications

Installed only when the project has a scheduled task (`global.md` → *Repo Structure Standard*, owner ruling 2026-10-10): a `schedule:` workflow starts recurring work the moment it lands, so it is added with the task, not before. The project carries two files: the `cron-notify.yml` caller and its own task, `.github/scripts/notify-task.js`. The shared workflow stages `notify-email.js` and its `package.json` beside the task for each run and installs `nodemailer` there, so the project commits no lockfile for it. The starter task exits before its body when the SMTP settings are unset, so a task that sends no email also deletes that guard (the `REQUIRED` check) when it replaces the body.

```bash
mkdir -p .github/workflows .github/scripts
for f in .github/workflows/cron-notify.yml .github/scripts/notify-task.js; do
  [ -e "$f" ] && echo "STOP: $f exists; diff it against the template by hand"
done
[ -e .github/workflows/cron-notify.yml ] || curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/cron-notify.yml \
  -o .github/workflows/cron-notify.yml
[ -e .github/scripts/notify-task.js ] || curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/scripts/notify-task.js \
  -o .github/scripts/notify-task.js
```

Before committing, set `on.schedule` in `cron-notify.yml` to the task's own cadence (the template's `cron: '0 7 * * *'` is a placeholder; add the DST guard if it needs a fixed local time, per `docs/guides/cron-email-notifications.md`), replace the starter task body, and pass each secret the task reads in the caller's `secrets:`. The task sees only the names `shared-cron-notify.yml` passes (its header lists them); a task that needs another name is a finding for `claude.directives`, not a reason to copy the workflow.

**What it does:** `cron-notify.yml` runs the project's scheduled task
(`notify-task.js`) on its cron, through the shared workflow, and sends email
through `notify-email.js`. It
does **not** surface its own failures: nothing in it opens an issue or comments
when a run fails, so a failed run shows only as a red run in the Actions tab.
GitHub's failed-workflow email (the one-time step at the top) is what reports it.

**`keepalive.yml` is not part of this standard**, and its template was deleted
(owner ruling, 2026-10-12). This is the one full statement of why; every
other mention points here. It pushed an empty commit to `main` weekly with
`secrets.KEEPALIVE_PAT`, and the default-branch ruleset every repo must have
(with an empty bypass list) refuses that — so under this standard the workflow
was red on every run, not merely unnecessary. It is also unnecessary: the 60-day
auto-disable applies to public repositories only and counts repository
*inactivity*, not elapsed time, which a repo where PRs land never approaches. If a genuinely idle
repo ever does trip the limit, GitHub emails admins and re-enabling is one click
— cheaper than a standing exemption. A project that already has it: delete it
and its `KEEPALIVE_PAT` secret, keep the ruleset's bypass list empty, and never
exempt your own account to keep it green (`MAINTAIN-REPO-USER-INSTRUCTIONS.md` → *Branch Protection* says why).

---

## Step 10 — Open the setup PR and verify the workflows trigger

Open the PR from the branch that now holds Steps 1–9. That PR is the test:

- [ ] `QA — Static + UI Tests` runs on the PR and goes green, and each shared
      job's log prints `Shared files: akyachtsman/claude.directives@<sha>`
- [ ] after the squash-merge, `QA — UI Tests (live)` runs once the deploy completes — `pages-build-deployment` on branch-source, `Pages Deploy` on Actions-source (before the first page exists, `Pages Deploy` publishes nothing and the live suite is skipped; Step 9d-bis)
- [ ] `QA — Event-Driven Response` is visible in the Actions tab and ready for dispatch

---

## Reference — placeholders, secrets, and variables

Key values to customize after copying:

| Value | What to substitute |
|---|---|
| `REPLACE_WITH_YOUR_APP_URL` (`playwright.config.js`) | Live app URL fallback when the `APP_URL` env var is unset — read by an ad-hoc local run only; `qa-live.yml` and `qa-response.yml` never fall back to it (Step 4) |
| `tests-dir` (each qa caller's input) | Path to your Playwright test directory (default: `.github/scripts/ui-tests`) |

Required repository secrets:

| Secret | Purpose |
|---|---|
| `TEST_AUTH_CREDENTIAL` | Valid credential for Playwright login test — OMIT when the app has no login, or when its login ships a working one of its own in a visible, editable password field (a prefilled text or PIN field does not count), which the suite then submits as-is and reports as `credentialSource: prefilled` (directives#312) |
| `TEST_AUTH_EMAIL` | Matching identifier for email+password gates (directives#304) and for identifier-first/split-step gates, which are not detected without it (directives#310); omit otherwise. Recorded in failure screenshots — throwaway address only |
| `DB_SERVICE_KEY` | Backend service-role key — server-side only (required by the project's scheduled data workflow, if any) |

Required repository variables:

| Variable | Purpose |
|---|---|
| `APP_URL` | Live GitHub Pages URL (e.g. `https://<username>.github.io/<repo>/`) |
| `DB_URL` | Backend project/connection URL (safe in a variable; the client/anon key relies on RLS) — required by the project's scheduled data workflow, if any |

Optional repository variables (the shared qa workflows pass them through the `ui-suite` composite; unset keeps the default behaviour):

| Variable | Purpose |
|---|---|
| `TEST_AUTH_READY_SELECTOR` | A selector matching whichever auth outcome occurs — the gate itself OR the authenticated app shell — so "no auth gate" is reported `proven` rather than `windowed` (`test.md`). A variable, not a secret: a masked selector is unreadable in a failure message |
| `TEST_AUTH_READY_REQUEST` | Alternative to the selector: a substring of the URL of the request whose settling decides the auth outcome |
| `TEST_AUTH_SUCCESS_SELECTOR` | A selector only the signed-in view shows; S2 fails unless it is visible after submitting the credential (#379). Unset, S2 reads the gate clearing as success. A variable, not a secret |
| `APP_PAGES` | Extra HTML entry points beyond `APP_URL`, comma-separated and relative to it (e.g. `admin.html,vendor/console.html`); each gets the ENTRY load gate. Unset, only the base URL is covered |

---

## Verification Checklist

- [ ] `.github/workflows/qa.yml` present (a caller of `shared-qa.yml`) and triggering on PRs to `main` and pushes to `main`
- [ ] `.github/workflows/qa-live.yml` present (a caller of `shared-qa-live.yml`) and triggering after Pages deploy
- [ ] `.github/workflows/qa-response.yml` present (a caller of `shared-qa-response.yml`) and ready for dispatch — part of the standard set
- [ ] `.github/workflows/pages-deploy.yml`: **Actions-source** → present (a caller of `shared-pages-deploy.yml`), `build-cmd`/`site-dir` filled in (empty and `.` without a build), with `.github/pages-deny.txt` (and `.github/pages-public.txt` if any internal-looking path must stay public); **branch-source** → absent (Step 9d-bis)
- [ ] `.github/workflows/cron-notify.yml` present with `.github/scripts/notify-task.js` if the project has a scheduled task, both absent otherwise; `keepalive.yml` ABSENT (Step 9f)
- [ ] every caller pinned `@v1`, `@vX.Y.Z` or a commit SHA, and passing its secrets by name
- [ ] no `.github/actions/secret-scan/`, `.github/actions/ui-suite/` or `.github/scripts/check-ui-viewports.js`: the shared workflows read them from `claude.directives`, and a stale copy only misleads
- [ ] `.github/scripts/package.json`, `browser-ladder.js` and `check-contrast.js` present (Step 1); the `qa` caller names `check-contrast.js` in `contrast-script` only when the project added pairs
- [ ] `.github/scripts/ui-tests/package-lock.json` committed (setup-node cache requires it)
- [ ] `APP_URL` set as repository variable
- [ ] `TEST_AUTH_CREDENTIAL` set as repository secret — or deliberately NOT set, because the app has no login, or because its login ships a working credential in a visible, editable password field and the suite submits what the form holds (directives#312)
- [ ] `TEST_AUTH_EMAIL` set as repository secret if the app's gate is email+password (directives#304) or identifier-first/split-step (directives#310)
- [ ] GitHub Pages enabled on the chosen source, and its deploy visible in Actions — `pages-build-deployment` (branch-source) or `Pages Deploy` (Actions-source, never "Deploy from a branch")
- [ ] At least one successful run of each workflow confirmed

---
