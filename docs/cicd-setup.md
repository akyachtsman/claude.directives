# CI/CD Setup Checklist

> ## ⚠️ One-Time Human Step (per GitHub account)
>
> **Before any CI/CD email notifications will work, the repo owner must enable GitHub's built-in failure emails — this cannot be done by an agent:**
>
> `github.com → avatar → Settings → Notifications → GitHub Actions → enable "Send notifications for failed workflows"`
>
> Takes 30 seconds. Applies to all repos under the account automatically. Do this once.

Step-by-step guide for deploying the QA pipeline to a new project repo. Follow in order — each step must complete before the next.

> This is the **single canonical install procedure** (it absorbed the former
> `docs/cicd-directives.md`). Other docs link here rather than carrying their
> own copy of these instructions.

## Overview

Two GitHub Actions workflows replace manual agent invocation for the mechanical parts of the QA pipeline:

| Workflow | Trigger | What it runs |
|---|---|---|
| `qa.yml` | PR to main, push to feature branches | Static checks + Playwright against local server |
| `qa-live.yml` | After GitHub Pages deployment completes, or manual dispatch | Playwright against the live deployed URL |
| `qa-response.yml` *(optional)* | `repository_dispatch` / manual dispatch | Static checks + Playwright against the live URL |

Three event-driven monitors run alongside them: `ci-monitor.yml`, `codex-monitor.yml`, and `pages-monitor.yml` (Step 9).

The AI agent steps (code-reviewer, security-reviewer, pr-readiness-reviewer) remain manually invoked via Claude Code. Add them to CI only if `ANTHROPIC_API_KEY` is available as a repository secret.

Do not edit the templates in place in `claude.directives` — copy to the target project, then customize.

## Prerequisites

- Target repo exists on GitHub with source files committed to `main`
- `claude.directives` is accessible (public repo) for fetching templates
- Project's `CLAUDE.md` contains the app URL and auth credential
- Claude Code session is active with GitHub MCP access to the target repo

---

## Step 1 — Copy workflow templates

Copy the two core QA workflow templates from `claude.directives` into the target repo's `.github/workflows/`:

```bash
mkdir -p .github/workflows

# Fetch from the public template repo
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/qa.yml \
  -o .github/workflows/qa.yml

curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/qa-live.yml \
  -o .github/workflows/qa-live.yml
```

Optional — event-driven QA dispatch hook (add if sessions/automations should be
able to trigger QA via `repository_dispatch`):

```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/qa-response.yml \
  -o .github/workflows/qa-response.yml
```

Alternatively, have the active Claude Code session fetch and write these files via GitHub MCP tools if no CLI is available.

---

## Step 2 — Set UI_TESTS_DIR

In all three workflow files, confirm `UI_TESTS_DIR` points to the correct path for the project's Playwright test directory (default: `.github/scripts/ui-tests`). Edit if different.

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

Drop-in — copy it verbatim. It ships pre-wired to watch the QA workflow that comes
with it (`qa.yml` → `QA — Static + UI Tests`):

```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/ci-monitor.yml \
  -o .github/workflows/ci-monitor.yml
```

Only edit `workflow_run.workflows` if you rename `qa.yml`'s `name:` or want it to
watch additional workflows (`grep '^name:' .github/workflows/*.yml` to find them).

After pushing, verify with a manual `workflow_dispatch` run before relying on it.

**What it does:** fires the instant a watched CI workflow finishes (`workflow_run`);
on failure, opens or updates a single `ci-failure` tracking issue. Uses only
`GITHUB_TOKEN`. No secrets required.

### 9b — Codex Monitor

Drop-in, no customization needed:

```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/codex-monitor.yml \
  -o .github/workflows/codex-monitor.yml
```

**What it does:** fires when the Codex bot submits a PR review with concerns; adds
a `codex-flagged` label to the PR. Uses only `GITHUB_TOKEN`.

### 9c — Pages Monitor

Drop-in, portable as-is (the live URL is derived from the repo):

```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/pages-monitor.yml \
  -o .github/workflows/pages-monitor.yml
```

**What it does:** fires on every GitHub Pages build (`page_build`); verifies the
build status and that the live URL serves HTTP 200 (cache-busted retries); on a
problem opens/updates a single `pages-deploy-failure` tracking issue, and closes
it on the next healthy deploy. Uses only `GITHUB_TOKEN`.

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
- [ ] `.github/workflows/qa-response.yml` present and ready for dispatch (optional)
- [ ] `.github/workflows/ci-monitor.yml` present, `workflow_run.workflows` filled in, manual dispatch verified
- [ ] `.github/workflows/codex-monitor.yml` present
- [ ] `.github/workflows/pages-monitor.yml` present
- [ ] `.github/scripts/ui-tests/package-lock.json` committed (setup-node cache requires it)
- [ ] `APP_URL` set as repository variable
- [ ] `TEST_AUTH_CREDENTIAL` set as repository secret
- [ ] GitHub Pages enabled and `pages-build-deployment` visible in Actions
- [ ] At least one successful run of each workflow confirmed
