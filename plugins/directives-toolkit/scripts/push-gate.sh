#!/usr/bin/env bash
# PreToolUse gate on Bash: catch a direct `git push` to main before it is run.
#
# THIS IS NOT A SECURITY BOUNDARY, and must never be described as one.
# It is a fast LOCAL speed bump for two specific shapes: a push that names main or
# master as a literal ref, and a BARE push (no refspec) made while sitting on main.
# Those two it catches. Nothing beyond them is a guarantee — `git push origin HEAD`
# from a main checkout, for one, supplies a positional the ref test accepts and
# names no literal main, so this hook allows it. That is not a bug to file; it is
# the point of the paragraph below.
#
# THE REAL CONTROL IS GITHUB BRANCH PROTECTION (owner ruling, 2026-08-22; #257).
# A ruleset on the default branch requires a pull request server-side, so no
# shell form evades it and it binds every actor, not only a session running this
# hook. A direct write to main returns `409 Repository rule violations found —
# Changes must be made through a pull request`. Note that this error does NOT
# identify which rule refused: classic branch protection emits the same text, and
# on this repo it did — the 409 was reproduced on 2026-08-22 while no ruleset
# existed. Confirm the mechanism on the settings page, never from the error.
# Set the ruleset up in any repo that installs this toolkit; the procedure is in
# MAINTAIN-REPO-USER-INSTRUCTIONS.md.
#
# WHY THE DEMOTION. Three review rounds on #256 showed this gate cannot be made
# sound by parsing command text — each round closed one shape and revealed
# another, and round three produced seven at once (`git push origin HEAD`,
# `bash -c '…'`, `command git push`, `git -C /path push`, a redirection parsed
# as a positional, and more). The bypass surface is not enumerable, so hardening
# it further buys close to nothing. #257 records the full list. Do not treat a
# green run of this hook as evidence that main is protected.
#
# Fail-open by design: any parse problem exits 0 (allow) — this gate must
# never break unrelated Bash calls. Exit 2 = block, stderr fed to Claude.
# Fail-open is correct for a speed bump and would be wrong for a boundary; that
# asymmetry is the clearest statement of what this file is.
#
# False-positive hardening (both found in production on day one):
#  - quoted strings are stripped before matching, so a commit MESSAGE
#    containing "push to main" cannot trigger the gate;
#  - `push` must be an actual git subcommand, so branch/file names that
#    merely contain "push" (e.g. claude/push-gate-quotes) cannot either;
#
# COMMAND SUBSTITUTION is a subcommand position: `result=`git push origin main``
# and `$(git push origin main)` used to slip past the anchor entirely — the
# separator class had no backtick, and a ref followed by `)` failed the ref test.
# Both verified as live bypasses on a scratch repo, and both predate this file's
# current shape; they are closed above.
#
# BACKTICKS ARE NOT STRIPPED, deliberately. In shell they are COMMAND
# SUBSTITUTION, not documentation: stripping them let `result=`git push origin
# main`` through the matcher entirely and the gate exited 0 — a bypass, verified
# on a scratch repo. The cost is a known false positive: a commit message that
# quotes a push command inside backticks, passed inline via a heredoc, still
# trips the gate. The fix belongs on the calling side, not here — write long
# prose to a file and use `git commit -F <file>`, so message text never reaches
# the command line. A false BLOCK is recoverable; a false ALLOW is not.

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
# NOTE the ordering constraint: a DOUBLE-quoted span may contain a live command
# substitution — bash expands $(...) and `...` inside double quotes — so removing
# such a span would hide an executable push. Only spans with no substitution are
# discarded. Single-quoted spans are inert and always safe to drop.
stripped=$(printf '%s' "$cmd" \
  | sed -E -e 's/"([^"[:space:]]*)"/\1/g' -e "s/'([^'[:space:]]*)'/\1/g" \
  | sed -e "s/'[^']*'//g" \
  | sed -E -e 's/"[^"$`]*"//g')

# `push` must appear as a git SUBCOMMAND (git [global-opts] push ...), at the
# start or after a shell separator — not as a substring of a name. An env-var
# prefix (`GIT_TRACE=1 git push ...`) must not defeat the anchor.
GIT_PUSH='(^|[;&|(`][[:space:]]*|&&[[:space:]]*|\|\|[[:space:]]*|[$]\([[:space:]]*|=[`]|=[$]\()([A-Za-z_][A-Za-z_0-9]*=[^[:space:]]*[[:space:]]+)*git([[:space:]]+-[^[:space:]]+)*[[:space:]]+push([[:space:]]|$)'
printf '%s' "$stripped" | grep -qE "$GIT_PUSH" || exit 0

# Isolate every push subcommand segment — a compound command can carry more
# than one push, and each must pass the gate.
pushparts=$(printf '%s' "$stripped" | grep -oE 'git([[:space:]]+-[^[:space:]]+)*[[:space:]]+push[^|;&]*')

# Any push that names main/master as a target ref (standalone word or after /).
if printf '%s\n' "$pushparts" | grep -qE '([[:space:]:/])(main|master)([[:space:]`)]|$)'; then
  echo 'BLOCKED by directives push-gate: direct push to main is never allowed — all main updates go through a claude/<name> branch and a PR (squash-merge on green CI). Push to your feature branch instead.' >&2
  exit 2
fi

# Any bare `git push` (no ref argument) while checked out on main -> block.
#
# A ref counts as named only AFTER option tokens are skipped. The previous test
# (`push[[:space:]]+[^-[:space:]]`) treated a leading flag as proof that no ref
# followed, so `git push -u origin claude/foo` from main was BLOCKED — the exact
# push form the standard mandates. Verified against the matrix in the repo's
# gate tests before shipping.
names_ref() {
  # shellcheck disable=SC2086
  set -- $1                                   # word-split this push segment
  positionals=0
  while [ $# -gt 0 ] && [ "$1" != 'push' ]; do shift; done
  [ $# -gt 0 ] && shift                       # drop `push` itself
  while [ $# -gt 0 ]; do
    case "$1" in
      --) shift; positionals=$((positionals + $#)); break ;;
      # options that consume the NEXT token as their value
      -o|--push-option|--repo|--receive-pack|--exec|--recurse-submodules)
        shift 2 2>/dev/null || return 1 ;;
      -*) shift ;;                            # any other flag, incl. --opt=value
      *) positionals=$((positionals + 1)); shift ;;
    esac
  done
  # `git push origin` is ONE positional: the repository. No refspec follows, so
  # git pushes the configured/default ref — on a main checkout, that is main.
  # Requiring two positionals makes the ambiguous case BLOCK rather than pass,
  # which is the only safe default for a gate whose failure mode is a bad commit
  # on the default branch.
  [ "$positionals" -ge 2 ] && return 0
  return 1
}

bare=0
while IFS= read -r seg; do
  [ -n "$seg" ] || continue
  names_ref "$seg" || bare=1
done <<PUSHPARTS
$pushparts
PUSHPARTS

if [ "$bare" = 1 ]; then
  branch=$(git branch --show-current 2>/dev/null)
  if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
    echo 'BLOCKED by directives push-gate: you are on main and this would push it directly. Work on a claude/<name> branch and open a PR.' >&2
    exit 2
  fi
fi

exit 0
