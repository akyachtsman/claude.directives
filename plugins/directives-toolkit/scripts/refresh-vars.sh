#!/usr/bin/env bash
# refresh-vars.sh — /refresh-repo Phase 3: every repository VARIABLE or SECRET
# the incoming templates read that the project's stamp-era templates did not.
# Run from the project root, after this refresh's installs, before the stamp:
#   bash "${CLAUDE_PLUGIN_ROOT}/scripts/refresh-vars.sh"
# What the session does with each line: commands/refresh-repo.md → Phase 3.
#
# WHY (pilots claude.prop + claude.trading, 2026-10-13). A refresh merged and
# the live UI workflow went red in seconds on an unset APP_URL. Nothing in the
# refresh said the project needed a repository variable it had never set, and
# only the owner can set one: the web-session proxy blocks the Actions
# variables API, so the session can neither check nor fix it. Each new read is
# therefore an OWNER PRE-MERGE item, for the refresh's report and its PR body.
#
# WHAT IS COMPARED. The installed copies decide WHICH templates: every
# .github/workflows/*.yml and .github/actions/*/action.yml here whose template
# upstream ships at the pinned head (a project's own workflow has none, and its
# reads are the project's own). For those, `vars.NAME`, `secrets.NAME` and the
# bracket forms are read from the template text at the PIN, and compared with
# the project's OWN installed files as they stood when the stamp was written. A
# name is NEW when none of those files read it -- so a template this refresh
# installs for the first time counts all its reads, and a customised copy that
# dropped a read does not count as reading it. GITHUB_TOKEN is never listed:
# GitHub supplies it.
# Names compare case-insensitively, as GitHub resolves them.
#
# WHAT IT CANNOT SEE. Whether the variable is SET (that needs the API above),
# and a read that existed at the stamp but newly became REQUIRED: the pilots'
# APP_URL was read by every version of qa-live.yml, and what changed was the
# fallback the project relied on. A NEW read is the case this script decides.
#
# Prints `pinned:`, then one `OWNER PRE-MERGE:` line per new name, or the
# explicit `OK: no new repository variables or secrets read` line, never
# silence. Exit 0 when compared (the lines are owner items, not failures),
# 2 when it could not be.
# shellcheck source=refresh-lib.sh
. "$(dirname -- "${BASH_SOURCE[0]}")/refresh-lib.sh" \
  || { echo "CANNOT-VERIFY: refresh-lib.sh not loadable — new variables and secrets NOT checked"; exit 2; }

if ! refresh_pin; then
  echo "CANNOT-VERIFY: no upstream SHA ($pin_from returned nothing usable) — new variables and secrets NOT checked"
  exit 2
fi
# BEFORE THE STAMP, never after: a written stamp consumes Phase 2's marker and
# moves upstream.sha to the pin, so a run after it would compare the head with
# itself and print a false OK. Without the marker (or REFRESH_PIN) there is no
# stamp..head pair this refresh classified, so it refuses instead of guessing.
case "$pin_from" in
  ls-remote*)
    echo "CANNOT-VERIFY: no Phase 2 marker — run refresh-delta.sh first, and this script BEFORE refresh-stamp.sh (a written stamp consumes the marker) — new variables and secrets NOT checked"
    exit 2 ;;
esac
echo "pinned: $pin ($pin_from)"
stamp=$(jq -r '.upstream.sha // empty' .claude/directive-sync.json 2>/dev/null) || stamp=
refresh_is_sha "$stamp" || stamp=

up=$(mktemp -d) || up=
if [ -z "$up" ] || ! refresh_fetch "$up" "$pin"; then
  [ -n "$up" ] && rm -rf "$up"
  echo "CANNOT-VERIFY: the upstream tree at $pin could not be fetched — new variables and secrets NOT checked"
  exit 2
fi

