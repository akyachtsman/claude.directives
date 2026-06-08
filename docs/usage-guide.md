# Usage Guide

This repository stores reusable Claude Code review and verification templates. Use it as a starting point for each software project, not as a centralized runtime dependency.

## Basic Setup

1. Clone or download this repository.
2. From a target project, run `scripts/install-agents.sh` or `scripts/install-agents.ps1`.
3. Edit the generated `CLAUDE.md` in the target project.
4. Customize local `.claude/agents/*.md` files if the project needs special review rules.
5. Add `.agent-reports/` to your workflow for implementation summaries and review reports.

## What Gets Installed

- `.claude/agents/test-verifier.md`
- `.claude/agents/code-reviewer.md`
- `.claude/agents/security-reviewer.md`
- `.claude/agents/pr-readiness-reviewer.md`
- `CLAUDE.md` if it does not already exist

## Define Project-Specific Commands

Every target project should document these commands in `CLAUDE.md`:

- Install command
- Test command
- Targeted test command
- Lint command
- Typecheck command
- Build command
- Format command
- Security or dependency audit command
- Environment setup command
- Database migration, seed, reset, and mock setup commands
- CI expectations and required checks

## Reports

Recommended report paths:

- `.agent-reports/implementation-summary.md`
- `.agent-reports/test-report.md`
- `.agent-reports/code-review-report.md`
- `.agent-reports/security-review-report.md`
- `.agent-reports/pr-readiness-report.md`

Use the templates in `templates/` to keep reports consistent.
