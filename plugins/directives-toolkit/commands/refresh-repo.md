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
CLAUDE.md (currently five: `global.md`, `git.md`, `design.md`, `test.md`,
`data.md`), and CLAUDE.md itself. Note: plugin content and `.claude/settings.json`
load at session start only — a mid-session upstream merge never reaches THIS
session. With `.claude/hooks/session-start.sh` installed it reaches the next one;
without it, only when the environment's cached setup script rebuilds (web: on a
change to the setup script or allowed network hosts, or the ~weekly cache expiry).

## Phase 1 — Broken upstream references

Upstream renames/deletions silently 404 every project file that points at the
old path. Validate every explicit `claude.directives` reference in this project
against the upstream tree:

```bash
# Runs the same under ANY shell options a session has set (`-e`, `-u`,
# `-o pipefail`). The fetch sits in an `if`, so errexit cannot end the block
# before the guard reports.
src=https://github.com/akyachtsman/claude.directives.git
sha= tree= rc=1
# A blob-less shallow clone into a SCRATCH dir: trees only, no file contents,
# no checkout, nothing written to this project's .git. An EMPTY $objs must stop
# everything: `git -C ""` is a no-op, so every call would run against THIS
# project instead.
objs=$(mktemp -d) || objs=
if [ -n "$objs" ] \
   && git clone -q --depth 1 --filter=blob:none --no-checkout "$src" "$objs" \
   && sha=$(git -C "$objs" rev-parse HEAD) \
   && tree=$(git -C "$objs" ls-tree -r --name-only HEAD); then
  rc=0
fi
if [ -n "$objs" ]; then rm -rf "$objs"; fi
# GUARD: a failed fetch makes EVERY path look BROKEN. So require a clean exit,
# a HEAD that is a commit SHA, and a non-empty listing. Never test for a path
# being present: a renamed or deleted path is exactly what this phase reports,
# so using one as the sentinel would turn the breakage into CANNOT CHECK.
# `git ls-tree` is never truncated (the API's recursive tree could be, and was
# refused when it was), and a failed clone leaves $tree empty rather than
# filling it with an error body. Feed grep with here-strings: under pipefail an
# early-closing reader fed by `echo` can fail a pipeline whose match succeeded.
if [ "$rc" -ne 0 ] || ! grep -qE '^[0-9a-f]{40}$' <<<"$sha" || [ -z "$tree" ]; then
  echo "CANNOT CHECK: upstream tree not readable from this session — reference validation SKIPPED (no BROKEN verdicts). Use the raw-URL fallback below."
else
  # `|| true`: a project with no upstream references is a grep that matched
  # nothing, not a failure to stop on. A github.com `blob/main/` link names the
  # same file as a raw one, so that prefix is stripped. A `tree/` link names a
  # DIRECTORY, which this file listing cannot confirm: it stays unchecked.
  refs=$(grep -rhoE 'claude\.directives/(main/)?[A-Za-z0-9._/-]+\.[A-Za-z0-9]+' \
    --include='*.md' --include='*.yml' --include='*.json' . 2>/dev/null \
    | sed -E 's#.*claude\.directives/(blob/)?(main/)?##' | sort -u \
    | grep -E '^(directives|docs|templates|plugins|\.claude|\.github)/' || true)
  while read -r p; do
    [ -n "$p" ] || continue
    grep -qxF -- "$p" <<<"$tree" || echo "BROKEN: $p"
  done <<<"$refs"
fi
```
**Transport is git, never the API.** A web session's proxy refuses
`api.github.com` for every repository the session was not opened on — from a
downstream project, that includes claude.directives itself (verified 2026-10-08:
403, "GitHub access to this repository is not enabled for this session") — and
`gh` there is only `gh api`, so it fails the same way. Git transport needs no
auth, no MCP and no quota, and the blob-less clone above fetches the tree
without a single file's contents. Raw-URL spot-checks (`raw.githubusercontent.com`,
CDN-served, readable for any public repo) are the fallback for a handful of
paths. A failed fetch is "CANNOT CHECK", never "BROKEN" — and a fetch that
returned *something* has not succeeded until the content is a file listing.

For each BROKEN path, search the tree for its basename (rename candidate) and
propose the fix; deletions get "content was folded — check upstream docs/README.md".

## Phase 1.5 — Installed-copy integrity (delta-independent drift check)

Phase 2 only examines files UPSTREAM changed since the stamp — a locally
corrupted copy of an *unchanged* template is invisible to it forever. This pass
compares every installed verbatim drop-in against the CURRENT upstream template,
regardless of delta:

```bash
repo="akyachtsman/claude.directives"
raw="https://raw.githubusercontent.com/$repo/main"
for f in .github/workflows/*.yml .github/actions/*/* \
         .claude/hooks/session-start.sh; do
  [ -f "$f" ] || continue
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
```
(raw.githubusercontent.com is CDN-served and works from remote sessions.)

`.github/actions/*/*`, **not** `*/action.yml`: a composite runs its siblings —
`ui-suite` invokes `$GITHUB_ACTION_PATH/validate-report-path.py` as its first
step — so a locally corrupted sibling next to an unmodified `action.yml` is
exactly the invisible-drift case this pass exists for.

