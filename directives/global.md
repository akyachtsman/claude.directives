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
- Default stack: plain HTML + CSS + vanilla JS with **no *local* build** —
  development is browser-only (no terminal), so nothing may require a build on
  your machine. This is a **dev-environment** rule, not a deployment ceiling.
- Frameworks and build tooling are a deliberate, per-project **production-tier**
  choice (React / Next.js on Vercel), where the build runs **remotely on `git
  push`** — never locally; see *Hosting & Deployment*. Don't add a framework to a
  static site that doesn't need one.
- All code must work responsively across the project's target platforms — laptop, tablet (iPad), and phone (iPhone/Android)
- Use `textContent` for all DOM text insertion — never `innerHTML` with data from any backend or user input
- For non-trivial features, separate WHAT from HOW — specify and clarify intent before planning a stack, and refine in phases rather than one-shotting (run `/sdd-loop`; the imported directives are its constitution)
- **Evidence before assertions** — never report something done, passing, or fixed without running the proving check *fresh* and reading its actual output and exit status; assumptions and stale results do not count as verification
- **Receiving review feedback** — treat review comments (human, Codex, code-reviewer) as suggestions to *evaluate*, not orders to obey. Restate the underlying requirement, verify the claim against the code, then either apply the fix or push back with technical reasoning. No performative agreement ("You're absolutely right!"), and no change you cannot justify
- **Explanations are tabular-first** (owner preference, 2026-07-13) — when explaining how anything works (data flows, architecture, processes, options), lead with a simple table: one row per component, plain-language columns (what / where it comes from / when it updates / how it reaches the user), then at most two takeaway sentences. No jargon inside cells; mechanism detail only when asked

## Repo Structure Standard
Every project repo should contain (matching what `/new-repo` actually scaffolds):
```
CLAUDE.md        ← project context + imported directive URLs
index.html       ← the app's entry page (additional pages are fine — every
                   page matches the styles/ contract, per design.md)
styles/          ← the committed design contract (tokens.css + components.css)
.github/
  workflows/     ← the full template set from templates/workflows/ (10 files):
    qa.yml, qa-live.yml, qa-response.yml,
    ci-monitor.yml, ci-notify.yml, codex-monitor.yml, pages-monitor.yml,
    pages-retry.yml, cron-notify.yml, keepalive.yml
  scripts/
    ui-tests/
```
> This is the **static-tier** layout. A production-tier (Next.js) project is
> scaffolded from the Next starter template instead — `app/` router,
> `package.json`, Next config — see *Hosting & Deployment*.

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
- Deploy per the project's chosen tier (see *Hosting & Deployment*) — GitHub Pages by default

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

## Hosting & Deployment
The **dev environment is the same for both tiers** — browser-only, no *local*
build. The **deployment target** is a per-project choice:

- **Static tier (default):** GitHub Pages, branch-source. Plain HTML/CSS/JS — the
  app may still be dynamic via client-side Supabase + RLS. No build; the push *is*
  the deploy. Use for prototypes, previews, and apps that don't need a server.
- **Production tier (explicit, per-project):** React + **Next.js on Vercel**, with
  **Supabase** as the backend. Vercel runs `next build` on every `git push` — so
  development stays browser-only (no local build) — and adds server-side
  rendering / data, edge delivery, and image optimization for data-backed apps at
  scale. The design contract carries over unchanged: `styles/tokens.css` +
  `styles/components.css` drop straight into the Next app.

Choose the tier deliberately — stay static until the project actually needs the
production tier (auth, server-rendered or per-user data, real scale). No other
hosts (Netlify, etc.) without explicit owner sign-off.

## Security
- Never commit API tokens, secrets, or credentials to any repo
- Never echo secrets in workflow logs
- Security scan before every PR (canonical pattern — keep identical to the `secret-scan` composite action the qa workflows share): `grep -rE "pat[A-Za-z0-9]{14}\.[A-Za-z0-9]{40,}|pat[A-Za-z0-9]{17}\.[a-f0-9]{64}|pat[lr]_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{20,}|xoxb-" --include="*.js" --include="*.html" --include="*.css" --include="*.json" --exclude-dir=node_modules --exclude-dir=.git .`

## Pre-Push Verification (Local Gate)
Before committing or pushing, verify locally — never rely on CI alone:
- Run the repo's full test suite, plus lint/type checks if configured.
- Check current CI status; if a run is in progress, wait for green.
- Review `git status` and the diff — no unintended changes staged.

