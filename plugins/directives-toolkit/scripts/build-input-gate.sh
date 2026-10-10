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
# no `templates/` paths: a project's own templates/ can be a build input. An
# edit the served-file hook already reminded about (its pattern, repeated below)
# gets no second, identical reminder.
#
# Fail-open by design: any parse problem exits 0. Exit 2 = feed stderr to Claude.
in=$(cat)
if command -v jq >/dev/null 2>&1; then
  path=$(printf '%s' "$in" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || exit 0
else
  # No jq must not read as "no build input": the gates' JSON-string reader.
  # shellcheck source=gate-lib.sh
  . "$(dirname -- "${BASH_SOURCE[0]}")/gate-lib.sh" 2>/dev/null || exit 0
  path=$(gate_json_string "$in" file_path)
fi
[ -n "$path" ] || exit 0
if printf '%s\n' "$path" | grep -qE '(index\.html|/docs/[^"]*\.(html|js)|\.css)$' \
   && ! printf '%s\n' "$path" | grep -q '/templates/'; then
  exit 0   # the served-file hook in hooks.json gives the same reminder
fi
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
# Relative to the root as git sees it: --show-toplevel is the RESOLVED path, so
# stripping it from a path reached through a symlink (macOS /tmp, a linked home)
# stripped nothing and the edit went unmatched (audit, 2026-10-09).
rel="$(git -C "$dir" rev-parse --show-prefix)$(basename -- "$path")"
if printf '%s\n' "$rel" | grep -qE -- "$bp" 2>/dev/null; then
  echo 'Edited a build input of the GitHub Pages site (BUILD_PATHS in qa.yml) - the deployed site changes with it: apply the update-pages skill: ship it, watch the deploy for the merge commit SHA (not the branch head), and report live/stuck/failed proactively.' >&2
  exit 2
fi
exit 0
