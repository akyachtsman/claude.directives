# CLAUDE.md — Internal Repo Operations

> This file is **internal-only**. It governs sessions working *inside* this repo.
> It is **not** imported downstream. The exported, company-wide directives that
> other repos inherit live in `directives/` (`global.md`, `design.md`, `test.md`).

## Purpose
`claude.directives` is the single, consolidated home for the company-wide agent
standard. It merges the three former repos — `claude.global.directives`,
`claude.design.directives`, and `claude.test.directives` — into one repo. The
substance that downstream projects inherit lives in `directives/`; this file
covers only how to operate *on this repo*.

## Layout
| Path | Role |
|------|------|
| `directives/global.md` | Exported global directive (was global's DIRECTIVE.md) |
| `directives/design.md` | Exported design system (was design's DIRECTIVE.md) |
| `directives/test.md` | Exported test/QA directive (was test's DIRECTIVE.md) |
| `directives/data.md` | Exported data/backend directive (Supabase, RLS, MCP config) |
| `CLAUDE.md` | This file — internal repo-ops, not imported |
| `NEW-PROJECT-QUICKSTART.md` | Bootstrap guide for spinning up a new project repo |
| `.claude/skills/` | Personal skill files, invoked by typing the skill name |
| `.claude/agents/` | Agent definitions in purpose-based subfolders (`qa/` and `data/` today); loaded recursively into sessions on this repo |
| `templates/workflows/` | CI/CD workflow templates projects copy into `.github/workflows/` |
| `templates/ui-tests/` | Playwright test kit projects copy into `.github/scripts/ui-tests/` |
| `templates/agents/` | Installable copy of the agents (same `qa/`/`data/` subfolder layout) for downstream projects |
| `docs/` | Reference docs (automations, CI triage, testing, code review, handoff, …) |
| `.github/workflows/` | This repo's self-test CI (`qa.yml`, `ci-monitor.yml`, `codex-monitor.yml`) |
| `.github/scripts/` | Validation scripts run by `qa.yml` |

## How it's imported downstream
Projects import each directive by raw URL — the consolidated paths are:
```
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/global.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/design.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/test.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/data.md
```
When you change an exported directive, edit the file under `directives/` — never
relocate the export into this file.

## Branch policy
- Develop all changes on `claude/<name>` branches.
- Never commit directly to `main`.
- Open a draft PR immediately after first push; squash-merge when CI is green.

## Session Start
1. Read all Imported Directive URLs above fully
2. Bootstrap skills and agents per the Skill Bootstrap block in global.md
3. Confirm active branch: `git branch --show-current`
4. Run `env.chk` and report status

## Self-test monitoring (this repo's CI)
A directive repo must pass its own CI before it can be trusted downstream.
- `qa.yml` — `QA — Directive Validation`: internal link check (hard fail, verified
  against the local working tree), path-existence check, required-section check,
  workflow YAML validation, plus a warn-only external-link job.
- `ci-monitor.yml` — fires when `QA — Directive Validation` completes; on failure
  opens/updates a deduplicated `ci-failure` tracking issue.
- `codex-monitor.yml` — fires on Codex PR reviews; adds a `codex-flagged` label
  when Codex raised concerns.

See `docs/session-automations.md` for monitor detail and escalation rules.
See `docs/ci-triage.md` for triage on `ci-failure` issues and `codex-flagged` PRs.

## Skills
Personal skills live in `.claude/skills/` and are the live source of truth —
type `my.list` for the current menu. Notable operational skills:
- `do.repo` — run a command (`inspect` / `compare <target>` / `audit`) against
  any public GitHub repo via `gh api`, read-only, without cloning.

## Local gate — CI scripts (this repo)
Before committing or pushing, verify locally using this repo's scripts:
```
node .github/scripts/check-paths.js
node .github/scripts/check-sections.js
node .github/scripts/check-links.js --internal   # set GITHUB_REPOSITORY + GITHUB_TOKEN
```
Confirm `git status` shows no unintended changes. If any check fails, fix it
before pushing rather than pushing and fixing on the PR.

## Escalation rules
Stop and ask the user before:
- Deleting any file that exists on `main`.
- Modifying any workflow file's trigger conditions.
- Pushing after 3 consecutive CI failures on the same branch.

## Skill Bootstrap

At session start, bootstrap personal skills **and agents** from this repo using
the `gh` CLI. Agents live in purpose-based subfolders (e.g. `qa/`), so this walks
the tree recursively and preserves the subdirectory layout:
```bash
for dir in skills agents; do
  gh api "repos/akyachtsman/claude.directives/git/trees/main?recursive=1" \
    --jq ".tree[] | select(.type==\"blob\" and (.path|startswith(\".claude/$dir/\"))) | .path" \
  | while read -r p; do
    [ -f "$p" ] && continue            # skip files that already exist
    mkdir -p "$(dirname "$p")"
    gh api "repos/akyachtsman/claude.directives/contents/$p" --jq '.content' | base64 -d > "$p"
  done
done
```
Run this silently. Skip files that already exist. To add a skill or agent, drop a
`.md` file into `.claude/skills/` or the right `.claude/agents/<domain>/` bucket
here (`qa/` and `data/` today; `scrape/`, … as new types appear). `name:` values must
stay unique across the whole agent tree — the subfolder does not disambiguate.
