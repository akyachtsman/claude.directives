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

## Plain Language First (owner ruling, 2026-08-04)
Supersedes *Explanations are tabular-first* (owner preference, 2026-07-13).
Tables are still fine wherever they genuinely help, but they were never the
point and are no longer required — plainer prose is what was actually wanted.

The owner reviews outcomes, not implementations. Mechanism detail is welcome;
it just does not go first, and it never arrives unglossed.

- **Open with what changes for the owner.** One or two sentences, no
  identifiers, before any mechanism — what you can do now that you could not
  before, or what stopped being broken. The test: if the opening cannot be
  understood without opening the diff, rewrite it.
- **Proposing work.** Lead with what it will let you do, roughly what it costs,
  and the one thing most likely to go wrong. The technical plan goes underneath.
  `/diagnose` and `/sdd-loop` still own the detail — this is the paragraph above
  them.
- **Reporting finished work.** Same shape: what is now true that was not, then
  the evidence for it. A list of changed files is not a summary.
- **Gloss every name on first use.** An identifier, algorithm or filename gets a
  plain-language apposition the first time it appears ("the router — the code
  deciding where each arrow goes"), or is replaced by the description outright.
  Never assume the reader knows what a symbol refers to.
- **Owner-facing vs. the record.** Chat replies, PR titles and PR bodies are
  read by the owner and lead in plain language. Commit messages, code comments
  and test names are the engineering *record*: they stay precise and technical,
  and are never simplified to satisfy this rule.
- **Detail on request, not by default.** Keep the mechanism, move it down. When
  it is asked for, give all of it — simpler does not mean vaguer, and "it's
  handled" is not an answer.

## Handoffs Carry Only What Dies With the Session (owner ruling, 2026-08-05)
Applies to `/handoff-session` and to any summary written for a successor
session. The test, applied to every line *before* writing it — not as a pass
afterwards:

> **Would this be lost forever the moment this session ends?**

Not "is it useful", which lets everything through. What changed and why, the
current state of anything, open PRs / issues / branches, the merged history, and
every directive rule all FAIL it: the next session reads those from the repo,
from GitHub, or from its own Session Start fetch. Restating a merged PR's
reasoning is the single most common way a handoff bloats — a merged PR is not
session memory.

Three routing rules place everything else:
- **Durable → a file, never a handoff.** An abandoned approach or a decision
  that should outlive the next session goes to `learnings.jsonl` (`/learn`) or
  to CLAUDE.md. A handoff dies when the next session ends, so parking a durable
  decision there loses it one session later rather than never. Not worth a file
  means not worth the handoff either.
- **Human-actionable → the reply, never the block.** The block addresses the
  next session. If that session cannot act on a line — a branch only the owner
  can delete, a sibling repo it has no access to — raise it in the chat reply at
  the time it is found.
- **Declined twice → decided, not open.** Raised twice with no answer means no.
  Never carry your own proposals forward as unresolved questions.

**"Nothing to hand off — the repo holds everything" is a complete and correct
handoff.** Never pad to fill a format.

## Reuse Before Rewrite (owner ruling, 2026-07-23)
When a requested feature resembles one this project already has, **the
existing implementation is the source — find it, read it, and reuse it.**
Authoring fresh code for an already-solved problem is the single most
common failure mode in this fleet, and it is not acceptable. It ships
divergent behavior for identical features, duplicates every bug, and
doubles the maintenance surface.

- **Search before you write — every time, no exceptions.** Before authoring
  any component, handler, view, renderer, or query, search the repo for the
  nearest existing equivalent (by feature name, by UI role, by table, by
  the words in the request). "Add X to portal B, like the one in portal A"
  is a **reuse task, not an authoring task** — treat it as one.
- **Preferred order, strictly:** (1) call/extend the existing shared
  implementation; (2) generalize it — lift it into one parameterized unit
  serving both callers, with a flag/param for the small differences;
  (3) copy the working implementation verbatim and adapt the minimum.
  **Re-deriving it from scratch is never an option** — a from-scratch
  rewrite of an existing behavior requires the owner's explicit say-so.
- **"Similar but not identical" is a parameter, not a new file.** Small
  differences (labels, table names, permissions, one extra column) are
  arguments to shared code. Divergence is justified only by genuinely
  different *behavior*, and the justification is stated in the PR.
- **Say what you reused.** Every PR touching a feature that resembles an
  existing one names the implementation it reused or generalized — or, if
  it wrote new code, why no existing code fit. Silence reads as a rewrite.
- **The bar is total codebase size.** A change that adds a near-copy of
  existing code is a regression even when it works. Prefer the diff that
  leaves the codebase smaller or flat.

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

## Pipelined Execution (owner ruling, 2026-07-18)
Serializing a task list behind each step's verification wastes the session —
20 tasks × one UI-suite wait each is the failure mode this section exists to
kill. Applies to **every task list, one item or more**:
- **Dependencies are declared at plan time.** Every task carries an explicit
  `depends:` (task IDs it must wait for, or `none`). Parallelism is decided
  when the list is written, not improvised mid-run.
- **Never idle-wait on verification.** The moment a task's UI suite / CI run
  is launched, start the next task with no unmet dependencies. Verification
  results arrive asynchronously (ci-notify, webhooks, background agents) and
  route back when they land.
- **Block only on a true dependency or a shared-file conflict.** "Finishing
  one first feels tidy" is not a dependency.
- **Batch verification.** Group independent small tasks and run ONE suite
  over the batch rather than one run per task — most task lists collapse to
  a handful of verification rounds.
- **Failure routing.** A failed verification becomes the priority; tasks
  downstream of the failure pause; independent tasks keep going. Circuit
  breakers (`test.md` → 3 attempts) unchanged.
- **Loop until drained.** Keep picking up the next ready task until nothing
  is ready and everything outstanding is only waiting on verification or the
  owner. The completion bar is unchanged: ALL verification green before the
  work is called done (`test.md` gates) — pipelining reorders the waiting,
  never skips it.
- **A launched verification IS the start signal for the next task** (owner
  reinforcement, 2026-07-22 — sessions were reminded too often). The moment a
  push, PR, CI run, or deploy is in flight, pick up the next ready task in
  the SAME turn. The turn-end test: a turn that launched verification may
  not end as "waiting on CI" while the ready-queue is non-empty — either
  name the next task you just started, or state "queue empty — parked on
  CI" so the idle wait is visibly justified (see Progress Visibility).
  "Waiting" with ready work on the list is a directive violation, not a
  style choice.
- **Fan independent tasks out to subagents.** Where the Agent tool is
  available, independent items run as parallel background subagents — small,
  tightly scoped, one task each — instead of serially in the main loop. The
  main session stays the orchestrator: it assigns, integrates results, and
  runs the batched verification. Every spawned agent is collected before the
  turn ends (→ Async Operations); shared-file conflicts stay a valid reason
  to serialize, "it's tidier one at a time" does not.

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
     per polling cycle. **No scheduled "backstop" checks either** (owner
     ruling, 2026-07-18): failure wakes natively, success wakes via
     ci-notify, and the owner's next message is the backstop for the rare
     case both break — a parked session costs nothing, a backstop costs a
     prompt every time. Sole exception: the one PR that changes the wake
     mechanism itself may arm a single verification check. `create_trigger` /
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

## Standing Authorization (owner ruling, 2026-07-22)
The symmetric rule to Escalation Rules: that list defines when to STOP —
this one defines the default everywhere else, which is KEEP GOING.
- An owner-approved plan, task list, or "continue" instruction is a
  **standing authorization**: it covers every task in the declared list,
  not just the next one. Work task-to-task without re-asking; checkpoint
  reports replace permission requests.
- **Re-asking at a task boundary that trips no stop gate is a directive
  violation**, symmetric to idle-waiting during verification (→ Pipelined
  Execution's turn-end test). "Want me to continue?" with authorized work
  remaining is the same failure as "waiting on CI" with ready work queued.
- The stop gates are unchanged and are NEVER overridden by a standing
  authorization: Escalation Rules above, the hold-for-approval diff classes
  (`git.md` → Conditional Auto-Merge on Green — secrets, elevated config,
  any Supabase backend change), and genuine scope changes. Work that is NOT
  in the declared plan still needs the owner — momentum is never a license
  to invent scope.
- When the declared list drains: report done and stop. A standing
  authorization expires with its list.

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
