#!/usr/bin/env bash
# install-toolkit.sh — install the claude.directives toolkit and the Anthropic-
# official review/security plugins into a Claude Code environment.
#
# Intended to be fetched and run from a Claude Code web environment's Setup script
# (see NEW-REPO-USER-INSTRUCTIONS.md Step 0):
#
#   curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/scripts/install-toolkit.sh | bash
#
# This file is the single source of truth for the install set — update the plugin
# list here and every environment picks it up on its next setup-script run.
# Re-runnable: the marketplace 'add' steps tolerate an already-registered marketplace.
# set -e so a failed plugin install aborts the run with a non-zero status —
# otherwise the script prints the success line and `curl | bash` callers
# can't tell the environment has no toolkit.
set -eu

# 1) Register the marketplaces the plugins come from (idempotent).
claude plugin marketplace add akyachtsman/claude.directives      || true
claude plugin marketplace add anthropics/claude-plugins-official || true
claude plugin marketplace add anthropics/claude-code             || true

# 2) Refresh every registered marketplace. `add` is a no-op once a marketplace is
# registered, so without this a cached environment keeps resolving against the clone
# it first fetched and step 4 finds nothing newer (verified 2026-08-05).
claude plugin marketplace update || true

# 3) Install the toolkit + the official review / security / design plugins.
claude plugin install directives-toolkit@claude-directives
claude plugin install pr-review-toolkit@claude-plugins-official
claude plugin install security-guidance@claude-plugins-official
# frontend-design: the design generator the new design.md relies on (per
# design.md / docs/guides/design-tooling.md). || true so a marketplace-name drift can't
# break the whole setup run.
claude plugin install frontend-design@claude-code-plugins || true
# plugin-dev / hookify: the authoring authorities for this toolkit's own commands,
# agents and hooks (CLAUDE.md -> Toolkit changes). Registering a marketplace does
# NOT attach its plugins, so naming them as authorities without installing them
# left the requirement unmeetable in a clean environment.
claude plugin install plugin-dev@claude-code-plugins || true
claude plugin install hookify@claude-code-plugins    || true

# 4) Move each plugin to its marketplace's current head. `install` is a NO-OP when
# the plugin is already present — it prints "already installed" and leaves the old
# sha pinned — so install alone can never deliver an update to an environment whose
# cache carries a previous install (verified 2026-08-05). `update` is what moves the
# pointer. || true so an already-current plugin can't fail the setup run.
claude plugin update directives-toolkit@claude-directives      || true
claude plugin update pr-review-toolkit@claude-plugins-official || true
claude plugin update security-guidance@claude-plugins-official || true
claude plugin update frontend-design@claude-code-plugins       || true
claude plugin update plugin-dev@claude-code-plugins            || true
claude plugin update hookify@claude-code-plugins               || true

# 5) Repeat at PROJECT scope. `--scope` defaults to `user` on install AND update
# (verified 2026-08-17 from `claude plugin update --help`), so steps 3-4 move the
# user pin only. A project-scope copy — which a repo carrying `enabledPlugins` in
# its own .claude/settings.json gets — stays pinned at whatever sha it first
# installed, and that stale copy is what the session resolves. This is why an
# environment could re-run a "self-updating" setup script and still serve a
# months-old toolkit. || true: most projects have no project-scope copy, and its
# absence must not fail the run.
# A bare `|| true` here would swallow a REAL failure (permissions, marketplace,
# network) identically to the expected "no copy at this scope", leaving the stale
# project pin this phase exists to repair while the script still printed success.
# Only the expected case is silent; anything else warns and is visible to the
# SessionStart wrapper. Still never fatal — a failed update must not block a session.
update_project_scope() {
  out=$(claude plugin update "$1" --scope project 2>&1) && return 0
  case "$out" in
    *"not installed at scope project"*) return 0 ;;   # expected: no project copy
  esac
  echo "WARN: project-scope update failed for $1 — that pin may stay stale:" >&2
  printf '%s\n' "$out" >&2
  return 0
}

update_project_scope directives-toolkit@claude-directives
update_project_scope pr-review-toolkit@claude-plugins-official
update_project_scope security-guidance@claude-plugins-official
update_project_scope frontend-design@claude-code-plugins
update_project_scope plugin-dev@claude-code-plugins
update_project_scope hookify@claude-code-plugins

echo "✓ directives toolkit + official review / security / design plugins installed and up to date"
