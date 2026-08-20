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

Two GitHub Actions workflows replace manual agent invocation for the mechanical parts of the QA pipeline:

| Workflow | Trigger | What it runs |
|---|---|---|
| `qa.yml` | PR to main, push to feature branches | Static checks + Playwright against local server |
| `qa-live.yml` | After GitHub Pages deployment completes, or manual dispatch | Playwright against the live deployed URL |
| `qa-response.yml` | `repository_dispatch` / manual dispatch | Static checks + Playwright against the live URL |

Five event-driven monitors run alongside them: `ci-monitor.yml`, `codex-monitor.yml`, `pages-monitor.yml`, `pages-retry.yml`, and `ci-notify.yml` (Step 9), plus `cron-notify.yml` / `keepalive.yml` for scheduled jobs.

The AI review steps (the official `pr-review-toolkit` code review, the `/security-review` skill, and `pr-readiness-reviewer`) remain manually invoked via Claude Code. Add them to CI only if `ANTHROPIC_API_KEY` is available as a repository secret.

Do not edit the templates in place in `claude.directives` — copy to the target project, then customize.

> This procedure is the **static tier** (GitHub Pages). For a **production-tier**
> project (React + Next.js + Supabase — `global.md` → *Hosting & Deployment*),
> Vercel owns build + deploy; see **Production tier — Vercel** at the end.

## Prerequisites

- Target repo exists on GitHub with source files committed to `main`
- `claude.directives` is accessible (public repo) for fetching templates
- Project's `CLAUDE.md` contains the app URL and auth credential
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
```

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

In the target repo on GitHub:

`Settings → Secrets and variables → Actions → Secrets → New repository secret`

| Name | Value |
|---|---|
| `TEST_AUTH_CREDENTIAL` | Auth credential from `CLAUDE.md` (PIN, password, or token) |

Add any additional backend API secrets the app requires (e.g. read-only API tokens for test accounts).

---

## Step 6 — Enable GitHub Pages

`Settings → Pages → Source → Deploy from a branch → Branch: main → / (root)`

Save. GitHub will create the `pages-build-deployment` workflow automatically. This is what triggers `qa-live.yml`.

---

## Step 7 — Verify pages-build-deployment appears

Go to the target repo's `Actions` tab. Confirm `pages-build-deployment` appears in the workflow list after enabling Pages. It may take one push to appear.

---

## Step 8 — Push a test commit and verify workflows trigger

Make a small no-op commit (e.g. add a blank line to `README.md`) and push to `main`:

```bash
git commit --allow-empty -m "ci: verify QA workflows trigger" && git push
```

Confirm in the Actions tab that:
- [ ] `QA — Static + UI Tests` triggers on push
- [ ] `QA — UI Tests (live)` triggers after `pages-build-deployment` completes
- [ ] `QA — Event-Driven Response` is visible and ready for dispatch

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
name for a standard workflow you chose not to install — every entry must resolve
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
clears it on a Codex all-clear naming the current head SHA.
Behavior detail: `docs/standards/automations.md` → Automation 3.

### 9c — Pages Monitor

Drop-in for a **branch-source** Pages project (the live URL is derived from the
repo). ⚠️ **If Settings → Pages → Source is "GitHub Actions"**, `page_build`
never fires and this monitor is inert until you add a `workflow_run` trigger
naming your own deploy workflow — the template header carries the snippet, and
the same name must be added to `qa-live.yml`'s watch list. Do NOT add it to
`pages-retry.yml` — unless that deploy is provably idempotent and you record why
in the project's CLAUDE.md, which is the one exception W3 grants (Step 9d spells
it out). Rules: `docs/standards/automations.md` → *Watcher Rules*
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
fires. Install the guard so a broken cross-reference fails the build instead of
going quiet:

```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/scripts/workflow-ref-guard.py \
  -o .github/scripts/workflow-ref-guard.py
```

`qa.yml` already invokes it. Populate `.github/workflow-ref-required.json` with
the watchers this project must not lose — the script is byte-identical in every
repo, so its second rule is configured here rather than edited into the file:

```json
{ "qa-live.yml": ["My Deploy Workflow"] }
```

Add to the static-checks job: `python3 .github/scripts/workflow-ref-guard.py`.
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

### 9d — Pages Retry

Drop-in, portable as-is:

```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/pages-retry.yml \
  -o .github/workflows/pages-retry.yml
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
provably idempotent and the reasoning is recorded in the project's CLAUDE.md
(`docs/standards/automations.md` → *Watcher Rules*, W3); (2) it only arms once
it's on the default branch, so it covers the *next* deploy, not the one that adds
it.

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
no success signal at all. Behavior detail: `docs/standards/automations.md` →
Automation 4c.

