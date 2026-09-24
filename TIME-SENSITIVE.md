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
| Model aliases the Agent tool accepts, and alias resolution | `global.md` → *Subagent Model Selection* | 2026-09-24 | This session's Agent tool `model` values; code.claude.com/docs/en/sub-agents |
| How a sub-agent's model is chosen (call, frontmatter, env var, fork) | `global.md` → *Subagent Model Selection* | 2026-09-24 | code.claude.com/docs/en/sub-agents |
| Agent frontmatter `model:` field | `plugins/directives-toolkit/agents/test-verifier.md` | 2026-09-24 | code.claude.com/docs/en/sub-agents |

## Claude Code & cloud sessions
| Topic | Source | Last checked | Check |
|---|---|---|---|
| How web sessions get the toolkit (setup script, `SessionStart` hook) | `global.md` → *Skill Bootstrap* | undated | ⏳ The next fresh web session's start-up output |
| When a hook-fetched plugin update takes effect | `NEW-REPO-USER-INSTRUCTIONS.md` → *Step 0* | 2026-09-24 | ⏳ The next session whose `SessionStart` hook fetches an update |
| When the cached setup script rebuilds, and when a re-save fails to | `MAINTAIN-REPO-USER-INSTRUCTIONS.md` → *Environment Maintenance* | 2026-08-19 | ⏳ The next time the owner re-saves an environment |
| `claude plugin install` / `update` scope defaults | `scripts/install-toolkit.sh` (steps 4–5) | 2026-09-24 | `claude plugin install --help`, `claude plugin update --help` |
| How a session detects it is on the web (`CLAUDE_CODE_REMOTE`) | `plugins/directives-toolkit/commands/env-chk.md` | 2026-09-24 | `env` in this session |
| PR subscription lifecycle (auto-subscribe on open, drop on merge) | `CLAUDE.md` → *Notifications* | 2026-09-24 | ⏳ The next PR a session opens and merges |
| Scheduling-tool names the settings pre-approve | `global.md` → *Scheduling Tools Never Prompt* | 2026-09-24 | This session's tool list against `templates/claude-settings.json` |
| Wake envelopes cannot be switched off | `CLAUDE.md` → *Notifications* | 2026-08-21 | Claude Code settings docs |
| `claude plugin eval` availability | `CLAUDE.md` → *Toolkit (commands, skills, agents, hooks)* | 2026-09-24 | `claude plugin eval --help` |
| Hosts the default network level blocks | `NEW-REPO-USER-INSTRUCTIONS.md` → *Step 0* | 2026-09-24 | Claude Code on the web docs, network access |

## Anthropic plugins & built-in skills
| Topic | Source | Last checked | Check |
|---|---|---|---|
| `pr-review-toolkit` and `security-guidance` plugins | `test.md` → *QA/data agents* | 2026-09-24 | Each registered marketplace's `marketplace.json` under `~/.claude/plugins/marketplaces/` |
| `plugin-dev` plugin and its skills | `CLAUDE.md` → *Toolkit changes* | 2026-09-24 | This session's skill list |
| Built-in `/code-review` and `/security-review` | `test.md` → *QA/data agents* | 2026-09-24 | This session's skill list |
| Built-in `dataviz` and `artifact-diagramming` | `design.md` → *Charts & data display*, `design.md` → *Diagrams & connectors* | 2026-09-24 | This session's skill list |
| Built-in `anthropic-skills:docx` and `anthropic-skills:pdf` (text extraction, OCR for scanned PDFs) | `plugins/directives-toolkit/skills/doc-comp/SKILL.md` | 2026-09-24 | This session's skill list: both skills listed, and the `pdf` skill's own description still names OCR for scanned PDFs |
| Native-parity verdicts | `EXPORTS.json` → `considered` | 2026-09-24 | The `/audit-repo` native-parity pass |

