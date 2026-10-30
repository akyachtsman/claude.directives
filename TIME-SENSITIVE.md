# TIME-SENSITIVE.md — facts that expire

This file lists the places the directives lean on something **outside this
repo** that can change without this repo changing: Claude models and Claude Code,
GitHub, Codex, the test environment, and outside services. Each of those facts
was true when it was written and has to be re-checked.

**What is NOT here:** the owner's standing directives. A ruling such as
"squash-merge on green" or "RLS always on" changes only when the owner rules
again, so it never expires. Where a ruling rests on a platform fact (e.g. the
merge gate relies on how Codex posts a verdict), the FACT is listed here and the
ruling is not.

Internal to this repo; not imported downstream. Downstream projects receive the
corrections through the directives they already import.

## How the rows work
**A row is a pointer, not a specification** (owner ruling, 2026-09-24).
- **Topic** names what can expire, in a few words. It does not restate the
  claim, list its parts, or list every file that repeats it.
- **Source** is the one place that states the exact claim. The source owns the
  wording, the numbers and any dates of its own measurements.
- **Last checked** is when someone last confirmed the source still holds.
  "never verified" means nobody has recorded a check: the cell says when the row
  was first entered and when an audit last reported it. Re-check those first.
- **Check** is ONE read-only action anyone can run now — a docs page, a
  `--help`, a tool list, a read-only API call, output that already exists — or
  it starts with ⏳ and names the event that will show it. **A check never
  creates anything**: no PR, session, environment save, deploy, install or test
  repo. When in doubt, it is ⏳.

This is a register that grows, not a proof of completeness. It started from a
census of every tracked Markdown file on 2026-09-24; a topic found missing later
is added by the pass that finds it.

## When to re-check
- **Every `/audit-repo` run** walks the list (`CLAUDE.md` → *Session Start*, step
  5): it runs every check that is not ⏳, and reports the age of the ⏳ rows.
- **At once, for the rows it touches**, when Anthropic ships a model or a Claude
  Code release touching agents, plugins, skills, hooks, settings or cloud
  sessions; when GitHub changes Actions, Pages, the API, rulesets or webhooks;
  when the Playwright version moves; when Codex behaves differently; or when any
  session sees something that contradicts a source.

## How to handle a row
1. Run its check against what its Source says.
2. **Still holds:** update *Last checked* here — from `/audit-repo`, as a proposed
   fix applied after approval like any other finding. Touch the source's own
   date only where the source carries a verification stamp for that fact, never
   an `(owner ruling, <date>)` stamp: that records a decision, not a check.
3. **No longer holds:** fix the Source in a PR, and in the same PR search the
   repo for every other place that repeats the claim and fix those too. The row
   does not list them; the search finds them.
4. **New topic:** anything the directives start relying on about an outside
   system gets a row in the PR that adds it, dated or not.

