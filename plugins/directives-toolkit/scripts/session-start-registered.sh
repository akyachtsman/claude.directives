#!/usr/bin/env bash
# session-start-registered.sh — the ONE test of whether .claude/settings.json
# runs the toolkit's SessionStart hook. Run from the project root. Exit 0 when
# a SessionStart entry invokes `…hooks/session-start.sh`; exit 1 when none does,
# or the file is missing or unreadable. Prints nothing.
#
# Both callers run this file: commands/env-chk.md (it reports) and
# commands/refresh-repo.md → *Hook repair* (it repairs). Before this file each
# carried the jq filter, and #424 had to fix both for prompt/http hooks
# (audit 2026-10-11, I-26).
#
# It parses the SessionStart array rather than grepping the file: a project may
# run an unrelated SessionStart hook AND name this script under another event,
# so file-wide greps can both succeed while nothing runs the updater at session
# start. A hook's `command` is read up to its first space with quotes dropped,
# and each string in `args` is read too; a prompt or http hook has neither.
set -u
f=${1:-.claude/settings.json}
[ -f "$f" ] || exit 1
jq -e '[.hooks.SessionStart[]?.hooks[]? | ((.command // empty) | strings
         | gsub("\"";"") | split(" ")[0]), (.args[]? | strings)]
       | any(endswith("hooks/session-start.sh"))' "$f" >/dev/null 2>&1