**`DRIFT` is a question, not a verdict — and it is what makes a curated
exception list unnecessary.** An allow-list of files *permitted* to differ is
correct the day it is written, silently wrong after the next local improvement,
and nothing detects the gap. So there is no list: a diff is self-maintaining,
and every `DRIFT` file is resolved by looking at it. (The incidents behind this
and the other Phase 1.5 rules are in claude.directives' internal history, which a
downstream checkout does not carry: the *Refresh-repo history* section of
https://github.com/akyachtsman/claude.directives/blob/main/docs/internal/gate-history.md.)

**Hook repair (runs before the loop, delta-independent).** This is the single
home of the hook checks `/env-chk` reports. Three broken states, not one: the
script absent, present but unregistered, and present but not executable. The
last two are the trap — the hook looks installed and never runs, and a content
diff sees nothing wrong with either. `/env-chk` reports all three and names
`/refresh-repo` as the repair, so all three must be repairable here — the loop
above never inspects `.claude/settings.json`, and Phase 2 only sees upstream
changes, so a current-stamped project would otherwise refresh forever without
being fixed. After the install block below, repair registration and the exec
bit; the registration is a settings write, so it goes through *Settings writes*
below. The registration test is the same `jq` expression `/env-chk` runs; it
parses the `SessionStart` array rather than grepping the file, for the reason
the comment in the block gives:

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
   && ! jq -e '[.hooks.SessionStart[]?.hooks[]? | ((.command // empty) | strings
                | gsub("\"";"") | split(" ")[0]), (.args[]? | strings)]
            | any(endswith("hooks/session-start.sh"))' \
       .claude/settings.json >/dev/null 2>&1; then
  echo "MISSING-REGISTRATION: .claude/settings.json has no SessionStart row —"
  echo "  merge the row from templates/claude-settings.json via Settings writes"
  echo "  (do not overwrite the file; the project may carry its own keys),"
  echo "  then re-run /env-chk to confirm."
