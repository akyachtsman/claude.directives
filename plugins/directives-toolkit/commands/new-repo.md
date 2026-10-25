---
description: "Bootstrap a brand-new project — fires only when CLAUDE.md does not exist yet."
phase: build
---
Bootstrap a brand-new project repo from scratch. This runs **once**, on a repo
that has no `CLAUDE.md` yet. The human has already done the GitHub config in
`NEW-REPO-USER-INSTRUCTIONS.md` (repo, Pages, Watch, secrets, `APP_URL`); you do
everything else autonomously.

**Guard — check first:** If `CLAUDE.md` already exists in the repo root, STOP
immediately. Do not scaffold anything. Tell the human: "This repo is already
bootstrapped — a new session will auto-bootstrap from CLAUDE.md automatically.
No command needed." Only proceed when `CLAUDE.md` is absent.

Every step is first-run scaffolding and must be re-run safe: before creating
anything, check whether it already exists; if so, skip and verify instead.
Never overwrite an existing workflow, agent, or test file.

Execute in order:

1. **Pin one upstream SHA, then fetch and internalize all five directives at
   it.** Resolve `main` ONCE for this run —
   `git ls-remote https://github.com/akyachtsman/claude.directives.git refs/heads/main | cut -f1`
   — and fetch every upstream file this bootstrap reads at that `<SHA>`
   (`https://raw.githubusercontent.com/akyachtsman/claude.directives/<SHA>/<path>`),
   never at a moving `main`: a merge landing mid-run would otherwise install two
   revisions of the standard side by side. Every `claude.directives/<path>`
   source in the steps below means `<path>` at this SHA. Read each directive
   fully before proceeding:
   - `https://raw.githubusercontent.com/akyachtsman/claude.directives/<SHA>/directives/global.md`
   - `https://raw.githubusercontent.com/akyachtsman/claude.directives/<SHA>/directives/git.md`
   - `https://raw.githubusercontent.com/akyachtsman/claude.directives/<SHA>/directives/design.md`
   - `https://raw.githubusercontent.com/akyachtsman/claude.directives/<SHA>/directives/test.md`
   - `https://raw.githubusercontent.com/akyachtsman/claude.directives/<SHA>/directives/data.md`

2. **Verify the directives-toolkit plugin attached** (it carries this very
   command, all skills, the QA/data agents, and the guard hooks). If its
   commands don't resolve, the environment's setup script didn't run the
   install — stop and have the human fix the environment per
   `NEW-REPO-USER-INSTRUCTIONS.md` Step 0 before continuing.

3. **Create the feature branch.** Use the session's existing branch if it is a
   `claude/<name>` branch; otherwise create `claude/<name>`. Never work on `main`.

4. **Create `CLAUDE.md`** in the repo root from the canonical scaffold
   `templates/CLAUDE-template.md` in this repo — fetch it raw at step 1's SHA:
   `https://raw.githubusercontent.com/akyachtsman/claude.directives/<SHA>/templates/CLAUDE-template.md`
   Write it as `CLAUDE.md`, drop the scaffold's HTML comment, fill in the repo
   name and live URL from context (`APP_URL` variable / repo name), and leave
   the [bracketed] sections as placeholders for the human to complete
   post-merge. The project's **look is the house style** (`directives/design.md`),
   set up later by `/design-intake`; a different palette needs an owner ruling.
   Record the deployment target — **GitHub Pages** — on CLAUDE.md's `Stack:`
   bullet, and leave `Build:` at none. The project is a single-page
   `index.html` app on GitHub Pages — the only deployment path
   (`global.md` → *Hosting & Deployment*): no framework, no build, no tier to
   choose. This command does NOT write `index.html`; the build does
   (`/kickoff` → `/sdd-loop`), so until then the steps below find none
   (steps 8 and 9). A CI build is a later per-project opt-in with the owner's
   sign-off, never a bootstrap question.

