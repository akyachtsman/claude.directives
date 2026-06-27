#!/usr/bin/env bash
# PreToolUse gate on Bash: block a *backgrounded* `sleep` used as a waiter.
#
# Why: backgrounding a bare `sleep` to wait out CI / a rate limit / a deploy
# (e.g. `sleep 120; echo done` with run_in_background) is the single worst
# async pattern in a long-lived session. When the container suspends and
# resumes, the sleep process is reaped but the harness keeps showing it as a
# **phantom "running" task** that never clears — and it was watching nothing.
# The sanctioned alternatives wake the session on the real event (PR/CI
# webhooks) or self-pace with ScheduleWakeup; see global.md -> Async Operations.
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
#  - only when N >= 15s, so a brief backgrounded pause is left alone;
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

# Strip quoted segments: message text must never influence the verdict.
stripped=$(printf '%s' "$cmd" | sed -e "s/'[^']*'//g" -e 's/"[^"]*"//g')
# Trim leading whitespace and an optional leading no-op (`:;` / `true &&`).
trimmed=$(printf '%s' "$stripped" | sed -E 's/^[[:space:]]*(:|true)[[:space:]]*(;|&&)?[[:space:]]*//; s/^[[:space:]]*//')

# Must LEAD with `sleep <N>` to count as a pure waiter.
case "$trimmed" in
  sleep[[:space:]]*) ;;
  *) exit 0 ;;
esac
dur=$(printf '%s' "$trimmed" | grep -oE '^sleep[[:space:]]+[0-9]+' | grep -oE '[0-9]+' | head -1)
[ -n "$dur" ] || exit 0
[ "$dur" -ge 15 ] 2>/dev/null || exit 0

echo 'BLOCKED by directives wait-gate: do not background a `sleep` to wait. A backgrounded sleep orphans into a phantom "running" task when the session suspends/resumes, and it watches nothing. Instead: (1) for CI / PR / deploy outcomes, let the event wake the session (PR + CI webhooks) or just re-check on your next turn; (2) to self-pace a re-check, use ScheduleWakeup (sanctioned here — `send_later` is usually unavailable); (3) for a genuine condition-wait, use Monitor with an exit condition. See global.md -> Async Operations.' >&2
exit 2
