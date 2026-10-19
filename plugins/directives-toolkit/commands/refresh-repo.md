---
disable-model-invocation: true
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

**Typed only.** This command sets `disable-model-invocation: true`, so no agent
can start it, and a message reading "Run /refresh-repo" in plain text does not
start it either (pilots, 2026-10-13). The owner sends `/refresh-repo` as the
slash command itself. Anything that recommends a refresh — `/env-chk`, a
staleness note, a hand-off — says exactly that.

The self-contained mechanisms live in this plugin's `scripts/` and each block
below runs one; the reasons for each guard are in that file's comments. Run
every one from the project root. Each prints at least one line whatever the
result, so no output means it did not run. When this refresh runs a Python
script locally, run it as `PYTHONDONTWRITEBYTECODE=1 python3 …`
in the same Bash call: otherwise the run leaves `__pycache__/` beside the
scripts, untracked files that ride into the refresh PR.

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
bash "${CLAUDE_PLUGIN_ROOT}/scripts/refresh-broken-refs.sh"
```
It ends in exactly one summary line: `OK: N upstream reference(s) checked`
(exit 0; N may be 0, which is a project with no upstream links, said out loud),
`BROKEN: M of N …` after the `BROKEN:` lines (exit 1), or `CANNOT CHECK`
(exit 2).

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
compares every installed verbatim drop-in against the upstream template,
regardless of delta.

**Pin first: run Phase 2's `refresh-delta.sh` before this pass** (its listing is
dispositioned in Phase 2; run it once, here). It leaves the head it classified in
a marker that every later script reads — this pass, the hook install, the
derivation, *Kit defects* and the stamp — so the whole refresh compares against
ONE revision. Phase 1.5 once fetched `main` while Phases 2–3 pinned the
classified SHA, so a merge upstream mid-refresh mixed two heads (pilots,
2026-10-13). Without the marker the scripts fall back to `main` as of now and
say so on their `pinned:` line.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/refresh-drift.sh"
```
Over git transport, at the pinned head. Per file it prints one of:
- **`STALE`** — differs from the pinned template but EQUALS the template at the
  project's stamp (`.claude/directive-sync.json` → `upstream.sha`): nothing
  local, only upstream moved. Take the template; no per-file review needed.
