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
set -u

# 1) Register both marketplaces the plugins come from (idempotent).
claude plugin marketplace add akyachtsman/claude.directives      || true
claude plugin marketplace add anthropics/claude-plugins-official || true

# 2) Install the toolkit + the official code-review and security plugins.
claude plugin install directives-toolkit@claude-directives
claude plugin install pr-review-toolkit@claude-plugins-official
claude plugin install security-guidance@claude-plugins-official

echo "✓ directives toolkit + official review/security plugins installed"
