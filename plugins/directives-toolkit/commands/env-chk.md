---
description: "Full environment readiness check — session context, git health, CI status, validation gates, directive freshness, a connectors/tools inventory, and the scope-chk repo-scope verification"
phase: cross-cutting
---
Run a comprehensive environment readiness check and report a single pass/fail
verdict. Read-only — do NOT modify files. Execute in order:

1. Context — Read `CLAUDE.md` (and the repo's README) and summarize current
   project state.
2. Branch and git health — Report the current branch (compare against the
   branch policy in CLAUDE.md if defined) and flag any uncommitted changes or
   merge conflicts against the default branch. Also sweep for **orphaned
   background tasks**: on a resumed/long session a backgrounded `sleep` poll can
   linger as a phantom "running" task after its process was reaped — flag any
   `sleep`/poll process with no live backing (and remind that future waits use
   `ScheduleWakeup`/event-wakeups, never a backgrounded `sleep`; see global.md →
   Async Operations).
3. CI & deploy status — Check for any open CI-failure or reviewer-flagged
   tracking issues/PRs and list them (a broken deploy surfaces here as a
   `pages-deploy-failure` issue). Also flag any open issues tagged @claude
   with no linked PR yet. For a deploy-backed project (e.g. Pages), confirm the
   live site is serving the latest commit: match the deploy run's `head_sha` to
   the head of the Pages source branch (`git rev-parse origin/main` — NOT the
   session's `HEAD`, which false-flags "stale" on a feature branch), and report
   the live URL + last deploy time. Verify by
   `head_sha` + `conclusion` — a live-URL 200 only where the session's network
   policy allows that host (per the `update-pages` caveat).
4. Validation gates — Detect and run the repo's configured validation
   commands (from CLAUDE.md "Required Commands" or equivalent: tests, lint,
   syntax/schema checks) and report results.
5. Infra monitors — Confirm any monitoring workflows declared in the repo's
   automation spec exist on the default branch.
6. Directive freshness — Read CLAUDE.md and extract every imported directive
   URL. For each: check reachability (404?), coverage (any upstream files not
   imported?), and content drift (compare against .claude/directive-sync.json
   snapshot — if no snapshot exists, do NOT create one; report "no baseline"
   as a finding and suggest recording one as an explicit follow-up task, so
   this check stays read-only). Flag cross-repo contradictions.
   **Staleness alarm (multi-project critical):** compare the sync stamp
   `.upstream.sha` in .claude/directive-sync.json against the live HEAD of
   claude.directives `main` (one API call:
   `repos/akyachtsman/claude.directives/commits/main`). If they differ — or no
   stamp exists — report a ⚠️ finding. Make it category-aware: classify the
   delta's changed paths (one compare call) and state the action per
   EXPORTS.json delivery mode:
   - `directives/` → no action; rules are fetched live (re-read them now if mid-session)
   - `templates/` → installed copies may be stale → run `/refresh-repo`
   - `plugins/` → installed toolkit is behind; `/refresh-repo` can't fix it —
     force the env cache rebuild (see NEW-REPO-USER-INSTRUCTIONS.md → "Force a
     toolkit update") or wait for the ~weekly expiry
   - `docs/` only → informational
   Exception: if upstream.sha trails HEAD by exactly the commit(s) that recorded the
   stamp/baselines themselves, report current, not behind. Session Start
   bootstrap skips existing files, so without this alarm a project can run
   indefinitely on stale skills/agents.
7. Connectors & tools — Inventory the session's actual capabilities. Discover
   values LIVE from this session (do not hardcode). For the repo-scope limit,
   **run the `scope-chk` verification** — confirm via ToolSearch whether the
   `add_repo` / `list_repos` tools (claude-code-remote) actually exist, and report
   the session's true actionable repo scope rather than assuming. Verify any other
   uncertain tool (e.g. `send_later`) the same way. This is the always-run home of
   the scope check for sessions whose Session Start invokes `/env-chk`; `scope-chk`
   remains available standalone for mid-session drift. Report in exactly this layout:

   ## Connectors (MCP servers)
   - **<Name>** — <one-line scope/role>

   ## Built-in tools
   `Tool` · `Tool` · …

   ## Deferred (via ToolSearch)
   `Tool` · `Tool` · …

   ## Sub-agents (via Agent)
   `agent` · `agent` · …

   ## Limits
   - <key access limit, e.g. GitHub single-repo scope>
   - <key access limit, e.g. no send_later / no gh / no browser>

Output a compact checklist with a checkmark or X per item for steps 1–6. End
with a one-line "ready / not ready" verdict and any actions needed before
starting work, then append the step-7 connectors/tools inventory below the
verdict (reference info, not pass/fail).
