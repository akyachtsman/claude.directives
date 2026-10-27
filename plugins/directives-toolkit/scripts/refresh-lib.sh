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
# mapped by the caller (their directory comes from kit-dirs.sh). Workflows and
# composites map to nothing (Phase E of #460 step 4, owner ruling 2026-10-26):
# a project's workflows are callers, which a refresh never merges, and the
# composites are read from claude.directives at the called commit, so a
# refresh installs neither and has no template to merge either against.
refresh_template_of() {
  case "$1" in
    .github/scripts/*)   printf 'templates/scripts/%s\n' "${1#.github/scripts/}" ;;
    .claude/hooks/*)     printf 'templates/claude-hooks/%s\n' "${1#.claude/hooks/}" ;;
    # The house-style files only (#470; the shared page script, #471): a
    # project's own stylesheet or script beside them (styles/legacy.css,
    # styles/project.css) has no template.
    styles/tokens.css | styles/components.css | styles/components.js) printf 'templates/%s\n' "$1" ;;
  esac
}

# refresh_caller_of <workflow file>: print `shared-<name>.yml@<ref>` and
# succeed when the file is a CALLER of this repo's shared workflows (#460 step
# 4): a job line `uses: akyachtsman/claude.directives/.github/workflows/
# shared-<name>.yml@<ref>`. Only a `uses:` key counts, so a comment naming the
# path does not. A caller's composites and scripts come from this repo at run
# time, never from the project, so a refresh keeps the caller, never merges,
# overwrites or compares it, and never asks for the composites or scripts the
# shared workflow reads (claude.prop pilot, 2026-10-25).
refresh_caller_of() {
  [ -f "$1" ] || return 1
  local re hit
  re="^[[:space:]]*(-[[:space:]]+)?uses:[[:space:]]*[\"']?akyachtsman/claude\.directives/\.github/workflows/(shared-[A-Za-z0-9_.-]+\.ya?ml@[A-Za-z0-9_./-]+).*"
  # The first match only, and no pipe: sed quits there (`head` would SIGPIPE it).
  hit=$(sed -nE "\#$re#{s##\2#p;q;}" "$1" 2>/dev/null) || hit=
  [ -n "$hit" ] || return 1
  printf '%s\n' "$hit"
}

# refresh_house_style: exit 0 when THIS project is on the house style, i.e.
# .claude/directive-sync.json -> house_style is exactly `true` (#470). The
# marker means styles/components.css and styles/components.js (the shared page
# script, #471) are the house files, verbatim, and
# styles/tokens.css declares every house token name with the project's values.
# /new-repo, /design-intake and the existing-project move write it. Anything
# else (no file, no key, false, "true") is a project not yet moved: its
# stylesheets are its own, and no refresh compares them, because an older
# starter tokens.css/components.css looks just like a customised house one.
refresh_house_style() {
  jq -e '.house_style == true' .claude/directive-sync.json >/dev/null 2>&1
}

# refresh_token_names: read CSS on stdin; print every custom-property NAME it
# declares (`--name:`), sorted, once each. Comments are dropped first, so a
# commented-out token is not counted as declared; `var(--x)` is a use, not a
# declaration, and has no colon. This is a name check, never a value check:
# values are the project's (a palette ruled by the owner), and the contrast
# guardrail owns what they render as.
refresh_token_names() {
  tr '\r\n' '  ' | sed -E 's#/\*[^*]*\*+([^/*][^*]*\*+)*/# #g' \
    | { grep -oE -- '--[A-Za-z0-9_-]+[[:space:]]*:' || true; } \
    | sed -E 's/[[:space:]]*:$//' | LC_ALL=C sort -u
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

# refresh_local_tree <dir>: the git tree id of what is on disk under <dir> --
# every tracked or untracked, not ignored file, at its bytes (--no-filters) and
# its refresh_local_mode -- or `absent` when it holds no file. A refresh_kept
# record for a kit DIRECTORY binds this beside the upstream `tree`, as a file
# record binds `local` beside `blob`, so a later edit under a declined
# directory re-asks. It once bound the upstream tree alone, and a project that
# went on editing a declined tests/lib/ was never asked again (claude.insurance,
# 2026-10-19 batch list on #460). Equal to the template's tree id exactly when
# the directory matches it. Built in a scratch index and object directory, so
# the project's own index and objects are never written.
refresh_local_tree() {
  local tmp t f b
  [ -d "$1" ] || { echo absent; return 0; }
  tmp=$(mktemp -d) || return 1
  if mkdir "$tmp/objects" \
     && git --literal-pathspecs ls-files -z --cached --others --exclude-standard -- "$1/" >"$tmp/list" \
     && while IFS= read -r -d '' f; do
          [ -f "$f" ] || continue   # a tracked file deleted on disk is not there
          b=$(git hash-object --no-filters -- "$f") || break
          printf '%s %s\t%s\0' "$(refresh_local_mode "$f")" "$b" "${f#"$1"/}"
        done <"$tmp/list" >"$tmp/info" \
     && [ -z "$f" ] \
     && GIT_INDEX_FILE="$tmp/index" git update-index -z --index-info <"$tmp/info" \
     && t=$(GIT_INDEX_FILE="$tmp/index" GIT_OBJECT_DIRECTORY="$tmp/objects" git write-tree --missing-ok); then
    rm -rf "$tmp"
    # The empty tree: git keeps no empty directory, so it reads as absent.
    if [ "$t" = 4b825dc642cb6eb9a060e54bf8d69288fbee4904 ]; then echo absent; else printf '%s\n' "$t"; fi
    return 0
  fi
  rm -rf "$tmp"
  return 1
}
