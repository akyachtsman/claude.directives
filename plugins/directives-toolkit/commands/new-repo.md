---
description: "First-time repo bootstrap — scaffold a brand-new project autonomously (fires only when CLAUDE.md does not exist yet)"
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

1. **Fetch and internalize all four directives.** Read each fully before
   proceeding:
   - `https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/global.md`
   - `https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/design.md`
   - `https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/test.md`
   - `https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/data.md`

2. **Verify the directives-toolkit plugin attached** (it carries this very
   command, all skills, the QA/data agents, and the guard hooks). If its
   commands don't resolve, the environment's setup script didn't run the
   install — stop and have the human fix the environment per
   `NEW-REPO-USER-INSTRUCTIONS.md` step 7 before continuing.

3. **Create the feature branch.** Use the session's existing branch if it is a
   `claude/<name>` branch; otherwise create `claude/<name>`. Never work on `main`.

4. **Create `CLAUDE.md`** in the repo root from the canonical scaffold
   `templates/CLAUDE-template.md` in this repo — fetch it raw:
   `https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/CLAUDE-template.md`
   Write it as `CLAUDE.md`, drop the scaffold's HTML comment, fill in the repo
   name and live URL from context (`APP_URL` variable / repo name), and leave
   the [bracketed] sections as placeholders for the human to complete
   post-merge.

5. **Install CI/CD workflows.** Copy the 5 canonical workflow files from
   `claude.directives/templates/workflows/` into `.github/workflows/`:
   - `qa.yml` — static checks + local Playwright tests
   - `qa-live.yml` — live Playwright tests against GitHub Pages
   - `ci-monitor.yml` — event-driven CI failure tracker
   - `codex-monitor.yml` — Codex PR review monitor
   - `pages-monitor.yml` — zero-model Pages deploy monitor (verify + notify on
     every `page_build`; portable as-is, no edits needed)

   All five are drop-in — copy them verbatim, no edits. `ci-monitor.yml` is
   pre-wired to watch both QA workflows shipped alongside it (`qa.yml` and
   `qa-live.yml`); only touch its `workflows:` list if you rename their
   `name:` values.

   Optional — **event-driven QA dispatch**: copy `qa-response.yml` too if
   sessions/automations should be able to trigger QA via `repository_dispatch`.

   Optional — **scheduled email notifications**: if the project needs a cron job
   that emails alerts, also copy `cron-notify.yml` + `keepalive.yml` from
   `templates/workflows/` and `templates/scripts/notify-email.js`, then follow
   `docs/cron-email-notifications.md` (SMTP host/port/user + `ALERT_TO` variables;
   `SMTP_PASS` + `KEEPALIVE_PAT` secrets).

6. **Gitignore bootstrap-only and secret files.** Do NOT copy or commit agent
   definitions into the project repo. Ensure the project's `.gitignore` contains
   (create `.gitignore` if absent; append any missing line):
   - `.claude/mcp.json` — per-repo MCP/backend config; holds connection details
     and must never be committed (see the data directive)
   - `.env` and `.env.*` — local key/secret files must never be committed

   Also copy `claude.directives/templates/claude-settings.json` to
   `.claude/settings.json` (merge into any existing one): it registers the
   claude-directives marketplace and enables the directives-toolkit plugin
   for every session on this repo. Hooks ship inside the plugin.

7. **Install the Playwright kit.** Copy `claude.directives/templates/ui-tests/`
   into `.github/scripts/ui-tests/`:
   - `playwright.config.js`
   - `tests/app.spec.js`
   - `package.json`

   Do NOT copy `package-lock.json` — run `npm install` inside
   `.github/scripts/ui-tests/` to generate a fresh one. Confirm
   `playwright.config.js` resolves the live URL from the `APP_URL` variable, and
   update any project-specific selector constants in `app.spec.js` to match the
   actual UI (the kit is generic/exploratory by default and reads the credential
   from `CLAUDE.md` at runtime, so it may need no selector edits).

8. **Pre-push verification.** Run the local gate before pushing:
   - `npx html-validate index.html` (and any other HTML entry points)
   - syntax-check the Playwright scripts (`node --check` on each `.js`)
   - validate every workflow's YAML
     (`python3 -c "import yaml; yaml.safe_load(open('.github/workflows/<file>'))"`)
   - run the project's security grep from `global.md`
   - confirm `git status` shows only intended changes
   Fix any failure before pushing.

9. **Commit, PR, subscribe.** Commit all scaffolding to the `claude/<name>`
   branch, push, open a **draft** PR targeting `main`, and subscribe via
   `subscribe_pr_activity`. Fix any CI failures before marking ready.

10. **Report to the human.** Summarize: files/dirs created, the PR link, and
    exactly which placeholder sections in `CLAUDE.md` still need human input
    (Project name, Stack, Application Architecture, security constraints, coding
    standards) before the PR is merged.
