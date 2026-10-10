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

Four event-driven monitors run alongside them in every project — `ci-monitor.yml`, `codex-monitor.yml`, `pages-monitor.yml` and `ci-notify.yml` (Step 9) — so seven are standard (`global.md` → *Repo Structure Standard*). The scheduled `cron-notify.yml` (Step 9f) is added only when the project has a scheduled task. Two files are conditional on the Pages source, so every project has a baseline of eight, nine with the scheduled job: `pages-retry.yml` (Step 9d; `automations.md` → *Watcher Rules* W3) — **branch-source** → install it, with its `REQUIRED` entry; **Actions-source** → leave it out, **or** repoint it under W3's idempotent-deploy exception, **updating** its `REQUIRED` entry to the project's own deploy name — and its converse `pages-deploy.yml` (Step 9d-bis), the deploy itself, installed **only** on Actions-source. `keepalive.yml` is NOT installed (Step 9f).

The AI review steps (the official `pr-review-toolkit` code review, the `/security-review` skill, and `pr-readiness-reviewer`) remain manually invoked via Claude Code. Add them to CI only if `ANTHROPIC_API_KEY` is available as a repository secret.

Do not edit the templates in place in `claude.directives` — copy to the target project, then customize.


## Prerequisites

- Target repo exists on GitHub with source files committed to `main`
- `claude.directives` is accessible (public repo) for fetching templates
- The app URL is known
- If the app's login needs a credential supplied from outside, it is ready to
  store as the `TEST_AUTH_CREDENTIAL` repository secret — never in `CLAUDE.md`
  or any committed file (`global.md` → *Security*). An app with no login, or
  one whose login ships a working credential in a password field, needs none
  (Step 5)
- Claude Code session is active with GitHub MCP access to the target repo

---

## Step 1 — Copy workflow templates

Copy the QA workflow templates from `claude.directives` into the target repo's `.github/workflows/` — `qa.yml` and `qa-live.yml` here, `qa-response.yml` just below, all three standard — **plus the two composite actions they reference** into `.github/actions/` (without them every qa run fails at step resolution):

```bash
mkdir -p .github/workflows .github/actions/secret-scan .github/actions/ui-suite

# Fetch from the public template repo
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/qa.yml \
  -o .github/workflows/qa.yml

curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/qa-live.yml \
  -o .github/workflows/qa-live.yml

curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/actions/secret-scan/action.yml \
  -o .github/actions/secret-scan/action.yml

curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/actions/ui-suite/action.yml \
  -o .github/actions/ui-suite/action.yml

# The ui-suite composite runs a SIBLING script by path. Install it WITH the
# YAML — the composite's first step is `python3
# "$GITHUB_ACTION_PATH/validate-report-path.py"`, so without this file every UI
# job dies at that step with "No such file".
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/actions/ui-suite/validate-report-path.py \
  -o .github/actions/ui-suite/validate-report-path.py

# qa.yml's static job runs these five scripts by path, so they install WITH it —
# without them the job fails at its first missing file. What each one guards is
# in 9c-bis, 9c-ter and design.md → *Accessibility*.
mkdir -p .github/scripts
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/scripts/check-contrast.js \
  -o .github/scripts/check-contrast.js
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/scripts/workflow-ref-guard.py \
  -o .github/scripts/workflow-ref-guard.py
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/scripts/check-job-bounds.py \
  -o .github/scripts/check-job-bounds.py
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/scripts/check-py-warnings.py \
  -o .github/scripts/check-py-warnings.py
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/scripts/check-ui-suite-env.py \
  -o .github/scripts/check-ui-suite-env.py
```

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
composite's own comment at the cache step.

Event-driven QA dispatch hook — **part of the standard set**, so
`ci-monitor.yml` and `ci-notify.yml` ship watching it. Lets sessions and
automations trigger QA via `repository_dispatch`:

```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/qa-response.yml \
  -o .github/workflows/qa-response.yml
