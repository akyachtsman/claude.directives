# Shared workflows (#460 step 4)

Projects will call this repo's workflows instead of carrying copies of them.
This page records how the callable versions work and what the Phase A spike
established. The plan, its phases and the owner's constraints are on #460;
this page does not repeat them.

## What exists

| Callable workflow | Template it mirrors |
|---|---|
| `.github/workflows/shared-qa.yml` | `templates/workflows/qa.yml` |
| `.github/workflows/shared-qa-live.yml` | `templates/workflows/qa-live.yml` |
| `.github/workflows/shared-qa-response.yml` | `templates/workflows/qa-response.yml` |
| `.github/workflows/shared-pages-deploy.yml` | `templates/workflows/pages-deploy.yml` |
| `.github/workflows/shared-cron-notify.yml` | `templates/workflows/cron-notify.yml` |

Each file's header carries the caller a project writes for it.

The templates under `templates/workflows/` stay full copies, unchanged, until
the pilot has proven out (owner, 2026-10-16). Until the templates become
callers, a defect is fixed in both files.

## How a callable workflow differs from its template

- **Shared files come from this repo, at the called commit.** Each job that
  needs a shared file checks this repo out into `.claude-directives/` at
  `job.workflow_sha`, and reads the composites and scripts from there. The job
  then adds `.claude-directives/` to the caller's `.git/info/exclude`, so the
  caller's secret scan does not read it.
- **Settings are inputs.** What a project edited into its copy's `env:`
  (`UI_TESTS_DIR`, `BUILD_CMD`, `SITE_DIR`, the advisory flag) is an input,
  because a caller's `env` does not pass into a called workflow. `BUILD_PATHS`
  stays in the caller's top-level `env:`: the toolkit's Pages edit reminder
  reads it there, and no workflow does.
- **Secrets and variables.** The called workflow declares the secrets it reads
  as optional, and the caller passes each by name
  (`TEST_AUTH_CREDENTIAL: ${{ secrets.TEST_AUTH_CREDENTIAL }}`). Not
  `secrets: inherit`: GitHub documents it only for callers in the same
  organization or enterprise, and the projects live under a personal account.
  `vars.*` needs nothing: a called workflow reads the caller repository's
  variables.
- **Two scripts are staged.** The ui-suite composite runs
  `$GITHUB_WORKSPACE/.github/scripts/check-ui-viewports.js` by fixed path, and
  that script needs the commonjs `package.json` beside it. The job copies both
  from the shared checkout into `.github/scripts/` before the composite runs.
  A project's own copy is replaced for that run, with a notice when it differed.
  The composite itself is not changed, because projects still copy it.

- **What the caller keeps.** Its `on:` triggers (they name the project's own
  deploy workflow, schedule or dispatch types), its `permissions` (a called
  workflow can only narrow them: `actions: read` for `qa-live`'s published
  lookup; `deployments: read`, `pages: write` and `id-token: write` for the
  deploy) and, for the deploy, the template's workflow-level `concurrency`.
  `qa-live`'s concurrency moved onto its suite job, so its caller needs none.
- **The published lookup reads both job names.** In a caller's run, a called
  deploy's job shows as `<caller job> / Publish`. `shared-qa-live.yml`
  matches that form as well as the template's `Publish`; without it, a
  deploy that published nothing would read as one that did.
- **The cron task stays the project's.** `notify-task.js` is project code, so
  `shared-cron-notify.yml` runs the caller's own script and stages only
  `notify-email.js` and the commonjs `package.json` beside it. The task gets
  the email transport and the `DB_URL` / `DB_SERVICE_KEY` pair `data.md`
  names; a task that needs other names keeps the full copy for now.
- `shared-pages-deploy.yml` fetches nothing from this repo: it runs no shared
  script.

## What a project keeps (claude.prop pilot, 2026-10-25)

The pilot, claude.prop #134 (merged as `c859d91`), pinned its callers to
`f667e89`. It found four gaps, each fixed here:

1. **Project checks go in a sibling job.** `shared-qa.yml` takes no command to
   run. A project with checks of its own (prop's are a root-absolute path guard
   and its Node unit tests) runs them in a sibling job of its caller, and `qa`
   lists that job in `needs`, so a red project check stops the suite. The
   project keeps its own setup that way. The `shared-qa.yml` header shows the
   caller.
