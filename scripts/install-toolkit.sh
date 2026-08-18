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

# Best-effort wrapper for the operations that MAY fail without leaving the
# environment unusable: marketplace registration, refreshes, and every update.
# The three REQUIRED installs below are deliberately NOT wrapped — under `set -e`
# they abort with non-zero, which is the whole point of the header note above: a
# `curl | bash` caller must be able to tell that the toolkit never installed.
# Wrapping those was a regression; best-effort is for keeping a session alive,
# not for hiding a failed bootstrap. Two properties that are
# separable and were previously collapsed into one `|| true`: NEVER FATAL (a
# failed update must not block a session start) and NEVER SILENT (a masked
# failure leaves a stale pin while the script prints success). $1 is an
# output fragment meaning "expected, not a failure"; '' when none is expected.
soft() {
  pat="$1"; shift
  out=$("$@" 2>&1) && return 0
  if [ -n "$pat" ]; then
    case "$out" in *"$pat"*) return 0 ;; esac
  fi
  echo "WARN: '$*' failed — the toolkit may be stale:" >&2
  printf '%s\n' "$out" >&2
  return 0
}

# 1) Register the marketplaces the plugins come from (idempotent).
soft "" claude plugin marketplace add akyachtsman/claude.directives
soft "" claude plugin marketplace add anthropics/claude-plugins-official
soft "" claude plugin marketplace add anthropics/claude-code

# 2) Refresh every registered marketplace. `add` is a no-op once a marketplace is
# registered, so without this a cached environment keeps resolving against the clone
# it first fetched and step 4 finds nothing newer (verified 2026-08-05).
soft "" claude plugin marketplace update

# 3) Install the toolkit + the official review / security / design plugins.
claude plugin install directives-toolkit@claude-directives
claude plugin install pr-review-toolkit@claude-plugins-official
claude plugin install security-guidance@claude-plugins-official
# frontend-design: the design generator the new design.md relies on (per
# design.md / docs/guides/design-tooling.md). || true so a marketplace-name drift can't
# break the whole setup run.
soft "" claude plugin install frontend-design@claude-code-plugins   # optional
# plugin-dev: the authoring authority for this toolkit's own commands, agents and
# hooks (CLAUDE.md -> Toolkit changes). Registering a marketplace does NOT attach
# its plugins, so naming it as an authority without installing it left the
# requirement unmeetable in a clean environment.
# hookify is deliberately NOT installed -- see EXPORTS.json -> considered.
soft "" claude plugin install plugin-dev@claude-code-plugins        # optional

# 4) Move each plugin to its marketplace's current head. `install` is a NO-OP when
# the plugin is already present — it prints "already installed" and leaves the old
# sha pinned — so install alone can never deliver an update to an environment whose
# cache carries a previous install (verified 2026-08-05). `update` is what moves the
# pointer. Failures are reported by soft() rather than suppressed.
soft "" claude plugin update directives-toolkit@claude-directives
soft "" claude plugin update pr-review-toolkit@claude-plugins-official
soft "" claude plugin update security-guidance@claude-plugins-official
soft "" claude plugin update frontend-design@claude-code-plugins
soft "" claude plugin update plugin-dev@claude-code-plugins

# 5) Repeat at PROJECT scope. `--scope` defaults to `user` on install AND update
# (verified 2026-08-17 from `claude plugin update --help`), so steps 3-4 move the
# user pin only. A project-scope copy — which a repo carrying `enabledPlugins` in
# its own .claude/settings.json gets — stays pinned at whatever sha it first
# installed, and that stale copy is what the session resolves. This is why an
# environment could re-run a "self-updating" setup script and still serve a
# months-old toolkit. || true: most projects have no project-scope copy, and its
# absence must not fail the run.
soft "not installed at scope project" claude plugin update directives-toolkit@claude-directives --scope project
soft "not installed at scope project" claude plugin update pr-review-toolkit@claude-plugins-official --scope project
soft "not installed at scope project" claude plugin update security-guidance@claude-plugins-official --scope project
soft "not installed at scope project" claude plugin update frontend-design@claude-code-plugins --scope project
soft "not installed at scope project" claude plugin update plugin-dev@claude-code-plugins --scope project

echo "✓ directives toolkit + official review / security / design plugins installed and up to date"
