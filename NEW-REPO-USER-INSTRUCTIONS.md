# New Project Quickstart

## HUMAN STEPS

### Step 0 — One-time: reusable cloud environment (set up once, reuse for every repo)
`/new-repo` and the QA agents ship *inside* the `directives-toolkit` plugin, so the
plugin must be installed **before** a session can run them. On Claude Code for the
web that install runs from the **environment setup script** — and because a setup
script is attached to the cloud *environment* (not the repo) and its result is
cached, you do this **once** and reuse the same environment for every new repo.

On claude.ai, **Add environment** (name it e.g. `directives`) and set:
- **Setup script** — installs the toolkit + official review/security plugins before
  each session launches (cached after the first run, so it isn't re-run every
  session):
  ```
  claude plugin marketplace add akyachtsman/claude.directives && claude plugin marketplace add anthropics/claude-plugins-official && claude plugin install directives-toolkit@claude-directives && claude plugin install pr-review-toolkit@claude-plugins-official && claude plugin install security-guidance@claude-plugins-official
  ```
  (`pr-review-toolkit` supplies the official code-review agents the QA pipeline
  routes to; `security-guidance` adds Anthropic's security hooks — needs Python
  3.8+, which standard web containers have. **Both** `marketplace add` lines are
  required: `anthropics/claude-plugins-official` isn't registered at boot, so
  installing from it without adding it first fails with *"Plugin not found in
  marketplace"* and only `directives-toolkit` lands.)
- **Network access** — *Trusted* covers the toolkit install; pick a broader policy
  if your sessions need outbound web access (e.g. competitive-research scraping).

Thereafter just **select this environment** when you open a session for any repo —
no re-paste. (CLI / desktop instead: one-time `/plugin marketplace add akyachtsman/claude.directives`
+ `/plugin install directives-toolkit@claude-directives` and the two
`@claude-plugins-official` plugins, which persist locally.)

### Step 1 — Create and configure the GitHub repo (per repo)
1. Create a new **public** repo under `akyachtsman`
2. Initialize with a README (required to enable GitHub Pages)
3. Enable GitHub Pages: **Settings → Pages → Source: `main` / `root`**
4. Set repo Watch: **Watch → All Activity**
5. Add repository secrets (**Settings → Secrets and variables → Actions → Secrets**):
   - `TEST_AUTH_CREDENTIAL` — valid login credential for Playwright tests
   - `DB_SERVICE_KEY` — backend service-role key (required before the project's scheduled data workflow, if any, can run)
   - Any project-specific secrets the app requires
6. Add repository variables (**Settings → Secrets and variables → Actions → Variables**):
   - `APP_URL` = `https://akyachtsman.github.io/[repo-name]/`
   - `DB_URL` — your backend project/connection URL (required before the project's scheduled data workflow, if any, can run)

### Step 2 — Bootstrap the project
Open a Claude Code session scoped to the new repo — **with the `directives`
environment from Step 0 selected** — and type:

```
/new-repo
```

That's it. Claude handles everything else autonomously.

For a full spec-driven build of a new app, instead paste a filled-in copy of
`templates/project-kickoff.md` as your first message — it includes the `/new-repo`
step and then drives the `/sdd-loop` phases from your PRODUCT BRIEF.

---

### Optional — scheduled email notifications
To add a cron job that emails alerts (e.g. a nightly report), copy
`templates/workflows/cron-notify.yml` + `templates/workflows/keepalive.yml` and
`templates/scripts/notify-email.js`, then follow `docs/cron-email-notifications.md`
to set the `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`ALERT_TO` variables, the `SMTP_PASS`
and `KEEPALIVE_PAT` secrets.
