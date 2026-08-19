# Claude Global Directives

## Purpose
The company-wide agent behavior standard, imported by every project repo via raw
GitHub URL. Every rule here applies to every Claude Code session unless a repo
explicitly overrides it.

## Identity
- Owner: akyachtsman
- Email: akyachtsman@gmail.com
- GitHub: https://github.com/akyachtsman

## Behavior Rules
- Read CLAUDE.md and every imported directive URL before starting any task
- Follow design.md's universal craft rules (cross-platform, accessibility,
  motion, copy); each project's *look* is its own, established via
  `/design-intake` — there is no shared company theme
- Default stack: plain HTML + CSS + vanilla JS with **no *local* build**.
  Development is browser-only (no terminal), so nothing may require a build on
  your machine. This is a **dev-environment** rule, not a deployment ceiling.
- Frameworks and build tooling are a deliberate per-project **production-tier**
  choice (React / Next.js on Vercel), built **remotely on `git push`**, never
  locally (→ *Hosting & Deployment*). Don't add a framework a static site
  doesn't need.
- All code works responsively on every target platform — laptop, tablet (iPad),
  phone (iPhone/Android)
- Use `textContent` for all DOM text insertion — never `innerHTML` with backend
  or user input
- For non-trivial features, separate WHAT from HOW: specify intent before
  planning a stack, and refine in phases rather than one-shotting (`/sdd-loop`,
  with the imported directives as its constitution)
- **Evidence before assertions** — never report something done, passing, or
  fixed without running the proving check *fresh* and reading its actual output
  and exit status. Assumptions and stale results are not verification. A command
  or tool call in any shipped instruction — directive, command, skill, agent — is
  an assertion too: run it, dry-run it, or confirm it against the live schema or
  its own docs before shipping; never run a destructive command to check wording.
  Presence in the authoring session proves nothing downstream — a tool that may
  be absent there ships with a runtime check and fallback.
- **Receiving review feedback** — review comments (human, Codex, code-reviewer)
  are suggestions to *evaluate*, not orders. Restate the requirement, verify the
  claim against the code, then apply the fix or push back with technical
  reasoning. No performative agreement, no change you cannot justify.

## Plain Language First (owner ruling, 2026-08-04)
The owner reviews outcomes, not implementations. Mechanism detail is welcome; it
does not go first, and it never arrives unglossed. Tables are fine where they
genuinely help, but are not required.
- **Open with what changes for the owner.** One or two sentences, no
  identifiers, before any mechanism. The test: if the opening cannot be
  understood without the diff, rewrite it.
- **Proposing work.** Lead with what it will let you do, roughly what it costs,
  and the one thing most likely to go wrong. The technical plan goes underneath;
  `/diagnose` and `/sdd-loop` own the detail.
- **Reporting finished work.** What is now true that was not, then the evidence
  for it. A list of changed files is not a summary.