- **`CUSTOM`** — differs from the template at the stamp too: a deliberate local
  edit (or tampering). It gets the diff treatment below, through the 3-way merge
  `refresh-merge.sh` runs, so the local hunks stand apart from upstream's.
  A `CUSTOM` line reading `(recorded in refresh_kept: <reason>)` after the path
  is a divergence already decided: the project's `refresh_kept` record for that
  path binds, read as Phase 3 reads it (keyed by the local path, its `blob` the
  template's at the pinned head, its `local` the installed copy's). Report it
  with its reason; do not re-ask. Once upstream changes that template, or the
  installed copy changes, the record stops binding and the line says so: review
  it as a fresh question (pilot claude.prop, 2026-10-13; Codex, #451). A record
  without `local` (recorded before it existed), or without a reason (a
  non-blank string), is shown but never honoured, here or by the stamp: review
  that file once and re-record it with its local blob and a reason. Only this
  line asks for that when the template is unchanged: Phase 3's stamp checks the
  paths in the delta and the files they need, so a `CUSTOM` file outside both
  (a project's `qa.yml`, say) never appears in its refusals. Take its local
  blob from `git hash-object --no-filters -- <path>`, the same bytes drift and
  the stamp hash (claude.trading, 2026-10-15). Every `CUSTOM` line, and every
  `KEPT` line of Phase 3's stamp, quotes the reason cut to 60 characters; the
  full text is in the record.
- **`DRIFT`** — differs, and the stamp-era template is unavailable (no stamp,
  its fetch failed, or no such template at the stamp), so stale cannot be told
  from custom: treat it as `CUSTOM` and read the diff.
- **`MODE`** — the executable bit differs from the template's git mode
  (`100755` / `100644`). Informational, never `DRIFT` on its own; restore the
  bit unless the project records why it differs.
- `NO-TEMPLATE`, `CANNOT-VERIFY`, `RETIRED` — below — then one `SUMMARY` line.
- **`RE-RECORD`** — after `SUMMARY`, only when there are any: the count and
  paths of every `refresh_kept` file record whose `local` blob is missing or is
  no longer the file's, **kit files included** (the `CUSTOM` lines reach only
  files this phase compares, so a kit record otherwise first surfaces as a
  stamp refusal; claude.prop pilot, 2026-10-15). Each one whose file still
  differs from its template is a stamp refusal to come: review it and
  re-record it with its local blob, or drop it.

**The 3-way merge for a `CUSTOM` file** (base = the template at the stamp,
ours = the installed file, theirs = the pinned template), so every upstream
hunk that does not touch a local one applies and only true overlaps conflict:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/refresh-merge.sh" .github/workflows/qa.yml   # prints LOCAL HUNKS, then MERGED: <scratch file> (N conflict(s))
bash "${CLAUDE_PLUGIN_ROOT}/scripts/refresh-merge.sh" .github/workflows/qa.yml --write   # writes it, only at 0 conflicts
```
It also takes a kit file (Phase 2's per-file kit diffs). Show the LOCAL HUNKS
and the merged diff when asking; `--write` only after the disposition below
says keep-and-update. Conflicts are resolved by a person, never written.

`RETIRED` names a file whose template upstream deleted (`keepalive.yml`, and
the watcher workflows `ci-monitor.yml`, `ci-notify.yml`, `codex-monitor.yml`,
`pages-monitor.yml` and `pages-retry.yml`): it is a removal finding, never a
project-specific file to keep. Delete it, with any secret the line names, in
this refresh's PR.
It also prints `RETIRED` for an installed copy of a deleted guard script
(`workflow-ref-guard.py`, `check-job-bounds.py`, `check-py-warnings.py`,
`check-ui-suite-env.py`, `check-yaml-anchors.py`), `gh_yaml.py`,
`.github/workflow-ref-required.json` or `.github/ui-suite-env-exempt.json`:
delete each, with its step in `qa.yml` if one remains.

**Which files.** Every installed workflow, every file of every installed
composite, the `SessionStart` hook, and every installed `.github/scripts/<name>`
whose template `templates/scripts/<name>` exists at the pinned head (including
`package.json`). Scripts are classified like the rest, so do **not** diff them
by hand: take a `STALE` script, and give a `CUSTOM` or `DRIFT` one the
disposition below. A script with no template is the project's own and gets no
line; `package-lock.json` (generated, never shipped) and every kit file under a
UI-test kit directory (`.github/scripts/ui-tests/` or wherever `UI_TESTS_DIR`
points; a name `templates/ui-tests/` ships, so a kit AT `.github/scripts` leaves
the standard scripts beside it compared) are not compared here; the kit is covered by *Kit defects* and Phase 2's
per-file kit diffs (pilot claude.prop, 2026-10-13: five script templates in the
delta had to be classified by hand).

`.github/actions/*/*`, **not** `*/action.yml`: a composite runs its siblings —
`ui-suite` invokes `$GITHUB_ACTION_PATH/validate-report-path.py` as its first
step — so a locally corrupted sibling next to an unmodified `action.yml` is
exactly the invisible-drift case this pass exists for.

**`CUSTOM` and `DRIFT` are questions, not verdicts — and they are what make a
curated exception list unnecessary.** An allow-list of files *permitted* to differ is
correct the day it is written, silently wrong after the next local improvement,
and nothing detects the gap. So there is no list: a diff is self-maintaining,
and every `CUSTOM` or `DRIFT` file is resolved by looking at it. `STALE` is the
one class the stamp answers mechanically: the project's copy is byte-for-byte
what it last took. (The incidents behind this
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
below. The registration test is `session-start-registered.sh` in this plugin's
`scripts/`, the same file `/env-chk` runs; it parses the `SessionStart` array
rather than grepping the file, for the reason its header gives:

```bash
# exec bit: invisible to a content diff, and a non-executable hook never runs
[ -f .claude/hooks/session-start.sh ] && [ ! -x .claude/hooks/session-start.sh ] \
  && chmod +x .claude/hooks/session-start.sh \
  && echo "REPAIRED: exec bit on .claude/hooks/session-start.sh"

# registration: merge the SessionStart row when the script exists but nothing runs it
if [ -f .claude/hooks/session-start.sh ] \
   && ! bash "${CLAUDE_PLUGIN_ROOT}/scripts/session-start-registered.sh"; then
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
bash "${CLAUDE_PLUGIN_ROOT}/scripts/refresh-hook-install.sh"
```
It prints one line whatever it finds — `INSTALLED`, `COULD-NOT-INSTALL`, or
`OK: hook state: …` (present and executable, present and NOT executable, or not
applicable without `.claude/settings.json`) — and takes the template from the
pinned head. Install the settings row in the same pass (through *Settings writes* below), so
the registration and its target always land together.

`session-start.sh` is also in the drift loop, not only in Phase 2: a locally
truncated hook whose template never moved would otherwise stay broken through
every refresh. Restore it from the template rather than hand-editing, and re-run
`bash -n` on it.

Disposition each `CUSTOM` and `DRIFT` file by READING THE DIFF, with no blind
default in either direction: "restore" without looking deletes improvements, and
"keep" without looking preserves tampering. A `STALE` file skips this: take the
template (a batch overwrite is fine), since there is no local edit to lose.
1. **The diff is only `qa-live.yml`'s `workflow_run` watch list, which is
   MEANT to vary per project** — or the project's CLAUDE.md records the
   change. A legitimate adaptation: keep it, and report it, so an adaptation
   nobody upstream knows about becomes a Downstream-Finding Loop item rather
   than a permanent local secret.
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
bash "${CLAUDE_PLUGIN_ROOT}/scripts/refresh-delta.sh"
```
(Run once per refresh, at the start of Phase 1.5 — *Pin first* — and disposition
its listing here. First run with no stamp: it says so, and the per-file policy
applies directly.) It prints `pinned: <sha>`, then the listing or an `OK:` line
saying there is nothing to list; exit 1 when the listing was unavailable, 2 when
the head was. Its markers survive a refused stamp and are consumed only by a
successful one, so recording a `refresh_kept` reason never needs it re-run —
re-run it only when upstream may have moved.

**Ask first: does this project have a scheduled task?** Put the question to the
owner before dispositioning anything, because one answer gates four files —
`cron-notify.yml`, `notify-task.js`, `notify-email.js` and
`package-lock.json` — and with them whether `npm install` runs in
`.github/scripts` at all (pilots, 2026-10-13: asked late, it reopened finished
dispositions). The rules that act on the answer are *Workflow refresh rules*
below: the absent scheduled workflow and its converse, the present starter.
**Skip the question** when the project has none of `cron-notify.yml`,
`notify-task.js` and `notify-email.js` (owner ruling, 2026-10-13). Print
`no scheduled-task files installed -- question skipped` and carry that line
into the report. Skipping is itself the disposition: the absent
`cron-notify.yml` and its companions stay absent under the rule below, because
installing them starts recurring work this project never set up. A project that
wants a scheduled task adds it as new work, not through a refresh. Keep asking
when any of the three is present. Likewise use an answer the owner has
already recorded (in the project's `CLAUDE.md`, say) rather than asking again
(claude.prop pilot, 2026-10-13).

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
| `templates/workflows/<wf>.yml` | `.github/workflows/<wf>.yml` | Verbatim drop-ins — but **never batch-overwrite a file Phase 1.5 flagged `CUSTOM` or `DRIFT`**. Batch overwrite covers only files that already match the template (no-ops), `STALE` files (unchanged since the stamp) and files absent locally. ⚠️ Some files carry their own rules — `pages-deploy.yml`, `qa-live.yml` on Actions-source, and the retired workflows: read *Workflow refresh rules* below the table before installing any workflow |
| `templates/actions/<a>/**` | `.github/actions/<a>/**` | Verbatim drop-ins — the qa workflows reference them as `./.github/actions/*`; install them WITH any qa workflow update (missing composites fail every run at step resolution). ⚠️ **The whole directory, not just `action.yml`.** A composite can run a SIBLING by path — `ui-suite` opens with `python3 "$GITHUB_ACTION_PATH/validate-report-path.py"` — and the referenced-script derivation below covers `.github/scripts/*`, NOT an action-path sibling, so a YAML-only install leaves the caller naming a file that was never copied and every UI job dies at that step. Same failure as a missing composite, one level in: take every file under `templates/actions/<a>/`, including paths absent locally |
| `templates/ui-tests/**` | `.github/scripts/ui-tests/**` | Per-project customized — per-file diffs, apply only approved hunks; never touch `package-lock.json`. **This row outranks any message telling you to take the kit wholesale**, including one from an upstream session: a kit file a project extended is invisible to whoever wrote the instruction, and diffing first is what preserves a locally-defined guard the template lacks. **Before diffing, read *Kit defects* below the table** — on every refresh of a project with this path, whether or not the delta touches the kit |
| `templates/scripts/*` | `.github/scripts/*` | Phase 1.5 has already classified each installed one: take a `STALE` script; diff and confirm a `CUSTOM` or `DRIFT` one — **except any script a workflow, composite action, or exported directive you are installing REFERENCES BY PATH**, which installs WITH it **including when the local path does not yet exist**, exempt from the skip rule below. Same failure as a missing composite: the caller names it by path, so an absent one fails every run at step resolution — a refresh that takes the caller and skips the script it calls installs a red build. ⚠️ **DERIVE this set, do not recall it** — see *Deriving the referenced-script set* below the table. The command does not live in this cell, because a shell pipeline cannot be written inside a markdown table row without escaping the `|`, and an escaped pipe silently changes what it matches. Never hand-list the set here |
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

### Workflow refresh rules

The `templates/workflows/<wf>.yml` row above defers here.
- ⚠️ **`pages-deploy.yml` is ACTIONS-SOURCE ONLY: never
  batch-install it on a branch-source project**, where the push already deploys
  and it would be a second, competing deploy on every push. On an Actions-source
  project it IS the deploy, and its filled-in `BUILD_CMD`/`SITE_DIR` make a local
  copy `CUSTOM` by design, so keep those two values when taking a template change
  (the same holds for `qa.yml`'s `BUILD_CMD`, `SITE_DIR` and `BUILD_PATHS` in a
  project with a build: resetting them to the shipped empties would mis-serve
  its UI suite). Keep its watcher (`"Pages Deploy"`) on `qa-live.yml`.
- **`qa-live.yml` on Actions-source** carries the deploy's `name:` added beside
  the template's arms (W2), so it is `CUSTOM` by design: take a template change
  around that name, never drop it.
- ⚠️ **NEVER a retired workflow, absent or present:** `keepalive.yml`
  (`cicd-setup.md` → *9f — Scheduled-job notifications* has the reason) and the
  watchers `ci-monitor.yml`, `ci-notify.yml`, `codex-monitor.yml`,
  `pages-monitor.yml` and `pages-retry.yml`. An installed copy is a finding to
  delete (Phase 1.5 prints it `RETIRED`), not a file to refresh.
- **Every `CUSTOM` or `DRIFT` file:** show the diff (the 3-way merge for `CUSTOM`) and decide singly — local drift is as
  often an improvement this repo has not yet absorbed as it is corruption, and
  only the diff distinguishes them; keep local only when the diff leaves it
  genuinely unclear (Phase 1.5's disposition rule, which this row defers to).
  Anything worth keeping is a finding for the Downstream-Finding Loop — hand it
  upstream rather than letting the next refresh delete it again.

⚠️ **And one absence that must be RESPECTED rather than filled.** The
`templates/workflows/<wf>.yml` row batch-installs files "absent locally", which
for most workflows restores coverage. For a workflow carrying a **`schedule:`**
trigger it does not: installing it **creates recurring work**, and there is no
dormant option because `schedule:` fires. So: **an absent SCHEDULED workflow is
skipped unless the project has a task for it** (`cron-notify.yml` with a
bootstrap-stub `notify-task.js` is the worked case). The *Ask first* answer
decides it, and when that question was skipped because none of the
scheduled-task files is installed, the workflow stays skipped: nothing here
says the project has a task. Before declining, confirm it
is not load-bearing: no `workflow_run` names it. Same principle as the carve-out for
`pages-deploy.yml` (absent by design on a branch-source project): **"absent locally" is
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
bash "${CLAUDE_PLUGIN_ROOT}/scripts/notify-starter.sh"
```

- **`MODIFIED`** → show the diff against the template at the fetched head. A
  diff that replaces the marked task body (`Replace with your project's
  notification logic`) is a task: refresh the workflow as usual. A diff of only
  formatting, line endings or comments is not: treat it as `STARTER`. Unsure →
  treat it as `STARTER` and ask.
- **`STARTER`** (either form) → never refresh it silently and never delete it unasked. Report
  it and ask the owner whether the project has a scheduled task — the
  question *Ask first* (top of Phase 2) already put, if it was asked. **No** →
  remove `cron-notify.yml` and the starter `notify-task.js` in the same refresh
  PR. Of what is left under `.github/scripts/`:
  - **`package.json` stays, always.** It is not the kit's: the qa workflows and
    the `ui-suite` composite name it for its `"type": "commonjs"`, without which
    every CommonJS script there dies under a root `"type": "module"`, and Phase 3
    compares it with the template — which still declares the kit's dependency,
    inert until someone runs `npm install` there. Never delete or edit it here.
  - **`notify-email.js`** is removed only when BOTH hold, and otherwise kept and
    named to the owner: it is **unchanged** (run `notify-starter.sh` with that
    path as its argument), and it has **no other consumer** — nothing else in
    the repository names it or the task. Key the search to those files, not
    to `.github/scripts` or `npm`, which every script call and the kit match
    (a normal project returned ~100 hits, and "a hit is a consumer" then made
    removal impossible; pilots, 2026-10-13). Search every tracked file, read
    every hit, and treat each as a consumer until shown otherwise:
    `git grep -nE "notify-(email|task)|nodemailer" -- . ':!.github/workflows/cron-notify.yml' ':!.github/scripts/notify-task.js' ':!.github/scripts/notify-email.js' ':!.github/scripts/package.json' ':!*package-lock.json'`.
    The bare names are matched on purpose, so a path built in code
    (`path.join(__dirname, 'notify-email.js')`) is found too. A comment that
    only mentions one is cleared on reading: `check-contrast.js` and
    `check-ui-viewports.js` each name `notify-email.js` as a CommonJS example
    (measured on a scratch project: 2 hits, both such comments, where the old
    pattern returned 65).
  - **`package-lock.json` (and the node deps it pins) goes when nothing else
    installs there** — once `notify-email.js` is gone or has no consumer left,
    and no step outside `cron-notify.yml` runs `npm` in `.github/scripts`:
    `git grep -nE "scripts/package-lock\.json|--prefix[= ]+(\./)?\.github/scripts([^/]|$)|working-directory:[[:space:]]*(\./)?\.github/scripts[[:space:]]*$|cd[[:space:]]+(\./)?\.github/scripts([[:space:];&]|$)" -- . ':!.github/workflows/cron-notify.yml'`
    — read each hit (a `working-directory` hit is a consumer only if that step
    runs `npm`). Phase 3 stops requiring the lockfile once the kit's three
    files are gone.

  **Yes** → keep it and replace the starter body
  (`docs/standards/cicd-setup.md` Step 9f).
- **`CANNOT CHECK`** → ask the owner the same question instead of guessing.

### Kit helpers moved out of the spec (2026-10-11)

Since batch C, S2, the kit's helpers live in `tests/lib/fixtures.js` and
`tests/lib/auth.js`, and `tests/app.spec.js` imports them. A project kit that
still defines them inline gets two new files plus an `app.spec.js` diff that
adds the imports and removes the inline copies. Take those hunks TOGETHER: the
imports without the removals declare each helper twice, a SyntaxError that
fails every scenario. A helper the project changed locally moves into the lib
file with its change, never back to the upstream body. Confirm with
`npx playwright test --list` from the kit directory, which loads every import.

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
# kit-dirs.sh is the one derivation; Phase 3's applied-check runs it too.
kit_dirs=$(bash "${CLAUDE_PLUGIN_ROOT}/scripts/kit-dirs.sh")
[ -n "$kit_dirs" ] || echo "no UI-test kit in this project — kit defects step skipped"
printf '%s\n' "$kit_dirs" | while IFS= read -r d; do   # one path per LINE: a path with spaces stays whole
  [ -n "$d" ] || continue
  [ -d "$d" ] && echo "kit: $d" || echo "kit dir named but missing: $d — kit defects NOT checked there"
done
```
`kit-dirs.sh` (in this plugin's `scripts/`) reads the YAML scalar, not the rest
of the line, and normalises the path lexically (empty and `.` segments dropped, `x/..` folded), so every equivalent spelling names one kit. The accepted value forms are a CLOSED set (#375): unquoted (ending at ` #`),
single-quoted with `''`, and double-quoted with `\"` and `\\` only. Anything else —
another double-quoted escape such as `\x20`, a block or flow scalar, an anchor, a
`${{ }}` expression — is not decoded, so the literal text is taken as the path and
it lands on *named but missing … NOT checked there*: reported, never silent.
Such a project checks that directory by hand; the set is not widened per spelling.

1. Fetch the list — `docs/standards/kit-defects.md`, kept OUTSIDE the kit so the
   row above never copies it downstream — from UPSTREAM (not a local copy, which
   is only as new as the last sync), at the pinned head, and
2. run each entry's **Check** from each kit directory found above. One script
   does both: it pulls each entry's fenced **Check** block out of the fetched
   list (the command once said "run its Check" with nothing to extract it, so
   each session improvised one; pilots, 2026-10-13), runs it in every kit
   directory `kit-dirs.sh` names, and prints one verdict line per entry per
   directory, then a `SUMMARY`:
   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/scripts/kit-defects.sh"
   ```
   *NOT checked* (no upstream SHA, or the fetch failed; exit 2) is reported as
   such, never as none found. `CLEAR` → nothing. `UNDECIDED` — the check could
   not read this copy's shape, printed no verdict, or the entry has no Check
   block — → read the code the entry names and record a verdict.
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

`refresh-callers.sh` computes that union: every installed workflow and
composite that upstream ships a template for, every composite those reach by
`uses:` in the UPSTREAM text, and every directive. A caller this refresh newly
installs (a workflow absent locally that the rules above let in) is the one
input it cannot know: name each as an argument, upstream path form
(`templates/workflows/qa-live.yml`); it lists the delta's absent callers on
stderr as a reminder. It refuses — exit 2, nothing on stdout — when the set
cannot be computed or an argument is not shipped, so a partial set never
reaches the loop:

```bash
repo="akyachtsman/claude.directives"
# The SHA Phase 2 classified, NOT main: that ref moves under you.
head=$(cat "$(git rev-parse --git-path refresh-repo-classified)" 2>/dev/null)
printf '%s' "$head" | grep -qE '^[0-9a-f]{40}$' \
  || { echo "no Phase 2 SHA — run refresh-delta.sh first; derivation NOT run" >&2; exit 1; }
raw="https://raw.githubusercontent.com/$repo/$head"
# Append each newly installed caller as an argument, e.g. templates/workflows/qa-live.yml
callers=$(REFRESH_PIN="$head" bash "${CLAUDE_PLUGIN_ROOT}/scripts/refresh-callers.sh") \
  || { echo "CALLER SET FAILED — derivation INVALID, do not use it" >&2; exit 1; }

buf=$(mktemp)
for c in $callers; do
  curl -fsSL "$raw/$c" >>"$buf" \
    || { echo "FETCH FAILED: $c — derivation INVALID, do not use it" >&2
         rm -f "$buf"; exit 1; }
  printf '\n' >>"$buf"   # token boundary — see the third bullet below
done
# The derivation itself lives in ONE file, which Phase 3's applied-check runs
# too, so the install and the check can never name different sets (#398).
derived=$(bash "${CLAUDE_PLUGIN_ROOT}/scripts/derive-scripts.sh" <"$buf") \
  || { echo "DERIVATION FAILED — derivation INVALID, do not use it" >&2
       rm -f "$buf"; exit 1; }
rm -f "$buf"
refs=$(printf '%s\n' "$derived" | sort -u)
printf '%s\n' "$refs"
```

`derive-scripts.sh` (in this plugin's `scripts/`) is the derivation: the whole
path token, a trailing period stripped, then only `.js`/`.py` endings plus exactly
`.github/scripts/package.json`. Seven things about that shape, each of which a
shorter version got wrong (the
failures themselves: the *Refresh-repo history* section of
https://github.com/akyachtsman/claude.directives/blob/main/docs/internal/gate-history.md, which a downstream checkout does not carry):

- **It matches the script PATH, never the invocation prefix.** A prefix is a
  form; the path is the fact. `node "$GITHUB_WORKSPACE/.github/scripts/check-ui-viewports.js"`
  — the real line in `ui-suite/action.yml` — has no `node .github/` in it. The
  two-stage filter, grabbing the whole token and *then* requiring a `.js`/`.py`
  ending, is what keeps `.github/scripts/package-lock.json` out, since an
  unterminated `\.(js|py)` matches the `.js` inside `.json`. The one other file
  admitted is **exactly** `.github/scripts/package.json`, anchored at both ends.
  It has TWO jobs, and they install differently (pilots, 2026-10-13). Its
  `"type": "commonjs"` is what every CommonJS script there runs under when the
  project root says `"type": "module"`, so every caller of one names it — the
  qa workflows, the `ui-suite` composite, `test.md` — and it installs with
  them, cron kit or not (`check-refresh-derivation.py` fails CI when a caller
  of a CommonJS script stops naming it). Its dependency is the scheduled-task
  kit's alone: `cron-notify.yml`'s `npm install` reads it (#398).
  `ui-tests/package.json` belongs to the kit row, and the lockfile is generated
  by the project, so both stay out. **The lockfile follows the cron kit, not the
  manifest:** only when `cron-notify.yml`, `notify-task.js` or `notify-email.js`
  is installed, run `npm install` in `.github/scripts/` and commit the resulting
  `package-lock.json` in the same change — `cron-notify.yml`'s `setup-node`
  cache names it, so without it the job fails before its own install step
  (Codex, #409), and Phase 3 refuses the stamp while it is missing. Without the
  kit, nothing runs `npm` there: install the manifest and nothing else, as its
  own `description` says. A trailing period is
  stripped first (`sed -E 's/[.]+$//'`): a directive that names a script at
  the end of a sentence still names it. When the install and Phase 3 each
  carried a copy, only Phase 3's stripped it, so the install derived LESS than
  the check verified (Codex, #409); one file now serves both.
  `check-refresh-derivation.py` runs `derive-scripts.sh` against every shipped
  caller and holds it to the contract over a fixed probe set, so an
  invocation-form change or a widened or narrowed stage fails CI, and it
  refuses an inline copy of the derivation in either caller.
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
  invokes no script — `secret-scan/action.yml` is like this today — the correct derivation *is* empty, and asserting non-empty
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
session recorded why it stays. A reason binds to the **template's blob id**
and to the **installed copy's blob** (`local`; `absent` for a required file not
installed), both of which the refusal prints, so neither an upstream change nor
a later local edit inherits the approval. A record without `local` (written
before it existed) binds nothing: the stamp refuses it like any other, and the
refusal prints the `local` value to add:

```bash
jq --arg p "<local path>" --arg b "<blob id printed with it>" --arg l "<local blob printed with it>" --arg r "<why it stays local>" \
  '.refresh_kept[$p] = {blob: $b, local: $l, reason: $r}' .claude/directive-sync.json \
  > .claude/directive-sync.tmp && mv .claude/directive-sync.tmp .claude/directive-sync.json
```

Binding to the blob, not the head, is what makes the question come back exactly
when it should: when the template changes, the old reason stops matching and the
path is asked about again; while it does not, a deliberate local version is
asked about once, not on every refresh. A reason for a path upstream deleted
binds to `deleted`.

**A whole kit subdirectory in one step** (owner ruling, 2026-10-13: kit files
stay required, declining them is one step). A project that keeps the kit's
helpers inline in its spec would otherwise record one entry per
`tests/lib/` file. Instead, key ONE entry by the directory, with a trailing `/`,
and bind it to the directory's git **tree** id at the head, which the refusal
prints beside the first file it refuses there:

```bash
jq --arg p "<kit dir>/tests/lib/" --arg t "<tree id printed>" --arg r "<why the project does without it>" \
  '.refresh_kept[$p] = {tree: $t, reason: $r}' .claude/directive-sync.json \
  > .claude/directive-sync.tmp && mv .claude/directive-sync.tmp .claude/directive-sync.json
```

It covers every file the template ships under that directory, present or
absent, in that kit; keyed as shipped (`templates/ui-tests/tests/lib/`) it
covers every kit the project has. The tree id changes when any file under it
does, so the question comes back exactly as a file's does. Never the kit root:
declining the whole kit in one line is the wholesale skip the kit row forbids,
so `refresh-stamp.sh` honours a directory entry only BELOW the kit root.

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
    directive at the head, names, derived by the same `derive-scripts.sh`
    that *Deriving the referenced-script set* installs by. A workflow must NAME
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
    reason. `package-lock.json` must EXIST only where the scheduled-task kit
    is installed (`cron-notify.yml`, `notify-task.js` or `notify-email.js`
    present); it is generated by `npm install`, so it is never compared.
    `package.json` alone never requires it: the manifest is there for its
    `"type": "commonjs"`, which no `npm install` reads.

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
an absent workflow can be deliberate (`pages-deploy.yml`, a scheduled workflow
with no task), and a path upstream does not ship is the project's own. A path
the upstream deleted counts as unapplied while a local copy remains.

**What a clean run proves, and what it does not.** A stamp that goes through
means: no path the delta lists is unapplied, no dependency above (script,
composite, kit file) is stale or missing, and no settings entry is missing,
each unless a recorded reason covers it. It does **not** mean the project
matches upstream. A workflow, or any file outside the dependency set, whose
template did not change in the delta is compared only by Phase 1.5, which
reports `STALE`, `CUSTOM` or `DRIFT` without holding the stamp. So "nothing
named" is not "no divergence"; read Phase 1.5's report beside this one.

### New repository variables and secrets (owner pre-merge)

Run this after the installs, **before** `refresh-stamp.sh`: a written stamp
consumes Phase 2's marker, and without it this script refuses rather than
compare the head with itself.
```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/refresh-vars.sh"
```
It reads every `vars.NAME` and `secrets.NAME` (`GITHUB_TOKEN` excepted) in the
templates (at the pin) of the workflows and composites installed here, and
prints one line per name that none of the project's OWN installed files read
when the stamp was written —
`OWNER PRE-MERGE: set repository variable APP_URL — newly read by templates/workflows/qa-live.yml`
(or `repository secret`) — or the explicit `OK: no new repository variables or secrets read` line; exit 2 when it
could not compare. Each `OWNER PRE-MERGE` line goes, verbatim, into the
refresh's report AND the top of its PR body as an item the owner completes
**before merging**: setting a variable or secret needs the owner, because the
web-session proxy blocks the Actions variables API, so the session can neither
set one nor see whether it is set. A merged refresh that newly reads an unset
variable goes red on its first run (pilots claude.prop + claude.trading,
2026-10-13: `QA — UI Tests (live)` failed in seconds at `Require APP_URL`).

What it cannot see, and the session states instead: a name read at the stamp
that has only now become REQUIRED. `APP_URL` is that case — every version of
`qa-live.yml` read it, and what the pilots lost was a filled-in `baseURL`
default in the kit's `playwright.config.js`, which neither live workflow reads.
So whenever this refresh installs or updates `qa-live.yml` or
`qa-response.yml`, add `APP_URL` to the owner's pre-merge list as "confirm it
is set" even on an `OK` line.

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

**Its exit status is the verdict:** 0 stamped (`stamped: <sha>`, or
`stamped: <sha> (unchanged; file not rewritten)` when the stamp was already at
that head); 1 REFUSED — a
finding above, or a delta not classified for this head; 2 could not run (the
head was unreachable, or the write failed). It once exited 0 on a refusal, so
only its last line told a caller the stamp had not moved (pilots, 2026-10-13).
**A refusal keeps Phase 2's verdict:** its markers are consumed only by a
written stamp, so after recording a `refresh_kept` or `refresh_declined`
reason, re-run THIS script alone — `refresh-delta.sh` need not run again unless
upstream moved, which the stamp detects and refuses on. A stamp that changed
since Phase 2 listed the delta (a pull, a merge) refuses the same way.
**`synced` is the date the sha last CHANGED**, not the date of the last check:
a run at the head already stamped leaves `.claude/directive-sync.json`
byte-identical, so a refresh that changes nothing leaves no diff to commit
(owner ruling, 2026-10-14). Do not read `synced` as freshness; the sha is what
`/env-chk` compares.

**Stamp only a VERIFIED head SHA.** Phases 2 and 3 need nothing from
`api.github.com` — both run over git transport, which is what lets the stamp
advance from a web session at all (#326). If `ls-remote` or the fetch is
unreachable this run, skip Phases 2–3 gracefully: report
"upstream delta unavailable this run — stamp unchanged, re-run /refresh-repo
later", keep the old stamp, and never fabricate a SHA or an unverified delta
(`global.md` → *Behavior Rules*: evidence before assertions).

Report: rules re-read (Phase 0), broken references and fixes, the upstream
delta with per-file dispositions, which path wrote `.claude/settings.json`
(*Settings writes*), the new stamp, and **the owner's pre-merge checklist** —
every `OWNER PRE-MERGE` line from *New repository variables and secrets*, also
placed at the top of the refresh PR's body, so the owner sets each variable or
secret before merging (or the `OK` line, said as such) — and remind that any
toolkit changes in the delta arrive via the plugin at next session start.
