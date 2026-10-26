#!/usr/bin/env bash
# refresh-callers.sh — the caller set for *Deriving the referenced-script set*
# (commands/refresh-repo.md): every upstream workflow, composite and directive
# this refresh INSTALLS, one upstream path per line. Run from the project root:
#   bash "${CLAUDE_PLUGIN_ROOT}/scripts/refresh-callers.sh" [upstream caller...]
#
# The set is the changed callers AND the ones co-installed unchanged, never the
# delta alone (the command says why). Computed, so the block that fetches them
# runs as written instead of carrying a placeholder to fill in by hand:
#   - every .github/workflows/*.yml and .github/actions/*/action.yml installed
#     here whose template upstream ships at the pinned head (a project's own
#     workflow has none, and fetching it would fail the derivation) -- except a
#     workflow that CALLS a shared workflow (refresh-lib.sh ->
#     refresh_caller_of, #460 step 4). The refresh keeps a caller and installs
#     nothing over it, and the composites and scripts its template reaches
#     come from claude.directives at run time, so deriving them from the
#     template would offer back exactly the files the project deleted when it
#     moved to callers (claude.prop pilot, 2026-10-25). Each one skipped is
#     named on stderr;
#   - every composite those reach by `uses: ./.github/actions/<a>`, read from
#     the UPSTREAM text being installed, transitively -- a new `uses:` line is
#     exactly what the installed copy does not yet show;
#   - every directives/*.md upstream ships (all are read live, so all count);
#   - each argument: an upstream caller this refresh newly installs (a workflow
#     absent locally that the refresh rules let in). Only you can decide that,
#     so the delta's absent callers are listed on stderr, never added.
# At the revision every phase reads (refresh-lib.sh -> refresh_pin), printed on
# stderr. Exit 2, printing nothing on stdout, when the set cannot be computed
# or an argument is not an upstream caller: a partial set derives a partial
# install, which is the fail-open the derivation exists to prevent.
# shellcheck source=refresh-lib.sh
. "$(dirname -- "${BASH_SOURCE[0]}")/refresh-lib.sh" \
  || { echo "refresh-callers: refresh-lib.sh not loadable" >&2; exit 2; }
if ! refresh_pin; then
  echo "refresh-callers: no upstream SHA ($pin_from)" >&2
  exit 2
fi
echo "refresh-callers: at $pin ($pin_from)" >&2
up=$(mktemp -d) || up=
if [ -z "$up" ] || ! refresh_fetch "$up" "$pin" \
   || ! shipped=$(git -C "$up" ls-tree -r --name-only "$pin" -- templates/workflows templates/actions directives); then
  [ -n "$up" ] && rm -rf "$up"
  echo "refresh-callers: the upstream tree at $pin could not be fetched" >&2
  exit 2
fi
ships() { grep -qxF -- "$1" <<<"$shipped"; }
set_=
add() { case "
$set_
" in *"
$1
"*) return 1 ;; esac; set_="$set_
$1"; }
queue=
kept=
for w in .github/workflows/*.yml; do
  [ -f "$w" ] || continue
  if called=$(refresh_caller_of "$w"); then
    echo "refresh-callers: $w calls $called -- kept, not installed; its template's composites and scripts are not derived" >&2
    kept="$kept
templates/workflows/${w#.github/workflows/}"
    continue
  fi
  t="templates/workflows/${w#.github/workflows/}"
  ships "$t" && add "$t" && queue="$queue $t"
done
for a in .github/actions/*/action.yml; do
  [ -f "$a" ] || continue
  t="templates/actions/${a#.github/actions/}"
  ships "$t" && add "$t" && queue="$queue $t"
done
bad=0
for c in "$@"; do
  c=${c#./}
  case "$c" in
    templates/workflows/*.yml | templates/actions/*/action.yml | directives/*.md) ;;
    *) echo "refresh-callers: $c is not a caller path (templates/workflows/*.yml, templates/actions/*/action.yml, directives/*.md)" >&2; bad=1; continue ;;
  esac
  if ! ships "$c"; then
    echo "refresh-callers: $c is not shipped at $pin" >&2
    bad=1
    continue
  fi
  add "$c" && queue="$queue $c"
done
if [ "$bad" = 1 ]; then
  rm -rf "$up"
  exit 2
fi
# Composites reached from the upstream text, transitively.
while [ -n "${queue// /}" ]; do
  # shellcheck disable=SC2086  # deliberate word-split of the queue
  set -- $queue
  c=$1
  shift
  queue="$*"
  for a in $(git -C "$up" show "$pin:$c" 2>/dev/null \
             | grep -oE '\./\.github/actions/[A-Za-z0-9_.-]+' | sed 's|^\./\.github/actions/||' | sort -u; true); do
    t="templates/actions/$a/action.yml"
    ships "$t" && add "$t" && queue="$queue $t"
  done
done
while IFS= read -r d; do
  case "$d" in directives/*.md) add "$d" ;; esac
done <<<"$shipped"
# The delta's callers that are absent here: a decision, so a hint, not an add.
# A template whose workflow is a caller is present, and named above as kept,
# so it gets no hint (claude.prop refresh, 2026-10-26).
delta=$(cat "$(refresh_marker delta)" 2>/dev/null) || delta=
while IFS=$(printf '\t') read -r st p; do
  [ "$st" = D ] && continue
  case "$p" in
    templates/workflows/*.yml | templates/actions/*/action.yml)
      case "
$set_
$kept
" in *"
$p
"*) ;; *) echo "refresh-callers: the delta lists $p, absent here — name it as an argument if this refresh installs it" >&2 ;; esac ;;
  esac
done <<<"$delta"
rm -rf "$up"
printf '%s\n' "$set_" | sed '/^$/d' | sort
