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
  "undated" means nobody has recorded a check; re-check those first.
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
| Model aliases the Agent tool accepts, and alias resolution | `global.md` → *Subagent Model Selection* | 2026-10-09 | This session's Agent tool `model` values; code.claude.com/docs/en/sub-agents |
| How a sub-agent's model is chosen (call, frontmatter, env var, fork) | `global.md` → *Subagent Model Selection* | 2026-10-09 | code.claude.com/docs/en/sub-agents |
| Agent frontmatter `model:` field | `plugins/directives-toolkit/agents/test-verifier.md` | 2026-10-09 | code.claude.com/docs/en/sub-agents |
| Sub-agents spawning sub-agents (nesting depth limit) | `plugins/directives-toolkit/agents/qa-pipeline.md` | 2026-10-09 | code.claude.com/docs/en/sub-agents, section "Let subagents spawn their own subagents" |

## Claude Code & cloud sessions
| Topic | Source | Last checked | Check |
|---|---|---|---|
| How web sessions get the toolkit (setup script, `SessionStart` hook) | `global.md` → *Skill Bootstrap* | 2026-10-06 | ⏳ The next fresh web session's start-up output |
| When a hook-fetched plugin update takes effect | `NEW-REPO-USER-INSTRUCTIONS.md` → *Step 0* | 2026-10-06 | ⏳ The next session whose `SessionStart` hook fetches an update |
| What rebuilds the cached setup script | `MAINTAIN-REPO-USER-INSTRUCTIONS.md` → *Environment Maintenance* | 2026-10-09 | code.claude.com/docs/en/cloud-environments, section *Environment caching* |
| Whether an edit-and-save that rebuilds the cache lands in the next NEW session | `MAINTAIN-REPO-USER-INSTRUCTIONS.md` → *Environment Maintenance* | undated | ⏳ The next time the owner edits and saves an environment's setup script (the 2026-08-19 save was unchanged, so it never tested this) |
| `claude plugin install` / `update` scope defaults | `scripts/install-toolkit.sh` (steps 4–5) | 2026-10-09 | `claude plugin install --help`, `claude plugin update --help` |
| How a session detects it is on the web (`CLAUDE_CODE_REMOTE`) | `plugins/directives-toolkit/commands/env-chk.md` | 2026-10-09 | `env` in this session |
| PR subscription lifecycle (auto-subscribe on open, drop on merge) | `CLAUDE.md` → *Notifications* | 2026-09-24 | ⏳ The next PR a session opens and merges |
| Scheduling-tool names the settings pre-approve | `global.md` → *Scheduling Tools Never Prompt* | 2026-10-09 | This session's tool list against `templates/claude-settings.json` |
| Wake envelopes cannot be switched off | `CLAUDE.md` → *Notifications* | 2026-10-09 | Claude Code settings docs |
| `claude plugin eval` availability (minimum Claude Code version) | `CLAUDE.md` → *Toolkit (commands, skills, agents, hooks)* | 2026-10-09 | `claude --version` and `claude plugin eval --help`; code.claude.com/docs/en/plugin-evals for the minimum version |
| How `plugin eval` scores a `tool_used: Skill` grader in a two-arm run (`arm: both`) | `docs/internal/skill-eval-notes.md` → *What the score and Δ mean* | 2026-10-09 | `claude plugin eval --help` (the `--ablation` option), and code.claude.com/docs/en/plugin-evals, section *Compare against a no-plugin baseline* |
| Hosts the default network level blocks | `NEW-REPO-USER-INSTRUCTIONS.md` → *Step 0* | 2026-10-09 | Claude Code on the web docs, network access |
| When a network-allowlist change reaches running sessions | `global.md` → *Network Access Playbook (cloud sessions)* | 2026-10-09 | code.claude.com/docs/en/cloud-environments, section *Network access* |
| Claude Code reads the project-scope MCP file from `.mcp.json` at the repo root (its docs suggest committing one that holds no secrets; this standard keeps it gitignored) | `data.md` → *MCP Configuration* | 2026-10-09 | code.claude.com/docs/en/mcp (owner ruling 2026-10-08: it stays gitignored, `data.md` → *MCP Configuration*) |
| WebFetch obeys the egress policy | `global.md` → *Network Access Playbook (cloud sessions)* | 2026-10-09 | WebFetch a policy-denied host and expect `EGRESS_BLOCKED` ("blocked by the network egress proxy") |
| `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` semantics | `global.md` → *Subagent Model Selection* | 2026-10-09 | code.claude.com/docs/en/sub-agents, "Run every subagent on one model" |
| What a command's text has substituted on load | `plugins/directives-toolkit/scripts/refresh-stamp.sh`, its header | 2026-10-09 | Load a plugin skill whose body shows `$ARGUMENTS`, `$0` and `$1` (`plugin-dev:command-development`) with TWO arguments (`AAA BBB`) and with none, and read what comes back: `$ARGUMENTS` is always substituted; `$N` is 0-based (`$0` is the first argument) and substituted only when that argument exists, so `$1` changes only with two or more; `${CLAUDE_PLUGIN_ROOT}` (braced) is substituted |