5. **Install CI/CD workflows.** Every project gets the **full standard set** —
   copy these workflow files from `claude.directives/templates/workflows/`
   — **three on branch-source, four on Actions-source**: `pages-deploy.yml` is
   ACTIONS-SOURCE ONLY, so check the project's Pages source before copying into
   `.github/workflows/`. No watcher workflow is installed: CI results and Codex
   verdicts reach the session as PR events on its subscription (`git.md` → *PR Lifecycle*),
   which a run may end without delivering, so arm the check-in alongside the event wake, never instead of it, and drop it when THAT outcome is terminal.
   - `qa.yml` — static checks + local Playwright tests
   - `qa-live.yml` — live Playwright tests against GitHub Pages
   - `pages-deploy.yml` — **ACTIONS-SOURCE ONLY.** Builds (only for a project
     with the CI-build opt-in), drops the `.github/pages-deny.txt` paths,
     publishes, retries GitHub's transient publish failure, then asserts the
     root serves 200 and each denied path 404. Fill in `BUILD_CMD` and
     `SITE_DIR` per its header. On a branch-source project the push already
     deploys, so it would be a second, competing deploy: it is not installed
     there. Installed here, before
     the first page exists, it is a deliberate no-op until `index.html`
     arrives (no build, no Pages deployment ever: the Publish job is skipped
     and `qa-live.yml` skips its suite)
   - `qa-response.yml` — `repository_dispatch` QA trigger for sessions/automations
   - **Not `cron-notify.yml`** (the scheduled job). It is installed only when
     the project has a scheduled task (`global.md` → *Repo Structure
     Standard*, owner ruling 2026-10-10): a `schedule:` workflow starts
     recurring work the moment it lands. Add it with the task, per
     `docs/standards/cicd-setup.md` Step 9f.

   Drop-in for a **branch-source** Pages project — copy verbatim, no edits.

   ⚠️ **If Settings → Pages → Source is "GitHub Actions"**, **`qa-live.yml`**
   needs the exact `name:` of the project's own deploy workflow ("Pages Deploy"
   for `pages-deploy.yml`) added to `workflow_run.workflows` — added, never
   replacing `pages-build-deployment`. Omitting this step leaves the live QA
   gate silently inert, which reads as healthy.
   Rules and reasoning: `docs/standards/automations.md` → *Watcher Rules* (W1–W2).

   **Scripts the installed files name by path — DERIVE the set, never hand-list
   it** (a hand list falls behind: #321, #353, #355). Every file this bootstrap
   installs is a caller — the workflows above, `templates/actions/*/action.yml`,
   and the five `directives/*.md` from step 1 (a directive is a caller too) — all
   fetched at step 1's SHA, never a moving `main`. Run this block; it is the same
   derivation `/refresh-repo` runs (`refresh-repo.md` → *Deriving the referenced-script set*
   explains each stage), and the plugin file it calls is resolved when this
   command loads, so run it from here rather than from that command's text:

   ```bash
   sha="…step 1's SHA…"   # NOT main — that ref moves under you
   raw="https://raw.githubusercontent.com/akyachtsman/claude.directives/$sha"
   callers="…every templates/workflows/*.yml this step installs, every
            templates/actions/*/action.yml, and directives/global.md git.md
            design.md test.md data.md (each as directives/<name>)…"
   buf=$(mktemp)
   for c in $callers; do
     curl -fsSL "$raw/$c" >>"$buf" \
       || { echo "FETCH FAILED: $c — bootstrap STOPS here" >&2; rm -f "$buf"; exit 1; }
     printf '\n' >>"$buf"   # token boundary: a caller need not end in a newline
   done
   derived=$(bash "${CLAUDE_PLUGIN_ROOT}/scripts/derive-scripts.sh" <"$buf") \
     || { echo "DERIVATION FAILED — bootstrap STOPS here" >&2; rm -f "$buf"; exit 1; }
   rm -f "$buf"
   printf '%s\n' "$derived" | sort -u
   ```

   Copy each derived
   `.github/scripts/<f>` from `claude.directives/templates/scripts/<f>`. A missing
   one fails its caller at step resolution, so a failed caller or script fetch
   stops the bootstrap; never install a caller without what it names.
   `check-contrast.js`, the WCAG guardrail `qa.yml` runs against the design
   tokens, reads `styles/tokens.css` or `css/tokens.css` by default — elsewhere,
   append `--tokens <file>` (repeat it per theme file). No script checks job
   bounds or watcher names: keep them by hand (`docs/standards/cicd-setup.md` → 9c-bis, 9c-ter).

   **Composite actions (required by the qa workflows).** Copy
   `claude.directives/templates/actions/<a>/**` → `.github/actions/<a>/**` —
   **the whole directory, every file, not just `action.yml`.** The
   `claude.directives/` prefix is load-bearing: this command runs with the
   brand-new project as its working tree, where `templates/actions/` does not
   exist, so a bare path names nothing and the actions never get installed
   (Codex, #354). Every other source in these bootstrap steps is written the
   same way, or as a raw URL. The qa workflows reference
   the actions as `./.github/actions/*` and without them every qa run fails at
   step resolution; and a composite can run a SIBLING by path — `ui-suite`
   runs `python3 "$GITHUB_ACTION_PATH/validate-report-path.py"` at its
   `Validate report-path` step — so a YAML-only copy leaves that step naming a
   file that was never brought across, and every UI job dies there after
   spending minutes on Node setup, dependencies and the browser download. This instruction listed the two
   `action.yml` files by name until #354; that parenthetical was the hand-list
   #353 exists because of. Nothing enforces this row — `check-action-siblings.py`
   checks only that a composite's siblings are tracked, not that any carrier
   installs them, because that is not decidable from prose (#354). Keeping this
   correct is a review responsibility.

   **Scheduled-job scripts** — not at bootstrap: they ride with
   `cron-notify.yml`, which is added only when the project has a scheduled task
   (`docs/standards/cicd-setup.md` Step 9f). `cron-notify.yml` names
   `.github/scripts/notify-task.js` and `.github/scripts/notify-email.js` by
   path, so once it is installed the derivation above (and a later
   `/refresh-repo`) copies both (#398); Step 9f carries the commands.
   `.github/scripts/package.json` is not cron-only: the qa workflows name it for
   its `"type": "commonjs"`, so every project already has it. Then run `npm install` in `.github/scripts/` and **commit** the generated
   `package-lock.json` (`cron-notify.yml`'s `cache:` step needs
   `.github/scripts/package-lock.json`, same policy as the Playwright kit).
   `notify-task.js` ships as a starter that emails via `notify-email.js`; it
   **guards on the SMTP config and emits a notice if it is missing**, so the
   scheduled job never crashes cryptically. The email secrets and variables are
   needed only if the project sends email (NEW-REPO-USER-INSTRUCTIONS Step 1); the
   project replaces the task body with its real notification.

   **Design starter.** Copy `claude.directives/templates/styles/` (`tokens.css`,
   `components.css`) into `styles/`. They are the house style and pass the
   contrast guardrail as-is; `/design-intake` keeps them, and changes token
   values only when the owner rules a project palette (per `directives/design.md`).
   Mark the project as on the house style, so `/refresh-repo` keeps both files
   current: `"house_style": true` in `.claude/directive-sync.json`, with the
   `jq` line in step 1 of `/design-intake`, creating the file as `{}` if it is
   absent.

6. **Gitignore bootstrap-only and secret files.** Do NOT copy or commit agent
   definitions into the project repo. Ensure the project's `.gitignore` contains
   (create `.gitignore` if absent; append any missing line):
   - `.mcp.json` — per-repo MCP/backend config at the repo root; holds
     connection details and must never be committed (see the data directive)
   - `.env` and `.env.*` — local key/secret files must never be committed

   Add **only** these entries. In particular, do **not** gitignore
   `package-lock.json` — the Playwright lockfile **must be committed** (Step 7),
   and don't copy this or any other repo's `.gitignore` wholesale.

   Also copy `claude.directives/templates/claude-settings.json` to
   `.claude/settings.json` (merge into any existing one, through the built-in
   `update-config` skill with the hand-merge fallback, exactly as
   `refresh-repo.md` → *Settings writes* lays out): it registers the
   claude-directives marketplace, enables the directives-toolkit plugin
   for every session on this repo, and pre-approves the two classes
   `global.md` → *Scheduling Tools Never Prompt* admits: the six Claude Code
   Remote scheduling tools (`send_later`, `create_trigger`, `delete_trigger`,
   `update_trigger`, `fire_trigger`, `list_triggers`) and the read-only tools it
   lists (owner ruling, 2026-08-18; its accepted
   residuals record the persistence-vector trade-off) — self-scheduling is how
   a session resumes after CI and re-arms check-ins, and per-call permission
   prompts defeat unattended monitoring. It is NOT how a session heartbeats:
   schedule a wake to perform a real check, never for liveness alone
   (`global.md` → *Status Line on Every Stop*). The connector registers under two server-name
   spellings depending on surface (`mcp__Claude_Code_Remote__*` vs
   `mcp__claude-code-remote__*`) and permission rules match exactly, so the
   template lists each tool in BOTH spellings — keep both. Riskier remote
   tools — attaching repos, creating or archiving sessions — must keep
   prompting; do not add them. If the new repository is **private**, also add
   the outsider-content GitHub reads that `global.md` → *Scheduling Tools Never Prompt*
   lists for private repositories, and record `private repository` as the
   reason for each in `.claude/directive-sync.json`, with the same `jq` form
   `/refresh-repo` gives (`refresh-repo.md` → *Phase 3 — Stamp and report*),
   section `permissions.allow (local extra)`, creating the file as `{}` if it
   is absent. Unrecorded, the first `/refresh-repo` reports each one as an
   unexplained extra and holds its stamp back. A public repository never
   carries them. The guard hooks ship inside the plugin.

   The settings template also registers a `SessionStart` hook, so copy
   `claude.directives/templates/claude-hooks/session-start.sh` to
   `.claude/hooks/session-start.sh` and `chmod +x` it in the same step — a
   registered hook whose script is missing is a startup error in every session.
   That hook re-runs the toolkit install on each web session, which is what
   lets a merged toolkit change reach this project without re-saving its
   environment's Setup script by hand. It is web-gated and always exits 0, so
   a failed install degrades the session rather than blocking it.

7. **Install the Playwright kit.** Copy every file
   `claude.directives/templates/ui-tests/` ships at step 1's SHA (list it from the
   upstream tree; never a remembered file list) into `.github/scripts/ui-tests/`,
   keeping its layout. The scripts that serve the kit do NOT arrive with it:
   `check-ui-viewports.js` (the `ui-suite` composite names it by path — without it
   every UI job fails at step resolution, #321) and `browser-ladder.js`
   (`directives/test.md` → *Sandboxed local runs* tells every project to run it —
   without it the documented command dies with `MODULE_NOT_FOUND`, #355) come from
   step 5's derivation; confirm both are in `.github/scripts/` before going on.

   The template kit ships no lockfile on purpose — run `npm install`
   inside `.github/scripts/ui-tests/` to generate a fresh one **and commit it**.
   `qa.yml`'s `cache: npm` step hard-fails at `setup-node` without a committed
   `package-lock.json` (before Playwright even runs), so commit the lockfile and
   never add it to `.gitignore`. Confirm
   `playwright.config.js` resolves the live URL from the `APP_URL` variable, and
   update any project-specific selector constants in the kit's helpers,
   `tests/lib/auth.js` and `tests/lib/fixtures.js` (e.g. `IDENTIFIER_RUNGS`,
   `ADVANCE_NAME`, `BACK_OR_HOME`), to match the actual UI (the kit is generic/exploratory by default and takes the credential
   at runtime from the `TEST_AUTH_CREDENTIAL` secret or, when that is unset,
   from a login form that ships a working one in a visible, editable password
   field, so it may need no selector edits; it never reads `CLAUDE.md`). Set the
   secret only when the app's login needs a credential supplied from outside
   (`cicd-setup.md` Step 5).

8. **Pre-push verification.** Run the local gate before pushing:
   - `npm_config_legacy_peer_deps=true npx html-validate` on each HTML entry
     point that exists — none yet at bootstrap (step 4), so this runs from the
     first build onward (the env var: since vitest 5.0.5, npm 10 crashes
     resolving html-validate's optional peers without it)
   - syntax-check the Playwright scripts (`node --check` on each `.js`)
   - run the project's security grep from `global.md`
   - confirm `git status` shows only intended changes
   Fix any failure before pushing.

9. **Commit and PR.** Commit all scaffolding to the `claude/<name>`
   branch and push. **Ensure the base branch exists first:** if the repo was
   created empty (no README, so `git ls-remote --heads origin main` is empty),
   stop and ask the human to add a README on GitHub ("Add a README" on the empty
   repo's page), which creates `main`. Do not push `main` yourself: a session
   pushes only its designated `claude/` branch (`git.md` → *Repo-settings preflight*),
   and the toolkit's push gate blocks it. Once `main` exists, rebase the
   scaffolding branch onto it so the PR shows a clean diff. (Prevention: have the
   human create the repo with a README per `NEW-REPO-USER-INSTRUCTIONS.md` Step 1.)
   Then open a
   **draft** PR targeting `main` — its activity is subscribed harness-side, no
   tool call needed (`git.md` → *PR Lifecycle*). Fix
   any CI failures before marking ready — note the `UI Tests` job is **skipped
   while there's no `index.html` yet** (expected; the blocking gate is `Static
   Checks`).

10. **Report to the human.** Lead with the outcome in plain language
    (`global.md` → *Plain Language First*): the project now carries the standard,
    its CI checks every PR, and the bootstrap PR (link it) merges itself on green
    under `git.md` → *Conditional Auto-Merge on Green* — the human's approval is
    not part of that gate. Then name exactly which placeholder sections in
    `CLAUDE.md` the human fills in **after the merge**, as step 4 and the template
    say (Project name, Stack, Application Architecture, security constraints,
    coding standards); they never hold the merge. A list of created files is not
    the summary — give it only on request. The project's **look** is set later via
    `/design-intake` (or `/kickoff`, which calls it). To start a spec-driven build
    from here, point the human at **`/kickoff`** (it gathers the brief, establishes
    the look via `/design-intake`, and drives `/sdd-loop`).
