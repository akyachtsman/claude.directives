---
name: new.repo
description: First-time repo bootstrap — scaffold a brand-new project autonomously (fires only when CLAUDE.md does not exist yet)
trigger: slash_command_and_auto
---
Bootstrap a brand-new project repo from scratch. This runs **once**, on a repo
that has no `CLAUDE.md` yet. The human has already done the GitHub config in
`NEW-PROJECT-QUICKSTART.md` (repo, Pages, Watch, secrets, `APP_URL`); you do
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

2. **Bootstrap skills and agents.** Run the Skill Bootstrap block from
   `global.md` (the `gh api` tree walk that fetches `.claude/skills/` and
   `.claude/agents/` recursively, skipping files that already exist). If `gh api`
   is unavailable, fall back to the repo tarball:
   ```bash
   tmp=$(mktemp -d)
   curl -sL https://codeload.github.com/akyachtsman/claude.directives/tar.gz/main \
     | tar -xz -C "$tmp" --strip-components=1
   for dir in skills agents; do
     [ -d "$tmp/.claude/$dir" ] || continue
     ( cd "$tmp" && find ".claude/$dir" -type f ) | while read -r p; do
       [ -f "$p" ] && continue          # skip files that already exist
       mkdir -p "$(dirname "$p")"
       cp "$tmp/$p" "$p"
     done
   done
   rm -rf "$tmp"
   ```
   Type `my.list` to confirm skills are available before continuing.

3. **Create the feature branch.** Use the session's existing branch if it is a
   `claude/<name>` branch; otherwise create `claude/<name>`. Never work on `main`.

4. **Create `CLAUDE.md`** in the repo root from the template below. Fill in the
   repo name and live URL from context (`APP_URL` variable / repo name); leave the
   bracketed sections as placeholders for the human to complete post-merge:

   ```markdown
   # CLAUDE.md — [Project Name]

   ## Imported Directives
   https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/global.md
   https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/design.md
   https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/test.md
   https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/data.md

   ---

   ## Project Overview
   - **Project name:** [fill in]
   - **Live URL:** https://akyachtsman.github.io/[repo-name]/
   - **Stack:** [fill in]
   - **Branch policy:** Develop on a `claude/<name>` feature branch; PRs target `main`

   ## Application Architecture
   - [main source file/folder] — [brief description]

   ## Required Commands
   | Purpose | Command |
   |---|---|
   | Validate HTML | `npx html-validate index.html` |
   | Validate workflow YAML | `python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/qa.yml'))"` |

   ## Project-Specific Security Constraints
   - [List any accepted security trade-offs, e.g. client-side token usage]

   ## Project-Specific Coding Standards
   - [Add project-specific rules here]

   ## Agent Workflow
   1. Use a `claude/<name>` feature branch
   2. Implement changes in [main source file]
   3. Run Required Commands above — all must pass
   4. Prefer `qa-pipeline`; run agents individually only if it fails:
      `test-verifier` → `code-reviewer` → `security-reviewer` → `pr-readiness-reviewer`
   5. Open PR to `main`

   ## Session Start
   1. Read all Imported Directive URLs above fully
   2. Bootstrap skills and agents per the Skill Bootstrap block in global.md
   3. Confirm active branch: `git branch --show-current`
   4. Run `env.chk` and report status
   ```

5. **Install CI/CD workflows.** Copy the 4 canonical workflow files from
   `claude.directives/templates/workflows/` into `.github/workflows/`:
   - `qa.yml` — static checks + local Playwright tests
   - `qa-live.yml` — live Playwright tests against GitHub Pages
   - `ci-monitor.yml` — event-driven CI failure tracker
   - `codex-monitor.yml` — Codex PR review monitor

   ⚠️ **Fix the monitor trigger.** The template `ci-monitor.yml` ships pinned to
   this directive repo's CI name. After copying, open the project's `qa.yml`,
   read its exact `name:` value (currently `QA — Static + UI Tests`), and set
   that as the `workflow_run` → `workflows:` entry in `ci-monitor.yml`. A
   mismatch means the monitor never fires.

6. **Gitignore bootstrap-only and secret files.** Do NOT copy or commit agent
   definitions into the project repo. Ensure the project's `.gitignore` contains
   (create `.gitignore` if absent; append any missing line):
   - `.claude/agents/` — bootstrap-only; step 2 fetches them fresh from
     `claude.directives` each session, so they are never committed
   - `.claude/mcp.json` — per-repo MCP/backend config; holds connection details
     and must never be committed (see the data directive)
   - `.env` and `.env.*` — local key/secret files must never be committed

   Also install the Claude Code hooks: copy
   `claude.directives/templates/claude-settings.json` to `.claude/settings.json`
   (merge into any existing `settings.json`). This adds the `update.pages`
   reminder hook so edits to Pages-served files prompt a deploy-and-watch.

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
