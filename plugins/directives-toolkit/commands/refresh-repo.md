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

**`DRIFT` is a question, not a verdict — and it is what makes a curated
exception list unnecessary.** This pass already knows, per file, whether the
local copy differs from the template. An allow-list of files *permitted* to
differ is the same failure shape as a watch list pinned to one workflow name:
correct the day it is written, silently wrong after the next local improvement,
and nothing detects the gap. `pages-retry.yml` earned an exemption on
2026-08-17 and the list never learned; a verbatim refresh would have deleted
that hardening and re-broken the trigger it also fixed (raised by apfp.claude,
2026-08-19). So there is no list: a diff is self-maintaining, and every
`DRIFT` file is resolved by looking at it.

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

Disposition each DRIFT by READING THE DIFF. There is no list of files allowed
to differ and no blind default in either direction — a rule that says "restore"
without looking deletes improvements, and one that says "keep" without looking
preserves tampering. Both are the same mistake.
1. **The diff is only a `workflow_run` watch list in a file whose list is
   MEANT to vary per project** — `ci-monitor.yml`, `ci-notify.yml`,
   `qa-live.yml`, `pages-monitor.yml` — or the project's CLAUDE.md records the
   change. A legitimate adaptation: keep it, and report it, so an adaptation
   nobody upstream knows about becomes a Downstream-Finding Loop item rather
   than a permanent local secret.
   **`pages-retry.yml` is NOT in that set.** Its list encodes an invariant, not
   a preference: the template retries the managed branch-source deploy only,
   because re-running a project-owned deploy replays that workflow's whole
   build. A watch-list diff there is therefore never auto-kept — it needs the
   project's CLAUDE.md to record why its deploy is safe to replay (idempotent,
   no build or test steps) **and a revisit trigger** naming the condition that
   ends the exception — the reasoning describes the deploy today, so without an
   end condition the customization outlives its own justification. Both are
   required; the pair routes it through the documented-customization path above
   instead of being preserved silently. ⚠️ When that trigger fires, the watcher
   is **deleted, not narrowed** — narrowing leaves a file that passes every
   check and watches a name that can no longer fire (W3).
2. **Anything else** — show the full diff and ask. An unexplained workflow drift
   can be an accidental session edit or tampering (git.md requires eyes-on-the-
   diff for every workflow PR precisely so this class stays rare), and it can
   equally be a hardening this repo has not absorbed yet — 2026-08-19 produced
   one of each. Only the diff separates them.
3. **If the answer is genuinely unclear, keep local and report it.** The costs
   are asymmetric: a wrongly-kept bad edit is caught by the next review or CI
   run, while a wrongly-restored improvement is deleted with nothing left to
   notice. Never silently preserve — keeping without reporting is how a fix
   spends two days in one repo.

## Phase 2 — Upstream delta since last sync (installed templates)

The actionable signal for the project's installed template copies is what
changed UPSTREAM since this project's last sync — stamped in
`.claude/directive-sync.json` under `upstream.sha` (Phase 3).

Get the head SHA over **git transport**, not the API: `gh` is absent in most
remote/web sessions and `api.github.com` is refused at the proxy, so the API
route returns empty in exactly the sessions that run this command (`/env-chk`
uses `ls-remote` for the same reason). The compare call is optional enrichment —
the stamp must never depend on it.

