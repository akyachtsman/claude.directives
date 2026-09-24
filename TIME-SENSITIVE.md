# TIME-SENSITIVE.md — facts that expire

This file lists the places the directives lean on something **outside this
repo** that can change without this repo changing: Claude models and Claude Code,
GitHub, Codex, the test environment, and outside services. Each of those facts
was true when it was written and has to be re-checked.

**It is a register that grows, not a proof of completeness.** It started from a
census of every tracked Markdown file on 2026-09-24; a fact found missing later
is added by the `/audit-repo` pass that finds it (step 4 below), not treated as a
defect in what is already here.

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
1. Re-check it the way the row says. **A re-check never creates anything** — no
   PR, session, environment save, deploy or test repo. Where only such an event
   can show the fact, the row waits for the next one to happen on its own.
   Rows whose re-check starts with ⏳ need an
   event (a deploy that misbehaves, a Codex reply) and cannot be re-checked on
   demand: an audit reports how old their *Last verified* is and leaves them for
   the event; whichever session sees the event re-checks the row then.
2. **Still true:** update *Last verified* here (from `/audit-repo`, as a proposed
   fix applied only after approval, like any other finding). Also update the source's own
   date ONLY where the source carries a verification stamp for that fact
   ("verified / measured / observed <date>"). Never touch an
   `(owner ruling, <date>)` stamp: it records when the owner decided, not when a
   fact was checked, and re-checking a fact does not change the ruling.
3. **No longer true:** fix the source in a PR, then update the row.
4. **New claim:** any new statement about how an outside system behaves gets a
   row here in the PR that adds it — dated or not. A missing date is a reason to
   add the row, not to skip it.

"undated" in *Last verified* means the source never recorded when it was
checked. Treat those rows as the first to re-check.

## Open decisions
| Item | Why it is open |
|---|---|
| Where the `fable` alias fits in the sub-agent tiers | The owner has ruled it is very expensive and for sparing use only (2026-09-24); the wording lands in `global.md` → *Subagent Model Selection* in the next PR |

## Models & sub-agents
| Fact the directives rely on | Stated in | Last verified | Re-check by |
|---|---|---|---|
| Tier aliases `haiku` / `sonnet` exist and resolve to the current version of each family | `global.md` → *Subagent Model Selection* | 2026-09-24 | Agent tool `model` values + code.claude.com/docs/en/sub-agents |
| The Agent tool's `model` accepts `haiku`, `sonnet`, `opus` and `fable` | the Agent tool (no repo source yet) | 2026-09-24 | This session's Agent tool schema: the `model` values |
| Model precedence: call `model` → frontmatter → `CLAUDE_CODE_SUBAGENT_MODEL` → session model | `global.md` → *Subagent Model Selection* | 2026-09-24 | code.claude.com/docs/en/sub-agents, "Choose a model" |
| `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` makes calls ignore `model` | `global.md` → *Subagent Model Selection* | 2026-09-24 | same docs page |
| A fork ignores `model` and runs the session's model | `global.md` → *Subagent Model Selection* | 2026-09-24 | Agent tool description |
| Agent frontmatter `model:` accepts aliases, full IDs, `inherit` | `plugins/directives-toolkit/agents/test-verifier.md`, `plugins/directives-toolkit/agents/pr-readiness-reviewer.md` | 2026-09-24 | docs page above; plugin-dev `agent-development` skill |

