#!/usr/bin/env bash
# kit-dirs.sh — the ONE derivation of where a project keeps its UI-test kit.
# Run from the project root; prints one directory per line (a path with spaces
# stays whole), or nothing when the project has no kit. Always exits 0.
#
# Both callers run this file, so they can never find different kits:
#   - commands/refresh-repo.md → *Kit defects*, which checks each kit;
#   - scripts/refresh-stamp.sh, Phase 3's applied-check for kit files.
# Before this file each carried a copy, and #424 had to fix both for one
# trailing slash (audit 2026-10-11, I-26).
#
# The kit may live anywhere (`cicd-setup.md` lets `UI_TESTS_DIR` point
# elsewhere), so it is read from the workflows. The YAML scalar, not the rest of
# the line: a quoted value ends at its closing quote (a `#` inside it is part of
# the path) with its escapes decoded (`\"` in double quotes, `''` in single); an
# unquoted one ends at ` #` (a comment). The path is then normalised
# lexically, segment by segment: empty and `.` segments are dropped and `x/..`
# folds, so `e2e/`, `./e2e`, `e2e/.`, `.//e2e` and `x/../e2e` all name the one
# kit `e2e` -- a caller's prefix match on a project-relative path (`"$k"/*`)
# then holds for every equivalent spelling, not one per review round (#424,
# Codex #451). No filesystem lookup: a symlink is not resolved, and a leading
# `..` stays (outside the project, so "named but missing"). The accepted forms are a CLOSED set
# (#375); anything else is taken literally and lands on the callers' "named but
# missing" report, never silently. With no UI_TESTS_DIR set, the default
# `.github/scripts/ui-tests` counts when it exists.
#
# A CALLER of the shared workflows (#460 step 4) has no UI_TESTS_DIR: it passes
# the kit as the `tests-dir:` input, which is read the same way, from a
# workflow that calls one (refresh-lib.sh -> refresh_caller_of) and only as a
# literal: `tests-dir: ${{ env.UI_TESTS_DIR }}` in a full copy is an
# expression, not a path (claude.prop pilot, 2026-10-25).
set -u
# shellcheck source=refresh-lib.sh
. "$(dirname -- "${BASH_SOURCE[0]}")/refresh-lib.sh" 2>/dev/null || refresh_caller_of() { return 1; }
# canon <path>: the lexical normal form above; an empty value stays empty.
canon() {
  local seg out= lead=
  [ -n "$1" ] || { echo; return; }
  case $1 in /*) lead=/ ;; esac
  local IFS=/
  set -f
  for seg in $1; do
    case $seg in
      ''|.) ;;
      ..) case $out in
            ''|..|*/..) out=${out:+$out/}.. ;;
            */*) out=${out%/*} ;;
            *) out= ;;
          esac ;;
      *) out=${out:+$out/}$seg ;;
    esac
  done
  set +f
  printf '%s\n' "$lead${out:-.}"
}
callers=()
for w in .github/workflows/*.yml .github/workflows/*.yaml; do
  refresh_caller_of "$w" >/dev/null && callers+=("$w")
done
dirs=$( { grep -hE '^[[:space:]]*UI_TESTS_DIR:' .github/workflows/*.yml .github/workflows/*.yaml 2>/dev/null
          [ "${#callers[@]}" -eq 0 ] || grep -hE '^[[:space:]]*tests-dir:' "${callers[@]}" 2>/dev/null | grep -vF '${{'; } \
  | sed -E -e 's/^[[:space:]]*(UI_TESTS_DIR|tests-dir):[[:space:]]*//' \
           -e '/^"/{s/^"((\\.|[^"\\])*)".*$/\1/;s/\\(["\\])/\1/g;b' -e '}' \
           -e '/^\x27/{s/^\x27((\x27\x27|[^\x27])*)\x27.*$/\1/;s/\x27\x27/\x27/g;b' -e '}' \
           -e 's/[[:space:]]+#.*$//' -e 's/[[:space:]]+$//' | while IFS= read -r d; do canon "$d"; done | sort -u; true)
if [ -z "$dirs" ] && [ -d .github/scripts/ui-tests ]; then
  dirs=.github/scripts/ui-tests
fi
[ -z "$dirs" ] || printf '%s\n' "$dirs"
exit 0
