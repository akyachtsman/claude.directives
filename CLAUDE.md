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
| `TIME-SENSITIVE.md` | The register of facts the directives rely on about something OUTSIDE this repo — models, Claude Code, GitHub, Codex, the test environment, outside services — with where it is stated, when it was last verified and how to re-check it. Kept apart from the owner's standing directives, which never expire. Walked by every `/audit-repo` run |
| `index.html` | The repo's GitHub Pages landing page (links to the repo map and the commands reference) — the site's only one: `docs/site/index.html` is a redirect stub back to it (merged 2026-10-08). The site is published **verbatim**: a tracked `.nojekyll` turns Jekyll off (2026-10-08), and `check-paths.js` refuses to run without it |
| `docs/site/logical-map.html` | The repo map — a lifecycle flow, stage by stage, with every connection read out of the files. **Generated** by `.github/scripts/build-logical-map.js` from `EXPORTS.json` and the files themselves; never hand-edit it. Its behaviour (pan/zoom, search, trace a file's chain with the evidence for each link) is hand-written in `docs/site/logical-map.js` |
| `.claude-plugin/marketplace.json` | This repo doubles as a plugin marketplace (`claude-directives`) |
| `plugins/directives-toolkit/` | **The canonical toolkit** (Phase 2 complete — the old `.claude/skills` + `agents` are retired): the full command set, 3 auto-skills, 5 agents, guard hooks incl. the push-gate. Generic code/security review is **not** maintained here — it comes from Anthropic-official sources (`pr-review-toolkit` + `security-guidance` plugins, built-in `/code-review` and `/security-review` skills); the toolkit keeps only workflow-specific agents. Edit plugin files directly; they are the source, not generated. **Web sessions do not attach plugins by themselves** — an environment's setup script performs the FIRST install (see `NEW-REPO-USER-INSTRUCTIONS.md` Step 0); after that the `SessionStart` hook re-runs the same installer each session and moves it to current |
| `.claude/settings.json` | Plugin enablement (`extraKnownMarketplaces` + `enabledPlugins`) plus the `SessionStart` hook registration; the guard hooks themselves ship inside the plugin |
| `.claude/hooks/session-start.sh` | SessionStart hook — runs `scripts/install-toolkit.sh` on every **web** session so a merged toolkit change reaches sessions without a per-environment Setup-script re-save. Best-effort: always exits 0. Byte-identical to `templates/claude-hooks/session-start.sh` |
| `.claude/directive-sync.json` | Upstream-sync baseline (`.upstream.sha` + snapshots) that `/env-chk` and `/refresh-repo` read to detect directive drift |
| `templates/workflows/` | CI/CD workflow templates projects copy into `.github/workflows/` |
| `templates/actions/` | Composite actions (`secret-scan`, `ui-suite`) projects copy into `.github/actions/` — the shared run blocks the qa workflows reference |
| `templates/ui-tests/` | Playwright test kit projects copy into `.github/scripts/ui-tests/` |
| `templates/scripts/` | Project scripts — guards, notifiers, the browser ladder, and the `package.json` the notifiers install from — that projects copy into `.github/scripts/`; which ones a project gets is derived from the workflows and directives that name them (`/new-repo`, `/refresh-repo`). Only the four on `check-pairs.py`'s pair list have a byte-identical `.github/scripts/` twin here; `check-ui-viewports.js` is run straight from this path by `qa.yml`, so it has none |
| `templates/claude-settings.json` | Project `.claude/settings.json` template (marketplace + plugin enablement) that `/new-repo` installs into new projects |
| `templates/styles/` | Starter design contract (`tokens.css` + `components.css`) projects copy per `design.md` |
| `templates/` (top-level md files) | Fill-in artifacts: `templates/CLAUDE-template.md`, `templates/pr-checklist.md`, `templates/project-test-plan-template.md`, `templates/implementation-summary-template.md` |
| `docs/` | Split by audience: `docs/standards/` (exported standards), `docs/guides/` (exported guidance/setup), `docs/site/` (Pages assets), `docs/internal/` (this repo only), plus legacy-URL redirect stubs at the old docs-root html paths and `docs/site/index.html`; see `docs/README.md` for the index |
| `.github/workflows/` | This repo's self-test CI (`qa.yml`, `ci-monitor.yml`, `ci-notify.yml`, `codex-monitor.yml`, `pages-monitor.yml`, `pages-retry.yml`, and the advisory weekly `watcher-liveness.yml`) |
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
- **Byte-identical copy**, enforced by `.github/scripts/check-pairs.py` — the
  one list of pairs lives in that script; add a pair there — the template IS the
  live copy.
- **Adapted with documented divergence** where roles differ (`ci-monitor.yml` /
  `ci-notify.yml` watch this repo's workflow name; `qa.yml` here is directive
  validation, not app CI — so the app-shaped pieces like the ui-tests kit and
  `styles/` contract don't apply).
`/audit-repo` treats a shipped-downstream-but-applicable-here miss as drift.

## Branch policy
`global.md` → *GitHub Workflow* and `git.md` → *PR Lifecycle* apply here unchanged:
`claude/<name>` branches, never commit to `main`, draft PR on first push,
squash-merge on green — no approval is sought.

The gate is `git.md` → *Conditional Auto-Merge on Green*: a **clean** current-head Codex verdict — a response
naming the head is not one, since a review with live findings names it too — or
the reaction ladder's attestation, or any state its *unreachable-review test*
admits, stated on the PR. The two states are an *unavailable* reply still inside
its reset window, or a
request that could not be made or accepted at all — never elapsed silence. Every
admitted state needs the fallback reviewer's clean verdict — an independent Claude agent (`git.md` → *PR Lifecycle*). Note that the ladder
clears the verdict gate ONLY. Where no `codex-flagged` label is present, the
ladder is the whole gate and the merge proceeds unattended. Where one is, a reaction-only
round leaves it and escalates. The rest of the gate is unchanged: no `codex-flagged` label,
no unresolved review threads, diff limited to the intended files.

Repo-specific deltas:
- `main` here enforces **Require conversation resolution before merging**
  server-side (owner, 2026-08-26), so an unresolved thread refuses the merge
  rather than depending on a thread read that fails when the quota is out. It
  backstops exactly one gate: a blocked merge with CI green and no
  `codex-flagged` label is that rule firing — resolve the threads, do not retry
  the merge — and everything else in the list above is still checked by the
  session.
- Use a **fresh** `claude/<name>` branch per change; after each squash-merge, cut the
  next from updated `main` rather than reusing/force-pushing one long-lived branch.
- Before merging, verify the PR's file list against GitHub's own diff, not the
  local clone — a surprise file count means a stale/tangled branch.

## Session Start
1. Read all five exported directive files under `directives/` fully — from the
   local working tree, not the raw `main` URLs (on a branch, `main` copies may be stale)
2. Verify the directives-toolkit plugin attached (commands/agents resolve) per `global.md` → *Skill Bootstrap*
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
   `externals` + `considered` (a grouped entry covers its key AND every name in
   its `names` array). Only `borrowed` and `rejected` entries suppress a
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
   survives the filter and is in neither list is the finding. The same pass
   walks `TIME-SENSITIVE.md` row by row and re-checks each fact it lists. Not every
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
- `qa.yml` — `QA — Directive Validation`: every check the *Local gate* below
  lists (that list mirrors it), plus a warn-only external-link job. Each
  guard's design history is in its own
  header comment; what has no single script home is in
  `docs/internal/gate-history.md`.
  It also runs a **Playwright UI test** (`Repo Map UI`) — this repo dogfooding
  its own exported UI-testing standard (`test.md` / `templates/ui-tests`) on its
  interactive Pages artifact, `docs/site/logical-map.html`. What each case covers and why it exists is in
  `docs/internal/repo-map-ui.md`; read that before changing the map, the router,
  or the suite.
- `ci-monitor.yml` — opens/updates a deduplicated `ci-failure` issue when QA fails.
- `ci-notify.yml` — comments on the PR when QA goes green, to wake a watching session. ⚠️ A unique match is not a guaranteed wake for YOUR session — it can hit an unrelated PR, which gets the comment instead. Arm the check-in whenever the run's SHA is not your PR's head.
- `codex-monitor.yml` — adds/clears the `codex-flagged` label from Codex's verdict comments; it misses 👍 and inline-reply verdicts, so check the PR's comments AND its review threads.
- `pages-monitor.yml` — verifies each Pages build is live and opens/updates a `pages-deploy-failure` issue on a problem; `pages-retry.yml` re-runs a transiently failed deploy, bounded.
- `watcher-liveness.yml` — advisory weekly check that each watcher still fires; not a gate.

Per-workflow detail (canonical) and self-test triage (`ci-failure` / `codex-flagged`):
`docs/internal/repo-monitors.md`. Exported automation standard and escalation rules:
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
`scope-chk` and `doc-comp` fire on description match, so a description that
drifts stops firing silently — no error, just absence. `claude plugin eval`
(Anthropic) is the harness: cases live in `plugins/directives-toolkit/evals/`,
each a `prompt.md` plus a skill-fired grader under its own `graders/` dir, using
(`type: tool_used`, `tool: Skill`, `input_match` on the skill name, `arm: both`). Run it from
the plugin directory:
`claude plugin eval --no-publish .`
It defaults to `--ablation with-without`, running every case twice — with the
plugin and without it. **`arm: both` is load-bearing:** in a two-arm run the
harness excludes a `tool_used: Skill` grader from the score and shows it only as
a "plugin-fired indicator", unless the grader says `arm: both` (or it is the
case's only grader). Every grader here says it, so the score IS whether the
skill fired. The without arm has no plugin, so a should-fire case scores 0 there
by construction and its Δ is simply the with-arm firing rate; a should-not-fire
case passes in both arms at Δ 0. Read the score, not Δ, as the result. It costs
real tokens and is NOT in CI; run it when a description changes.

Availability: `plugin eval` is early access, enabled per organization. On a
machine that cannot receive that rollout, `CLAUDE_CODE_WALNUT_SPIRE=1` enables
it — set in the shell, in the user-level Claude settings under `env`, or in
managed settings. Do NOT
commit it to this repo's `.claude/settings.json` — a committed value leaves the
command gated off anyway.

Measured baseline (2026-09-29, 3 runs/case, with/without arms): **12 of 12 pass**,
mean Δ +0.75 (9 should-fire cases at +1, 3 negatives at 0) — neither under- nor over-triggering. The durable lesson, and the
reason to keep measuring: **a description triggers on the WORDS a request
actually uses, not on what the skill is for.** All three gaps found were fixed by
rewriting the description against the measurement; the worked cases are in
`docs/internal/skill-eval-notes.md`.

Re-run the negatives whenever a description is widened: over-triggering is the
failure mode a broader description buys, and it is invisible without them.

## Local gate — CI scripts (this repo)
Before committing or pushing, verify locally — this list mirrors what `qa.yml`
runs, so keep the two in sync:
```
python3 -c "import yaml; print(yaml.safe_load(open('templates/actions/secret-scan/action.yml'))['runs']['steps'][0]['run'])" | bash -eo pipefail   # qa.yml's Secret scan step: runs the composite's own block, so the pattern has no third copy here
npm install --no-save --no-package-lock --ignore-scripts parse5@8.0.1 entities@8.1.0   # check-paths.js's HTML parser and its only dependency, both exact, as qa.yml pins them
node .github/scripts/check-paths.js               # backtick paths in CLAUDE.md, doc citations in shipped files, and every same-site link in a tracked .html page (parsed by parse5, URL-resolved, never outside the Pages root) names a tracked file; refuses without a tracked .nojekyll
node .github/scripts/check-sections.js
node .github/scripts/check-plugin.js
node .github/scripts/check-secret-scan.js
node .github/scripts/check-exports.js            # export boundary: both directions — manifest paths exist AND every shipped file is classified
node .github/scripts/check-learnings.js          # learnings.jsonl: valid JSON, declared types, sane confidence, every file listed by a key's LATEST entry exists (a workflow_run entry's workflows still contain the text); completeness by inverted ownership — every workflow naming workflow_run is listed or exempted with a reason (#370)
node .github/scripts/check-claims.js             # pinned claims still stated by every listed consumer — travelled, NOT true (read its header); a reworded carrier turns it red: add the wording to `phrasings` (#341)
node .github/scripts/check-claims-cases.js       # that guard's own guard. Re-prove with CHECK_CLAIMS_BIN=<mutant>
python3 .github/scripts/check-py-warnings.py      # every tracked .py compiles clean — a `\` in a plain docstring is FATAL on 3.15, and the guard then stops running
(cd templates/ui-tests && npm install --no-package-lock --ignore-scripts)   # run this BEFORE the two viewport checks below (not first in the list): both resolve @playwright/test from here; without it the cases exit 1 "CANNOT RUN"
node .github/scripts/check-ui-viewports-cases.js  # the viewport gate's own guard — needs the ui-tests install ABOVE, and runs a Playwright suite (minutes). Re-prove with CHECK_UI_VIEWPORTS_BIN=<mutant>
python3 .github/scripts/check-ui-suite-env.py templates/actions/ui-suite/action.yml --kit-dir templates/ui-tests  # the ui-suite composite gives both viewport checks the SAME env and cwd as the Playwright run; report-path variables and each step's cwd pinned to literals
python3 .github/scripts/check-ui-suite-env-cases.py  # that env guard's own guard — every branch that can print, incl. the failure paths. Re-prove with CHECK_UI_SUITE_ENV_BIN=<mutant>
python3 .github/scripts/check-report-path-cases.py # the ui-suite report-path validator's own guard — this repo does not use the composite, so nothing else here would notice it break. Re-prove with CHECK_REPORT_PATH_BIN=<mutant>
node .github/scripts/check-contrast-cases.js      # the exported WCAG guardrail's own guard — this repo has no styles/tokens.css, so NOTHING else here would notice it break (#334)
node templates/scripts/check-ui-viewports.js --tests-dir templates/ui-tests   # the shipped Playwright config still declares laptop+tablet+phone
python3 .github/scripts/workflow-ref-guard.py     # every workflow_run name resolves; required watchers intact
python3 .github/scripts/workflow-ref-guard-cases.py  # the guard itself still reads every pinned YAML form
python3 .github/scripts/check-job-bounds.py --include-templates  # every job bounded, none >=360, ui-suite callers >=120 ENFORCED; direct-playwright >=30 is ADVISORY (prints, never fails). The flag adds templates/; downstream omits it
python3 .github/scripts/check-job-bounds-cases.py  # that guard's own guard — an UNREADABLE bound on a floored job must REFUSE, and the no-floor exemption must survive (#334)
python3 .github/scripts/check-toolkit-gates-cases.py  # the push and wait gates block the shapes they claim (+main, an apostrophe-hidden push, `sleep 5m`) and allow the complements; both share gate-lib.sh's quote parser. Re-prove with PUSH_GATE_BIN / WAIT_GATE_BIN / GATE_LIB_BIN=<mutant>
python3 .github/scripts/check-refresh-derivation.py  # /refresh-repo's script derivation still matches every shipped caller — it reads the pattern OUT of refresh-repo.md, so a copy cannot drift from it (PROP6)
python3 .github/scripts/check-refresh-derivation-cases.py  # that guard's own guard — most of its checks never fire against THIS repo (no ragged caller, no missed match, no widened copy), so nothing else would notice them break
python3 .github/scripts/check-action-siblings.py   # every file under `templates/actions/*/` is in the tree `git write-tree` would COMMIT; it does NOT check that carriers install them, nor that a composite names a file that exists
python3 .github/scripts/check-action-siblings-cases.py  # that guard's own guard — real `git init` fixtures, each refusal with its accepting complement. Re-prove with CHECK_ACTION_SIBLINGS_BIN=<mutant>
python3 .github/scripts/check-run-quoting.py       # no apostrophe in a bash `run:` block is read as a shell quote (a single-quote boundary between two letters; a block that does not parse fails too) — the #264 ci-monitor defect, which `bash -n` cannot see. Needs shfmt v3.12.0 as $SHFMT or on PATH: the pinned, sha256-checked download is in qa.yml; without it the guard exits 2 CANNOT CHECK
python3 .github/scripts/check-run-quoting-cases.py # that guard's own guard — the #264 block verbatim, each refusal with its complement. Re-prove with CHECK_RUN_QUOTING_BIN=<mutant>
node .github/scripts/check-browser-ladder-cases.js  # the exported browser ladder's own guard (#332) — failing branches injected, every case drives the SHIPPED ladder. Re-prove with BROWSER_LADDER_BIN=<mutant>
node .github/scripts/build-logical-map.js --check # the committed map still matches the tree; every connection has evidence, every file is wired from the start, no arrow crosses a box
for f in templates/ui-tests/tests/*.js templates/ui-tests/*.js; do node --check "$f" || exit 1; done  # the exported spec and config still PARSE — nothing else in this repo reads them
node .github/scripts/check-links.js --internal   # offline, against the working tree. Strictly SINGLE-LINE: only a reference wholly on one line is counted, and the run says so (#366)
node .github/scripts/check-links-cases.js        # that checker's own guard. Re-prove with CHECK_LINKS_BIN=<mutant> — an ABSOLUTE path
#   ⚠️ check-links rules (history in the check-links-cases.js header):
#   - DO NOT teach it to read across a line break (#365 and #367 both tried, both reverted); keep every `file.md` → *Name* reference on ONE line
#   - Do NOT suppress the self form after a code span naming a `.md` file (#367 rounds 12-16, withdrawn by owner ruling 2026-09-18)
#   - Keep the `\x60` in `(?<![\x60\w])`; do NOT reintroduce the flanking rule; line endings are normalised ONCE by `readSource()`
python3 -c "import yaml, glob; [yaml.safe_load(open(f)) for p in ('.github/workflows/*', 'templates/workflows/*', 'templates/actions/*/action') for e in ('.yml', '.yaml') for f in glob.glob(p + e)]"
python3 .github/scripts/check-pairs.py          # every intentionally identical pair (the list lives in the script) is byte-identical, modes in step, both SessionStart hook copies executable
python3 .github/scripts/check-pairs-cases.py    # that check's own guard — every pair drifted in turn, each mode refusal with its complement. Re-prove with CHECK_PAIRS_BIN=<mutant>
bash -n .claude/hooks/session-start.sh && CLAUDE_CODE_REMOTE=true ./.claude/hooks/session-start.sh   # when the hook changed
npx html-validate@11.16.2 docs/site/logical-map.html         # when the map changed (CI runs it every time, same pin)
node .github/scripts/check-repo-map-ui.js                    # when the map changed; needs `npm i playwright@1.62.1 && npx playwright install chromium` (the version qa.yml pins)
(cd plugins/directives-toolkit && claude plugin eval --no-publish .)   # when an auto-skill's description changed
#   sandboxes that ship a pinned Chromium: CHROMIUM_PATH=/path/to/chrome node .github/scripts/check-repo-map-ui.js
#   after editing EXPORTS.json, the map, or any file a drawn connection quotes, regenerate first: node .github/scripts/build-logical-map.js
```
⚠️ **RUN THE GATE AFTER `git add`, NOT BEFORE — a NEW file is invisible to it
until staged.** `check-exports`, `check-py-warnings` and `check-claims --derive`
all enumerate via `git ls-files`, which does not list untracked paths. So a gate
run on a working tree containing a brand-new file **checks everything except the
thing you just added**, and reports OK. The #325 measurement: `docs/internal/gate-history.md`.
Stage first, then gate.

Confirm `git status` shows no unintended changes. If any check fails, fix it
before pushing rather than pushing and fixing on the PR. The Playwright UI
check needs a browser; it always runs in `qa.yml` (`Repo Map UI` job), so a
local skip is fine for non-map changes.

**This repo's agent-sandbox ceiling: NONE, measured 2026-08-26, re-derived
2026-09-05 with the ladder** — `templates/scripts/browser-ladder.js`, run as
`node <that path> chromium` from `templates/ui-tests`: **LAUNCHES**. The rung
depends on the container, not the repo: re-run 2026-10-08 with the kit resolving
Playwright 1.64.0, it launched at rung "install" — the image's chromium is the
build for its own global Playwright, not the kit's, so a run that finds the kit's
build absent installs it — and at rung "as-is" on the next run. That install also
prunes `/opt/pw-browsers` builds no surviving install references, so a later
`ls` there is not the image's contents. The ladder is the instrument to re-derive this line
with from now on; it grades on the launch and quotes the error when there is one,
which is what `test.md` asks the record to carry.
`test.md` → *Sandboxed local runs* asks every project to record its own limit with
the date, the causes and what would make it wrong. Ours: `check-repo-map-ui.js`
**PASS, all cases, exit 0**. `docs/site/logical-map.html` loads no external
resource of any kind, so the blocked-CDN cause that dominates the fleet's app
repos cannot reach it, and the suite drives chromium, which installs and launches
here. So a
local failure here is evidence about the map, not the environment — the opposite
of the downstream default.

**What would make this wrong** — re-derive on any of these rather than trusting
the line:
- chromium ceasing to **launch** here, whether the image drops it or it stays
  present and stops starting (host libraries, sandbox policy, permissions, the
  browser/runtime pairing). Presence is not usability, so do not shorten this to
  a binary check.
- the suite's **browser matrix or runner changing** — adding a webkit or firefox
  project would put the ceiling back in question even with chromium fine and the
  map still self-contained. (The image ships neither preinstalled — a webkit
  build under `/opt/pw-browsers` was put there by a session's install, not the
  image — which per
  `test.md` is **not** the same as unavailable: attempt the install and check
  whether it launches.)
- the map gaining **any external resource**.

## Escalation rules
`global.md` → *Escalation Rules* apply here unchanged — all four gates, not a
subset. No repo-specific additions.

`global.md` → *A Knowing Deviation Is an Escalation* applies here too. Where a
directive or rules file in this repo contradicts what the owner just said, follow
its third bullet in order: raise the contradiction, quote both, **ask which
stands**, and fix the record in the same change once he has answered.

## Notifications (owner ruling, 2026-08-23)
**Keep the PR subscription until the PR merges.** Opening a PR auto-subscribes the
session harness-side — leave it alone; the harness drops it at merge. Never
unsubscribe from a PR you are driving (`git.md` → *PR Lifecycle*). This replaces
the former preference for immediate unsubscription plus one consolidated check-in.

Do not arm a timed check-in as a substitute for a subscription. A timer cannot
know whether anything changed.

No setting suppresses the `<wake reason=…>` envelopes themselves (verified
2026-08-21) — don't hunt for a config toggle.

**Heartbeat.** `global.md` → *Status Line on Every Stop* rides on a wake that
already happens. Never arm an extra wake to keep a rhythm.

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