## Claude Code & cloud sessions
| Fact the directives rely on | Stated in | Last verified | Re-check by |
|---|---|---|---|
| Web sessions don't attach plugins on their own; the env setup script installs, the `SessionStart` hook updates | `global.md` → *Skill Bootstrap* | undated | ⏳ The next fresh web session: is the toolkit attached before the hook runs? |
| An update the `SessionStart` hook fetches applies only from the NEXT session (the CLI says "Restart to apply changes") | `NEW-REPO-USER-INSTRUCTIONS.md` → *Step 0*, `CLAUDE.md` → *Mid-session change semantics* | 2026-09-24 | This session's SessionStart output: an update offered but the installed sha unchanged until restart |
| The cached setup script rebuilds on a config change or roughly weekly | `global.md` → *Skill Bootstrap*, `NEW-REPO-USER-INSTRUCTIONS.md` → *Step 0* | undated | Claude Code on the web docs; observe a rebuild |
| Setup scripts written before 2026-08-05 need a manual re-save | `NEW-REPO-USER-INSTRUCTIONS.md` → *Step 0* | 2026-08-05 | Environment settings page |
| `claude plugin install --scope` defaults to `user`; `claude plugin update --scope` defaults to `auto-detect` (it read `user` on 2026-08-17), so `install-toolkit.sh` repeats every update at `--scope project` | `scripts/install-toolkit.sh` (step 5), `NEW-REPO-USER-INSTRUCTIONS.md` → *Step 0* | 2026-09-24 | `claude plugin install --help`, `claude plugin update --help`: the `--scope` default line |
| A re-saved environment can still leave a legacy project stale | `MAINTAIN-REPO-USER-INSTRUCTIONS.md` → *Environment Maintenance* | 2026-08-19 | ⏳ The next time the owner re-saves an environment |
| `CLAUDE_CODE_REMOTE=true` marks a web session | `plugins/directives-toolkit/commands/env-chk.md`, `.claude/hooks/session-start.sh` | undated | `env` in a web session |
| Opening a PR auto-subscribes the session | `git.md` → *PR Lifecycle*, `CLAUDE.md` → *Notifications* | 2026-09-24 | ⏳ The next PR a session opens: did a `subscription.created` event arrive? |
| The harness drops the subscription when the PR merges, so never unsubscribing leaks nothing | `CLAUDE.md` → *Notifications* | 2026-09-24 | ⏳ The next merge: does a `pull_request.closed` event say the session was unsubscribed? |
| Scheduling tools are pre-approved under both MCP server-name spellings | `global.md` → *Scheduling Tools Never Prompt*, `global.md` → *Async Operations* | 2026-08-18 | Tool list names vs `templates/claude-settings.json` |
| No setting suppresses the `<wake>` envelopes | `CLAUDE.md` → *Notifications* | 2026-08-21 | Claude Code settings docs |
| `claude plugin eval` is early access; `CLAUDE_CODE_WALNUT_SPIRE=1` enables it | `CLAUDE.md` → *Toolkit (commands, skills, agents, hooks)* | undated | `claude plugin eval --help` |
| Default network level blocks `*.github.io` and `cdn.playwright.dev` | `NEW-REPO-USER-INSTRUCTIONS.md` → *Step 0* | undated | Environment network settings; curl from a session |

