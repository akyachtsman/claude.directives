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
   `ScheduleWakeup`/event-wakeups, never a backgrounded `sleep`; see global.md →
   Async Operations).
3. CI & deploy status — Check for any open CI-failure or reviewer-flagged
   tracking issues/PRs and list them (a broken deploy surfaces here as a
   `pages-deploy-failure` issue). Run the `directives/git.md` repo-settings
   preflight: if "Allow auto-merge" or "Automatically delete head branches"
   is off (`allow_auto_merge` / `delete_branch_on_merge` via the repo API, or
   the documented MCP-rejection signal), warn once with the exact settings
   path — don't block, don't re-nag this session. Also flag any open issues tagged @claude
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
   session scoped to any repo. Do **not** call `api.github.com`: it is refused at
   the proxy, and the GitHub MCP is scoped to the session's own repo, so in every
   downstream project — which is most sessions — the API route fails outright.
   If the stamp differs, or none exists, report a ⚠️ finding.
   Then classify the delta by top-level path and state the action per
   EXPORTS.json delivery mode. Classification needs the diff, which `ls-remote`
   cannot give — and **no GitHub MCP call compares two refs** (the surface is
   `list_commits` / `get_commit` / `search_commits` / `list_branches`; walking the
   delta commit-by-commit is exactly the burn `git.md` → *Quota Economy* forbids).
   In a session scoped to claude.directives the objects are already local, so
   classify with plain git and no API at all. Keep the SHA `ls-remote` returned
   and diff against **that**, after `git fetch origin main` to make the object
   available: `ls-remote` does not update remote-tracking refs, so `origin/main`
   is only as fresh as this session's last fetch, and classifying against a
   lagging ref silently under-reports the delta whose SHA the alarm just
   reported — dropping `plugins/` turns "toolkit is behind" into "docs only,
   informational". Then, guarded by `git cat-file -e <sha>^{commit}` for both
   ends: `git diff --name-only <stamp-sha>..<live-sha> | cut -d/ -f1 | sort -u`.
   The guard matters because these clones are frequently shallow — a commit
   outside the fetch depth makes `git diff` fail outright rather than degrade.
   One bounded `git fetch --deepen 100` is worth trying; bare `--deepen` exits
   129 because it requires a value. Then stop and take the uncategorised path. Anywhere else, or when the object is still missing, report the SHA
   delta **uncategorised and say classification was unavailable**, pointing at
   MAINTAIN-REPO-USER-INSTRUCTIONS.md → Propagation Matrix. Never clone the repo
   to classify — the alarm is a diagnostic and must cost less than what it warns
   about. Degrading loudly is correct; inheriting a blocked or nonexistent call
   one line after the SHA fetch is not.
   - `directives/` → no action; rules are fetched live (re-read them now if mid-session)
   - `templates/` → installed copies may be stale → run `/refresh-repo`
   - `plugins/` → installed toolkit is behind; `/refresh-repo` can't fix it.
     Whether the project self-heals depends on the hook being RUNNABLE, which
     existence alone does not establish — an unregistered or non-executable
     script never runs, and a content-only integrity diff sees nothing wrong with
     either. Require all three:
     ```bash
     [ -x .claude/hooks/session-start.sh ] \
       && grep -q 'session-start.sh' .claude/settings.json \
       && grep -q '"SessionStart"' .claude/settings.json \
       && echo "self-updating" || echo "needs remediation"
     ```
     Self-updating → the next session picks the toolkit up on its own; say so and
     prescribe nothing. Otherwise → force the env cache rebuild (see
     NEW-REPO-USER-INSTRUCTIONS.md → "Force a toolkit update") or wait for the
     ~weekly expiry, and offer `/refresh-repo` to install or repair the hook so
     the manual step stops recurring. Name which of the three failed: a present
     but unregistered or non-executable hook is the trap — it looks installed and
     never runs.
   - `docs/` only → informational
   Exception: if upstream.sha trails HEAD by exactly the commit(s) that recorded the
   stamp/baselines themselves, report current, not behind. Session Start
   bootstrap skips existing files, so without this alarm a project can run
   indefinitely on stale skills/agents.
7. Skill shadowing — Personal skills (`~/.claude/skills/`, synced from the
   user's Claude account) sit outside every repo, so `/audit-repo` and every
   other repo-scoped check are blind to them while they shadow toolkit commands
   by name. List that directory and compare against the installed toolkit's
   commands and skills. For each collision report both line counts and, where
   the personal copy contradicts a current directive rule, name the rule — a
   handoff skill saying "summarize everything" contradicts `global.md` →
   *Handoffs Carry Only What Dies With the Session*. Removing them is the
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
   - <key access limit, e.g. no send_later / no gh / no browser>

Output a compact checklist with a checkmark or X per item for steps 1–7. End
with a one-line "ready / not ready" verdict and any actions needed before
starting work, then append the step-8 connectors/tools inventory below the
verdict (reference info, not pass/fail).
