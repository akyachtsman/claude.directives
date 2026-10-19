# CLAUDE.md — Internal Repo Operations

> This file is **internal-only**. It governs sessions working *inside* this repo.
> It is **not** imported downstream. The exported, company-wide directives that
> other repos inherit live in `directives/` (`global.md`, `git.md`, `design.md`,
> `test.md`, `data.md`).

## Purpose
`claude.directives` is the single, consolidated home for the company-wide agent
standard. It merges the three former repos — `claude.global.directives`,
`claude.design.directives`, and `claude.test.directives` — into one repo. The
substance that downstream projects inherit lives in `directives/`; this file
covers only how to operate *on this repo*.

**Standing upkeep mandate (owner ruling, 2026-10-12).** This repo tracks Claude itself. Keep the scaffolding
current against what Claude Code ships natively, and prefer a native Anthropic
capability over one maintained here: when a plugin, skill, or built-in covers what
a toolkit command, agent, hook, or directive section does, adopt it and record it
in `EXPORTS.json` → `externals`. A path marked **permanent** (`EXPORTS.json` →
`swap`) delegates to the native rather than being retired for it — the whole `meta`
domain is permanent, so its commands and guards gain a native authority, never a
replacement. Record every native evaluated and declined in `EXPORTS.json` →
`considered`, so the next pass reads the verdict instead of re-deriving it.