## Anthropic plugins & built-in skills
| Topic | Source | Last checked | Check |
|---|---|---|---|
| `pr-review-toolkit` and `security-guidance` plugins | `test.md` → *QA/data agents* | 2026-10-09 | Each registered marketplace's `marketplace.json` under `~/.claude/plugins/marketplaces/` |
| `plugin-dev` plugin and its skills | `CLAUDE.md` → *Toolkit changes* | 2026-10-09 | This session's skill list |
| Built-in `/code-review` and `/security-review` | `test.md` → *QA/data agents* | 2026-10-09 | This session's skill list |
| Built-in `dataviz` and `artifact-diagramming` | `design.md` → *Charts & data display*, `design.md` → *Diagrams & connectors* | 2026-10-09 | This session's skill list |
| Built-in `anthropic-skills:docx` and `anthropic-skills:pdf` (text extraction, OCR for scanned PDFs) | `plugins/directives-toolkit/skills/doc-comp/SKILL.md` | 2026-10-09 | This session's skill list: both skills listed, and the `pdf` skill's own description still names OCR for scanned PDFs |
| Built-in `update-config` skill in web sessions, and its merge procedure | `plugins/directives-toolkit/commands/refresh-repo.md` → *Settings writes* | 2026-10-09 | A web session's skill list shows `update-config`; invoking it (it only loads text) still says read first and merge arrays rather than replace them |
| Native-parity verdicts | `EXPORTS.json` → `considered` | 2026-09-24 | The `/audit-repo` native-parity pass |
| The Anthropic-authored LSP plugin set (twelve names) | `EXPORTS.json` → `considered.lsp-plugins` | 2026-10-09 | the `claude-plugins-official` `marketplace.json` |
| `discord`, `telegram`, `imessage`, `fakechat` are third-party plugins listed under the official marketplace's `external_plugins/`, not Anthropic-built | `EXPORTS.json` → `considered.messaging-channels` | 2026-10-09 | In the `claude-plugins-official` `marketplace.json`, each plugin's `source` path still starts `./external_plugins/`; if one moves under `./plugins/` or gains Anthropic authorship, re-judge the entry |
| The built-in `anthropic-plugin-directory` marketplace keeps its inventory in `~/.claude/plugins/plugin-directory-cache-v2.json` (no clone), with the fields the parity pass's ownership filter reads | `CLAUDE.md` → *Session Start* | 2026-10-09 | `ls ~/.claude/plugins/`, then read the file's top-level keys and one entry of `listings` (`name`, `source.repository`, `checks.review.by`) |

