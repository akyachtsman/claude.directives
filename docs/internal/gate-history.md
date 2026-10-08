# Gate History — why the local gate looks like this

Internal. `CLAUDE.md` → *Local gate — CI scripts (this repo)* keeps one line of
purpose per command and the hard rules a session must follow; the round-by-round
history and evidence behind those lines lives with the script it is about, in that
script's header comment under **HISTORY MOVED FROM CLAUDE.md (2026-09-23)**. This
file holds the part with no single script home: history about a byte-identical
pair (editing one copy would break the paired-file check), about a step that is not
a script, and about the gate as a whole. Moved verbatim on 2026-09-23 (owner
ruling: slim `CLAUDE.md`, move history to script headers or `docs/internal/`).
Since 2026-10-07 it also holds the incident history behind `/refresh-repo`'s
rules (*Refresh-repo history*), which the command keeps only as rules.

## Where each script's history now lives

| Gate command | History is in |
|---|---|
| `check-claims.js`, `check-claims-cases.js` | each script's header |
| `check-ui-viewports-cases.js` (incl. the viewport gate's design history from the `qa.yml` bullet) | that script's header |
| `check-ui-suite-env.py`, `check-ui-suite-env-cases.py`, `check-report-path-cases.py` | each script's header |
| `check-job-bounds-cases.py`, `check-contrast-cases.js` | each script's header |
| `check-refresh-derivation.py`, `check-refresh-derivation-cases.py` | each script's header |
| `check-action-siblings.py`, `check-action-siblings-cases.py` | each script's header |
| `check-run-quoting.py`, `check-run-quoting-cases.py` | each script's header |
| `check-browser-ladder-cases.js` | that script's header |
| `check-links.js`, `check-links-cases.js` | each script's header |
| `check-py-warnings.py` (byte-identical pair), the ui-tests `npm install` step, the gate as a whole | this file |
| the `Repo Map UI` suite | `docs/internal/repo-map-ui.md` |
| `/refresh-repo`'s rules (the command `check-refresh-derivation.py` reads its pattern out of) | this file, *Refresh-repo history* |

## `check-py-warnings.py`

It has a byte-identical twin in `templates/scripts/`, so its history lives here
rather than in either header.

From the Local gate comment: tracked .py compile clean: a `\` in a plain
docstring is invisible on 3.11, shown on 3.12, FATAL on 3.15 — at which point the
guard stops running and stops checking.

From the `qa.yml` bullet in *Self-test monitoring*: a clean-compile check over
every tracked `.py` (`.github/scripts/check-py-warnings.py` — a guard that warns
at compile time is a guard that stops running on a future interpreter).

## The ui-tests `npm install` step

From the Local gate comment: RUN THIS FIRST: BOTH viewport checks below resolve
@playwright/test from templates/ui-tests, and on a clean tree the cases exit 1
with "CANNOT RUN" before a single case runs (#347 round 36). One-time ~2.4s
network step; node_modules/ is gitignored and no lockfile is written.

## Run the gate after `git add`

The rule stays in `CLAUDE.md`. Its evidence: Measured 2026-08-26 on #325: the
gate passed 14 checks with `templates/scripts/check-py-warnings.py` untracked,
and `check-exports` failed on that exact file in CI one minute later. This is the
fail-open family (#323) inside the gate itself — a pass and a did-not-look are the
same output.

## `build-logical-map.js --check` and `node --check`

From the `qa.yml` bullet in *Self-test monitoring*: It also runs
`build-logical-map.js --check`, so a committed map that no longer matches
the tree fails the build, and `node --check` over the exported JS templates
— `Repo Map UI` exercises this repo's own map suite, not `templates/ui-tests/`, so
without that step a syntax error in the largest file we ship would be found by a
downstream project's CI rather than ours.

## Refresh-repo history

Moved from `plugins/directives-toolkit/commands/refresh-repo.md` on 2026-10-07
(audit of 2026-10-06, finding F). The command keeps every rule, every command and
the short reason a session needs to apply each one; the incidents that produced
those rules live here, under the command's own section names.

### Phase 1 — the tree-fetch guard

- **Shell options.** The block runs the same under `-e`, `-u` and
  `-o pipefail` because each was a separate Codex finding on #394; it is tested
  against all of them rather than fixed one option at a time.
- **The tree-object marker.** claude.prop, 2026-10-05: a 403 from a
  project-scoped session landed its JSON error body in `$tree`, which is
  non-empty, so the old emptiness test passed and every reference printed
  BROKEN — five false alarms. Hence the clean-exit-plus-`TREE <sha>` first-line
  test.
- **Remote-session transport** was verified 2026-07-18 by apfp.claude: `gh`
  absent, `api.github.com` proxy-blocked or rate-limited, raw URLs served.

### Phase 1.5 — installed-copy integrity

- **Why the pass exists.** Identified gap, 2026-07-19: Phase 2 sees only what
  upstream changed, so an accidental session edit to a project's `qa.yml` would
  never have been flagged.
- **`CANNOT-VERIFY` vs `NO-TEMPLATE`.** The audit of 2026-10-06 found any failed
  fetch read as `NO-TEMPLATE`, so a blocked host, a timeout or a 5xx skipped a
  file that may well have drifted. Only a 404 is `NO-TEMPLATE` now.
- **`.github/actions/*/*`, not `*/action.yml`.** The composites copy row moved to
  whole directories in #347 round 35; this scan did not, and round 36 caught the
  half that was left. Same shape as the miss it corrected: a fix applied at one
  level and not the one under it.
- **No exception list.** An allow-list of files permitted to differ is the same
  failure shape as a watch list pinned to one workflow name. `pages-retry.yml`
  earned an exemption on 2026-08-17 and the list never learned; a verbatim
  refresh would have deleted that hardening and re-broken the trigger it also
  fixed (raised by apfp.claude, 2026-08-19).
- **Disposition by diff.** 2026-08-19 produced one drift of each kind — an
  unexplained edit and a hardening upstream had not absorbed — and only the
  diff separated them. "Never silently preserve" exists because keeping without
  reporting is how a fix once spent two days in one repo.

### Phase 2 — the path table and the skip rule

- **The ui-tests row outranks a "take it wholesale" instruction.**
  `claude.insurance` was told exactly that on 2026-08-26, by an upstream
  session; diffing first is the only reason its `LIVE_TARGET` reachability split
  survived — a locally-defined guard, absent upstream, without which three
  scenarios would have run against a backend-less server on a blocking job.
- **Kit defects.** #327: S2's fail-open reached projects that followed the
  per-file kit rule exactly, because the fix hunk was weighed as "evolution".
- **The scripts row is derived, not hand-listed.** A hand-list there fell behind
  its own general form twice: `check-ui-viewports.js` was missing when
  `claude.insurance` refreshed, and every UI job there would have died at step
  resolution had the row been applied literally (directives#321). Reading the
  skip rule's exception as "qa-invoked" is what let that script be skipped.
- **A directive is a caller.** `test.md` tells a session to run
  `.github/scripts/browser-ladder.js`, which no workflow or composite invokes.
  The derivation found it once directives joined the caller set, and the skip
  rule then skipped it as an absent local path — so a refresh installed a
  directive naming a file it had not delivered, and the documented command died
  with MODULE_NOT_FOUND (Codex, directives#355). Same class as #321 and #353, a
  third time.
- **Absent scheduled workflows.** `claude.trading` correctly declined
  `cron-notify.yml` on 2026-08-26: its `notify-task.js` was still the bootstrap
  stub that prints a placeholder and exits, no SMTP vars were set, and its real
  scheduled work runs as `pg_cron` inside Supabase. Installing it would have
  bought a daily checkout, a daily `npm install` and a no-op, forever. It checked
  first that the file was not load-bearing, which is now the rule's own test.

### Deriving the referenced-script set

- **Installed set, not delta.** The PR that introduced the "changed ∪
  co-installed" rule was its own worked case: it changed
  `templates/workflows/qa.yml` and did not touch
  `templates/actions/ui-suite/action.yml`, so a delta-scoped derivation never
  derived `check-ui-viewports.js` — #321 again, reproduced by the command
  written to prevent it.
- **Path, not invocation prefix.** Reported by PROP6, 2026-09-01, and measured
  before the fix: the earlier form required `node ` or `python3 ` immediately
  before `.github/`, so the real `ui-suite/action.yml` line returned no match at
  all. The `package-lock.json` defect (`\.(js|py)` unterminated matching inside
  `.json`) was latent in the old pattern too; the prefix requirement only kept
  it from being reached. `check-refresh-derivation.py` was added to pin this.
- **Mention as accepted cost.** The prose once said the opposite ("Match on the
  INVOCATION, not the bare path"); it was left standing when the pipeline was
  inverted, and Codex caught the contradiction on #345.
- **Nested scripts.** Found by Codex on #345 round 2, as a guard bug: the
  guard's own ground truth was slash-blind too, so neither scan could see
  `.github/scripts/nested/a.py` truncating to `.github/scripts/nested`.
- **Token boundary.** Measured on #345: the concatenation defect only exists in
  `$buf`, so no per-caller scan can see it.
- **The output moves.** Run against `main` on 2026-08-26 with `qa.yml` and
  `ui-suite/action.yml` as callers, it yielded four scripts
  (`check-contrast.js`, `workflow-ref-guard.py`, `check-job-bounds.py`,
  `check-ui-viewports.js`), and five once directives#325 added
  `check-py-warnings.py` to `qa.yml`.

**Every way the derivation has failed, each one silently.** Nine to date, none
hypothetical; four of the first five came from *fixing* the one before it:

1. Written in the table cell with its pipes escaped for markdown — `\|` in
   `grep -E` matches a literal pipe character, so it matched nothing and
   exited 0.
2. Pointed at `templates/workflows/` and `templates/actions/`, which do not
   exist in a project — *No such file or directory*, and `sort` exited 0
   regardless.
3. Ran the fetch loop inside `refs=$(…)`, so a mid-loop `exit 1` left only the
   subshell: a failed caller yielded a partial set that passed an emptiness
   check.
4. Asserted the result must be non-empty — which fails closed on a legitimate
   delta whose only changed caller invokes no script.
5. Scoped the input to the delta rather than to everything the refresh
   installs (above).
6. Required an invocation prefix, missing the quoted `$GITHUB_WORKSPACE` form
   (PROP6).
7. Concatenated callers without a delimiter, merging a trailing script path into
   the next file's first word (#345).
8. Excluded `/` from the character class, truncating nested scripts (#345
   round 2).
9. Took only YAML callers, missing a script only a directive names (#355).

### Phase 3 — read is not applied

- **The unapplied delta path.** claude.prop measured it on 2026-10-06:
  `templates/scripts/check-job-bounds.py` was in the delta of the refresh that
  stamped `96c370f`, was not applied, and appeared in neither of the next two
  deltas. It stayed stale for five weeks, until a delta-independent diff found
  it.
- **Whole-kit comparison.** claude.prop's two longest-standing kit divergences
  were never named by any refresh, because workflows name kit files by bare
  filename and a kit whose template did not change was never compared
  (claude.prop, 2026-10-06).
- **Settings as sets.** claude.prop's `.claude/settings.json` sat 42 permission
  entries behind for six weeks, because a read but unapplied settings delta was
  stamped (claude.prop, 2026-10-06).