2. **A project's own contrast pairs.** The shared contrast step ran only the
   shipped `check-contrast.js`, so prop's four added pairs went unchecked (11
   checked of its 13). Now `contrast-script` names the project's copy, which
   runs instead of the shared one. Without it, a local
   `.github/scripts/check-contrast.js` that differs from the shared one gets a
   warning. The self-test runs the shipped script through that input.
3. **Some scripts stay copies.** `browser-ladder.js` is not read by any
   workflow: `test.md` tells sessions to run it locally. So it stays a copy in
   the project, with the commonjs `package.json` beside it. The same goes for
   a project's own `check-contrast.js`, which needs that `package.json` too.
   The step 4 plan had listed `browser-ladder.js` among the scripts that would
   be read from this repo at run time.
4. **The refresh on a project with callers.** `/refresh-repo` reports a caller
   as `CALLER` and never merges or overwrites it. `refresh-callers.sh` leaves
   callers out, so the deleted composites and scripts are not offered back.
   The stamp's applied-check never required them, because it reads each
   workflow's own text; a case now proves that. `kit-dirs.sh` reads a caller's
   `tests-dir:`. The rules are in `refresh-repo.md` → *A project on callers*.

The pilot ran `qa`, `qa-live` (published lookup and live suite) and
`qa-response` for real. prop has no `pages-deploy.yml` and no `cron-notify.yml`,
so `shared-pages-deploy.yml` and `shared-cron-notify.yml` are still unproven
across repositories.

## Spike findings (2026-10-19)

1. **`./` paths resolve in the caller's repository.** The `github` context in a
   called workflow is the caller's, and `actions/checkout` with no
   `repository` checks out the caller. So a `uses: ./.github/actions/...` or a
   `.github/scripts/...` path would read the caller's copy. Every shared file
   is therefore read from `.claude-directives/`.
2. **Version lock: `job.workflow_sha`.** GitHub documents
   `job.workflow_repository`, `job.workflow_sha` and `job.workflow_ref` as
   naming the workflow file that defines the job, which for a called workflow
   is the called file. Checking out `job.workflow_repository` at
   `job.workflow_sha` gives exactly the files of the version the caller pinned,
   with no `ref` input to keep in step with the tag. These contexts are
   github.com-only, so each job fails if they are empty rather than let
   checkout fall back to the default branch. Every run prints the commit it
   used in its step summary.
3. **Pages from a called workflow.** Documented, to prove on the pilot: the
   called job may set `environment: github-pages`, and the caller must grant
   `pages: write` and `id-token: write`, because a called workflow can only
   narrow the caller's token, never widen it.
4. **Tags cannot be cut from a session here.** `git push` of a tag through the
   session's proxy returned HTTP 403, and the GitHub tools available here have
   no call that creates a tag or release. Cutting `v0.1.0` (Phase B) is
   therefore an owner step on the Releases page, or a dispatchable release
   workflow in this repo if the owner prefers one.

## The self-tests

`qa.yml`'s `shared-qa-selftest` job calls `shared-qa.yml` the way a project
would, with a fixture site and suite under `.github/shared-qa-fixture/`:

- `site/index.html`: one page with a heading, a button and a status line.
- `ui-tests/`: an exactly pinned Playwright suite with a committed lockfile
  (the ui-suite composite caches on it), declaring the three viewport classes
  the viewport gate requires, and one spec that loads the page, clicks the
  button and checks for errors and horizontal overflow.
- The contrast step reads `templates/styles/tokens.css`, the starter tokens
  projects copy. It runs `templates/scripts/check-contrast.js` through the
  `contrast-script` input, so the self-test proves the path a project with its
  own pairs takes.

`shared-cron-selftest` calls `shared-cron-notify.yml` with
`.github/shared-qa-fixture/cron/notify-task.js`, a task that sends nothing:
it fails unless `notify-email.js` was staged beside it, `nodemailer`
installed, and the caller's `force` input arrived.

`qa-live`, `qa-response` and the deploy have no self-test here: each needs a
live site, a dispatch or a Pages deployment this repo does not have. Their
differences from the templates are the ones listed above, and the pilot runs
each of them for real.

Because the self-test calls the workflow by local path, it runs in this
repository and so cannot show item 1 cross-repo. It does prove the rest of the
plumbing: the version lock, the composites resolving from the shared checkout,
the staged scripts, the local server and the gates. The cross-repo proof is
the pilot.