## GitHub
| Topic | Source | Last checked | Check |
|---|---|---|---|
| API quotas and which calls are REST vs GraphQL | `git.md` → *GitHub API Quota Economy* | 2026-10-09 | `GET /rate_limit`; GitHub REST and GraphQL docs |
| What the session proxy lets through (`api.github.com`, git) | `plugins/directives-toolkit/commands/env-chk.md` | 2026-10-09 | A read-only curl and `git ls-remote` from this session |
| Pages caching | `global.md` → *Hosting & Deployment* | 2026-10-09 | `curl -I` a Pages URL |
| Pages build events under each Pages source | `docs/standards/hosting-mechanics.md` → *Monitoring after a switch to Actions-source* | 2026-10-09 | GitHub Pages and webhook-events docs, read over `raw.githubusercontent.com/github/docs/main/content/` (`pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages.md`, `webhooks/webhook-events-and-payloads.md`; docs.github.com is egress-blocked in web sessions) |
| Pages deploy failure and cache patterns | `plugins/directives-toolkit/skills/update-pages/SKILL.md` | undated | ⏳ The next deploy that misbehaves |
| Where repo settings live (auto-merge, branch delete, conversation resolution) | `git.md` → *Repo-settings preflight* | 2026-10-09 | GitHub docs, read over `raw.githubusercontent.com/github/docs/main/content/` (`repositories/configuring-branches-and-merges-in-your-repository/`; docs.github.com is egress-blocked in web sessions); `GET /repos/{owner}/{repo}/rules/branches/main` |
| Scheduled-workflow inactivity auto-disable | `plugins/directives-toolkit/commands/new-repo.md` | 2026-10-09 | GitHub Actions docs, read over `raw.githubusercontent.com/github/docs/main/content/` (`actions/how-tos/manage-workflow-runs/disable-and-enable-workflows.md`; docs.github.com is egress-blocked in web sessions) |
| Actions cache scope | `docs/standards/cicd-setup.md` → *Step 1* | 2026-10-09 | GitHub Actions cache docs, read over `raw.githubusercontent.com/github/docs/main/content/` (`actions/reference/workflows-and-actions/dependency-caching.md`; docs.github.com is egress-blocked in web sessions) |
| What `ubuntu-latest` runs (moving to Ubuntu 26.04, 2026-10-19 to 2026-11-19) | `templates/actions/ui-suite/action.yml`, the `Install Playwright browsers` step | 2026-10-09 | actions/runner-images README's image table and its Announcement issues (#14748) |
| Pages serves every committed path of a branch-source site | `docs/standards/hosting-mechanics.md` → *Choosing the Pages source* | 2026-10-09 | `curl -I` this repo's Pages URL for `CLAUDE.md` and a `docs/internal/` file |
| What the GitHub MCP reads return for reactions and labels on a PR | `docs/standards/pr-mechanics.md` → *Reading reactions* | 2026-10-09 | `issue_read` (`get`, `get_labels`) and `pull_request_read` (`get`) on a merged PR of this repo |
| What each GitHub MCP write tool commits | `global.md` → *A Blocked Command Is Not a Blocked Capability* | 2026-10-09 | The descriptions and parameters of `create_or_update_file`, `push_files`, `delete_file` and `create_branch` in this session's tool list |
| When ci-notify's PR lookup misses | `git.md` → *PR Lifecycle* | undated | ⏳ The next PR whose green-CI wake does not arrive |
| Branch-rules and reactions APIs are readable through a web session's `gh api`; the proxy's `ccr/` stand-in routes | `git.md` → *Repo-settings preflight*, `git.md` → *GitHub API Quota*; `pr-mechanics.md` → *Reading reactions* | 2026-10-09 | `gh api repos/<o>/<r>/rules/branches/main`; `gh api repos/<o>/<r>/issues/<n>/reactions`; `gh api repos/<o>/<r>/pulls/<n>/ccr/x` prints the route list |
| What the Pages actions (v5) do with dotfiles, symlinks and `page_url` | `templates/workflows/pages-deploy.yml` | 2026-10-09 | `git ls-remote --tags https://github.com/actions/upload-pages-artifact.git` (and `deploy-pages`), then read `action.yml` at the newest tag |
| Pages settings endpoint through a web session's proxy | `plugins/directives-toolkit/skills/update-pages/SKILL.md`, step 3 | 2026-10-09 | `gh api repos/{owner}/{repo}/pages` from a web session |
| GitHub Action major pins (`actions/checkout@v4`, `setup-node@v4`, `cache@v4`, `upload-artifact@v4`) and the Node runtime each major runs on, against GitHub's runtime deprecations | `templates/workflows/*.yml`, `.github/workflows/qa.yml`, `.github/workflows/watcher-liveness.yml`, `templates/actions/ui-suite/action.yml` | undated | `git ls-remote --tags https://github.com/actions/<name>` for the newest major, `runs.using` in each pinned major's `action.yml` (raw URL), and the GitHub changelog for Node runtime deprecations on Actions runners |

