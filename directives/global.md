# Claude Global Directives

## Purpose
This repo is the company-wide agent behavior standard.
It is imported by all project repos via raw GitHub URL.
All rules here apply to every Claude Code session across
every project unless explicitly overridden at repo level.

## Identity
- Owner: akyachtsman
- Email: akyachtsman@gmail.com
- GitHub: https://github.com/akyachtsman

## Behavior Rules
- Always read CLAUDE.md and any imported directive URLs before starting any task
- Follow the design directive's universal craft rules (iPad, accessibility, motion, copy); each project's *look* is its own — established via `/design-intake`, not a shared company theme
- No frameworks, no npm, no build steps unless explicitly asked
- Plain HTML + JS is the default stack
- All code must work on iPad Safari
- Use `textContent` for all DOM text insertion — never `innerHTML` with data from any backend or user input
- For non-trivial features, separate WHAT from HOW — specify and clarify intent before planning a stack, and refine in phases rather than one-shotting (run `/sdd-loop`; the imported directives are its constitution)
- **Evidence before assertions** — never report something done, passing, or fixed without running the proving check *fresh* and reading its actual output and exit status; assumptions and stale results do not count as verification
- **Receiving review feedback** — treat review comments (human, Codex, code-reviewer) as suggestions to *evaluate*, not orders to obey. Restate the underlying requirement, verify the claim against the code, then either apply the fix or push back with technical reasoning. No performative agreement ("You're absolutely right!"), and no change you cannot justify

## Repo Structure Standard
Every project repo should contain:
```
CLAUDE.md        ← project context + imported directive URLs
index.html       ← complete single-page app
.github/
  workflows/
    qa.yml
    qa-live.yml
    ci-monitor.yml
    codex-monitor.yml
    pages-monitor.yml
  scripts/
    ui-tests/
```

## Backend
- All backend/data rules — the provider, connection config, keys, RLS, and MCP
  setup — are governed by the **data directive** (`data.md`). Read it before
  touching any backend code; it is the single source of truth for the backend.
- Never hardcode connection details or keys — store them as the GitHub
  Secrets/variables named in `data.md`.
- Project/connection IDs and table/column names are defined at project level in
  each repo's CLAUDE.md.

## Automations
- Scheduled and event-driven automations run as GitHub Actions workflows
- Claude routines handle agent-driven tasks (alerts, reports, monitors)
- No external automation platforms — logic lives in the repo, defined at project level

## GitHub Workflow
- Work happens in Claude Code sessions (web, desktop, or CLI) scoped to a repo
- Terminal and git are always available; `gh` CLI only sometimes — remote/web
  sessions often lack it (use the GitHub MCP tools instead)
- All code changes go through a `claude/<name>` branch and a PR to `main`
- Use a **fresh** `claude/<name>` branch per change, cut from updated `main`
  after each squash-merge — recycling branches tangles lineage and can attach
  the wrong diff to a PR.
- Subscribe to PR activity; fix CI before marking ready
- GitHub Pages for project web apps only

## Repository Scope
Two different scopes — never conflate them:
- **ACT scope (hard-limited):** the GitHub MCP can write — branch, push, PR,
  comment, merge — only against the repo(s) this session was opened on. Before
  offering to ACT on another repo, confirm the `add_repo` / `list_repos` tools
  (claude-code-remote server) exist via ToolSearch; if absent, that work needs
  a session scoped to the target repo — say so plainly.
- **READ scope (unrestricted for public repos):** any public repo is always
  readable — `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>`,
  `https://api.github.com/repos/<owner>/<repo>/...`, or the codeload tarball —
  no MCP, no `gh`, no clone needed. `/do-repo` packages this (inspect /
  compare / audit). **NEVER claim a public repo "can't be seen"** — that
  confuses ACT scope with READ scope; verify by fetching, then answer from data.
- The `scope-chk` auto-skill fires before any cross-repo offer; `/env-chk`
  runs the same verification at session start.

## Hosting
- GitHub Pages only
- No Vercel, no Netlify, no external hosting

## Security
- Never commit API tokens, secrets, or credentials to any repo
- Never echo secrets in workflow logs
- Security scan before every PR (canonical pattern — keep identical to the `qa.yml` / `qa-response.yml` secret-scan): `grep -rE "pat[A-Za-z0-9]{14}\.[A-Za-z0-9]{40,}|pat[A-Za-z0-9]{17}\.[a-f0-9]{64}|pat[lr]_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{20,}|xoxb-" --include="*.js" --include="*.html" --include="*.css" --include="*.json" --exclude-dir=node_modules --exclude-dir=.git .`