## Layout
| Path | Role |
|------|------|
| `directives/global.md` | Exported global directive (was global's DIRECTIVE.md) |
| `directives/design.md` | Exported design **method** — per-project generative (tokens + `/design-intake` + `frontend-design`/Stitch), not a shared theme |
| `directives/git.md` | Exported git/GitHub directive — PR lifecycle, conditional auto-merge, repo-settings preflight |
| `directives/test.md` | Exported test/QA directive (was test's DIRECTIVE.md) |
| `directives/data.md` | Exported data/backend directive (backend provider, keys, RLS, MCP config) |
| `CLAUDE.md` | This file — internal repo-ops, not imported |
| `README.md` | The repo's front page on GitHub — what the repo is, the five exported directives, and pointers to `CLAUDE.md` and the bootstrap guide |
| `EXPORTS.json` | Machine-readable export boundary — every downstream-consumed path by delivery mode (`categories`: inherited rules / installed tooling / copied scaffolding / referenced docs), plus **one record per exported path** under `paths` naming its domain (from `domains.names`), its compartment, its **durability class** (standard · orchestrator · behavioral · mechanical · artifact · reference, defined under `classes`) and, if any, its `swap` class (`permanent` / `orchestrator`; a domain permanent in its entirety — `meta` — is named once in `swap.permanent_domains` and expanded by the check, never marked per record); enforced by `check-exports.js` in `qa.yml` |
| `learnings.jsonl` | Compounding project memory — `/learn` appends typed, confidence-scored entries (one JSON object per line, latest-key-wins); consulted at session start and by `/diagnose` |
| `NEW-REPO-USER-INSTRUCTIONS.md` | Bootstrap guide for spinning up a new project repo |
| `MAINTAIN-REPO-USER-INSTRUCTIONS.md` | Owner's post-bootstrap runbook — propagation matrix (what to do when each delivery mode changes), downstream-finding loop, environment re-save procedure, domain boundaries |
| `TIME-SENSITIVE.md` | The register of facts the directives rely on about something OUTSIDE this repo — models, Claude Code, GitHub, Codex, the test environment, outside services — with where it is stated, when it was last verified and how to re-check it. Kept apart from the owner's standing directives, which never expire. Walked by every `/audit-repo` run |
| `index.html` | The repo's GitHub Pages landing page (links to the repo map and the commands reference) — the site's only one: `docs/site/index.html` is a redirect stub back to it (merged 2026-10-08). The site is published **verbatim**: a tracked `.nojekyll` turns Jekyll off (2026-10-08), and `check-paths.js` refuses to run without it |
| `docs/site/commands.html` | The commands reference — every toolkit slash command by pipeline phase, linked from `index.html`. **Generated** by `.github/scripts/build-commands-page.js` from the command frontmatter; never hand-edit it (`qa.yml` runs it with `--check`) |
| `docs/site/logical-map.html` | The repo map — a lifecycle flow, stage by stage, with every connection read out of the files. **Generated** by `.github/scripts/build-logical-map.js` from `EXPORTS.json` and the files themselves; never hand-edit it. Its behaviour (pan/zoom, search, trace a file's chain with the evidence for each link) is hand-written in `docs/site/logical-map.js` |
| `.gitignore` | Keeps local-only files out of git: `node_modules/`, the project MCP file `.mcp.json` and its legacy path, both kept out of git per `data.md` → *MCP Configuration*, plugin-eval results, and Python bytecode from running the gates |
| `.claude-plugin/marketplace.json` | This repo doubles as a plugin marketplace (`claude-directives`) |
| `plugins/directives-toolkit/` | **The canonical toolkit** (Phase 2 complete — the old `.claude/skills` + `agents` are retired): the full command set, 3 auto-skills plus the model-invocable `/learn`, 4 agents, guard hooks incl. the push-gate. Generic code/security review is **not** maintained here — it comes from Anthropic-official sources (`pr-review-toolkit` + `security-guidance` plugins, built-in `/code-review` and `/security-review` skills); the toolkit keeps only workflow-specific agents. Edit plugin files directly; they are the source, not generated. **Web sessions do not attach plugins by themselves** — an environment's setup script performs the FIRST install (see `NEW-REPO-USER-INSTRUCTIONS.md` Step 0); after that the `SessionStart` hook re-runs the same installer each session and moves it to current |
| `.claude/settings.json` | Plugin enablement (`extraKnownMarketplaces` + `enabledPlugins`) plus the `SessionStart` hook registration; the guard hooks themselves ship inside the plugin |
| `.claude/hooks/session-start.sh` | SessionStart hook — runs `scripts/install-toolkit.sh` on every **web** session so a merged toolkit change reaches sessions without a per-environment Setup-script re-save. Best-effort: always exits 0. Byte-identical to `templates/claude-hooks/session-start.sh` |
| `templates/claude-hooks/` | The downstream copy of the `SessionStart` hook (`session-start.sh`) that `/new-repo` installs into projects; byte-identical to `.claude/hooks/session-start.sh` (`check-pairs.py`) |
| `.claude/directive-sync.json` | Upstream-sync baseline (`.upstream.sha` + snapshots) that `/env-chk` and `/refresh-repo` read to detect directive drift |
| `templates/workflows/` | CI/CD workflow templates projects copy into `.github/workflows/` |
| `templates/actions/` | Composite actions (`secret-scan`, `ui-suite`) projects copy into `.github/actions/` — the shared run blocks the qa workflows reference |
| `templates/ui-tests/` | Playwright test kit projects copy into `.github/scripts/ui-tests/` |
| `templates/scripts/` | Project scripts — guards, notifiers, the browser ladder, and the `package.json` the notifiers install from — that projects copy into `.github/scripts/`; which ones a project gets is derived from the workflows and directives that name them (`/new-repo`, `/refresh-repo`). `qa.yml` runs the guards straight from this path, so none has a `.github/scripts/` twin here |
| `templates/claude-settings.json` | Project `.claude/settings.json` template (marketplace + plugin enablement) that `/new-repo` installs into new projects |
| `templates/styles/` | Starter design contract (`tokens.css` + `components.css`) projects copy per `design.md` |
| `templates/` (top-level md files) | Fill-in artifacts: `templates/CLAUDE-template.md`, `templates/pr-checklist.md`, `templates/project-test-plan-template.md`, `templates/implementation-summary-template.md` |
| `docs/` | Split by audience: `docs/standards/` (exported standards), `docs/guides/` (exported guidance/setup), `docs/site/` (Pages assets), `docs/internal/` (this repo only), plus legacy-URL redirect stubs at the old docs-root html paths and `docs/site/index.html`; see `docs/README.md` for the index |
| `.github/workflows/` | This repo's self-test CI (`qa.yml`), plus the **callable** workflows projects will call instead of copying (`shared-qa.yml`; #460 step 4, piloted in claude.prop only). Those are exported (`EXPORTS.json` → `called-workflows`); how they differ from their templates and what the spike found: `docs/internal/shared-workflows.md` |
| `.github/shared-qa-fixture/` | The fixture site and Playwright suite that `qa.yml`'s `shared-qa-selftest` job runs `shared-qa.yml` against |
| `.github/scripts/` | Validation scripts run by `qa.yml` |
| `scripts/` | Hosted helper scripts fetched by environments (`install-toolkit.sh` — the one-line env setup-script install, see `NEW-REPO-USER-INSTRUCTIONS.md` Step 0) |

## How it's imported downstream
Projects import the five `directives/` files by raw URL; the URL list is `directives/global.md` → *Imported Directives* (plus `global.md`'s own).
When you change an exported directive, edit the file under `directives/` — never
relocate the export into this file.

## Self-application
This repo eats its own cooking: **whenever a directive or template change ships,
check whether it applies to THIS repo too**, in the same PR. Two patterns:
- **Byte-identical copy**, enforced by `.github/scripts/check-pairs.py` — the
  one list of pairs lives in that script; add a pair there — the template IS the
  live copy.
- **Adapted with documented divergence** where roles differ (`qa.yml` here is
  directive validation, not app CI — so the app-shaped pieces like the ui-tests
  kit and `styles/` contract don't apply).
`/audit-repo` treats a shipped-downstream-but-applicable-here miss as drift.

## Branch policy
`global.md` → *GitHub Workflow* (a fresh branch per change) and `git.md` → *PR Lifecycle* apply here unchanged.
The merge gate is `git.md` → *Conditional Auto-Merge on Green*; the file-list check is `git.md` → *Before merging*.

Repo-specific delta:
- `main` here enforces **Require conversation resolution before merging**
  server-side (owner, 2026-08-26), so in this repo that backstop is known to be on:
  a blocked merge with every other gate green is that rule firing — resolve the
  threads, do not retry the merge. The other gates are still the session's to check.

## Session Start
1. Read all five exported directive files under `directives/` fully — from the
   local working tree, not the raw `main` URLs (on a branch, `main` copies may be stale)
2. Verify the directives-toolkit plugin attached (commands/agents resolve) per `global.md` → *Skill Bootstrap*
3. Confirm active branch: `git branch --show-current`
4. Run `/env-chk` and report status — this includes the `scope-chk` repo-scope
   verification (global.md's Session Start step 2), so it need not be run separately here
5. **Periodically** run `/audit-repo` — a structural/efficiency sweep for
   directive↔code drift, redundancy, and simplification opportunities, including a
   **native-parity pass** per the standing upkeep mandate above, and a walk of
   `TIME-SENSITIVE.md` that re-checks each fact it lists. The command carries the
   inventory procedure; this repo's half of the pass (diffing that inventory
   against `EXPORTS.json` → `externals` + `considered`) is in
   `docs/internal/native-parity.md`. Not every session: run it when starting on a
   fresh `main`, or when the repo has changed materially since the last audit.
   Never let it delay the user's actual request — skip or defer if a task is
   already queued.

## Mid-session change semantics
What a live session sees when these files change mid-session — don't assume
everything hot-reloads:
- `CLAUDE.md` and `directives/` — **stale until re-read**: the copy injected at
  session start does not update. The plugin's PostToolUse hook reminds on
  CLAUDE.md edits; `/refresh-repo` Phase 0 re-reads CLAUDE.md + directives.
- `plugins/directives-toolkit/` — editing files here changes what the NEXT
  install delivers; the running session keeps its installed copy. On web the
  `SessionStart` hook re-runs the installer every session, so a merged change is
  picked up by the session AFTER the one that fetched it ("Restart to apply
  changes"). The environment's cached setup script no longer gates this; it only
  performs the first install.
- `.claude/settings.json` — **loaded at session start only**; changes take
  effect in the NEXT session.

## Self-test monitoring (this repo's CI)
A directive repo must pass its own CI before it can be trusted downstream.
- `qa.yml` — `QA — Directive Validation`: the checks in its `validate` job,
  which the *Local gate* below runs from the file, plus a warn-only external-link job. Each
  guard's design history is in its own
  header comment; what has no single script home is in
  `docs/internal/gate-history.md`.
  It also runs a **Playwright UI test** (`Repo Map UI`) — this repo dogfooding
  its own exported UI-testing standard (`test.md` / `templates/ui-tests`) on its
  interactive Pages artifact, `docs/site/logical-map.html`. What each case covers and why it exists is in
  `docs/internal/repo-map-ui.md`; read that before changing the map, the router,
  or the suite.
A red run reaches a session through its PR subscription, and GitHub emails the
run's actor; Codex's verdict is read from the PR (`git.md` → *PR Lifecycle*).
Self-test triage: `docs/internal/repo-monitors.md`. Exported automation standard and escalation rules:
`docs/standards/automations.md`; exported **project** CI triage: `docs/standards/ci-triage.md`.

## Toolkit (commands, skills, agents, hooks)
Everything ships in the `directives-toolkit` plugin (`plugins/directives-toolkit/`
— the live source of truth; edit there). Commands invoke as `/env-chk`,
`/refresh-repo`, `/audit-repo`, …; auto-skills (`update-pages`, `scope-chk`,
`doc-comp`) fire on description match; agents are namespaced
`directives-toolkit:*`. Notable:
- `/do-repo` — run a command (`inspect` / `compare <target>` / `audit`) against
  any public GitHub repo, read-only, over raw URLs and git, with no checkout.
- `update-pages` (auto-skill) — Pages deploy procedure: gates, push, watch to a
  terminal state, report live/stuck/failed proactively (encodes the
  stuck-pipeline toggle and cache gotchas).
- `scope-chk` (auto-skill) — fires before any cross-repo offer; reports the
  session's true repository scope so access is never overclaimed.

**Auto-skills are the only surface nothing else proves.** `update-pages`,
`scope-chk`, `doc-comp` and the model-invocable `/learn` fire on description match, so a description that
drifts stops firing silently — no error, just absence. `claude plugin eval`
(Anthropic; owner ruling, 2026-10-12) runs the cases in `plugins/directives-toolkit/evals/`;
run it when a description changes, from the plugin directory:
`claude plugin eval --no-publish .`
and re-run the negatives whenever a description is widened. It costs real tokens
and is NOT in CI. How the cases are built, what the score and Δ mean, the Claude
Code version it needs and the measured baseline: `docs/internal/skill-eval-notes.md`.

## Local gate — CI scripts (this repo)
Before committing or pushing, run `qa.yml`'s `validate` job locally. The runner
reads the steps out of the workflow, so there is no list here to keep in sync
(batch C, S1):
```
python3 .github/scripts/run-local-gate.py          # every step of the validate job, in order; exit 0 all pass, 1 any fail, 2 CANNOT RUN
python3 .github/scripts/run-local-gate.py --list   # the steps it would run
```
What it emulates and what it refuses rather than approximate (a remote action,
an `if:`, an expression in a script) is in its header; its own guard is
`run-local-gate-cases.py`, which the job runs. A `*-cases` suite that can be
re-proved against a mutant names its `*_BIN` variable in its header.

Not in that job, so run them by hand when they apply:
```
bash -n .claude/hooks/session-start.sh && CLAUDE_CODE_REMOTE=true ./.claude/hooks/session-start.sh   # when the hook changed
npm_config_legacy_peer_deps=true npx html-validate@10.17.0 docs/site/logical-map.html   # when the map changed (CI runs it every time, same pin and env)
node .github/scripts/check-repo-map-ui.js                    # when the map changed; needs `npm i playwright@1.62.1 && npx playwright install chromium` (the version qa.yml pins)
(cd plugins/directives-toolkit && claude plugin eval --no-publish .)   # when an auto-skill's description changed
#   sandboxes that ship a pinned Chromium: CHROMIUM_PATH=/path/to/chrome node .github/scripts/check-repo-map-ui.js
#   after editing EXPORTS.json, the map, or any file a drawn connection quotes, regenerate first: node .github/scripts/build-logical-map.js
```
⚠️ **check-links rules** (history in the `check-links-cases.js` header):
- DO NOT teach it to read across a line break (#365 and #367 both tried, both reverted); keep every cross-reference (a backticked file name, an arrow, a starred section name) on ONE line.
- Do NOT suppress the self form after a code span naming a `.md` file (#367 rounds 12-16, withdrawn by owner ruling 2026-09-18).
- Keep the `\x60` in `(?<![\x60\w])`; do NOT reintroduce the flanking rule; line endings are normalised ONCE by `readSource()`.

⚠️ **RUN THE GATE AFTER `git add`, NOT BEFORE — a NEW file is invisible to it
until staged.** `check-exports` and `check-claims --derive`
both enumerate via `git ls-files`, which does not list untracked paths. So a gate
run on a working tree containing a brand-new file **checks everything except the
thing you just added**, and reports OK. The #325 measurement: `docs/internal/gate-history.md`.
Stage first, then gate.

Confirm `git status` shows no unintended changes. If any check fails, fix it
before pushing rather than pushing and fixing on the PR. The Playwright UI
check needs a browser; it always runs in `qa.yml` (`Repo Map UI` job), so a
local skip is fine for non-map changes.

**This repo's agent-sandbox ceiling: NONE** (measured 2026-08-26, re-derived with
`templates/scripts/browser-ladder.js` on 2026-09-05 and 2026-10-08), the record
`test.md` → *Sandboxed local runs* asks every project to keep. Causes: chromium
installs and launches here, and `docs/site/logical-map.html` loads no external
resource, so `check-repo-map-ui.js` passes locally and a local failure is evidence
about the map, not the environment. **What would make it wrong:** chromium ceasing
to launch here, the suite's browser matrix or runner changing, or the map gaining
any external resource. The measurements, and what each of those conditions means:
`docs/internal/repo-map-ui.md` → *Sandbox ceiling*.

## Escalation rules
`global.md` → *Escalation Rules* apply here unchanged — all four gates, not a
subset. No repo-specific additions.

`global.md` → *A Knowing Deviation Is an Escalation* applies here too. Where a
directive or rules file in this repo contradicts what the owner just said, follow
its third bullet in order: raise the contradiction, quote both, **ask which
stands**, and fix the record in the same change once he has answered.

## Notifications (owner ruling, 2026-08-23)
Keep the PR subscription until the PR merges, and never substitute a timer for it: `git.md` → *PR Lifecycle*.
Heartbeat: `global.md` → *Status Line on Every Stop* — it rides on a wake that already happens.

No setting suppresses the `<wake reason=…>` envelopes themselves (verified
2026-08-21) — don't hunt for a config toggle.

## Toolkit changes

**Authoring authority (owner ruling, 2026-09-24).** `plugin-dev` (Anthropic) is the spec for plugin
structure — commands, agents, hooks, MCP, settings, frontmatter — and its
`hook-development` skill covers hook events and matchers. Read it before
hand-writing either; `meta` is permanent, so it informs this toolkit rather than
replacing it (→ *Purpose* → the upkeep mandate). `hookify` is deliberately not
installed (`EXPORTS.json` → `considered`).

To add a command, skill, or agent: drop the file into the right
`plugins/directives-toolkit/` subdir (commands are flat md files; each skill is
a SKILL.md in its own directory; agents are flat md files with unique `name:`
frontmatter), run the plugin check from the Local gate above, and ship through
the normal PR flow. Downstream projects carrying the `SessionStart` hook pick it
up on their next session; legacy projects without it wait for their environment's
cached setup script to rebuild (web: on a setup-script or network-allowlist change, or ~weekly expiry). The
install/distribution model lives in
`directives/global.md` → Skill Bootstrap.
