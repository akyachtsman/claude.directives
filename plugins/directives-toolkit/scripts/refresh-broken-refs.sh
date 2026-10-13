#!/usr/bin/env bash
# refresh-broken-refs.sh — /refresh-repo Phase 1: every claude.directives path
# this project references, checked against the upstream tree. Run from the
# project root:  bash "${CLAUDE_PLUGIN_ROOT}/scripts/refresh-broken-refs.sh"
# Prints `BROKEN: <path>` per missing path, then ONE summary line -- `OK: N
# upstream reference(s) checked, none broken` or `BROKEN: M of N ...` -- or one
# CANNOT CHECK line when the upstream tree is unreadable (never a BROKEN
# verdict then). The summary is never omitted: silence was indistinguishable
# from not running, or from 0 refs extracted (pilots, 2026-10-13). Exit 0 for
# any verdict, 1 for BROKEN, 2 for CANNOT CHECK. Why each guard is there:
# commands/refresh-repo.md → Phase 1 and the comments below.
# Runs the same under ANY shell options a session has set (`-e`, `-u`,
# `-o pipefail`). The fetch sits in an `if`, so errexit cannot end the block
# before the guard reports.
# shellcheck source=refresh-lib.sh
. "$(dirname -- "${BASH_SOURCE[0]}")/refresh-lib.sh" || { echo "CANNOT CHECK: refresh-lib.sh not loadable"; exit 2; }
src=$REFRESH_SRC
sha= tree= rc=1
# A blob-less shallow clone into a SCRATCH dir: trees only, no file contents,
# no checkout, nothing written to this project's .git. An EMPTY $objs must stop
# everything: `git -C ""` is a no-op, so every call would run against THIS
# project instead.
objs=$(mktemp -d) || objs=
if [ -n "$objs" ] \
   && git clone -q --depth 1 --filter=blob:none --no-checkout "$src" "$objs" \
   && sha=$(git -C "$objs" rev-parse HEAD) \
   && tree=$(git -C "$objs" ls-tree -r --name-only HEAD); then
  rc=0
fi
if [ -n "$objs" ]; then rm -rf "$objs"; fi
# GUARD: a failed fetch makes EVERY path look BROKEN. So require a clean exit,
# a HEAD that is a commit SHA, and a non-empty listing. Never test for a path
# being present: a renamed or deleted path is exactly what this phase reports,
# so using one as the sentinel would turn the breakage into CANNOT CHECK.
# `git ls-tree` is never truncated (the API's recursive tree could be, and was
# refused when it was), and a failed clone leaves $tree empty rather than
# filling it with an error body. Feed grep with here-strings: under pipefail an
# early-closing reader fed by `echo` can fail a pipeline whose match succeeded.
if [ "$rc" -ne 0 ] || ! grep -qE '^[0-9a-f]{40}$' <<<"$sha" || [ -z "$tree" ]; then
  echo "CANNOT CHECK: upstream tree not readable from this session — reference validation SKIPPED (no BROKEN verdicts). Use the raw-URL fallback below."
  exit 2
else
  # `|| true`: a project with no upstream references is a grep that matched
  # nothing, not a failure to stop on. A github.com `blob/main/` link names the
  # same file as a raw one, so that prefix is stripped. A `tree/` link names a
  # DIRECTORY, which this file listing cannot confirm: it stays unchecked.
  refs=$(grep -rhoE 'claude\.directives/(main/)?[A-Za-z0-9._/-]+\.[A-Za-z0-9]+' \
    --include='*.md' --include='*.yml' --include='*.json' . 2>/dev/null \
    | sed -E 's#.*claude\.directives/(blob/)?(main/)?##' | sort -u \
    | grep -E '^(directives|docs|templates|plugins|\.claude|\.github)/' || true)
  n=0 broken=0
  while read -r p; do
    [ -n "$p" ] || continue
    n=$((n + 1))
    grep -qxF -- "$p" <<<"$tree" || { echo "BROKEN: $p"; broken=$((broken + 1)); }
  done <<<"$refs"
  if [ "$broken" -gt 0 ]; then
    echo "BROKEN: $broken of $n upstream reference(s) checked against ${sha:0:12} do not exist there"
    exit 1
  fi
  echo "OK: $n upstream reference(s) checked against ${sha:0:12}, none broken"
fi
