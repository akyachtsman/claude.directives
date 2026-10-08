---
description: "Session readiness — git health, CI status, validation gates, directive freshness, skill shadowing, tool inventory, and repo-scope verification."
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
   `send_later`/`ScheduleWakeup`/event-wakeups, never a backgrounded `sleep`; see
   `global.md` → *Async Operations*).
3. CI & deploy status — Check for any open CI-failure or reviewer-flagged
   tracking issues/PRs and list them (a broken deploy surfaces here as a
   `pages-deploy-failure` issue). Run the `directives/git.md` repo-settings
   preflight (`git.md` → *Repo-settings preflight (warn once per session)*) —
   all THREE settings: if "Allow auto-merge" or "Automatically delete head
   branches" is off (`allow_auto_merge` / `delete_branch_on_merge` from
   `gh api repos/{owner}/{repo}`, or the documented MCP-rejection signal), or
   "Require conversation resolution before merging" is off (the `pull_request`
   rule's `required_review_thread_resolution` in
   `gh api repos/{owner}/{repo}/rules/branches/<default branch>`), warn once with
   the exact settings path — don't block, don't re-nag this session. A setting
   whose read is refused is reported as NOT READ, never as on or off. Also flag any open issues tagged @claude
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
   claude.directives `main`. Get that HEAD with
   `git ls-remote https://github.com/akyachtsman/claude.directives.git refs/heads/main`
   — git transport, so it needs no auth, no MCP and no quota, and works from a
   session scoped to any repo. Do **not** depend on `api.github.com`: the proxy
   refuses it — and so `gh api`, curl and WebFetch alike — for any repository the
   session was not opened on, which from a downstream project includes
   claude.directives (verified 2026-10-08: 403, "GitHub access to this
   repository is not enabled for this session"), and the GitHub MCP is scoped to
   the session's own repo and compares no two refs.
   If the stamp differs, or none exists, report a ⚠️ finding.
   Then classify the delta by top-level path and state the action per
   EXPORTS.json delivery mode. Only in a session scoped to claude.directives,
   where the objects are local: `git fetch origin main`, then
   `git diff --name-only <stamp-sha>..<live-sha> | cut -d/ -f1 | sort -u` against
   the SHA `ls-remote` returned — never `origin/main`, which `ls-remote` does not
   update, so a lagging ref under-reports the delta — behind the
   `git cat-file -e` guard and the one bounded deepen, exactly as `/refresh-repo`
   Phase 2 states them (that is their single home, with the reasons). Anywhere
   else, or when the object is still missing, report the SHA delta
   **uncategorised and say classification was unavailable**, pointing at
   `MAINTAIN-REPO-USER-INSTRUCTIONS.md` → *Propagation Matrix*. Never clone the
   repo or walk the delta commit by commit to classify — the alarm is a
   diagnostic and must cost less than what it warns about.
   - `directives/` → no action; rules are fetched live (re-read them now if mid-session)
   - `templates/` → installed copies may be stale → run `/refresh-repo`
   - `plugins/` → installed toolkit is behind; `/refresh-repo` can't fix it.
     Whether the project self-heals depends on the hook being RUNNABLE, not
     merely present: on the web, executable, and registered in the
     `SessionStart` array. `/refresh-repo` Phase 1.5 (*Hook repair*) is the
     single home of those checks, their repair and the reasons; here, only
     report:
     ```bash
     [ "${CLAUDE_CODE_REMOTE:-}" = true ] \
       && [ -x .claude/hooks/session-start.sh ] \
       && jq -e '[.hooks.SessionStart[]?.hooks[]?.command] 
            | any((gsub("\"";"") | split(" ")[0] | endswith("hooks/session-start.sh")))' \
       .claude/settings.json >/dev/null 2>&1 \
       && echo "self-updating" || echo "needs remediation"
     ```
     On CLI/desktop the first condition is false by design — the hook exits early
     off the web (`global.md` → *Skill Bootstrap* keeps local installs manual): tell
     a local session to run `scripts/install-toolkit.sh` itself. Self-updating →
     say so and prescribe nothing. Otherwise → name which condition failed (absent,
     unregistered or non-executable), offer `/refresh-repo` to install or repair
     the hook, or force the env cache rebuild (see
     `NEW-REPO-USER-INSTRUCTIONS.md` → *Step 0 — One-time: turn the toolkit on (you may already be done)*,
     "Force a toolkit update") or wait for the ~weekly expiry.
   - `docs/` only → informational
   Exception: if upstream.sha trails HEAD by exactly the commit(s) that recorded the
   stamp/baselines themselves, report current, not behind. Nothing else refreshes
   a project's installed `templates/` copies, and the toolkit updates itself only
   where the `SessionStart` hook is runnable (the `plugins/` item above) — the
   environment's setup script performs only the FIRST install — so without this
   alarm a project can run indefinitely on stale scaffolding or a stale toolkit.

   **Permission allowlist present?** — on EVERY run, whatever the staleness
   alarm found: it is not a delta item, and a project whose stamp is current
   can lack it just as well. Report it, because nothing else will.
   ```bash
   jq -e '.permissions.allow | index("mcp__Claude_Code_Remote__create_trigger")' \
     .claude/settings.json >/dev/null 2>&1 \
     && echo "pre-approved" || echo "PROMPTS ON EVERY SCHEDULING CALL"
   ```
   This check exists because the rule it enforces went unfollowed for a month
   with no signal. `global.md` → *Async Operations* tells a session to PR the
   allowlist in the FIRST time it hits a scheduling prompt — but a session
   never observes that prompt. The owner clicks it, silently, in a different
   window, forever; claude.insurance reached four-figure click counts that way
   while its sibling repos were fine. The failure is invisible to the only
   party who can fix it, so it must be reported unprompted rather than waited
   for. Note the two distinct states: the file MISSING pre-approves nothing at
   all, while a file present with a stale or partial `permissions` block
   pre-approves only what it lists. Missing is the more common and the more
   expensive. Remediation either way is one small PR carrying the current
   `templates/claude-settings.json` → `permissions` block verbatim; say plainly
   that it takes effect from the NEXT session, never this one, so the owner is
   not surprised to keep clicking today.
7. Skill shadowing — Personal skills (`~/.claude/skills/`, synced from the
   user's Claude account) sit outside every repo, so `/audit-repo` and every
   other repo-scoped check are blind to them while they shadow toolkit commands
   by name. List that directory and compare against the installed toolkit's
   commands and skills. For each collision report both line counts and, where
   the personal copy contradicts a current directive rule, name the rule — a
   handoff skill saying "summarize everything" contradicts `global.md` → *Handoffs Carry Only What Dies With the Session*. Removing them is the
   owner's action in their Claude account; no repo PR can, so report and stop.
   No personal skills directory, or no collisions, is a pass.
8. Connectors & tools — Inventory the session's actual capabilities. Discover
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
   - <key access limit, e.g. no send_later / `gh api` only / no browser>

Output a compact checklist with a checkmark or X per item for steps 1–7. End
with a one-line "ready / not ready" verdict and any actions needed before
starting work, then append the step-8 connectors/tools inventory below the
verdict (reference info, not pass/fail).

The message still ends with the status line: `global.md` → *Status Line on Every Stop*.
