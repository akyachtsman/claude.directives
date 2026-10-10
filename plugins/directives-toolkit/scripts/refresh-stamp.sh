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
# A project's first refresh may have no sync file yet (/new-repo writes one only
# for some projects): start it empty, or the stamp below could never be written
# and Phase 2's verdict, consumed just below, would be lost with it.
[ -f .claude/directive-sync.json ] || { mkdir -p .claude && printf '{}\n' > .claude/directive-sync.json; }
last=$(jq -r '.upstream.sha // empty' .claude/directive-sync.json 2>/dev/null)
head=$(git ls-remote https://github.com/akyachtsman/claude.directives.git refs/heads/main | cut -f1)
marker=$(git rev-parse --git-path refresh-repo-classified)
classified_head=$(cat "$marker" 2>/dev/null) || classified_head=
rm -f "$marker"
delta_file=$(git rev-parse --git-path refresh-repo-delta)
delta_list=$(cat "$delta_file" 2>/dev/null) || delta_list=
rm -f "$delta_file"
# The verdict is only valid for the SHA it was made against. If upstream moved
# between the two Bash calls, or a stale marker survived an interrupted run,
# this mismatch makes Phase 3 refuse rather than stamp a delta nobody read.
classified=no
[ -n "$classified_head" ] && [ "$classified_head" = "$head" ] && classified=yes

# APPLIED, not just read (see above). One depth-1 fetch of $head serves every
# comparison and the upstream listing; a fetch that fails refuses the stamp.
# No `grep -q` fed by a pipe (the SIGPIPE hazard in Phase 1); `; true` keeps a
# no-match from ending the block under errexit.
unapplied=0; handled=" "; tree=no; kit_missing="
"
up=
if [ "$classified" = yes ]; then
  up=$(mktemp -d) || up=
  if [ -n "$up" ] && git init -q --bare "$up" \
     && git -C "$up" fetch -q --depth=1 https://github.com/akyachtsman/claude.directives.git "$head" \
     && shipped=$(git -C "$up" ls-tree -r --name-only "$head" -- templates directives); then
    tree=yes
  else
    echo "CANNOT VERIFY: the upstream tree at $head could not be fetched -- nothing compared"
    unapplied=1
  fi
fi

# check <local> <template> <why it is required>: compare one installed copy, honouring a blob-bound reason.
check() {
  handled="$handled$1 "
  if [ "$2" = deleted ]; then b=deleted; else b=$(git -C "$up" rev-parse "$head:$2" 2>/dev/null) || b=; fi
  kept=$(jq -r --arg p "$1" --arg b "$b" \
    '.refresh_kept[$p] | select(.blob == $b) | .reason // empty' \
    .claude/directive-sync.json 2>/dev/null) || kept=
  if [ -n "$kept" ]; then echo "KEPT: $1 -- $kept"; return; fi
  if [ "$b" = deleted ]; then
    echo "UNAPPLIED: $1 -- upstream deleted it (blob deleted)"; unapplied=1
  elif [ ! -e "$1" ]; then
    echo "UNAPPLIED: $1 is absent but required -- $3 (blob $b)"; unapplied=1
  elif ! git -C "$up" cat-file blob "$b" 2>/dev/null | cmp -s - "$1"; then
    echo "UNAPPLIED: $1 differs from $2 at $head (blob $b)"; unapplied=1
  fi
}

if [ "$tree" = yes ]; then
  # The kit's installed location, exactly as Kit defects derives it.
  kit_dirs=$(grep -hE '^[[:space:]]*UI_TESTS_DIR:' .github/workflows/*.yml .github/workflows/*.yaml 2>/dev/null \
    | sed -E -e 's/^[[:space:]]*UI_TESTS_DIR:[[:space:]]*//' \
             -e '/^"/{s/^"((\\.|[^"\\])*)".*$/\1/;s/\\(["\\])/\1/g;b' -e '}' \
             -e '/^\x27/{s/^\x27((\x27\x27|[^\x27])*)\x27.*$/\1/;s/\x27\x27/\x27/g;b' -e '}' \
             -e 's/[[:space:]]+#.*$//' -e 's/[[:space:]]+$//' | sed -E 's#/+$##' | sort -u; true)
  [ -n "$kit_dirs" ] || { [ -d .github/scripts/ui-tests ] && kit_dirs=.github/scripts/ui-tests; }

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
          p="$k/${t#templates/ui-tests/}"
          [ "$st" = D ] && { [ -e "$p" ] && check "$p" deleted; continue; }
          check "$p" "$t" "the kit is installed"
        done <<KITS
$kit_dirs
KITS
        continue ;;
      templates/workflows/*)    p=".github/workflows/${t#templates/workflows/}"; need= ;;
      templates/actions/*)      p=".github/actions/${t#templates/actions/}"; a=${t#templates/actions/}
                                need=; [ -d ".github/actions/${a%%/*}" ] && need="its composite is installed" ;;
      templates/scripts/*)      p=".github/scripts/${t#templates/scripts/}"; need= ;;   # dependency pass decides absence
      templates/claude-hooks/*) p=".claude/hooks/${t#templates/claude-hooks/}"
                                need=; [ -f .claude/settings.json ] && need="the settings row runs it" ;;
      *) continue ;;   # merged, written once, or not installed: see the table above
    esac
    if [ "$st" = D ]; then
      [ -e "$p" ] && check "$p" deleted
      continue
    fi
    if [ ! -e "$p" ] && [ -z "$need" ]; then
      case "$t" in templates/scripts/*) ;; *) echo "absent locally, not compared: $p" ;; esac
      continue
    fi
    check "$p" "$t" "$need"
  done <<DELTA
$delta_list
DELTA

  # 2. Every dependency, delta or not.
  deps=; queue=; seen=" "
  scan() {   # names in $1: scripts into deps, composites onto the queue
    deps="$deps
$(printf '%s\n' "$1" | grep -oE '\.github/scripts/[A-Za-z0-9_./-]+' | sed -E 's/[.]+$//' | grep -E '\.(js|py)$|^\.github/scripts/package\.json$'; true)"
    queue="$queue $(printf '%s\n' "$1" | grep -oE '\./\.github/actions/[A-Za-z0-9_.-]+' | sed 's|^\./||' | tr '\n' ' '; true)"
  }
  for w in .github/workflows/* .github/actions/*/action.yml; do
    [ -f "$w" ] && scan "$(cat "$w")"
  done
  for a in .github/actions/*/; do [ -d "$a" ] && queue="$queue ${a%/}"; done
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
$k/${f#templates/ui-tests/}"
    done <<FILES
$kit_files
FILES
  done <<KITS
$kit_dirs
KITS
  for d in global git design test data; do
    scan "$(git -C "$up" show "$head:directives/$d.md" 2>/dev/null; true)"
  done
  while [ -n "${queue// /}" ]; do
    # shellcheck disable=SC2086  # deliberate word-split of the queue
    set -- $queue; a=$1; shift; queue="$*"
    case "$seen" in *" $a "*) continue ;; esac
    seen="$seen$a "
    t="templates/actions/${a#.github/actions/}"
    files=$(printf '%s\n' "$shipped" | grep -F "$t/"; true)
    [ -n "$files" ] || continue   # not an upstream composite: the project's own
    deps="$deps
$(printf '%s\n' "$files" | sed "s|^templates/actions/|.github/actions/|")"
    scan "$(git -C "$up" show "$head:$t/action.yml" 2>/dev/null; true)"
  done
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    case "$handled" in *" $p "*) continue ;; esac   # already checked from the delta
    # A path under a kit directory is a KIT file, whose template is
    # templates/ui-tests/, not templates/scripts/ (Codex, #397).
    t=
    while IFS= read -r k; do
      [ -n "$k" ] || continue
      case "$p" in "$k"/*) t="templates/ui-tests/${p#"$k"/}" ;; esac
    done <<KITS
${kit_dirs:-.github/scripts/ui-tests}
KITS
    [ -n "$t" ] || case "$p" in
      .github/scripts/*) t="templates/scripts/${p#.github/scripts/}" ;;
      .github/actions/*) t="templates/actions/${p#.github/actions/}" ;;
      *) continue ;;
    esac
    grep -qxF "$t" <<<"$shipped" || continue   # not shipped upstream: the project's own
    check "$p" "$t" "an installed composite or kit ships it, or something installed or a directive names it"
  done <<DEPS
$(printf '%s\n' "$deps" | sort -u)
DEPS
  # The lockfile that package.json needs. It is generated, never shipped, so
  # it is checked for PRESENCE, not compared: cron-notify.yml's setup-node cache
  # names it, and without it the job fails before its own install (Codex, #409).
  if printf '%s\n' "$deps" | grep -qxF .github/scripts/package.json \
     && [ ! -f .github/scripts/package-lock.json ]; then
    echo "UNAPPLIED: .github/scripts/package-lock.json is absent but required -- run npm install in .github/scripts and commit it"
    unapplied=1
  fi

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
fi
[ -n "$up" ] && rm -rf "$up"

if [ -z "$head" ]; then
  echo "upstream head unavailable this run — stamp unchanged, re-run /refresh-repo later"
elif [ "$classified" != "yes" ]; then
  echo "delta from $last to $head was NOT classified for THIS head — stamp"
  echo "left at $last on purpose, so the next run re-examines it. Classify by hand"
  echo "via MAINTAIN-REPO-USER-INSTRUCTIONS.md → Propagation Matrix to clear it."
elif [ "$unapplied" = 1 ]; then
  echo "stamp left at $last: the paths above are unapplied -- they differ from the"
  echo "template at $head, or are required and absent. Apply each one, or record why"
  echo "it stays (refresh_kept for a file, refresh_declined for a settings entry,"
  echo "above), then re-run /refresh-repo. Stamping now would hide them from every"
  echo "later delta."
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
    echo "stamped: $head"
  else
    [ -n "$tmp" ] && rm -f "$tmp"
    echo "COULD-NOT-STAMP: .claude/directive-sync.json left unchanged; report it"
  fi
fi
