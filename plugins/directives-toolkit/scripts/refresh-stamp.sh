#!/usr/bin/env bash
# refresh-stamp.sh — /refresh-repo Phase 3: verify the delta was APPLIED, then
# stamp. Run from the project root:
#   bash "${CLAUDE_PLUGIN_ROOT}/scripts/refresh-stamp.sh"
# The rules it enforces, and what a clean run does and does not prove, are in
# commands/refresh-repo.md -> Phase 3; this file is only the mechanism.
#
# WHY A FILE, NOT A FENCED BLOCK IN THE COMMAND. Claude Code substitutes a
# command's arguments into its text on load: `$ARGUMENTS` always; `$N` counted
# from 0 (`$0` is the first argument), each only when that argument exists; and
# `${CLAUDE_PLUGIN_ROOT}` with the plugin's install path (measured 2026-10-09 by
# loading a plugin skill with two arguments: `$1` became the SECOND). check() and
# scan() below take positional parameters, so `/refresh-repo a b` rewrote `$1`
# into a literal and the guard compared the wrong paths. A file on disk is never
# substituted.
#
# Self-contained: every Bash call is a fresh shell, so it re-derives what it
# needs and reads Phase 2's verdict from the marker files Phase 2 leaves.
# RE-DERIVED, not inherited. Every Bash call is a FRESH SHELL, so $head/$last/
# $classified set in Phase 2's block are all empty here — the guard would take
# the "upstream head unavailable" branch every time and the stamp could NEVER
# advance. Phase 2 leaves its verdict in a file for exactly this reason.
#
# EXIT STATUS. 0 stamped; 1 REFUSED (a finding above the last line, or the
# delta was not classified for this head); 2 could not run (upstream
# unreachable, or the write failed). It once exited 0 either way, so a caller
# had to parse the last line to learn the stamp had not moved (pilots,
# 2026-10-13).
#
# THE VERDICT SURVIVES A REFUSAL. Phase 2's markers are read here and removed
# only once the stamp is WRITTEN. This file once deleted them on entry, so a
# refused run -- the usual first one, before a refresh_kept reason is
# recorded -- burned the verdict, and the re-run said "NOT classified" until
# refresh-delta.sh ran again (pilots, 2026-10-13). Keeping them is safe because
# each is bound: to the head it classified (an upstream that moved refuses)
# and to the stamp it was listed from (a stamp changed since, by a pull or a
# merge, refuses too).
# shellcheck source=refresh-lib.sh
. "$(dirname -- "${BASH_SOURCE[0]}")/refresh-lib.sh" \
  || { echo "refresh-lib.sh not loadable — stamp unchanged"; exit 2; }
# A project's first refresh may have no sync file yet (/new-repo writes one only
# for some projects): start it empty, or the stamp below could never be written.
[ -f .claude/directive-sync.json ] || { mkdir -p .claude && printf '{}\n' > .claude/directive-sync.json; }
last=$(jq -r '.upstream.sha // empty' .claude/directive-sync.json 2>/dev/null)
head=$(refresh_head)
marker=$(refresh_marker classified)
classified_head=$(cat "$marker" 2>/dev/null) || classified_head=
base_file=$(refresh_marker base)
classified_base=$(cat "$base_file" 2>/dev/null) || classified_base=
delta_file=$(refresh_marker delta)
delta_list=$(cat "$delta_file" 2>/dev/null) || delta_list=
# The verdict is only valid for the SHA it was made against, and from the stamp
# it was listed from. If upstream moved between the two Bash calls, a stale
# marker survived an interrupted run, or the stamp changed underneath it, this
# mismatch makes Phase 3 refuse rather than stamp a delta nobody read.
classified=no
[ -n "$classified_head" ] && [ "$classified_head" = "$head" ] \
  && [ "$classified_base" = "$last" ] && classified=yes

# APPLIED, not just read (see above). One depth-1 fetch of $head serves every
# comparison and the upstream listing; a fetch that fails refuses the stamp.
# No `grep -q` fed by a pipe (the SIGPIPE hazard in Phase 1); `; true` keeps a
# no-match from ending the block under errexit.
unapplied=0; fetch_failed=0; handled=" "; tree=no; kit_missing="
"
up=
if [ "$classified" = yes ]; then
  up=$(mktemp -d) || up=
  if [ -n "$up" ] && git init -q --bare "$up" \
     && git -C "$up" fetch -q --depth=1 "$REFRESH_SRC" "$head" \
     && shipped=$(git -C "$up" ls-tree -r --name-only "$head" -- templates directives); then
    tree=yes
  else
    echo "CANNOT VERIFY: the upstream tree at $head could not be fetched -- nothing compared"
    unapplied=1 fetch_failed=1
  fi
