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
# because kit-defects.sh and Phase 2's per-file kit diffs own the kit. A file
# counts as the kit's only when the kit template ships that name: a kit
# installed AT .github/scripts shares the directory with the standard scripts,
# which stay compared (Codex, #451).
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
# then one SUMMARY line with the counts, and -- only when there are any -- one
# RE-RECORD line naming every refresh_kept file record (kit files included)
# whose `local` blob is missing or is not the file's now. Exit 0 when files
# were compared (the lines are questions, not failures), 2 when nothing could be.
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
# the default named outright, so a kit file is never read as a script. Under a
# kit directory, a file is the kit's only when templates/ui-tests ships its
# name at the pin: UI_TESTS_DIR may be .github/scripts itself, and its standard
# scripts must not vanish from the comparison with the kit (Codex, #451).
kit_dirs=$(bash "$(dirname -- "${BASH_SOURCE[0]}")/kit-dirs.sh" 2>/dev/null) || kit_dirs=
in_kit() {
  local k rel
  while IFS= read -r k; do
    [ -n "$k" ] || continue
    rel=$(refresh_kit_rel "$1" "$k") \
      && git -C "$up" cat-file -e "$pin:templates/ui-tests/$rel" 2>/dev/null && return 0
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
    # keyed by the local path, bound to the template's blob at the head -- so
    # one that upstream has since changed is a fresh question again (claude.prop
    # pilot, 2026-10-13). It is honoured only while it ALSO binds this file's
    # content: its `local` blob must equal the installed copy's, or a later
    # edit (or a replaced file) would inherit an old approval and go unreviewed
    # (Codex, #451). A record without `local` is shown but not honoured, and so
    # is one without a reason (a non-blank string), which the stamp would not
    # honour either.
    b=$(git -C "$up" rev-parse "$pin:$t" 2>/dev/null) || b=
    lb=$(git hash-object --no-filters -- "$f" 2>/dev/null) || lb=   # raw bytes, as the stamp
    rec=$(jq -r --arg p "$f" --arg b "$b" \
      '.refresh_kept[$p] | select(type == "object" and .blob == $b)
       | (.reason // "" | if type == "string" and test("\\S") then gsub("[\t\n\r]"; " ") else "" end) as $r
       | [(.local // ""), $r, (if ($r | length) > 60 then $r[0:60] + "..." else $r end)]
       | @tsv' \
      .claude/directive-sync.json 2>/dev/null) || rec=
    kept=
    if [ -n "$rec" ]; then
      # The warning lines quote the reason cut to 60 characters (in jq, so never
      # mid-character): one of claude.prop's ran ~800 and buried the verdict
      # (pilot, 2026-10-15). The full text is the record's, one jq away.
      rl=${rec%%$'\t'*} rest=${rec#*$'\t'}
      why=${rest%%$'\t'*} short=${rest#*$'\t'}
      if [ -z "$why" ]; then
        kept=" (refresh_kept has a record but no reason -- review it, then re-record it with one)"
      elif [ -n "$rl" ] && [ "$rl" = "$lb" ]; then
        kept=" (recorded in refresh_kept: $why)"
      elif [ -n "$rl" ]; then
        kept=" (refresh_kept says \"$short\", but this file changed since it was recorded -- review it again)"
      else
        kept=" (refresh_kept says \"$short\", but the record binds no local content -- review it, then re-record with its local blob)"
      fi
    fi
    echo "CUSTOM: $f$kept — differs from the template at the stamp too: a local edit; 3-way: refresh-merge.sh $f"
    custom=$((custom + 1))
  fi
done
rm -rf "$up"
echo "SUMMARY: $n installed file(s) compared at $pin — $same match, $stale STALE, $custom CUSTOM, $drift DRIFT, $modes MODE"
# Every refresh_kept FILE record whose `local` blob is missing or no longer the
# file's, kit files included: the CUSTOM lines above reach only the files this
# loop compares, so a kit record first surfaced as a stamp refusal (claude.prop
# pilot, 2026-10-15). Said once, up front, with the paths. Directory records
# (keys ending in `/`) bind a tree, not a local blob, and are not counted.
stale_recs=
nrec=0
while IFS=$'\t' read -r k l; do
  [ -n "$k" ] || continue
  if [ -e "$k" ]; then cur=$(git hash-object --no-filters -- "$k" 2>/dev/null) || cur=; else cur=absent; fi
  if [ -z "$l" ] || [ "$l" != "$cur" ]; then
    stale_recs="$stale_recs${stale_recs:+, }$k"
    nrec=$((nrec + 1))
  fi
done <<RECS
$(jq -r '.refresh_kept | if type == "object" then to_entries[] else empty end
         | select((.key | endswith("/") | not) and (.value | type == "object"))
         | [.key, (.value.local // "" | tostring)] | @tsv' .claude/directive-sync.json 2>/dev/null)
RECS
if [ "$nrec" -gt 0 ]; then
  echo "RE-RECORD: $nrec refresh_kept file record(s) bind no current local content, kit files included -- the stamp refuses each whose file still differs from its template until it is re-recorded with its local blob (or dropped): $stale_recs"
fi
exit 0
