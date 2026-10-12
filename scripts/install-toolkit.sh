#!/usr/bin/env bash
# install-toolkit.sh — install the claude.directives toolkit and the Anthropic-
# official review/security plugins into a Claude Code environment.
#
# Fetched and run from a Claude Code web environment's Setup script for the FIRST
# install (see NEW-REPO-USER-INSTRUCTIONS.md Step 0):
#
#   curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/scripts/install-toolkit.sh | bash
#
# and re-run on every web session by the SessionStart hook
# (.claude/hooks/session-start.sh), which is what moves an install to current.
# This file is the single source of truth for the install set — update the plugin
# list here and every project carrying that hook picks it up on its next session;
# one without the hook waits for its environment's next setup-script run.
# Re-runnable: the marketplace 'add' steps tolerate an already-registered marketplace.
#
# A FAILED REQUIRED INSTALL EXITS NON-ZERO — AT THE END, NOT WHERE IT HAPPENED.
# A `curl | bash` caller must be able to tell the environment has no toolkit, so
# the run still fails. But aborting at the failure (the old `set -e` on three bare
# installs) skipped everything after it: the hookify removal and every update,
# the toolkit's own included. One renamed official plugin then froze
# directives-toolkit at its old pin, on every session, fleet-wide — the hook
# warns but cannot recover (audit 2026-10-11, I-11). So req() records the
# failure, the run carries on, and the last lines exit 1.
set -u

# Machine-readable results where the CLI has them (2.1.296 does): an expected
# failure is matched on its `failureCode`, not on English prose a release can
# reword. The prose patterns stayed only as the fallback for a CLI without
# --json, and two of them had already drifted: `update --scope project` on a
# plugin installed at no scope says "is not installed", not "not installed at
# scope project", and an uninstall a project settings file blocks says "is
# enabled at project scope" (audit 2026-10-11, M-7). Probed once, from --help,
# so an older CLI is not handed a flag it would reject on every call.
JSON=
if claude plugin update --help 2>/dev/null | grep -q -- '--json'; then JSON=--json; fi
WARNED=
FAILED=

# Best-effort wrapper for the operations that MAY fail without leaving the
# environment unusable: marketplace registration, refreshes, the optional
# installs, the hookify removal and every update. Two properties that are
# separable and were once collapsed into one `|| true`: NEVER FATAL (a failed
# update must not block a session start) and NEVER SILENT (a masked failure
# leaves a stale pin while the script prints success — so it also sets WARNED,
# and the final line says the run was degraded).
#   $1  failureCodes meaning "expected, not a failure", space-separated; '' for none
#   $2  the prose fallback for a CLI without --json; '' for none
#   $@  the command (`--json` is appended only when $1 names a code)
soft() {
  codes="$1"; pat="$2"; shift 2
  if [ -n "$codes" ] && [ -n "$JSON" ]; then
    out=$("$@" "$JSON" 2>&1) && return 0
    code=$(printf '%s\n' "$out" | grep -o '"failureCode":"[a-z_]*"' | head -n 1 | cut -d'"' -f4)
    case " $codes " in *" ${code:-none} "*) return 0 ;; esac
  else
    out=$("$@" 2>&1) && return 0
    if [ -n "$pat" ]; then
      case "$out" in *"$pat"*) return 0 ;; esac
    fi
  fi
  WARNED=1
  echo "WARN: '$*' failed — the toolkit may be stale:" >&2
  printf '%s\n' "$out" >&2
  return 0
}

# The REQUIRED installs. A failure is recorded, reported now, and turned into a
# non-zero exit at the end — never swallowed, never an early abort.
req() {
  out=$("$@" 2>&1) && return 0
  FAILED=1
  echo "ERROR: '$*' failed — a required plugin is not installed:" >&2
  printf '%s\n' "$out" >&2
  return 0
}

# 1) Register the marketplaces the plugins come from (idempotent).
soft "" "" claude plugin marketplace add akyachtsman/claude.directives
soft "" "" claude plugin marketplace add anthropics/claude-plugins-official
soft "" "" claude plugin marketplace add anthropics/claude-code

# 2) Refresh every registered marketplace. `add` is a no-op once a marketplace is
# registered, so without this a cached environment keeps resolving against the clone
# it first fetched and step 4 finds nothing newer (verified 2026-08-05).
soft "" "" claude plugin marketplace update

