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

# 2) Install the toolkit + the official review / security / design plugins.
claude plugin install directives-toolkit@claude-directives
claude plugin install pr-review-toolkit@claude-plugins-official
claude plugin install security-guidance@claude-plugins-official
# frontend-design: the design generator the new design.md relies on (per
# design.md / docs/design-tooling.md). || true so a marketplace-name drift can't
# break the whole setup run.
claude plugin install frontend-design@claude-code-plugins || true

echo "✓ directives toolkit + official review / security / design plugins installed"
