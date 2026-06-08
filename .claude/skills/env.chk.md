---
name: env.chk
description: Full environment readiness check — session context, git health, CI status, validation gates, and directive freshness
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

Output a compact checklist with a checkmark or X per item. End with a one-line
"ready / not ready" verdict and any actions needed before starting work.