```bash
classified=
last=$(jq -r '.upstream.sha // empty' .claude/directive-sync.json 2>/dev/null)
head=$(git ls-remote https://github.com/akyachtsman/claude.directives.git refs/heads/main | cut -f1)
# INVALIDATE FIRST. Any marker left by an earlier invocation is cleared before
# this run attempts anything, so a verdict can only ever be THIS run's. Without
# it, a run interrupted after writing the marker left approval lying around: a
# later run against the same head whose compare FAILED would find the stale
# marker, match it against the unchanged head, and permanently advance the stamp
# past a delta nobody dispositioned. SHA-binding alone does not catch that,
# because the SHA is the same.
rm -f "$(git rev-parse --git-path refresh-repo-classified)"

if [ -z "$head" ]; then
  echo "upstream head unavailable this run — SKIPPING Phases 2-3, stamp unchanged"
elif [ -n "$last" ] && [ "$last" != "$head" ]; then
  # Optional: file-level classification. Needs gh; degrade loudly when absent.
  # Lists EVERY changed path, not just templates|docs|directives: a delta made
  # only of plugins/ changes printed nothing while still recording "classified",
  # so the next run treated an unseen change as handled. The disposition table
  # below covers plugins/ as informational — it still has to be SEEN.
  if command -v gh >/dev/null 2>&1 \
     && gh api "repos/akyachtsman/claude.directives/compare/$last...$head" \
          --jq '.files[] | "\(.status)\t\(.filename)"'; then
    classified=yes   # the delta was READ — Phase 3 may advance the stamp
    # Written only AFTER the delta has actually been listed. Records WHICH head
    # was classified, so Phase 3 can refuse a verdict made against a different
    # head. `git rev-parse --git-path` because in a linked worktree .git is a
    # FILE, and a redirect into it fails.
    printf '%s' "$head" > "$(git rev-parse --git-path refresh-repo-classified)"
  else
    echo "compare unavailable (gh absent or call failed) — delta known by SHA only"
    echo "($last -> $head); classify per the Propagation Matrix in"
    echo "MAINTAIN-REPO-USER-INSTRUCTIONS.md. The stamp will NOT advance."
  fi
else
  # Nothing to classify: either no prior stamp (first run — the per-file policy
  # is applied directly, below) or the stamp already equals head. Both are
  # legitimately stampable.
  classified=yes
  printf '%s' "$head" > "$(git rev-parse --git-path refresh-repo-classified)"
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
| `templates/workflows/<wf>.yml` | `.github/workflows/<wf>.yml` | Verbatim drop-ins — but **never batch-overwrite a file Phase 1.5 flagged `DRIFT`**. Batch overwrite covers only files that already match the template (no-ops) and files absent locally. ⚠️ **EXCEPT `pages-retry.yml`, whose ABSENCE can be deliberate — never batch-install it.** An Actions-source project is required to delete it (`automations.md` → *Watcher Rules* W3), so "absent locally" is the intended end state, not a gap; re-installing it re-arms a retry of a rogue unfiltered deploy on a visibility flip. Decide it in both branches rather than as a single condition: **branch-source** → install it and restore its `REQUIRED` entry in the same edit; **Actions-source** → leave it absent, **unless** the project has taken W3's idempotent exception, in which case it carries a repointed copy whose `REQUIRED` entry names the project's own deploy — never overwrite that with the template or drop that entry. This row is the reason that deletion needs a rule at all: without it, the first refresh that touches the retry template undoes the fix silently. For each `DRIFT` file, show the diff and decide singly — local drift is as often an improvement this repo has not yet absorbed as it is corruption, and only the diff distinguishes them; keep local only when the diff leaves it genuinely unclear (see Phase 1.5's disposition rule, which this row defers to). Anything worth keeping is a finding for the Downstream-Finding Loop — hand it upstream rather than letting the next refresh delete it again |
| `templates/actions/<a>/action.yml` | `.github/actions/<a>/action.yml` | Verbatim drop-ins — the qa workflows reference them as `./.github/actions/*`; install them WITH any qa workflow update (missing composites fail every run at step resolution) |
| `templates/ui-tests/**` | `.github/scripts/ui-tests/**` | Per-project customized — per-file diffs, apply only approved hunks; never touch `package-lock.json`. **This row outranks any message telling you to take the kit wholesale**, including one from an upstream session: `claude.insurance` was told exactly that on 2026-08-26 and diffing first is the only reason their `LIVE_TARGET` reachability split survived — a locally-defined guard, absent upstream, without which three scenarios would have run against a backend-less server on a blocking job. A kit file a project extended is invisible to whoever wrote the instruction |
| `templates/scripts/*` | `.github/scripts/*` | Diff and confirm — **except any script a workflow or composite action you are installing REFERENCES BY PATH**, which installs WITH it **including when the local path does not yet exist**, exempt from the skip rule below. Same failure as a missing composite: the caller names it by path, so an absent one fails every run at step resolution — a refresh that takes the caller and skips the script it calls installs a red build. ⚠️ **DERIVE this set, do not recall it** — see *Deriving the referenced-script set* immediately below the table. The command does not live in this cell, because a shell pipeline cannot be written inside a markdown table row without escaping the `|`, and an escaped pipe silently changes what it matches. A hand-list here has now fallen behind its own general form twice: `check-ui-viewports.js` was missing when `claude.insurance` refreshed, and every UI job there would have died at step resolution had they applied this row literally (directives#321) |
| `templates/claude-settings.json` | `.claude/settings.json` | Plugin-enable block + the `SessionStart` registration — verbatim overwrite OK unless the project added its own keys; then merge. Install it WITH the hook row below, never alone |
| `templates/claude-hooks/session-start.sh` | `.claude/hooks/session-start.sh` | Verbatim drop-in, `chmod +x` — and re-apply `chmod +x` on every refresh, since a lost executable bit is invisible to a content diff and a non-executable hook silently never runs. Install it WHENEVER the settings row above is installed, **including when the local path does not yet exist** — this row is exempt from the skip rule below. A registered `SessionStart` hook whose script is missing is a startup error in every subsequent session |
| `templates/CLAUDE-template.md` | `CLAUDE.md` (written once at bootstrap) | Never overwrite — project-owned; delta is informational only |
| `directives/*`, `docs/*`, `plugins/*` | not installed — read live / delivered by the plugin | Informational; no local file to update |

Skip rows whose local path doesn't exist (the project never installed that piece)
— with TWO exceptions, both for the same reason: a file another installed file
names by path is not optional, and skipping it ships a broken reference.
- the `claude-hooks` row, whose whole purpose is first installation and whose
  absence breaks the settings row that references it;
- the **workflow- OR composite-referenced** entries of the `templates/scripts/*`
  row, whose absence fails at step resolution once the caller is updated —
  `static-checks` for a script `qa.yml` names directly, and **every UI job** for
  one only the `ui-suite` composite names (`check-ui-viewports.js` is that case,
  and reading this list as "qa-invoked" is what let it be skipped: directives#321).

⚠️ **And one absence that must be RESPECTED rather than filled — the inverse
case, which the rows above and this rule read oppositely.** The
`templates/workflows/<wf>.yml` row batch-installs files "absent locally"; this
rule skips paths that do not exist. For most workflows those agree, because
installing a watcher that was merely never installed restores coverage. For a
workflow carrying a **`schedule:`** trigger they do not: installing it does not
restore coverage, it **creates recurring work**, and there is no dormant option
because `schedule:` fires.

So: **an absent SCHEDULED workflow is skipped unless the project has a task for
it.** `cron-notify.yml` is the worked case — `claude.trading` correctly declined
it on 2026-08-26, because its `notify-task.js` is still the bootstrap stub that
prints a placeholder and exits, no SMTP vars are set, and its real scheduled work
runs as `pg_cron` inside Supabase. Installing it would have bought a daily
checkout, a daily `npm install`, and a no-op, forever. They verified it was not
load-bearing first: no `workflow_run` names it, and `workflow-ref-guard` reports
all required watchers intact without it.

This is the same principle as `pages-retry.yml`'s carve-out above and belongs
beside it: **"absent locally" is not a fact about the project's intent.** Ask
what installing it *starts*, not only what it restores.

### Deriving the referenced-script set

⚠️ **Derive from the UPSTREAM files you are installing — fetched, not local.**
`/refresh-repo` runs inside a *project*, where `templates/workflows/` and
`templates/actions/` do not exist; those are upstream paths. And scanning the
project's own `.github/` copies is worse than useless here: it would miss
precisely the case this exists for — **a script newly referenced by the caller
you are about to install**, which by definition the installed copy does not yet
mention.

So the input is the fetched upstream text, using the same `$raw` this command
already establishes, over the caller files **in this refresh's delta** (not a
fixed list — that is the mistake one level up):

```bash
repo="akyachtsman/claude.directives"
head="…the SHA Phase 2 classified…"   # NOT main — that ref moves under you
raw="https://raw.githubusercontent.com/$repo/$head"
callers="…the templates/workflows/*.yml and templates/actions/*/action.yml
         paths this refresh is installing…"

