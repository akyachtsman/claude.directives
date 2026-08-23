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
- **No framework tier.** Don't add a framework or a build step; a static site
  doesn't need one, and adopting one was evaluated and rejected
  (→ *Hosting & Deployment*).
- All code works responsively on every target platform — laptop, tablet (iPad),
  phone (iPhone/Android)
- Use `textContent` for all DOM text insertion — never `innerHTML` with backend
  or user input
- **When a value's provenance changes, re-audit its sinks in the same diff.**
  The trigger is a property of the diff you are already writing: does it change
  where a value comes from, or who may write it — repointing a read at config, a
  column or user input, or granting an update policy, an edit endpoint, or a
  looser constraint on one that already exists? A widened writer changes the
  provenance of every existing read without touching any of them. If so, grep
  the value's name and check every place it lands, before that diff ships.
  Interpolation that looked safe because the value came from a fixed, known-safe
  set stops being safe the moment a change makes it user-editable — and the sinks
  are unchanged, so nothing in them looks wrong. A constraint bounds which values
  are possible, never whether they are safe in HTML, SQL or shell grammar: encode
  or parameterize at the sink either way. Check it in the diff that moves the
  value, never a later sweep.
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
- **Correct a prior answer explicitly.** When something you already told the
  user turns out to be wrong, name that specific claim and replace it — not a
  general apology, and never a quiet restatement in new words.
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
- **No preamble, no sign-off.** Answer, then stop. (The status line is not a
  sign-off — it is required; → *Status Line on Every Stop*.)

Long operations keep their announce line, between-step status, and "parked"
statement — shorten the wording, never drop the update.

## Pasteable Messages Go in Chat, Fenced (owner ruling, 2026-08-22)
Anything written for the owner to relay elsewhere — a hand-off to another repo's
session, a prompt, an issue body, a message to a person — goes **in chat, inside a
fenced code block**, so the copy button takes it in one click.
- **Never hand over a file to copy from.** Compose the message in the reply.
- **Fence it; prose in chat is not enough.**
- **The outer fence must be LONGER than the longest backtick run inside it.**
  Four backticks for content holding ordinary triple-backtick blocks; five when
  the content itself uses four.
- **The first line INSIDE the fence names the recipient**, as
  `→ SEND TO: <session or repo>`. A block whose own fixed format opens by naming
  its destination already satisfies this — `/handoff-session`'s
  `SESSION HANDOFF — <repo-name>` header. Its one-line empty form is exempt.
- **A file is still right when the artifact IS a file** — something to commit,
  run, or open in another tool. This governs messages, not deliverables.

## Status Line on Every Stop (owner ruling, 2026-08-18)
Every time a session stops working — end of turn, end of task, blocked, or
parked — the message's final line is a status line in this vocabulary (the
four canonical states below, or an intermediate state named the same way), so
the owner never has to ask whether the session is working or waiting. It sits
BELOW the ask ledger (→ *Burst Intake — Multiple Asks at Once*): the ledger is
the reply's final block, this is its final line.

- **"Waiting for CI"** — tests running; the session resumes itself on the
  result.
- **"Waiting for response"** — blocked on the owner; the question sits
  directly above the status line.
- **"Deployed"** — merged AND verified live at the deployed URL; safe to test.
- **"all done"** — the queue is genuinely empty: nothing in flight, no CI, no
  background agents, no scheduled check-ins. Reserved for exactly that.

The grammar: a short status phrase, optionally a parenthetical subject with
elapsed time ("Waiting for CI (PR #845) — 12m elapsed"), optionally pending
items after a colon ("Waiting for CI: PR #845 → merge → deploy-verify").
Intermediate states name themselves the same way ("Merged" while the deploy
builds). A stop with no status line is a directive violation. A command whose
definition fixes its own closing line or block keeps it — the status line
follows it as the message's true final line; command formats end the body,
never the message.