Report the result before pushing; fix failures locally rather than on the PR.
`/commit-chk` is the manual backup when this auto-check did not fire (the
plugin's push-gate hook enforces the no-direct-push-to-main rule mechanically).

## PR Lifecycle
Moved to `directives/git.md` → *PR Lifecycle* — the dedicated git/GitHub
directive, imported alongside this file. Draft-first, subscribe on open,
green-before-ready, auto-merge-on-approval, `codex-flagged` blocker, diff
check, never force-push `main` — all live there now.

## Conditional Auto-Merge on Green
Moved to `directives/git.md` → *Conditional Auto-Merge on Green* (owner
ruling, 2026-07-12): the diff classification for merging on green without a
per-change approval, and the revert-first safety net.

## Progress Visibility (owner ruling, 2026-07-17)
Silent processing is indistinguishable from a hang. For any operation expected
to take more than ~1 minute (subagent fan-outs, CI/deploy watches, large
sweeps, multi-file audits):
- **Announce before starting**: one line saying what is about to run and a
  rough time estimate ("fanning out 5 audit agents — expect ~4–6 min").
- **Never go silent for more than ~1–2 minutes of active work.** Emit a
  one-line status between steps: what just finished, what's next, revised
  estimate if it moved. Structure long work to CREATE those update points —
  prefer background agents (narrate on each completion notification) and
  stepwise tool calls over one monolithic blocking wait, precisely because a
  session cannot emit text mid-wait inside a single blocking call.
- **Parked is not silent.** When waiting on an external event (CI webhook,
  ci-notify wake, deploy), say so explicitly before ending the turn — "parked;
  the green comment on PR #N will wake me (~3 min)" — so quiet is legible as
  waiting, not hung.
- **Estimate misses get an update, not silence.** If the estimate blows past,
  say what's still running and the new expectation.

## Async Operations
- After triggering a long-running operation (CI, deploy, dispatch), don't block
  waiting. The result must surface **proactively** — the user never re-prompts
  for an outcome.
- **How to wait, in order of preference:**
  1. **Let the event wake you.** CI failures, PR reviews, and merges arrive as
     webhooks that resume the session — and with `ci-notify.yml` installed
     (standard scaffold), CI SUCCESS arrives too, as a PR comment. A PR-attached
     wait therefore needs NO scheduler at all: end the turn with "I'll report
     back when it completes" and act on the event.
  2. **Self-pace with `ScheduleWakeup`** (or `send_later` where it exists — it is
     frequently **absent**, so never assume it; verify per `/env-chk`). Schedule a
     check-in sized to the operation, re-check on wake, and re-arm until terminal.
     The low-risk Claude Code Remote scheduling tools (`send_later`,
     `list_triggers`, `delete_trigger`) are pre-approved in the project settings
     template — they only schedule messages back into the session's own future,
     and per-call prompts defeat unattended monitoring. The connector registers
     under two server-name spellings depending on surface, so the template
     allowlists each tool as both `mcp__Claude_Code_Remote__*` and
     `mcp__claude-code-remote__*` — permission rules match names exactly.
     **Web caveat (verified 2026-07-16):** claude.ai cloud sessions do NOT
     apply project-level permission rules — the allow block works on
     CLI/desktop only, and no personal-account setting suppresses these
     prompts on web. Never tell the owner the settings block fixes web
     popups. On web, minimize the prompts instead: with `ci-notify.yml`
     installed, a PR-attached wait uses webhook wake ONLY (no scheduling
     calls at all); the scheduling tools are the fallback for waits with no
     PR attached — and even then arm at most ONE `send_later` per watched
     operation (a single long check-in, re-armed only on fire), never one
     per polling cycle. `create_trigger` /
     `update_trigger` / `fire_trigger` stay prompt-gated deliberately: they can
     target other sessions or spawn new ones, a persistence channel under
     prompt injection. **Deployment tools** (`mcp__Supabase__deploy_edge_function`
     and anything else that pushes code/config to a live backend) likewise stay
     prompt-gated by owner decision (2026-07-12) — never offer to add them to
     `permissions.allow`; reduce prompt fatigue by **batching deploys**, not by
     removing the gate. **Projects bootstrapped before this template inherit nothing
     automatically**: the FIRST time a session hits a scheduling-tool permission
     prompt in an older repo, it PRs the current template's `permissions.allow`
     block (both spellings, low-risk three only) into that repo's own
     `.claude/settings.json` right away — no need to ask; it's the session's own
     repo, and `.claude/` config is in the auto-merge-on-green class. Note in
     the PR that the pre-approval activates from the NEXT session (settings load
     at session start).
  3. **Condition-wait with `Monitor`** only when you must block on a specific
     state — always with an exit condition and a hard timeout.
- **Never background a bare `sleep` to wait.** A `run_in_background` `sleep`
  (e.g. `sleep 120; echo done`) is the single worst pattern: when the container
  suspends and resumes — any multi-day session — the process is reaped but the
  harness keeps showing it as a **phantom "running" task** that never clears, and
  it was watching nothing. Use options 1–3 instead. (The toolkit's `wait-gate`
  hook blocks this; a foreground long sleep is already blocked by the harness.)
- A background **agent** you spawn (`run_in_background`) is a task you still own:
  collect (await) every one before the turn ends. Uncollected background tasks get
  orphaned by context compaction — they run on with no handle left to stop them, a
  token-burning zombie that never reaches a terminal state. Fan agents out only in
  a window you will close; never fire-and-forget into a long session.
- **Sweep before you idle.** Any background watcher MUST set a hard timeout sized
  to the operation and exit on every terminal state. Before ending a turn that
  started waiters, confirm none are orphaned (no live `sleep`/poll process backing
  a still-"running" task) — a waiter that outlives what it watches is a bug.
- **Deploys — "merged" is not "live."** A deploy-backed change (GitHub Pages, etc.)
  is done only after the deployed asset is fetched **cache-busted** and confirms the
  new content is served. On a failed deploy, re-run to a terminal state before
  reporting done — never leave the site stale. A clean/empty-cache render (headless
  browser, incognito) proves the *new* deploy but not a *returning* visitor's cached
  state. See the `update-pages` skill.

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
- **CLI / desktop:** run `scripts/install-toolkit.sh` (the same single source
  of truth the web setup script curls) — the toolkit alone is NOT enough:
  `.claude/settings.json` also enables the official review/security/design
  plugins the script installs alongside it.
- Each project's `.claude/settings.json` carries `extraKnownMarketplaces` +
  `enabledPlugins` (copy `templates/claude-settings.json`).

At session start, **verify the plugin attached**: the `directives-toolkit:*`
commands/skills resolve and the QA agents are available. If they don't, the
environment's setup script didn't run — fix that rather than hand-fetching
files. Updates track this repo's `main` (SHA-versioned); on web they arrive when
the environment's cached setup script rebuilds — on a setup-script/network change
or roughly weekly cache expiry, not necessarily every session. Commands are invoked as
`/env-chk`, `/refresh-repo`, etc.; agents are namespaced `directives-toolkit:*`.

See docs/standards/automations.md for monitor setup and the automation-specific
PR-lifecycle/escalation additions.
See docs/standards/ci-triage.md for CI and Codex failure triage rules.

## Imported Directives
These directives inherit from this file — they are downstream consumers, not overrides.
They now live alongside this file in the consolidated `claude.directives` repo:
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/git.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/design.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/test.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/data.md

## Network Access Playbook (cloud sessions)
All projects share one environment ("fleet"); its egress allowlist applies to
sandbox traffic. When a resource seems unreachable, walk this ladder in order
— each rung has different rules — before reporting "no access":
1. **Connector/MCP tools first** — GitHub MCP for anything GitHub (files,
   PRs, CI logs, commits), Supabase MCP for the database. Authenticated;
   always preferred for in-scope resources.
2. **GitHub as a side-door** — `raw.githubusercontent.com` is allowlisted
   (directives load through it); public repos are readable via the GitHub
   MCP. Never pre-check a private repo with curl: unauthenticated requests
   return 404 even when access exists.
3. **WebSearch** — runs server-side and bypasses the container's network
   policy entirely. Use for documentation, examples, and corroborating
   design/technical facts.
4. **WebFetch** — also server-side with its own egress rules. A 403 here may
   be the target site's bot protection, not the environment policy.
5. **curl/CLI in the sandbox** — goes through the agent proxy; the
   environment allowlist applies. A 403 on CONNECT is a policy denial:
   report it, never route around it. The owner can add the host in the
   environment's network settings — the change takes effect in RUNNING
   sessions immediately (verified 2026-07-12; no new session needed).
   Diagnose with: curl -sS "$HTTPS_PROXY/__agentproxy/status".
6. **Sandbox browser (Playwright)** — launch with
   executablePath '/opt/pw-browsers/chromium'. Known gateway quirk: some
   hosts reset BROWSER-originated connections even when allowlisted
   (github.io, finviz.com) — ERR_CONNECTION_RESET while curl succeeds means
   use curl for content, and for UI verification serve the project locally
   (python3 -m http.server + the project's demo mode) and screenshot that.
7. **The owner** — for pixel-level truth on browser-blocked third-party
   sites, ask for high-res screenshots and treat them as data: extract
   exact colors, typography, spacing, and interaction behavior from the
   image before implementing.

## Cross-Repo Boundary
A Claude Code session is connected to exactly one repository. Do NOT offer
to add or modify other repositories from within a session (no add_repo
offers, no cross-repo PRs). When work belongs in another repo — including
this directives repo — compose a complete, paste-ready hand-off message for
the owner to deliver to a session scoped to that repo, and stop there.
This holds **even when the owner asks mid-session** for a change in another
repo ("upstream this to X"): respond with the hand-off message first, and
use add_repo only if the owner then explicitly declines the hand-off and
directs the add in so many words. (Owner reaffirmation 2026-07-13, after a
same-session add_repo: one repo per session is less error-prone.)
