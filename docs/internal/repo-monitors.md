# Repo Monitors — this repo's CI

This repo's own infrastructure monitors **and its self-test triage**. For the
**exported** automation standard that downstream projects inherit (email,
CI/Codex monitors, PR lifecycle, escalation, tool-use discipline, test-scenario
bootstrap), see `docs/standards/automations.md`; for the exported **project** CI triage,
see `docs/standards/ci-triage.md`.

### Infrastructure Monitors (always on, no session required)
CI and Codex monitoring runs entirely in GitHub Actions — event-driven, no session
or commit-hook involved. These must exist and be green before making any changes.

**ci-monitor.yml** — fires when `QA — Directive Validation` completes. On failure,
opens or updates a deduplicated `ci-failure` tracking issue. Uses only GITHUB_TOKEN.

**codex-monitor.yml** — fires on every Codex PR review. Adds a `codex-flagged` label
when Codex raised concerns (changes_requested or COMMENTED with inline comments).
Approving/empty reviews are ignored.

**pages-monitor.yml** — fires on every GitHub Pages build (`page_build`). Reads the
build status from the event, verifies the live URL (`https://<owner>.github.io/<repo>/`)
returns 200 with cache-busted retries, and on a problem (build errored or site not
serving) opens/updates a deduplicated `pages-deploy-failure` tracking issue; a healthy
deploy closes that issue and reports green in the job summary only. This is the
zero-model counterpart to the `update-pages` skill: the deploy already happens on push
(branch-source Pages), and this adds the verify + notify layer with no session required.
The live URL is derived generically, so the file is portable to any project as-is.

See `.github/workflows/ci-monitor.yml`, `.github/workflows/codex-monitor.yml`, and
`.github/workflows/pages-monitor.yml`.

### Activation Checklist for New Sessions
- Confirm `ci-monitor.yml`, `codex-monitor.yml`, and `pages-monitor.yml` exist; `codex-monitor` fires only on PR-review events and `pages-monitor` only on `page_build` events, so neither has a standing "green" status to check
- Subscribe to PR activity on any open PRs
- See *Self-test triage* below for `ci-failure` / `codex-flagged` handling
- Check for open `ci-failure` issues before starting new work

---

## Self-test triage

This repo's `ci-failure` issues come specifically from its **directive-validation**
CI — the `check-*.js` link / section / path validators in `qa.yml` (a downstream
project's instead come from its build / Playwright suite). The triage **steps** are
identical either way, so they aren't duplicated here: follow
`docs/standards/ci-triage.md` → *`ci-failure` issue is open* / *`codex-flagged` label on a PR*.
Repo-specific notes:

- An `internal link` or `required section` failure is this repo's own defect — fix
  it in the offending directive/doc and push.
- An `external links` failure is usually a sibling-repo or rate-limit issue — verify
  the URL before suppressing (`.github/scripts/check-links.js`, `.github/workflows/qa.yml`).

---

**Escalation:** see `directives/global.md` → *Escalation Rules* (canonical) and
`docs/standards/automations.md` → *Escalation Rules* (automation additions) — both apply here.