## Codex
| Topic | Source | Last checked | Check |
|---|---|---|---|
| What triggers a Codex review, and how fast it answers | `docs/standards/pr-mechanics.md` → *Review triggers* | 2026-10-06 | ⏳ The next few requests, timed comment to verdict |
| Codex reviews are metered per request | `docs/standards/pr-mechanics.md` → *Review metering* | 2026-08-17 | ⏳ The next review request: the account's Codex usage before and after it |
| The forms a clean verdict takes, and which clears `codex-flagged` | `git.md` → *PR Lifecycle* | 2026-08-27 | ⏳ The next clean review |
| One same-type reaction per user | `docs/standards/pr-mechanics.md` → *Reading reactions* | 2026-10-09 | GitHub REST docs for reactions, read over `raw.githubusercontent.com/github/docs/main/content/` (`rest/reactions/reactions.md`; docs.github.com is egress-blocked in web sessions) |
| The *Codex Review Summary* comment (Running / Completed) is progress, not a verdict | `git.md` → *PR Lifecycle* | 2026-10-06 | ⏳ The next review request: the summary's wording and statuses |
| Codex allowance and the *unavailable* reply | `git.md` → *PR Lifecycle* | undated | ⏳ The next unavailable reply |
| Codex posts as the bot login `chatgpt-codex-connector[bot]` (hard-coded in the monitor's filters) | `templates/workflows/codex-monitor.yml` (and its twin `.github/workflows/codex-monitor.yml`); `docs/standards/automations.md` → *Automation 3 — Codex Monitor Workflow (infra-resident, event-driven)* | 2026-10-09 | `gh api repos/<o>/<r>/issues/<n>/reactions`, `.../issues/<n>/comments` and `.../pulls/<n>/reviews` on the latest PR Codex reviewed: the reviewer's `user.login` |
| A concurrency supersede leaves the annotation "Canceling since a higher priority waiting request for <group> exists" on the cancelled job, and nothing else does; ci-monitor requires it before suppressing a cancelled run | `templates/workflows/ci-monitor.yml` and `.github/workflows/ci-monitor.yml`, `cancelled_by_group()` | 2026-10-09 | `gh api repos/<o>/<r>/check-runs/<job-id>/annotations` on the cancelled job of a recently superseded QA run (`actions/runs?status=cancelled`): the message must still contain that phrase. If GitHub rewords it, every supersede is reported (loud, never silent) until the grep is updated |

## Test environment
| Topic | Source | Last checked | Check |
|---|---|---|---|
| This repo's sandbox ceiling | `CLAUDE.md` → *Local gate — CI scripts* | 2026-10-08 | From `templates/ui-tests`: `node ../scripts/browser-ladder.js chromium` |
| Fleet sandbox ceilings and egress | `test.md` → *Sandboxed local runs* | 2026-08-26 | ⏳ The next session in each app repo |
| Which Playwright version the kit resolves to | `templates/ui-tests/package.json` | 2026-10-09 | `npm view "@playwright/test@^1.62.1" version` (a registry read, installs nothing) |
| Playwright behaviour the kit and the viewport gate rely on — each measurement is dated in its source | `test.md` → *Playwright* | 2026-10-08 | ⏳ The next Playwright version bump: re-run the measurements the source and `templates/scripts/check-ui-viewports.js` cite |
| Playwright releases since those measurements (taken on 1.62.1, 1.63.0 and 1.64.0) | `templates/ui-tests/package.json` | 2026-10-09 | `npm view playwright time --json`: 1.64.0 (published 2026-10-07) is the newest release and what the kit's range installs; a newer one makes the row above due |
| Where preinstalled browsers live | `plugins/directives-toolkit/agents/ui-tester.md` | 2026-10-09 | `ls "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"` in this session |
| `dvh` support in the browsers the kit ships | `plugins/directives-toolkit/agents/ui-tester.md` → *Known CI Compatibility Issues* | 2026-10-09 | MDN browser-compat data for `dvh` against the runner image's browser versions |
| shfmt v3.12.0 is the newest mvdan/sh release that publishes `sha256sums.txt` (v3.11.0 and v3.12.0 do; v3.13.0 through v3.14.1 do not) | `.github/workflows/qa.yml`, the `Install shfmt` step | 2026-10-09 | For each newer release: `curl -sSfL https://github.com/mvdan/sh/releases/download/<tag>/sha256sums.txt`; if one now publishes it, move the pin and its checksum, then re-run `check-run-quoting-cases.py` |
| parse5 8.0.1 (2026-04-19) is the newest stable release, and its whole dependency graph is parse5 plus entities, pinned at entities 8.1.0 (2026-09-07, no dependencies of its own) | `.github/workflows/qa.yml`, the `Install parse5` step; `CLAUDE.md` → *Local gate* | 2026-10-09 | `npm view parse5 dist-tags.latest` and `npm view parse5@<v> dependencies`; move every pin in both places together and re-run the link-check cases |
| html-validate 10.17.0 is the pinned version of the map's HTML validator, the newest that runs on Node 20 (11.x needs ^22.22.0 or >=24.8.0) | `.github/workflows/qa.yml`, the `Validate map HTML` step; `CLAUDE.md` → *Local gate* | 2026-10-09 | `npm view html-validate@<v> engines.node` against the job's `node-version` (an 11.x pin failed CI on Node 20, #424), then its changelog for default-rule changes; move the pin in both places together, and the job to Node 22 first to take 11.x |
| Web-session git fetch cost | `plugins/directives-toolkit/commands/refresh-repo.md` | 2026-09-23 | ⏳ The next `/refresh-repo` run |
| `/opt/pw-browsers/chromium` symlink target (build 1194, Chromium 141 on 2026-10-08) | `global.md` → *Network Access Playbook (cloud sessions)*, rung 6 | 2026-10-09 | `ls -la /opt/pw-browsers` |

## Outside services & standards
| Topic | Source | Last checked | Check |
|---|---|---|---|
| Supabase MCP tools and `query_logs` window | `plugins/directives-toolkit/agents/supabase.md` | 2026-10-09 | Supabase MCP docs |
| Supabase key roles and default function grants | `data.md` → *Keys*, `data.md` → *Client Auth Pattern (static app + anon key)* | 2026-10-09 | Supabase docs via the MCP `search_docs` tool (database advisor lints 0028/0029) |
| Stitch and Figma MCPs for design import | `design.md` → *Establishing your project's look* | 2026-10-09 | `figma` in the `claude-plugins-official` marketplace.json; Stitch's remote MCP endpoint (`stitch.googleapis.com/mcp`) in Google Cloud's MCP supported-products list |
| WCAG thresholds and target sizes | `design.md` → *Accessibility*, `design.md` → *Cross-platform & responsive* | 2026-10-09 | The current WCAG recommendation |

## Measured baselines
| Topic | Source | Last checked | Check |
|---|---|---|---|
| Auto-skill eval baseline | `docs/internal/skill-eval-notes.md` | 2026-09-29 | ⏳ The next time an auto-skill description changes and the eval is run |
| What sizes the 120-minute UI-suite timeout floor | `templates/scripts/check-job-bounds.py` (header, rule 3) | undated | ⏳ The next slow-end fleet UI run's timings |
| Fleet auth-scenario and request timings | `test.md` → *Playwright* | 2026-08-25 | ⏳ The next session in those repos |
