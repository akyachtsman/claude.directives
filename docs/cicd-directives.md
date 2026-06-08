# Directives: CI/CD Automation

Apply the following templates and instructions to each new project so that QA runs automatically in CI/CD with minimal per-project configuration.

---

## Overview

Two GitHub Actions workflows replace manual agent invocation for the mechanical parts of the QA pipeline:

| Workflow | Trigger | What it runs |
|---|---|---|
| `qa.yml` | PR to main, push to feature branches | Static checks + Playwright against local server |
| `qa-live.yml` | After GitHub Pages deployment completes, or manual dispatch | Playwright against the live deployed URL |

The AI agent steps (code-reviewer, security-reviewer, pr-readiness-reviewer) remain manually invoked via Claude Code. Add them to CI only if `ANTHROPIC_API_KEY` is available as a repository secret.

---

## Workflow Templates

The canonical workflow files live in `templates/workflows/`. Copy them into each project's `.github/workflows/`:

- [`templates/workflows/qa.yml`](../templates/workflows/qa.yml) — Static Checks + UI Tests (local server)
- [`templates/workflows/qa-live.yml`](../templates/workflows/qa-live.yml) — Live UI Tests (GitHub Pages)
- [`templates/workflows/qa-response.yml`](../templates/workflows/qa-response.yml) — Event-Driven QA Response

Do not edit the templates in place. Copy to the target project, then customize the `REPLACE_*` placeholders.

---

## Per-Project Setup

See [`templates/CICD-SETUP.md`](../templates/CICD-SETUP.md) for the full step-by-step setup checklist.

Key values to replace after copying:

| Placeholder | What to substitute |
|---|---|
| `REPLACE_SCRIPT_NAME` | Name of your main backend script (e.g. `update-heatmap`) |
| `UI_TESTS_DIR` | Path to your Playwright test directory (default: `.github/scripts/ui-tests`) |

Required repository secrets:

| Secret | Purpose |
|---|---|
| `TEST_AUTH_CREDENTIAL` | Valid credential for Playwright login test |
| `AIRTABLE_API_KEY` | Airtable personal access token (if using Airtable backend) |

Required repository variable:

| Variable | Purpose |
|---|---|
| `APP_URL` | Live GitHub Pages URL (e.g. `https://username.github.io/repo/`) |