## Pre-Push Verification (Local Gate)
Before committing or pushing, verify locally — never rely on CI alone:
- Run the repo's full test suite, plus lint/type checks if configured.
- Check current CI status; if a run is in progress, wait for green.
- Review `git status` and the diff — no unintended changes staged.

Report the result before pushing; fix failures locally rather than on the PR.
`/commit-chk` is the manual backup when this auto-check did not fire (the
plugin's push-gate hook enforces the no-direct-push-to-main rule mechanically).

## PR Lifecycle
- Open a draft PR as soon as a branch has a first commit
- Subscribe to PR activity via `subscribe_pr_activity` immediately after opening
- Fix all CI failures before marking ready for review
- Mark PR ready only when all checks pass
- **Auto-merge on approval:** once the user approves a change, that approval covers
  merging it — don't ask a second time. Squash-merge automatically as soon as the
  required CI checks are green, **provided** the PR has no `codex-flagged` label, no
  unresolved review threads, and a diff limited to the intended files (the two rules
  below). If any of those conditions fails, pause and surface it instead of merging.
  Always report the merge result.
- A `codex-flagged` label is a **merge blocker**: triage Codex's review before merging
  — apply the fix, or remove the label with a one-line dismissal rationale in the PR.
  Never merge while the PR is still `codex-flagged` (check the PR's labels on GitHub
  first; the `codex-monitor` workflow adds the label, it does not clear it for you)
- Before merging, confirm the PR's file list is **only** what you changed. A surprise
  file count signals a stale or tangled branch — verify against GitHub's own PR diff,
  not a possibly-stale local clone (re-fetch/prune, or re-cut from `main`, if they disagree)
- Never force-push to `main`

## Async Operations
- After triggering a long-running operation (CI, deploy, dispatch), don't block
  waiting: if `send_later` exists, schedule a check-in; otherwise end the turn
  with "I'll report back when it completes" and resume on the event.
- The result must surface proactively — the user never re-prompts for an outcome.
- Any background watcher MUST set a hard timeout sized to the operation and exit
  on every terminal state (success, failure, timeout). A waiter that outlives
  what it watches is a bug.
- A background **agent** you spawn (`run_in_background`) is a task you still own:
  collect (await) every one before the turn ends. Uncollected background tasks get
  orphaned by context compaction — they run on with no handle left to stop them, a
  token-burning zombie that never reaches a terminal state. Fan agents out only in
  a window you will close; never fire-and-forget into a long session.

## Escalation Rules
- Stop and ask the user if a change touches more than one file's core logic
- Stop and ask if CI has failed 3+ times on the same issue without progress
- Stop and ask before deleting any file that exists on `main`
- Stop and ask before modifying any workflow file's trigger conditions

## Session Start
At the start of every session:
1. Read this file fully and fetch all imported directive URLs.
2. Verify the `directives-toolkit` plugin attached (commands/agents resolve —
   see Skill Bootstrap below), and run `/env-chk`'s scope verification to
   confirm which repo(s) this session can actually act on before promising
   anything cross-repo.
3. Confirm the active branch is not `main` before writing any code.
4. Review open PRs for this repo before starting new work.
5. Subscribe to active PRs via `subscribe_pr_activity`.

## Skill Bootstrap

The toolkit — commands, auto-skills, agents, and guard hooks — ships as the
**`directives-toolkit` plugin** from this repo's own marketplace. There is no
file bootstrap anymore; nothing is fetched into `.claude/`.

- **Claude Code on the web:** the project environment's setup script installs
  it before session start (see `NEW-REPO-USER-INSTRUCTIONS.md` Step 0) —
  required, because web containers are ephemeral and `enabledPlugins` alone
  enables but never installs.
- **CLI / desktop:** one-time `/plugin marketplace add akyachtsman/claude.directives`
  then `/plugin install directives-toolkit@claude-directives`.
- Each project's `.claude/settings.json` carries `extraKnownMarketplaces` +
  `enabledPlugins` (copy `templates/claude-settings.json`).

At session start, **verify the plugin attached**: the `directives-toolkit:*`
commands/skills resolve and the QA agents are available. If they don't, the
environment's setup script didn't run — fix that rather than hand-fetching
files. Updates track this repo's `main` (SHA-versioned); on web they arrive when
the environment's cached setup script rebuilds — on a setup-script/network change
or roughly weekly cache expiry, not necessarily every session. Commands are invoked as
`/env-chk`, `/refresh-repo`, etc.; agents are namespaced `directives-toolkit:*`.

See docs/automations.md for monitor setup and the automation-specific
PR-lifecycle/escalation additions.
See docs/ci-triage.md for CI and Codex failure triage rules.

## Imported Directives
These directives inherit from this file — they are downstream consumers, not overrides.
They now live alongside this file in the consolidated `claude.directives` repo:
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/design.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/test.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/data.md