```

⚠️ **If you deliberately skip this file**, remove `'QA — Event-Driven Response'`
from the `workflow_run.workflows` list in **both** `ci-monitor.yml` and
`ci-notify.yml` in the same change. Leaving it is a watcher naming a workflow
the repo does not have — see `docs/standards/automations.md` → *Watcher Rules*
(W1).

Alternatively, have the active Claude Code session fetch and write these files via GitHub MCP tools if no CLI is available.

---

## Step 2 — Set UI_TESTS_DIR

In each copied workflow file (`qa.yml`, `qa-live.yml`, `qa-response.yml`), confirm `UI_TESTS_DIR` points to the correct path for the project's Playwright test directory (default: `.github/scripts/ui-tests`). Edit if different.

---

## Step 3 — Copy Playwright test templates

Copy the Playwright test scaffold into the target repo if not already present:

```bash
mkdir -p .github/scripts/ui-tests/tests

curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/ui-tests/playwright.config.js \
  -o .github/scripts/ui-tests/playwright.config.js

curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/ui-tests/package.json \
  -o .github/scripts/ui-tests/package.json

curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/ui-tests/tests/app.spec.js \
  -o .github/scripts/ui-tests/tests/app.spec.js
```

The kit's viewport gate ships alongside it. Install it **with** the `ui-suite`
composite, not after: the composite names it by path, so an updated composite
without it fails every UI job at step resolution.

```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/scripts/check-ui-viewports.js \
  -o .github/scripts/check-ui-viewports.js
```

It reads `UI_TESTS_DIR` (or `--tests-dir`, which the composite passes), so a
project that moved its test directory needs no edit. It imports
`playwright.config.js` and fails the build when the `projects` list does not
declare a laptop, a tablet and a phone (`test.md` → *UI coverage gates*, fifth
gate). Every failure mode is loud and separately coded — a missing config, a
throwing config, an absent `node_modules` and zero projects each say so rather
than passing quiet. Bands default to phone <768 / tablet 768–1023 / laptop
>=1024 and print on every run; `--tablet-min` / `--laptop-min` override them for
a project whose breakpoints differ.

**A separate script, for a different question.** `browser-ladder.js` answers
whether this machine can LAUNCH a browser at all — `test.md` calls for it when a
sandbox run fails and you need to know whether the browser is the reason. No
workflow invokes it, so take it deliberately:

```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/scripts/browser-ladder.js \
  -o .github/scripts/browser-ladder.js
```

Unlike the viewport gate above it reads no `UI_TESTS_DIR`, and no composite
passes it arguments: point `--tests-dir` at the directory holding the kit's
`node_modules` yourself. It grades on whether the browser launches, never on an
install's exit code, and reports `CANNOT CHECK` rather than a ceiling when
Playwright itself cannot be loaded.

Then generate and **commit** the lockfile — required: `qa.yml`, `qa-live.yml`, and
`qa-response.yml` key setup-node's npm cache to `package-lock.json`, and setup-node
hard-fails ("Dependencies lock file is not found") without it:

```bash
cd .github/scripts/ui-tests && npm install && cd -
git add .github/scripts/ui-tests/package-lock.json
```

After copying, review which UI features are not covered by the generic S1–S4 test scenarios (e.g. data grouping, section rendering, feature-specific layouts, multi-step flows). Add project-specific scenarios for these gaps directly in `app.spec.js` (starting at S5) before the first CI run.

---

## Step 4 — Set APP_URL repository variable

In the target repo on GitHub:

`Settings → Secrets and variables → Actions → Variables → New repository variable`

| Name | Value |
|---|---|
| `APP_URL` | Live app URL (e.g. `https://<username>.github.io/<repo>/`) |

Used by `qa-live.yml` and `qa-response.yml`.

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
  is what triggers `qa-live.yml`.
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
Checklist) refuses a direct push. Install the monitors (Step 9) on the same
branch, then verify through the setup PR (Step 10).

---

## Step 9 — Install the event-driven monitors

### 9a — CI Monitor

Drop-in — copy it verbatim. It ships pre-wired to watch all three QA workflows
that come with it (`qa.yml`, `qa-live.yml`, `qa-response.yml`):

```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/ci-monitor.yml \
  -o .github/workflows/ci-monitor.yml
```

Edit `workflow_run.workflows` only to rename (change the workflow and every
watcher of it in the same PR), to watch an additional workflow, or to REMOVE a
name for a standard workflow the owner agreed to leave out (W1) — every entry must resolve
to a workflow this repo has (`grep '^name:' .github/workflows/*.yml`).
Rules: `docs/standards/automations.md` → *Watcher Rules* (W1).