fi

# kit_dir_kept <kit dir> <kit template path>: print the reason of a refresh_kept
# entry that declines a whole kit SUBDIRECTORY holding this file, if one binds.
# Owner ruling 2026-10-13: kit files stay required, but declining a directory is
# one step -- a project that keeps the helpers inline in its spec wrote one
# entry per tests/lib/ file. The entry is keyed by the directory with a
# trailing `/`, either as installed (`<kit dir>/tests/lib/`, that kit only) or
# as shipped (`templates/ui-tests/tests/lib/`, every kit), and binds to the
# directory's git TREE id at the head, the directory's counterpart of a file's
# blob: any change under it re-asks. AND to the installed directory's own tree
# (`local`, refresh-lib.sh -> refresh_local_tree; `absent` when it holds no
# file), the counterpart of a file record's `local`: an edit under a declined
# directory re-asks too. A record without `local` binds nothing (claude.insurance,
# #460's batch list). The kit ROOT is never a key: declining the
# whole kit in one line is the wholesale skip the per-file row exists to stop.
kit_dir_kept() {
  local rel d tr lt why
  rel=${2#templates/ui-tests/}
  d=$(dirname -- "$rel")
  while [ "$d" != . ] && [ "$d" != / ]; do
    tr=$(git -C "$up" rev-parse "$head:templates/ui-tests/$d" 2>/dev/null) || tr=
    # The local tree is measured only when a record names this upstream tree.
    if [ -n "$tr" ] && jq -e --arg lk "$1/$d/" --arg tk "templates/ui-tests/$d/" --arg t "$tr" \
         'any(.refresh_kept[$lk], .refresh_kept[$tk]; type == "object" and .tree == $t)' \
         .claude/directive-sync.json >/dev/null 2>&1 \
       && lt=$(refresh_local_tree "$(refresh_kit_join "$1" "$d")"); then
      why=$(jq -r --arg lk "$1/$d/" --arg tk "templates/ui-tests/$d/" --arg t "$tr" --arg l "$lt" \
        '[.refresh_kept[$lk], .refresh_kept[$tk]]
         | map(select(type == "object" and .tree == $t and .local == $l and $l != ""))
         | .[0].reason // empty | select(type == "string" and test("\\S"))
         | if length > 60 then .[0:60] + "..." else . end' \
        .claude/directive-sync.json 2>/dev/null) || why=
      if [ -n "$why" ]; then printf '(directory %s/) %s\n' "$d" "$why"; return 0; fi
    fi
    d=$(dirname -- "$d")
  done
  return 1
}

# kept_reason <local> <blob> <local blob>: print the reason of the refresh_kept
# record that binds this path to BOTH blobs, cut to 60 characters, if one does.
# check() and check_tokens() read records the one way (see check() for why).
kept_reason() {
  jq -r --arg p "$1" --arg b "$2" --arg l "$3" \
    '.refresh_kept[$p] | select(type == "object" and .blob == $b and .local == $l and $l != "")
     | .reason // empty | select(type == "string" and test("\\S"))
     | if length > 60 then .[0:60] + "..." else . end' \
    .claude/directive-sync.json 2>/dev/null
}

# check_tokens <local> <template>: the house tokens.css on a marked project
# (#470). Not a byte comparison: the values are the project's (a palette the
# owner ruled), so what must hold is that every token NAME the template declares
# is declared locally (refresh-lib.sh -> refresh_token_names). A name upstream
# added and the project lacks would leave var(--that) unset in the house
# components.css, which the project takes verbatim. Required when absent, like
# a composite's file; a refresh_kept record bound to both blobs declines it.
check_tokens() {
  handled="$handled$1 "
  local b lb kept lacks
  b=$(git -C "$up" rev-parse "$head:$2" 2>/dev/null) || b=
  if [ -e "$1" ]; then lb=$(git hash-object --no-filters -- "$1" 2>/dev/null) || lb=; else lb=absent; fi
  kept=$(kept_reason "$1" "$b" "$lb") || kept=
  if [ -n "$kept" ]; then echo "KEPT: $1 -- $kept"; return; fi
  if [ ! -e "$1" ]; then
    echo "UNAPPLIED: $1 is absent but required -- the project is on the house style (.claude/directive-sync.json -> house_style) (blob $b) (local $lb)"
    unapplied=1; return
  fi
  lacks=$(LC_ALL=C comm -23 <(git -C "$up" cat-file blob "$b" 2>/dev/null | refresh_token_names) \
                            <(refresh_token_names <"$1") | paste -sd ' ' -)
  [ -n "$lacks" ] || return
  echo "UNAPPLIED: $1 lacks house token name(s) $2 declares at $head: $lacks -- add each (the value is the project's) (blob $b) (local $lb)"
  unapplied=1
}

# check <local> <template> <why it is required> [<kit dir>]: compare one
# installed copy, honouring a blob-bound reason -- or, for a kit file (the
# fourth argument names its kit), a tree-bound one on a directory above it.
dir_hints=" "
check() {
  handled="$handled$1 "
  if [ "$2" = deleted ]; then b=deleted; else b=$(git -C "$up" rev-parse "$head:$2" 2>/dev/null) || b=; fi
  # A record binds only while it ALSO names the installed copy's content: its
  # `local` blob (`absent` for a file not installed) must equal this file's, so
  # a later edit or a replaced file never inherits an old approval. A record
  # without `local` (written before it existed) binds nothing and refuses; every
  # refusal prints the value to record (Codex, #451). A reason must be a
  # non-blank string, as kit_dir_kept requires. refresh-drift.sh reads it the
  # same way. Both KEPT forms quote it cut to 60 characters, as drift does: a
  # deliberate divergence otherwise printed ~900 characters on every refresh
  # (claude.prop pilot, 2026-10-15). The full text stays in the record.
  # --no-filters: the blob of the bytes on disk, the bytes `cmp` checks below --
  # never after core.autocrlf or a clean filter, which can map two different
  # files to one id (Codex, #451).
  if [ -e "$1" ]; then lb=$(git hash-object --no-filters -- "$1" 2>/dev/null) || lb=; else lb=absent; fi
  kept=$(kept_reason "$1" "$b" "$lb") || kept=
  if [ -n "$kept" ]; then echo "KEPT: $1 -- $kept"; return; fi
  if [ -n "${4:-}" ] && [ "$b" != deleted ] && kept=$(kit_dir_kept "$4" "$2"); then
    echo "KEPT: $1 -- $kept"; return
  fi
  if [ "$b" = deleted ]; then
    echo "UNAPPLIED: $1 -- upstream deleted it (blob deleted) (local $lb)"; unapplied=1
  elif [ ! -e "$1" ]; then
    echo "UNAPPLIED: $1 is absent but required -- $3 (blob $b) (local $lb)"; unapplied=1
  elif ! git -C "$up" cat-file blob "$b" 2>/dev/null | cmp -s - "$1"; then
    echo "UNAPPLIED: $1 differs from $2 at $head (blob $b) (local $lb)"; unapplied=1
  else
    return
  fi
  # A kit file below the kit root: name the one-step decline for its directory,
  # once per directory.
  if [ -n "${4:-}" ] && [ "$b" != deleted ]; then
    local d tr lt
    d=$(dirname -- "${2#templates/ui-tests/}")
    case "$dir_hints" in *" $4/$d/ "*) return ;; esac
    if [ "$d" != . ] && tr=$(git -C "$up" rev-parse "$head:templates/ui-tests/$d" 2>/dev/null); then
      dir_hints="$dir_hints$4/$d/ "
      if lt=$(refresh_local_tree "$(refresh_kit_join "$4" "$d")"); then
        echo "  (to decline all of $4/$d/ at once: one refresh_kept entry keyed \"$4/$d/\" with tree $tr and local $lt)"
      else
        echo "  (to decline all of $4/$d/ at once: one refresh_kept entry keyed \"$4/$d/\" with tree $tr -- its local tree could not be measured)"
      fi
    fi
  fi
}

if [ "$tree" = yes ]; then
  # The kit's installed location, from the SAME file Kit defects runs.
  kit_dirs=$(bash "$(dirname "${BASH_SOURCE[0]}")/kit-dirs.sh")

  # Workflows and composites are never installed by a refresh (Phase E of #460
  # step 4, owner ruling 2026-10-26): a project's workflows are callers, or its
  # own, and the composites and the shared scripts are read from
  # claude.directives at the called commit. So the delta's templates/workflows/
  # and templates/actions/ paths are not compared here, a script is compared
  # only when a directive names it (pass 2), and nothing a caller does not name
  # is required. refresh-drift.sh names each workflow and each stale copy.
  # 1. Every path the delta lists.
  while IFS=$(printf '\t') read -r st t; do
    [ -n "${t:-}" ] || continue
    case "$t" in
      templates/ui-tests/package-lock.json) continue ;;   # never touched (row above)
      templates/ui-tests/*)
        while IFS= read -r k; do
          [ -n "$k" ] || continue
          if [ ! -d "$k" ]; then
            case "$kit_missing" in *"
$k
"*) ;; *) echo "CANNOT VERIFY: kit dir $k is named by a workflow but missing"; unapplied=1
                     kit_missing="$kit_missing$k
" ;; esac
            continue
          fi
          p=$(refresh_kit_join "$k" "${t#templates/ui-tests/}")
          [ "$st" = D ] && { [ -e "$p" ] && check "$p" deleted; continue; }
          check "$p" "$t" "the kit is installed" "$k"
        done <<KITS
$kit_dirs
KITS
        continue ;;
      templates/workflows/* | templates/actions/*) continue ;;   # never installed (above)
      templates/scripts/*) continue ;;   # pass 2: only the scripts a directive names
      templates/claude-hooks/*) p=".claude/hooks/${t#templates/claude-hooks/}"
                                need=; [ -f .claude/settings.json ] && need="the settings row runs it" ;;
      templates/styles/*) continue ;;   # pass 4 below, every run, marked projects only
      *) continue ;;   # merged, written once, or not installed: see the table above
    esac
    if [ "$st" = D ]; then
      [ -e "$p" ] && check "$p" deleted
      continue
    fi
    if [ ! -e "$p" ] && [ -z "$need" ]; then
      echo "absent locally, not compared: $p"
      continue
    fi
    check "$p" "$t" "$need"
  done <<DELTA
$delta_list
DELTA

  # 2. Every dependency, delta or not: the scripts a directive names, and every
  # installed kit as its whole upstream directory.
  deps=
  # The script set comes from derive-scripts.sh, the SAME file Phase 2's install
  # derivation runs, so this check can never be wider or narrower than the
  # install (#398). A derivation that fails refuses the stamp: read as "no
  # scripts", it would pass every dependency it never saw.
  derive="$(dirname "${BASH_SOURCE[0]}")/derive-scripts.sh"
  scan() {   # the scripts named in $1, into deps
    local d
    if ! d=$(printf '%s\n' "$1" | bash "$derive"); then
      echo "CANNOT VERIFY: the script derivation ($derive) failed"
      unapplied=1
    fi
    deps="$deps
$d"
  }
  # Every installed kit, as its whole upstream directory (see above).
  kit_files=$(printf '%s\n' "$shipped" | grep '^templates/ui-tests/' | grep -vxF templates/ui-tests/package-lock.json; true)
  while IFS= read -r k; do
    [ -n "$k" ] || continue
    if [ ! -d "$k" ]; then
      case "$kit_missing" in *"
$k
"*) ;; *) echo "CANNOT VERIFY: kit dir $k is named by a workflow but missing"; unapplied=1 ;; esac
      continue
    fi
    # Plain string surgery, never `sed` with $k in the replacement: a legal path
    # character such as `&` or `|` is sed syntax there (Codex, #404).
    while IFS= read -r f; do
      [ -n "$f" ] && deps="$deps
$(refresh_kit_join "$k" "${f#templates/ui-tests/}")"
    done <<FILES
$kit_files
FILES
  done <<KITS
$kit_dirs
KITS
  for d in $(printf '%s\n' "$shipped" | grep -E '^directives/[^/]+\.md$'; true); do
    if ! dtext=$(git -C "$up" show "$head:$d" 2>/dev/null); then
      echo "CANNOT VERIFY: $d at $head could not be read, so the scripts it names are unknown"
      unapplied=1
      continue
    fi
    scan "$dtext"
  done
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    case "$handled" in *" $p "*) continue ;; esac   # already checked from the delta
    # A path under a kit directory is a KIT file, whose template is
    # templates/ui-tests/, not templates/scripts/ (Codex, #397).
    # Under a kit, but the kit's only when templates/ui-tests ships the name
    # (refresh-lib.sh -> refresh_kit_rel; Codex, #451).
    t= pk=
    while IFS= read -r k; do
      [ -n "$k" ] || continue
      rel=$(refresh_kit_rel "$p" "$k") \
        && git -C "$up" cat-file -e "$head:templates/ui-tests/$rel" 2>/dev/null \
        && { t="templates/ui-tests/$rel" pk=$k; }
    done <<KITS
${kit_dirs:-.github/scripts/ui-tests}
KITS
    [ -n "$t" ] || case "$p" in
      .github/scripts/*) t="templates/scripts/${p#.github/scripts/}" ;;
      *) continue ;;
    esac
    grep -qxF "$t" <<<"$shipped" || continue   # not shipped upstream: nothing to install
    check "$p" "$t" "an installed kit ships it, or a directive names it" "$pk"
  done <<DEPS
$(printf '%s\n' "$deps" | sort -u)
DEPS

  # 3. .claude/settings.json, as sets (see above).
  st_tpl=$(git -C "$up" show "$head:templates/claude-settings.json" 2>/dev/null) || st_tpl=
  if [ -z "$st_tpl" ]; then
    :   # no settings template at this head: nothing to compare
  elif [ ! -f .claude/settings.json ]; then
    echo "absent locally, not compared: .claude/settings.json"
  elif ! st_out=$(jq -r --argjson t "$st_tpl" \
        --argjson d "$(jq -c '.refresh_declined // {}' .claude/directive-sync.json 2>/dev/null || echo '{}')" '
      def held($l; $ks; $e): any($ks[]; . as $k | any(($l.permissions[$k] // [])[]; . == $e));
      . as $l
      | ( ( {allow: ["allow","ask","deny"], ask: ["ask","deny"], deny: ["deny"]} | to_entries[] ) as $r
          | ($t.permissions[$r.key] // [])[] as $e
          | select(held($l; $r.value; $e) | not)
          | {s: ("permissions." + $r.key), e: $e} ),
        ( ($t.enabledPlugins // {}) | to_entries[] as $p
          | select(($l.enabledPlugins // {})[$p.key] != $p.value)
          | {s: "enabledPlugins", e: "\($p.key)=\($p.value | tojson)"} ),
        ( ($t.extraKnownMarketplaces // {}) | to_entries[] as $m
          | select(($l.extraKnownMarketplaces // {})[$m.key] != $m.value)
          | {s: "extraKnownMarketplaces", e: "\($m.key)=\($m.value | tojson)"} )
      | . as $x | ($d[$x.s][$x.e] // "") as $why
      | if ($why | type) == "string" and ($why | test("\\S")) then "KEPT\t\($x.s)\t\($x.e)\t\($why | gsub("[\t\n\r]"; " "))"
        else "MISSING\t\($x.s)\t\($x.e)" end' .claude/settings.json); then
    echo "CANNOT VERIFY: .claude/settings.json (or the template at $head) is not readable JSON"
    unapplied=1
  else
    while IFS=$(printf '\t') read -r kind sec e why; do
      [ -n "${kind:-}" ] || continue
      if [ "$kind" = KEPT ]; then
        echo "KEPT: .claude/settings.json $sec $e -- $why"
      else
        echo "UNAPPLIED: .claude/settings.json lacks $sec entry: $e (templates/claude-settings.json at $head)"
        unapplied=1
      fi
    done <<SETTINGS
$st_out
SETTINGS
    # Every LOCAL allow entry the template does not carry needs a recorded
    # reason (Codex, #404). allow is the one section that grants anything, so an
    # unexplained extra there is how a narrowed template fails to arrive: an
    # entry the template dropped looks exactly like a local addition. Judged on
    # the current file and template alone, so no history can hide one.
    if ! extra=$(jq -r --argjson t "$st_tpl" \
          --argjson d "$(jq -c '.refresh_declined // {}' .claude/directive-sync.json 2>/dev/null || echo '{}')" '
        (.permissions.allow // [])[] as $e
        | select(any(($t.permissions.allow // [])[]; . == $e) | not)
        | ($d["permissions.allow (local extra)"][$e] // "") as $why
        | if ($why | type) == "string" and ($why | test("\\S"))
          then "KEPT\t\($e)\t\($why | gsub("[\t\n\r]"; " "))" else "EXTRA\t\($e)" end' .claude/settings.json 2>/dev/null); then
      echo "CANNOT VERIFY: the local allow entries could not be read"
      unapplied=1
    else
      while IFS=$(printf '\t') read -r kind e why; do
        [ -n "${kind:-}" ] || continue
        if [ "$kind" = KEPT ]; then
          echo "KEPT: .claude/settings.json allows $e -- $why"
        else
          echo "UNAPPLIED: .claude/settings.json allows $e, which the template at $head does not carry -- remove it, or record why it stays"
          unapplied=1
        fi
      done <<EXTRA
$extra
EXTRA
    fi
  fi

  # 4. The house style (#470), every run, delta or not -- like the settings
  # pass, because neither file waits for upstream to change it: a project that
  # deleted one, or moved before a token was added, is broken today. Only a
  # project MARKED as on it (refresh-lib.sh -> refresh_house_style): an older
  # starter copy cannot be told from a customised house one, and moving a
  # project is /design-intake's, never a refresh's.
  if refresh_house_style; then
    if grep -qxF templates/styles/components.css <<<"$shipped"; then
      check styles/components.css templates/styles/components.css \
        "the project is on the house style (.claude/directive-sync.json -> house_style)"
    else
      echo "not shipped at $head, not compared: templates/styles/components.css"
    fi
    if grep -qxF templates/styles/components.js <<<"$shipped"; then
      check styles/components.js templates/styles/components.js \
        "the project is on the house style (.claude/directive-sync.json -> house_style)"
    else
      echo "not shipped at $head, not compared: templates/styles/components.js"
    fi
    if grep -qxF templates/styles/tokens.css <<<"$shipped"; then
      check_tokens styles/tokens.css templates/styles/tokens.css
    else
      echo "not shipped at $head, not compared: templates/styles/tokens.css"
    fi
  else
    echo "not on the house style (.claude/directive-sync.json -> house_style is not true): styles/ not compared"
  fi
fi
[ -n "$up" ] && rm -rf "$up"

if [ -z "$head" ]; then
  echo "upstream head unavailable this run — stamp unchanged, re-run /refresh-repo later"
  exit 2
elif [ "$classified" != "yes" ]; then
  echo "delta from $last to $head was NOT classified for THIS head — stamp"
  echo "left at $last on purpose, so the next run re-examines it. Re-run"
  echo "refresh-delta.sh (Phase 2) to classify this head, or classify by hand"
  echo "via MAINTAIN-REPO-USER-INSTRUCTIONS.md → Propagation Matrix to clear it."
  exit 1
elif [ "$fetch_failed" = 1 ]; then
  # Could not run, not a refusal: nothing was compared, so there is nothing to
  # apply or decline (Codex, #449). Phase 2's verdict is kept for the re-run.
  echo "upstream tree unavailable this run — stamp left at $last, nothing compared;"
  echo "re-run this script later (Phase 2's verdict is kept)"
  exit 2
elif [ "$unapplied" = 1 ]; then
  echo "stamp left at $last: the paths above are unapplied -- they differ from the"
  echo "template at $head, or are required and absent. Apply each one, or record why"
  echo "it stays (refresh_kept for a file or a kit subdirectory, refresh_declined for"
  echo "a settings entry, above), then re-run this script -- Phase 2's verdict is"
  echo "kept, so refresh-delta.sh need not run again. Stamping now would hide them"
  echo "from every later delta."
  exit 1
elif [ "$last" = "$head" ]; then
  # Already stamped at this head: leave the file byte-identical. Rewriting it
  # only moved `synced` to today, so a refresh that changed nothing left a
  # one-line diff for the stop hook to flag (owner ruling, 2026-10-14, claude.prop
  # pilot). `synced` is the date the sha last CHANGED, not the last check.
  rm -f "$marker" "$base_file" "$delta_file"
  echo "stamped: $head (unchanged; file not rewritten)"
else
  # mktemp in the DESTINATION dir: a fixed /tmp name races a second session, and
  # a cross-filesystem mv degrades from an atomic rename to a copy — which is the
  # partial-write hazard this same file warns about under Phase 1.5.
  tmp=$(mktemp .claude/.directive-sync.XXXXXX) || tmp=''
  if [ -n "$tmp" ] \
     && jq --arg sha "$head" --arg d "$(date -u +%F)" \
          '.upstream = {sha: $sha, synced: $d}' .claude/directive-sync.json > "$tmp" \
     && [ -s "$tmp" ] \
     && mv "$tmp" .claude/directive-sync.json; then
    # Consumed only now: the verdict has done its job.
    rm -f "$marker" "$base_file" "$delta_file"
    echo "stamped: $head"
  else
    [ -n "$tmp" ] && rm -f "$tmp"
    echo "COULD-NOT-STAMP: .claude/directive-sync.json left unchanged; report it"
    exit 2
  fi
fi
exit 0
