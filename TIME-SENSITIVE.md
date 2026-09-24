# TIME-SENSITIVE.md — facts that expire

This file lists every place the directives lean on something **outside this
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

## When to re-check
- **Every `/audit-repo` run** walks this whole list as part of its native-parity
  pass (`CLAUDE.md` → *Session Start*, step 5).
- **At once, for the rows it touches**, when any of these happen:
  - Anthropic ships a new model or model family, or Claude Code release notes
    mention agents, plugins, skills, hooks, settings, env vars or cloud sessions.
  - GitHub's changelog touches Actions, Pages, the REST/GraphQL API, rulesets or
    webhooks; or the runner image or Playwright version moves.
  - Codex behaves differently from what a row says.
  - A session observes anything that contradicts a row.

## How to handle a row
1. Re-check it the way the row says.
2. **Still true:** update *Last verified* here AND the dated wording at the
   source, in the same PR.
3. **No longer true:** fix the source directive in a PR, then update the row.
4. **New claim:** any new "measured / observed / verified <date>" statement about
   an outside system gets a row here in the PR that adds it.

"undated" in *Last verified* means the source never recorded when it was
checked. Treat those rows as the first to re-check.

## Open decisions
| Item | Why it is open |
|---|---|
| Where the `fable` model alias fits in the sub-agent tiers | The Agent tool accepts `haiku`, `sonnet`, `opus` and `fable`; `global.md` → *Subagent Model Selection* places only haiku and sonnet. The owner decides. |

## Models & sub-agents
| Fact the directives rely on | Stated in | Last verified | Re-check by |
|---|---|---|---|
| Tier aliases `haiku` / `sonnet` exist and resolve to the current version of each family | `global.md` → *Subagent Model Selection* | 2026-09-24 | Agent tool `model` values + code.claude.com/docs/en/sub-agents |
| Model precedence: call `model` → frontmatter → `CLAUDE_CODE_SUBAGENT_MODEL` → session model | `global.md` → *Subagent Model Selection* | 2026-09-24 | code.claude.com/docs/en/sub-agents, "Choose a model" |
| `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` makes calls ignore `model` | `global.md` → *Subagent Model Selection* | 2026-09-24 | same docs page |
| A fork ignores `model` and runs the session's model | `global.md` → *Subagent Model Selection* | 2026-09-24 | Agent tool description |
| Agent frontmatter `model:` accepts aliases, full IDs, `inherit` | `plugins/directives-toolkit/agents/test-verifier.md`, `plugins/directives-toolkit/agents/pr-readiness-reviewer.md` | 2026-09-24 | docs page above; plugin-dev `agent-development` skill |

## Claude Code & cloud sessions
| Fact the directives rely on | Stated in | Last verified | Re-check by |
|---|---|---|---|
| Web sessions don't attach plugins on their own; the env setup script installs, the `SessionStart` hook updates | `global.md` → *Skill Bootstrap* | undated | Fresh web session: is the toolkit attached? |
| The cached setup script rebuilds on a config change or roughly weekly | `global.md` → *Skill Bootstrap*, `NEW-REPO-USER-INSTRUCTIONS.md` → *Step 0* | undated | Claude Code on the web docs; observe a rebuild |
| Setup scripts written before 2026-08-05 need a manual re-save | `NEW-REPO-USER-INSTRUCTIONS.md` → *Step 0* | 2026-08-05 | Environment settings page |
| `claude plugin update` behaviour and scope handling | `MAINTAIN-REPO-USER-INSTRUCTIONS.md` → *Propagation Matrix* | 2026-08-05 | `claude plugin --help`; run it |
| A re-saved environment can still leave a legacy project stale | `MAINTAIN-REPO-USER-INSTRUCTIONS.md` → *Environment Maintenance* | 2026-08-19 | Re-save, then open a session in a legacy repo |
| `CLAUDE_CODE_REMOTE=true` marks a web session | `plugins/directives-toolkit/commands/env-chk.md`, `.claude/hooks/session-start.sh` | undated | `env` in a web session |
| Opening a PR auto-subscribes the session; merge drops it | `git.md` → *PR Lifecycle*, `CLAUDE.md` → *Notifications* | undated | Open a PR and watch for the subscription event |
| Scheduling tools are pre-approved under both MCP server-name spellings | `global.md` → *Scheduling Tools Never Prompt*, `global.md` → *Async Operations* | 2026-08-18 | Tool list names vs `templates/claude-settings.json` |
| No setting suppresses the `<wake>` envelopes | `CLAUDE.md` → *Notifications* | 2026-08-21 | Claude Code settings docs |
| `claude plugin eval` is early access; `CLAUDE_CODE_WALNUT_SPIRE=1` enables it | `CLAUDE.md` → *Toolkit (commands, skills, agents, hooks)* | undated | `claude plugin eval --help` |
| Default network level blocks `*.github.io` and `cdn.playwright.dev` | `NEW-REPO-USER-INSTRUCTIONS.md` → *Step 0* | undated | Environment network settings; curl from a session |

