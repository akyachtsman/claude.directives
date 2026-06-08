# CI/CD Setup Checklist

> ## ⚠️ One-Time Human Step (per GitHub account)
>
> **Before any CI/CD email notifications will work, the repo owner must enable GitHub's built-in failure emails — this cannot be done by an agent:**
>
> `github.com → avatar → Settings → Notifications → GitHub Actions → enable "Send notifications for failed workflows"`
>
> Takes 30 seconds. Applies to all repos under the account automatically. Do this once.

Step-by-step guide for deploying the QA pipeline to a new project repo. Follow in order — each step must complete before the next.

## Prerequisites

- Target repo exists on GitHub with source files committed to `main`
- `claude.directives` is accessible (public repo) for fetching templates
- Project's `CLAUDE.md` contains the app URL and auth credential
- Claude Code session is active with GitHub MCP access to the target repo

---

## Step 1 — Copy workflow templates

Copy all three workflow templates from `claude.directives` into the target repo's `.github/workflows/`:

```bash
mkdir -p .github/workflows

# Fetch from the public template repo
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/qa.yml \
  -o .github/workflows/qa.yml

curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/qa-live.yml \
  -o .github/workflows/qa-live.yml

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

Copy the template and **edit the `workflow_run.workflows` list** to match your project's
CI workflow names (`grep '^name:' .github/workflows/*.yml` to find them):

```bash
curl -sL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/workflows/ci-monitor.yml \
  -o .github/workflows/ci-monitor.yml
# Edit workflow_run.workflows: replace 'QA — Directive Validation' with your project's CI workflow name(s)
```

This is a **template, not a drop-in** — skipping the name edit means the monitor
never fires on real CI events.

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

At the start of every new session, check for open `ci-failure` issues and
`codex-flagged` PR labels before starting work.

---

## Verification Checklist

- [ ] `.github/workflows/qa.yml` present and triggering on push/PR
- [ ] `.github/workflows/qa-live.yml` present and triggering after Pages deploy
- [ ] `.github/workflows/qa-response.yml` present and ready for dispatch
- [ ] `.github/workflows/ci-monitor.yml` present, `workflow_run.workflows` filled in, manual dispatch verified
- [ ] `.github/workflows/codex-monitor.yml` present
- [ ] `APP_URL` set as repository variable
- [ ] `TEST_AUTH_CREDENTIAL` set as repository secret
- [ ] GitHub Pages enabled and `pages-build-deployment` visible in Actions
- [ ] At least one successful run of each workflow confirmed
