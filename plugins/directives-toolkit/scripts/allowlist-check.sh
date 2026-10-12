#!/usr/bin/env bash
# allowlist-check.sh — /env-chk's "Permission allowlist present?" probe. Run
# from the project root:  bash "${CLAUDE_PLUGIN_ROOT}/scripts/allowlist-check.sh"
#
# Compares the project's .claude/settings.json against EVERY permissions.allow
# entry the template carries, not one sentinel: a file holding create_trigger
# but not send_later (the primary pre-approved tool) used to read
# "pre-approved" (audit 2026-10-11, I-28). An entry counts when the project
# lists it under allow, ask or deny — a stricter local choice is still a choice,
# the same rule /refresh-repo Phase 3 applies (refresh-stamp.sh).
#
# The template is the local templates/claude-settings.json in claude.directives
# itself, and the raw upstream file at main everywhere else. Prints exactly one
# verdict line, then each missing entry:
#   pre-approved (N of N template entries)
#   PARTIAL — M of N template entries missing; those PROMPT on every call
#   MISSING — no .claude/settings.json: PROMPTS ON EVERY SCHEDULING CALL
#   CANNOT CHECK — <why>
# Always exits 0: it reports, it does not gate.
set -u
local_f=.claude/settings.json
if [ ! -f "$local_f" ]; then
  echo "MISSING — no $local_f: PROMPTS ON EVERY SCHEDULING CALL"; exit 0
fi
if [ -f templates/claude-settings.json ]; then
  tpl=$(cat templates/claude-settings.json)
else
  tpl=$(curl -fsSL --max-time 30 \
    https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/claude-settings.json 2>/dev/null) || tpl=
fi
if [ -z "$tpl" ] || ! jq -e '.permissions.allow | type == "array"' >/dev/null 2>&1 <<<"$tpl"; then
  echo "CANNOT CHECK — the template's permissions.allow could not be read; nothing compared"; exit 0
fi
if ! missing=$(jq -r --argjson t "$tpl" '
      . as $l
      | ($t.permissions.allow // [])[] as $e
      | select(any((($l.permissions.allow // []) + ($l.permissions.ask // []) + ($l.permissions.deny // []))[]; . == $e) | not)
      | $e' "$local_f" 2>/dev/null); then
  echo "CANNOT CHECK — $local_f is not readable JSON"; exit 0
fi
total=$(jq '.permissions.allow | length' <<<"$tpl")
if [ -z "$missing" ]; then
  echo "pre-approved ($total of $total template entries)"
else
  n=$(printf '%s\n' "$missing" | wc -l | tr -d ' ')
  echo "PARTIAL — $n of $total template entries missing; those PROMPT on every call"
  printf '  missing: %s\n' $missing
fi
exit 0
