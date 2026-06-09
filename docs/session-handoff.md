# Session Handoff Template

Copy this file to `.claude/session-handoff.md` in your project and fill in
project-specific values. A new Claude Code session reads this first to get
full context without loss of history.

---

## Project Overview
- **Repo:** `owner/repo-name`
- **App:** [description]
- **Live URL:** [GitHub Pages URL]
- **Branch policy:** develop on `[branch]`, PRs target `main`

---

## Current State (as of last session end)
- [What's live on main]
- [CI/CD status]
- [GitHub secrets set]

---

## Completed Work
[Running list of what has been built — updated each session]

---

## Active Automations
- Gmail monitor: [running / not running]
- PR subscriptions: [list open PRs being watched]

---

## Known Issues / Pending
[Any open work items or follow-ups]

---

## Critical Code Patterns
[Project-specific invariants agents must never violate — e.g. backend field/column usage, timezone handling, DOM safety rules]

---

## Key IDs and Config
[Project-specific: backend project ref / connection, table/column names, Pages URL, branch name]
