#!/usr/bin/env bash
# refresh-hook-install.sh — /refresh-repo Phase 1.5 *Absent-hook install*:
# install .claude/hooks/session-start.sh when settings exist and the hook does
# not. Run from the project root:
#   bash "${CLAUDE_PLUGIN_ROOT}/scripts/refresh-hook-install.sh"
# Downloads to a temporary file and renames only after it validates: a truncated
# hook at the final path would pass the "already installed" test forever.
#
# Always prints exactly one line naming the hook state (pilots, 2026-10-13: a
# run that printed nothing could not be told from one that never ran):
#   INSTALLED / COULD-NOT-INSTALL -- the install ran;
#   OK: hook state: present, executable | present, NOT executable | not
#   applicable (no .claude/settings.json) -- nothing to install.
# Registration is not this file's question: the hook repair block runs
# session-start-registered.sh for that. Exit 1 only for COULD-NOT-INSTALL.
#
# The template comes from the SAME revision as the rest of the refresh
# (refresh-lib.sh -> refresh_pin), over git transport, never `main` by raw URL.
# shellcheck source=refresh-lib.sh
. "$(dirname -- "${BASH_SOURCE[0]}")/refresh-lib.sh" \
  || { echo "COULD-NOT-INSTALL: refresh-lib.sh not loadable — nothing written; report it"; exit 1; }
hook=.claude/hooks/session-start.sh
if [ ! -f .claude/settings.json ]; then
  echo "OK: hook state: not applicable (no .claude/settings.json, so nothing would run a hook) — nothing installed"
  exit 0
fi
if [ -f "$hook" ]; then
  if [ -x "$hook" ]; then
    echo "OK: hook state: $hook present, executable — nothing to install"
  else
    echo "OK: hook state: $hook present, NOT executable — nothing to install; the exec-bit repair above fixes it"
  fi
  exit 0
fi
mkdir -p .claude/hooks
# mktemp inside the DESTINATION dir: a bare `mktemp` lands in /tmp, and when
# /tmp is a different filesystem `mv` degrades from an atomic rename to a copy
# — reintroducing the partial-final-file this block exists to prevent.
tmp=$(mktemp .claude/hooks/.session-start.XXXXXX) || tmp=''
up=$(mktemp -d) || up=''
# chmod and mv are INSIDE the tested condition: without set -e a failing
# `&&` chain would still fall through to the success message.
if [ -n "$tmp" ] && [ -n "$up" ] && refresh_pin \
   && refresh_fetch "$up" "$pin" \
   && git -C "$up" cat-file blob "$pin:templates/claude-hooks/session-start.sh" >"$tmp" \
   && [ -s "$tmp" ] && bash -n "$tmp" \
   && chmod +x "$tmp" \
   && mv "$tmp" "$hook"; then
  echo "INSTALLED: $hook (was absent) from the template at $pin ($pin_from)"
  rc=0
else
  [ -n "$tmp" ] && rm -f "$tmp"
  echo "COULD-NOT-INSTALL: $hook — nothing written; report it"
  rc=1
fi
[ -n "$up" ] && rm -rf "$up"
exit "$rc"
