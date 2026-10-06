#!/usr/bin/env bash
# PreToolUse gate on Bash: block a *backgrounded* `sleep` used as a waiter.
#
# Why: backgrounding a bare `sleep` to wait out CI / a rate limit / a deploy
# (e.g. `sleep 120; echo done` with run_in_background) is the single worst
# async pattern in a long-lived session. When the container suspends and
# resumes, the sleep process is reaped but the harness keeps showing it as a
# **phantom "running" task** that never clears — and it was watching nothing.
# The sanctioned alternative wakes the session on the real event (PR/CI
# webhooks) AND arms a check-in alongside it with send_later (or ScheduleWakeup
# where a session has that instead) — not one or the other: any run can be
# cancelled and a cancelled run emits no PR wake, so an in-flight CI wait needs
# both. See global.md -> Async Operations.
#
# Fail-open by design: any parse problem exits 0 (allow) — this gate must never
# break unrelated Bash calls. Exit 2 = block, stderr fed to Claude.
#
# Scope (kept tight to avoid false positives):
#  - only fires when the call is run_in_background = true (a foreground long
#    sleep is already blocked by the harness; short warm-up sleeps like the
#    `sleep 2` after starting a local server are foreground and untouched);
#  - only when the command *leads* with `sleep N` (the pure-waiter shape), so a
#    real backgrounded job — a build, test run, or watcher — is never caught;
#  - only when the total duration is >= 15s (suffixes and multiple
#    arguments summed, as coreutils does), so a brief pause is left alone;
#  - quoted strings are stripped first, so a message containing "sleep 100"
#    cannot trigger it.

in=$(cat) || exit 0

# Extract command + run_in_background flag (jq when available, sed/grep fallback).
if command -v jq >/dev/null 2>&1; then
  cmd=$(printf '%s' "$in" | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0
  bg=$(printf '%s' "$in" | jq -r '.tool_input.run_in_background // false' 2>/dev/null) || exit 0
else
  cmd=$(printf '%s' "$in" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
  if printf '%s' "$in" | grep -qE '"run_in_background"[[:space:]]*:[[:space:]]*true'; then bg=true; else bg=false; fi
fi
[ "$bg" = "true" ] || exit 0
[ -n "$cmd" ] || exit 0

# Strip quoted segments: message text must never influence the verdict. A
# single-WORD quoted token is unquoted first, so `sleep "30"` reads as the
# 30-second sleep it is rather than as a sleep with no operand.
stripped=$(printf '%s' "$cmd" \
  | sed -E -e 's/"([^"[:space:]]*)"/\1/g' -e "s/'([^'[:space:]]*)'/\1/g" \
  | sed -e "s/'[^']*'//g" -e 's/"[^"]*"//g')
# Trim leading whitespace and an optional leading no-op (`:;` / `true &&`).
trimmed=$(printf '%s' "$stripped" | sed -E 's/^[[:space:]]*(:|true)[[:space:]]*(;|&&)?[[:space:]]*//; s/^[[:space:]]*//')

# Must LEAD with `sleep <N>` to count as a pure waiter.
case "$trimmed" in
  sleep[[:space:]]*) ;;
  *) exit 0 ;;
esac
# Total the sleep's OWN operands the way GNU sleep does: each is a strtod
# float (`.5`, `+.5`, `1e-1`, `2E1`) with an optional s/m/h/d suffix,
# `inf`/`infinity` is forever, and several are summed. Reading only the leading
# digits let `sleep 5m`, `sleep 2h` and `sleep 10 10` through as 5, 2 and 10
# seconds (audit, 2026-10-06).
#
# STOP AT THE UNKNOWN (owner ruling, 2026-10-06). Operands are read while they
# look like durations, and the first word that does not -- a comment, a
# redirection, a separator, anything -- ENDS the reading; it never blocks. Three
# Codex rounds on #396 each found shell syntax around a short sleep (`1e-1`,
# `>/dev/null`, `+.5`, `# note`, a `\` continuation) that a fail-closed parser
# refused, and the shell's syntax is not an enumerable list. This keeps the
# header's fail-open contract: only a literal total >= 15s blocks, plus the one
# fail-closed case the gate has always had -- a FIRST operand that is not a
# literal at all (`$DELAY`, `$((60*5))`, a backtick), which is still a waiter.
# Backslash-newlines are joined first (bash reads one command), shell
# metacharacters are split into their own words, and a redirection's fd number
# (`2>`) goes with it.
secs=$(printf '%s' "$trimmed" | awk '
  BEGIN { RS = "\001" }
  { gsub(/\\\n/, " ")
    line = $0; sub(/\n.*/, "", line)
    gsub(/[0-9]*&?[<>]/, " > ", line)
    gsub(/[;&|()]/, " & ", line)
    n = split(line, w, /[ \t]+/)
    for (i = 2; i <= n; i++) {
      a = w[i]
      if (a == "") continue
      if (a ~ /[$`]/) { if (!seen) nonliteral = 1; break }
      u = ""
      if (a ~ /[smhd]$/) { u = substr(a, length(a)); a = substr(a, 1, length(a) - 1) }
      sub(/^\+/, "", a)
      if (tolower(a) ~ /^inf(inity)?$/) { forever = 1; seen = 1; continue }
      if (a !~ /^([0-9]+\.?[0-9]*|\.[0-9]+)([eE][-+]?[0-9]+)?$/) break
      m = (u == "m") ? 60 : (u == "h") ? 3600 : (u == "d") ? 86400 : 1
      t += (a + 0) * m; seen = 1
    }
  }
  END { if (nonliteral) print "X"; else if (forever) print 1e18; else print t + 0 }')
if [ "$secs" != "X" ]; then
  awk -v s="$secs" 'BEGIN { exit !(s >= 15) }' || exit 0
fi

echo 'BLOCKED by directives wait-gate: do not background a `sleep` to wait. A backgrounded sleep orphans into a phantom "running" task when the session suspends/resumes, and it watches nothing. Instead: (1) for CI / PR / deploy outcomes, let the event wake the session (PR + CI webhooks) — and ARM A CHECK-IN ALONGSIDE IT, not instead of it: any run can be cancelled and a cancelled run emits no PR wake, so essentially every in-flight CI wait needs both, and you drop the check-in when THAT outcome is terminal; (2) that check-in is `send_later` (the pre-approved primary) or `ScheduleWakeup` where a session has that instead — verify which exists rather than assuming; (3) for a genuine condition-wait, use Monitor with an exit condition. See global.md -> Async Operations.' >&2
exit 2
