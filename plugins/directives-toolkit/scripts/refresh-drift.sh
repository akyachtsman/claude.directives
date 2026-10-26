#!/usr/bin/env bash
# refresh-drift.sh — /refresh-repo Phase 1.5: compare every installed verbatim
# drop-in (the hook, the scripts a directive names, the house style -- see
# WHICH FILES) with the upstream template, whatever the delta, and name every
# workflow and every copy of a shared file it does not compare. Run from the project
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
# WHICH FILES (Phase E of #460 step 4, owner ruling 2026-10-26: the full-copy
# workflow templates are retired, and templates/workflows/* are callers).
#   - Compared: the SessionStart hook; every installed .github/scripts/<name>
#     that a directive at the pin names (derive-scripts.sh over directives/*.md:
#     test.md names browser-ladder.js and the package.json beside it), since
#     those are the only scripts a refresh installs; and, on a project marked
#     as on the house style (refresh-lib.sh -> refresh_house_style, #470),
#     styles/components.css and styles/components.js, with styles/tokens.css
#     checked by token name after the loop (TOKENS / MISSING).
#   - Named, never compared: every workflow (CALLER, or OWN when it calls no
#     shared workflow), and every installed copy of a composite or a script
#     that only the shared workflows use now (SHARED-COPY).
#   - Silent: a script with no template at the pin (the project's own; a
#     project keeps many), package-lock.json (generated, never shipped), and
#     the files under a UI-test kit directory -- kit-dirs.sh, the derivation
#     refresh-stamp.sh uses, plus .github/scripts/ui-tests named outright --
#     because kit-defects.sh and Phase 2's per-file kit diffs own the kit. A
#     file counts as the kit's only when the kit template ships that name: a
#     kit installed AT .github/scripts shares the directory with the scripts,
#     which stay classified (Codex, #451).
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
#   CALLER: <path>  a workflow that calls a shared workflow of this repo
#                   (refresh-lib.sh -> refresh_caller_of, #460 step 4): the
#                   project's, never compared, merged or overwritten.
#     PIN: <path>   follows each CALLER line: the commit its ref names (a SHA,
#                   or a tag such as v1, resolved now), and whether the shared
#                   workflow, templates/actions/ or templates/scripts/ changed
#                   from there to the pinned head. Unchanged is "functionally
#                   current"; changed names the paths a re-pin would take (the
#                   owner's call). Not a count of commits: the fetches are
#                   shallow (claude.prop refresh, 2026-10-25).
#   OWN: <path>     a workflow at a shipped template's name that calls no
#                   shared workflow: the project's own, never compared, merged
#                   or moved onto the caller here -- moving it is the owner's
#                   call for that project.
#   SHARED-COPY: <path>  a copy of a composite (once per directory) or of a
#                   script the shared workflows read from this repo at the
#                   called commit: not compared, and its line says which of the
#                   project's files still name it. Nothing names it: delete it.
#   NO-TEMPLATE / CANNOT-VERIFY / RETIRED, as before.
#   TOKENS: / MISSING: the house style's two files on a marked project (#470);
#   HOUSE-STYLE: one line on an unmarked one, which compares nothing there.
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

# The house style (#470): on a project marked as on it, styles/components.css and
# the shared page script styles/components.js (#471) are verbatim drop-ins like
# the rest, so they join the loop (a pin that predates the script reads it as
# NO-TEMPLATE); styles/tokens.css is
# checked by token NAME after the loop, because its values are the project's.
house=no
refresh_house_style && house=yes
house_cmp=
[ "$house" = yes ] && house_cmp="styles/components.css styles/components.js"

# pin_note <caller> <shared-<name>.yml@<ref>>: the PIN line. What a caller
# runs is the shared workflow plus the composites and scripts it fetches at the
# called commit, so all three are compared, by tree id, at both commits.
pin_note() {
  local wf=${2%%@*} ref=${2#*@} sha changed= p
  case "$ref" in
    *[!0-9a-f]*) sha= ;;
    *) [ "${#ref}" -eq 40 ] && sha=$ref ;;
  esac
  if [ -z "$sha" ]; then
    # A peeled annotated tag (`^{}`) wins over the tag object.
    sha=$(git ls-remote "$REFRESH_SRC" "refs/tags/$ref" "refs/tags/$ref^{}" "refs/heads/$ref" 2>/dev/null \
      | awk '$2 ~ /\^\{\}$/ { peeled = $1 } NR == 1 { first = $1 } END { print (peeled != "" ? peeled : first) }') || sha=
  fi
  if [ -z "$sha" ] || { ! git -C "$up" cat-file -e "$sha^{commit}" 2>/dev/null \
       && ! git -C "$up" fetch -q --depth=1 "$REFRESH_SRC" "$sha" 2>/dev/null; }; then
    echo "PIN: $1 calls $ref, which could not be resolved or fetched -- not compared with the head"
    return
  fi
  if [ "$sha" = "$pin" ]; then
    echo "PIN: $1 calls $ref, which is the pinned head"
    return
  fi
  for p in ".github/workflows/$wf" templates/actions templates/scripts; do
    [ "$(git -C "$up" rev-parse -q --verify "$sha:$p" 2>/dev/null)" = "$(git -C "$up" rev-parse -q --verify "$pin:$p" 2>/dev/null)" ] \
      || changed="$changed${changed:+, }$p"
  done
  if [ -z "$changed" ]; then
    echo "PIN: $1 calls $ref (${sha:0:12}); $wf, templates/actions and templates/scripts are unchanged from there to the head ${pin:0:12} -- functionally current"
  else
    echo "PIN: $1 calls $ref (${sha:0:12}); changed from there to the head ${pin:0:12}: $changed -- a re-pin would take them (the owner's call)"
  fi
}

