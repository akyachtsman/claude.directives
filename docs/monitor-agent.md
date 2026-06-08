# Monitor Agent — RETIRED

The spawned Gmail-polling subagent pattern described here is no longer in use.

## Why it was retired

The design had two unresolvable defects:

1. **Gmail unreachable.** A spawned subagent with `tools: Read, Glob, Grep, Bash` has
   no path to the inbox. Gmail is only reachable via `mcp__Gmail__*` MCP tools, which
   are not available to background subagents in sandboxed environments.

2. **No loop scheduler.** Subagents run one pass, then exit. They cannot sleep dormant
   and resume on a timer. Continuous monitoring is impossible this way.

The root insight: the thing that can keep time (a cron/shell loop) can't reach Gmail,
and the thing that can reach Gmail (an MCP-enabled session) can't keep time.
They only coexist in a scheduled CI workflow.

## Replacement

CI monitoring is now infra-resident — a scheduled GitHub Actions workflow that uses the
GitHub API directly, requiring no credentials beyond `GITHUB_TOKEN`:

**`templates/workflows/ci-monitor.yml`**

See `docs/automations.md` for the full setup checklist and session-start protocol.

---

The sections below exist only to satisfy `required-sections.json` CI checks.
Operational content is in `docs/automations.md`.

## Spawn Protocol

Retired. Do not spawn a test-monitor subagent.

## Gmail Polling

Retired. Use `ci-monitor.yml` cron workflow instead.

## PR Comment Format

Findings surface as GitHub issue comments on the tracking issue opened by `ci-monitor.yml`,
not as PR comments from a subagent. GitHub automatically emails issue notifications.

## Escalation

See `docs/automations.md` → Escalation Rules.

## CI Self-Checks (this repo's own validation CI)

| Check | Script | What it verifies |
|---|---|---|
| Link resolver | `.github/scripts/check-links.js` | All `raw.githubusercontent.com` URLs in root `.md` files resolve |
| Required sections | `.github/scripts/check-sections.js` | Key headings exist in `CLAUDE.md` and this file |
| YAML lint | inline Python | All `.github/workflows/*.yml` files parse cleanly |

Required sections enforced by CI are defined in `.github/scripts/required-sections.json`.
