#!/usr/bin/env bash
# refresh-drift.sh — /refresh-repo Phase 1.5: compare every installed verbatim
# drop-in with the CURRENT upstream template, whatever the delta. Run from the
# project root:  bash "${CLAUDE_PLUGIN_ROOT}/scripts/refresh-drift.sh"
# Prints DRIFT / NO-TEMPLATE / CANNOT-VERIFY / RETIRED per file; how to disposition each
# is commands/refresh-repo.md → Phase 1.5.
repo="akyachtsman/claude.directives"
raw="https://raw.githubusercontent.com/$repo/main"
for f in .github/workflows/*.yml .github/actions/*/* \
         .claude/hooks/session-start.sh; do
  [ -f "$f" ] || continue
  # A template upstream DELETED also answers 404, which would read as a
  # project-specific file and be kept. An installed copy is a removal finding
  # instead, so retired names are matched before any fetch (Codex, #444).
  case "$f" in
    .github/workflows/keepalive.yml)
      echo "RETIRED: $f — upstream deleted this template; delete it and its KEEPALIVE_PAT secret (docs/standards/cicd-setup.md → 9f)"
      continue ;;
  esac
  case "$f" in
    .github/workflows/*) t="templates/workflows/$(basename "$f")";;
    .claude/hooks/*)     t="templates/claude-hooks/$(basename "$f")";;
    *)                   t="templates/actions/$(basename "$(dirname "$f")")/$(basename "$f")";;
  esac
  # The status decides, never curl's exit alone: only a 404 means upstream ships
  # no such template. A blocked host, a timeout or a 5xx is CANNOT-VERIFY;
  # reading it as NO-TEMPLATE would skip a file that may well have drifted.
  tmpl=$(mktemp)
  code=$(curl -sSL -o "$tmpl" -w '%{http_code}' "$raw/$t" 2>/dev/null) || code=000
  case "$code" in
    200) diff -q "$tmpl" "$f" >/dev/null 2>&1 || echo "DRIFT: $f" ;;
    404) echo "NO-TEMPLATE: $f (project-specific — skip)" ;;
    *)   echo "CANNOT-VERIFY: $f (fetch returned $code) — not compared, not DRIFT" ;;
  esac
  rm -f "$tmpl"
done
