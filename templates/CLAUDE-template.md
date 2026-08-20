# CLAUDE.md — [Project Name]

<!-- Canonical project CLAUDE.md scaffold. `/new-repo` copies this file to the
     new repo root as CLAUDE.md, fills in repo name + live URL from context,
     and leaves the [bracketed] sections for the human to complete post-merge. -->

## Imported Directives
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/global.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/git.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/design.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/test.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/data.md

---

## Project Overview
- **Project name:** [fill in]
- **Live URL:** https://akyachtsman.github.io/[repo-name]/
- **Stack:** [fill in]
- **Branch policy:** Develop on a `claude/<name>` feature branch; PRs target `main`

## Design
This project's look is its own — established at kickoff via `/design-intake`
(per `directives/design.md`), not a shared company theme. It lives in:
- `styles/tokens.css` — brand primitives (color, type, spacing, radius, shadow)
- `styles/components.css` — reusable components
- **Reference page:** `[set at /design-intake]`

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
2. For a non-trivial feature, run `/sdd-loop` (`specify` → `plan` → `implement`) before coding — separate WHAT from HOW; trivial changes skip to step 3
3. Implement changes in [main source file] — or `/sdd-loop plan` then `/sdd-loop implement` to settle the approach and work its task list
4. Run Required Commands above — all must pass
5. Prefer `qa-pipeline`; run steps individually only if it fails:
   `test-verifier` → `pr-review-toolkit:code-reviewer` → `/security-review` (if security-relevant) → `pr-readiness-reviewer`
6. Open PR to `main`

## UI Test Configuration
Read by `ui-tester` and the Playwright kit at runtime — fill in before invoking agents:
| Key | Value |
|---|---|
| App URL | `https://akyachtsman.github.io/[repo-name]/` |
| Valid test credential | `[a real read-only TEST_AUTH_CREDENTIAL]` |
| Invalid test credential | `[any value the app rejects]` |
| Primary nav button | `[label of the first feature button]` |
| Primary content selector | `[CSS selector for loaded content, e.g. .task]` |
| Nav cards | `[top-level menu labels, e.g. ['Morning','Evening','Dashboard']]` |
| Playwright test directory | `.github/scripts/ui-tests` |
| Key selectors | `[login / home / error element selectors]` |

## Project-Specific Test Scenarios
Authoritative list of coverage beyond the generic S1–S4 suite — the ui-tester
adds one `app.spec.js` scenario per row, numbered from S5. Fill in before
invoking agents (the ui-tester stops and asks if this table is missing).
| # | Feature | What to verify | Failure indicator |
|---|---|---|---|
| S5 | [feature name] | [what correct behavior looks like] | [what broken looks like] |

## Reporting Requirements
Agents write evidence to `.agent-reports/`:
- `implementation-summary.md`, `test-report.md`, `ui-test-report.md`
- `playwright-results.json`, `screenshots/` (on failure — and for every new
  interaction, before/during/after at 1440×900 on passing runs too, per
  `test.md` → *Layered UI*)
- `code-review-report.md`, `test-coverage-report.md`, `security-review-report.md`, `pr-readiness-report.md`

## Safety Rules for Agents
- Reviewer agents must not edit code unless explicitly instructed.
- Test commands must not require production credentials.
- Destructive commands, data resets, migrations, or deploys require explicit approval.
- If a check can't run locally, explain why and name the closest substitute.

## Scheduling Permissions
Per `global.md` → *Scheduling Tools Never Prompt*: this repo's committed
`.claude/settings.json` carries the six-tool scheduling allowlist under both
server-name spellings, installed verbatim from `claude.directives`'
`templates/claude-settings.json` at bootstrap. Riskier remote tools — attaching
repos, creating or archiving sessions — must keep prompting. Do not hand-edit
the list here; copy it from the template so the two cannot drift.

## Session Start
1. Read all Imported Directive URLs above fully
2. Verify the directives-toolkit plugin attached (commands/agents resolve) per global.md → Skill Bootstrap
3. Confirm active branch: `git branch --show-current`
4. Run `/env-chk` and report status