# exprs: stdin -> the text GitHub EVALUATES, one span per line. A light YAML
# reader, enough for workflow files (Codex, #450, six rounds):
#   - a BLOCK SCALAR (`key: |` / `key: >`, any chomping) runs while lines are
#     indented deeper than its key; its lines are data, so a `#`-led one is
#     read too (`payload: |` then `#${{ secrets.X }}`), and an `if:` block is
#     read whole as a bare expression (`if: >` on its own line, as
#     qa-live.yml has);
#   - outside a block, a line whose first non-space is `#` is a YAML comment
#     and is skipped: a commented-out read (cron-notify.yml's optional DB
#     lines) is no read, on either side;
#   - a `#` later in a line (outside a block): on the INCOMING side it is kept
#     -- inside a quoted value or a shell string it is no comment (`echo "a #
#     ${{ secrets.X }}"` reads X); on the BASELINE side (exprs strip) it and
#     what follows are dropped, so a trailing comment the project never ran
#     cannot hide a read upstream made live (Codex, #450). The baseline is
#     thus never larger than what ran and the incoming side never smaller:
#     every error lists an extra owner item, none hides one. (No shipped
#     template has a read after a mid-line `#`, so this lists nothing extra.)
#   - from what is kept: every `${{ ... }}` (to the next `}}`, so a `}` inside
#     a quoted argument is kept) and a single-line bare `if:`. Nothing else
#     is a read: `name: future vars.X support` is inert text.
#   - a `${{` left open at the end of a line (YAML folds a plain scalar over
#     lines) is followed onto the next lines until its `}}` -- on the
#     INCOMING side only, so the baseline stays an under-count (Codex, #450).
# KNOWN LIMITS (owner ruling, 2026-10-13: accepted, not parsed): a quoted
# (`"` / `'`) scalar left open across lines -- e.g. a multi-line quoted `if:`
# whose read sits on a continuation line -- and a literal `}}` inside an
# expression's string argument (`format('{{x}}', vars.X)`), which ends the span
# early. No shipped template uses either form; covering them means a real YAML
# and expression parser, not more shapes in this reader (Codex, #450, round 9).
exprs() {
  awk -v strip="${1:-}" '
  function emit(text,   i, rest, j) {
    while ((i = index(text, "${{")) > 0) {
      rest = substr(text, i + 3); j = index(rest, "}}")
      if (j == 0) { print rest; if (!strip) open = 1; return }
      print substr(rest, 1, j - 1); text = substr(rest, j + 2)
    }
  }
  function ind(s) { match(s, /^ */); return RLENGTH }
  {
    line = $0
    if (open) {
      j = index(line, "}}")
      if (j == 0) { print line; next }
      print substr(line, 1, j - 1); line = substr(line, j + 2); open = 0
    }
    if (inblk) {
      if (line ~ /^[[:space:]]*$/) next
      if (ind(line) > blkind) { if (blkif) print line; else emit(line); next }
      inblk = 0
    }
    if (line ~ /^[[:space:]]*#/) next
    if (strip) sub(/[[:space:]]#.*$/, "", line)
    if (line ~ /^[[:space:]]*(-[[:space:]]+)?[^#]*:[[:space:]]*[|>][-+0-9]*[[:space:]]*(#.*)?$/) {
      inblk = 1; blkind = ind(line)
      blkif = (line ~ /^[[:space:]]*(-[[:space:]]+)?if:/)
      next
    }
    if (line ~ /^[[:space:]]*(-[[:space:]]+)?if:[[:space:]]*/ && index(line, "${{") == 0) {
      sub(/^[[:space:]]*(-[[:space:]]+)?if:[[:space:]]*/, "", line); print line; next
    }
    emit(line)
  }'
}

# reads: stdin -> one `vars NAME` / `secrets NAME` line per read in an
# evaluated span, NAME upper-cased; GITHUB_TOKEN never (GitHub supplies it).
reads() {
  exprs "${1:-}" \
    | grep -oE "(^|[^[:alnum:]_.])(vars|secrets)(\.[A-Za-z_][A-Za-z0-9_]*|\[[[:space:]]*'[A-Za-z_][A-Za-z0-9_]*'[[:space:]]*\])" \
    | sed -E "s/^[^vs]*//; s/\[[[:space:]]*'/ /; s/'[[:space:]]*\]\$//; s/\./ /" \
    | awk '{ print $1, toupper($2) }' \
    | grep -v '^secrets GITHUB_TOKEN$'
}

# The baseline is what the project RAN WITH when the stamp was written: its own
# installed files in the commit that WROTE the current stamp (this runs before
# the stamp, so that is the previous refresh's) -- never the upstream templates
# at the stamp. So a template this refresh installs for the first time has no
# baseline, and a CUSTOM copy that dropped a read does not count as reading it
# (Codex, #450). That commit is the oldest of the newest unbroken run of commits
# whose .claude/directive-sync.json carries this upstream.sha, read from each
# commit's JSON: the last commit that merely TOUCHED the file is a refresh_kept
# re-record as often as a stamp, and baselining there counted a workflow read
# added in between as already run with (claude.prop pilot, 2026-10-15). No such
# commit: the last one touching the file, then HEAD. Either way printed.
base=
if [ -n "$stamp" ]; then
  for c in $(git log --format=%H -- .claude/directive-sync.json 2>/dev/null); do
    s=$(git show "$c:.claude/directive-sync.json" 2>/dev/null \
      | jq -r '.upstream.sha // empty' 2>/dev/null) || s=
    [ "$s" = "$stamp" ] || break
    base=$c
  done
fi
[ -n "$base" ] || base=$(git log -1 --format=%H -- .claude/directive-sync.json 2>/dev/null) || base=
[ -n "$base" ] || base=HEAD
echo "baseline: project commit $base (this project's installed files when the stamp was written; not an upstream SHA)"

# Plain lists, no associative arrays: stock macOS bash is 3.2 (Codex, #450).
templates=()
: >"$up/old"
for f in .github/workflows/*.yml .github/actions/*/action.yml; do
  [ -f "$f" ] || continue
  t=$(refresh_template_of "$f")
  git -C "$up" cat-file -e "$pin:$t" 2>/dev/null || continue
  templates+=("$t")
  [ -n "$stamp" ] && git show "$base:$f" 2>/dev/null | reads strip >>"$up/old"
done
sort -u -o "$up/old" "$up/old"
# `kind NAME<TAB>template` for every read at the pin not in the baseline, then
# one line per name with its templates joined.
for t in ${templates[@]+"${templates[@]}"}; do
  git -C "$up" cat-file blob "$pin:$t" 2>/dev/null | reads | { grep -vxF -f "$up/old" || true; } | sed "s|\$|	$t|"
done | sort -u | awk -F '\t' '
  $1 != key { if (key != "") print key "\t" list; key = $1; list = $2; next }
  { list = list ", " $2 }
  END { if (key != "") print key "\t" list }' >"$up/new"

n=0
while IFS='	' read -r key files; do
  [ -n "$key" ] || continue
  kind=${key%% *} name=${key#* }
  case "$kind" in vars) what="repository variable" ;; *) what="repository secret" ;; esac
  if [ -n "$stamp" ]; then
    echo "OWNER PRE-MERGE: set $what $name — newly read by $files"
  else
    echo "OWNER PRE-MERGE: set $what $name — read by $files (no stamp: every read is listed, none can be told from new)"
  fi
  n=$((n + 1))
done <"$up/new"
rm -rf "$up"

if [ "$n" -eq 0 ]; then
  echo "OK: no new repository variables or secrets read (${#templates[@]} installed template(s), ${stamp:-no stamp} -> $pin)"
else
  echo "SUMMARY: $n new repository variable(s)/secret(s) read across ${#templates[@]} installed template(s) — the owner sets each BEFORE merging the refresh"
fi
exit 0
