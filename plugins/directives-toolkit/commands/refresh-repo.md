---
description: "Re-sync this project with claude.directives mid-session — re-read the rules, flag broken upstream references, and report the upstream delta since the last sync (toolkit content itself updates via the plugin at session start)"
phase: cross-cutting
---
Re-sync the project against `akyachtsman/claude.directives` **mid-session**.
The toolkit (commands/skills/agents/hooks) ships via the `directives-toolkit`
plugin and refreshes itself at session start — this command covers everything
the plugin can't: the session's in-context rules, the project's references to
upstream paths, and the project's *installed copies* of upstream templates.

In `claude.directives` itself, run only Phase 0 — the templates ARE the source,
and CI validates references.

## Phase 0 — Re-read the rules (context refresh)

The session's working rules were loaded at session start and do NOT update
themselves. Re-fetch and re-read every imported directive URL from
CLAUDE.md (five as of `git.md`), and CLAUDE.md itself. Note: plugin content and `.claude/settings.json`
load at session start only — mid-session upstream merges reach the toolkit when
the environment's cached setup script rebuilds (web: on an env-config change or
~weekly cache expiry), not necessarily the next session.

## Phase 1 — Broken upstream references

Upstream renames/deletions silently 404 every project file that points at the
old path. Validate every explicit `claude.directives` reference in this project
against the upstream tree:

```bash
tree=$(gh api "repos/akyachtsman/claude.directives/git/trees/main?recursive=1" \
  --jq '.tree[] | select(.type=="blob") | .path')
grep -rhoE 'claude\.directives/(main/)?[A-Za-z0-9._/-]+\.[A-Za-z0-9]+' \
  --include='*.md' --include='*.yml' --include='*.json' . 2>/dev/null \
  | sed -E 's#.*claude\.directives/(main/)?##' | sort -u \
  | grep -E '^(directives|docs|templates|plugins|\.claude|\.github)/' \
  | while read -r p; do
    echo "$tree" | grep -qx "$p" || echo "BROKEN: $p"
  done
```
(No `gh`: fetch the tree via `https://api.github.com/repos/akyachtsman/claude.directives/git/trees/main?recursive=1` with curl.)

For each BROKEN path, search the tree for its basename (rename candidate) and
propose the fix; deletions get "content was folded — check upstream docs/README.md".

## Phase 2 — Upstream delta since last sync (installed templates)

The actionable signal for the project's installed template copies is what
changed UPSTREAM since this project's last sync — stamped in
`.claude/directive-sync.json` under `upstream.sha` (Phase 3).

```bash
last=$(jq -r '.upstream.sha // empty' .claude/directive-sync.json 2>/dev/null)
head=$(gh api repos/akyachtsman/claude.directives/commits/main --jq .sha)
if [ -n "$last" ] && [ "$last" != "$head" ]; then
  gh api "repos/akyachtsman/claude.directives/compare/$last...$head" \
    --jq '.files[] | select(.filename|test("^(templates|docs|directives)/")) | "\(.status)\t\(.filename)"'
fi
```
(First run with no stamp: skip the delta and apply the per-file policy directly.)

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
| `templates/claude-settings.json` | `.claude/settings.json` | Plugin-enable block — verbatim overwrite OK unless the project added its own keys; then merge |
| `templates/CLAUDE-template.md` | `CLAUDE.md` (written once at bootstrap) | Never overwrite — project-owned; delta is informational only |
| `directives/*`, `docs/*`, `plugins/*` | not installed — read live / delivered by the plugin | Informational; no local file to update |

Skip rows whose local path doesn't exist (the project never installed that piece).

## Phase 3 — Stamp and report

```bash
jq --arg sha "$head" --arg d "$(date -u +%F)" \
  '.upstream = {sha: $sha, synced: $d}' .claude/directive-sync.json \
  > /tmp/ds.json && mv /tmp/ds.json .claude/directive-sync.json
```
(Create the file with `{}` first if the project has none.)

Report: rules re-read (Phase 0), broken references and fixes, the upstream
delta with per-file dispositions, the new stamp — and remind that any toolkit
changes in the delta arrive via the plugin at next session start.