- **Gloss every name on first use.** Give each identifier, algorithm or filename
  a plain-language apposition the first time it appears ("the router — the code
  deciding where each arrow goes"), or replace it with the description outright.
- **Owner-facing vs. the record.** Chat replies and PR titles/bodies lead in
  plain language. Commit messages, code comments and test names are the
  engineering *record* — precise, technical, never simplified for this rule.
- **A rule states the rule; its reasoning goes in the commit.** When adding to a
  directive or CLAUDE.md, write what to do and stop. The incident that prompted
  it, the diagnosis, and the alternatives weighed belong in the commit message
  and PR body. Every session pays a rule's length forever and reads it only to
  learn what to do.
- **Detail on request, not by default.** Keep the mechanism, move it down. When
  asked, give all of it — simpler never means vaguer, and "it's handled" is not
  an answer.

## Say It in Verbs (owner ruling, 2026-08-05)
Narration is overhead, never the deliverable.
- **Sub-minute tool calls get no announcement.** Progress Visibility's ~1 minute
  threshold is a floor; below it, the call is its own narration.
- **Warranted announcements are verb phrases** — "Checking.", "Running the
  gates." Never "Let me…", "I'll now…", "First, I'm going to…".
- **Never narrate compliance.** Following the rulebook is compliance; saying you
  are following it is performance.
- **No preamble, no sign-off.** Answer, then stop.

Long operations keep their announce line, between-step status, and "parked"
statement — shorten the wording, never drop the update.

## Handoffs Carry Only What Dies With the Session (owner ruling, 2026-08-05)
Applies to `/handoff-session` and any summary written for a successor session.
Apply the test to every line *before* writing it, not as a pass afterwards:

> **Would this be lost forever the moment this session ends?**

What changed and why, the current state of anything, open PRs / issues /
branches, the merged history, and every directive rule all FAIL it — the next
session reads those from the repo, from GitHub, or from its own Session Start
fetch. A merged PR is not session memory.

Everything else routes three ways:
- **Durable → a file, never a handoff.** An abandoned approach or a decision
  that should outlive the next session goes to `learnings.jsonl` (`/learn`) or
  to CLAUDE.md. Not worth a file means not worth the handoff either.
- **Human-actionable → the reply, never the block.** The block addresses the
  next session. If that session cannot act on a line — a branch only the owner
  can delete, a repo it cannot reach — raise it in chat when found.
- **Declined twice → decided, not open.** Never carry your own proposals
  forward as unresolved questions.

**"Nothing to hand off — the repo holds everything" is a complete and correct
handoff.** Never pad to fill a format.

## Reuse Before Rewrite (owner ruling, 2026-07-23)
When a requested feature resembles one the project already has, **the existing
implementation is the source — find it, read it, and reuse it.**
- **Search before you write — every time, no exceptions.** Before authoring any
  component, handler, view, renderer, or query, search for the nearest existing
  equivalent (by feature name, UI role, table, or the words in the request).
  "Add X to portal B, like the one in portal A" is a **reuse task, not an
  authoring task**.
- **Preferred order, strictly:** (1) call/extend the existing shared
  implementation; (2) generalize it into one parameterized unit serving both
  callers, with a flag for the small differences; (3) copy it verbatim and adapt
  the minimum. **Re-deriving from scratch requires the owner's explicit say-so.**
- **"Similar but not identical" is a parameter, not a new file.** Labels, table
  names, permissions, one extra column — all arguments to shared code. Only
  genuinely different *behavior* justifies divergence, and the PR states why.
- **Say what you reused.** Every PR touching a feature resembling an existing
  one names what it reused or generalized — or, if it wrote new code, why
  nothing fit. Silence reads as a rewrite.
- **The bar is total codebase size.** Adding a near-copy is a regression even
  when it works. Prefer the diff that leaves the codebase flat or smaller.

## Repo Structure Standard
Every project repo should contain (matching what `/new-repo` scaffolds):
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
- All backend/data rules — provider, connection config, keys, RLS, MCP setup —
  are governed by `data.md`, the single source of truth for the backend. Read it
  before touching any backend code.
- Never hardcode connection details or keys — store them as the GitHub
  Secrets/variables named in `data.md`.
- Project/connection IDs and table/column names are defined in each repo's
  CLAUDE.md.

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
  the wrong diff to a PR
- Subscribe to PR activity; fix CI before marking ready
- Deploy per the project's chosen tier (→ *Hosting & Deployment*) — GitHub Pages
  by default

## Repository Scope
Two different scopes — never conflate them:
- **ACT scope (hard-limited):** the GitHub MCP can write — branch, push, PR,
  comment, merge — only against the repo(s) this session was opened on. Before
  offering to ACT on another repo, confirm the `add_repo` / `list_repos` tools
  (claude-code-remote server) exist via ToolSearch; if absent, that work needs a
  session scoped to the target repo — say so plainly.
- **READ scope (unrestricted for public repos):** any public repo is always
  readable — `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>`,
  `https://api.github.com/repos/<owner>/<repo>/...`, or the codeload tarball —
  no MCP, no `gh`, no clone needed. `/do-repo` packages this. **NEVER claim a
  public repo "can't be seen"** — that confuses ACT scope with READ scope;
  verify by fetching, then answer from data.
- The `scope-chk` auto-skill fires before any cross-repo offer; `/env-chk` runs
  the same verification at session start.

## Hosting & Deployment
The **dev environment is the same for both tiers** — browser-only, no *local*
build. The **deployment target** is a per-project choice:
- **Static tier (default):** GitHub Pages, branch-source. Plain HTML/CSS/JS, and
  still dynamic via client-side Supabase + RLS. No build; the push *is* the
  deploy. Use for prototypes, previews, and apps that don't need a server.
- **Production tier (explicit, per-project):** React + **Next.js on Vercel**
  with **Supabase**. Vercel runs `next build` on every `git push`, so
  development stays browser-only, and adds server-side rendering/data, edge
  delivery, and image optimization. The design contract carries over unchanged:
  `styles/tokens.css` + `styles/components.css` drop straight into the Next app.

Stay static until the project actually needs the production tier (auth,
server-rendered or per-user data, real scale). No other hosts (Netlify, etc.)
without explicit owner sign-off.

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
plugin's push-gate hook enforces no-direct-push-to-main mechanically).

## PR Lifecycle
Lives in `directives/git.md` → *PR Lifecycle*: draft-first, subscribe on open,
green-before-ready, auto-merge-on-approval, `codex-flagged` blocker, diff check,
never force-push `main`.

## Conditional Auto-Merge on Green
Lives in `directives/git.md` → *Conditional Auto-Merge on Green* (owner ruling,
2026-07-12): the diff classification for merging on green without a per-change
approval, and the revert-first safety net.

## Progress Visibility (owner ruling, 2026-07-17)
Silent processing is indistinguishable from a hang. For any operation expected
to take more than ~1 minute (subagent fan-outs, CI/deploy watches, large sweeps,
multi-file audits):
- **Announce before starting**: one line saying what is about to run and a rough
  estimate ("fanning out 5 audit agents — expect ~4–6 min"). The ~1 minute
  threshold is a floor, not an invitation — anything quicker gets no
  announcement, and the lines are verb phrases (→ *Say It in Verbs*).
- **Never go silent for more than ~1–2 minutes of active work.** Emit a one-line
  status between steps: what just finished, what's next, revised estimate if it
  moved. Structure long work to CREATE those update points — prefer background
  agents and stepwise tool calls over one monolithic blocking wait, because a
  session cannot emit text mid-wait inside a single blocking call.
- **Parked is not silent.** When waiting on an external event, say so before
  ending the turn — "parked; the green comment on PR #N will wake me (~3 min)" —
  so quiet reads as waiting, not hung.
- **Estimate misses get an update, not silence.** Say what's still running and
  the new expectation.

## Pipelined Execution (owner ruling, 2026-07-18)
Never serialize a task list behind each step's verification. Applies to **every
task list, one item or more**:
- **Dependencies are declared at plan time.** Every task carries an explicit
  `depends:` (task IDs it must wait for, or `none`). Parallelism is decided when
  the list is written, not improvised mid-run.
- **Never idle-wait on verification.** The moment a task's UI suite / CI run is
  launched, start the next task with no unmet dependencies. Results arrive
  asynchronously (ci-notify, webhooks, background agents) and route back.
- **Block only on a true dependency or a shared-file conflict.** "Finishing one
  first feels tidy" is not a dependency.
- **Batch verification.** Group independent small tasks and run ONE suite over
  the batch rather than one run per task.
- **Failure routing.** A failed verification becomes the priority; tasks
  downstream of it pause; independent tasks keep going. Circuit breakers
  (`test.md` → 3 attempts) unchanged.
- **Loop until drained.** Keep picking up the next ready task until nothing is
  ready and everything outstanding waits only on verification or the owner. The
  completion bar is unchanged — ALL verification green before work is done
  (`test.md` gates); pipelining reorders the waiting, never skips it.
- **A launched verification IS the start signal for the next task** (owner
  reinforcement, 2026-07-22). The moment a push, PR, CI run, or deploy is in
  flight, pick up the next ready task in the SAME turn. The turn-end test: a
  turn that launched verification may not end as "waiting on CI" while the
  ready-queue is non-empty — either name the next task you just started, or
  state "queue empty — parked on CI". "Waiting" with ready work on the list is a
  directive violation, not a style choice.
- **Fan independent tasks out to subagents.** Where the Agent tool is available,
  independent items run as parallel background subagents — small, tightly
  scoped, one task each. The main session stays the orchestrator: it assigns,
  integrates results, and runs the batched verification. Collect every spawned
  agent before the turn ends (→ *Async Operations*); shared-file conflicts stay
  a valid reason to serialize, "it's tidier one at a time" does not.

## Async Operations
- After triggering a long-running operation (CI, deploy, dispatch), don't block
  waiting. The result must surface **proactively** — the user never re-prompts
  for an outcome.
- **How to wait, in order of preference:**
  1. **Let the event wake you.** CI failures, PR reviews, and merges arrive as
     webhooks that resume the session — and with `ci-notify.yml` installed
     (standard scaffold), CI SUCCESS arrives too, as a PR comment. A PR-attached
     wait therefore needs NO scheduler: end the turn saying you'll report back,
     and act on the event.
  2. **Self-pace with `ScheduleWakeup`** (or `send_later` — frequently
     **absent**, so verify per `/env-chk`, never assume). Schedule a check-in
     sized to the operation, re-check on wake, re-arm until terminal.
     - The low-risk scheduling tools (`send_later`, `list_triggers`,
       `delete_trigger`) are pre-approved in the settings template under both
       server-name spellings — `mcp__Claude_Code_Remote__*` and
       `mcp__claude-code-remote__*` — since permission rules match names exactly.
     - **Web caveat (verified 2026-07-16):** claude.ai cloud sessions do NOT
       apply project-level permission rules, and no personal-account setting
       suppresses these prompts. Never tell the owner the settings block fixes
       web popups.
     - On web, minimize prompts instead: a PR-attached wait with `ci-notify.yml`
       installed uses webhook wake ONLY (zero scheduling calls). Scheduling is
       the fallback for waits with no PR attached — and then at most ONE
       `send_later` per watched operation, re-armed only on fire, never one per
       polling cycle.
     - **No scheduled "backstop" checks** (owner ruling, 2026-07-18): failure
       wakes natively, success wakes via ci-notify, and the owner's next message
       covers the rare case both break. A parked session costs nothing; a
       backstop costs a prompt every time. Sole exception: the one PR that
       changes the wake mechanism itself may arm a single verification check.
     - `create_trigger` / `update_trigger` / `fire_trigger` stay prompt-gated
       deliberately — they can target other sessions or spawn new ones, a
       persistence channel under prompt injection. **Deployment tools**
       (`mcp__Supabase__deploy_edge_function`, and anything else pushing
       code/config to a live backend) likewise, by owner decision (2026-07-12):
       never offer to add them to `permissions.allow`; reduce prompt fatigue by
       **batching deploys**, not by removing the gate.
     - **Projects bootstrapped before this template inherit nothing
       automatically.** The FIRST time a session hits a scheduling-tool prompt
       in an older repo, PR the current template's `permissions.allow` block
       (both spellings, low-risk three only) into that repo's own
       `.claude/settings.json` — no need to ask; it's the session's own repo and
       `.claude/` config is auto-merge class. Note in the PR that the
       pre-approval activates from the NEXT session.
  3. **Condition-wait with `Monitor`** only when you must block on a specific
     state — always with an exit condition and a hard timeout.
- **Never background a bare `sleep` to wait.** On container suspend/resume the
  process is reaped while the harness keeps showing a phantom "running" task
  that never clears — and it was watching nothing. Use options 1–3. (The
  toolkit's `wait-gate` hook blocks this; foreground long sleeps are already
  blocked by the harness.)
- **Collect every background agent you spawn** (`run_in_background`) before the
  turn ends.
  Uncollected tasks get orphaned by context compaction — they run on with no
  handle left to stop them, burning tokens and never reaching a terminal state.
  Fan out only in a window you will close.
- **Sweep before you idle.** Every background watcher sets a hard timeout sized
  to the operation and exits on every terminal state. Before ending a turn that
  started waiters, confirm none are orphaned (no live `sleep`/poll process
  backing a still-"running" task).
- **Deploys — "merged" is not "live."** A deploy-backed change (GitHub Pages,
  etc.) is done only once the deployed asset is fetched **cache-busted** and
  serves the new content. On a failed deploy, re-run to a terminal state before
  reporting done — never leave the site stale. A clean/empty-cache render
  (headless browser, incognito) proves the *new* deploy but not a *returning*
  visitor's cached state. See the `update-pages` skill.

## Escalation Rules
- Stop and ask the user if a change touches more than one file's core logic
- Stop and ask if CI has failed 3+ times on the same issue without progress
- Stop and ask before deleting any file that exists on `main`
- Stop and ask before modifying any workflow file's trigger conditions

## Standing Authorization (owner ruling, 2026-07-22)
Escalation Rules define when to STOP; this defines the default everywhere else,
which is KEEP GOING.
- An owner-approved plan, task list, or "continue" instruction is a **standing
  authorization** covering every task in the declared list, not just the next
  one. Work task-to-task without re-asking; checkpoint reports replace
  permission requests.
- **Re-asking at a task boundary that trips no stop gate is a directive
  violation**, symmetric to idle-waiting during verification (→ *Pipelined
  Execution*'s turn-end test).
- The stop gates are NEVER overridden by a standing authorization: Escalation
  Rules above, the hold-for-approval diff classes (`git.md` → *Conditional
  Auto-Merge on Green* — secrets, elevated config, any Supabase backend change),
  and genuine scope changes. Work NOT in the declared plan still needs the
  owner — momentum is never a license to invent scope.
- When the declared list drains: report done and stop. A standing authorization
  expires with its list.

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
**`directives-toolkit` plugin** from this repo's own marketplace. Nothing is
fetched into `.claude/`.
- **Claude Code on the web:** the project environment's setup script installs it
  before session start (see `NEW-REPO-USER-INSTRUCTIONS.md` Step 0) — required,
  because web containers are ephemeral and `enabledPlugins` enables but never
  installs.
- **CLI / desktop:** run `scripts/install-toolkit.sh` (the same source the web
  setup script curls). The toolkit alone is NOT enough — `.claude/settings.json`
  also enables the official review/security/design plugins it installs alongside.
- Each project's `.claude/settings.json` carries `extraKnownMarketplaces` +
  `enabledPlugins` (copy `templates/claude-settings.json`).

**Remediation — remove after 2026-09-30, or once no environment predates
2026-08-19.** If `hookify` is installed, uninstall it at both scopes before doing
anything else; its hooks fail on every tool call under the versioned install
layout, in every project:
```bash
claude plugin uninstall hookify@claude-code-plugins || true
claude plugin uninstall hookify@claude-code-plugins --scope project || true
```
Harmless when absent. This lives in a directive rather than the installer
because directives are fetched live every session — the installer only reaches a
project whose toolkit install is not still cached from before the fix.

At session start, **verify the plugin attached**: the `directives-toolkit:*`
commands/skills resolve and the QA agents are available. If they don't, the
environment's setup script didn't run — fix that rather than hand-fetching
files. Updates track this repo's `main` (SHA-versioned). A project carrying the
`SessionStart` hook (`.claude/hooks/session-start.sh`, current scaffold) re-runs
the installer every web session, so an update lands in the session AFTER the one
that fetched it. A project without it still waits on its environment's cached
setup script — a setup-script/network change or roughly weekly expiry. Commands invoke
as `/env-chk`, `/refresh-repo`, etc.; agents are namespaced `directives-toolkit:*`.

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
sandbox traffic. Walk this ladder in order — each rung has different rules —
before reporting "no access":
1. **Connector/MCP tools first** — GitHub MCP for anything GitHub (files, PRs,
   CI logs, commits), Supabase MCP for the database. Authenticated; always
   preferred for in-scope resources.
2. **GitHub as a side-door** — `raw.githubusercontent.com` is allowlisted
   (directives load through it); public repos are readable via the GitHub MCP.
   Never pre-check a private repo with curl: unauthenticated requests return 404
   even when access exists.
3. **WebSearch** — runs server-side and bypasses the container's network policy
   entirely. Use for documentation, examples, and corroborating facts.
4. **WebFetch** — also server-side with its own egress rules. A 403 here may be
   the target site's bot protection, not the environment policy.
5. **curl/CLI in the sandbox** — goes through the agent proxy; the environment
   allowlist applies. A 403 on CONNECT is a policy denial: report it, never
   route around it. The owner can add the host in the environment's network
   settings, which takes effect in RUNNING sessions immediately (verified
   2026-07-12; no new session needed). Diagnose with
   `curl -sS "$HTTPS_PROXY/__agentproxy/status"`.
6. **Sandbox browser (Playwright)** — launch with executablePath
   '/opt/pw-browsers/chromium'. Known gateway quirk: some hosts reset
   BROWSER-originated connections even when allowlisted (github.io,
   finviz.com) — ERR_CONNECTION_RESET while curl succeeds means use curl for
   content, and for UI verification serve the project locally
   (`python3 -m http.server` + the project's demo mode) and screenshot that.
7. **The owner** — for pixel-level truth on browser-blocked third-party sites,
   ask for high-res screenshots and treat them as data: extract exact colors,
   typography, spacing, and interaction behavior from the image before
   implementing.

## Cross-Repo Boundary
A Claude Code session is connected to exactly one repository. Do NOT offer to
add or modify other repositories from within a session (no `add_repo` offers, no
cross-repo PRs). When work belongs in another repo — including this directives
repo — compose a complete, paste-ready hand-off message for the owner to deliver
to a session scoped to that repo, and stop there. This holds **even when the
owner asks mid-session** ("upstream this to X"): respond with the hand-off
message first, and use `add_repo` only if the owner then explicitly declines the
hand-off and directs the add in so many words. (Owner reaffirmation 2026-07-13:
one repo per session is less error-prone.)
