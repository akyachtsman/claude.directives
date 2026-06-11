# Usage Guide

How agents and skills get into a project, and where their reports go. Agents and
skills are **not** a committed runtime dependency — they bootstrap fresh from
`claude.directives` each session.

## Installation

- **New project:** run `/new.repo` (see `NEW-PROJECT-QUICKSTART.md`). It scaffolds
  `CLAUDE.md`, the CI workflows, the Playwright kit, and the hooks, and bootstraps
  skills + agents from this repo.
- **Existing project:** at session start the Skill Bootstrap block (in
  `directives/global.md`) fetches `.claude/skills/` and `.claude/agents/` fresh.
  Agents are gitignored — re-fetched each session, never committed.

Agents available: the `qa/` reviewers (`test-verifier`, `code-reviewer`,
`security-reviewer`, `pr-readiness-reviewer`, `qa-pipeline`, `ui-tester`,
`test-monitor`) and `data/supabase`.

## Review Boundaries

- Reviewer agents (`test-verifier`, `code-reviewer`, `security-reviewer`,
  `pr-readiness-reviewer`) do **not** edit code — fixes happen in the parent
  session, which then re-runs the verifier to confirm no regressions.

## Project-Specific Commands

Document the project's validation commands in its `CLAUDE.md` (e.g. HTML and
workflow-YAML validation, plus lint/tests where applicable) — agents run these as
part of review.

## Reports

Agents write evidence to `.agent-reports/`:

- `.agent-reports/implementation-summary.md`
- `.agent-reports/test-report.md`
- `.agent-reports/ui-test-report.md`
- `.agent-reports/code-review-report.md`
- `.agent-reports/security-review-report.md`
- `.agent-reports/pr-readiness-report.md`

Use the templates in `templates/` to keep reports consistent.