## Models & sub-agents
| Topic | Source | Last checked | Check |
|---|---|---|---|
| Model aliases the Agent tool accepts, and alias resolution | `global.md` → *Subagent Model Selection* | 2026-10-11 | This session's Agent tool `model` values; code.claude.com/docs/en/sub-agents |
| How a sub-agent's model is chosen (call, frontmatter, env var, fork) | `global.md` → *Subagent Model Selection* | 2026-10-11 | code.claude.com/docs/en/sub-agents |
| Agent frontmatter `model:` field | `plugins/directives-toolkit/agents/test-verifier.md` | 2026-10-11 | code.claude.com/docs/en/sub-agents |
| Sub-agents spawning sub-agents (nesting depth limit) | `directives/test.md` → *QA before merge* | 2026-10-11 | code.claude.com/docs/en/sub-agents, section "Let subagents spawn their own subagents" |
| Sub-agent nesting in this cloud environment (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` is set to 1 in the process environment, in no settings file) | `directives/test.md` → *QA before merge*; `EXPORTS.json` → `considered.workflow-authoring` | 2026-10-12 | `env` piped to `grep SPAWN_DEPTH` in a top-level web session (the 2026-10-12 reading came from a child session). If the variable is gone or above 1, nesting is back and the QA sequence could run inside one agent |

## Claude Code & cloud sessions
| Topic | Source | Last checked | Check |
|---|---|---|---|
| How web sessions get the toolkit (setup script, `SessionStart` hook) | `global.md` → *Skill Bootstrap* | 2026-10-06 | ⏳ The next fresh web session's start-up output |
| When a hook-fetched plugin update takes effect | `NEW-REPO-USER-INSTRUCTIONS.md` → *Step 0* | 2026-10-06 | ⏳ The next session whose `SessionStart` hook fetches an update |
| What rebuilds the cached setup script | `MAINTAIN-REPO-USER-INSTRUCTIONS.md` → *Environment Maintenance* | 2026-10-11 | code.claude.com/docs/en/cloud-environments, section *Environment caching* |
| Whether an edit-and-save that rebuilds the cache lands in the next NEW session | `MAINTAIN-REPO-USER-INSTRUCTIONS.md` → *Environment Maintenance* | never verified; first entered 2026-10-08 (reported 2026-10-12) | ⏳ The next time the owner edits and saves an environment's setup script (the 2026-08-19 save was unchanged, so it never tested this) |
| `claude plugin install` / `update` scope defaults | `scripts/install-toolkit.sh` (steps 4–5) | 2026-10-11 | `claude plugin install --help`, `claude plugin update --help` |
| `claude plugin install` is a no-op on an installed plugin, and `update` moves it to its marketplace's head | `scripts/install-toolkit.sh` (steps 2 and 4) | 2026-08-05 (the source's own stamp) | ⏳ The next web session's `SessionStart` hook output: the install step reports the plugin already installed, and the update step moves it to a newer version when one exists |
| How a session detects it is on the web (`CLAUDE_CODE_REMOTE`) | `plugins/directives-toolkit/commands/env-chk.md` | 2026-10-11 | `env` in this session |
| Which `gh` a web session has: Claude Code's built-in client (`gh api` only) or the GitHub CLI | `plugins/directives-toolkit/skills/update-pages/SKILL.md`, step 4 | 2026-10-12 | `gh --version` in a web session: the built-in client says it is not the GitHub CLI and names the `gh api` form. code.claude.com/docs/en/cloud-environments says the GitHub CLI is preinstalled, so the answer can differ by environment; a session with the real CLI contradicts the source |
| PR subscription lifecycle (auto-subscribe on open, drop on merge) | `git.md` → *PR Lifecycle* | 2026-09-24 | ⏳ The next PR a session opens and merges |
| Scheduling-tool names the settings pre-approve | `global.md` → *Scheduling Tools Never Prompt* | 2026-10-11 | This session's tool list against `templates/claude-settings.json` |
| How permission rules match a tool: deny > ask > allow, `mcp__<server>` names a whole server, deny/ask globs anywhere, allow globs only after a literal `mcp__<server>__` | `plugins/directives-toolkit/scripts/allowlist-check.sh`, its matching comment | 2026-10-12 | code.claude.com/docs/en/permissions, sections *Manage permissions* and the MCP tool-name rules |
| Wake envelopes cannot be switched off | `CLAUDE.md` → *Notifications* | 2026-10-11 | Claude Code settings docs |
| `claude plugin eval` availability (minimum Claude Code version) | `docs/internal/skill-eval-notes.md` → *Running it* | 2026-10-11 | `claude --version` and `claude plugin eval --help`; code.claude.com/docs/en/plugin-evals for the minimum version |
| How `plugin eval` scores a `tool_used: Skill` grader in a two-arm run (`arm: both`) | `docs/internal/skill-eval-notes.md` → *What the score and Δ mean* | 2026-10-11 | `claude plugin eval --help` (the `--ablation` option), and code.claude.com/docs/en/plugin-evals, section *Compare against a no-plugin baseline* |
| Hosts the default network level blocks | `NEW-REPO-USER-INSTRUCTIONS.md` → *Step 0* | 2026-10-11 | Claude Code on the web docs, network access |
| When a network-allowlist change reaches running sessions | `global.md` → *Network Access Playbook (cloud sessions)* | 2026-10-11 | code.claude.com/docs/en/cloud-environments, section *Network access* |
| Claude Code reads the project-scope MCP file from `.mcp.json` at the repo root (its docs suggest committing one that holds no secrets; this standard keeps it gitignored) | `data.md` → *MCP Configuration* | 2026-10-11 | code.claude.com/docs/en/mcp (owner ruling 2026-10-08: it stays gitignored, `data.md` → *MCP Configuration*) |
| WebFetch obeys the egress policy | `global.md` → *Network Access Playbook (cloud sessions)* | 2026-10-12 | WebFetch a policy-denied host (`example.com` is one): it fails with `getaddrinfo ENOTFOUND <host>`, which here means the policy denied it, not that the host does not exist. Confirm with `curl -sS -o /dev/null https://<host>/`: a policy denial is `CONNECT tunnel failed, response 403` |
| `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` semantics | `global.md` → *Subagent Model Selection* | 2026-10-11 | code.claude.com/docs/en/sub-agents, "Run every subagent on one model" |
| What a command's text has substituted on load | `plugins/directives-toolkit/scripts/refresh-stamp.sh`, its header | 2026-10-11 | Load `plugin-dev:command-development` (its body shows `$ARGUMENTS`, `$1`, `$2`, `$3` and `${CLAUDE_PLUGIN_ROOT}`) with TWO arguments (`AAA BBB`) and with none, and read what comes back: `$ARGUMENTS` is always substituted; `$1` becomes `BBB` with two arguments and `$2` stays literal, so `$N` is 0-based and substituted only when that argument exists; `${CLAUDE_PLUGIN_ROOT}` (braced) is substituted. No installed skill shows `$0` itself, so `$0` as the first argument is inferred from `$1`, not observed |
| Project threads list no plugin slash commands, and `disable-model-invocation: true` hides a command from the model's Skill list | `directives/global.md` → *Owner-Only Commands* | 2026-10-25 | In a project thread, read the skills listed to the session: `directives-toolkit:env-chk` is there, and a command that sets `disable-model-invocation` is not |
| How a `PostToolUse` command hook gives Claude a non-blocking message: exit 0 with JSON on stdout, `hookSpecificOutput.additionalContext` reaching Claude beside the tool result and `systemMessage` shown to the user; exit 2 also reaches Claude (stderr) but renders as a hook blocking error after an edit that succeeded | `plugins/directives-toolkit/hooks/hooks.json`, the inline `PostToolUse` advisory; `plugins/directives-toolkit/scripts/pages-edit-gate.sh`, its header; `.github/scripts/check-toolkit-gates-cases.py`, its header | 2026-10-13 | code.claude.com/docs/en/hooks, sections *PostToolUse decision control* and *JSON output* (exit 0 stdout is NOT shown to Claude for `PostToolUse`, so plain text would be lost); the blocking-error rendering was reported by the claude.trading and claude.prop pilots (2026-10-13) — re-check it in a session that edits a CLAUDE.md |
| A web session gets GitHub credentials only for the repos attached to it, so a private claude.directives is reachable over git from another project only where it is attached | `global.md` → *Session Start* step 1; `.claude/hooks/session-start.sh` | 2026-10-25 | A `curl` of the GitHub API's `/user` endpoint in a web session (answers as the owner) and the same call on a repo outside the session's scope (403). Re-check before switching the repo to private, and for git, `git ls-remote` on a private repo attached and not attached |

## Anthropic plugins & built-in skills
| Topic | Source | Last checked | Check |
|---|---|---|---|
| `pr-review-toolkit` and `security-guidance` plugins | `test.md` → *QA/data agents* | 2026-10-11 | Each registered marketplace's `marketplace.json` under `~/.claude/plugins/marketplaces/` |
| `plugin-dev` plugin and its skills | `CLAUDE.md` → *Toolkit changes* | 2026-10-11 | This session's skill list |
| Built-in `/code-review` and `/security-review` | `test.md` → *QA/data agents* | 2026-10-11 | This session's skill list |
| Built-in `dataviz` and `artifact-diagramming` | `design.md` → *Charts & data display*, `design.md` → *Diagrams & connectors* | 2026-10-11 | This session's skill list |
| Built-in `anthropic-skills:docx` and `anthropic-skills:pdf` (text extraction, OCR for scanned PDFs) | `plugins/directives-toolkit/skills/doc-comp/SKILL.md` | 2026-10-11 | This session's skill list: both skills listed, and the `pdf` skill's own description still names OCR for scanned PDFs |
| Built-in `update-config` skill in web sessions, and its merge procedure | `plugins/directives-toolkit/commands/refresh-repo.md` → *Settings writes* | 2026-10-11 | A web session's skill list shows `update-config`; invoking it (it only loads text) still says read first and merge arrays rather than replace them |
| Native-parity verdicts | `EXPORTS.json` → `considered` | 2026-10-11 | The `/audit-repo` native-parity pass |
| The Anthropic-authored LSP plugin set (twelve names) | `EXPORTS.json` → `considered.lsp-plugins` | 2026-10-11 | the `claude-plugins-official` `marketplace.json` |
| `discord`, `telegram`, `imessage`, `fakechat` are third-party plugins listed under the official marketplace's `external_plugins/`, not Anthropic-built | `EXPORTS.json` → `considered.messaging-channels` | 2026-10-11 | In the `claude-plugins-official` `marketplace.json`, each plugin's `source` path still starts `./external_plugins/`; if one moves under `./plugins/` or gains Anthropic authorship, re-judge the entry |
| The built-in `anthropic-plugin-directory` marketplace keeps its inventory in `~/.claude/plugins/plugin-directory-cache-v2.json` (no clone), with the fields the parity pass's ownership filter reads | `plugins/directives-toolkit/commands/audit-repo.md`, the native-parity bullet | 2026-10-11 | `ls ~/.claude/plugins/`, then read the file's top-level keys and one entry of `listings` (`name`, `source.repository`, `checks.review.by`) |

## GitHub
| Topic | Source | Last checked | Check |
|---|---|---|---|
| Where GitHub accepts YAML anchors, aliases and merge keys | `.github/scripts/gh_yaml.py`, the *ANCHORS, ALIASES AND MERGE KEYS* paragraph of its header | 2026-10-12 | github/docs `content/actions/reference/workflows-and-actions/reusing-workflow-configurations.md` (anchors, workflows only) and `metadata-syntax.md` (no anchors); actions/runner `src/Runner.Worker/ActionManifestManagerWrapper.cs` and the manifest's `YamlObjectReader` (`allowAnchors` off); actions/languageservices `workflow-parser/src/workflows/yaml-object-reader.ts` (aliases resolved, `<<` never merged). Anchors become usable when the runner reads manifests with them on: then lift the action-file refusal in `run-local-gate.py` |
| The Ubuntu release `ubuntu-latest` resolves to | `.github/scripts/run-local-gate.py` → `UBUNTU_LATEST`; `templates/actions/ui-suite/action.yml`, the `Install Playwright browsers` step | 2026-10-12 | The label table in the README of `actions/runner-images` (raw.githubusercontent.com/actions/runner-images/main/README.md) and its Announcement issues: #14748 moves the label to 26.04 runner by runner from 2026-10-19, done by 2026-11-19 |
| API quotas and which calls are REST vs GraphQL | `git.md` → *GitHub API Quota Economy* | 2026-10-11 | `GET /rate_limit`; GitHub REST and GraphQL docs |
| What the session proxy lets through (`api.github.com`, git) | `plugins/directives-toolkit/commands/env-chk.md` | 2026-10-11 | A read-only curl and `git ls-remote` from this session |
| Pages caching | `global.md` → *Hosting & Deployment* | 2026-10-11 | `curl -I` a Pages URL |
| Pages build events under each Pages source | `docs/standards/hosting-mechanics.md` → *Monitoring after a switch to Actions-source* | 2026-10-11 | The `page_build` section of GitHub's events-that-trigger-workflows reference, read over `raw.githubusercontent.com/github/docs/main/content/` (`actions/reference/workflows-and-actions/events-that-trigger-workflows.md`; docs.github.com is egress-blocked in web sessions) |
| Pages deploy failure and cache patterns | `plugins/directives-toolkit/skills/update-pages/SKILL.md` | never verified; first entered 2026-09-24 (reported 2026-10-12) | ⏳ The next deploy that misbehaves |
| Where repo settings live (auto-merge, branch delete, conversation resolution) | `git.md` → *Repo-settings preflight* | 2026-10-11 | GitHub docs, read over `raw.githubusercontent.com/github/docs/main/content/` (`repositories/configuring-branches-and-merges-in-your-repository/`; docs.github.com is egress-blocked in web sessions); `GET /repos/{owner}/{repo}/rules/branches/main` |
| Scheduled-workflow inactivity auto-disable | `plugins/directives-toolkit/commands/new-repo.md` | 2026-10-11 | GitHub Actions docs, read over `raw.githubusercontent.com/github/docs/main/content/` (`actions/how-tos/manage-workflow-runs/disable-and-enable-workflows.md`; docs.github.com is egress-blocked in web sessions) |
| Actions cache scope | `docs/standards/cicd-setup.md` → *Step 1* | 2026-10-11 | GitHub Actions cache docs, read over `raw.githubusercontent.com/github/docs/main/content/` (`actions/reference/workflows-and-actions/dependency-caching.md`; docs.github.com is egress-blocked in web sessions) |
| Pages serves every committed path of a branch-source site | `docs/standards/hosting-mechanics.md` → *Choosing the Pages source* | 2026-10-11 | `curl -I` this repo's Pages URL for `CLAUDE.md` and a `docs/internal/` file |
| What the GitHub MCP reads return for reactions and labels on a PR | `docs/standards/pr-mechanics.md` → *Reading reactions* | 2026-10-11 | `issue_read` (`get`, `get_labels`) and `pull_request_read` (`get`) on a merged PR of this repo |
| What each GitHub MCP write tool commits | `global.md` → *A Blocked Command Is Not a Blocked Capability* | 2026-10-11 | The descriptions and parameters of `create_or_update_file`, `push_files`, `delete_file` and `create_branch` in this session's tool list |
| The GitHub MCP `actions_list` run filters (`event` sits under `workflow_runs_filter` and has no `dynamic` value) | `plugins/directives-toolkit/skills/update-pages/SKILL.md`, step 4 | 2026-10-12 | `actions_list`'s parameters in this session's tool list: where `event` sits and its enum |
| Branch-rules and reactions APIs are readable through a web session's `gh api`; the proxy's `ccr/` stand-in routes | `git.md` → *Repo-settings preflight*, `git.md` → *GitHub API Quota*; `pr-mechanics.md` → *Reading reactions* | 2026-10-11 | `gh api repos/<o>/<r>/rules/branches/main`; `gh api repos/<o>/<r>/issues/<n>/reactions`; `gh api repos/<o>/<r>/pulls/<n>/ccr/x` prints the route list |
| What the Pages actions (v5) do with dotfiles, symlinks and `page_url` | `.github/workflows/shared-pages-deploy.yml`, its header | 2026-10-11 | `git ls-remote --tags https://github.com/actions/upload-pages-artifact.git` (and `deploy-pages`), then read `action.yml` at the newest tag |
| Pages settings endpoint through a web session's proxy | `plugins/directives-toolkit/skills/update-pages/SKILL.md`, step 3 | 2026-10-11 | `gh api repos/{owner}/{repo}/pages` from a web session |
| GitHub Action major pins (`actions/checkout`, `setup-node`, `cache`, `upload-artifact`): each pin is a current major on a runtime GitHub's runners still provide | Every `uses: actions/<name>@vN` in `.github/workflows/` and `templates/` | 2026-10-12 (checkout@v7, setup-node@v7, cache@v6, upload-artifact@v7, the newest majors; none runs on a removed runtime) | `git ls-remote --tags https://github.com/actions/<name>.git` for the newest major, `runs.using` in the pinned major's `action.yml` (raw URL), and the job annotations of the latest QA run (`gh api repos/<o>/<r>/check-runs/<job-id>/annotations`): a "Node.js NN is deprecated" warning names every pin on a removed runtime. Re-check at once when GitHub's changelog announces an Actions runtime deprecation (github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions) |
| GitHub runner behaviour the local gate emulates: the shell each `run:` gets, `$GITHUB_ENV`/`$GITHUB_PATH` file parsing, default variables a step cannot override, `timeout-minutes` | `.github/scripts/run-local-gate.py`, its header | 2026-10-12 | Read over raw.githubusercontent.com: actions/runner's `src/Runner.Worker/FileCommandManager.cs` (the env-file parser) and `src/Runner.Worker/Handlers/ScriptHandlerHelpers.cs` (shell arguments), and GitHub's docs at `github/docs/main/data/reusables/actions/supported-shells.md` and `content/actions/reference/workflows-and-actions/variables.md`. CI stays authoritative, so drift shows as the local gate disagreeing with CI, not as a broken CI |
| The Node.js major CI selects (`node-version`) is still supported upstream | Every `node-version:` in `.github/workflows/` and `templates/` | 2026-10-12 (every `node-version:` selects 22, supported upstream; 20 reached end of life 2026-04-30) | The selected major's `end` date in raw.githubusercontent.com/nodejs/Release/main/schedule.json; before moving the major, the html-validate row below |
| A public repo cannot call a reusable workflow in a private repo, and a private repo's run token cannot read another private repo | `docs/internal/shared-workflows.md` → *How a callable workflow differs from the old full copies*; `MAINTAIN-REPO-USER-INSTRUCTIONS.md` → *Releasing the shared workflows* (this repo stays public while a public project calls it) | 2026-10-26 | GitHub docs, read over `raw.githubusercontent.com/github/docs/main/content/`: `actions/how-tos/reuse-automations/share-across-private-repositories.md` (the Access setting grants access to other *private* repositories only) and the automatic-token page under `actions/` (the run token is scoped to the repository the workflow runs in) |

## Codex
| Topic | Source | Last checked | Check |
|---|---|---|---|
| What triggers a Codex review, and how fast it answers | `docs/standards/pr-mechanics.md` → *Review triggers* | 2026-10-06 | ⏳ The next few requests, timed comment to verdict |
| Codex reviews are metered per request | `docs/standards/pr-mechanics.md` → *Review metering* | 2026-08-17 | ⏳ The next review request: the account's Codex usage before and after it |
| The forms a clean verdict takes | `git.md` → *PR Lifecycle* | 2026-10-15 (the all-clear comment now opens with `<!-- codex-review-receipt:v1 -->` and a blank line before `Codex Review: Didn't find any major issues`, #457) | The next clean review's comment body (`gh api repos/<o>/<r>/issues/comments/<id> --jq .body`) |
| One same-type reaction per user | `docs/standards/pr-mechanics.md` → *Reading reactions* | 2026-10-11 | GitHub's REST OpenAPI description (`raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json`): the create-reaction operations still say a `200` means you "already added the reaction type" (the docs page for reactions is generated and does not carry the sentence) |
| The *Codex Review Summary* comment (Running / Completed) is progress, not a verdict | `git.md` → *PR Lifecycle* | 2026-10-06 | ⏳ The next review request: the summary's wording and statuses |
| Codex allowance and the *unavailable* reply | `git.md` → *PR Lifecycle* | never verified; first entered 2026-09-24 (reported 2026-10-12) | ⏳ The next unavailable reply |

## Test environment
| Topic | Source | Last checked | Check |
|---|---|---|---|
| The Ubuntu release web sessions run, which this repo's CI pins to match | `.github/workflows/qa.yml`, every job's `runs-on`; `.github/scripts/run-local-gate-cases.py` reads the host's | 2026-10-12 | `grep VERSION_ID /etc/os-release` in a web session (24.04 on 2026-10-12); move qa.yml's pins only with it |
| This repo's sandbox ceiling | `CLAUDE.md` → *Local gate — CI scripts (this repo)*; measurements in `docs/internal/repo-map-ui.md` → *Sandbox ceiling* | 2026-10-12 | `NODE_PATH="$(npm root -g)" node -e "require('playwright').chromium.launch().then(b => b.close())"`: launches the image's preinstalled chromium through the image's own Playwright and installs nothing; exit 0 means chromium still launches here. If it fails, re-derive the record with the ladder as its source says, in a session where an install is acceptable |
| Fleet sandbox ceilings and egress | `test.md` → *Sandboxed local runs* | 2026-08-26 | ⏳ The next session in each app repo |
| Which Playwright version the kit resolves to | `templates/ui-tests/package.json` | 2026-10-11 | `npm view "@playwright/test@^1.62.1" version` (a registry read, installs nothing) |
| Playwright behaviour the kit and the viewport gate rely on — each measurement is dated in its source | `test.md` → *Playwright* | 2026-10-08 | ⏳ The next Playwright version bump: re-run the measurements the source and `templates/scripts/check-ui-viewports.js` cite |
| Playwright releases since those measurements (taken on 1.62.1, 1.63.0 and 1.64.0) | `templates/ui-tests/package.json` | 2026-10-11 | `npm view playwright time --json`: 1.64.0 (published 2026-10-07) is the newest release and what the kit's range installs; a newer one makes the row above due |
| Where preinstalled browsers live | `plugins/directives-toolkit/agents/ui-tester.md` | 2026-10-11 | `ls "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"` in this session |
| `dvh` support in the browsers the kit ships | `plugins/directives-toolkit/agents/ui-tester.md` → *Known CI Compatibility Issues* | 2026-10-11 | MDN browser-compat data for `dvh` against the runner image's browser versions |
| shfmt v3.12.0 is the newest mvdan/sh release that publishes `sha256sums.txt` (v3.11.0 and v3.12.0 do; v3.13.0 through v3.14.1 do not) | `.github/workflows/qa.yml`, the `Install shfmt` step | 2026-10-11 | For each newer release: `curl -sSfL https://github.com/mvdan/sh/releases/download/<tag>/sha256sums.txt`; if one now publishes it, move the pin and its checksum, then re-run `check-run-quoting-cases.py` |
| parse5 8.0.1 (2026-04-19) is the newest stable release, and its whole dependency graph is parse5 plus entities, pinned at entities 8.1.0 (2026-09-07, no dependencies of its own) | `.github/workflows/qa.yml`, the `Install parse5` step | 2026-10-11 | `npm view parse5 dist-tags.latest` and `npm view parse5@<v> dependencies`; move both pins together and re-run the link-check cases |
| html-validate 10.17.0 is the pinned version of the map's HTML validator, kept from when the job ran Node 20; the job now runs Node 22, so 11.x (^22.22.0 or >=24.8.0) is open as its own change | `.github/workflows/qa.yml`, the `Validate map HTML` step; `CLAUDE.md` → *Local gate* | 2026-10-11 | `npm view html-validate@<v> engines.node` against the job's `node-version` (an 11.x pin failed CI on Node 20, #424), then its changelog for default-rule changes; move the pin in both places together, and the job to Node 22 first to take 11.x |
| `npx html-validate` needs `npm_config_legacy_peer_deps=true`: from vitest 5.0.5 (published 2026-10-15) npm 10's peer-set resolution crashes on html-validate's optional peers ("Cannot read properties of null (reading 'edgesOut')") | `.github/workflows/qa.yml`, the `Validate map HTML` step; `CLAUDE.md` → *Local gate*; `templates/CLAUDE-template.md` → *Required Commands*; `/new-repo` step 8; the `update-pages` skill | 2026-10-15 | With an empty cache, `npm_config_cache=$(mktemp -d) npx --yes html-validate@10.17.0 docs/site/logical-map.html` WITHOUT the env var: once it passes (a fixed npm or vitest), drop the env var from every place listed |
| Web-session git fetch cost | `plugins/directives-toolkit/commands/refresh-repo.md` | 2026-09-23 | ⏳ The next `/refresh-repo` run |
| `/opt/pw-browsers/chromium` symlink target (build 1194, Chromium 141 on 2026-10-08) | `global.md` → *Network Access Playbook (cloud sessions)*, rung 6 | 2026-10-11 | `ls -la /opt/pw-browsers` |

## Outside services & standards
| Topic | Source | Last checked | Check |
|---|---|---|---|
| Supabase MCP tools and `query_logs` window | `plugins/directives-toolkit/agents/supabase.md` | 2026-10-11 | Supabase MCP docs |
| Supabase key roles and default function grants | `data.md` → *Keys*, `data.md` → *Client Auth Pattern (static app + anon key)* | 2026-10-11 | Supabase docs via the MCP `search_docs` tool (database advisor lints 0028/0029) |
| Supabase default table grants, pg_net's `PUBLIC` queue grant, and leaked-password protection's plan | `data.md` → *Supabase Defaults* | 2026-10-27 | Supabase docs via the MCP `search_docs` tool (the "Securing your API" page, its default-privileges section, where Supabase says it is moving the default to revoke; the "Password security" page) |
| What the Supabase connector's destructive-SQL detector fires on, and that a remote Claude Code session (project thread, Cowork, Routine) cannot answer its form, so the call times out at 60 s | `data.md` → *MCP Configuration* | 2026-10-30 | supabase/mcp `packages/mcp-server-supabase/src/tools/destructive-sql.ts` on GitHub; code.claude.com/docs/en/mcp, its section on responding to MCP elicitation requests; anthropics/claude-code#88901 (still open means still true) |
| That a claude.ai chat with the Supabase connector, and the Claude Code terminal, draw the connector's form, so the owner answers it there; and that a remote Claude Code session still cannot (the weekly scheduled task "Supabase form in project threads" re-checks the Claude Code side) | `data.md` → *MCP Configuration* | 2026-10-30 | ⏳ The next destructive migration the owner applies from a chat; anthropics/claude-code#88901 closing with a fix is the signal to re-measure from a thread |
| Stitch and Figma MCPs for design import | `design.md` → *Establishing your project's look* | 2026-10-11 | `figma` in the `claude-plugins-official` marketplace.json; Stitch's remote MCP endpoint (`stitch.googleapis.com/mcp`) in Google Cloud's MCP supported-products list |
| WCAG thresholds and target sizes | `design.md` → *Accessibility*, `design.md` → *Cross-platform & responsive* | 2026-10-11 | The current WCAG recommendation |

## Measured baselines
| Topic | Source | Last checked | Check |
|---|---|---|---|
| Auto-skill eval baseline | `docs/internal/skill-eval-notes.md` | 2026-09-29 | ⏳ The next time an auto-skill description changes and the eval is run |
| What sizes the 120-minute UI-suite timeout floor | `templates/actions/ui-suite/action.yml` (header, CALLER BOUND) | never verified; first entered 2026-09-24 (reported 2026-10-12) | ⏳ The next slow-end fleet UI run's timings |
| Fleet auth-scenario and request timings | `test.md` → *Playwright* | 2026-08-25 | ⏳ The next session in those repos |
