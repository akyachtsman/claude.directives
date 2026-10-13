#!/usr/bin/env bash
# refresh-drift.sh — /refresh-repo Phase 1.5: compare every installed verbatim
# drop-in (workflows, composites, the hook, and .github/scripts/* -- see WHICH
# FILES) with the upstream template, whatever the delta. Run from the project
# root:  bash "${CLAUDE_PLUGIN_ROOT}/scripts/refresh-drift.sh"
# How to disposition each line is commands/refresh-repo.md → Phase 1.5.
#
# AT WHICH REVISION. The one every phase reads (refresh-lib.sh -> refresh_pin):
# Phase 2's classified head when refresh-delta.sh has run, else upstream main
# now, said out loud. It once fetched `main` by raw URL while Phases 2-3 pinned
# the classified SHA, so one refresh could compare against two heads (pilots,
# 2026-10-13). Over git transport, which also carries the file MODE a raw URL
# cannot.
#
# WHICH FILES. Every installed workflow, composite file and the SessionStart
# hook, and -- since the claude.prop pilot (2026-10-13), where five script
# templates in the delta had to be classified by hand -- every installed
# .github/scripts/<name> whose template templates/scripts/<name> exists at the
# pin (package.json included: it is shipped, and refresh-stamp.sh compares it
# too). Top level only: the template directory is flat. A script with no
# template at the pin is the project's own and is skipped SILENTLY (a project
# keeps many; a NO-TEMPLATE line each would bury the verdicts), so is
# package-lock.json (generated, never shipped). Files under a UI-test kit
# directory are never compared here -- kit-dirs.sh, the derivation
# refresh-stamp.sh uses, plus .github/scripts/ui-tests named outright --
# because kit-defects.sh and Phase 2's per-file kit diffs own the kit.
#
# Per file, one of:
#   STALE: <path>   differs from the pinned template but EQUALS the template at
#                   the project's stamp (.claude/directive-sync.json ->
#                   upstream.sha): nothing local, only upstream moved -- take
#                   the template, no per-file review needed.
#   CUSTOM: <path>  differs from the template at the stamp too: a local edit.
#                   Diff it; refresh-merge.sh does the 3-way merge (base = the
#                   stamp-era template) so the local hunks stand apart.
#                   "(recorded in refresh_kept: <reason>)" follows the path
#                   when .claude/directive-sync.json -> refresh_kept holds a
#                   record for it that refresh-stamp.sh would honour: keyed by
#                   the local path, its blob the template's at the pin. One
#                   bound to an older template blob is not shown.
#   DRIFT: <path>   differs, and the stamp-era template is unavailable (no
#                   stamp, its fetch failed, or no template at the stamp) so
#                   stale cannot be told from custom: read the diff.
#   MODE: <path>    the executable bit differs from the template's git mode
#                   (100755 vs 100644). Informational, never DRIFT on its own.
#   NO-TEMPLATE / CANNOT-VERIFY / RETIRED, as before.
# then one SUMMARY line with the counts. Exit 0 when files were compared (the
# lines are questions, not failures), 2 when nothing could be.
# shellcheck source=refresh-lib.sh
. "$(dirname -- "${BASH_SOURCE[0]}")/refresh-lib.sh" \
  || { echo "CANNOT-VERIFY: refresh-lib.sh not loadable — nothing compared, not DRIFT"; exit 2; }

if ! refresh_pin; then
  echo "CANNOT-VERIFY: no upstream SHA ($pin_from returned nothing usable) — nothing compared, not DRIFT"
  exit 2
fi
echo "pinned: $pin ($pin_from)"
if [ "$pin_from" = "Phase 2's classified head" ]; then
  live=$(refresh_head)
  if [ -n "$live" ] && [ "$live" != "$pin" ]; then
    echo "NOTE: upstream main is now $live — re-run refresh-delta.sh to classify it, then this"
  fi
fi
stamp=$(jq -r '.upstream.sha // empty' .claude/directive-sync.json 2>/dev/null) || stamp=
refresh_is_sha "$stamp" || stamp=

up=$(mktemp -d) || up=
if [ -z "$up" ] || ! refresh_fetch "$up" "$pin"; then
  [ -n "$up" ] && rm -rf "$up"
  echo "CANNOT-VERIFY: the upstream tree at $pin could not be fetched — nothing compared, not DRIFT"
  exit 2
fi
# The stamp-era tree: what the project last took. Same scratch repo.
if [ -z "$stamp" ]; then
  why_no_base="no stamp in .claude/directive-sync.json"
