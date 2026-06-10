---
name: refresh.repo
description: Re-sync this project with claude.directives mid-session — update .claude/skills/ and .claude/agents/ in place, flag upstream-removed orphans, and report drift in template-derived files (workflows, ui-tests kit, settings hooks)
trigger: slash_command_and_auto
---
Re-sync the project against `akyachtsman/claude.directives` **mid-session**, in
three phases. Use this after anything has changed upstream and you want it live
without restarting the session.

This mirrors the Session Start bootstrap, with one difference: Session Start
**skips** files that already exist; `refresh.repo` **overwrites** them so you get the
latest version.

## Phase 1 — Skills & agents (overwrite in place)

New files are added, existing files are replaced.

Primary — `gh api`:
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
# keep $tmp for Phases 2-3; rm -rf "$tmp" when done
```

## Phase 2 — Orphan check (confirm before deleting)

A skill or agent renamed or retired upstream leaves its old file behind locally,
and a stale skill is live instructions a session will still execute. After
Phase 1, diff the upstream tree against the local directories:

```bash
upstream=$(gh api "repos/akyachtsman/claude.directives/git/trees/main?recursive=1" \
  --jq '.tree[] | select(.type=="blob") | .path' | grep -E '^\.claude/(skills|agents)/')
local=$(find .claude/skills .claude/agents -type f 2>/dev/null)
comm -13 <(echo "$upstream" | sort) <(echo "$local" | sort)
```
(Tarball fallback: build `upstream` with `( cd "$tmp" && find .claude/skills .claude/agents -type f )`.)

Any local file absent upstream is an **orphan candidate** — but it may also be a
legitimate project-local skill or agent, and there is no provenance to tell the
two apart automatically. So NEVER delete silently: list the candidates and ask
the user which are upstream-removed (delete) vs. project-local (keep). If there
are no candidates, say so and move on.

## Phase 3 — Template drift report (report-only by default)

Projects also carry copies of `claude.directives/templates/` made at bootstrap
by `new.repo`, and those copies never update themselves. For each that exists
locally, compare against the upstream template and report drift:

| Local path | Upstream template | Refresh policy |
|---|---|---|
| `.github/workflows/<wf>.yml` (qa, qa-live, ci-monitor, codex-monitor, pages-monitor, cron-notify, keepalive) | `templates/workflows/<wf>.yml` | Verbatim drop-ins — offer to overwrite; confirm once for the batch. Exception: if the project renamed `qa.yml`'s `name:`, preserve `ci-monitor.yml`'s `workflows:` list. |
| `.github/scripts/ui-tests/` | `templates/ui-tests/` | Customized per-project (selectors, `package.json`) — show per-file diffs, apply only what the user approves. Never touch `package-lock.json`. |
| `.github/scripts/notify-email.js` | `templates/scripts/notify-email.js` | Same — diff and confirm. |
| `.claude/settings.json` | `templates/claude-settings.json` | May contain project-local hooks — report missing/changed upstream hooks and **merge** approved ones; never replace the file wholesale. |

Skip rows whose local path doesn't exist (the project never installed that
piece). In `claude.directives` itself, skip Phase 3 — the templates ARE the
source. Compare with the tarball copy from Phase 1, or fetch individual files
via `gh api`/raw URL.

## Report

Run silently, then type `my.list` to confirm the refreshed skill menu and
report: skills/agents added or updated, orphan candidates and their resolution,
and template drift found (and what, if anything, was applied).
