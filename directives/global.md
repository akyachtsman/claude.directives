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
- Never deviate from the imported design directive without explicit approval
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
    ci-monitor.yml
    codex-monitor.yml
    pages-monitor.yml
  scripts/
    ui-tests/
```

## Backend
- All backend/data rules — the provider, connection config, keys, RLS, and MCP
  setup — are governed by the **data directive** (`data.md`). Read it before
  touching any backend code; it is the single source of truth for the backend.
- Never hardcode connection details or keys — store them as the GitHub
  Secrets/variables named in `data.md`.
- Project/connection IDs and table/column names are defined at project level in
  each repo's CLAUDE.md.

## Automations
- Scheduled and event-driven automations run as GitHub Actions workflows
- Claude routines handle agent-driven tasks (alerts, reports, monitors)
- No external automation platforms — logic lives in the repo, defined at project level

## GitHub Workflow
- Work happens in Claude Code sessions (web, desktop, or CLI) scoped to a repo
- Terminal and git are always available; `gh` CLI only sometimes — remote/web
  sessions often lack it (use the GitHub MCP tools, or the tarball fallback in
  Skill Bootstrap below)
- All code changes go through a `claude/<name>` branch and a PR to `main`
- Use a **fresh** `claude/<name>` branch per change, cut from updated `main`
  after each squash-merge — recycling branches tangles lineage and can attach
  the wrong diff to a PR.
- Subscribe to PR activity; fix CI before marking ready
- GitHub Pages for project web apps only

## Repository Scope
- The GitHub MCP is **hard-scoped to the repo(s) this session was opened on** —
  no reads, writes, branches, or PRs against any other repo.
- **Never offer cross-repo capability you have not verified**: confirm the
  `add_repo` / `list_repos` tools (claude-code-remote server) exist via ToolSearch
  before offering to add or act on another repo. If absent, the work must happen
  in a session scoped to that repo — say so plainly.
- Run the `scope.chk` skill at session start and whenever the session drifts
  toward another repo.

## Hosting
- GitHub Pages only
- No Vercel, no Netlify, no external hosting

## Security
- Never commit API tokens, secrets, or credentials to any repo
- Never echo secrets in workflow logs
- Security scan before every PR (canonical pattern — keep identical to the `qa.yml` / `qa-response.yml` secret-scan): `grep -rE "pat[A-Za-z0-9]{14}\.[A-Za-z0-9]{40,}|pat[A-Za-z0-9]{17}\.[a-f0-9]{64}|pat[lr]_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{20,}|xoxb-" --include="*.js" --include="*.html" --include="*.css" --include="*.json" --exclude-dir=node_modules --exclude-dir=.git .`

## Pre-Push Verification (Local Gate)
Before committing or pushing, verify locally — never rely on CI alone:
- Run the repo's full test suite, plus lint/type checks if configured.
- Check current CI status; if a run is in progress, wait for green.
- Review `git status` and the diff — no unintended changes staged.

Report the result before pushing; fix failures locally rather than on the PR.
The `commit.chk` skill is the manual backup when this auto-check did not fire.

## PR Lifecycle
- Open a draft PR as soon as a branch has a first commit
- Subscribe to PR activity via `subscribe_pr_activity` immediately after opening
- Fix all CI failures before marking ready for review
- Mark PR ready only when all checks pass
- Before merging, confirm the PR's file list is **only** what you changed. A surprise
  file count signals a stale or tangled branch — verify against GitHub's own PR diff,
  not a possibly-stale local clone (re-fetch/prune, or re-cut from `main`, if they disagree)
- Never force-push to `main`

## Async Operations
- After triggering a long-running operation (CI, deploy, dispatch), don't block
  waiting: if `send_later` exists, schedule a check-in; otherwise end the turn
  with "I'll report back when it completes" and resume on the event.
- The result must surface proactively — the user never re-prompts for an outcome.
- Any background watcher MUST set a hard timeout sized to the operation and exit
  on every terminal state (success, failure, timeout). A waiter that outlives
  what it watches is a bug.

## Escalation Rules
- Stop and ask the user if a change touches more than one file's core logic
- Stop and ask if CI has failed 3+ times on the same issue without progress
- Stop and ask before deleting any file that exists on `main`
- Stop and ask before modifying any workflow file's trigger conditions

## Session Start
At the start of every session:
1. Read this file fully and fetch all imported directive URLs.
2. Run `scope.chk` to confirm which repo(s) this session can actually act on (and
   whether other repos can be added) before promising anything cross-repo.
3. Confirm the active branch is not `main` before writing any code.
4. Review open PRs for this repo before starting new work.
5. Subscribe to active PRs via `subscribe_pr_activity`.

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
If `gh` is unavailable (common in remote/web sessions), use the tarball fallback —
the bootstrap must not silently no-op just because `gh` is missing:
```bash
tmp=$(mktemp -d)
curl -sL https://codeload.github.com/akyachtsman/claude.directives/tar.gz/main \
  | tar -xz -C "$tmp" --strip-components=1
for dir in skills agents; do
  [ -d "$tmp/.claude/$dir" ] || continue
  ( cd "$tmp" && find ".claude/$dir" -type f ) | while read -r p; do
    [ -f "$p" ] && continue            # skip files that already exist
    mkdir -p "$(dirname "$p")"
    cp "$tmp/$p" "$p"
  done
done
rm -rf "$tmp"
```
Run this silently. Skip files that already exist. **Because it skips existing files, the bootstrap never updates a skill or agent already present — to pull upstream changes into files you already have, run the `refresh.repo` skill (it re-reads the rules, overwrites skills/agents in place, flags upstream-removed orphans AND broken references to renamed/deleted upstream paths, and reports the upstream delta since the project's last sync with per-file dispositions).** Once populated, skills are invoked by typing the skill name (e.g. `my.list`, `env.chk`, `doc.comp`); agents load automatically from `.claude/agents/` (Claude Code scans it recursively — agent identity comes from the `name:` frontmatter, not the path, and `name:` values must stay unique across the whole tree). Do NOT maintain a per-skill or per-agent URL list — the directories are the source of truth. Adding a skill or agent means dropping one file into `.claude/skills/` or the right `.claude/agents/<domain>/` bucket here and nothing else changes.

See docs/automations.md for monitor setup and the automation-specific
PR-lifecycle/escalation additions.
See docs/ci-triage.md for CI and Codex failure triage rules.

## Imported Directives
These directives inherit from this file — they are downstream consumers, not overrides.
They now live alongside this file in the consolidated `claude.directives` repo:
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/design.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/test.md
https://raw.githubusercontent.com/akyachtsman/claude.directives/main/directives/data.md