# 3) Install the toolkit + the official review / security / design plugins.
req claude plugin install directives-toolkit@claude-directives
req claude plugin install pr-review-toolkit@claude-plugins-official
req claude plugin install security-guidance@claude-plugins-official
# frontend-design: the design generator design.md names (per
# docs/guides/design-tooling.md). Wrapped in soft() so a marketplace-name drift
# warns instead of breaking the whole setup run.
soft "" "" claude plugin install frontend-design@claude-code-plugins   # optional
# hookify is deliberately NOT installed -- see EXPORTS.json -> considered --
# and is actively REMOVED: dropping the install lines only stops NEW installs.
# Any environment that ran the previous installer still has it, and its hooks keep
# failing on every tool call forever. This runs on every web session via the
# SessionStart hook, so it heals the fleet without anyone touching an environment.
# Both scopes, because installs default to user while a project settings file can
# hold a second copy. `not_installed` ("not found in installed plugins") is the
# expected steady state. NOT expected, and so it warns: `enabled_at_project_scope`
# — a project whose .claude/settings.json still enables hookify (the template did
# before #222) blocks the uninstall, and hookify stays loaded. The CLI's own
# message names the per-user `disable --scope local`; the lasting fix is dropping
# hookify from that file's enabledPlugins, which /refresh-repo does.
soft "not_installed" "not found in installed plugins" claude plugin uninstall hookify@claude-code-plugins
soft "not_installed" "not found in installed plugins" claude plugin uninstall hookify@claude-code-plugins --scope project
# plugin-dev: the authoring authority for this toolkit's own commands, agents and
# hooks (CLAUDE.md -> Toolkit changes). Registering a marketplace does NOT attach
# its plugins, so naming it as an authority without installing it left the
# requirement unmeetable in a clean environment.
soft "" "" claude plugin install plugin-dev@claude-code-plugins        # optional

# 4) Move each plugin to its marketplace's current head. `install` is a NO-OP when
# the plugin is already present — it prints "already installed" and leaves the old
# sha pinned — so install alone can never deliver an update to an environment whose
# cache carries a previous install (verified 2026-08-05). `update` is what moves the
# pointer. Failures are reported by soft() rather than suppressed — except an
# OPTIONAL plugin that is not installed (`not_installed` / `not_found`), whose
# failed install step 3 already reported: repeating it here every session was
# noise, not signal.
# `--scope user` is explicit because `update` now defaults to `auto-detect`
# (`--help`, 2026-10-09): without it a repo holding a project-scope copy could have
# step 5 update that copy twice and leave the user copy stale. Observed on
# 2026-09-24: an explicit `--scope user` update moved pr-review-toolkit 6bfd4e0 -> e8e9ee7
# after this installer's unscoped run had already reported success.
soft "" "" claude plugin update directives-toolkit@claude-directives --scope user
soft "" "" claude plugin update pr-review-toolkit@claude-plugins-official --scope user
soft "" "" claude plugin update security-guidance@claude-plugins-official --scope user
soft "not_installed not_found" "" claude plugin update frontend-design@claude-code-plugins --scope user
soft "not_installed not_found" "" claude plugin update plugin-dev@claude-code-plugins --scope user

# 5) Repeat at PROJECT scope. `--scope` defaults to `user` on install; on update
# it read `user` on 2026-08-17 and `auto-detect` on 2026-09-24 (`--help` both
# times), so step 4 names `--scope user` and this step names `--scope project`
# rather than trusting auto-detect's undocumented pick. A project-scope copy — which a repo carrying `enabledPlugins` in
# its own .claude/settings.json gets — stays pinned at whatever sha it first
# installed, and that stale copy is what the session resolves. This is why an
# environment could re-run a "self-updating" setup script and still serve a
# months-old toolkit. soft() with the "not installed" pattern: most projects
# have no project-scope copy, and its absence must neither fail the run nor warn.
# Both codes: `not_installed_at_scope` when the plugin exists at another scope
# (observed, 2.1.296), `not_installed` when it is installed at none; the prose
# fallback is "not installed", which both messages contain.
NOPROJ="not_installed_at_scope not_installed not_found"
soft "$NOPROJ" "not installed" claude plugin update directives-toolkit@claude-directives --scope project
soft "$NOPROJ" "not installed" claude plugin update pr-review-toolkit@claude-plugins-official --scope project
soft "$NOPROJ" "not installed" claude plugin update security-guidance@claude-plugins-official --scope project
soft "$NOPROJ" "not installed" claude plugin update frontend-design@claude-code-plugins --scope project
soft "$NOPROJ" "not installed" claude plugin update plugin-dev@claude-code-plugins --scope project

# The last line says which of three outcomes this was — it used to print success
# after any number of WARNs.
if [ -n "$FAILED" ]; then
  echo "✗ a REQUIRED plugin failed to install (see ERROR above) — the remaining steps ran anyway" >&2
  exit 1
elif [ -n "$WARNED" ]; then
  echo "⚠ directives toolkit installed, but some steps failed (see WARN above) — it may be stale" >&2
else
  echo "✓ directives toolkit + official review / security / design plugins installed and up to date"
fi