fi
```

**Absent-hook install (also delta-independent).** A legacy project has no
`.claude/hooks/session-start.sh` at all, and neither the drift loop (it skips
absent files) nor Phase 2 (it sees only templates changed since the stamp) would
ever create one — so without this step the project stays legacy through every
refresh. Download to a temporary file and rename only after it validates: a
truncated hook written to the final path would pass the `[ ! -f ]` test as
"already installed" on every later refresh. A half-install is worse than none.

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
Install the settings row in the same pass (through *Settings writes* below), so
the registration and its target always land together.

`session-start.sh` is also in the drift loop, not only in Phase 2: a locally
truncated hook whose template never moved would otherwise stay broken through
every refresh. Restore it from the template rather than hand-editing, and re-run
`bash -n` on it.

Disposition each DRIFT by READING THE DIFF, with no blind default in either
direction: "restore" without looking deletes improvements, and "keep" without
looking preserves tampering.
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
   ends the exception, so the customization cannot outlive its justification.
   ⚠️ When that trigger fires, the watcher
   is **deleted, not narrowed** — narrowing leaves a file that passes every
   check and watches a name that can no longer fire (W3).
2. **Anything else** — show the full diff and ask. An unexplained workflow drift
   can be an accidental session edit or tampering (git.md requires eyes-on-the-
   diff for every workflow PR precisely so this class stays rare), and it can
   equally be a hardening this repo has not absorbed yet. Only the diff
   separates them.
3. **If the answer is genuinely unclear, keep local and report it.** The costs
   are asymmetric: a wrongly-kept bad edit is caught by the next review or CI
   run, while a wrongly-restored improvement is deleted with nothing left to
   notice. Never silently preserve.

### Settings writes

This command DECIDES what changes in `.claude/settings.json`; Anthropic's
built-in `update-config` skill WRITES it. Every write lands here: the
`SessionStart` row the hook repair above found missing, a settings-row merge in
Phase 2, and, in Phase 3, each `UNAPPLIED` settings entry dispositioned as apply
and each local `allow` extra dispositioned as remove. Make every decision first,
then invoke `update-config` with the Skill tool once, naming:
- **the file**: the project's `.claude/settings.json`, never
  `settings.local.json` or the user settings, since Phase 3 compares only the
  project file;
- **the exact entries**, copied from `templates/claude-settings.json` at the head
  being synced: the `SessionStart` object as the template writes it, each
  `permissions` entry with its section, each `enabledPlugins` or
  `extraKnownMarketplaces` key with its value, and each `allow` entry to remove;
- **merge, not replace**: append to the existing arrays and objects, skip an
  entry already present, and leave every other key, hook and permission alone.

Exact entries are what keep the decision here. `update-config` decides nothing
of its own, and an open-ended request makes it stop to ask which file to edit
or whether to replace an array, which stalls an unattended refresh. What it
contributes is the procedure, maintained by Anthropic against the settings
schema as that changes: read before writing, merge arrays rather than replace
them, validate with `jq -e`.

Observed 2026-10-08 on a scratch copy, never a real project file: it is
prompt-only. Invoking it loads that procedure, and the session's own Read and
Edit tools make the write. Given a file carrying a project-owned `SessionStart`
hook, a `PostToolUse` hook, `env`, `deny` and plugin keys, it appended the
toolkit's `SessionStart` row beside the existing one, added only the `allow`
entry that was missing, and changed nothing else. It does not create a missing
file (its procedure asks first), so a project with no `.claude/settings.json`
gets the template copied by the settings row: that is a create, not a merge.

**Fallback: the hand merge.** `update-config` ships with Claude Code, so a
session that has bundled skills turned off or hides it through
`skillOverrides` does not have it. When it is not in this session's skill list,
or the Skill tool refuses it, make the same merge by hand with the Edit tool,
under the same three rules above, then confirm the file still parses with
`jq empty .claude/settings.json`.

**Verify either way, and report which path ran.** Re-run the registration test
in the hook repair block (it prints nothing once the row is registered), and let
Phase 3's settings comparison re-check every entry. The refresh report states
`settings written via update-config`, or `settings written by hand
(update-config unavailable: <why>)`, with the entries written, or `no settings
writes`.

## Phase 2 — Upstream delta since last sync (installed templates)

The actionable signal for the project's installed template copies is what
changed UPSTREAM since this project's last sync — stamped in
`.claude/directive-sync.json` under `upstream.sha` (Phase 3).

Get the head SHA AND the file-level delta over **git transport**, never the
API: the proxy refuses `api.github.com` — and so `gh api` — for a repository the
session was not opened on (Phase 1), and no GitHub MCP call compares two refs. This is
the single home of the fetch rules below; `/env-chk` step 6 follows them for its
staleness alarm. `/refresh-repo` runs in a DOWNSTREAM
project, so claude.directives' objects are not local and `git fetch origin`
fetches the wrong repo. Fetch the classified SHA from the claude.directives URL
into a **scratch bare repo** instead — never into the project's own `.git`,
where a `--depth` fetch writes `.git/shallow` and leaves foreign objects behind.
Then, guarded by `git cat-file -e <sha>^{commit}` for both ends, run plain
`git diff` on `<stamp>..<live>`. The guard matters because the fetch is shallow
— a commit outside the depth makes `git diff` fail outright rather than degrade.
One bounded `git fetch --deepen 100` is worth trying; bare `--deepen` exits 129
because it requires a value. If the object is STILL missing after that one
attempt, stop retrying and report the delta uncategorised. Measured from a web
session (`CLAUDE_CODE_REMOTE=true`, 2026-09-23): `--depth=100` fetched in ~1s
and 1.6 MB, and `--deepen 100` reached 200 commits.

```bash
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
```
(First run with no stamp: skip the delta and apply the per-file policy directly.)

Then disposition each changed file — classify, don't blindly apply:
| Class | Disposition |
|---|---|
| **Equivalent-already** — upstream adopted what this project already does | Report-only; keep local |
| **New-upstream** — a fix/feature the local copy lacks | Show the upstream patch; apply on approval |
| **Local-custom** — deliberate project customization touched upstream | Preserve local; report the upstream intent |

The delta listing emits **upstream paths, which never exist verbatim in a
project** — map each to its installed location before dispositioning:

| Upstream path | Installed locally at | Refresh policy |
|---|---|---|
| `templates/workflows/<wf>.yml` | `.github/workflows/<wf>.yml` | Verbatim drop-ins — but **never batch-overwrite a file Phase 1.5 flagged `DRIFT`**. Batch overwrite covers only files that already match the template (no-ops) and files absent locally. ⚠️ **EXCEPT `pages-retry.yml`, whose ABSENCE can be deliberate — never batch-install it.** An Actions-source project is required to delete it (`automations.md` → *Watcher Rules* W3), so "absent locally" is the intended end state, not a gap; re-installing it re-arms a retry of a rogue unfiltered deploy on a visibility flip. Decide it in both branches rather than as a single condition: **branch-source** → install it and restore its `REQUIRED` entry in the same edit; **Actions-source** → leave it absent, **unless** the project has taken W3's idempotent exception, in which case it carries a repointed copy whose `REQUIRED` entry names the project's own deploy — never overwrite that with the template or drop that entry. This row is the reason that deletion needs a rule at all: without it, the first refresh that touches the retry template undoes the fix silently. ⚠️ **`pages-deploy.yml` is the mirror case, ACTIONS-SOURCE ONLY: never batch-install it on a branch-source project**, where the push already deploys and it would be a second, competing deploy on every push; on an Actions-source project it IS the deploy, and its filled-in `BUILD_CMD`/`SITE_DIR` make a local copy `DRIFT` by design, so keep those two values when taking a template change (and the same holds for `qa.yml`'s `BUILD_CMD`, `SITE_DIR` and `BUILD_PATHS` in a project with a build: resetting them to the shipped empties would skip or mis-serve its UI suite), and make sure `.github/workflow-ref-required.json` lists both of its watchers (`"qa-live.yml": ["Pages Deploy"]`, `"pages-monitor.yml": ["Pages Deploy"]`) — add a missing entry in the same edit, since without it a refresh that drops either trigger passes the guard. Likewise on Actions-source, `qa-live.yml` and `pages-monitor.yml` carry the deploy's `name:` added beside the template's arms (W2), so they are `DRIFT` by design: take a template change around that name, never drop it (`.github/workflow-ref-required.json` refuses the drop when it lists them). ⚠️ **And NEVER `keepalive.yml`, absent or present:** `/new-repo` deliberately does not scaffold it — it pushes to `main` weekly, which the required default-branch ruleset refuses, so installed it fails every week (`cicd-setup.md` → *9f — Scheduled-job notifications*); an installed copy is a finding to delete, not a template to refresh. For each `DRIFT` file, show the diff and decide singly — local drift is as often an improvement this repo has not yet absorbed as it is corruption, and only the diff distinguishes them; keep local only when the diff leaves it genuinely unclear (see Phase 1.5's disposition rule, which this row defers to). Anything worth keeping is a finding for the Downstream-Finding Loop — hand it upstream rather than letting the next refresh delete it again |
| `templates/actions/<a>/**` | `.github/actions/<a>/**` | Verbatim drop-ins — the qa workflows reference them as `./.github/actions/*`; install them WITH any qa workflow update (missing composites fail every run at step resolution). ⚠️ **The whole directory, not just `action.yml`.** A composite can run a SIBLING by path — `ui-suite` opens with `python3 "$GITHUB_ACTION_PATH/validate-report-path.py"` — and the referenced-script derivation below covers `.github/scripts/*`, NOT an action-path sibling, so a YAML-only install leaves the caller naming a file that was never copied and every UI job dies at that step. Same failure as a missing composite, one level in: take every file under `templates/actions/<a>/`, including paths absent locally |
| `templates/ui-tests/**` | `.github/scripts/ui-tests/**` | Per-project customized — per-file diffs, apply only approved hunks; never touch `package-lock.json`. **This row outranks any message telling you to take the kit wholesale**, including one from an upstream session: a kit file a project extended is invisible to whoever wrote the instruction, and diffing first is what preserves a locally-defined guard the template lacks. **Before diffing, read *Kit defects* below the table** — on every refresh of a project with this path, whether or not the delta touches the kit |
| `templates/scripts/*` | `.github/scripts/*` | Diff and confirm — **except any script a workflow, composite action, or exported directive you are installing REFERENCES BY PATH**, which installs WITH it **including when the local path does not yet exist**, exempt from the skip rule below. Same failure as a missing composite: the caller names it by path, so an absent one fails every run at step resolution — a refresh that takes the caller and skips the script it calls installs a red build. ⚠️ **DERIVE this set, do not recall it** — see *Deriving the referenced-script set* immediately below the table. The command does not live in this cell, because a shell pipeline cannot be written inside a markdown table row without escaping the `|`, and an escaped pipe silently changes what it matches. Never hand-list the set here |
| `templates/claude-settings.json` | `.claude/settings.json` | Plugin-enable block + the `SessionStart` registration — verbatim overwrite OK unless the project added its own keys; then merge, through *Settings writes* (Phase 1.5). Install it WITH the hook row below, never alone |
| `templates/claude-hooks/session-start.sh` | `.claude/hooks/session-start.sh` | Verbatim drop-in, `chmod +x` — and re-apply `chmod +x` on every refresh, since a lost executable bit is invisible to a content diff and a non-executable hook silently never runs. Install it WHENEVER the settings row above is installed, **including when the local path does not yet exist** — this row is exempt from the skip rule below. A registered `SessionStart` hook whose script is missing is a startup error in every subsequent session |
| `templates/CLAUDE-template.md` | `CLAUDE.md` (written once at bootstrap) | Never overwrite — project-owned; delta is informational only |
| `directives/*`, `docs/*`, `plugins/*` | not installed — read live / delivered by the plugin | Informational; no local file to update |

Skip rows whose local path doesn't exist (the project never installed that piece)
— with TWO exceptions, both for the same reason: a file another installed file
names by path is not optional, and skipping it ships a broken reference.
- the `claude-hooks` row, whose whole purpose is first installation and whose
  absence breaks the settings row that references it;
- the **workflow-, composite-, OR directive-referenced** entries of the
  `templates/scripts/*` row, whose absence breaks whatever names them once that
  caller is updated — `static-checks` for a script `qa.yml` names directly,
  **every UI job** for one only the `ui-suite` composite names
  (`check-ui-viewports.js` — so this is not a "qa-invoked" list), and a
  **documented command** for one only a directive names (`browser-ladder.js`,
  named by `test.md`). Deriving a path is not installing it: the derivation
  below and this exception must name the same set.

⚠️ **And one absence that must be RESPECTED rather than filled.** The
`templates/workflows/<wf>.yml` row batch-installs files "absent locally", which
for most workflows restores coverage. For a workflow carrying a **`schedule:`**
trigger it does not: installing it **creates recurring work**, and there is no
dormant option because `schedule:` fires. So: **an absent SCHEDULED workflow is
skipped unless the project has a task for it** (`cron-notify.yml` with a
bootstrap-stub `notify-task.js` is the worked case). Before declining, confirm it
is not load-bearing: no `workflow_run` names it, and `workflow-ref-guard` reports
all required watchers intact without it. Same principle as the carve-outs for
`pages-retry.yml` and its mirror `pages-deploy.yml` (absent by design on an
Actions-source and a branch-source project respectively): **"absent locally" is
not a fact about the project's intent.** Ask
what installing it *starts*, not only what it restores.

⚠️ **And its converse: a PRESENT scheduled starter with no task** (owner ruling,
2026-10-10). Projects scaffolded before that ruling got `cron-notify.yml`
unconditionally, so a taskless project may run it daily with nothing to do. When
`.github/workflows/cron-notify.yml` is installed, test whether
`.github/scripts/notify-task.js` is still a shipped starter: byte-identical to
`templates/scripts/notify-task.js` as it stood at ANY upstream commit, since an
older starter differs from today's.

```bash
# STARTER = the file matches some shipped version (no task body written yet).
# A blob-less clone carries every commit's trees, which is all the test reads.
d=$(mktemp -d) || d=
if [ -f .github/scripts/notify-task.js ] && [ -n "$d" ] \
   && git clone -q --bare --filter=blob:none https://github.com/akyachtsman/claude.directives.git "$d"; then
  h=$(git hash-object .github/scripts/notify-task.js)
  # Collect first, then match with a here-string: `grep -q` in a pipe exits on
  # the first hit, and under pipefail the writer's SIGPIPE turns a match into
  # a miss (it did, for the current starter).
  shipped=$(git -C "$d" log --format=%H -- templates/scripts/notify-task.js \
    | while read -r c; do git -C "$d" rev-parse -q --verify "$c:templates/scripts/notify-task.js" 2>/dev/null || true; done)
  if grep -qxF "$h" <<<"$shipped"; then echo STARTER
  # An edit that left the starter's placeholder body in place wrote no task.
  elif grep -qF 'Add your scheduled notification in notify-task.js' .github/scripts/notify-task.js; then
    echo "STARTER (edited, placeholder body still in place)"
  else echo MODIFIED; fi
else
  echo "CANNOT CHECK: notify-task.js absent or upstream history not readable"
fi
if [ -n "$d" ]; then rm -rf "$d"; fi
```

- **`MODIFIED`** → show the diff against the template at the fetched head. A
  diff that replaces the marked task body (`Replace with your project's
  notification logic`) is a task: refresh the workflow as usual. A diff of only
  formatting, line endings or comments is not: treat it as `STARTER`. Unsure →
  treat it as `STARTER` and ask.
- **`STARTER`** (either form) → never refresh it silently and never delete it unasked. Report
  it and ask the owner whether the project has a scheduled task. **No** →
  remove `cron-notify.yml` and the starter `notify-task.js` in the same refresh
  PR. Its three companions under `.github/scripts/` may be project-owned by now,
  so each is removed only when BOTH hold, and otherwise kept and named to the
  owner:
  - **unchanged:** `notify-email.js` and `package.json` match a shipped version
    (run the test above with the path swapped in); `package-lock.json` goes
    only with `package.json`.
  - **no other consumer:** nothing else under `.github/` reads it. A workflow
    can use `package.json` without naming it (an `npm` step whose
    `working-directory` is `.github/scripts`, or `npm --prefix .github/scripts
    ci`), and a script can `require` a sibling. So search broadly and read
    every hit:
    `grep -rnE "notify-email|\.github/scripts|\bnpm\b" .github --exclude=cron-notify.yml --exclude=notify-task.js --exclude=notify-email.js`.
    A hit is a consumer until shown otherwise. Only one that plainly points
    elsewhere (an `npm` step in `.github/scripts/ui-tests`, a path to another
    script) is cleared.

  **Yes** → keep it and replace the starter body
  (`docs/standards/cicd-setup.md` Step 9f).
- **`CANNOT CHECK`** → ask the owner the same question instead of guessing.

### Kit defects

The per-file rule above protects local kit edits, and it also stops a kit BUG
fix from arriving: a defect shipped in `templates/ui-tests/` is in every
downstream copy, and a session weighing the fix hunk as "evolution" keeps the bug,
even in a project that follows this table exactly. So,
whenever the project carries the kit — **every refresh, before any kit diff,
whether or not the delta touches the kit**. The kit may live elsewhere
(`cicd-setup.md` lets `UI_TESTS_DIR` point anywhere), so find it from the
workflows rather than assuming the default:
```bash
# The YAML scalar, not the rest of the line: a quoted value ends at its closing
# quote (a `#` inside it is part of the path) with its escapes decoded (`\"` in
# double quotes, `''` in single); an unquoted one ends at ` #` (a comment).
# A trailing `/` is dropped, so `e2e/` and `e2e` name one kit, not `e2e//x`.
kit_dirs=$(grep -hE '^[[:space:]]*UI_TESTS_DIR:' .github/workflows/*.yml .github/workflows/*.yaml 2>/dev/null \
  | sed -E -e 's/^[[:space:]]*UI_TESTS_DIR:[[:space:]]*//' \
           -e '/^"/{s/^"((\\.|[^"\\])*)".*$/\1/;s/\\(["\\])/\1/g;b' -e '}' \
           -e '/^\x27/{s/^\x27((\x27\x27|[^\x27])*)\x27.*$/\1/;s/\x27\x27/\x27/g;b' -e '}' \
           -e 's/[[:space:]]+#.*$//' -e 's/[[:space:]]+$//' | sed -E 's#/+$##' | sort -u)
if [ -z "$kit_dirs" ]; then   # no UI_TESTS_DIR set: the default, if the project has a kit at all
  [ -d .github/scripts/ui-tests ] && kit_dirs=.github/scripts/ui-tests || echo "no UI-test kit in this project — kit defects step skipped"
fi
printf '%s\n' "$kit_dirs" | while IFS= read -r d; do   # one path per LINE: a path with spaces stays whole
  [ -n "$d" ] || continue
  [ -d "$d" ] && echo "kit: $d" || echo "kit dir named but missing: $d — kit defects NOT checked there"
done
```
The accepted value forms are a CLOSED set (#375): unquoted (ending at ` #`),
single-quoted with `''`, and double-quoted with `\"` and `\\` only. Anything else —
another double-quoted escape such as `\x20`, a block or flow scalar, an anchor, a
`${{ }}` expression — is not decoded, so the literal text is taken as the path and
it lands on *named but missing … NOT checked there*: reported, never silent.
Such a project checks that directory by hand; the set is not widened per spelling.

1. Fetch the list — `docs/standards/kit-defects.md`, kept OUTSIDE the kit so the
   row above never copies it downstream — from UPSTREAM (not a local copy, which
   is only as new as the last sync). Every Bash call starts a fresh shell, so
   Phase 2's `$head` is NOT set here — re-derive the SHA in the same call that fetches:
   ```bash
   kd_head=$(cat "$(git rev-parse --git-path refresh-repo-classified)" 2>/dev/null)   # Phase 2's SHA, if its marker is still there
   [ -n "$kd_head" ] || kd_head=$(git ls-remote https://github.com/akyachtsman/claude.directives.git refs/heads/main | cut -f1)
   kd=$(mktemp)
   if printf '%s' "$kd_head" | grep -qE '^[0-9a-f]{40}$' \
      && curl -fsS "https://raw.githubusercontent.com/akyachtsman/claude.directives/$kd_head/docs/standards/kit-defects.md" -o "$kd"; then
     echo "kit defects list at $kd_head: $kd"
   else
     echo "kit defects NOT checked (no upstream SHA, or the fetch failed)"
   fi
   ```
   *NOT checked* is reported as such, never as none found.
2. For each entry, run its **Check** from each kit directory found above. `CLEAR`
   → nothing. `UNDECIDED` → read the code the entry names and record a verdict.
3. `AFFECTED` → apply that entry's **Minimal fix** — that hunk only, never the
   surrounding upstream rewrite, which stays per-file diff work — **unless the
   project states why the defect does not apply here**. Record that reason as one
   line in the project's `CLAUDE.md` naming the entry id (`KD-1 declined: …`).
   **A recorded decline never skips the check** — step 2 runs every entry every
   time. On a later `AFFECTED`, re-read the recorded reason against the code you
   just checked and report whether it still holds; if the code changed or the
   entry was corrected so that it no longer does, apply the fix. Re-running is
   cheap, and it is what stops a stale verdict from outliving either change.
4. Report each entry's result (`CLEAR` / fixed / declined with reason) in the
   refresh report.

An entry is not a licence to take a kit file wholesale: it names one bug and one
hunk, and everything else in the kit is still dispositioned by the row above.

### Deriving the referenced-script set

⚠️ **Derive from the UPSTREAM files you are installing — fetched, not local.**
`/refresh-repo` runs inside a *project*, where `templates/workflows/` and
`templates/actions/` do not exist; those are upstream paths. And scanning the
project's own `.github/` copies would miss precisely the case this exists for —
**a script newly referenced by the caller you are about to install**, which by
definition the installed copy does not yet mention.

So the input is the fetched upstream text, using the same `$raw` this command
already establishes, over **every caller this refresh INSTALLS** — not a fixed
list, and **not only the changed ones**:

⚠️ **The installed set is WIDER than the delta.** The composites row above
installs `templates/actions/*/**` — the whole directory, `action.yml` and every
sibling it runs — **with any qa workflow update**, so a refresh whose delta
touches only `qa.yml` still installs an *unchanged* `ui-suite/action.yml` — and
`ui-suite` is the only caller that names `check-ui-viewports.js`. Scope the
derivation to the delta and that script is never derived; on a project where it
is absent, every UI job dies at step resolution.

**The directives are callers too**: `test.md` names
`.github/scripts/browser-ladder.js`, which no workflow or composite invokes, so
a derivation scoped to the YAML callers ships a directive naming a file it never
delivered. Widen the derivation; never hand-list the file.

So: **changed callers ∪ callers co-installed unchanged by the rules above.**

```bash
repo="akyachtsman/claude.directives"
head="…the SHA Phase 2 classified…"   # NOT main — that ref moves under you
raw="https://raw.githubusercontent.com/$repo/$head"
callers="…EVERY templates/workflows/*.yml, templates/actions/*/action.yml
         and directives/*.md path this refresh INSTALLS — the changed ones
         AND the ones co-installed unchanged by the rules above…"

buf=$(mktemp)
for c in $callers; do
  curl -fsSL "$raw/$c" >>"$buf" \
    || { echo "FETCH FAILED: $c — derivation INVALID, do not use it" >&2
         rm -f "$buf"; exit 1; }
  printf '\n' >>"$buf"   # token boundary — see the third bullet below
done
refs=$(grep -oE '\.github/scripts/[A-Za-z0-9_./-]+' "$buf" \
       | sed -E 's/[.]+$//' \
       | grep -E '\.(js|py)$|^\.github/scripts/package\.json$' | sort -u)
rm -f "$buf"
printf '%s\n' "$refs"
```

Seven things about that shape, each of which a shorter version got wrong (the
failures themselves: the *Refresh-repo history* section of
https://github.com/akyachtsman/claude.directives/blob/main/docs/internal/gate-history.md, which a downstream checkout does not carry):

- **It matches the script PATH, never the invocation prefix.** A prefix is a
  form; the path is the fact. `node "$GITHUB_WORKSPACE/.github/scripts/check-ui-viewports.js"`
  — the real line in `ui-suite/action.yml` — has no `node .github/` in it. The
  two-stage filter, grabbing the whole token and *then* requiring a `.js`/`.py`
  ending, is what keeps `.github/scripts/package-lock.json` out, since an
  unterminated `\.(js|py)` matches the `.js` inside `.json`. The one other file
  admitted is **exactly** `.github/scripts/package.json`, anchored at both ends:
  `cron-notify.yml`'s `npm install` reads it, so it installs with that caller
  like a script (#398). `ui-tests/package.json` belongs to the kit row, and the
  lockfile is generated by the project, so both stay out. **Generating it is
  this refresh's job, though:** whenever it installs or changes
  `.github/scripts/package.json`, run `npm install` in `.github/scripts/` and
  commit the resulting `package-lock.json` in the same change.
  `cron-notify.yml`'s `setup-node` cache names that lockfile, so without it the
  job fails before its own install step (Codex, #409). Phase 3 refuses the stamp
  while it is missing. A trailing period is
  stripped first (`sed -E 's/[.]+$//'`): a directive that names a script at
  the end of a sentence still names it. The Phase 3 check below already did
  this, so the install derived LESS than the check verified (Codex, #409).
  `check-refresh-derivation.py` now runs both copies, stage by stage, over the
  same inputs and refuses any difference in what they derive — and holds each
  copy to the contract over a fixed probe set, so two copies that widen or
  narrow together still fail.
  `check-refresh-derivation.py` runs this exact pattern, read out of this file,
  against every shipped caller, so an invocation-form change fails CI.
- **It matches a MENTION, not only an invocation, and that is the accepted
  cost.** A comment reading `# replaced .github/scripts/legacy.py` puts
  `legacy.py` in the set. The asymmetry runs the right way: a spare installed
  file is inert, a missing one is a red build at step resolution.
- **The fetch loop appends a newline after every caller.** `>>` concatenates,
  and a YAML file need not end in one: without the delimiter,
  `.github/scripts/a.js` + `name:` becomes `.github/scripts/a.jsname`, which the
  token grep consumes whole and the extension filter drops — with no error, and
  invisible to any per-caller scan.
- **The character class admits `/`, so a NESTED script is reachable.**
  `templates/ui-tests/` installs to `.github/scripts/ui-tests/`, so a script one
  directory down is a reference waiting to happen. A bare directory reference
  like `.github/scripts/ui-tests/` is still excluded, because the extension
  filter is anchored.
- **Every fetch is checked individually, and a failure exits before the
  pipeline.** Inside `refs=$(…)` the `exit 1` would leave only the subshell, and
  `refs` would come back **non-empty from the callers that did fetch** — a
  partial set that passes any emptiness check.
- **An empty result is not automatically wrong.** If the only changed caller
  invokes no script — `pages-monitor.yml` and `secret-scan/action.yml` are both
  like this today — the correct derivation *is* empty, and asserting non-empty
  fails closed on a legitimate delta. **Emptiness is only suspicious when a
  fetch failed**, which is why the check belongs on the fetch, not the result.
- **Pin the fetch to the SHA Phase 2 classified, never `main`.** `main` can
  advance mid-refresh, or between two caller requests, so the derived set can
  come from a newer or mixed revision than the callers you are installing — and
  Phase 3's head check only refuses the *stamp* afterwards; it does not
  un-install anything.

**The output is the answer for THAT refresh, and it moves** with the callers it
reads. That is the derivation working. **The output is never the rule.**

A derivation that fails open is strictly worse than the hand-list it replaced,
and one that fails closed gets muted, which returns it to failing open by
another route. **Check the fetch, report the result, and let an honestly-empty
answer be empty.**

The general form, worth applying to any row added later: **if the thing being
installed REFERENCES a path, that path installs with it, present or not.** The
composites row already carries this rule; these two are the same rule.

## Phase 3 — Stamp and report

**The stamp means "the delta up to this SHA was classified and dispositioned",
not "this SHA was observed."** Advance it ONLY when Phase 2 actually obtained the
file-level delta. Two distinct failures make an unguarded stamp destructive:
- An empty `$head` writes `{"sha": "", "synced": "<today>"}`, destroying the only
  field `/env-chk`'s staleness alarm reads AND back-dating it as freshly synced.
- A `$head` obtained by `ls-remote` while the delta listing was unavailable
  (the fetch failed, or the stamp lies beyond the one bounded deepen) advances
  the stamp past a delta nobody looked at. Phase 1.5 does not inspect customized paths like
  `.github/scripts/ui-tests/**`, so the next refresh sees the new SHA as already
  synced and never revisits it: the skipped change is missed permanently, not
  merely deferred.

Set `classified=yes` in Phase 2 only on the branch where the delta listing was
actually read (including "no files changed"); leave it unset otherwise.

**Read is not applied.** A third failure gets past both guards above: a path the
delta LISTED, dispositioned as New-upstream, and then never applied. The stamp
moves past it and no later delta lists it again, so it stays stale until a
delta-independent diff happens to find it. So before stamping, Phase 3 compares
the installed copies with the templates **at the head being stamped** (one
depth-1 git fetch of that head) and
refuses the stamp while one differs or a required one is missing, unless the
session recorded why it stays. A reason binds to the **template's blob id**,
which the refusal prints:

```bash
jq --arg p "<local path>" --arg b "<blob id printed with it>" --arg r "<why it stays local>" \
  '.refresh_kept[$p] = {blob: $b, reason: $r}' .claude/directive-sync.json \
  > .claude/directive-sync.tmp && mv .claude/directive-sync.tmp .claude/directive-sync.json
```

Binding to the blob, not the head, is what makes the question come back exactly
when it should: when the template changes, the old reason stops matching and the
path is asked about again; while it does not, a deliberate local version is
asked about once, not on every refresh. A reason for a path upstream deleted
binds to `deleted`.

What is compared, delta or not:
- **every path the delta lists** that has an installed location. A kit file maps
  to each kit directory the workflows name in `UI_TESTS_DIR` (the default
  `.github/scripts/ui-tests` only when none does), found exactly as *Kit
  defects* finds it; a named kit directory that is missing cannot be checked and
  refuses the stamp. A kit file applied hunk by hunk still differs afterwards, so
  record its reason too: the hunks declined, and why.
- **every dependency**, because a changed caller can start needing a file whose
  own template did not change, which no delta lists (Codex, #397, the #321
  class). The set is the one this command installs, no wider:
  - every composite an installed workflow or composite reaches by
    `uses: ./.github/actions/<a>`, plus every installed one, as its **whole
    upstream directory**. That is how the composites row installs it, and why no
    command is parsed for sibling names: `check-action-siblings.py` records the
    four rounds that parsing cost.
  - every script whose `.github/scripts/*` path something installed, or a
    directive at the head, names: the pattern *Deriving the referenced-script
    set* installs by, the same filter in both places. A workflow must NAME
    what it needs by that path: `cron-notify.yml` runs
    `node "$GITHUB_WORKSPACE/.github/scripts/notify-task.js"` (still from
    `working-directory: .github/scripts`) and names `notify-email.js` and
    `package.json` the same way, which closed #398. It names those two only in
    a comment, which a rewording would drop with no error, so
    `check-refresh-derivation.py` derives what each shipped caller needs — a
    sibling its scripts `require`, the `package.json` an `npm install` run in
    `.github/scripts` reads — and fails CI when the caller stops naming one.
    A step that runs a bare
    relative command under `working-directory: .github/scripts` is invisible to
    both, so the fix for one is to name the path, never to widen this check
    alone: a check wider than the install refuses a stamp the install can never
    satisfy (owner ruling, 2026-10-06). `notify-task.js` is the project's own
    task, so it will legitimately differ here; record it with a `refresh_kept`
    reason. When `package.json` is among them, `package-lock.json` beside it
    must EXIST; it is generated by `npm install`, so it is never compared.

  - **every installed kit, as its whole upstream directory**: each kit
    directory found as above gets every file `templates/ui-tests/` ships except
    `package-lock.json`. Workflows name kit files by bare filename, so nothing
    derives them by path, and a kit whose template did not change would never
    be compared. The kit row installs the whole kit, hunk by hunk, so the check
    covers what the install does. A named kit directory that is missing refuses
    the stamp here too.

  A dependency that exists is compared like a delta path; a stale copy is as
  broken as a missing one.
- **`.claude/settings.json`, as sets, every run.** The settings row merges
  rather than copies, so a byte comparison would refuse every project that added
  its own keys, and leaving the file out would let a read but unapplied settings
  delta be stamped — and this file decides what an agent may do unprompted.
  So each entry the template carries must be in the local file:
  every `permissions.allow` entry (local `allow`, `ask` or `deny` all count,
  since a stricter local choice is still a choice), every `permissions.ask`
  entry (local `ask` or `deny`), every `permissions.deny` entry (local `deny`),
  and every `enabledPlugins` and `extraKnownMarketplaces` key at the template's
  value. The `SessionStart` row is Phase 1.5's. Applying a missing entry, or
  removing an unexplained `allow` extra (below), is a settings write: make it
  through *Settings writes* (Phase 1.5). A project that deliberately
  leaves an entry out records why, keyed by the entry itself:

  ```bash
  jq --arg s "<section printed>" --arg e "<entry printed>" --arg r "<why this project leaves it out>" \
    '.refresh_declined[$s][$e] = $r' .claude/directive-sync.json \
    > .claude/directive-sync.tmp && mv .claude/directive-sync.tmp .claude/directive-sync.json
  ```

  The reverse holds for `allow` alone, the one section that grants anything:
  **every local `allow` entry the template does not carry needs a recorded
  reason**, under the section `permissions.allow (local extra)` (Codex, #404).
  An entry the template dropped looks exactly like one the project added, so
  without this a narrowing, such as the 2026-10-07 removal of
  outsider-content reads, would never reach a project that missed applying it.
  It is judged on the current file and template alone, with no history to
  compare, so no sequence of refreshes can hide an entry. A private repository
  keeping those reads records each once, and so does a project's own addition.
  Extras in the other sections are never compared: they restrict, or they
  enable a plugin, which grants nothing on its own.

  An entry's text IS its content, so the decline needs no blob: it holds while
  the template carries that exact entry, and matches nothing once the entry is
  changed or dropped. A keyed entry is printed, and declined, as `key=<value as
  JSON>` (`frontend-design@claude-code-plugins=true`), so a decline made against
  one value does not cover the next (Codex, #404). A missing local `.claude/settings.json` is reported, not
  compared; an unreadable one refuses the stamp.

An absent path is required where the skip rule makes it so: a dependency above,
a file of an installed composite, the hook once `.claude/settings.json` exists,
a file of an installed kit. Any other absent path is reported, not compared:
an absent workflow can be deliberate (`pages-retry.yml`, `pages-deploy.yml`, a
scheduled workflow with no task), and a path upstream does not ship is the project's own. A path
the upstream deleted counts as unapplied while a local copy remains.

**What a clean run proves, and what it does not.** A stamp that goes through
means: no path the delta lists is unapplied, no dependency above (script,
composite, kit file) is stale or missing, and no settings entry is missing,
each unless a recorded reason covers it. It does **not** mean the project
matches upstream. A workflow, or any file outside the dependency set, whose
template did not change in the delta is compared only by Phase 1.5, which
reports `DRIFT` without holding the stamp. So "nothing named" is not "no
divergence"; read Phase 1.5's report beside this one.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/refresh-stamp.sh"
```
That script (`plugins/directives-toolkit/scripts/refresh-stamp.sh` in
claude.directives) is Phase 3's mechanism, run from the project root: it
re-derives the head, reads Phase 2's verdict, fetches the upstream tree once,
checks every path above, and stamps only on a clean result, printing one line
per finding. It lives in a file because a command's arguments are substituted
into its text on load, and its functions take positional parameters. A project
with no `.claude/directive-sync.json` yet gets one, starting as `{}`.

**Stamp only a VERIFIED head SHA.** Phases 2 and 3 need nothing from
`api.github.com` — both run over git transport, which is what lets the stamp
advance from a web session at all (#326). If `ls-remote` or the fetch is
unreachable this run, skip Phases 2–3 gracefully: report
"upstream delta unavailable this run — stamp unchanged, re-run /refresh-repo
later", keep the old stamp, and never fabricate a SHA or an unverified delta
(`global.md` → *Behavior Rules*: evidence before assertions).

Report: rules re-read (Phase 0), broken references and fixes, the upstream
delta with per-file dispositions, which path wrote `.claude/settings.json`
(*Settings writes*), the new stamp — and remind that any toolkit
changes in the delta arrive via the plugin at next session start.
