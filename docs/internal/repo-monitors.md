# Repo Monitors — this repo's CI

This repo's own CI **and its self-test triage**. For the **exported** automation
standard that downstream projects inherit, see `docs/standards/automations.md`;
for the exported **project** CI triage, see `docs/standards/ci-triage.md`.

This repo runs one workflow, `qa.yml` (`QA — Directive Validation`). A red run
reaches a subscribed session as a native PR event, and GitHub emails the run's
actor.

---

## Self-test triage

A red QA run here comes from this repo's **directive-validation** CI — the
`check-*.js` link / section / path validators in `qa.yml` (a downstream project's
instead comes from its build / Playwright suite). Repo-specific notes:

- An `internal link` or `required section` failure is this repo's own defect — fix
  it in the offending directive/doc and push.
- An `external links` failure is usually a sibling-repo or rate-limit issue — verify
  the URL before suppressing (`.github/scripts/check-links.js`, `.github/workflows/qa.yml`).

---

**Escalation:** see `directives/global.md` → *Escalation Rules*, which also carries the automation triggers.
