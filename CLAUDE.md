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

**Standing upkeep mandate.** This repo tracks Claude itself. Keep the scaffolding
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
| `EXPORTS.json` | Machine-readable export boundary — every downstream-consumed path by delivery mode (inherited rules / installed tooling / copied scaffolding / referenced docs), by `domains`/compartment, by `swap` class, and by **durability `classes`** (standard · orchestrator · behavioral · mechanical · artifact · reference — the classes must partition the exported set exactly); enforced by `check-exports.js` in `qa.yml` |
| `learnings.jsonl` | Compounding project memory — `/learn` appends typed, confidence-scored entries (one JSON object per line, latest-key-wins); consulted at session start and by `/diagnose` |
| `NEW-REPO-USER-INSTRUCTIONS.md` | Bootstrap guide for spinning up a new project repo |
| `MAINTAIN-REPO-USER-INSTRUCTIONS.md` | Owner's post-bootstrap runbook — propagation matrix (what to do when each delivery mode changes), downstream-finding loop, environment re-save procedure, domain boundaries |
| `index.html` | The repo's GitHub Pages landing page (links to the logical map, commands reference, React demo) |
| `docs/site/logical-map.html` | The repo map — **generated** from `EXPORTS.json` by `.github/scripts/build-logical-map.js`; never hand-edit it. Its behaviour (pan/zoom/search/isolate, layer toggles, drag-to-move and drag-to-resize with per-browser persistence) is hand-written in `docs/site/logical-map.js` |
| `.claude-plugin/marketplace.json` | This repo doubles as a plugin marketplace (`claude-directives`) |
| `plugins/directives-toolkit/` | **The canonical toolkit** (Phase 2 complete — the old `.claude/skills` + `agents` are retired): the full command set, 3 auto-skills, 5 agents, guard hooks incl. the push-gate. Generic code/security review is **not** maintained here — it comes from Anthropic-official sources (`pr-review-toolkit` + `security-guidance` plugins, built-in `/code-review` and `/security-review` skills); the toolkit keeps only workflow-specific agents. Edit plugin files directly; they are the source, not generated. **Web sessions do not attach plugins by themselves** — an environment's setup script performs the FIRST install (see `NEW-REPO-USER-INSTRUCTIONS.md` Step 0); after that the `SessionStart` hook re-runs the same installer each session and moves it to current |
| `.claude/settings.json` | Plugin enablement (`extraKnownMarketplaces` + `enabledPlugins`) plus the `SessionStart` hook registration; the guard hooks themselves ship inside the plugin |
| `.claude/hooks/session-start.sh` | SessionStart hook — runs `scripts/install-toolkit.sh` on every **web** session so a merged toolkit change reaches sessions without a per-environment Setup-script re-save. Best-effort: always exits 0. Byte-identical to `templates/claude-hooks/session-start.sh` |
| `.claude/directive-sync.json` | Upstream-sync baseline (`.upstream.sha` + snapshots) that `/env-chk` and `/refresh-repo` read to detect directive drift |
| `templates/workflows/` | CI/CD workflow templates projects copy into `.github/workflows/` |
| `templates/actions/` | Composite actions (`secret-scan`, `ui-suite`) projects copy into `.github/actions/` — the shared run blocks the qa workflows reference |
| `templates/ui-tests/` | Playwright test kit projects copy into `.github/scripts/ui-tests/` |
| `templates/scripts/` | Optional project scripts (`notify-email.js`, `notify-task.js`, `check-contrast.js`) projects copy into `.github/scripts/` |
| `templates/claude-settings.json` | Project `.claude/settings.json` template (marketplace + plugin enablement) that `/new-repo` installs into new projects |
| `templates/styles/` | Starter design contract (`tokens.css` + `components.css`) projects copy per `design.md` |
| `templates/nextjs-app/` | Production-tier Next.js starter scaffold (App Router + Supabase wiring) |
| `templates/` (top-level md files) | Fill-in artifacts: `templates/CLAUDE-template.md`, `templates/pr-checklist.md`, `templates/project-test-plan-template.md`, `templates/implementation-summary-template.md` |
| `docs/` | Split by audience: `docs/standards/` (exported standards), `docs/guides/` (exported guidance/setup), `docs/site/` (Pages assets incl. vendored React), `docs/internal/` (this repo only), plus legacy-URL redirect stubs at the old docs-root html paths; see `docs/README.md` for the index |
| `.github/workflows/` | This repo's self-test CI (`qa.yml`, `ci-monitor.yml`, `ci-notify.yml`, `codex-monitor.yml`, `pages-monitor.yml`, `pages-retry.yml`) |
| `.github/scripts/` | Validation scripts run by `qa.yml` |
| `scripts/` | Hosted helper scripts fetched by environments (`install-toolkit.sh` — the one-line env setup-script install, see `NEW-REPO-USER-INSTRUCTIONS.md` Step 0) |

