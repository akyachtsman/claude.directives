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
| `directives/data.md` | Exported data/backend directive (backend provider, keys, RLS, MCP config) |
| `CLAUDE.md` | This file — internal repo-ops, not imported |
| `NEW-REPO-USER-INSTRUCTIONS.md` | Bootstrap guide for spinning up a new project repo |
| `.claude-plugin/marketplace.json` | This repo doubles as a plugin marketplace (`claude-directives`) |
| `plugins/directives-toolkit/` | The installable toolkit plugin: 12 commands, 3 auto-skills, 8 agents, guard hooks. **Phase-1 dual-run:** content mirrors `.claude/` (parity enforced by `check-plugin.js`); `.claude/skills` + `agents` retire in Phase 2 once the plugin path is proven downstream. **Web sessions never auto-install plugins** — each project's claude.ai environment setup script must run the install (see `NEW-REPO-USER-INSTRUCTIONS.md` step 7) |
| `.claude/skills/` | Personal skill files, invoked by typing the skill name |
| `.claude/settings.json` | Claude Code hooks for this repo (incl. the `update.pages` reminder on Pages-file edits) |
| `.claude/agents/` | Agent definitions in purpose-based subfolders (`qa/` and `data/` today); loaded recursively into sessions on this repo |
| `templates/workflows/` | CI/CD workflow templates projects copy into `.github/workflows/` |
| `templates/ui-tests/` | Playwright test kit projects copy into `.github/scripts/ui-tests/` |
| `templates/scripts/` | Optional scheduled-task scripts (`notify-email.js`) projects copy into `.github/scripts/` |
| `templates/claude-settings.json` | Project `.claude/settings.json` template (hooks) that `new.repo` installs into new projects |
| `docs/` | Reference docs (automations, CI triage, testing, code review, …); see `docs/README.md` for the role-grouped index |
| `.github/workflows/` | This repo's self-test CI (`qa.yml`, `ci-monitor.yml`, `codex-monitor.yml`, `pages-monitor.yml`) |
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
- Use a **fresh** `claude/<name>` branch per change; after each squash-merge, cut the
  next from updated `main` rather than reusing/force-pushing one long-lived branch.
- Never commit directly to `main`.
- Open a draft PR immediately after first push; squash-merge when CI is green.
- Before merging, confirm the PR's diff is only the files you intended — a surprise
  file count means a stale/tangled branch; verify against GitHub, not the local clone.

## Session Start
1. Read all Imported Directive URLs above fully
2. Bootstrap skills and agents per the Skill Bootstrap block in global.md
3. Confirm active branch: `git branch --show-current`
4. Run `env.chk` and report status — this includes the `scope.chk` repo-scope
   verification (global.md's Session Start step 2), so it need not be run separately here

## Mid-session change semantics
What a live session sees when these files change mid-session — don't assume
everything hot-reloads:
- `.claude/skills/` — **live at next invocation** (skill files are read when typed).
- `CLAUDE.md` and `directives/` — **stale until re-read**: the copy injected at
  session start does not update. The PostToolUse hook reminds on CLAUDE.md
  edits; `refresh.repo` Phase 0 re-reads CLAUDE.md + directives explicitly.
- `.claude/settings.json` hooks and `.claude/agents/` — **loaded at session
  start only**; changes take effect in the NEXT session (the hook says so when
  these files are edited).

## Self-test monitoring (this repo's CI)
A directive repo must pass its own CI before it can be trusted downstream.
- `qa.yml` — `QA — Directive Validation`: internal link check (hard fail, verified
  against the local working tree), path-existence check, required-section check,
  workflow YAML validation, plus a warn-only external-link job.
- `ci-monitor.yml` — fires when `QA — Directive Validation` completes; on failure
  opens/updates a deduplicated `ci-failure` tracking issue.
- `codex-monitor.yml` — fires on Codex PR reviews; adds a `codex-flagged` label
  when Codex raised concerns.
- `pages-monitor.yml` — fires on every Pages build (`page_build`); verifies the
  deploy is live and on a problem opens/updates a deduplicated
  `pages-deploy-failure` issue (success → job summary only). The zero-model
  counterpart to the `update.pages` skill.

See `docs/repo-monitors.md` for this repo's monitor detail, and `docs/automations.md` for escalation rules and the exported automation standard.
See `docs/ci-triage.md` for triage on `ci-failure` issues and `codex-flagged` PRs.

## Skills
Personal skills live in `.claude/skills/` and are the live source of truth —
type `my.list` for the current menu. Notable operational skills:
- `do.repo` — run a command (`inspect` / `compare <target>` / `audit`) against
  any public GitHub repo via `gh api`, read-only, without cloning.
- `update.pages` — standard procedure for any change that updates the Pages site:
  run gates, push, watch the deploy to a terminal state, and report live / stuck
  / failed proactively (encodes the stuck-pipeline toggle and cache gotchas).
- `scope.chk` — report the session's true repository scope (which repos the GitHub
  MCP can act on, whether others can be added) so cross-repo access is never
  overclaimed; run at startup or whenever a session drifts.

## Local gate — CI scripts (this repo)
Before committing or pushing, verify locally — this list mirrors what `qa.yml`
runs, so keep the two in sync:
```
node .github/scripts/check-paths.js
node .github/scripts/check-sections.js
node .github/scripts/check-plugin.js
node .github/scripts/check-links.js --internal   # set GITHUB_REPOSITORY + GITHUB_TOKEN
python3 -c "import yaml, glob; [yaml.safe_load(open(f)) for f in glob.glob('.github/workflows/*.yml') + glob.glob('templates/workflows/*.yml')]"
diff .claude/settings.json templates/claude-settings.json   # paired files (also codex/pages monitor template pairs)
```
Confirm `git status` shows no unintended changes. If any check fails, fix it
before pushing rather than pushing and fixing on the PR.

## Escalation rules
Stop and ask the user before:
- Deleting any file that exists on `main`.
- Modifying any workflow file's trigger conditions.
- Pushing after 3 consecutive CI failures on the same branch.

## Skill Bootstrap

Skills and agents bootstrap from this repo's `.claude/` at session start — the
canonical fetch block lives in `directives/global.md` (don't duplicate it here).
To add a skill or agent, drop a
`.md` file into `.claude/skills/` or the right `.claude/agents/<domain>/` bucket
here (`qa/` and `data/` today; `scrape/`, … as new types appear). `name:` values must
stay unique across the whole agent tree — the subfolder does not disambiguate.