## GitHub
| Topic | Source | Last checked | Check |
|---|---|---|---|
| API quotas and which calls are REST vs GraphQL | `git.md` → *GitHub API Quota Economy* | undated | `GET /rate_limit`; GitHub REST and GraphQL docs |
| What the session proxy lets through (`api.github.com`, git) | `plugins/directives-toolkit/commands/env-chk.md` | 2026-09-24 | A read-only curl and `git ls-remote` from this session |
| Pages caching | `global.md` → *Hosting & Deployment* | 2026-09-24 | `curl -I` a Pages URL |
| Pages build events under each Pages source | `docs/standards/hosting-mechanics.md` → *Monitoring after a switch to Actions-source* | 2026-08-26 | GitHub Pages and webhook-events docs |
| Pages deploy failure and cache patterns | `plugins/directives-toolkit/skills/update-pages/SKILL.md` | undated | ⏳ The next deploy that misbehaves |
| Where repo settings live (auto-merge, branch delete, conversation resolution) | `git.md` → *Repo-settings preflight* | 2026-08-26 | GitHub docs; `GET /repos/{owner}/{repo}/rules/branches/main` |
| Scheduled-workflow inactivity auto-disable | `plugins/directives-toolkit/commands/new-repo.md` | undated | GitHub Actions docs |
| Actions cache scope | `docs/standards/cicd-setup.md` → *Step 1* | 2026-08-25 | GitHub Actions cache docs |
| When ci-notify's PR lookup misses | `git.md` → *PR Lifecycle* | undated | ⏳ The next PR whose green-CI wake does not arrive |

## Codex
| Topic | Source | Last checked | Check |
|---|---|---|---|
| What triggers a Codex review, and how fast it answers | `docs/standards/pr-mechanics.md` → *Review triggers* | 2026-09-24 | ⏳ The next few requests, timed comment to verdict |
| The forms a clean verdict takes, and which clears `codex-flagged` | `git.md` → *PR Lifecycle* | 2026-08-27 | ⏳ The next clean review |
| One same-type reaction per user | `docs/standards/pr-mechanics.md` → *Reading reactions* | undated | GitHub REST docs for reactions |
| Codex allowance and the *unavailable* reply | `git.md` → *PR Lifecycle* | undated | ⏳ The next unavailable reply |

## Test environment
| Topic | Source | Last checked | Check |
|---|---|---|---|
| This repo's sandbox ceiling | `CLAUDE.md` → *Local gate — CI scripts* | 2026-09-24 | From `templates/ui-tests`: `node ../scripts/browser-ladder.js chromium` |
| Fleet sandbox ceilings and egress | `test.md` → *Sandboxed local runs* | 2026-08-26 | ⏳ The next session in each app repo |
| Which Playwright version the kit resolves to | `templates/ui-tests/package.json` | 2026-09-24 | `npm view "@playwright/test@^1.62.1" version` (a registry read, installs nothing) |
| Playwright behaviour the kit and the viewport gate rely on — each measurement is dated in its source | `test.md` → *Playwright* | 2026-09-24 | ⏳ The next Playwright version bump: re-run the measurements the source and `templates/scripts/check-ui-viewports.js` cite |
| Where preinstalled browsers live | `plugins/directives-toolkit/agents/ui-tester.md` | 2026-09-24 | `ls "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"` in this session |
| CSS support in CI browsers (`100dvh`) | `plugins/directives-toolkit/agents/ui-tester.md` → *Known CI Compatibility Issues* | undated | MDN browser-compat data for `dvh` against the runner image's browser versions |
| Web-session git fetch cost | `plugins/directives-toolkit/commands/refresh-repo.md` | 2026-09-23 | ⏳ The next `/refresh-repo` run |

## Outside services & standards
| Topic | Source | Last checked | Check |
|---|---|---|---|
| Supabase MCP tools and `query_logs` window | `plugins/directives-toolkit/agents/supabase.md` | undated | Supabase MCP docs |
| Stitch and Figma MCPs for design import | `design.md` → *Establishing your project's look* | undated | The connector registry |
| WCAG thresholds and target sizes | `design.md` → *Accessibility*, `design.md` → *Cross-platform & responsive* | undated | The current WCAG recommendation |

## Measured baselines
| Topic | Source | Last checked | Check |
|---|---|---|---|
| Auto-skill eval baseline | `docs/internal/skill-eval-notes.md` | 2026-08-19 | ⏳ The next time an auto-skill description changes and the eval is run |
| What sizes the 120-minute UI-suite timeout floor | `templates/scripts/check-job-bounds.py` (header, rule 3) | undated | ⏳ The next slow-end fleet UI run's timings |
| Fleet auth-scenario and request timings | `test.md` → *Playwright* | 2026-08-25 | ⏳ The next session in those repos |
