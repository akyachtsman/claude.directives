# refresh-lib.sh -- what the /refresh-repo scripts share: the upstream they
# read, the ONE revision every phase reads it at, and the scratch fetch.
# SOURCED, never run: each refresh-*.sh (and kit-defects.sh) loads it from its
# own directory, so it ships wherever they do.
#
# ONE REVISION (pilots claude.prop + claude.trading, 2026-10-13). Phase 1.5
# fetched templates from `main` over raw URLs while Phases 2-3 pinned the SHA
# Phase 2 classified, so a merge upstream between the two compared the project
# against two different heads in one refresh. refresh_pin is the one rule:
#   1. $REFRESH_PIN, when the caller names a SHA;
#   2. Phase 2's marker (refresh-delta.sh writes the head it classified);
#   3. `git ls-remote` main, said out loud, because nothing pins it.
# Transport is git, never the API (commands/refresh-repo.md -> Phase 1).

# The upstream repository. REFRESH_UPSTREAM exists for the case suite
# (.github/scripts/check-refresh-scripts-cases.py), which points every script
# at a file:// fixture; a session never sets it.
REFRESH_SRC=${REFRESH_UPSTREAM:-https://github.com/akyachtsman/claude.directives.git}

# refresh_is_sha <text>: exit 0 when <text> is a full commit SHA.
refresh_is_sha() { grep -qE '^[0-9a-f]{40}$' <<<"${1:-}"; }

# refresh_head: upstream main's SHA now, or nothing.
refresh_head() { git ls-remote "$REFRESH_SRC" refs/heads/main 2>/dev/null | cut -f1; }

# refresh_marker <name>: the path of a /refresh-repo marker in THIS project's
# git dir. `--git-path`, because in a linked worktree .git is a file.
refresh_marker() { git rev-parse --git-path "refresh-repo-$1"; }

# refresh_pin: set $pin (a SHA, or empty) and $pin_from (where it came from).
# Non-zero when no SHA could be had.
refresh_pin() {
  pin= pin_from=
  if [ -n "${REFRESH_PIN:-}" ]; then
    pin=$REFRESH_PIN pin_from='REFRESH_PIN'
  else
    pin=$(cat "$(refresh_marker classified)" 2>/dev/null) || pin=
    if [ -n "$pin" ]; then
      pin_from="Phase 2's classified head"
    else
      pin=$(refresh_head)
      pin_from='ls-remote main -- no Phase 2 marker; run refresh-delta.sh first so every phase reads one revision'
    fi
  fi
  refresh_is_sha "$pin"
}

# refresh_fetch <dir> <sha>...: a scratch BARE repo at <dir> holding each
# commit at depth 1 -- never this project's .git, where a shallow fetch writes
# .git/shallow and leaves foreign objects behind. Non-zero when any fails.
refresh_fetch() {
  local d=$1
  shift
  [ -n "$d" ] && git init -q --bare "$d" \
    && git -C "$d" fetch -q --depth=1 "$REFRESH_SRC" "$@" 2>/dev/null
}

# refresh_template_of <local path>: the upstream template an installed file
# comes from, or nothing for a path no template row installs. Kit files are
# mapped by the caller (their directory comes from kit-dirs.sh).
refresh_template_of() {
  case "$1" in
    .github/workflows/*) printf 'templates/workflows/%s\n' "${1#.github/workflows/}" ;;
    .github/actions/*)   printf 'templates/actions/%s\n' "${1#.github/actions/}" ;;
    .github/scripts/*)   printf 'templates/scripts/%s\n' "${1#.github/scripts/}" ;;
    .claude/hooks/*)     printf 'templates/claude-hooks/%s\n' "${1#.claude/hooks/}" ;;
  esac
}

# refresh_kit_rel <path> <kit dir>: print <path> relative to the kit and
# succeed when it lies under it. A kit at the project root (kit-dirs.sh prints
# `.`) holds every relative path, so the `"$k"/*` prefix test cannot be used
# for it (Codex, #451). A caller still maps a path to the kit only when
# templates/ui-tests ships that name: a kit sharing a directory (the root, or
# .github/scripts) must not capture the other templates installed there.
refresh_kit_rel() {
  if [ "$2" = . ]; then
    case "$1" in /*|..|../*) return 1 ;; esac
    printf '%s\n' "${1#./}"; return 0
  fi
  case "$1" in "$2"/*) printf '%s\n' "${1#"$2"/}"; return 0 ;; esac
  return 1
}

# refresh_kit_join <kit dir> <relative path>: the installed path of a kit
# file -- `package.json`, not `./package.json`, for a kit at the root.
refresh_kit_join() {
  if [ "$1" = . ]; then printf '%s\n' "$2"; else printf '%s/%s\n' "$1" "$2"; fi
}

# refresh_local_mode <path>: 100755 or 100644 -- the mode git records for a
# tracked file (what a CI checkout gets), else the working tree's exec bit.
refresh_local_mode() {
  local m
  m=$(git ls-files -s -- "$1" 2>/dev/null | cut -d' ' -f1)
  case "$m" in
    100755 | 100644) printf '%s\n' "$m" ;;
    *) if [ -x "$1" ]; then echo 100755; else echo 100644; fi ;;
  esac
}
