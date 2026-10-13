#!/usr/bin/env bash
# refresh-merge.sh — the 3-way merge for a file Phase 1.5 reports CUSTOM (or a
# kit file Phase 2 diffs per file). Run from the project root:
#   bash "${CLAUDE_PLUGIN_ROOT}/scripts/refresh-merge.sh" <installed path> [--write]
#
# A two-way diff of local against the current template mixes two things: what
# upstream changed since the project last synced, and what the project changed
# itself. With the template AT THE STAMP as the merge base they come apart:
#   base   = the template at .claude/directive-sync.json -> upstream.sha
#   ours   = the installed file
#   theirs = the template at the pinned head (refresh-lib.sh -> refresh_pin)
# `git merge-file` then takes every upstream hunk that does not touch a local
# one, keeps every local hunk, and marks only real overlaps as conflicts.
#
# Prints the LOCAL HUNKS (base -> ours: exactly the project's own edits), then
# `MERGED: <file> (N conflict(s))` naming a scratch copy of the result. The
# installed file is changed only with --write, and only when N is 0: a merge
# with conflict markers is for a person to resolve, never to commit.
# Exit 0 merged cleanly (written or not), 1 conflicts, 2 cannot merge.
# shellcheck source=refresh-lib.sh
. "$(dirname -- "${BASH_SOURCE[0]}")/refresh-lib.sh" \
  || { echo "CANNOT MERGE: refresh-lib.sh not loadable"; exit 2; }
f=${1:-}
write=no
[ "${2:-}" = --write ] && write=yes
if [ -z "$f" ] || [ ! -f "$f" ]; then
  echo "CANNOT MERGE: give an installed file that exists (got '${f}')"
  exit 2
fi
f=${f#./}
t=$(refresh_template_of "$f")
# A kit file maps through the kit directory the workflows name.
while IFS= read -r k; do
  [ -n "$k" ] || continue
  case "$f" in "$k"/*) t="templates/ui-tests/${f#"$k"/}" ;; esac
done <<KITS
$(bash "$(dirname -- "${BASH_SOURCE[0]}")/kit-dirs.sh")
KITS
if [ -z "$t" ]; then
  echo "CANNOT MERGE: $f is not an installed copy of an upstream template"
  exit 2
fi
stamp=$(jq -r '.upstream.sha // empty' .claude/directive-sync.json 2>/dev/null) || stamp=
if ! refresh_is_sha "$stamp"; then
  echo "CANNOT MERGE: no stamp in .claude/directive-sync.json, so there is no merge base — diff $f against the template by hand"
  exit 2
fi
if ! refresh_pin; then
  echo "CANNOT MERGE: no upstream SHA to merge towards"
  exit 2
fi
work=$(mktemp -d) || { echo "CANNOT MERGE: no scratch directory"; exit 2; }
up="$work/up"
if ! refresh_fetch "$up" "$pin" "$stamp"; then
  echo "CANNOT MERGE: the upstream trees at $pin and $stamp could not be fetched"
  rm -rf "$work"
  exit 2
fi
if ! git -C "$up" cat-file blob "$pin:$t" >"$work/theirs" 2>/dev/null; then
  echo "CANNOT MERGE: $t is not shipped at $pin (deleted upstream?) — a removal finding, not a merge"
  rm -rf "$work"
  exit 2
fi
if ! git -C "$up" cat-file blob "$stamp:$t" >"$work/base" 2>/dev/null; then
  : >"$work/base"
  echo "NOTE: $t did not exist at the stamp $stamp — merging against an EMPTY base, so every local line counts as local"
fi
out_dir=$(mktemp -d) || { echo "CANNOT MERGE: no scratch directory"; rm -rf "$work"; exit 2; }
merged="$out_dir/$(basename "$f")"
cp "$f" "$merged"
echo "pinned: $pin ($pin_from); base: the template at the stamp $stamp"
echo "LOCAL HUNKS ($t at the stamp -> $f):"
diff -u --label "$t@stamp" --label "$f" "$work/base" "$f" || true
git merge-file -L "$f (local)" -L "$t@stamp" -L "$t@$pin" "$merged" "$work/base" "$work/theirs"
n=$?
rm -rf "$work"
if [ "$n" -lt 0 ] || [ "$n" -gt 127 ]; then
  echo "CANNOT MERGE: git merge-file failed (exit $n)"
  exit 2
fi
echo "MERGED: $merged ($n conflict(s))"
if [ "$n" -gt 0 ]; then
  [ "$write" = yes ] && echo "NOT WRITTEN: $f — resolve the conflicts in $merged first"
  exit 1
fi
if [ "$write" = yes ]; then
  # Content only: the installed file keeps its own mode (MODE lines report a
  # mode difference separately).
  cat "$merged" >"$f" && echo "WRITTEN: $f"
fi
exit 0
