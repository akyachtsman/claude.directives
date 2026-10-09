#!/usr/bin/env bash
# PostToolUse reminder on Edit/Write: an edit to a BUILD INPUT changes the site.
#
# Why: with the CI-build opt-in (global.md -> Hosting & Deployment) the deployed
# site is the build's output, so editing src/app.ts or package.json changes what
# Pages serves without touching any served file. The sibling hook in hooks.json
# matches served files only (index.html, CSS, HTML/JS under docs/); this one
# reads the project's own list of build inputs, BUILD_PATHS in the top-level env
# of .github/workflows/qa.yml, and gives the same update-pages reminder when
# the edited path matches it. No build (BUILD_PATHS empty or absent): silent.
#
# Fail-open by design: any parse problem exits 0. Exit 2 = feed stderr to Claude.
in=$(cat)
path=$(printf '%s' "$in" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || exit 0
[ -n "$path" ] || exit 0
case "$path" in */templates/*) exit 0 ;; esac
dir=$(dirname -- "$path")
[ -d "$dir" ] || exit 0
root=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || exit 0
qa="$root/.github/workflows/qa.yml"
[ -f "$qa" ] || exit 0
# -I (isolated): neither the cwd nor user site-packages is on sys.path, so a
# yaml.py inside the edited repository cannot run when PyYAML is imported.
bp=$(python3 -I -c 'import sys, yaml
env = (yaml.safe_load(open(sys.argv[1])) or {}).get("env") or {}
print(env.get("BUILD_PATHS") or "")' "$qa" 2>/dev/null) || exit 0
[ -n "${bp//[[:space:]]/}" ] || exit 0
rel=${path#"$root"/}
if printf '%s\n' "$rel" | grep -qE -- "$bp" 2>/dev/null; then
  echo 'Edited a build input of the GitHub Pages site (BUILD_PATHS in qa.yml) - the deployed site changes with it: apply the update-pages skill: ship it, watch the deploy for the merge commit SHA (not the branch head), and report live/stuck/failed proactively.' >&2
  exit 2
fi
exit 0
