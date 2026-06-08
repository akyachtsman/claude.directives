# CLAUDE.md Project Instructions

This file gives Claude Code and local subagents project-specific operating instructions. Copy this template into the target repository as `CLAUDE.md`, then customize every placeholder before relying on the agents.

## Project Overview

- Project name: `<project-name>`
- Primary stack: `<language/framework/runtime>`
- Application type: `<web app/API/CLI/library/mobile/etc.>`
- Package manager: `<npm/pnpm/yarn/pip/uv/poetry/cargo/go/etc.>`
- Main source directories: `<src/, app/, packages/*, etc.>`
- Main test directories: `<tests/, __tests__/, spec/, etc.>`

## Required Commands

Use these commands before marking work complete.

| Purpose | Command | Notes |
| --- | --- | --- |
| Install dependencies | `<install command>` | `<required versions, flags, cache notes>` |
| Run all tests | `<test command>` | `<unit/integration coverage notes>` |
| Run targeted tests | `<targeted test command>` | `<how to select tests>` |
| Lint | `<lint command>` | `<required before PR?>` |
| Type check | `<typecheck command>` | `<if applicable>` |
| Build | `<build command>` | `<required before PR?>` |
| Security/dependency audit | `<audit command>` | `<if applicable>` |
| Format | `<format command>` | `<formatting policy>` |

## Environment Setup

- Required runtime versions: `<Node/Python/Ruby/Go/Rust/etc.>`
- Required environment variables: `<names only; never put secret values here>`
- Local services: `<database/cache/queue/mock server/etc.>`
- Database setup: `<migration/seed/reset commands>`
- Mock setup: `<mock server, fixtures, test doubles>`
- Network requirements: `<offline ok? external APIs mocked?>`

## CI Expectations

- CI provider: `<GitHub Actions/GitLab/etc.>`
- Required checks: `<test/lint/build/typecheck/audit>`
- Branch policy: `<required approvals/status checks>`
- Expected CI runtime: `<duration>`
- Known CI-only requirements: `<secrets/services/matrix>`

## Agent Workflow

Recommended feature workflow:

1. Create a feature branch.
2. Implement the change.
3. Run basic self-tests (lint, syntax, secret scan).
4. Write `.agent-reports/implementation-summary.md`.
5. Invoke `test-verifier` as an independent static QA reviewer.
6. Deploy the change to the live URL (push to GitHub Pages branch).
7. Invoke `ui-tester` — provide the live app URL and valid test credentials.
   - ui-tester will loop with the orchestrator until all scenarios pass or escalation.
8. Invoke `code-reviewer`.
9. Invoke `security-reviewer` if the change touches auth, input handling, data access,
   secrets, dependencies, file handling, infrastructure, or sensitive data.
10. Fix issues in the parent session.
11. Re-run `test-verifier` and `ui-tester` after fixes.
12. Invoke `pr-readiness-reviewer`.

Or run the full pipeline with: invoke `qa-pipeline`.

### UI Test Configuration (required for ui-tester)

Add these to your project CLAUDE.md so ui-tester can discover them:

| Key | Value |
| --- | --- |
| App URL | `https://<github-user>.github.io/<repo>/` |
| Valid test PIN | `<a real employee PIN — read-only test account preferred>` |
| Invalid test PIN | `9999` (or any 4 digits not in the employee table) |
| Primary nav button | Label of the first feature button (e.g. `Morning`) |
| Primary content selector | CSS selector for loaded content (e.g. `.task`) |
| Nav cards | All top-level menu card labels (e.g. `['Morning', 'Evening', 'Dashboard']`) |

## Agent Inputs

These values are read by spawned agents at runtime. Fill in all fields before invoking any agent.

| Value | Description |
|---|---|
| Live URL | The deployed app URL agents test against |
| Playwright test directory | Path to the ui-tests folder (e.g. `.github/scripts/ui-tests`) |
| Required Commands | Validation commands agents run (HTML, YAML, JS syntax, audit) — see Required Commands above |
| Security constraints | Known accepted risks specific to this project |
| Key selectors | Login screen selector, home screen selector, error element selector |

## Reporting Requirements

Store agent evidence in `.agent-reports/` unless the project uses another path.

- Implementation summary: `.agent-reports/implementation-summary.md`
- Test report: `.agent-reports/test-report.md`
- UI test report: `.agent-reports/ui-test-report.md`
- Playwright results: `.agent-reports/playwright-results.json`
- Screenshots (on failure): `.agent-reports/screenshots/`
- Code review report: `.agent-reports/code-review-report.md`
- Security review report: `.agent-reports/security-review-report.md`
- PR readiness report: `.agent-reports/pr-readiness-report.md`

## Coding Standards

- Follow existing project patterns before introducing new abstractions.
- Keep changes focused and reviewable.
- Prefer clear names over clever names.
- Do not commit secrets, local-only files, generated artifacts, or unrelated changes.
- Add or update tests for behavior changes.
- Document intentional gaps, tradeoffs, and follow-ups in the implementation summary.

## Safety Rules for Agents

- Reviewer agents must not edit code unless explicitly instructed.
- Test commands should not require production credentials.
- Destructive commands, data resets, migrations, or deployment actions require explicit user approval.
- If a check cannot run in the local environment, explain why and identify the closest substitute.
