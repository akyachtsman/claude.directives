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
# bracket forms are read from the template text at the PIN and at the STAMP,
# YAML comments set aside. A name is NEW when no stamp-era version of any of
# the templates installed at the stamp read it -- so a template this refresh
# installs for the first time counts its reads as new unless a template the
# project already ran read them. GITHUB_TOKEN is never listed: GitHub supplies it.
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
if [ -z "$up" ] || ! refresh_fetch "$up" "$pin" \
   || { [ -n "$stamp" ] && [ "$stamp" != "$pin" ] \
        && ! git -C "$up" fetch -q --depth=1 "$REFRESH_SRC" "$stamp" 2>/dev/null; }; then
  [ -n "$up" ] && rm -rf "$up"
  echo "CANNOT-VERIFY: the upstream tree at $pin${stamp:+ or the stamp $stamp} could not be fetched — new variables and secrets NOT checked"
  exit 2
fi

# reads <rev> <template>: one `vars NAME` / `secrets NAME` line per read, NAME
# upper-cased. Nothing when the template is absent at <rev>. Only a WHOLE-LINE
# comment is set aside: a read there is never one a run needs set. A `#` later
# in a line can sit inside a quoted value or a shell string (`echo "a # ${{
# secrets.X }}"` reads X), and telling those apart needs a YAML and shell
# parser, so such a line is read whole (Codex, #450): the worst case is an
# over-listed owner item, never a missed one.
reads() {
  git -C "$up" cat-file blob "$1:$2" 2>/dev/null \
    | grep -vE '^[[:space:]]*#' \
    | grep -oE "(^|[^[:alnum:]_.])(vars|secrets)(\.[A-Za-z_][A-Za-z0-9_]*|\[[[:space:]]*'[A-Za-z_][A-Za-z0-9_]*'[[:space:]]*\])" \
    | sed -E "s/^[^vs]*//; s/\[[[:space:]]*'/ /; s/'[[:space:]]*\]\$//; s/\./ /" \
    | awk '{ print $1, toupper($2) }' \
    | grep -v '^secrets GITHUB_TOKEN$'
}

# The baseline is what the project had installed WHEN THE STAMP WAS WRITTEN: the
# tree of the last commit that touched .claude/directive-sync.json (this runs
# before the stamp, so that is the previous refresh's). A template this refresh
# installs for the first time is therefore new even if upstream shipped it at
# the stamp, so its reads are never hidden by a baseline the project never ran
# (Codex, #450). No such commit: HEAD. Either way it is printed.
base=$(git log -1 --format=%H -- .claude/directive-sync.json 2>/dev/null) || base=
[ -n "$base" ] || base=HEAD
echo "installed-at-stamp baseline: $base"

# Plain lists, no associative arrays: stock macOS bash is 3.2 (Codex, #450).
templates=() before=()
for f in .github/workflows/*.yml .github/actions/*/action.yml; do
  [ -f "$f" ] || continue
  t=$(refresh_template_of "$f")
  git -C "$up" cat-file -e "$pin:$t" 2>/dev/null || continue
  templates+=("$t")
  git cat-file -e "$base:$f" 2>/dev/null && before+=("$t")
done

if [ -n "$stamp" ]; then
  for t in ${before[@]+"${before[@]}"}; do reads "$stamp" "$t"; done | sort -u >"$up/old"
else
  : >"$up/old"
fi
# `kind NAME<TAB>template` for every read at the pin not in the baseline, then
# one line per name with its templates joined.
for t in ${templates[@]+"${templates[@]}"}; do
  reads "$pin" "$t" | grep -vxF -f "$up/old" | sed "s|\$|	$t|"
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
