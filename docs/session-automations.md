## Session Automations

### Infrastructure Monitors (always on, no session required)
CI and Codex monitoring runs entirely in GitHub Actions — event-driven, no session
or commit-hook involved. These must exist and be green before making any changes.

**ci-monitor.yml** — fires when `QA — Directive Validation` completes. On failure,
opens or updates a deduplicated `ci-failure` tracking issue. Uses only GITHUB_TOKEN.

**codex-monitor.yml** — fires on every Codex PR review. Adds a `codex-flagged` label
when Codex raised concerns (changes_requested or COMMENTED with inline comments).
Approving/empty reviews are ignored.

See `.github/workflows/ci-monitor.yml` and `.github/workflows/codex-monitor.yml`.

### Activation Checklist for New Sessions
- Confirm `ci-monitor.yml` and `codex-monitor.yml` exist; `codex-monitor` fires only on PR-review events, so it has no standing "green" status to check
- Subscribe to PR activity on any open PRs
- Read `docs/ci-triage.md` for triage rules
- Check for open `ci-failure` issues before starting new work

---

### Bootstrap Step — Identify Project-Specific Test Scenarios

Before writing any application code, identify which UI features or data behaviors
are not covered by the 8 generic Playwright scenarios (S1–S8) and document them
in CLAUDE.md under a new section:

```markdown
## Project-Specific Test Scenarios
| # | Feature | What to verify | Failure indicator |
|---|---|---|---|
| S9 | [feature name] | [what correct behavior looks like] | [what broken looks like] |
```

Rules for identifying gaps:
- Any feature that groups, filters, or transforms backend data before display
- Any feature where a silent fallback exists (e.g. "Other", empty state, default value)
  that would hide a broken data fetch
- Any feature where layout or structure depends on data shape (grids, sections, cards)
- Any multi-step interaction beyond a single task toggle

This table becomes the input to the ui-tester agent when adding S9+ scenarios
to app.spec.js. If the table is empty, the agent must explicitly confirm that
S1–S8 fully cover the app's critical paths before proceeding.

---

## Escalation Rules

Only escalate to the human when:
1. Fix requires a secret or credential not available in the session
2. Fix would require destructive data operations (delete records, drop fields)
3. Same failure has recurred 3 or more times with different fixes attempted
4. Root cause is diagnostically ambiguous after reading all available logs
5. The triggering message is from a human, not an automated system

Keywords that always escalate:
- Production data loss or deletion
- Authentication or secret rotation required
- Billing or quota alerts
- Any message from a human (not an automated system)

---

## Tool Use Discipline

### Avoid re-querying stale cached results
When checking whether an action has taken effect (workflow run, deployment,
PR status), always compare timestamps before querying:
1. Note the timestamp of the triggering event
2. Check whether the most recent result is newer than that timestamp
3. If nothing is newer — act immediately, do not re-query the same data
4. Never run the same query repeatedly hoping for a different result

### Acting on missing state
If an expected workflow run, deployment, or status does not exist:
- Do not attempt to find it through repeated queries
- Trigger or initiate it directly
- One check, one action — move on
