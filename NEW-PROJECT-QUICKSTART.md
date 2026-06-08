# New Project Quickstart

## HUMAN STEPS

### Step 1 — Create and configure the GitHub repo
1. Create a new **public** repo under `akyachtsman`
2. Initialize with a README ✓ (required to enable GitHub Pages)
3. Enable GitHub Pages: **Settings → Pages → Source: `main` / `root`**
4. Set repo Watch: **Watch → All Activity** (top-right on the repo page)
5. Add repository secrets (**Settings → Secrets and variables → Actions → Secrets**):
   - `TEST_AUTH_CREDENTIAL` — valid login credential for Playwright tests
   - Any project-specific secrets the app requires (e.g. `AIRTABLE_API_KEY`)
6. Add repository variable (**Settings → Secrets and variables → Actions → Variables**):
   - `APP_URL` = `https://akyachtsman.github.io/[repo-name]/`

### Step 2 — Start a Claude Code session

#### New project
Open a new Claude Code session scoped to your new repo, then paste:

---

> Bootstrap this project using NEW-PROJECT-QUICKSTART.md from claude.directives:
> https://raw.githubusercontent.com/akyachtsman/claude.directives/main/NEW-PROJECT-QUICKSTART.md
>
> Project details:
> - Stack: Vanilla HTML/CSS/JS
> - App type: Static web app
> - Main source file/folder: index.html
>
> Complete all Claude Steps autonomously.

---

#### Existing project (first session)
Open a new Claude Code session scoped to your repo, then paste:

---

> Read CLAUDE.md and all imported directive URLs fully before starting work.
> Then run `env.chk` to confirm the environment is ready.

---

## CLAUDE CODE STEPS

*Claude executes these autonomously after receiving the kickoff prompt above.*

> **Re-run safety:** These steps are first-run scaffolding and must be re-run
> safe. Before each step, check whether the target already exists; if so, skip
> creation and verify instead. Never overwrite an existing `CLAUDE.md`, workflow,
> agent, or test file during bootstrap.

### Step 3 — Fetch and internalize all directives

Fetch all three directive files and read them fully before proceeding:
- `https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/global.md`
- `https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/design.md`
- `https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/test.md`

### Step 4 — Bootstrap personal skills

If `.claude/skills/` is not populated, fetch skill files now per the
Skill Bootstrap section of `directives/global.md`. Type `my.list` to confirm
skills are available before proceeding.

### Step 5 — Create the dev branch and scaffold CLAUDE.md

1. If `CLAUDE.md` already exists, skip this step.
2. Use the session's existing branch, or create `claude/<name>` if none.
3. Create `CLAUDE.md` in the repo root:

```markdown
# CLAUDE.md — [Project Name]

## Imported Directives
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/global.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/design.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/test.md

---

## Project Overview
- **Project name:** [from kickoff]
- **Live URL:** https://akyachtsman.github.io/[repo-name]/
- **Stack:** [from kickoff]
- **Branch policy:** Develop on a `claude/<name>` feature branch; PRs target `main`

## Application Architecture
- [main source file/folder] — [brief description from kickoff]

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
```

### Step 6 — Install CI/CD workflows

Copy the canonical workflow files from `claude.directives/templates/workflows/` into `.github/workflows/`:
- `qa.yml` — static checks + local Playwright tests
- `qa-live.yml` — live Playwright tests against GitHub Pages
- `ci-monitor.yml` — event-driven CI failure tracker
- `codex-monitor.yml` — Codex PR review monitor

Copy agent definitions from `claude.directives/templates/agents/` into `.claude/agents/`. Skip any that exist.

⚠️ After copying `ci-monitor.yml`: open `qa.yml` and copy its exact `name:` value into the `workflow_run` trigger's `workflows:` list. A mismatch means the monitor never fires.

### Step 7 — Install the Playwright test suite

Skip any file that already exists; only run `npm install` if `node_modules` is absent.

Copy the standard UI test kit from `claude.directives/templates/ui-tests/` into `.github/scripts/ui-tests/`:
- `playwright.config.js`
- `tests/app.spec.js`
- `package.json`

Do NOT copy `package-lock.json` — run `npm install` inside `.github/scripts/ui-tests/` to generate a fresh one for this project.

Confirm `playwright.config.js` resolves the live URL from the `APP_URL` variable.

Update `app.spec.js` constants (`PRIMARY_NAV_BTN`, `PRIMARY_CONTENT`) to match the project's actual UI.

### Step 8 — Open a PR and verify CI passes

1. Run `commit.chk` before pushing — confirm tests, lint, and no unintended changes
2. Commit all scaffolding to the `claude/<name>` branch
3. Open a draft PR targeting `main` and subscribe via `subscribe_pr_activity`
4. Fix any Static Checks failures before marking ready
5. Merge PR to `main`
6. After Pages deploys, trigger `qa-live.yml` if it doesn't run automatically within 2 minutes
7. The 4 generic scenarios (S1–S4) plus any project-specific scenarios (S5+) you added must pass against the live URL.
8. Run `env.chk` as a final readiness confirmation
9. Report final status to the human
