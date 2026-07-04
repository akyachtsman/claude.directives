#!/usr/bin/env bash
# PreToolUse gate on Bash: deterministically block direct `git push` to main.
# The directives standard routes all main updates through PRs (squash-merge);
# a direct push to main from a session is always a policy violation.
#
# Fail-open by design: any parse problem exits 0 (allow) — this gate must
# never break unrelated Bash calls. Exit 2 = block, stderr fed to Claude.
#
# False-positive hardening (both found in production on day one):
#  - quoted strings are stripped before matching, so a commit MESSAGE
#    containing "push to main" cannot trigger the gate;
#  - `push` must be an actual git subcommand, so branch/file names that
#    merely contain "push" (e.g. claude/push-gate-quotes) cannot either.

in=$(cat) || exit 0

# Extract the Bash tool's command string (jq when available, sed fallback).
if command -v jq >/dev/null 2>&1; then
  cmd=$(printf '%s' "$in" | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0
else
  cmd=$(printf '%s' "$in" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
fi
[ -n "$cmd" ] || exit 0

# Strip quoted segments: message text must never influence the verdict.
# Single-WORD quoted tokens are unquoted first (so `push origin "main"` cannot
# hide the ref), then any remaining quoted runs — which contain spaces, i.e.
# message-like text — are removed entirely.
stripped=$(printf '%s' "$cmd" \
  | sed -E -e 's/"([^"[:space:]]*)"/\1/g' -e "s/'([^'[:space:]]*)'/\1/g" \
  | sed -e "s/'[^']*'//g" -e 's/"[^"]*"//g')

# `push` must appear as a git SUBCOMMAND (git [global-opts] push ...), at the
# start or after a shell separator — not as a substring of a name. An env-var
# prefix (`GIT_TRACE=1 git push ...`) must not defeat the anchor.
GIT_PUSH='(^|[;&|(][[:space:]]*|&&[[:space:]]*|\|\|[[:space:]]*)([A-Za-z_][A-Za-z_0-9]*=[^[:space:]]*[[:space:]]+)*git([[:space:]]+-[^[:space:]]+)*[[:space:]]+push([[:space:]]|$)'
printf '%s' "$stripped" | grep -qE "$GIT_PUSH" || exit 0

# Isolate every push subcommand segment — a compound command can carry more
# than one push, and each must pass the gate.
pushparts=$(printf '%s' "$stripped" | grep -oE 'git([[:space:]]+-[^[:space:]]+)*[[:space:]]+push[^|;&]*')

# Any push that names main/master as a target ref (standalone word or after /).
if printf '%s\n' "$pushparts" | grep -qE '([[:space:]:/])(main|master)([[:space:]]|$)'; then
  echo 'BLOCKED by directives push-gate: direct push to main is never allowed — all main updates go through a claude/<name> branch and a PR (squash-merge on green CI). Push to your feature branch instead.' >&2
  exit 2
fi

# Any bare `git push` (no ref argument) while checked out on main -> block.
if printf '%s\n' "$pushparts" | grep -qvE 'push[[:space:]]+[^-[:space:]]'; then
  branch=$(git branch --show-current 2>/dev/null)
  if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
    echo 'BLOCKED by directives push-gate: you are on main and this would push it directly. Work on a claude/<name> branch and open a PR.' >&2
    exit 2
  fi
fi

exit 0
