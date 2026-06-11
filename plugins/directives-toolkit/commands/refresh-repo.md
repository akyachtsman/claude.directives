---
description: "Re-sync this project with claude.directives mid-session — re-read the rules, update .claude/skills/ and .claude/agents/ in place, flag orphans AND broken upstream references, and report the upstream delta since the last sync (not upstream-vs-local noise)"
---
Re-sync the project against `akyachtsman/claude.directives` **mid-session**.
Use after anything changed upstream and you want it live without restarting.
Unlike Session Start (which skips existing files), this **overwrites** them.

In `claude.directives` itself, run only Phases 0–2 — the templates ARE the
source, and CI already validates internal references.

## Phase 0 — Re-read the rules (context refresh)

The session's working rules were loaded at session start and do NOT update
themselves. Before syncing files, re-fetch and re-read the four imported
directive URLs from CLAUDE.md, and CLAUDE.md itself. Note: hook config
(`.claude/settings.json`) and agent definitions reload only on a NEW session —
flag any of those that later phases change as "live next session".

## Phase 1 — Skills & agents (overwrite in place)

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

Fallback without `gh` (also reusable in Phases 3–4):
```bash
tmp=$(mktemp -d)
curl -sL https://codeload.github.com/akyachtsman/claude.directives/tar.gz/main \
  | tar -xz -C "$tmp" --strip-components=1
for dir in skills agents; do
  [ -d "$tmp/.claude/$dir" ] || continue
  mkdir -p ".claude/$dir"
  cp -R "$tmp/.claude/$dir/." ".claude/$dir/"
done
# keep $tmp until Phase 4 is done; then rm -rf "$tmp"
```

## Phase 2 — Orphan check (confirm before deleting)

A skill/agent renamed or retired upstream leaves its old file behind locally —
live instructions a session will still execute. Diff upstream tree vs local:

```bash
upstream=$(gh api "repos/akyachtsman/claude.directives/git/trees/main?recursive=1" \
  --jq '.tree[] | select(.type=="blob") | .path' | grep -E '^\.claude/(skills|agents)/')
local=$(find .claude/skills .claude/agents -type f 2>/dev/null)
comm -13 <(echo "$upstream" | sort) <(echo "$local" | sort)
```
(Tarball fallback: build `upstream` from `( cd "$tmp" && find .claude/skills .claude/agents -type f )`.)

A candidate may be a legitimate project-local skill — provenance can't be told
apart automatically, so NEVER delete silently: list candidates, ask the user
which are upstream-removed (delete) vs project-local (keep).

## Phase 3 — Broken upstream references

Upstream renames/deletions silently 404 every project file that points at the
old path — no other check covers this direction. Validate every explicit
`claude.directives` reference in this project against the upstream tree:

```bash
tree=$(gh api "repos/akyachtsman/claude.directives/git/trees/main?recursive=1" \
  --jq '.tree[] | select(.type=="blob") | .path')
grep -rhoE 'claude\.directives/(main/)?[A-Za-z0-9._/-]+\.[A-Za-z0-9]+' \
  --include='*.md' --include='*.yml' --include='*.json' . 2>/dev/null \
  | sed -E 's#.*claude\.directives/(main/)?##' | sort -u \
  | grep -E '^(directives|docs|templates|\.claude|\.github)/' \
  | while read -r p; do
    echo "$tree" | grep -qx "$p" || echo "BROKEN: $p"
  done
```
(The top-dir filter drops non-path artifacts like the codeload `tar.gz/...`
URL form — only real repo paths are validated.)

For each BROKEN path, search the tree for its basename (rename candidate) and
propose the fix; deletions get "content was folded — check upstream docs/README.md".

## Phase 4 — Upstream delta since last sync (template drift)

Diffing upstream-vs-LOCAL is noise for customized files; the actionable signal
is what changed UPSTREAM since this project's last sync. The last synced commit
is stamped in `.claude/directive-sync.json` under `upstream.sha` (Phase 5).

```bash
last=$(jq -r '.upstream.sha // empty' .claude/directive-sync.json 2>/dev/null)
head=$(gh api repos/akyachtsman/claude.directives/commits/main --jq .sha)
if [ -n "$last" ] && [ "$last" != "$head" ]; then
  gh api "repos/akyachtsman/claude.directives/compare/$last...$head" \
    --jq '.files[] | select(.filename|test("^(templates|docs|directives)/")) | "\(.status)\t\(.filename)"'
fi
```
(No `gh`: fetch `https://api.github.com/repos/akyachtsman/claude.directives/compare/<last>...<head>`
with curl, or download the old-sha tarball from codeload and `diff -r` against the main tarball.
First run with no stamp: skip the delta and apply the per-file policy below directly.)

Then disposition each changed file — classify, don't blindly apply:
| Class | Disposition |
|---|---|
| **Equivalent-already** — upstream adopted what this project already does | Report-only; keep local |
| **New-upstream** — a fix/feature the local copy lacks | Show the upstream patch; apply on approval |
| **Local-custom** — deliberate project customization touched upstream | Preserve local; report the upstream intent |

The compare output emits **upstream paths, which never exist verbatim in a
project** — map each to its installed location before dispositioning:

| Upstream path | Installed locally at | Refresh policy |
|---|---|---|
| `templates/workflows/<wf>.yml` | `.github/workflows/<wf>.yml` | Verbatim drop-ins — offer batch overwrite; EXCEPT preserve a renamed `qa.yml` `name:` in `ci-monitor.yml`'s watch list |
| `templates/ui-tests/**` | `.github/scripts/ui-tests/**` | Per-project customized — per-file diffs, apply only approved hunks; never touch `package-lock.json` |
| `templates/scripts/*` | `.github/scripts/*` | Diff and confirm |
| `templates/claude-settings.json` | `.claude/settings.json` | Merge-only: report missing upstream hooks, merge approved ones; never replace wholesale |
| `templates/CLAUDE-template.md` | `CLAUDE.md` (written once at bootstrap) | Never overwrite — project-owned; delta is informational only |
| `directives/*`, `docs/*` | not installed — read live from upstream | Informational; no local file to update |

Skip rows whose local path doesn't exist (the project never installed that piece).

## Phase 5 — Stamp and report

Record the sync point so the next refresh diffs from here:
```bash
jq --arg sha "$head" --arg d "$(date -u +%F)" \
  '.upstream = {sha: $sha, synced: $d}' .claude/directive-sync.json \
  > /tmp/ds.json && mv /tmp/ds.json .claude/directive-sync.json
```
(Create the file with `{}` first if the project has none.)

Then type `my.list` to confirm the skill menu and report: rules re-read
(Phase 0), skills/agents updated (with any "live next session" flags), orphan
candidates and resolution, broken references and fixes, the upstream delta
with per-file dispositions, and the new stamp.
