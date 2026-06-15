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
| `plugins/directives-toolkit/` | **The canonical toolkit** (Phase 2 complete — the old `.claude/skills` + `agents` are retired): 13 commands, 3 auto-skills, 5 agents, guard hooks incl. the push-gate. Generic code/security review is **not** maintained here — it comes from Anthropic-official sources (`pr-review-toolkit` + `security-guidance` plugins, built-in `/code-review` and `/security-review` skills); the toolkit keeps only workflow-specific agents. Edit plugin files directly; they are the source, not generated. **Web sessions never auto-install plugins** — each environment's setup script must run the install (see `NEW-REPO-USER-INSTRUCTIONS.md` step 7) |
| `.claude/settings.json` | Plugin enablement only (`extraKnownMarketplaces` + `enabledPlugins`); hooks ship inside the plugin |
| `templates/workflows/` | CI/CD workflow templates projects copy into `.github/workflows/` |
| `templates/ui-tests/` | Playwright test kit projects copy into `.github/scripts/ui-tests/` |
| `templates/scripts/` | Optional scheduled-task scripts (`notify-email.js`) projects copy into `.github/scripts/` |
| `templates/claude-settings.json` | Project `.claude/settings.json` template (marketplace + plugin enablement) that `/new-repo` installs into new projects |
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
2. Verify the directives-toolkit plugin attached (commands/agents resolve) per global.md → Skill Bootstrap
3. Confirm active branch: `git branch --show-current`
4. Run `/env-chk` and report status — this includes the `scope-chk` repo-scope
   verification (global.md's Session Start step 2), so it need not be run separately here
5. **Periodically** run `/audit-repo` — a structural/efficiency sweep for
   directive↔code drift, redundancy, and simplification opportunities. Not every
   session: run it when starting on a fresh `main`, or when the repo has changed
   materially since the last audit. Never let it delay the user's actual request —
   skip or defer if a task is already queued.

## Mid-session change semantics
What a live session sees when these files change mid-session — don't assume
everything hot-reloads:
- `CLAUDE.md` and `directives/` — **stale until re-read**: the copy injected at
  session start does not update. The plugin's PostToolUse hook reminds on
  CLAUDE.md edits; `/refresh-repo` Phase 0 re-reads CLAUDE.md + directives.
- `plugins/directives-toolkit/` — editing files here changes what the NEXT
  install delivers; the running session keeps its installed copy (web sessions
  reinstall fresh every container, so changes propagate at next session start).
- `.claude/settings.json` — **loaded at session start only**; changes take
  effect in the NEXT session.

## Self-test monitoring (this repo's CI)
A directive repo must pass its own CI before it can be trusted downstream.
- `qa.yml` — `QA — Directive Validation`: internal link check (hard fail, verified
  against the local working tree), path-existence check, required-section check,
  workflow YAML validation, a secret-scan-pattern sync check (the canonical regex
  stays byte-identical across `global.md` and the qa workflow templates), a
  design-theme parity check (the 10 schemes match between `design.md`, the
  showcase, and the bootstrap template) plus a WCAG-AA color-contrast audit, a
  non-blocking Playwright theme-contract job, plus a warn-only external-link job.
- `ci-monitor.yml` — fires when `QA — Directive Validation` completes; on failure
  opens/updates a deduplicated `ci-failure` tracking issue.
- `codex-monitor.yml` — fires on Codex PR reviews; adds a `codex-flagged` label
  when Codex raised concerns.
- `pages-monitor.yml` — fires on every Pages build (`page_build`); verifies the
  deploy is live and on a problem opens/updates a deduplicated
  `pages-deploy-failure` issue (success → job summary only). The zero-model
  counterpart to the `update-pages` skill.

See `docs/repo-monitors.md` for this repo's monitor detail, and `docs/automations.md` for escalation rules and the exported automation standard.
See `docs/ci-triage.md` for triage on `ci-failure` issues and `codex-flagged` PRs.

## Toolkit (commands, skills, agents, hooks)
Everything ships in the `directives-toolkit` plugin (`plugins/directives-toolkit/`
— the live source of truth; edit there). Commands invoke as `/env-chk`,
`/refresh-repo`, `/audit-repo`, …; auto-skills (`update-pages`, `scope-chk`,
`doc-comp`) fire on description match; agents are namespaced
`directives-toolkit:*`. Notable:
- `/do-repo` — run a command (`inspect` / `compare <target>` / `audit`) against
  any public GitHub repo, read-only, without cloning.
- `update-pages` (auto-skill) — Pages deploy procedure: gates, push, watch to a
  terminal state, report live/stuck/failed proactively (encodes the
  stuck-pipeline toggle and cache gotchas).
- `scope-chk` (auto-skill) — fires before any cross-repo offer; reports the
  session's true repository scope so access is never overclaimed.

## Local gate — CI scripts (this repo)
Before committing or pushing, verify locally — this list mirrors what `qa.yml`
runs, so keep the two in sync:
```
node .github/scripts/check-paths.js
node .github/scripts/check-sections.js
node .github/scripts/check-plugin.js
node .github/scripts/check-secret-scan.js
node .github/scripts/check-theme-parity.js
node .github/scripts/check-contrast.js
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

## Toolkit changes

To add a command, skill, or agent: drop the file into the right
`plugins/directives-toolkit/` subdir (commands are flat md files; each skill is
a SKILL.md in its own directory; agents are flat md files with unique `name:`
frontmatter), run the plugin check from the Local gate below, and ship through
the normal PR flow. Downstream picks it up at next session start (web reinstalls
fresh per container). The install/distribution model lives in
`directives/global.md` → Skill Bootstrap.
