---
description: "First-time repo bootstrap — scaffold a brand-new project autonomously (fires only when CLAUDE.md does not exist yet)"
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
   `NEW-REPO-USER-INSTRUCTIONS.md` Step 0 before continuing.

3. **Create the feature branch.** Use the session's existing branch if it is a
   `claude/<name>` branch; otherwise create `claude/<name>`. Never work on `main`.

4. **Create `CLAUDE.md`** in the repo root from the canonical scaffold
   `templates/CLAUDE-template.md` in this repo — fetch it raw:
   `https://raw.githubusercontent.com/akyachtsman/claude.directives/main/templates/CLAUDE-template.md`
   Write it as `CLAUDE.md`, drop the scaffold's HTML comment, fill in the repo
   name and live URL from context (`APP_URL` variable / repo name), and leave
   the [bracketed] sections as placeholders for the human to complete
   post-merge. The project's **look is established later by `/design-intake`**
   (per `directives/design.md`) — there is no shared company theme to pick.

5. **Install CI/CD workflows.** Every project gets the **full standard set** —
   copy all eight workflow files from `claude.directives/templates/workflows/`
   into `.github/workflows/`:
   - `qa.yml` — static checks + local Playwright tests
   - `qa-live.yml` — live Playwright tests against GitHub Pages
   - `ci-monitor.yml` — event-driven CI failure tracker
   - `codex-monitor.yml` — Codex PR review monitor
   - `pages-monitor.yml` — zero-model Pages deploy monitor (verify + notify on
     every `page_build`; portable as-is, no edits needed)
   - `qa-response.yml` — `repository_dispatch` QA trigger for sessions/automations
   - `cron-notify.yml` — scheduled email-notification job (runs `notify-task.js`)
   - `keepalive.yml` — weekly commit that keeps scheduled workflows from auto-disabling

   All are drop-in — copy them verbatim, no edits. `ci-monitor.yml` is pre-wired
   to watch both QA workflows shipped alongside it (`qa.yml` and `qa-live.yml`);
   only touch its `workflows:` list if you rename their `name:` values.

   **Scheduled-job scripts.** Copy `claude.directives/templates/scripts/`
   (`notify-email.js`, `notify-task.js`, `check-contrast.js`, `package.json`) into
   `.github/scripts/`, then run `npm install` there and **commit** the generated
   `package-lock.json` (`cron-notify.yml`'s `cache:` step needs
   `.github/scripts/package-lock.json`, same policy as the Playwright kit).
   `notify-task.js` ships as a starter that emails via `notify-email.js`; it
   **guards on the SMTP config and emits a notice if it is missing**, so the
   scheduled job never crashes cryptically. The email secrets are **mandatory repo
   setup** (NEW-REPO-USER-INSTRUCTIONS Step 1); the project replaces the task body
   with its real notification. `check-contrast.js` is the WCAG guardrail `qa.yml`
   runs against `styles/tokens.css`.

   **Design starter.** Copy `claude.directives/templates/styles/` (`tokens.css`,
   `components.css`) into `styles/`. These are neutral starters that pass the
   contrast guardrail as-is; `/design-intake` replaces them with the project's
   actual look (per `directives/design.md`).

6. **Gitignore bootstrap-only and secret files.** Do NOT copy or commit agent
   definitions into the project repo. Ensure the project's `.gitignore` contains
   (create `.gitignore` if absent; append any missing line):
   - `.claude/mcp.json` — per-repo MCP/backend config; holds connection details
     and must never be committed (see the data directive)
   - `.env` and `.env.*` — local key/secret files must never be committed

   Add **only** these entries. In particular, do **not** gitignore
   `package-lock.json` — the Playwright lockfile **must be committed** (Step 7),
   and don't copy this or any other repo's `.gitignore` wholesale.

   Also copy `claude.directives/templates/claude-settings.json` to
   `.claude/settings.json` (merge into any existing one): it registers the
   claude-directives marketplace and enables the directives-toolkit plugin
   for every session on this repo. Hooks ship inside the plugin.

7. **Install the Playwright kit.** Copy `claude.directives/templates/ui-tests/`
   into `.github/scripts/ui-tests/`:
   - `playwright.config.js`
   - `tests/app.spec.js`
   - `package.json`

   Do NOT copy the template's `package-lock.json` — instead run `npm install`
   inside `.github/scripts/ui-tests/` to generate a fresh one **and commit it**.
   `qa.yml`'s `cache: npm` step hard-fails at `setup-node` without a committed
   `package-lock.json` (before Playwright even runs), so commit the lockfile and
   never add it to `.gitignore`. Confirm
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
   branch and push. **Ensure the base branch exists first:** if the repo was
   created empty (no README, so `git ls-remote --heads origin main` is empty),
   establish `main` before opening the PR — create it from an empty root commit
   (`git commit --allow-empty`) and push it, then rebase the scaffolding branch
   onto it so the PR shows a clean diff. (Prevention: have the human create the
   repo with a README per `NEW-REPO-USER-INSTRUCTIONS.md` Step 1.) Then open a
   **draft** PR targeting `main` and subscribe via `subscribe_pr_activity`. Fix
   any CI failures before marking ready — note the `UI Tests` job is **skipped
   while there's no `index.html` yet** (expected; the blocking gate is `Static
   Checks`).

10. **Report to the human.** Summarize: files/dirs created, the PR link, and
    exactly which placeholder sections in `CLAUDE.md` still need human input
    (Project name, Stack, Application Architecture, security constraints, coding
    standards) before the PR is merged. The project's **look** is set later via
    `/design-intake` (or `/kickoff`, which calls it). To start a spec-driven build
    from here, point the human at **`/kickoff`** (it gathers the brief, establishes
    the look via `/design-intake`, and drives `/sdd-loop`).
