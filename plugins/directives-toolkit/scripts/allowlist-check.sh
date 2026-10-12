#!/usr/bin/env bash
# allowlist-check.sh — /env-chk's "Permission allowlist present?" probe. Run
# from the project root:  bash "${CLAUDE_PLUGIN_ROOT}/scripts/allowlist-check.sh"
#
# Compares the project's .claude/settings.json against EVERY permissions.allow
# entry the template carries, not one sentinel: a file holding create_trigger
# but not send_later (the primary pre-approved tool) used to read
# "pre-approved" (audit 2026-10-11, I-28). An entry is pre-approved only when the
# project lists it under allow and under neither ask nor deny: Claude Code reads
# deny over ask over allow, so an ask entry still prompts and a deny entry is
# refused (Codex, #439). That is a legitimate local choice, and /refresh-repo
# Phase 3 accepts it as one (refresh-stamp.sh) — but it is not pre-approval,
# which is the one thing this probe reports, so it is named, never counted.
#
# The template is the local templates/claude-settings.json only in
# claude.directives itself, identified by its marketplace name; any other
# project fetches the raw upstream file at main, so a vendored or stale copy
# there cannot lower the count (Codex, #439). Prints exactly one verdict line,
# then each entry that is not pre-approved:
#   pre-approved (N of N template entries)
#   PARTIAL — M of N template entries not pre-approved; those PROMPT or are refused
#   MISSING — no .claude/settings.json: PROMPTS ON EVERY SCHEDULING CALL
#   CANNOT CHECK — <why>
# Always exits 0: it reports, it does not gate.
set -u
local_f=.claude/settings.json
if [ ! -f "$local_f" ]; then
  echo "MISSING — no $local_f: PROMPTS ON EVERY SCHEDULING CALL"; exit 0
fi
if [ -f templates/claude-settings.json ] \
   && [ "$(jq -r '.name // empty' .claude-plugin/marketplace.json 2>/dev/null)" = claude-directives ]; then
  tpl=$(cat templates/claude-settings.json)
else
  tpl=$(curl -fsSL --max-time 30 \
    https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/claude-settings.json 2>/dev/null) || tpl=
fi
if [ -z "$tpl" ] || ! jq -e '.permissions.allow | type == "array"' >/dev/null 2>&1 <<<"$tpl"; then
  echo "CANNOT CHECK — the template's permissions.allow could not be read; nothing compared"; exit 0
fi
# One line per template entry that is not pre-approved: "<disposition>\t<entry>",
# the disposition being what Claude Code would do with it. Rules are matched as
# Claude Code matches them (code.claude.com/docs/en/permissions, read
# 2026-10-12), not as exact strings (Codex, #439):
#   - deny, then ask, then allow; the first that matches decides;
#   - `mcp__<server>` names every tool of that server;
#   - a deny or ask rule may glob anywhere in the name (`*`, `mcp__*`), matched
#     against the full name;
#   - an allow glob counts only after a literal, glob-free `mcp__<server>__`
#     prefix (`mcp__github__get_*`); an unanchored one (`mcp__*`) approves nothing;
#   - an `mcp__` rule with parentheses is skipped when settings load.
if ! notok=$(jq -r --argjson t "$tpl" '
      def glob($r): "^" + ($r | gsub("(?<c>[.+?^${}()|\\[\\]\\\\])"; "\\\(.c)") | gsub("\\*"; ".*")) + "$";
      def server_rule($r): ($r | startswith("mcp__")) and ($r[5:] | (contains("__") or contains("*")) | not);
      def anchored($r): ($r | startswith("mcp__")) and ($r[5:] | index("__") as $i
                          | $i != null and $i > 0 and (.[:$i] | contains("*") | not));
      def hits($r; $e; $k):
        if ($r | type) != "string" or (($r | startswith("mcp__")) and ($r | contains("("))) then false
        elif $r == $e then true
        elif server_rule($r) then ($e | startswith($r + "__"))
        elif ($r | contains("*")) then
          (if $k == "allow" and (anchored($r) | not) then false else ($e | test(glob($r))) end)
        else false end;
      def has($k; $e): any((.permissions[$k] // [])[]; hits(.; $e; $k));
      . as $l
      | ($t.permissions.allow // [])[] as $e
      | (if ($l | has("deny"; $e)) then "denied"
         elif ($l | has("ask"; $e)) then "ask"
         elif ($l | has("allow"; $e)) then empty
         else "missing" end) as $why
      | "\($why)\t\($e)"' "$local_f" 2>/dev/null); then
  echo "CANNOT CHECK — $local_f is not readable JSON"; exit 0
fi
total=$(jq '.permissions.allow | length' <<<"$tpl")
if [ -z "$notok" ]; then
  echo "pre-approved ($total of $total template entries)"
else
  n=$(printf '%s\n' "$notok" | wc -l | tr -d ' ')
  echo "PARTIAL — $n of $total template entries not pre-approved; those PROMPT or are refused"
  printf '%s\n' "$notok" | while IFS=$'\t' read -r why e; do
    printf '  %s: %s\n' "$why" "$e"
  done
fi
exit 0