## Anthropic plugins & built-in skills
| Fact the directives rely on | Stated in | Last verified | Re-check by |
|---|---|---|---|
| `pr-review-toolkit`, `security-guidance` and `plugin-dev` exist with the agents/skills named | `test.md` → *QA/data agents*, `plugins/directives-toolkit/agents/qa-pipeline.md` | undated | `claude plugin marketplace list` + each marketplace.json |
| Built-in `/code-review` and `/security-review` skills exist | `test.md` → *QA/data agents*, `plugins/directives-toolkit/agents/qa-pipeline.md` | undated | This session's skill list |
| Built-in `dataviz` and `artifact-diagramming` skills exist | `design.md` → *Charts & data display*, `design.md` → *Diagrams & connectors* | undated | This session's skill list |
| Native-parity verdicts (borrowed / rejected / deferred) | `EXPORTS.json` → `externals`, `considered` | per entry | `/audit-repo` native-parity pass |

## GitHub
| Fact the directives rely on | Stated in | Last verified | Re-check by |
|---|---|---|---|
| REST quota is 5,000 calls/hour; git transport is unmetered; REST and GraphQL pools are separate | `git.md` → *GitHub API Quota Economy* | undated | `GET /rate_limit`; GitHub docs |
| `api.github.com` refused at the session proxy; `git ls-remote` works | `plugins/directives-toolkit/commands/env-chk.md`, `plugins/directives-toolkit/commands/refresh-repo.md` | 2026-07-18 | curl from a web session |
| Pages serves `max-age=600` | `global.md` → *Hosting & Deployment* | undated | `curl -I` a Pages URL |
| Switching Pages to Actions-source stops `page_build` events, blinding pages-monitor | `global.md` → *Hosting & Deployment*, `docs/standards/hosting-mechanics.md` → *Choosing the Pages source* | 2026-08-26 | GitHub Pages docs; a test repo |
| Pages stuck/transient-failure patterns and CDN cache timing | `plugins/directives-toolkit/skills/update-pages/SKILL.md` | undated | Next deploy that misbehaves |
| Repo settings: auto-merge, delete-branch-on-merge, conversation resolution, where each lives | `git.md` → *Repo-settings preflight* | 2026-08-26 | Settings → General and Rules |
| `main` here requires conversation resolution server-side | `CLAUDE.md` → *Branch policy* | 2026-08-26 | `GET /repos/{owner}/{repo}/rules/branches/main` |
| Scheduled workflows auto-disable after 60 days of repo inactivity | `plugins/directives-toolkit/commands/new-repo.md` | undated | GitHub Actions docs |
| Actions cache: saves are branch-scoped, restores are not | `docs/standards/cicd-setup.md` → *Step 1* | 2026-08-25 | Actions cache docs; a `workflow_run` restore |
| ci-notify's lookup can miss a PR or hit the wrong one (the listed no-wake cases) | `git.md` → *PR Lifecycle*, `CLAUDE.md` → *Self-test monitoring* | undated | Next PR whose wake did not arrive |

