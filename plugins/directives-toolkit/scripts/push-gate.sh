#!/usr/bin/env bash
# PreToolUse gate on Bash: deterministically block direct `git push` to main.
# The directives standard routes all main updates through PRs (squash-merge);
# a direct push to main from a session is always a policy violation.
#
# Fail-open by design: any parse problem exits 0 (allow) — this gate must
# never break unrelated Bash calls. Exit 2 = block, stderr fed to Claude.

in=$(cat) || exit 0

# Extract the Bash tool's command string (jq when available, sed fallback).
if command -v jq >/dev/null 2>&1; then
  cmd=$(printf '%s' "$in" | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0
else
  cmd=$(printf '%s' "$in" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
fi
[ -n "$cmd" ] || exit 0

# Not a push at all -> allow.
printf '%s' "$cmd" | grep -qE '\bgit\b[^|;&]*\bpush\b' || exit 0

# Push that names main/master as the target ref -> block.
if printf '%s' "$cmd" | grep -qE '\bpush\b[^|;&]*\b(main|master)\b'; then
  echo 'BLOCKED by directives push-gate: direct push to main is never allowed — all main updates go through a claude/<name> branch and a PR (squash-merge on green CI). Push to your feature branch instead.' >&2
  exit 2
fi

# Bare `git push` while checked out on main -> block.
target=$(printf '%s' "$cmd" | grep -oE '\bpush\b.*' )
if ! printf '%s' "$target" | grep -qE '\bpush\b[[:space:]]+[^-]' ; then
  branch=$(git branch --show-current 2>/dev/null)
  if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
    echo 'BLOCKED by directives push-gate: you are on main and this would push it directly. Work on a claude/<name> branch and open a PR.' >&2
    exit 2
  fi
fi

exit 0
