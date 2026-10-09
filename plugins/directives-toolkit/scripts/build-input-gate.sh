#!/usr/bin/env bash
# PostToolUse reminder on Edit/Write: an edit to a BUILD INPUT changes the site.
#
# Why: with the CI-build opt-in (global.md -> Hosting & Deployment) the deployed
# site is the build's output, so editing src/app.ts or package.json changes what
# Pages serves without touching any served file. The sibling hook in hooks.json
# matches served files only (index.html, CSS, HTML/JS under docs/); this one
# reads the project's own list of build inputs, BUILD_PATHS in the top-level env
# of .github/workflows/qa.yml, and gives the same update-pages reminder when
# the edited path, relative to the repository root, matches it. No build
# (BUILD_PATHS empty or absent): silent. Unlike the served-file hook it skips
# no `templates/` paths: a project's own templates/ can be a build input.
#
# Fail-open by design: any parse problem exits 0. Exit 2 = feed stderr to Claude.
in=$(cat)
path=$(printf '%s' "$in" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || exit 0
[ -n "$path" ] || exit 0
dir=$(dirname -- "$path")
[ -d "$dir" ] || exit 0
root=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || exit 0
qa="$root/.github/workflows/qa.yml"
[ -f "$qa" ] || exit 0
# Read BUILD_PATHS from the top-level `env:` block with awk, not a YAML
# library: PyYAML is not on every host the toolkit runs on, and a missing
# parser must not read as "no build input". The template writes it as one
# `  BUILD_PATHS: <value>` line, quoted or bare; both YAML quote styles are
# unwrapped ('' -> ' inside single quotes, \\ and \" inside double quotes).
bp=$(awk '
  /^env:[[:space:]]*$/ { inenv = 1; next }
  inenv && /^[^[:space:]#]/ { inenv = 0 }
  inenv && /^[[:space:]]+BUILD_PATHS:/ {
    v = $0; sub(/^[[:space:]]+BUILD_PATHS:[[:space:]]*/, "", v)
    if (v ~ /^\x27/) { sub(/^\x27/, "", v); sub(/\x27[[:space:]]*(#.*)?$/, "", v); gsub(/\x27\x27/, "\x27", v) }
    else if (v ~ /^"/) { sub(/^"/, "", v); sub(/"[[:space:]]*(#.*)?$/, "", v); gsub(/\\"/, "\"", v); gsub(/\\\\/, "\\", v) }
    else { sub(/[[:space:]]+#.*$/, "", v); sub(/[[:space:]]+$/, "", v) }
    print v; exit
  }' "$qa") || exit 0
[ -n "${bp//[[:space:]]/}" ] || exit 0
rel=${path#"$root"/}
if printf '%s\n' "$rel" | grep -qE -- "$bp" 2>/dev/null; then
  echo 'Edited a build input of the GitHub Pages site (BUILD_PATHS in qa.yml) - the deployed site changes with it: apply the update-pages skill: ship it, watch the deploy for the merge commit SHA (not the branch head), and report live/stuck/failed proactively.' >&2
  exit 2
fi
exit 0