# kept_note <path> <template>: the note a refresh_kept record earns this
# path, or nothing when none is bound to the template's blob at the pin.
kept_note() {
  # A divergence already decided: refresh-stamp.sh's refresh_kept record,
  # keyed by the local path, bound to the template's blob at the head -- so
  # one that upstream has since changed is a fresh question again (claude.prop
  # pilot, 2026-10-13). It is honoured only while it ALSO binds this file's
  # content: its `local` blob must equal the installed copy's, or a later
  # edit (or a replaced file) would inherit an old approval and go unreviewed
  # (Codex, #451). A record without `local` is shown but not honoured, and so
  # is one without a reason (a non-blank string), which the stamp would not
  # honour either.
  local b lb rec rl rest why short
  b=$(git -C "$up" rev-parse "$pin:$2" 2>/dev/null) || b=
  lb=$(git hash-object --no-filters -- "$1" 2>/dev/null) || lb=   # raw bytes, as the stamp
  rec=$(jq -r --arg p "$1" --arg b "$b" \
    '.refresh_kept[$p] | select(type == "object" and .blob == $b)
     | (.reason // "" | if type == "string" and test("\\S") then gsub("[\t\n\r]"; " ") else "" end) as $r
     | [(.local // ""), $r, (if ($r | length) > 60 then $r[0:60] + "..." else $r end)]
     | @tsv' \
    .claude/directive-sync.json 2>/dev/null) || rec=
  [ -n "$rec" ] || return 0
  # Every line quotes the reason cut to 60 characters (in jq, so never
  # mid-character): one of claude.prop's ran ~800 and buried the verdict,
  # first on the warning lines, then, on every refresh, on the line of a
  # record that binds (pilot, 2026-10-15). The full text is the record's,
  # one jq away. refresh-stamp.sh's KEPT lines cut the same way.
  rl=${rec%%$'\t'*} rest=${rec#*$'\t'}
  why=${rest%%$'\t'*} short=${rest#*$'\t'}
  if [ -z "$why" ]; then
    echo " (refresh_kept has a record but no reason -- review it, then re-record it with one)"
  elif [ -n "$rl" ] && [ "$rl" = "$lb" ]; then
    echo " (recorded in refresh_kept: $short)"
  elif [ -n "$rl" ]; then
    echo " (refresh_kept says \"$short\", but this file changed since it was recorded -- review it again)"
  else
    echo " (refresh_kept says \"$short\", but the record binds no local content -- review it, then re-record with its local blob)"
  fi
}

# The scripts a refresh installs: those a directive names, at the pin, by the
# SAME derivation refresh-stamp.sh and the install run (derive-scripts.sh). A
# directive that cannot be read leaves the set unknown, which is said, never
# read as "no script".
derive="$(dirname -- "${BASH_SOURCE[0]}")/derive-scripts.sh"
named=
if dlist=$(git -C "$up" ls-tree --name-only "$pin" -- directives/ 2>/dev/null) \
   && dbuf=$(mktemp); then
  dok=yes
  while IFS= read -r d; do
    case "$d" in directives/*.md) ;; *) continue ;; esac
    git -C "$up" show "$pin:$d" >>"$dbuf" 2>/dev/null || dok=no
    printf '\n' >>"$dbuf"
  done <<<"$dlist"
  [ "$dok" = yes ] && named=$(bash "$derive" <"$dbuf") || dok=no
  rm -f "$dbuf"
else
  dok=no
fi
[ "$dok" = yes ] || echo "CANNOT-VERIFY: the directives at $pin could not be read, so no script is compared this run (not DRIFT)"
named_script() { [ "$dok" = yes ] && grep -qxF -- "$1" <<<"$named"; }

# users_of <needle> <path to leave out>: the project's tracked files that name
# <needle>, comma-separated, or nothing. Literal, so a path is matched as text.
# A composite copy this run says to delete is left out too: its use of a script
# copy goes with it, so that copy reads as named by nothing.
gone=()
users_of() {
  git grep -lF -e "$1" -- . ":(exclude)$2" "${gone[@]}" 2>/dev/null | paste -sd, - | sed 's/,/, /g'
}
# shared_line <path> <what> <users>: one SHARED-COPY line.
shared_line() {
  if [ -n "$3" ]; then
    echo "SHARED-COPY: $1 — $2; not compared. Still named by: $3 -- keep it while they do"
  else
    echo "SHARED-COPY: $1 — $2; not compared. Nothing here names it: delete it in this refresh's PR"
  fi
}

n=0 same=0 stale=0 custom=0 drift=0 modes=0 callers=0 own=0 shared=0
shared_dirs=" "
# shellcheck disable=SC2086  # $house_cmp is two paths or nothing
for f in .github/workflows/*.yml .github/workflows/*.yaml .github/actions/*/* \
         .claude/hooks/session-start.sh .github/scripts/* \
         .github/workflow-ref-required.json .github/ui-suite-env-exempt.json $house_cmp; do
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
    # The watcher workflows, removed 2026-10-16 (#460): native session events
    # and qa-live.yml now cover what they did.
    .github/workflows/ci-monitor.yml|.github/workflows/ci-notify.yml|\
    .github/workflows/codex-monitor.yml|.github/workflows/pages-monitor.yml|\
    .github/workflows/pages-retry.yml)
      echo "RETIRED: $f — upstream deleted this watcher; delete it"
      continue ;;
    # The qa.yml guards and their inputs, removed 2026-10-16 (#460 step 2).
    .github/scripts/workflow-ref-guard.py|.github/scripts/check-job-bounds.py|\
    .github/scripts/check-py-warnings.py|.github/scripts/check-ui-suite-env.py|\
    .github/scripts/check-yaml-anchors.py|.github/scripts/gh_yaml.py|\
    .github/workflow-ref-required.json|.github/ui-suite-env-exempt.json)
      echo "RETIRED: $f — upstream deleted this guard; delete it, and its step in qa.yml if one remains"
      continue ;;
  esac
  # Workflows: a caller is the project's by design and runs what its pin names,
  # so the PIN line is its whole comparison; any other workflow is the
  # project's own. Neither is ever merged with a template: a 3-way merge would
  # pull a caller's template over the project's inputs, or a caller over a
  # workflow the owner kept.
  case "$f" in
    .github/workflows/*)
      if called=$(refresh_caller_of "$f"); then
        echo "CALLER: $f — calls $called; the project's, never compared, merged or overwritten (#460 step 4)"
        pin_note "$f" "$called"
        callers=$((callers + 1))
      elif git -C "$up" cat-file -e "$pin:templates/workflows/${f#.github/workflows/}" 2>/dev/null; then
        echo "OWN: $f — calls no shared workflow: the project's own, never compared, merged or moved onto templates/workflows/${f#.github/workflows/} (the caller) by a refresh; moving it is the owner's call"
        own=$((own + 1))
      else
        echo "NO-TEMPLATE: $f (project-specific — skip)"
      fi
      continue ;;
    .github/actions/*)
      a=${f#.github/actions/}; a=${a%%/*}
      case "$shared_dirs" in *" $a "*) continue ;; esac
      shared_dirs="$shared_dirs$a "
      if git -C "$up" cat-file -e "$pin:templates/actions/$a/action.yml" 2>/dev/null; then
        u=$(users_of "./.github/actions/$a" ".github/actions/$a")
        [ -n "$u" ] || gone+=(":(exclude).github/actions/$a")
        shared_line ".github/actions/$a/" "the shared workflows read templates/actions/$a from claude.directives at the called commit" "$u"
        shared=$((shared + 1))
      else
        echo "NO-TEMPLATE: .github/actions/$a/ (project-specific — skip)"
      fi
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
  if [ -n "$script" ] && ! named_script "$f"; then
    [ "$dok" = yes ] || continue   # the set is unknown: said once, above
    shared_line "$f" "no directive names it, and the shared workflows read $t from claude.directives at the called commit" "$(users_of "$f" "$f")"
    shared=$((shared + 1))
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
    echo "CUSTOM: $f$(kept_note "$f" "$t") — differs from the template at the stamp too: a local edit; 3-way: refresh-merge.sh $f"
    custom=$((custom + 1))
  fi
done
# The house style, after the loop (#470). A marked project REQUIRES its files:
# the marker says they are the house's, so an absent one is a gap to fill, not
# a piece the project never installed. tokens.css is compared by token name
# only (refresh-lib.sh -> refresh_token_names): a palette the owner ruled keeps
# its values, and a name the template added is what a refresh has to bring.
# An unmarked project gets one line and nothing compared: its stylesheets are
# its own until it moves (/design-intake), never at refresh time.
if [ "$house" = yes ]; then
  [ -f styles/components.css ] \
    || echo "MISSING: styles/components.css -- this project is on the house style (.claude/directive-sync.json -> house_style), so it is required; install templates/styles/components.css"
  # Required only where the pin ships it: a pin from before #471 has no script.
  if git -C "$up" cat-file -e "$pin:templates/styles/components.js" 2>/dev/null && [ ! -f styles/components.js ]; then
    echo "MISSING: styles/components.js -- this project is on the house style, so the shared page script is required; install templates/styles/components.js"
  fi
  if ! git -C "$up" cat-file -e "$pin:templates/styles/tokens.css" 2>/dev/null; then
    echo "NO-TEMPLATE: templates/styles/tokens.css is not shipped at $pin -- styles/tokens.css not compared"
  elif [ ! -f styles/tokens.css ]; then
    echo "MISSING: styles/tokens.css -- this project is on the house style, so it is required; install templates/styles/tokens.css, then set any value the owner ruled"
  else
    want=$(git -C "$up" cat-file blob "$pin:templates/styles/tokens.css" | refresh_token_names)
    lacks=$(LC_ALL=C comm -23 <(printf '%s\n' "$want") <(refresh_token_names <styles/tokens.css) | paste -sd ' ' -)
    total=$(printf '%s\n' "$want" | grep -c .)
    if [ -z "$lacks" ]; then
      echo "TOKENS: styles/tokens.css declares all $total house token names at $pin (the values are the project's)"
    else
      echo "TOKENS: styles/tokens.css lacks $(wc -w <<<"$lacks" | tr -d ' ') of $total house token names at $pin: $lacks -- add each; refresh-merge.sh styles/tokens.css brings them with the house values, which a ruled palette then sets"
    fi
  fi
else
  echo "HOUSE-STYLE: not marked (.claude/directive-sync.json -> house_style is not true) -- styles/ not compared; an existing project moves with /design-intake, never at refresh time"
fi
rm -rf "$up"
echo "SUMMARY: $n installed file(s) compared at $pin — $same match, $stale STALE, $custom CUSTOM, $drift DRIFT, $modes MODE$( [ "$callers" -gt 0 ] && printf ', %s CALLER' "$callers")$( [ "$own" -gt 0 ] && printf ', %s OWN' "$own")$( [ "$shared" -gt 0 ] && printf ', %s SHARED-COPY' "$shared")"
# Every refresh_kept FILE record whose `local` blob is missing or no longer the
# file's, kit files included: the CUSTOM lines above reach only the files this
# loop compares, so a kit record first surfaced as a stamp refusal (claude.prop
# pilot, 2026-10-15). Said once, up front, with the paths. Directory records
# (keys ending in `/`) bind a tree, not a local blob, and are not counted.
# Each key is read RAW (jq -j, one value per call), never through @tsv: @tsv
# escapes a backslash and `read -r` keeps the escape, so a key holding one
# hashed a path that does not exist and could never clear (Codex, #457).
stale_recs=
nrec=0
recs=$(jq -c '[.refresh_kept | if type == "object" then to_entries[] else empty end
               | select((.key | endswith("/") | not) and (.value | type == "object"))
               | {k: .key, l: (.value.local // "" | tostring)}]' \
  .claude/directive-sync.json 2>/dev/null) || recs='[]'
nk=$(printf '%s' "$recs" | jq 'length' 2>/dev/null) || nk=0
i=0
while [ "$i" -lt "${nk:-0}" ]; do
  # A trailing `.` sentinel, stripped after: command substitution drops trailing
  # newlines, and a path may end in one (Codex, #457).
  k=$(printf '%s' "$recs" | jq -j --argjson i "$i" '.[$i].k + "."'); k=${k%.}
  l=$(printf '%s' "$recs" | jq -j --argjson i "$i" '.[$i].l')
  i=$((i + 1))
  [ -n "$k" ] || continue
  if [ -e "$k" ]; then cur=$(git hash-object --no-filters -- "$k" 2>/dev/null) || cur=; else cur=absent; fi
  if [ -z "$l" ] || [ "$l" != "$cur" ]; then
    stale_recs="$stale_recs${stale_recs:+, }$k"
    nrec=$((nrec + 1))
  fi
done
if [ "$nrec" -gt 0 ]; then
  echo "RE-RECORD: $nrec refresh_kept file record(s) bind no current local content, kit files included -- the stamp refuses each whose file still differs from its template until it is re-recorded with its local blob (or dropped): $stale_recs"
fi
exit 0