buf=$(mktemp)
for c in $callers; do
  curl -fsSL "$raw/$c" >>"$buf" \
    || { echo "FETCH FAILED: $c — derivation INVALID, do not use it" >&2
         rm -f "$buf"; exit 1; }
done
refs=$(grep -oE '(node|python3) \.github/scripts/[A-Za-z0-9_.-]+\.(js|py)' "$buf" \
       | awk '{print $2}' | sort -u)
rm -f "$buf"
printf '%s\n' "$refs"
```

Three things about that shape, each of which a shorter version got wrong:

- **Every fetch is checked individually, and a failure exits before the
  pipeline.** Putting the loop *inside* `refs=$(…)` does not work: the `exit 1`
  leaves only the subshell, `sort` still succeeds, and `refs` comes back
  **non-empty from the callers that did fetch** — so a 404 on
  `ui-suite/action.yml` after `qa.yml` succeeded yields a partial set that passes
  any emptiness check, silently omitting `check-ui-viewports.js`. That is the
  precise failure this block exists to prevent.
- **An empty result is not automatically wrong.** If the only changed caller
  invokes no script — `pages-monitor.yml` and `secret-scan/action.yml` are both
  like this today — then the correct derivation *is* empty. Asserting non-empty
  makes the procedure fail closed on a legitimate delta. **Emptiness is only
  suspicious when a fetch failed**, which is why the check belongs on the fetch
  and not on the result.
- **Pin the fetch to the SHA Phase 2 classified, never `main`.** `main` can
  advance mid-refresh, or between two caller requests, so the derived set can
  come from a newer or mixed revision than the callers you are installing — and
  Phase 3's head check only refuses the *stamp* afterwards; it does not un-install
  anything.

Match on the INVOCATION, not the bare path, or it also emits directories,
`package-lock.json`, and paths that appear only in comments.

**The output is the answer for THAT refresh, and it moves.** Run against
`main` on 2026-08-26 with `qa.yml` + `ui-suite/action.yml` as the callers it
yields four — `check-contrast.js`, `workflow-ref-guard.py`,
`check-job-bounds.py`, `check-ui-viewports.js` — and five once directives#325
lands, which adds `check-py-warnings.py` to `qa.yml`. That is the derivation
working: it reports what the callers you are installing actually reference, not
what a list-writer remembered. **The output is never the rule.**

⚠️ **This command has now failed FOUR ways, every one silent, and the history
is the argument for the shape above.** None were hypothetical:

1. Written in the table cell with its pipes escaped for markdown — `\|` in
   `grep -E` matches a **literal pipe character**, so it matched nothing and
   exited 0.
2. Pointed at `templates/workflows/` and `templates/actions/`, which **do not
   exist in a project** — *No such file or directory*, and `sort` exited 0
   regardless.
3. Ran the fetch loop *inside* `refs=$(…)`, so a mid-loop `exit 1` left only the
   subshell: a failed caller yielded a **partial** set that passed an emptiness
   check and silently dropped the scripts only that caller names.
4. Asserted the result must be non-empty — which **fails closed** on a
   legitimate delta whose only changed caller invokes no script.

Three of the four came from *fixing* the one before it. A derivation that fails
open is strictly worse than the hand-list it replaced, because a hand-list at
least tells you what somebody once believed; and one that fails closed gets
muted, which returns it to failing open by another route. **Check the fetch,
report the result, and let an honestly-empty answer be empty.**

The general form, worth applying to any row added later: **if the thing being
installed REFERENCES a path, that path installs with it, present or not.** The
composites row already carries this rule; these two are the same rule.

## Phase 3 — Stamp and report

**The stamp means "the delta up to this SHA was classified and dispositioned",
not "this SHA was observed."** Advance it ONLY when Phase 2 actually obtained the
file-level delta. Two distinct failures make an unguarded stamp destructive:
- An empty `$head` writes `{"sha": "", "synced": "<today>"}`, destroying the only
  field `/env-chk`'s staleness alarm reads AND back-dating it as freshly synced.
- A `$head` obtained by `ls-remote` while the compare call was unavailable
  (`gh` absent — the common case this command documents) advances the stamp past
  a delta nobody looked at. Phase 1.5 does not inspect customized paths like
  `.github/scripts/ui-tests/**`, so the next refresh sees the new SHA as already
  synced and never revisits it: the skipped change is missed permanently, not
  merely deferred.

Set `classified=yes` in Phase 2 only on the branch where the compare output was
actually read (including "no files changed"); leave it unset otherwise.

```bash
# RE-DERIVED, not inherited. Every Bash call is a FRESH SHELL, so $head/$last/
# $classified set in Phase 2's block are all empty here — the guard would take
# the "upstream head unavailable" branch every time and the stamp could NEVER
# advance. Phase 2 leaves its verdict in a file for exactly this reason.
last=$(jq -r '.upstream.sha // empty' .claude/directive-sync.json 2>/dev/null)
head=$(git ls-remote https://github.com/akyachtsman/claude.directives.git refs/heads/main | cut -f1)
marker=$(git rev-parse --git-path refresh-repo-classified)
classified_head=$(cat "$marker" 2>/dev/null)
rm -f "$marker"
# The verdict is only valid for the SHA it was made against. If upstream moved
# between the two Bash calls, or a stale marker survived an interrupted run,
# this mismatch makes Phase 3 refuse rather than stamp a delta nobody read.
classified=no
[ -n "$classified_head" ] && [ "$classified_head" = "$head" ] && classified=yes

if [ -z "$head" ]; then
  echo "upstream head unavailable this run — stamp unchanged, re-run /refresh-repo later"
elif [ "$classified" != "yes" ]; then
  echo "delta from $last to $head was NOT classified for THIS head — stamp"
  echo "left at $last on purpose, so the next run re-examines it. Classify by hand"
  echo "via MAINTAIN-REPO-USER-INSTRUCTIONS.md → Propagation Matrix to clear it."
else
  # mktemp in the DESTINATION dir: a fixed /tmp name races a second session, and
  # a cross-filesystem mv degrades from an atomic rename to a copy — which is the
  # partial-write hazard this same file warns about under Phase 1.5.
  tmp=$(mktemp .claude/.directive-sync.XXXXXX) || tmp=''
  if [ -n "$tmp" ] \
     && jq --arg sha "$head" --arg d "$(date -u +%F)" \
          '.upstream = {sha: $sha, synced: $d}' .claude/directive-sync.json > "$tmp" \
     && [ -s "$tmp" ] \
     && mv "$tmp" .claude/directive-sync.json; then
    echo "stamped: $head"
  else
    [ -n "$tmp" ] && rm -f "$tmp"
    echo "COULD-NOT-STAMP: .claude/directive-sync.json left unchanged; report it"
  fi
fi
```
(Create the file with `{}` first if the project has none.)

**Stamp only a VERIFIED head SHA.** If the commits/compare/refs endpoints are
unreachable this run (proxy rate limits), skip Phases 2–3 gracefully: report
"upstream delta unavailable this run — stamp unchanged, re-run /refresh-repo
later", keep the old stamp, and never fabricate a SHA or an unverified delta
(global.md → Behavior Rules → evidence before assertions).

Report: rules re-read (Phase 0), broken references and fixes, the upstream
delta with per-file dispositions, the new stamp — and remind that any toolkit
changes in the delta arrive via the plugin at next session start.
