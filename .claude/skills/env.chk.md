---
name: env.chk
description: Full environment readiness check — session context, git health, CI status, validation gates, directive freshness, a connectors/tools inventory, and the scope.chk repo-scope verification
trigger: slash_command_and_auto
---
Run a comprehensive environment readiness check and report a single pass/fail
verdict. Read-only — do NOT modify files. Execute in order:

1. Context — Read session-handoff.md (or the repo's handoff/README) and
   summarize current project state.
2. Branch and git health — Report the current branch (compare against the
   branch policy in CLAUDE.md if defined) and flag any uncommitted changes or
   merge conflicts against the default branch.
3. CI monitor status — Check for any open CI-failure or reviewer-flagged
   tracking issues/PRs and list them. Also flag any open issues tagged @claude
   with no linked PR yet.
4. Validation gates — Detect and run the repo's configured validation
   commands (from CLAUDE.md "Required Commands" or equivalent: tests, lint,
   syntax/schema checks) and report results.
5. Infra monitors — Confirm any monitoring workflows declared in the repo's
   automation spec exist on the default branch.
6. Directive freshness — Read CLAUDE.md and extract every imported directive
   URL. For each: check reachability (404?), coverage (any upstream files not
   imported?), and content drift (compare against .claude/directive-sync.json
   snapshot — if no snapshot exists, establish one now and report "baseline
   recorded"). Flag cross-repo contradictions.
7. Connectors & tools — Inventory the session's actual capabilities. Discover
   values LIVE from this session (do not hardcode). For the repo-scope limit,
   **run the `scope.chk` verification** — confirm via ToolSearch whether the
   `add_repo` / `list_repos` tools (claude-code-remote) actually exist, and report
   the session's true actionable repo scope rather than assuming. Verify any other
   uncertain tool (e.g. `send_later`) the same way. This is the always-run home of
   the scope check for sessions whose Session Start invokes `env.chk`; `scope.chk`
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
