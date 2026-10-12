#!/usr/bin/env bash
# notify-starter.sh — is an installed scheduled-job file still a SHIPPED
# starter? Run from the project root:
#   bash "${CLAUDE_PLUGIN_ROOT}/scripts/notify-starter.sh" [.github/scripts/<file>]
# Default .github/scripts/notify-task.js; pass notify-email.js or package.json
# the same way for the companions. Prints STARTER (the file matches its template
# at ANY upstream commit), STARTER (edited, placeholder body still in place),
# MODIFIED, or CANNOT CHECK. How to act on each: commands/refresh-repo.md →
# the converse of the scheduled-workflow rule.
f=${1:-.github/scripts/notify-task.js}
t="templates/scripts/$(basename "$f")"
# STARTER = the file matches some shipped version (no task body written yet).
# A blob-less clone carries every commit's trees, which is all the test reads.
d=$(mktemp -d) || d=
if [ -f "$f" ] && [ -n "$d" ] \
   && git clone -q --bare --filter=blob:none https://github.com/akyachtsman/claude.directives.git "$d"; then
  h=$(git hash-object "$f")
  # Collect first, then match with a here-string: `grep -q` in a pipe exits on
  # the first hit, and under pipefail the writer's SIGPIPE turns a match into
  # a miss (it did, for the current starter).
  shipped=$(git -C "$d" log --format=%H -- "$t" \
    | while read -r c; do git -C "$d" rev-parse -q --verify "$c:$t" 2>/dev/null || true; done)
  if grep -qxF "$h" <<<"$shipped"; then echo STARTER
  # An edit that left the starter's placeholder body in place wrote no task.
  elif grep -qF 'Add your scheduled notification in notify-task.js' "$f"; then
    echo "STARTER (edited, placeholder body still in place)"
  else echo MODIFIED; fi
else
  echo "CANNOT CHECK: $f absent or upstream history not readable"
fi
if [ -n "$d" ]; then rm -rf "$d"; fi
