#!/usr/bin/env bash
# refresh-delta.sh — /refresh-repo Phase 2: list the upstream delta since the
# stamp over git transport, and leave the verdict for Phase 3 in marker files
# (every Bash call is a fresh shell). Run from the project root:
#   bash "${CLAUDE_PLUGIN_ROOT}/scripts/refresh-delta.sh"
# The fetch rules and their reasons: commands/refresh-repo.md → Phase 2.
classified=
last=$(jq -r '.upstream.sha // empty' .claude/directive-sync.json 2>/dev/null)
head=$(git ls-remote https://github.com/akyachtsman/claude.directives.git refs/heads/main | cut -f1)
# INVALIDATE FIRST. Any marker left by an earlier invocation is cleared before
# this run attempts anything, so a verdict can only ever be THIS run's. Without
# it, a run interrupted after writing the marker left approval lying around: a
# later run against the same head whose delta listing FAILED would find the stale
# marker, match it against the unchanged head, and permanently advance the stamp
# past a delta nobody dispositioned. SHA-binding alone does not catch that,
# because the SHA is the same.
rm -f "$(git rev-parse --git-path refresh-repo-classified)" \
      "$(git rev-parse --git-path refresh-repo-delta)"

if [ -z "$head" ]; then
  echo "upstream head unavailable this run — SKIPPING Phases 2-3, stamp unchanged"
elif [ -n "$last" ] && [ "$last" != "$head" ]; then
  # File-level classification over git transport. Degrade loudly when it fails.
  # Lists EVERY changed path, not just templates|docs|directives: a delta made
  # only of plugins/ changes printed nothing while still recording "classified",
  # so the next run treated an unseen change as handled. The disposition table
  # below covers plugins/ as informational — it still has to be SEEN.
  # Fetch by the SHA ls-remote returned, never `main`: main can move between
  # the two calls, and a delta listed against a different head is not this one.
  src=https://github.com/akyachtsman/claude.directives.git
  # An EMPTY $objs must stop everything: `git -C ""` is a no-op, so every call
  # below would run against THIS project's .git — the pollution the scratch
  # repo exists to avoid.
  objs=$(mktemp -d) || objs=
  if [ -n "$objs" ] && git init -q --bare "$objs"; then
    git -C "$objs" fetch -q --depth=100 "$src" "$head"
    git -C "$objs" cat-file -e "$last^{commit}" 2>/dev/null \
      || git -C "$objs" fetch -q --deepen 100 "$src" "$head"   # ONE bounded retry
  else
    objs=
  fi
  if [ -n "$objs" ] \
     && git -C "$objs" cat-file -e "$last^{commit}" 2>/dev/null \
     && git -C "$objs" cat-file -e "$head^{commit}" 2>/dev/null \
     && delta_list=$(git -C "$objs" diff --no-renames --name-status "$last" "$head"); then
    printf '%s\n' "$delta_list"
    # Kept for Phase 3, which re-checks every listed path was APPLIED before it
    # stamps. Reading the delta is not applying it (claude.prop, PROP7 #2).
    printf '%s\n' "$delta_list" > "$(git rev-parse --git-path refresh-repo-delta)"
    classified=yes   # the delta was READ — Phase 3 still checks it was APPLIED
    # Written only AFTER the delta has actually been listed. Records WHICH head
    # was classified, so Phase 3 can refuse a verdict made against a different
    # head. `git rev-parse --git-path` because in a linked worktree .git is a
    # FILE, and a redirect into it fails.
    printf '%s' "$head" > "$(git rev-parse --git-path refresh-repo-classified)"
  else
    echo "delta listing unavailable (fetch failed, or $last beyond the fetched"
    echo "depth) — delta known by SHA only ($last -> $head); classify per the"
    echo "Propagation Matrix in MAINTAIN-REPO-USER-INSTRUCTIONS.md. The stamp will NOT advance."
  fi
  [ -n "$objs" ] && rm -rf "$objs"
else
  # Nothing to classify: either no prior stamp (first run — the per-file policy
  # is applied directly, below) or the stamp already equals head. Both are
  # legitimately stampable.
  classified=yes
  printf '%s' "$head" > "$(git rev-parse --git-path refresh-repo-classified)"
fi
