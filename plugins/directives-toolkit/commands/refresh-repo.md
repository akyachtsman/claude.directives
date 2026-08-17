---
description: "Re-sync this project with claude.directives mid-session — re-read the rules and report the upstream delta since the last sync."
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
load at session start only — a mid-session upstream merge never reaches THIS
session. With `.claude/hooks/session-start.sh` installed it reaches the next one;
without it, only when the environment's cached setup script rebuilds (web: on an
env-config change or ~weekly cache expiry).

## Phase 1 — Broken upstream references

Upstream renames/deletions silently 404 every project file that points at the
old path. Validate every explicit `claude.directives` reference in this project
against the upstream tree:

```bash
tree=$(gh api "repos/akyachtsman/claude.directives/git/trees/main?recursive=1" \
  --jq '.tree[] | select(.type=="blob") | .path')
# GUARD: an empty tree makes EVERY path look BROKEN. Never run the loop on a
# failed fetch — skip validation and say so instead of reporting false breaks.
if [ -z "$tree" ]; then
  echo "tree fetch failed — SKIPPING reference validation (no false BROKENs)"
else
  grep -rhoE 'claude\.directives/(main/)?[A-Za-z0-9._/-]+\.[A-Za-z0-9]+' \
    --include='*.md' --include='*.yml' --include='*.json' . 2>/dev/null \
    | sed -E 's#.*claude\.directives/(main/)?##' | sort -u \
    | grep -E '^(directives|docs|templates|plugins|\.claude|\.github)/' \
    | while read -r p; do
      echo "$tree" | grep -qx "$p" || echo "BROKEN: $p"
    done
fi
```
**Remote-session transport (verified 2026-07-18, apfp.claude):** `gh` is usually
absent and sandbox curl to `api.github.com` is proxy-blocked or rate-limited
(unauthenticated per-IP limits on a shared fleet IP — expect 403s after a call
or two). Use **WebFetch** for the api.github.com calls (server-side, own egress),
and spend the budget on the ONE `git/trees` call — it carries everything Phase 1
needs. Individual raw-URL spot-checks (`raw.githubusercontent.com`, CDN-served,
not rate-limited the same way) are the fallback for a handful of paths. A failed
fetch is "cannot verify", never "BROKEN".

For each BROKEN path, search the tree for its basename (rename candidate) and
propose the fix; deletions get "content was folded — check upstream docs/README.md".

## Phase 1.5 — Installed-copy integrity (delta-independent drift check)

Phase 2 only examines files UPSTREAM changed since the stamp — a locally
corrupted copy of an *unchanged* template is invisible to it forever
(identified gap, 2026-07-19: an accidental session edit to a project's qa.yml
would never be flagged). This pass compares every installed verbatim drop-in
against the CURRENT upstream template, regardless of delta:

```bash
repo="akyachtsman/claude.directives"
raw="https://raw.githubusercontent.com/$repo/main"
for f in .github/workflows/*.yml .github/actions/*/action.yml \
         .claude/hooks/session-start.sh; do
  [ -f "$f" ] || continue
  case "$f" in
    .github/workflows/*) t="templates/workflows/$(basename "$f")";;
    .claude/hooks/*)     t="templates/claude-hooks/$(basename "$f")";;
    *)                   t="templates/actions/$(basename "$(dirname "$f")")/action.yml";;
  esac
  tmpl=$(curl -fsSL "$raw/$t") \
    || { echo "NO-TEMPLATE: $f (project-specific — skip)"; continue; }
  diff -q <(printf '%s\n' "$tmpl") "$f" >/dev/null 2>&1 || echo "DRIFT: $f"
done
```
(raw.githubusercontent.com is CDN-served and works from remote sessions; a
failed fetch is "cannot verify", never DRIFT.)

**Hook repair (runs before the loop, delta-independent).** Three broken states,
not one: the script absent, present but unregistered, and present but not
executable. `/env-chk` now reports all three and names `/refresh-repo` as the
repair, so all three must be repairable here — Phase 1.5 never inspects
`.claude/settings.json`, and Phase 2 only sees upstream changes, so a
current-stamped project would otherwise refresh forever without being fixed.
After the install block below, repair registration and the exec bit:

```bash
# exec bit: invisible to a content diff, and a non-executable hook never runs
[ -f .claude/hooks/session-start.sh ] && [ ! -x .claude/hooks/session-start.sh ] \
  && chmod +x .claude/hooks/session-start.sh \
  && echo "REPAIRED: exec bit on .claude/hooks/session-start.sh"

# registration: merge the SessionStart row when the script exists but nothing runs it
# Parse the SessionStart array; do not grep the file. A project may already run an
# unrelated SessionStart hook AND reference this script under some other event, so
# file-wide greps can both succeed while nothing invokes the updater at session start.
if [ -f .claude/hooks/session-start.sh ] \
   && ! jq -e '[.hooks.SessionStart[]?.hooks[]?.command] 
            | any((gsub("\"";"") | split(" ")[0] | endswith("hooks/session-start.sh")))' \
       .claude/settings.json >/dev/null 2>&1; then
  echo "MISSING-REGISTRATION: .claude/settings.json has no SessionStart row —"
  echo "  merge it from templates/claude-settings.json (do not overwrite the file;"
  echo "  the project may carry its own keys), then re-run /env-chk to confirm."
fi
```

**Absent-hook install (also delta-independent).** A legacy
project has no `.claude/hooks/session-start.sh` at all, and neither pass would
ever create one: the loop below skips absent files, and Phase 2 only processes
templates that changed upstream since the stamp — which a project stamped after
the hook shipped never sees. Without this step the offer `/env-chk` makes cannot
be honoured and the project stays legacy through every refresh.

