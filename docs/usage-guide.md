# Usage Guide

How agents and skills get into a project, and where their reports go. Agents and
skills are **not** a committed runtime dependency — they bootstrap fresh from
`claude.directives` each session.

## Installation

- **New project:** run `/new-repo` (see `NEW-REPO-USER-INSTRUCTIONS.md` — its
  step 7 puts the plugin install in the environment setup script). It scaffolds
  `CLAUDE.md`, the CI workflows, the Playwright kit, and the plugin-enable
  settings.
- **Existing project:** the `directives-toolkit` plugin delivers all commands,
  skills, agents, and hooks (global.md → Skill Bootstrap). Nothing is fetched
  into `.claude/`; updates track this repo's `main` automatically.

Toolkit agents: `test-verifier`, `pr-readiness-reviewer`, `qa-pipeline`,
`ui-tester`, and `supabase`. Code review and security review come from
Anthropic-official sources instead — `pr-review-toolkit` agents and the
`security-guidance` plugin / built-in `/security-review` skill (installed by
the environment setup script, enabled in `.claude/settings.json`).

## Review Boundaries

- Reviewer agents (`test-verifier`, `pr-readiness-reviewer`, and the official
  `pr-review-toolkit` reviewers) do **not** edit code — fixes happen in the
  parent session, which then re-runs the verifier to confirm no regressions.

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
