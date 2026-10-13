#!/usr/bin/env bash
# kit-defects.sh — /refresh-repo *Kit defects*, steps 1-2: fetch the upstream
# list, pull each entry's **Check** block out of it, and run it from every kit
# directory. Run from the project root:
#   bash "${CLAUDE_PLUGIN_ROOT}/scripts/kit-defects.sh" [list file]
# With no argument the list is docs/standards/kit-defects.md at the revision
# every phase reads (refresh-lib.sh -> refresh_pin) -- never a local copy, which
# is only as new as the last sync. A file argument is read instead (a list
# already fetched).
#
# The command once said "run its Check" with nothing to extract the fenced block
# from the fetched markdown (pilots, 2026-10-13), so each session improvised one.
# The extraction is fixed here: for each `## KD-<n>` heading, the first fenced
# ```bash block after its `**Check:**` bullet, de-indented by the fence's own
# indentation. The kit directories come from kit-dirs.sh, the one derivation.
#
# Prints one line per entry per kit directory -- `KD-<n> <dir>: AFFECTED`,
# `CLEAR`, or `UNDECIDED (...)` -- then a SUMMARY. A check that prints anything
# other than the three verdicts on its last line is UNDECIDED, never CLEAR.
# Steps 3-4 (the minimal fix or a recorded decline, and the report) stay with
# the session. Exit 0 when every check ran, 2 when the list could not be read.
# shellcheck source=refresh-lib.sh
here=$(dirname -- "${BASH_SOURCE[0]}")
. "$here/refresh-lib.sh" || { echo "kit defects NOT checked (refresh-lib.sh not loadable)"; exit 2; }
kits=$(bash "$here/kit-dirs.sh")
if [ -z "$kits" ]; then
  echo "OK: no UI-test kit in this project — kit defects step skipped"
  exit 0
fi
work=$(mktemp -d) || { echo "kit defects NOT checked (no scratch directory)"; exit 2; }
list="$work/kit-defects.md"
if [ -n "${1:-}" ]; then
  if ! cp -- "$1" "$list" 2>/dev/null; then
    echo "kit defects NOT checked ($1 is not readable)"
    rm -rf "$work"
    exit 2
  fi
  from=$1
elif refresh_pin && refresh_fetch "$work/up" "$pin" \
     && git -C "$work/up" cat-file blob "$pin:docs/standards/kit-defects.md" >"$list" 2>/dev/null; then
  from="upstream $pin ($pin_from)"
else
  echo "kit defects NOT checked (no upstream SHA, or the fetch failed)"
  rm -rf "$work"
  exit 2
fi
echo "kit defects list: $from"
# One file per entry: <id>.sh holding its Check block; an entry with no block
# gets an empty file, reported UNDECIDED below.
awk -v dir="$work" '
  /^## KD-[0-9]+/ { id = $2; ids[++n] = id; want = 0; inb = 0; got[id] = 0; next }
  id == "" { next }
  !got[id] && !inb && /^[ \t]*-[ \t]+\*\*Check:\*\*/ { want = 1; next }
  want && !inb && /^[ \t]*```(bash|sh)[ \t]*$/ {
    match($0, /^[ \t]*/); ind = RLENGTH; inb = 1; next }
  inb && /^[ \t]*```[ \t]*$/ { inb = 0; want = 0; got[id] = 1; next }
  inb { line = $0; if (substr(line, 1, ind) ~ /^[ \t]*$/) line = substr(line, ind + 1)
        print line > (dir "/" id ".sh"); next }
  END { for (i = 1; i <= n; i++) { if (!got[ids[i]]) printf "" > (dir "/" ids[i] ".sh"); print ids[i] > (dir "/ids") } }
' "$list"
ids=$(cat "$work/ids" 2>/dev/null)
if [ -z "$ids" ]; then
  echo "kit defects NOT checked (no KD-<n> entry found in the list — its format changed?)"
  rm -rf "$work"
  exit 2
fi
entries=0 affected=0 undecided=0 clear=0
while IFS= read -r id; do
  entries=$((entries + 1))
  while IFS= read -r k; do
    [ -n "$k" ] || continue
    if [ ! -d "$k" ]; then
      echo "$id $k: UNDECIDED (kit dir named but missing — NOT checked there)"
      undecided=$((undecided + 1))
      continue
    fi
    if [ ! -s "$work/$id.sh" ]; then
      echo "$id $k: UNDECIDED (no Check block found in the entry — read it by hand)"
      undecided=$((undecided + 1))
      continue
    fi
    out=$(cd "$k" && bash "$work/$id.sh" 2>&1)
    v=$(printf '%s\n' "$out" | sed '/^[[:space:]]*$/d' | tail -n 1 | tr -d '[:space:]')
    case "$v" in
      AFFECTED) echo "$id $k: AFFECTED"; affected=$((affected + 1)) ;;
      CLEAR)    echo "$id $k: CLEAR"; clear=$((clear + 1)) ;;
      UNDECIDED) echo "$id $k: UNDECIDED (the check could not read this copy's shape)"; undecided=$((undecided + 1)) ;;
      *) echo "$id $k: UNDECIDED (the check printed no verdict: $(printf '%s' "$out" | tail -n 1 | cut -c1-120))"
         undecided=$((undecided + 1)) ;;
    esac
  done <<KITS
$kits
KITS
done <<IDS
$ids
IDS
rm -rf "$work"
echo "SUMMARY: $entries entr(ies) checked — $affected AFFECTED, $undecided UNDECIDED, $clear CLEAR"
exit 0
