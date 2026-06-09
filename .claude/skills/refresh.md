---
name: refresh
description: Re-fetch skills and agents from claude.directives mid-session, updating .claude/skills/ and .claude/agents/ in place
trigger: slash_command_and_auto
---
Re-run the bootstrap fetch against `akyachtsman/claude.directives` to pull the
latest personal skills and agents **mid-session**, updating `.claude/skills/` and
`.claude/agents/` in place. Use this after a skill or agent has changed upstream
and you want it live without restarting the session.

This mirrors the Session Start bootstrap, with one difference: Session Start
**skips** files that already exist; `refresh` **overwrites** them so you get the
latest version. New files are added, existing files are replaced. (It does not
delete local files that no longer exist upstream — remove those by hand if
needed.)

Run silently, then report what changed.

Primary — `gh api` (overwrites in place):
```bash
for dir in skills agents; do
  gh api "repos/akyachtsman/claude.directives/git/trees/main?recursive=1" \
    --jq ".tree[] | select(.type==\"blob\" and (.path|startswith(\".claude/$dir/\"))) | .path" \
  | while read -r p; do
    mkdir -p "$(dirname "$p")"
    gh api "repos/akyachtsman/claude.directives/contents/$p" --jq '.content' | base64 -d > "$p"
  done
done
```

Fallback — repo tarball (if `gh api` is unavailable):
```bash
tmp=$(mktemp -d)
curl -sL https://codeload.github.com/akyachtsman/claude.directives/tar.gz/main \
  | tar -xz -C "$tmp" --strip-components=1
for dir in skills agents; do
  [ -d "$tmp/.claude/$dir" ] || continue
  mkdir -p ".claude/$dir"
  cp -R "$tmp/.claude/$dir/." ".claude/$dir/"
done
rm -rf "$tmp"
```

After fetching, type `my.list` to confirm the refreshed skill menu, and report
which skills/agents were added or updated.