## How it's imported downstream
Projects import each directive by raw URL — the consolidated paths are:
```
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/global.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/git.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/design.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/test.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/data.md
```
When you change an exported directive, edit the file under `directives/` — never
relocate the export into this file.

## Self-application
This repo eats its own cooking: **whenever a directive or template change ships,
check whether it applies to THIS repo too**, in the same PR. Two patterns:
- **Byte-identical copy**, enforced by qa.yml's paired-file check
  (`codex-monitor.yml`, `pages-monitor.yml`, `pages-retry.yml`,
  `.claude/settings.json`) — the template IS the live copy.
- **Adapted with documented divergence** where roles differ (`ci-monitor.yml` /
  `ci-notify.yml` watch this repo's workflow name; `qa.yml` here is directive
  validation, not app CI — so the app-shaped pieces like the ui-tests kit and
  `styles/` contract don't apply).
`/audit-repo` treats a shipped-downstream-but-applicable-here miss as drift.

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
1. Read all five exported directive files under `directives/` fully — from the
   local working tree, not the raw `main` URLs (on a branch, `main` copies may be stale)
2. Verify the directives-toolkit plugin attached (commands/agents resolve) per global.md → Skill Bootstrap
3. Confirm active branch: `git branch --show-current`
4. Run `/env-chk` and report status — this includes the `scope-chk` repo-scope
   verification (global.md's Session Start step 2), so it need not be run separately here
5. **Periodically** run `/audit-repo` — a structural/efficiency sweep for
   directive↔code drift, redundancy, and simplification opportunities, including a
   **native-parity pass** per the standing upkeep mandate above. That pass needs an
   authoritative inventory, not recall: read the registered marketplaces' own
   manifests (`claude plugin marketplace list`, and the `marketplace.json` in each
   clone under `~/.claude/plugins/marketplaces/`) together with this session's own
   skill and tool list, then diff that surface against `EXPORTS.json` →
   `externals` + `considered`. Only `borrowed` and `rejected` entries suppress a
   finding: a `deferred` verdict means the work still fits and has not been done,
   so it stays a finding on every pass, carrying its recorded rationale rather
   than being re-derived. Match names after normalising: strip a `-builtin`
   suffix from a manifest key before comparing it to an inventory name (the
   inventory calls it `dataviz`, the manifest `dataviz-builtin`), and record a
   skill under its **parent plugin's** name, since that is what a marketplace
   manifest advertises. Count only **Anthropic-owned** capabilities —
   the `anthropics/*` marketplaces and the built-in skills — and exclude this
   repo's own `claude-directives` marketplace, which advertises
   `directives-toolkit`; without that filter the pass flags the toolkit it is
   auditing, plus every third-party vendor plugin, as a missing native. What
   survives the filter and is in neither list is the finding. Not every
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
  `SessionStart` hook re-runs the installer every session, so a merged change is
  picked up by the session AFTER the one that fetched it ("Restart to apply
  changes"). The environment's cached setup script no longer gates this; it only
  performs the first install.
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
  UI-testing standard (`test.md` / `templates/ui-tests`) on its interactive
  Pages artifact, `docs/site/logical-map.html` (the repo map, logical view —
  the physical-folders view was retired 2026-07-21): a headless Chromium asserts
  the map renders, that no frame clips its contents, that dragging a frame moves
  it and dragging its corner resizes it, that the layout survives a reload, that
  every layer toggle works and reverses, that the legend opens, that search and
  isolate behave, and that dragging the canvas selects no text. It also covers the
  **input surface** a mouse-only test never reaches — scroll pans on both axes
  without zooming, ctrl/pinch zooms, two-finger pinch zooms on touch, middle-drag
  pans over a frame, frames are keyboard-reachable and arrow keys pan, and `fit`
  recentres without discarding the reader's arranged layout. It also asserts the
  **visual** invariant the interaction checks kept missing: every frame states its
  relationships in words, nothing is drawn at rest, selecting a frame draws only
  its own connections, and **no arrow crosses a frame it does not connect** —
  verified on the shipped layout AND after frames are dragged around, which is
  the case the earlier router had never been exercised against. It also asserts
  the invariants a human had to report because nothing measured them: **no two
  arrows run alongside each other** (measured as the length of one line lying
  within 11px of another — a crossing costs a few px, a bundle costs its whole
  span), no two edge labels overlap, labels draw above every line, and frames
  sitting level with each other are linked straight across rather than detouring
  through the band above. Two arrangements a READER made — not the suite's own
  scripted drags — are pinned as cases, because both defects a human reported
  lived only in layouts the script never produced: neighbours offset just enough
  to miss the side-link threshold, and one frame edge carrying three runs.
  `arrange()` fails loudly if a test layout names a frame that does not exist,
  since a mistyped id is silently ignored on load and quietly tests nothing.
  The router is **ported from `claude.insurance`** — its
  `relmap.js` and `relmap-view.js` under js/keep: reserve space rather than
  search for it, with hop-breaks where lines cross. Their layout computes node
  positions; ours lets the reader drag, so the channels are MEASURED from the
  frames' own extents — the complement of the y-intervals gives the horizontal
  bands, the complement of the x-intervals over a y-range gives the vertical
  corridors — and ports are ordered by where each run is heading, which is
  Sugiyama's crossing-minimisation step applied where a hand-placed layout still
  leaves a choice. `build-logical-map.js`'s default geometry is a GRID whose
  gutters line up across rows precisely so those corridors exist. The map opens
  **collapsed** — each frame leads with its meaning and a delivery-mix bar, and its
  files appear on request (search opens the frame holding a hit), because 109
  filenames shown at once is a reference table rather than a map.
  `qa.yml` also runs `build-logical-map.js --check`, so a committed map that no
  longer matches `EXPORTS.json` fails the build.
  (The old design-theme parity + contrast checks were retired with the fixed
  design system — design is now per-project; the contrast guardrail ships in
  `templates/scripts/` for projects.)
- `ci-monitor.yml` — fires when `QA — Directive Validation` completes; on failure
  opens/updates a deduplicated `ci-failure` tracking issue.
- `ci-notify.yml` — fires when `QA — Directive Validation` completes **green**;
  comments on the open PR for that head SHA so a watching web session wakes on
  success without scheduling-tool polling (the template's counterpart, adapted
  to this repo's workflow name).
- `codex-monitor.yml` — fires on Codex PR reviews; adds a `codex-flagged` label
  when Codex raised concerns.
- `pages-monitor.yml` — fires on every Pages build (`page_build`); verifies the
  deploy is live and on a problem opens/updates a deduplicated
  `pages-deploy-failure` issue (success → job summary only). The zero-model
  counterpart to the `update-pages` skill.

See `docs/internal/repo-monitors.md` for this repo's monitor detail and self-test
triage (the `ci-failure` / `codex-flagged` flow), and `docs/standards/automations.md` for
escalation rules and the exported automation standard.
See `docs/standards/ci-triage.md` for the exported **project** CI triage rules.

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

**Auto-skills are the only surface nothing else proves.** `update-pages`,
`scope-chk` and `doc-comp` fire on description match, so a description that
drifts stops firing silently — no error, just absence. `claude plugin eval`
(Anthropic) is the harness: cases live in `plugins/directives-toolkit/evals/`,
each a `prompt.md` plus a skill-fired grader under its own `graders/` dir, using
(`type: tool_used`, `tool: Skill`, `input_match` on the skill name). Run it from
the plugin directory:
`claude plugin eval --no-publish .`
It defaults to `--ablation with-without`, running every case twice — with the
plugin and without it — so the Δ column shows the skill CAUSED the behaviour
rather than the model doing it anyway. It costs real tokens and is NOT in CI;
run it when a description changes.

Availability: `plugin eval` is early access, enabled per organization. On a
machine that cannot receive that rollout, `CLAUDE_CODE_WALNUT_SPIRE=1` enables
it — set in the shell, in the user-level Claude settings under `env`, or in
managed settings. Do NOT
commit it to this repo's `.claude/settings.json` — a committed value leaves the
command gated off anyway.

Measured baseline (2026-08-19, 2 runs/case, with/without arms): **9 of 9 pass**,
mean Δ +0.67. All three negatives correctly never fire in either arm, so the
suite shows neither under- nor over-triggering.

Both earlier gaps were fixed by rewriting descriptions against the measurement,
and the lever is worth keeping: a description triggers on the WORDS a request
actually uses, not on what the skill is for. `doc-comp` fired on "diff the old X
against the new X" and never on "compare these two versions of our X" — identical
prompts, one verb apart — because the old description's only strong hook was the
word "diff" in its output clause. Naming the verbs (compare/diff/what changed)
and the nouns (documents, versions, drafts, revisions), and saying it applies to
text pasted inline, took that case 0.00 → +1.00. `scope-chk` was flaky on the
explicit phrasing (1 run in 2) because its trigger was written from the
assistant's side — "before OFFERING work" — while the missed case was the user
asking directly; adding that case took it to 5/5 with the plugin and 0/5 without.

Re-run the negatives whenever a description is widened: over-triggering is the
failure mode a broader description buys, and it is invisible without them.

## Local gate — CI scripts (this repo)
Before committing or pushing, verify locally — this list mirrors what `qa.yml`
runs, so keep the two in sync:
```
node .github/scripts/check-paths.js
node .github/scripts/check-sections.js
node .github/scripts/check-plugin.js
node .github/scripts/check-secret-scan.js
node .github/scripts/check-exports.js            # export boundary: EXPORTS.json paths, class partition, raw self-references
python3 .github/scripts/workflow-ref-guard.py     # every workflow_run name resolves; required watchers intact
python3 .github/scripts/check-workflow-ref-guard.py  # the guard itself still reads every pinned YAML form
python3 .github/scripts/check-job-bounds.py       # every job bounded, none >=360, browser jobs >=30 — live AND templates
node .github/scripts/build-logical-map.js --check # the committed logical map still matches EXPORTS.json
node .github/scripts/check-links.js --internal   # offline: verifies against the working tree
python3 -c "import yaml, glob; [yaml.safe_load(open(f)) for f in glob.glob('.github/workflows/*.yml') + glob.glob('templates/workflows/*.yml') + glob.glob('templates/actions/*/action.yml')]"
diff .claude/settings.json templates/claude-settings.json   # paired files (also codex/pages-monitor/pages-retry template pairs)
diff .claude/hooks/session-start.sh templates/claude-hooks/session-start.sh   # SessionStart hook pair
bash -n .claude/hooks/session-start.sh && CLAUDE_CODE_REMOTE=true ./.claude/hooks/session-start.sh   # when the hook changed
diff <(sed -n '/:root {/,/^    }/p' index.html) <(sed -n '/:root {/,/^    }/p' docs/site/index.html)   # landing-page palette sync
npx html-validate docs/site/logical-map.html                 # when the map changed (CI runs it every time)
node .github/scripts/check-repo-map-ui.js                    # when the map changed; needs `npm i playwright && npx playwright install chromium`
(cd plugins/directives-toolkit && claude plugin eval --no-publish .)   # when an auto-skill's description changed
#   sandboxes that ship a pinned Chromium: CHROMIUM_PATH=/path/to/chrome node .github/scripts/check-repo-map-ui.js
#   after editing EXPORTS.json or the map, regenerate first: node .github/scripts/build-logical-map.js
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

**Authoring authority.** `plugin-dev` (Anthropic) is the spec for plugin
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
cached setup script to rebuild (web: on an env-config change or ~weekly expiry). The
install/distribution model lives in
`directives/global.md` → Skill Bootstrap.
