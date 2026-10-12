#!/usr/bin/env bash
# PostToolUse reminder on Edit/Write: an edit that changes what GitHub Pages
# serves gets the update-pages reminder. Two triggers, one path read:
#
#  1. A SERVED FILE (gate-lib.sh -> gate_served): HTML, JS, CSS, SVG or a web
#     manifest anywhere in the repository outside the paths Pages never serves
#     to users (.github/, .claude/, templates/, node_modules/). The default
#     downstream layout serves the repository ROOT (branch source `/ (root)`),
#     so `app.js`, `js/main.js` and `about.html` count; the inline hook this
#     replaced matched only `index.html`, HTML/JS under `/docs/` and CSS, and
#     sent no reminder for those (audit 2026-10-11, I-12). Matched on the path
#     relative to the repository root, so a checkout that itself sits under a
#     directory named `templates` is not silenced.
#  2. A BUILD INPUT. With the CI-build opt-in (global.md -> Hosting &
#     Deployment) the deployed site is the build's output, so editing
#     src/app.ts or package.json changes what Pages serves without touching a
#     served file. The project lists its build inputs as BUILD_PATHS in the
#     top-level env of .github/workflows/qa.yml; a match there gives the same
#     reminder. No build (BUILD_PATHS empty or absent): silent. It skips no
#     `templates/` path: a project's own templates/ can be a build input.
#
# Fail-open by design: any parse problem exits 0. Exit 2 = feed stderr to Claude.
in=$(cat)
# shellcheck source=gate-lib.sh
. "$(dirname -- "${BASH_SOURCE[0]}")/gate-lib.sh" 2>/dev/null || exit 0
if command -v jq >/dev/null 2>&1; then
  path=$(printf '%s' "$in" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || exit 0
else
  # No jq must not read as "nothing edited": the gates' JSON-string reader.
  path=$(gate_json_string "$in" file_path)
fi
[ -n "$path" ] || exit 0
dir=$(dirname -- "$path")
rel=$path root=
# Relative to the root as git sees it: --show-toplevel is the RESOLVED path, so
# stripping it from a path reached through a symlink (macOS /tmp, a linked home)
# stripped nothing and the edit went unmatched (audit, 2026-10-09).
if [ -d "$dir" ] && prefix=$(git -C "$dir" rev-parse --show-prefix 2>/dev/null); then
  rel="$prefix$(basename -- "$path")"
  root=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || root=
fi
if gate_served "$rel"; then
  echo 'Edited a GitHub Pages file - apply the update-pages skill: ship it, watch the pages build for the merge commit SHA (not the branch head), and report live/stuck/failed proactively.' >&2
  exit 2
fi
[ -n "$root" ] || exit 0
qa="$root/.github/workflows/qa.yml"
[ -f "$qa" ] || exit 0
# Read BUILD_PATHS from the top-level `env:` block with awk, not a YAML
# library: PyYAML is not on every host the toolkit runs on, and a missing
# parser must not read as "no build input". Accepted shapes: `env:` with or
# without a trailing comment; `  BUILD_PATHS: <value>` quoted or bare (both YAML
# quote styles unwrapped: '' -> ' inside single quotes, \\ and \" inside double
# quotes); and a block scalar (`|` keeps line breaks, which grep -E reads as
# alternatives, exactly as the workflow's own grep does; `>` folds them into
# spaces), its lines read while indented deeper than the key. Before 2026-10-11
# a commented `env:` or a block scalar read as empty, silently (M-12).
bp=$(awk '
  function flush() { if (blk != "") { print val; done = 1; exit } }
  done { exit }
  blk != "" {
    if ($0 ~ /^[[:space:]]*$/) { pend = pend (blk == "|" ? "\n" : " "); next }
    match($0, /^[[:space:]]*/)
    if (RLENGTH <= kind_ind) { flush() }
    line = substr($0, RLENGTH + 1)
    val = (val == "" ? line : val pend (blk == "|" ? "\n" : " ") line); pend = ""
    next
  }
  /^env:[[:space:]]*(#.*)?$/ { inenv = 1; next }
  inenv && /^[^[:space:]#]/ { inenv = 0 }
  inenv && /^[[:space:]]+BUILD_PATHS:/ {
    match($0, /^[[:space:]]*/); kind_ind = RLENGTH
    v = $0; sub(/^[[:space:]]+BUILD_PATHS:[[:space:]]*/, "", v)
    if (v ~ /^[|>][-+0-9]*[[:space:]]*(#.*)?$/) { blk = substr(v, 1, 1); val = ""; pend = ""; next }
    if (v ~ /^\x27/) { sub(/^\x27/, "", v); sub(/\x27[[:space:]]*(#.*)?$/, "", v); gsub(/\x27\x27/, "\x27", v) }
    else if (v ~ /^"/) { sub(/^"/, "", v); sub(/"[[:space:]]*(#.*)?$/, "", v); gsub(/\\"/, "\"", v); gsub(/\\\\/, "\\", v) }
    else { sub(/[[:space:]]+#.*$/, "", v); sub(/[[:space:]]+$/, "", v) }
    print v; exit
  }
  END { if (blk != "" && !done) print val }' "$qa") || exit 0
[ -n "${bp//[[:space:]]/}" ] || exit 0
if printf '%s\n' "$rel" | grep -qE -- "$bp" 2>/dev/null; then
  echo 'Edited a build input of the GitHub Pages site (BUILD_PATHS in qa.yml) - the deployed site changes with it: apply the update-pages skill: ship it, watch the deploy for the merge commit SHA (not the branch head), and report live/stuck/failed proactively.' >&2
  exit 2
fi
exit 0