After pushing, verify with a manual `workflow_dispatch` run before relying on it.

**What it does:** files a deduplicated `ci-failure` issue when a watched
workflow fails. Behavior detail: `docs/standards/automations.md` → Automation 2.

### 9b — Codex Monitor

Drop-in, no customization needed:

```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/codex-monitor.yml \
  -o .github/workflows/codex-monitor.yml
```

**What it does:** adds a `codex-flagged` label when Codex raises concerns and
clears it on a Codex all-clear **comment** naming the current head SHA. ⚠️ It
sees neither a 👍 reaction nor an inline review-thread reply, so a clean rerun in
either form leaves the label; what to do then: `directives/git.md` → *PR Lifecycle*.
Behavior detail: `docs/standards/automations.md` → Automation 3.

### 9c — Pages Monitor

Drop-in for a **branch-source** Pages project (the live URL is derived from the
repo). ⚠️ **If Settings → Pages → Source is "GitHub Actions"**, `page_build`
never fires and this monitor is inert until you add a `workflow_run` trigger
naming your own deploy workflow — the template header carries the snippet, and
the same name must be added to `qa-live.yml`'s watch list. If that deploy
uploads its Pages artifact under its own name (`upload-pages-artifact`'s
`name:`), set the monitor's `PAGES_ARTIFACT_PREFIX` to it: the monitor reads the
published file list from that artifact. Do NOT add it to
`pages-retry.yml` — unless that deploy is provably idempotent and you record, in
the project's CLAUDE.md, **both** why *and* a **revisit trigger** naming the
condition that ends the exception ("if the deploy ever gains a build or test
stage, delete this watcher"). That is the one exception W3 grants (Step 9d spells
it out); the reasoning alone describes the deploy today and outlives the change
that invalidates it. Rules: `docs/standards/automations.md` → *Watcher Rules*
(W2, W3).

```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/pages-monitor.yml \
  -o .github/workflows/pages-monitor.yml
```

**What it does:** verifies every Pages build is live and tracks problems via a
deduplicated `pages-deploy-failure` issue. Behavior detail: `docs/standards/automations.md`
→ Automation 4.

### 9c-bis — Workflow cross-reference guard

A `workflow_run` trigger names another workflow's `name:` as a string, and GitHub
raises **no error** when that name matches nothing — the watcher simply never
fires. The guard (installed in Step 1) makes a broken cross-reference fail the
build instead of going quiet. `qa.yml` already invokes it. Populate `.github/workflow-ref-required.json` with
the watchers this project must not lose — the script is byte-identical in every
repo, so its second rule is configured here rather than edited into the file:

```json
{ "qa-live.yml": ["My Deploy Workflow"] }
```

For the retry, state both branches (Step 9d; `automations.md` → *Watcher Rules* W3):
**branch-source** → `"pages-retry.yml": ["pages-build-deployment"]`;
**Actions-source** → no entry, **or**, under W3's exception, the entry naming the
project's own deploy. An Actions-source project also lists its two deploy
watchers, so neither trigger can be dropped quietly: with `pages-deploy.yml`
(Step 9d-bis), `"qa-live.yml": ["Pages Deploy"]` and
`"pages-monitor.yml": ["Pages Deploy"]`.

It reads the workflows with PyYAML, which ships on GitHub's runner images and is
already what `qa.yml` parses workflow YAML with — no install step. The guard was
a dependency-free line scanner first; that version had to re-implement YAML and
kept red-building valid workflows over legal forms it could not read, so a real
parser is the cheaper of the two. It fails loudly if PyYAML is absent rather than
skipping, because a guard that cannot read the workflows must never report them
fine.

⚠️ Its green run means "no dangling reference and no missing required watcher";
it does **not** prove a trigger still fires. That needs run history. See the
file's own header.

### 9c-ter — Job bounds guard

An unbounded job runs to GitHub's 6-hour default showing neither pass nor fail,
and a bound set BELOW the work it bounds is worse: it cancels healthy runs, and
a cancelled run reads as inconclusive rather than red, so nobody chases it.
The guard, `check-py-warnings.py` and `check-ui-suite-env.py` are installed in
Step 1.