## Anthropic plugins & built-in skills
| Fact the directives rely on | Stated in | Last verified | Re-check by |
|---|---|---|---|
| `pr-review-toolkit` and `security-guidance` exist with the agents named | `test.md` → *QA/data agents*, `plugins/directives-toolkit/agents/qa-pipeline.md` | undated | `claude plugin marketplace list` + each marketplace.json |
| `plugin-dev` exists with its `hook-development` and `agent-development` skills, installed and enabled for every project | `CLAUDE.md` → *Toolkit changes*, `scripts/install-toolkit.sh`, `templates/claude-settings.json` | 2026-09-24 | `claude plugin marketplace list`; this session's skill list |
| Built-in `/code-review` and `/security-review` skills exist | `test.md` → *QA/data agents*, `plugins/directives-toolkit/agents/qa-pipeline.md` | undated | This session's skill list |
| Built-in `dataviz` and `artifact-diagramming` skills exist | `design.md` → *Charts & data display*, `design.md` → *Diagrams & connectors* | undated | This session's skill list |
| Native-parity verdicts (borrowed / rejected / deferred) | `EXPORTS.json` → `externals`, `considered` | 2026-09-23 (the last native-parity pass, #380; entries carry no dates of their own) | `/audit-repo` native-parity pass |

## GitHub
| Fact the directives rely on | Stated in | Last verified | Re-check by |
|---|---|---|---|
| REST quota is 5,000 calls/hour; git transport is unmetered; REST and GraphQL pools are separate | `git.md` → *GitHub API Quota Economy* | undated | `GET /rate_limit`; GitHub docs |
| Marking a PR ready-for-review is GraphQL-only (`markPullRequestReadyForReview`, no REST equivalent), which is why sessions un-draft as soon as CI is green | `git.md` → *GitHub API Quota Economy* | undated | GitHub REST docs for pull requests: is there a ready-for-review endpoint? |
| `api.github.com` refused at the session proxy; `git ls-remote` works | `plugins/directives-toolkit/commands/env-chk.md`, `plugins/directives-toolkit/commands/refresh-repo.md` | 2026-07-18 | curl from a web session |
| Pages serves `max-age=600` | `global.md` → *Hosting & Deployment* | undated | `curl -I` a Pages URL |
| Switching Pages to Actions-source stops `page_build` events, blinding pages-monitor | `global.md` → *Hosting & Deployment*, `docs/standards/hosting-mechanics.md` → *Choosing the Pages source* | 2026-08-26 | GitHub Pages and webhook-events docs for `page_build` |
| Pages stuck/transient-failure patterns and CDN cache timing | `plugins/directives-toolkit/skills/update-pages/SKILL.md` | undated | ⏳ The next deploy that misbehaves |
| Repo settings: auto-merge, delete-branch-on-merge, conversation resolution, where each lives | `git.md` → *Repo-settings preflight* | 2026-08-26 | Settings → General and Rules |
| `main` here requires conversation resolution server-side | `CLAUDE.md` → *Branch policy* | 2026-08-26 | `GET /repos/{owner}/{repo}/rules/branches/main` |
| Scheduled workflows auto-disable after 60 days of repo inactivity | `plugins/directives-toolkit/commands/new-repo.md` | undated | GitHub Actions docs |
| Actions cache SAVES are branch-scoped; restores are not scoped the same way — a `workflow_run` job restored a key a `workflow_dispatch` run wrote | `docs/standards/cicd-setup.md` → *Step 1* | 2026-08-25 | GitHub's Actions cache docs on restore scope; ⏳ the next `workflow_run` restore |
| ci-notify's lookup can miss a PR or hit the wrong one (the listed no-wake cases) | `git.md` → *PR Lifecycle*, `CLAUDE.md` → *Self-test monitoring* | undated | ⏳ The next PR whose wake does not arrive |

## Codex
| Fact the directives rely on | Stated in | Last verified | Re-check by |
|---|---|---|---|
| Ready-for-review draws a Codex review only SOMETIMES (5 of 7 here, 1 of 4 in a sibling repo) | `docs/standards/pr-mechanics.md` → *Review triggers* | 2026-08-23 | ⏳ The next few un-drafts; Codex's summary comment names the trigger |
| An explicit `@codex review` is answered in minutes — ~2.5 min per `pr-mechanics.md`, 4–7 min per `learnings.jsonl` (`codex-review-triggers`), both 2026-08-23: the sources disagree | `docs/standards/pr-mechanics.md` → *Review triggers*, `learnings.jsonl` | 2026-08-23 | ⏳ Time the next explicit request, comment to verdict; 2026-09-24 here (PRs 386, 387): ~3, ~6 and ~7 min |
| A clean verdict arrives as a comment, a 👍 reaction, or an inline reply; only the comment clears `codex-flagged` | `git.md` → *PR Lifecycle*, `CLAUDE.md` → *Self-test monitoring*, `docs/standards/automations.md` → *Automation 2* | 2026-08-27 | ⏳ The next clean review: which form arrived? |
| A GitHub user holds at most one reaction of a given type per subject, so a second clean Codex round adds no new 👍 (read from GitHub's documented reaction model, not measured) | `docs/standards/pr-mechanics.md` → *Reading reactions* | undated | GitHub REST docs for reactions: is a duplicate same-type reaction by one user rejected or ignored? |
| The allowance is weekly and shared with Work, Workspace Agents and ChatGPT Excel; "On every push" spends one per commit | `git.md` → *PR Lifecycle* | undated | Codex account settings |
| An *unavailable* reply states a reset time | `git.md` → *PR Lifecycle* | undated | ⏳ The next unavailable reply |

## Test environment
| Fact the directives rely on | Stated in | Last verified | Re-check by |
|---|---|---|---|
| This repo's sandbox ceiling is NONE: chromium launches as-is | `CLAUDE.md` → *Local gate — CI scripts* | 2026-09-24 | From `templates/ui-tests`: `node ../scripts/browser-ladder.js chromium` |
| Fleet sandbox ceilings and egress results (`esm.sh` blocked, `cdn.playwright.dev` reachable) | `test.md` → *Sandboxed local runs* | 2026-08-26 | ⏳ The next session in each app repo: browser ladder + curl there |
| Playwright behaviour measured on `playwright-core` 1.62.1 (async `waitForFunction`, viewport fixture, `outputFile` precedence) | `test.md` → *Playwright*, `test.md` → *UI coverage gates* | 2026-08-25 | Re-run the cited measurement on the current version |
| npm, not the runner image, picks the Playwright version: `templates/ui-tests/package.json` declares `@playwright/test` `^1.62.1`, which resolved to 1.63.0 on 2026-09-24 | `templates/ui-tests/package.json`, each project's lockfile | 2026-09-24 | From `templates/ui-tests`: `npm install --no-package-lock --ignore-scripts`, then read `node_modules/@playwright/test/package.json` |
| The render witness's evidence, measured on Playwright 1.63.0: a failing hook records no witness, the annotation reaches both JSON report shapes, an auto fixture would destroy the signal | `templates/ui-tests/tests/app.spec.js` (witness header), `templates/scripts/check-ui-viewports.js` | 2026-09-24 | Re-run the listed cases on the installed version after any Playwright bump |
| The viewport gate reads the config Playwright reads: `.ts` shadows `.js` shadows `.mjs` (measured on 1.62.1, 2026-08-26), and `loadConfigFromFile` fills in defaults so it cannot tell declared from defaulted (2026-08-27) | `templates/scripts/check-ui-viewports.js` (config-resolution comments) | 2026-08-27 | On the installed version: two configs side by side, which one does `npx playwright test --list` use; and `loadConfigFromFile` on the shipped kit, does `grep` appear undeclared? |
| Browsers at `$PLAYWRIGHT_BROWSERS_PATH` or `/opt/pw-browsers` | `plugins/directives-toolkit/agents/ui-tester.md` | undated | `ls` in a web session |
| `100dvh` unsupported on older CI browsers | `plugins/directives-toolkit/agents/ui-tester.md` → *Known CI Compatibility Issues* | undated | Current runner Chromium/WebKit versions |
| Web-session fetch depth=100 takes ~1s / 1.6 MB | `plugins/directives-toolkit/commands/refresh-repo.md` | 2026-09-23 | Time it in a fresh session |

## Outside services & libraries
| Fact the directives rely on | Stated in | Last verified | Re-check by |
|---|---|---|---|
| Supabase MCP tool names | `plugins/directives-toolkit/agents/supabase.md` | undated | Session tool list |
| Supabase `query_logs` window is capped at, and defaults to, 24h | `plugins/directives-toolkit/agents/supabase.md` | undated | Supabase MCP docs |
| Stitch and Figma MCPs available for design import | `design.md` → *Establishing your project's look*, `plugins/directives-toolkit/commands/design-intake.md` | undated | Connector registry |
| WCAG AA thresholds and target sizes | `design.md` → *Accessibility* | undated | Current WCAG version (none is named) |

## Measured baselines
| Measurement | Stated in | Last verified | Re-check by |
|---|---|---|---|
| Auto-skill eval: 9 of 9 pass, mean Δ +0.67; two newer cases unmeasured | `CLAUDE.md` → *Toolkit (commands, skills, agents, hooks)*, `docs/internal/skill-eval-notes.md` | 2026-08-19 | `claude plugin eval --no-publish .` in the toolkit |
| The 120-minute UI-suite timeout floor (`UI_SUITE_FLOOR`) is sized from claude.trading's 30m35s warm job + 21m25s cold browser install + a failing profile that replaces its healthy scenario with the per-test ceiling and then retries at it (~+22 min each) | `docs/standards/cicd-setup.md` → *9c-ter — Job bounds guard*, `templates/scripts/check-job-bounds.py` (header, rule 3) | undated | ⏳ The next slow-end fleet UI run: warm job, cold install and a failing profile's cost, from its run timings |
| Auth-scenario and request timings measured in claude.insurance / claude.prop | `test.md` → *Playwright* | 2026-08-25 | ⏳ The next session working in those repos |
