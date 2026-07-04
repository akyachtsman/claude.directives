# CLAUDE.md — Internal Repo Operations

> This file is **internal-only**. It governs sessions working *inside* this repo.
> It is **not** imported downstream. The exported, company-wide directives that
> other repos inherit live in `directives/` (`global.md`, `design.md`, `test.md`, `data.md`).

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
| `directives/design.md` | Exported design **method** — per-project generative (tokens + `/design-intake` + `frontend-design`/Stitch), not a shared theme |
| `directives/test.md` | Exported test/QA directive (was test's DIRECTIVE.md) |
| `directives/data.md` | Exported data/backend directive (backend provider, keys, RLS, MCP config) |
| `CLAUDE.md` | This file — internal repo-ops, not imported |
| `NEW-REPO-USER-INSTRUCTIONS.md` | Bootstrap guide for spinning up a new project repo |
| `index.html` | The repo's GitHub Pages landing page (links to the repo map, commands reference, React demo) |
| `.claude-plugin/marketplace.json` | This repo doubles as a plugin marketplace (`claude-directives`) |
| `plugins/directives-toolkit/` | **The canonical toolkit** (Phase 2 complete — the old `.claude/skills` + `agents` are retired): the full command set, 3 auto-skills, 5 agents, guard hooks incl. the push-gate. Generic code/security review is **not** maintained here — it comes from Anthropic-official sources (`pr-review-toolkit` + `security-guidance` plugins, built-in `/code-review` and `/security-review` skills); the toolkit keeps only workflow-specific agents. Edit plugin files directly; they are the source, not generated. **Web sessions never auto-install plugins** — each environment's setup script must run the install (see `NEW-REPO-USER-INSTRUCTIONS.md` Step 0) |
| `.claude/settings.json` | Plugin enablement only (`extraKnownMarketplaces` + `enabledPlugins`); hooks ship inside the plugin |
| `.claude/directive-sync.json` | Upstream-sync baseline (`.upstream.sha` + snapshots) that `/env-chk` and `/refresh-repo` read to detect directive drift |
| `templates/workflows/` | CI/CD workflow templates projects copy into `.github/workflows/` |
| `templates/ui-tests/` | Playwright test kit projects copy into `.github/scripts/ui-tests/` |
| `templates/scripts/` | Optional project scripts (`notify-email.js`, `notify-task.js`, `check-contrast.js`) projects copy into `.github/scripts/` |
| `templates/claude-settings.json` | Project `.claude/settings.json` template (marketplace + plugin enablement) that `/new-repo` installs into new projects |
| `templates/styles/` | Starter design contract (`tokens.css` + `components.css`) projects copy per `design.md` |
| `templates/nextjs-app/` | Production-tier Next.js starter scaffold (App Router + Supabase wiring) |
| `templates/` (top-level md files) | Fill-in artifacts: `templates/CLAUDE-template.md`, `templates/pr-checklist.md`, `templates/project-test-plan-template.md`, `templates/implementation-summary-template.md` |
| `docs/` | Reference docs (automations, CI triage, testing, code review, …) + Pages site assets incl. vendored React under `docs/vendor/`; see `docs/README.md` for the role-grouped index |
| `.github/workflows/` | This repo's self-test CI (`qa.yml`, `ci-monitor.yml`, `codex-monitor.yml`, `pages-monitor.yml`) |
| `.github/scripts/` | Validation scripts run by `qa.yml` |
| `scripts/` | Hosted helper scripts fetched by environments (`install-toolkit.sh` — the one-line env setup-script install, see `NEW-REPO-USER-INSTRUCTIONS.md` Step 0) |

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
`global.md` → *GitHub Workflow* + *PR Lifecycle* apply here unchanged
(`claude/<name>` branches, never commit to `main`, draft PR on first push,
squash-merge only when CI is green **and** the global.md merge gates hold —
approval covers the merge, no `codex-flagged` label, no unresolved review
threads, diff limited to the intended files). Repo-specific deltas:
- Use a **fresh** `claude/<name>` branch per change; after each squash-merge, cut the
  next from updated `main` rather than reusing/force-pushing one long-lived branch.
- Before merging, verify the PR's file list against GitHub's own diff, not the
  local clone — a surprise file count means a stale/tangled branch.

## Session Start
1. Read the four exported directive files under `directives/` fully — from the
   local working tree, not the raw `main` URLs (on a branch, `main` copies may be stale)
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
  install delivers; the running session keeps its installed copy. On web the
  install is cached per environment, so changes propagate when that cache rebuilds
  (a setup-script/network change or ~weekly expiry), not guaranteed next session.
- `.claude/settings.json` — **loaded at session start only**; changes take
  effect in the NEXT session.

## Self-test monitoring (this repo's CI)
A directive repo must pass its own CI before it can be trusted downstream.
- `qa.yml` — `QA — Directive Validation`: internal link check (hard fail, verified
  against the local working tree), path-existence check, required-section check,
  workflow YAML validation, a secret-scan-pattern sync check (the canonical regex
  stays byte-identical across `global.md` and the qa workflow templates), and a
  paired-file diff check, plus a warn-only external-link job. It also runs a
  **Playwright UI test** (`Repo Map UI`) — this repo dogfooding its own exported
  UI-testing standard (`test.md` / `templates/ui-tests`) on `docs/repo-map.html`,
  the only interactive Pages artifact: a headless Chromium asserts the map
  renders and that clicking a box fades no box and dragging selects no text.
  (The old design-theme parity + contrast checks were retired with the fixed
  design system — design is now per-project; the contrast guardrail ships in
  `templates/scripts/` for projects.)
- `ci-monitor.yml` — fires when `QA — Directive Validation` completes; on failure
  opens/updates a deduplicated `ci-failure` tracking issue.
- `codex-monitor.yml` — fires on Codex PR reviews; adds a `codex-flagged` label
  when Codex raised concerns.
- `pages-monitor.yml` — fires on every Pages build (`page_build`); verifies the
  deploy is live and on a problem opens/updates a deduplicated
  `pages-deploy-failure` issue (success → job summary only). The zero-model
  counterpart to the `update-pages` skill.

See `docs/internal/repo-monitors.md` for this repo's monitor detail and self-test
triage (the `ci-failure` / `codex-flagged` flow), and `docs/automations.md` for
escalation rules and the exported automation standard.
See `docs/ci-triage.md` for the exported **project** CI triage rules.

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
node .github/scripts/check-links.js --internal   # offline: verifies against the working tree
python3 -c "import yaml, glob; [yaml.safe_load(open(f)) for f in glob.glob('.github/workflows/*.yml') + glob.glob('templates/workflows/*.yml')]"
diff .claude/settings.json templates/claude-settings.json   # paired files (also codex/pages monitor template pairs)
diff <(sed -n '/:root {/,/^    }/p' index.html) <(sed -n '/:root {/,/^    }/p' docs/index.html)   # landing-page palette sync
npx html-validate docs/repo-map.html                        # when the map changed (CI runs it every time)
node .github/scripts/check-repo-map-ui.js                    # when the map changed; needs `npm i playwright && npx playwright install chromium`
```
Confirm `git status` shows no unintended changes. If any check fails, fix it
before pushing rather than pushing and fixing on the PR. The Playwright UI
check needs a browser; it always runs in `qa.yml` (`Repo Map UI` job), so a
local skip is fine for non-map changes.

## Escalation rules
`global.md` → *Escalation Rules* apply here unchanged (stop and ask before
deleting any file on `main`, modifying any workflow's trigger conditions, or
pushing after 3 consecutive CI failures on the same issue). No repo-specific
additions.

## Toolkit changes

To add a command, skill, or agent: drop the file into the right
`plugins/directives-toolkit/` subdir (commands are flat md files; each skill is
a SKILL.md in its own directory; agents are flat md files with unique `name:`
frontmatter), run the plugin check from the Local gate above, and ship through
the normal PR flow. Downstream picks it up when its environment's cached setup
script rebuilds (web: on an env-config change or ~weekly expiry). The
install/distribution model lives in
`directives/global.md` → Skill Bootstrap.
