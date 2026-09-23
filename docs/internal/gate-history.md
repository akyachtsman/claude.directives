# Gate History — why the local gate looks like this

Internal. `CLAUDE.md` → *Local gate — CI scripts (this repo)* keeps one line of
purpose per command and the hard rules a session must follow; the round-by-round
history and evidence behind those lines lives with the script it is about, in that
script's header comment under **HISTORY MOVED FROM CLAUDE.md (2026-09-23)**. This
file holds the part with no single script home: history about a byte-identical
pair (editing one copy would break the paired-file diff), about a step that is not
a script, and about the gate as a whole. Moved verbatim on 2026-09-23 (owner
ruling: slim `CLAUDE.md`, move history to script headers or `docs/internal/`).

## Where each script's history now lives

| Gate command | History is in |
|---|---|
| `check-claims.js`, `check-claims-cases.js` | each script's header |
| `check-ui-viewports-cases.js` (incl. the viewport gate's design history from the `qa.yml` bullet) | that script's header |
| `check-ui-suite-env.py`, `check-ui-suite-env-cases.py`, `check-report-path-cases.py` | each script's header |
| `check-job-bounds-cases.py`, `check-contrast-cases.js` | each script's header |
| `check-refresh-derivation.py`, `check-refresh-derivation-cases.py` | each script's header |
| `check-action-siblings.py`, `check-action-siblings-cases.py` | each script's header |
| `check-browser-ladder-cases.js` | that script's header |
| `check-links.js`, `check-links-cases.js` | each script's header |
| `check-py-warnings.py` (byte-identical pair), the ui-tests `npm install` step, the gate as a whole | this file |
| the `Repo Map UI` suite | `docs/internal/repo-map-ui.md` |

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
`EXPORTS.json` fails the build, and `node --check` over the exported JS templates
— `Repo Map UI` exercises this repo's own map suite, not `templates/ui-tests/`, so
without that step a syntax error in the largest file we ship would be found by a
downstream project's CI rather than ours.