Download to a temporary file and rename only after it validates. Writing the
final path directly would leave a truncated or invalid hook behind on a failed
fetch — and because the absent-hook test is `[ ! -f ]`, that wreckage then reads
as "already installed" on every later refresh while `/env-chk` reports the
project hook-enabled. A half-install is worse than no install here.

```bash
repo="akyachtsman/claude.directives"
raw="https://raw.githubusercontent.com/$repo/main"
if [ -f .claude/settings.json ] && [ ! -f .claude/hooks/session-start.sh ]; then
  mkdir -p .claude/hooks
  # mktemp inside the DESTINATION dir: a bare `mktemp` lands in /tmp, and when
  # /tmp is a different filesystem `mv` degrades from an atomic rename to a copy
  # — reintroducing the partial-final-file this block exists to prevent.
  tmp=$(mktemp .claude/hooks/.session-start.XXXXXX) || tmp=''
  # chmod and mv are INSIDE the tested condition: without set -e a failing
  # `&&` chain would still fall through to the success message.
  if [ -n "$tmp" ] \
     && curl -fsSL --connect-timeout 5 --max-time 60 \
          "$raw/templates/claude-hooks/session-start.sh" -o "$tmp" \
     && [ -s "$tmp" ] && bash -n "$tmp" \
     && chmod +x "$tmp" \
     && mv "$tmp" .claude/hooks/session-start.sh; then
    echo "INSTALLED: .claude/hooks/session-start.sh (was absent)"
  else
    [ -n "$tmp" ] && rm -f "$tmp"
    echo "COULD-NOT-INSTALL: .claude/hooks/session-start.sh — nothing written; report it"
  fi
fi
```
Install the settings row in the same pass, so the registration and its target
always land together.

`session-start.sh` is also in the loop below rather than only in Phase 2, because
Phase 2 sees only what changed UPSTREAM: a locally truncated hook whose template never
moved would otherwise stay broken through every refresh, failing session start
each time. Restore it from the template rather than hand-editing, and re-run
`bash -n` on it.

Disposition each DRIFT — three classes, in checking order:
1. **Expected adaptation** — `ci-monitor.yml` / `ci-notify.yml` where the diff
   is ONLY the `workflow_run` watch list: keep, no report needed.
2. **Documented customization** — the project's CLAUDE.md records the local
   change: keep, mention in the report.
3. **Unexplained drift** — everything else. Show the full diff and ask; the
   default is **restore from the template**. An unexplained workflow drift
   means an accidental session edit or tampering (git.md requires eyes-on-the-
   diff for every workflow PR precisely so this class stays empty) — it is a
   red flag to resolve, never a customization to silently preserve.

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
| `templates/workflows/<wf>.yml` | `.github/workflows/<wf>.yml` | Verbatim drop-ins — offer batch overwrite; EXCEPT preserve locally-adapted `workflow_run` watch lists in `ci-monitor.yml` AND `ci-notify.yml` (repos whose QA workflows carry non-template `name:` values adapt those lists; overwriting them re-breaks the trigger — verified on apfp.claude 2026-07-18) |
| `templates/actions/<a>/action.yml` | `.github/actions/<a>/action.yml` | Verbatim drop-ins — the qa workflows reference them as `./.github/actions/*`; install them WITH any qa workflow update (missing composites fail every run at step resolution) |
| `templates/ui-tests/**` | `.github/scripts/ui-tests/**` | Per-project customized — per-file diffs, apply only approved hunks; never touch `package-lock.json` |
| `templates/scripts/*` | `.github/scripts/*` | Diff and confirm |
| `templates/claude-settings.json` | `.claude/settings.json` | Plugin-enable block + the `SessionStart` registration — verbatim overwrite OK unless the project added its own keys; then merge. Install it WITH the hook row below, never alone |
| `templates/claude-hooks/session-start.sh` | `.claude/hooks/session-start.sh` | Verbatim drop-in, `chmod +x` — and re-apply `chmod +x` on every refresh, since a lost executable bit is invisible to a content diff and a non-executable hook silently never runs. Install it WHENEVER the settings row above is installed, **including when the local path does not yet exist** — this row is exempt from the skip rule below. A registered `SessionStart` hook whose script is missing is a startup error in every subsequent session |
| `templates/CLAUDE-template.md` | `CLAUDE.md` (written once at bootstrap) | Never overwrite — project-owned; delta is informational only |
| `directives/*`, `docs/*`, `plugins/*` | not installed — read live / delivered by the plugin | Informational; no local file to update |

Skip rows whose local path doesn't exist (the project never installed that piece)
— EXCEPT the `claude-hooks` row, whose whole purpose is first installation and
whose absence breaks the settings row that references it.

## Phase 3 — Stamp and report

```bash
jq --arg sha "$head" --arg d "$(date -u +%F)" \
  '.upstream = {sha: $sha, synced: $d}' .claude/directive-sync.json \
  > /tmp/ds.json && mv /tmp/ds.json .claude/directive-sync.json
```
(Create the file with `{}` first if the project has none.)

**Stamp only a VERIFIED head SHA.** If the commits/compare/refs endpoints are
unreachable this run (proxy rate limits), skip Phases 2–3 gracefully: report
"upstream delta unavailable this run — stamp unchanged, re-run /refresh-repo
later", keep the old stamp, and never fabricate a SHA or an unverified delta
(global.md → Evidence before assertions).

Report: rules re-read (Phase 0), broken references and fixes, the upstream
delta with per-file dispositions, the new stamp — and remind that any toolkit
changes in the delta arrive via the plugin at next session start.
