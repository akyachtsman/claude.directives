---
name: session.start
description: Orient a new session on an existing project — load directives, bootstrap skills/agents, confirm branch, run env.chk (read-only, never scaffolds)
trigger: slash_command_and_auto
---
Orient a fresh Claude Code session on an **existing** project. This is the
standard way to start any session on a repo that already has a `CLAUDE.md`.

**Guard — orientation only.** Never scaffold, never create branches, never open
PRs, never overwrite any file. If `CLAUDE.md` does not exist, this is a brand-new
repo — stop and tell the human to type `/new.repo` instead.

Execute in order:

1. **Read `CLAUDE.md` fully** — it is the project's source of truth.

2. **Fetch and internalize every directive URL** listed in `CLAUDE.md`'s
   Imported Directives section. Read each one fully before doing any work.

3. **Bootstrap skills and agents.** Run the Skill Bootstrap block from
   `global.md` (the `gh api` tree walk that fetches `.claude/skills/` and
   `.claude/agents/` recursively, skipping files that already exist). If `gh api`
   is unavailable, fall back to the repo tarball — this fallback is required in
   practice and has been confirmed by live testing:
   ```bash
   tmp=$(mktemp -d)
   curl -sL https://codeload.github.com/akyachtsman/claude.directives/tar.gz/main \
     | tar -xz -C "$tmp" --strip-components=1
   for dir in skills agents; do
     [ -d "$tmp/.claude/$dir" ] || continue
     ( cd "$tmp" && find ".claude/$dir" -type f ) | while read -r p; do
       [ -f "$p" ] && continue          # skip files that already exist
       mkdir -p "$(dirname "$p")"
       cp "$tmp/$p" "$p"
     done
   done
   rm -rf "$tmp"
   ```

4. **Confirm the active branch.** Run `git branch --show-current` and report it.
   Do NOT switch or create branches — just report what's checked out.

5. **Run `env.chk`** and capture its results.

6. **Report back** a compact summary:
   - directives loaded (which URLs)
   - skills count (e.g. from `my.list`)
   - agents count (files under `.claude/agents/`)
   - active branch
   - `env.chk` status — green, or the list of failures that need attention
