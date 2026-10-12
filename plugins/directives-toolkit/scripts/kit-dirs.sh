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
# unquoted one ends at ` #` (a comment). A trailing `/` is dropped, so `e2e/`
# and `e2e` name one kit, not `e2e//x`. The accepted forms are a CLOSED set
# (#375); anything else is taken literally and lands on the callers' "named but
# missing" report, never silently. With no UI_TESTS_DIR set, the default
# `.github/scripts/ui-tests` counts when it exists.
set -u
dirs=$(grep -hE '^[[:space:]]*UI_TESTS_DIR:' .github/workflows/*.yml .github/workflows/*.yaml 2>/dev/null \
  | sed -E -e 's/^[[:space:]]*UI_TESTS_DIR:[[:space:]]*//' \
           -e '/^"/{s/^"((\\.|[^"\\])*)".*$/\1/;s/\\(["\\])/\1/g;b' -e '}' \
           -e '/^\x27/{s/^\x27((\x27\x27|[^\x27])*)\x27.*$/\1/;s/\x27\x27/\x27/g;b' -e '}' \
           -e 's/[[:space:]]+#.*$//' -e 's/[[:space:]]+$//' | sed -E 's#/+$##' | sort -u; true)
if [ -z "$dirs" ] && [ -d .github/scripts/ui-tests ]; then
  dirs=.github/scripts/ui-tests
fi
[ -z "$dirs" ] || printf '%s\n' "$dirs"
exit 0
