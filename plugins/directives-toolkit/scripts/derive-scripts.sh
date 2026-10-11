#!/usr/bin/env bash
# derive-scripts.sh — the ONE derivation of the .github/scripts/* files a text
# references. Reads the text on stdin and prints one path per line (unsorted,
# repeats possible). Both /refresh-repo callers run this file:
#   - Phase 2's install derivation (commands/refresh-repo.md → *Deriving the
#     referenced-script set*), over the fetched upstream callers;
#   - Phase 3's applied-check (scripts/refresh-stamp.sh, scan()).
# One file, so the two can never derive different sets: a check wider than the
# install refuses a stamp the install can never satisfy, and a narrower one
# passes a dependency it never saw (#398). Before this file each carried its own
# copy, and a guard of several hundred lines kept them in step (batch C, R1).
#
# Each stage, and the failure it exists for, is in refresh-repo.md → *Deriving
# the referenced-script set*:
#   1. the whole path token, `/` included, so a nested script is reachable;
#   2. a trailing period stripped: a sentence may end on a path;
#   3. only .js/.py endings (anchored, so the `.js` inside `.json` stays out),
#      plus EXACTLY .github/scripts/package.json, which an `npm install` there
#      reads (#398).
# .github/scripts/check-refresh-derivation.py runs THIS file against every
# shipped caller and against the contract.
#
# Exit 0 for any result, including none: an empty derivation is not wrong in
# itself. Exit 2 when grep or sed fails, so a broken stage is never read as
# "matched nothing".
set -u
tokens=$(grep -oE '\.github/scripts/[A-Za-z0-9_./-]+')
rc=$?
if [ "$rc" -gt 1 ]; then
  echo "derive-scripts: the token grep failed (exit $rc)" >&2
  exit 2
fi
[ -n "$tokens" ] || exit 0
if ! stripped=$(printf '%s\n' "$tokens" | sed -E 's/[.]+$//'); then
  echo "derive-scripts: the trailing-period sed failed" >&2
  exit 2
fi
printf '%s\n' "$stripped" | grep -E '\.(js|py)$|^\.github/scripts/package\.json$'
rc=$?
if [ "$rc" -gt 1 ]; then
  echo "derive-scripts: the extension filter failed (exit $rc)" >&2
  exit 2
fi
exit 0