⚠️ `workflow_run` triggers are read from the DEFAULT branch, so this workflow can
never wake the PR that installs it. Verify on the first post-install PR; don't
call it a dud.

### 9f — Scheduled-job notifications and keepalive

Both are drop-ins; install them if the project has scheduled workflows:

```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/cron-notify.yml \
  -o .github/workflows/cron-notify.yml
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/keepalive.yml \
  -o .github/workflows/keepalive.yml
```

**What they do:** `cron-notify.yml` surfaces scheduled-job failures the same way
`ci-monitor` surfaces CI failures; `keepalive.yml` keeps scheduled workflows from
being auto-disabled after 60 days of repository inactivity.

At the start of every new session, check for open `ci-failure` /
`pages-deploy-failure` issues and `codex-flagged` PR labels before starting work.

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
| `TEST_AUTH_CREDENTIAL` | Valid credential for Playwright login test |
| `DB_SERVICE_KEY` | Backend service-role key — server-side only (required by the project's scheduled data workflow, if any) |

Required repository variables:

| Variable | Purpose |
|---|---|
| `APP_URL` | Live GitHub Pages URL (e.g. `https://<username>.github.io/<repo>/`) |
| `DB_URL` | Backend project/connection URL (safe in a variable; the client/anon key relies on RLS) |

---

## Verification Checklist

- [ ] `.github/workflows/qa.yml` present and triggering on push/PR
- [ ] `.github/workflows/qa-live.yml` present and triggering after Pages deploy
- [ ] `.github/workflows/qa-response.yml` present and ready for dispatch — part of the standard set; if omitted, remove `QA — Event-Driven Response` from the `ci-monitor.yml` and `ci-notify.yml` watch lists
- [ ] `.github/workflows/ci-monitor.yml` present, `workflow_run.workflows` filled in, manual dispatch verified
- [ ] `.github/workflows/codex-monitor.yml` present
- [ ] `.github/workflows/pages-monitor.yml` present, and — if Pages is Actions-sourced — carrying a `workflow_run` trigger naming the deploy workflow
- [ ] `.github/workflows/pages-retry.yml` present (branch-source Pages projects)
- [ ] `.github/workflows/ci-notify.yml` present, watch list matching the QA workflows installed
- [ ] `.github/workflows/cron-notify.yml` / `keepalive.yml` present (projects with scheduled jobs)
- [ ] `.github/actions/secret-scan/` and `.github/actions/ui-suite/` present — the qa workflows reference them as `./.github/actions/*` and every run fails at step resolution without them
- [ ] `.github/workflow-ref-required.json` present (workflow cross-reference guard)
- [ ] `.github/scripts/ui-tests/package-lock.json` committed (setup-node cache requires it)
- [ ] `APP_URL` set as repository variable
- [ ] `TEST_AUTH_CREDENTIAL` set as repository secret
- [ ] GitHub Pages enabled and `pages-build-deployment` visible in Actions
- [ ] At least one successful run of each workflow confirmed

---

## Production tier — Vercel

For a project on the **production tier** (React + Next.js + Supabase — see
`global.md` → *Hosting & Deployment*), **Vercel owns the build and deploy**; the
Pages-specific steps above (Step 6–7 enable Pages, Step 9c `pages-monitor`) do not
apply. Development stays browser-only — Vercel builds on push, nothing local.

1. **Scaffold** from `templates/nextjs-app/` (or graduate an existing static app
   into it). The design contract (`tokens.css` + `components.css`) carries over.
2. **Import to Vercel:** *Add New → Project →* import the GitHub repo. Vercel
   auto-detects Next.js and builds on every push — PRs get preview URLs, `main`
   deploys to production.
3. **Environment variables** (*Vercel → Settings → Environment Variables*) — add
   the Supabase keys from `templates/nextjs-app/.env.example`:
   `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client-safe) and
   `SUPABASE_SERVICE_ROLE_KEY` (mark **secret**; never `NEXT_PUBLIC_*`). RLS stays
   on (`directives/data.md`).
4. **CI is otherwise unchanged:** `qa.yml` static checks + `ci-monitor` /
   `codex-monitor` still run on the repo. Point `qa-live.yml`'s `APP_URL` at the
   Vercel production URL (or a stable preview) so the live Playwright suite runs
   against the real deploy. `pages-monitor.yml` is replaced by Vercel's own deploy
   status — drop it for this tier.
