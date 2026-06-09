# Claude Global Directives

## Purpose
This repo is the company-wide agent behavior standard.
It is imported by all project repos via raw GitHub URL.
All rules here apply to every Claude Code session across
every project unless explicitly overridden at repo level.

## Identity
- Owner: akyachtsman
- Email: akyachtsman@gmail.com
- GitHub: https://github.com/akyachtsman

## Behavior Rules
- Always read CLAUDE.md and any imported directive URLs before starting any task
- Always confirm understanding before writing code
- Ask clarifying questions if requirements are ambiguous
- Never deviate from the imported design directive without explicit approval
- Prefer simple solutions over complex ones
- No frameworks, no npm, no build steps unless explicitly asked
- Plain HTML + JS is the default stack
- All code must work on iPad Safari
- Use `textContent` for all DOM text insertion — never `innerHTML` with data from any backend or user input

## Repo Structure Standard
Every project repo should contain:
```
CLAUDE.md        ← project context + imported directive URLs
index.html       ← complete single-page app
.github/
  workflows/
    qa.yml
    qa-live.yml
  scripts/
  ui-tests/
```

## Airtable
- Always use REST API directly — no SDK
- Always include `returnFieldsByFieldId=true` in all list/filter calls
- Never hardcode tokens — store as `AIRTABLE_API_KEY` in GitHub Secrets
- Base IDs and table IDs are defined at project level in each repo's CLAUDE.md

## Automations
- Scheduled and event-driven automations run as GitHub Actions workflows
- Claude routines handle agent-driven tasks (alerts, reports, monitors)
- No external automation platforms — logic lives in the repo, defined at project level

## GitHub Workflow
- Work happens in Claude Code sessions (web, desktop, or CLI) scoped to a repo
- Full terminal, git, and `gh` CLI are available — use them
- All code changes go through a `claude/<name>` branch and a PR to `main`
- Subscribe to PR activity; fix CI before marking ready
- GitHub Pages for project web apps only

## Repository Scope
- The GitHub MCP is **hard-scoped to the repo(s) this session was opened on.** You
  cannot read, write, branch, or open PRs against any other repo from here.
- **Before offering to add, reach, or act on a _different_ repo, first confirm the
  `add_repo` / `list_repos` tools (claude-code-remote server) actually exist in
  this session (check via ToolSearch).** Never offer cross-repo capability you have
  not verified — in many sessions those tools are absent and another repo simply
  cannot be brought in. Do not assume the generic "you can add repos" docs apply.
- If you cannot reach a repo, say so plainly and note the work must happen in a
  session scoped to that repo — don't offer to "add" it. Conversely, don't declare
  a repo inaccessible without checking `list_repos` first when that tool exists.

## Hosting
- GitHub Pages only
- No Vercel, no Netlify, no external hosting

## Security
- Never commit API tokens, secrets, or credentials to any repo
- Never echo secrets in workflow logs
- Security scan before every PR: `grep -rE "pat[A-Za-z0-9]{14}\.[A-Za-z0-9]{40,}|xoxb-|pat[A-Za-z0-9]{17}\.[a-f0-9]{64}" --include="*.js" --include="*.html" .`

## Pre-Push Verification (Local Gate)
Before committing or pushing to any branch, verify locally — do not rely on
CI alone to catch failures:
- Run the repo's full test suite.
- Run lint and type checks if configured.
- Check current CI/Actions status; if a run is in progress, wait for green.
- Confirm no unintended uncommitted changes were introduced (review `git status`
  and the diff before staging).

Report the verification result before opening a PR or pushing. If any check
fails, fix it before pushing rather than pushing and fixing on the PR.

This is the canonical local gate. The `commit.chk` skill is a manual backup
that runs the same checks on demand when this auto-check did not fire.

## PR Lifecycle
- Open a draft PR as soon as a branch has a first commit
- Subscribe to PR activity via `subscribe_pr_activity` immediately after opening
- Fix all CI failures before marking ready for review
- Mark PR ready only when all checks pass
- Never force-push to `main`

## Async Operations
- After triggering any long-running async operation (CI run, workflow dispatch,
  deployment), never block on a `sleep` loop waiting for results.
- If `send_later` is available, schedule a follow-up check-in to re-poll the
  result when it should be ready.
- Otherwise, end the turn and explicitly tell the user "I'll report back when it
  completes," then resume when the result arrives (e.g. via a webhook/subscription
  event) rather than polling in a blocking loop.
- The goal is that the result surfaces proactively — the user should never have to
  re-prompt to learn the outcome.
- **Never spawn an unbounded background "wait for X" task.** A backgrounded poll
  (Bash `run_in_background` / Monitor with a `sleep`/`until` loop, e.g. "wait for
  the qa-live run") is still a blocking wait — it just hides in the background, and
  with no cap it can run for *hours*. Any background watcher MUST set a hard
  `timeout` (minutes, sized to the operation's expected duration — not hours) and
  exit on **every** terminal state: success, failure, AND timeout. A waiter that
  outlives the operation it watches is a bug. When in doubt, end the turn and
  resume on the event instead of polling.

## Escalation Rules
- Stop and ask the user if a change touches more than one file's core logic
- Stop and ask if CI has failed 3+ times on the same issue without progress
- Stop and ask before deleting any file that exists on `main`
- Stop and ask before modifying any workflow file's trigger conditions

## Session Start
At the start of every session:
1. Read this file fully and fetch all imported directive URLs.
2. Confirm the active branch is not `main` before writing any code.
3. Review open PRs for this repo before starting new work.
4. Subscribe to active PRs via `subscribe_pr_activity`.

## Skill Bootstrap

At session start, bootstrap personal skills **and agents** from this repo using
the `gh` CLI. Agents are organized into purpose-based subfolders (e.g. `qa/`, `data/`), so
this walks the tree recursively and preserves the subdirectory layout:
```bash
for dir in skills agents; do
  gh api "repos/akyachtsman/claude.directives/git/trees/main?recursive=1" \
    --jq ".tree[] | select(.type==\"blob\" and (.path|startswith(\".claude/$dir/\"))) | .path" \
  | while read -r p; do
    [ -f "$p" ] && continue            # skip files that already exist
    mkdir -p "$(dirname "$p")"
    gh api "repos/akyachtsman/claude.directives/contents/$p" --jq '.content' | base64 -d > "$p"
  done
done
```
Run this silently. Skip files that already exist. Once populated, skills are invoked by typing the skill name (e.g. `my.list`, `env.chk`, `doc.comp`); agents load automatically from `.claude/agents/` (Claude Code scans it recursively — agent identity comes from the `name:` frontmatter, not the path, and `name:` values must stay unique across the whole tree). Do NOT maintain a per-skill or per-agent URL list — the directories are the source of truth. Adding a skill or agent means dropping one file into `.claude/skills/` or the right `.claude/agents/<domain>/` bucket here and nothing else changes.

See docs/session-automations.md for monitor setup, escalation rules, and tool use discipline.
See docs/ci-triage.md for CI and Codex failure triage rules.

## Imported Directives
These directives inherit from this file — they are downstream consumers, not overrides.
They now live alongside this file in the consolidated `claude.directives` repo:
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/design.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/test.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/data.md