elif [ "$stamp" = "$pin" ] || git -C "$up" fetch -q --depth=1 "$REFRESH_SRC" "$stamp" 2>/dev/null; then
  why_no_base=
else
  why_no_base="the tree at the stamp $stamp could not be fetched"
fi

# The kit's installed location(s), from the SAME file refresh-stamp.sh runs, and
# the default named outright, so a kit file is never read as a script.
kit_dirs=$(bash "$(dirname -- "${BASH_SOURCE[0]}")/kit-dirs.sh" 2>/dev/null) || kit_dirs=
in_kit() {
  local k
  while IFS= read -r k; do
    [ -n "$k" ] || continue
    case "$1" in "$k"/*) return 0 ;; esac
  done <<KITS
$kit_dirs
.github/scripts/ui-tests
KITS
  return 1
}

n=0 same=0 stale=0 custom=0 drift=0 modes=0
for f in .github/workflows/*.yml .github/actions/*/* \
         .claude/hooks/session-start.sh .github/scripts/*; do
  [ -f "$f" ] || continue
  script=
  case "$f" in
    .github/scripts/*) in_kit "$f" && continue
                       script=1 ;;
  esac
  # A template upstream DELETED is absent from the tree too, which would read
  # as a project-specific file and be kept. An installed copy is a removal
  # finding instead, so retired names are matched first (Codex, #444).
  case "$f" in
    .github/workflows/keepalive.yml)
      echo "RETIRED: $f — upstream deleted this template; delete it and its KEEPALIVE_PAT secret (docs/standards/cicd-setup.md → 9f)"
      continue ;;
  esac
  t=$(refresh_template_of "$f")
  # Only a path absent from a tree that WAS fetched means "no such template";
  # the fetch itself was checked above, so this is never a network failure.
  tmode=$(git -C "$up" ls-tree "$pin" -- "$t" 2>/dev/null | cut -d' ' -f1)
  if [ -z "$tmode" ]; then
    [ -n "$script" ] && continue   # the project's own script: silent (header)
    echo "NO-TEMPLATE: $f (project-specific — skip)"
    continue
  fi
  n=$((n + 1))
  lmode=$(refresh_local_mode "$f")
  if [ "$lmode" != "$tmode" ]; then
    # The committed mode is what a CI checkout gets, so it decides; a working
    # tree already fixed but not yet committed is said, not counted as fixed.
    if [ -x "$f" ]; then wmode=100755; else wmode=100644; fi
    note=
    [ "$wmode" = "$tmode" ] && note="; the working tree is already $wmode — commit the mode"
    echo "MODE: $f is $lmode, the template is $tmode (informational, not DRIFT$note)"
    modes=$((modes + 1))
  fi
  if git -C "$up" cat-file blob "$pin:$t" 2>/dev/null | cmp -s - "$f"; then
    same=$((same + 1))
  elif [ -n "$why_no_base" ]; then
    echo "DRIFT: $f ($why_no_base: stale cannot be told from custom — read the diff)"
    drift=$((drift + 1))
  elif ! git -C "$up" cat-file -e "$stamp:$t" 2>/dev/null; then
    echo "DRIFT: $f (no template at the stamp $stamp: stale cannot be told from custom — read the diff)"
    drift=$((drift + 1))
  elif git -C "$up" cat-file blob "$stamp:$t" 2>/dev/null | cmp -s - "$f"; then
    echo "STALE: $f — equals the template at the stamp; only upstream moved, take the template"
    stale=$((stale + 1))
  else
    # A divergence already decided: refresh-stamp.sh's refresh_kept record,
    # read the way it reads it -- keyed by the local path, bound to the
    # template's blob at the head -- so one that upstream has since changed
    # is a fresh question again (claude.prop pilot, 2026-10-13).
    b=$(git -C "$up" rev-parse "$pin:$t" 2>/dev/null) || b=
    kept=$(jq -r --arg p "$f" --arg b "$b" \
      '.refresh_kept[$p] | select(type == "object" and .blob == $b) | .reason
       | select(type == "string" and test("\\S")) | gsub("[\t\n\r]"; " ")' \
      .claude/directive-sync.json 2>/dev/null) || kept=
    [ -n "$kept" ] && kept=" (recorded in refresh_kept: $kept)"
    echo "CUSTOM: $f$kept — differs from the template at the stamp too: a local edit; 3-way: refresh-merge.sh $f"
    custom=$((custom + 1))
  fi
done
rm -rf "$up"
echo "SUMMARY: $n installed file(s) compared at $pin — $same match, $stale STALE, $custom CUSTOM, $drift DRIFT, $modes MODE"
exit 0