`check-ui-suite-env.py` keeps the ui-suite composite's viewport checks on the
same environment as its Playwright run: the checks import the config, so a
variable added to the run step alone makes them read a different config from the
one that runs. It also checks that every `process.env` read in the kit is wired
from an input. A variable that needs no input goes in
`.github/ui-suite-env-exempt.json` as `{"NAME": "why it needs none"}`; an entry
with no reason is refused. Two kinds qualify: a name set outside the composite
(the runner's `CI` and `GITHUB_*`, or a self-hosted runner image), and a name
deliberately never set in CI because the code reading it handles it unset (a
local-sandbox hatch such as a browser-executable override).

`qa.yml` already invokes it. It needs no config file — the three rules are the
same in every repo:

1. Every job declares `timeout-minutes` (except jobs that `uses:` a reusable
   workflow, where GitHub does not accept it).
2. No bound `>= 360` — GitHub's default IS 360, so declaring it changes nothing
   while reading as protection.
3. Two browser floors, because the shapes cost differently — but only one of
   them is a gate:
   - **ENFORCED** — a job using the **ui-suite** composite needs `>= 120`, since
     that composite is install + every project in `playwright.config.js` +
     retries + upload in one sum it cannot subdivide. The composite is read from
     `uses:`, structured data with one correct answer. **Compliance is per JOB,
     not per repo.** The floor binds composite CALLERS only, so one repo can sit
     above it on a job that runs `playwright install` directly and below it on
     two that `uses:` the composite — same repo, same template lineage
     (`claude.insurance`, 2026-08-25: `qa.yml` at 60 on the raw-install path,
     `qa-live.yml` and `qa-response.yml` at 40 on the composite). "Is this repo
     at the floor?" has no single answer; ask it per job.
   - **ADVISORY** — a job running `playwright install` directly wants `>= 30`.
     This prints and never fails the build. Deciding whether a `run:` block
     invokes playwright means parsing bash, and successive attempts produced
     roughly as many false positives as findings; an unsound hard gate gets
     deleted and takes rules 1–2 with it. **A green run is not evidence this
     floor was met** — read the advisory lines.

**The 120 is a fleet-wide MINIMUM sized for the slow end, so being far under it
is expected, not a reason for an exemption.** It is not an estimate of your
suite; it is the point below which a HEALTHY run gets cancelled — and a cancelled
run reads as inconclusive rather than red, so nobody chases it. Sized from
measured numbers at the slow end of the fleet: `claude.trading`'s 30m35s warm
whole job plus the 21m25s cold browser install, plus a failing profile that
replaces its healthy scenario with the per-test ceiling and then retries at it. A
repo whose whole job runs ~3min is ~40x under the floor and still sets it
(`claude.insurance`, 2026-08-25, who raised rather than argued — a floor with
per-repo exemptions is not a floor). Set HIGHER where your suite needs it, never
lower. The number's home is `UI_SUITE_FLOOR` in `check-job-bounds.py`: record the
pointer, not the value — and where the format forces the literal, as Actions
`timeout-minutes` does, cache the value and keep the pointer in the comment
beside it (`MAINTAIN-REPO-USER-INSTRUCTIONS.md` → *Propagation Matrix*).

Rule 3 is the one worth installing for. It exists because rule 1 passed the
exact defect it was written for: every broken job DECLARED a bound, and the
value was the fault. Until this guard shipped downstream, the floor —
60 at the time, 120 since — was a number in a comment, and three callers had
already drifted to 40.

The guard scans `.github/workflows`. Nothing else, unless you pass
`--include-templates` — a flag only claude.directives uses, to also cover the
workflow templates it ships. Run it plain and it will never look at any directory
of yours. Same file both sides, nothing to configure, no forked copy to keep in
sync.

It is also deliberately conservative about rule 3: where it cannot identify a job
with certainty it does **not** apply a floor. A job that merely mentions
`playwright install` in a grep, a remote action whose path ends in the same
segments as the shipped composite, or a bound derived from a `${{ }}` expression
are all left alone. The reasoning is in the file's header — a guard that
red-builds a healthy repo gets deleted, taking the real rules with it.

Install it **with** the `qa.yml` update, not after: the workflow names the script
by path, so an updated `qa.yml` without it fails every run at step resolution. And expect it to have something to say on that first run. A repo that
has never carried this script has never been checked against the floor, so
accumulated drift surfaces all at once as a red check on the adopting PR:
**auditing and raising existing bounds is part of adopting it, in the same
change** — adoption, not a regression the adoption caused
(`MAINTAIN-REPO-USER-INSTRUCTIONS.md` → *Propagation Matrix*).

Like `workflow-ref-guard.py` it parses with PyYAML (present on GitHub's runner
images) and fails loudly if that import is missing, rather than skipping.

### 9d — Pages Retry

⚠️ **BRANCH-SOURCE ONLY — check the project's Pages source before running this.**
On an **Actions-source** project do NOT install this file, and omit its
`REQUIRED` entry in `workflow-ref-guard`. It watches `pages-build-deployment`,
which a **repo visibility flip fires even under Actions-source**, publishing the
unfiltered tree — so installing it there arms a **retry of a rogue unfiltered
deploy** (`directives/global.md` → *Hosting & Deployment*). The one exception is
W3's: an Actions-source project whose deploy is genuinely idempotent may repoint
it at that deploy, recording the reasoning **and a revisit trigger** in its
`CLAUDE.md` and **updating** — not dropping — its `REQUIRED` entry
(`automations.md` → *Watcher Rules* W3).

On a branch-source project, drop-in, portable as-is — and add its `REQUIRED`
entry to `.github/workflow-ref-required.json` in the same edit (Step 9c-bis), so
the guard fails if the retry ever stops watching the managed build:

```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/pages-retry.yml \
  -o .github/workflows/pages-retry.yml
```

```json
{ "pages-retry.yml": ["pages-build-deployment"] }
```

**What it does:** watches the managed `pages-build-deployment` run (that file
slug is the workflow's actual `name` — the UI's prose title "pages build and
deployment" never matches in `workflow_run` filters) and, on a
failure, re-runs it automatically (transient *"Deployment failed, try again
later."* publish blips clear on retry), bounded to `run_attempt < 4` so a truly
broken deploy can't loop — at the ceiling `pages-monitor.yml` opens the tracking
issue. **Two prerequisites:** (1) it targets the **branch-source** Pages workflow
(`pages-build-deployment`) — projects on the **GitHub Actions** Pages source
should instead build retry into their own deploy workflow, unless that deploy is
provably idempotent and the project's CLAUDE.md records both the reasoning **and
a revisit trigger** ending the exception (`docs/standards/automations.md` → *Watcher Rules*, W3). ⚠️ An Actions-source project that keeps this watcher
un-repointed must **delete** it, not narrow it — a visibility flip fires
`pages-build-deployment` even under Actions-source, and the retry would re-run
that rogue unfiltered deploy; (2) it only arms once
it's on the default branch, so it covers the *next* deploy, not the one that adds
it.

### 9d-bis — Pages Deploy (Actions-source only)

⚠️ **ACTIONS-SOURCE ONLY — the mirror of 9d.** Install this where Settings →
Pages → Source is "GitHub Actions": a repo holding files that must not be public,
or a project with the CI-build opt-in (`directives/global.md` → *Hosting & Deployment*). A branch-source
project does not install it; there the push is the deploy.

```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/pages-deploy.yml \
  -o .github/workflows/pages-deploy.yml
```

**What it does:** builds (only with the opt-in: `BUILD_CMD` and `SITE_DIR` in its
header), copies the site minus every `.github/pages-deny.txt` path, publishes it,
retries GitHub's transient publish failure from the same artifact, then asserts
the root serves 200, each denied path 404, and each path in
`.github/pages-public.txt` (internal-looking files that must stay public) 200. Its header lists the rest of the
switch: watchers named "Pages Deploy" in `qa-live.yml` and `pages-monitor.yml`
(add, never replace), each listed in `.github/workflow-ref-required.json` (Step
9c-bis) as `"qa-live.yml": ["Pages Deploy"]` and `"pages-monitor.yml": ["Pages Deploy"]`,
and `pages-retry.yml` deleted with its `REQUIRED` entry. Installed before the
project's first page exists, it publishes nothing until `index.html` arrives: a
run with no build and no Pages deployment ever skips its Publish job, and
`pages-monitor.yml` reports it as nothing published rather than a failure while
`qa-live.yml` skips its suite.

### 9e — CI Notify

Drop-in — edit only the watched names to match the QA workflows you installed
(`docs/standards/automations.md` → *Watcher Rules*, W1):

```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/ci-notify.yml \
  -o .github/workflows/ci-notify.yml
```

**What it does:** comments on the open PR for a head SHA when a watched QA
workflow completes **green**, so a watching session wakes on success — GitHub
delivers failures natively but never green. Without it, a PR-attached wait has
no success signal at all. With it the coverage is still partial: one of its two
lookups (head SHA, else branch + head-repo owner) must resolve exactly one open
PR, and it exits silently otherwise. When to arm a check-in instead, and why
even a unique match is not proof: `directives/git.md` → *PR Lifecycle*. Behavior detail: `docs/standards/automations.md` →
Automation 4c.

⚠️ `workflow_run` triggers are read from the DEFAULT branch, so this workflow can
never wake the PR that installs it. Verify on the first post-install PR; don't
call it a dud.

### 9f — Scheduled-job notifications

Installed only when the project has a scheduled task (`global.md` → *Repo Structure Standard*, owner ruling 2026-10-10): a `schedule:` workflow starts recurring work the moment it lands, so it is added with the task, not before. Install it with its scripts (`.github/scripts/notify-task.js`, `.github/scripts/notify-email.js`, `.github/scripts/package.json`, as step 5 of `/new-repo` lists them under its scheduled-job scripts note), then replace the starter task body:

```bash
mkdir -p .github/workflows .github/scripts
curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/cron-notify.yml \
  -o .github/workflows/cron-notify.yml
curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/scripts/notify-task.js \
  -o .github/scripts/notify-task.js
curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/scripts/notify-email.js \
  -o .github/scripts/notify-email.js
curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/scripts/package.json \
  -o .github/scripts/package.json
# cron-notify.yml's setup-node `cache:` step needs a committed lockfile
(cd .github/scripts && npm install)
git add .github/workflows/cron-notify.yml .github/scripts/notify-task.js \
  .github/scripts/notify-email.js .github/scripts/package.json \
  .github/scripts/package-lock.json
```

**What it does:** `cron-notify.yml` surfaces scheduled-job failures the same way
`ci-monitor` surfaces CI failures.

**Do not install `keepalive.yml`.** It pushes to `main` weekly, and the
default-branch ruleset every repo must have (with an empty bypass list) refuses
that — so under this standard the workflow is red on every run, not merely
unnecessary. It is also unnecessary: the 60-day auto-disable applies to public
repositories only and counts repository *inactivity*, which a repo where PRs land never approaches. If a genuinely idle
repo ever does trip the limit, GitHub emails admins and re-enabling is one click.
The template is retained only for a repo outside this standard; see
`MAINTAIN-REPO-USER-INSTRUCTIONS.md` → *Branch Protection*.

At the start of every new session, check for open `ci-failure` /
`pages-deploy-failure` issues and `codex-flagged` PR labels before starting work.

---

## Step 10 — Open the setup PR and verify the workflows trigger

Open the PR from the branch that now holds Steps 1–9. That PR is the test:

- [ ] `QA — Static + UI Tests` runs on the PR and goes green — a red static job
      at a missing file means a Step 1 script was skipped
- [ ] after the squash-merge, `QA — UI Tests (live)` runs once the deploy completes — `pages-build-deployment` on branch-source, `Pages Deploy` on Actions-source (before the first page exists, `Pages Deploy` publishes nothing and the live suite is skipped; Step 9d-bis)
- [ ] `QA — Event-Driven Response` is visible in the Actions tab and ready for dispatch

---

## Reference — placeholders, secrets, and variables

Key values to customize after copying:

| Value | What to substitute |
|---|---|
| `REPLACE_WITH_YOUR_APP_URL` (`playwright.config.js`) | Live app URL fallback when the `APP_URL` env var is unset |
| `UI_TESTS_DIR` (all qa workflows) | Path to your Playwright test directory (default: `.github/scripts/ui-tests`) |

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

Optional repository variables (the qa workflows pass them through the `ui-suite` composite; unset keeps the default behaviour):

| Variable | Purpose |
|---|---|
| `TEST_AUTH_READY_SELECTOR` | A selector matching whichever auth outcome occurs — the gate itself OR the authenticated app shell — so "no auth gate" is reported `proven` rather than `windowed` (`test.md`). A variable, not a secret: a masked selector is unreadable in a failure message |
| `TEST_AUTH_READY_REQUEST` | Alternative to the selector: a substring of the URL of the request whose settling decides the auth outcome |
| `TEST_AUTH_SUCCESS_SELECTOR` | A selector only the signed-in view shows; S2 fails unless it is visible after submitting the credential (#379). Unset, S2 reads the gate clearing as success. A variable, not a secret |
| `APP_PAGES` | Extra HTML entry points beyond `APP_URL`, comma-separated and relative to it (e.g. `admin.html,vendor/console.html`); each gets the ENTRY load gate. Unset, only the base URL is covered |

---

## Verification Checklist

- [ ] `.github/workflows/qa.yml` present and triggering on PRs to `main` and pushes to `main`
- [ ] `.github/workflows/qa-live.yml` present and triggering after Pages deploy
- [ ] `.github/workflows/qa-response.yml` present and ready for dispatch — part of the standard set, and `ci-monitor.yml` and `ci-notify.yml` watch it
- [ ] `.github/workflows/ci-monitor.yml` present, `workflow_run.workflows` filled in, manual dispatch verified
- [ ] `.github/workflows/codex-monitor.yml` present
- [ ] `.github/workflows/pages-monitor.yml` present, and — if Pages is Actions-sourced — carrying a `workflow_run` trigger naming the deploy workflow
- [ ] `.github/workflows/pages-retry.yml`: **branch-source** → present, with its `REQUIRED` entry; **Actions-source** → absent with no entry, **or** repointed under W3's exception with the entry updated to the deploy's name (Step 9d)
- [ ] `.github/workflows/pages-deploy.yml`: **Actions-source** → present, `BUILD_CMD`/`SITE_DIR` filled in (empty and `.` without a build), with `.github/pages-deny.txt` (and `.github/pages-public.txt` if any internal-looking path must stay public); **branch-source** → absent (Step 9d-bis)
- [ ] `.github/workflows/ci-notify.yml` present, watch list matching the QA workflows installed
- [ ] `.github/workflows/cron-notify.yml` present if the project has a scheduled task, absent otherwise; `keepalive.yml` ABSENT — it cannot run under the required ruleset (Step 9f)
- [ ] `.github/actions/secret-scan/` and `.github/actions/ui-suite/` present — the qa workflows reference them as `./.github/actions/*` and every run fails at step resolution without them
- [ ] `.github/actions/ui-suite/validate-report-path.py` present — the composite runs it as `$GITHUB_ACTION_PATH/validate-report-path.py` in its FIRST step, so a ui-suite directory holding only `action.yml` fails every UI job immediately. A composite's siblings install with its YAML, never after it
- [ ] `.github/scripts/` holds the five scripts `qa.yml`'s static job runs — `check-contrast.js`, `workflow-ref-guard.py`, `check-job-bounds.py`, `check-py-warnings.py`, `check-ui-suite-env.py` (Step 1)
- [ ] `.github/workflow-ref-required.json` present (workflow cross-reference guard)
- [ ] `.github/scripts/ui-tests/package-lock.json` committed (setup-node cache requires it)
- [ ] `.github/scripts/check-ui-viewports.js` present — the `ui-suite` composite names it by path and every UI job fails at step resolution without it
- [ ] `APP_URL` set as repository variable
- [ ] `TEST_AUTH_CREDENTIAL` set as repository secret — or deliberately NOT set, because the app has no login, or because its login ships a working credential in a visible, editable password field and the suite submits what the form holds (directives#312)
- [ ] `TEST_AUTH_EMAIL` set as repository secret if the app's gate is email+password (directives#304) or identifier-first/split-step (directives#310)
- [ ] GitHub Pages enabled on the chosen source, and its deploy visible in Actions — `pages-build-deployment` (branch-source) or `Pages Deploy` (Actions-source, never "Deploy from a branch")
- [ ] At least one successful run of each workflow confirmed

---