**Heartbeat:** any external wait longer than five minutes — CI, a deploy, a
long-running job — arms a visible heartbeat: a one-line status ("Waiting for
CI (PR #845) — 12m elapsed") each time the session surfaces during the wait,
never a silent re-arm. A missing heartbeat means the session is hung — which
is otherwise indistinguishable from waiting, and that distinction is the
heartbeat's whole purpose.

**A heartbeat never buys a wake.** It is a line the session emits when it is
already awake — on any stop, on an event wake, on a scheduled check-in it
already had. It does not authorise extra wakes to keep a cadence: the wait's
existing signals set the cadence, and where the owner prefers one consolidated
check-in, that check-in carries the heartbeat rather than being supplemented by
it. A wait whose only signal is a webhook heartbeats when the webhook fires;
five minutes is the threshold that arms the line, not a polling interval
(→ *Async Operations*, and `git.md` → *GitHub API Quota Economy*).

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
  workflows/     ← the standard template set from templates/workflows/ (9 files):
    qa.yml, qa-live.yml, qa-response.yml,
    ci-monitor.yml, ci-notify.yml, codex-monitor.yml, pages-monitor.yml,
    pages-retry.yml, cron-notify.yml
                 ← keepalive.yml is NOT standard: it pushes to main weekly, which
                   the required default-branch ruleset refuses, and a repo where
                   PRs land never hits the 60-day inactivity limit it exists for
  scripts/
    ui-tests/
```

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
- PR activity arrives on its own — opening a PR subscribes the session
  harness-side; leave it alone — the harness drops it at merge
  (`git.md` → *PR Lifecycle*)
- Fix CI before marking ready
- Deploy to **GitHub Pages** — the only target; any other host needs explicit
  owner sign-off (→ *Hosting & Deployment*)

## Repository Scope
Two different scopes — never conflate them:
- **ACT scope (hard-limited):** the GitHub MCP can write — branch, push, PR,
  comment, merge — only against the repo(s) this session was opened on, and
  there is no attach path around it: work targeting another repo belongs to
  that repo's own session (→ *One Session, One Repo*) — say so plainly.
- **READ scope (unrestricted for public repos):** any public repo is always
  readable — `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>`,
  `https://api.github.com/repos/<owner>/<repo>/...`, or the codeload tarball —
  no MCP, no `gh`, no clone needed. `/do-repo` packages this. **NEVER claim a
  public repo "can't be seen"** — that confuses ACT scope with READ scope;
  verify by fetching, then answer from data.
- The `scope-chk` auto-skill fires before any cross-repo offer; `/env-chk` runs
  the same verification at session start.

## Hosting & Deployment (owner ruling, 2026-08-21)
**GitHub Pages, branch-source, is the deployment target.** Plain HTML/CSS/JS,
dynamic via client-side Supabase + RLS. No build; the push *is* the deploy.

**A React / Next.js-on-Vercel "production tier" was evaluated and REJECTED** —
a different development platform, changing a lot of code for a need no project
had. Do not re-propose it, and do not scaffold toward it.

- **Needing a server is not a reason to reach for one.** The gap a framework
  tier would have filled is server-side execution — a real secret at request
  time, or rate limiting, which RLS cannot do (`data.md` → *Client Auth
  Pattern*). **Supabase Edge Functions already cover that**, with no framework,
  no build step and no new platform — this ruling rests on `data.md` →
  *Preferred Backend*, which is itself an owner ruling (`data.md` → *Reversible-by-Design Backend
  Changes*).
- **If a project ever genuinely outgrows Pages**, the owner's stated direction
  is **Cloudflare** — response time, caching, security. That names a direction,
  not a decision: it still needs explicit sign-off, against a real requirement.
- No other host without explicit owner sign-off.

## Security
- Never commit API tokens, secrets, or credentials to any repo
- Never echo secrets in workflow logs
- Security scan before every PR (canonical pattern — keep identical to the `secret-scan` composite action the qa workflows share). **`-l` is load-bearing**: it prints matching FILENAMES, never the matched line — an accidentally committed token is not a registered repo secret, so Actions will not mask it, and a scan that echoes the line leaks the credential it just caught: `grep -rlE "pat[A-Za-z0-9]{14}\.[A-Za-z0-9]{40,}|pat[A-Za-z0-9]{17}\.[a-f0-9]{64}|pat[lr]_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{20,}|xoxb[-]" --include="*.js" --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.html" --include="*.css" --include="*.json" --include="*.md" --include="*.sh" --include="*.yml" --include="*.yaml" --exclude-dir=node_modules --exclude-dir=.git .`

## Pre-Push Verification (Local Gate)
Before committing or pushing, verify locally — never rely on CI alone:
- Run the repo's full test suite, plus lint/type checks if configured.
- Check current CI status; if a run is in progress, wait for green.
- Review `git status` and the diff — no unintended changes staged.

Report the result before pushing; fix failures locally rather than on the PR.
`/commit-chk` is the manual backup when this auto-check did not fire.

The plugin's push-gate hook catches an obvious direct push to main in the
session running it, but it is a local speed bump and **not** an enforcement
point — its bypass surface is not enumerable, so never read a green hook run as
evidence that main is protected. The enforcement is a **GitHub ruleset on the
default branch**, which every repo installing this toolkit must have; the setup
and its verification probes are in the toolkit repo's
`MAINTAIN-REPO-USER-INSTRUCTIONS.md`.

## PR Lifecycle
Lives in `directives/git.md` → *PR Lifecycle*: draft-first, auto-subscribed on
open, subscribed until the harness drops it, green-before-ready, auto-merge-on-green, `codex-flagged` blocker, diff check,
never force-push `main`.

## Conditional Auto-Merge on Green
Lives in `directives/git.md` → *Conditional Auto-Merge on Green* (owner rulings,
2026-07-12 / 2026-08-18): auto-merge on green is the rule for every diff class —
plus the two surviving stops (secrets or personal data in the diff; invented
scope) and the revert-first safety net.

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

## Burst Intake — Multiple Asks at Once (owner ruling, 2026-08-18)

*Pipelined Execution* governs a task list already written. This governs the
moment the asks ARRIVE — the owner firing several requests in one message, or
interjecting new ones mid-turn while work is in flight.

**The trigger, quantified.** The moment TWO OR MORE independently actionable
requests are pending in the same turn — one message carrying several, or
mid-turn interjections stacking on in-flight work — decompose IMMEDIATELY, in
that turn, before finishing the current step:
1. Name each ask as a task with `depends:` (per *Pipelined Execution*).
2. **Spawn a background subagent for every item that** (a) shares no files with
   an in-flight item, and (b) is investigation, diagnosis, reproduction, or
   authoring work of roughly three or more tool calls. One agent per item,
   tightly scoped, told exactly what to report back.
3. Keep inline only: items cheaper than the spawn overhead (a one-line edit, a
   single query), integration mechanics (commit/push/merge/deploy), database
   writes, and anything that needs the owner mid-flight.

**Interjections join the queue, they don't restart it.** A mid-turn ask gets
one sentence of acknowledgment and an immediate slot — spawned, started, or
parked with a reason — inside the same turn. Parking is a decision the owner
can veto, so it must be visible, never silent.

**The turn-end bar.** A turn may not end with an actionable ask that is neither
done, running under a named agent, nor explicitly parked with its reason. And
the close of the turn carries ONE consolidated status naming every ask and its
state — not a narration per item as it happened. ("Wrong session" asks the
owner retracts are dropped, not parked.)

**Order of a mixed turn:** spawn the delegable asks FIRST (they run while you
work), then do the inline work, then integrate — spawning last forfeits the
parallelism the spawn was for.

**Every reply ends with the ask ledger (owner ruling, 2026-08-20).** The
**ledger** is the short list that closes a reply: one line per thing the user
asked, each with its answer or current state. The bar above covers work items;
this covers ANSWERS.

EVERY reply carries one — never "when two or more asks are pending". One line
per ask received **since your previous reply**, in the order asked, one sentence
each, plus whatever the previous ledger left open. That boundary is the whole
turn, so an ask answered before the next one interrupted still gets its line.
One ask means one line, and on a conversational turn that line is simply the
closing sentence. When a message carries no ask at all, the ledger is one line
naming what remains open, or "nothing open" — never absent.
- **A question is an ask.** "Is X part of the record?" needs a line as much as
  "fix X" does. Questions are what prose absorbs.
- **Answered-but-buried is unanswered.** The value is the fixed position: the
  reader scans the close and sees everything. An answer given correctly three
  paragraphs up does not count.
- **Read each state before writing its line.** "Done", "merged", "still open"
  are claims, and the ledger is where claims made from memory collect. This is
  Evidence before assertions applied at the close — the line is written from a
  fresh check, never from recall.
- **Anything unfinished carries its reason:** `waiting on X`, or `not doing,
  because Y`. Silence is not a state.
- **Every open PR gets a line too**, whether or not it was asked about this
  turn — an unmerged PR is an open item.
- **Nothing goes between the ledger and the status line.** Not a caveat, not
  "one more thing"; anything worth saying goes above. The ledger is the reply's
  final block, the status line its final line (→ *Status Line on Every Stop*).

## Async Operations
- After triggering a long-running operation (CI, deploy, dispatch), don't block
  waiting. The result must surface **proactively** — the user never re-prompts
  for an outcome.
- **How to wait, in order of preference:**
  1. **Let the event wake you.** CI failures, PR reviews, and merges arrive as
     webhooks that resume the session — and with `ci-notify.yml` installed
     (standard scaffold), CI SUCCESS arrives too, as a PR comment. A PR-attached
     wait therefore needs NO scheduler: end the turn saying you'll report back,
     and act on the event. **Exception, and it is not rare:** a wake only covers
     what something actually emits. A dispatched run on a PR branch has seven
     verified ways to emit nothing (`git.md` → *PR Lifecycle*), and a cancelled run
     emits no PR WAKE, since `ci-notify` fires only on success. (It is not
     unmonitored — `ci-monitor.yml` classifies an unsuperseded cancellation and
     files the `ci-failure` issue — but that issue does not reach the session
     waiting on the PR, so the check-in is still the only observer *you* have.)
     Where nothing will wake you, a check-in is the only observer — arming one
     there is not the polling `git.md` bans.
  2. **Self-pace with `send_later`** (pre-approved per *Scheduling Tools Never
     Prompt*; `ScheduleWakeup` where a session has it instead — verify per
     `/env-chk`, never assume either). Schedule a check-in sized to the
     operation, re-check on wake, re-arm until terminal.
     - **A check-in is a snapshot, not current state.** Its text was written
       when it was armed, so by the time it fires the SHAs, PR states and open
       items in it may be wrong. Verify anything you are about to act on before
       acting; never quote one of its identifiers back without checking it.
     - All six scheduling tools (`send_later`, `create_trigger`,
       `delete_trigger`, `update_trigger`, `fire_trigger`, `list_triggers`) are
       pre-approved in the settings template under both server-name spellings —
       `mcp__Claude_Code_Remote__*` and `mcp__claude-code-remote__*` — per
       *Scheduling Tools Never Prompt* below; permission rules match names
       exactly.
     - Settings load at session start, so the allowlist covers the NEXT
       session; a one-time prompt in an already-running session is accepted
       (→ *Scheduling Tools Never Prompt*). A PR-attached wait whose outcome
       `ci-notify.yml` actually reports needs no completion polling — webhook
       wake covers failure and success — but a wait expected to exceed five
       minutes still arms the heartbeat (→ *Status Line on Every Stop*).
       **"PR-attached" is not the test, and "installed" is not either** — see
       the exception in item 1 above: `ci-notify` fires only on
       `conclusion == 'success'` and only for workflows it watches by name, so
       a cancelled run and a dispatched PR-branch run can both end with nothing
       to wake on. Where the outcome you are waiting for produces no wake, the
       check-in is required, not optional.
     - Event wakes stay the primary signal; the heartbeat (→ *Status Line on
       Every Stop*) is the owner-visible liveness line carried by whatever wake
       already happens — never a replacement for event wakes, and never a
       reason to arm extra ones.
     - `create_trigger` / `update_trigger` / `fire_trigger` are pre-approved
       since 2026-08-18 (→ *Scheduling Tools Never Prompt*, whose accepted
       residuals record the persistence-vector trade-off). **Deployment tools**
       (`mcp__Supabase__deploy_edge_function`, and anything else pushing
       code/config to a live backend) stay prompt-gated, by owner decision
       (2026-07-12): never offer to add them to `permissions.allow`; reduce
       prompt fatigue by **batching deploys**, not by removing the gate.
     - **Projects bootstrapped before this template inherit nothing
       automatically.** The FIRST time a session hits a scheduling-tool prompt
       in an older repo, PR the current template's `permissions.allow` block
       (both spellings, all six scheduling tools) into that repo's own
       `.claude/settings.json` — no need to ask; it's the session's own repo and
       merges on green like every other change. Note in the PR that the
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
  Rules above, the surviving merge stops (`git.md` → *Conditional
  Auto-Merge on Green* — secrets or personal data in the diff; invented scope),
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
5. Do not subscribe to PR activity as a session-start step — opening a PR
   subscribes the session harness-side. `subscribe_pr_activity` is only for
   taking over a PR this session did not open (`git.md` → *PR Lifecycle*).

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

## Scheduling Tools Never Prompt (owner ruling, 2026-08-18)
Self-scheduling is how a session resumes after CI and re-arms check-ins — a
permission prompt the owner must click defeats the point. It is NOT how a
session heartbeats: a wake is scheduled to perform a real check, and the
heartbeat rides the wake that check already needed (→ *Status Line on Every
Stop*). Never schedule one for liveness alone. Every
project repo's committed `.claude/settings.json` carries the scheduling
allowlist verbatim from `templates/claude-settings.json` → `permissions.allow`:
exactly six tools (`send_later`, `create_trigger`, `update_trigger`,
`delete_trigger`, `fire_trigger`, `list_triggers`) under BOTH server-name
spellings, since the prefix differs between session surfaces and permission
rules match names exactly. Riskier remote tools — attaching repos, creating or
archiving sessions — must keep prompting. Settings load at session start; a
one-time prompt in an already-running session is accepted. The security
trade-offs the owner accepted when approving this are recorded in
`docs/internal/accepted-residuals.md`.

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
   settings, which takes effect in RUNNING sessions immediately — no new
   session needed. Diagnose with
   `curl -sS "$HTTPS_PROXY/__agentproxy/status"`.
6. **Sandbox browser (Playwright)** — launch with executablePath
   '/opt/pw-browsers/chromium'. Known gateway quirk: some hosts reset
   BROWSER-originated connections even when allowlisted —
   ERR_CONNECTION_RESET while curl succeeds means use curl for
   content, and for UI verification serve the project locally
   (`python3 -m http.server` + the project's demo mode) and screenshot that.
7. **The owner** — for pixel-level truth on browser-blocked third-party sites,
   ask for high-res screenshots and treat them as data: extract exact colors,
   typography, spacing, and interaction behavior from the image before
   implementing.

## One Session, One Repo (owner ruling, 2026-08-18)
A session works in exactly the repository it was opened for. Never attach,
clone, or write to another repository mid-session — not to "help", not because
a request seems to belong there. When a request targets a different repo —
including this directives repo — say which repo it belongs to and stop; the
owner takes it to that repo's own session (a paste-ready hand-off message is
welcome, per the Downstream-Finding Loop). A finding about an upstream file
names the **SHA it was verified at**, re-resolved from the upstream default
branch as the finding is written — never the SHA fetched earlier. Read the
file's header comments before reporting it. Read access is unchanged
(→ *Repository Scope*): the mandatory session-start directive fetches and
read-only inspection of public repos (`/do-repo`) stay open — and reading
never becomes an attach.