## Codex
| Fact the directives rely on | Stated in | Last verified | Re-check by |
|---|---|---|---|
| Ready-for-review draws a Codex review only SOMETIMES (5 of 7 here, 1 of 4 in a sibling repo); `@codex review` answers in ~2.5 min | `docs/standards/pr-mechanics.md` → *Review triggers* | 2026-08-23 | Count the next few un-drafts; Codex's summary comment names the trigger |
| A clean verdict arrives as a comment, a 👍 reaction, or an inline reply; only the comment clears `codex-flagged` | `git.md` → *PR Lifecycle*, `CLAUDE.md` → *Self-test monitoring*, `docs/standards/automations.md` → *Automation 2* | 2026-08-27 | Next clean review: which form arrived? |
| The allowance is weekly and shared with Work, Workspace Agents and ChatGPT Excel; "On every push" spends one per commit | `git.md` → *PR Lifecycle* | undated | Codex account settings |
| An *unavailable* reply states a reset time | `git.md` → *PR Lifecycle* | undated | Next unavailable reply |

## Test environment
| Fact the directives rely on | Stated in | Last verified | Re-check by |
|---|---|---|---|
| This repo's sandbox ceiling is NONE: chromium launches as-is | `CLAUDE.md` → *Local gate — CI scripts* | 2026-09-05 | `node templates/scripts/browser-ladder.js chromium` from `templates/ui-tests` |
| Fleet sandbox ceilings and egress results (`esm.sh` blocked, `cdn.playwright.dev` reachable) | `test.md` → *Sandboxed local runs* | 2026-08-26 | Browser ladder + curl in each app repo |
| Playwright behaviour measured on `playwright-core` 1.62.1 (async `waitForFunction`, viewport fixture, `outputFile` precedence) | `test.md` → *Playwright*, `test.md` → *UI coverage gates* | 2026-08-25 | Re-run the cited measurement on the current version |
| Playwright's bundled version moves with the runner image | `plugins/directives-toolkit/commands/new-repo.md` | undated | Runner image release notes |
| Browsers at `$PLAYWRIGHT_BROWSERS_PATH` or `/opt/pw-browsers` | `plugins/directives-toolkit/agents/ui-tester.md` | undated | `ls` in a web session |
| `100dvh` unsupported on older CI browsers | `plugins/directives-toolkit/agents/ui-tester.md` → *Known CI Compatibility Issues* | undated | Current runner Chromium/WebKit versions |
| Web-session fetch depth=100 takes ~1s / 1.6 MB | `plugins/directives-toolkit/commands/refresh-repo.md` | 2026-09-23 | Time it in a fresh session |

## Outside services & libraries
| Fact the directives rely on | Stated in | Last verified | Re-check by |
|---|---|---|---|
| Supabase MCP tool names | `plugins/directives-toolkit/agents/supabase.md` | undated | Session tool list |
| Supabase `query_logs` window is capped at, and defaults to, 24h | `plugins/directives-toolkit/agents/supabase.md` | undated | Supabase MCP docs |
| Stitch and Figma MCPs available for design import | `design.md` → *Establishing your project's look*, `plugins/directives-toolkit/commands/design-intake.md` | undated | Connector registry |
| html2canvas 1.4.1 throws on `oklch()` | `test.md` → *Stub the collaborators* | undated | Current html2canvas release |
| WCAG AA thresholds and target sizes | `design.md` → *Accessibility* | undated | Current WCAG version (none is named) |
| `obra/superpowers` pinned at v6.0.3 | `docs/guides/dev-pipeline.md` | undated | Its GitHub releases |

## Measured baselines
| Measurement | Stated in | Last verified | Re-check by |
|---|---|---|---|
| Auto-skill eval: 9 of 9 pass, mean Δ +0.67; two newer cases unmeasured | `CLAUDE.md` → *Toolkit (commands, skills, agents, hooks)*, `docs/internal/skill-eval-notes.md` | 2026-08-19 | `claude plugin eval --no-publish .` in the toolkit |
| Auth-scenario and request timings measured in claude.insurance / claude.prop | `test.md` → *Playwright* | 2026-08-25 | Re-run in those repos |
