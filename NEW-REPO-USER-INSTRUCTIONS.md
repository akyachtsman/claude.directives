# New Project Quickstart

## HUMAN STEPS

### Step 0 — One-time: reusable cloud environment (set up once, reuse for every repo)
`/new-repo` and the QA agents live *inside* the toolkit plugin, so the environment
must install it before a session starts. Do this **once** on a cloud environment
you reuse for every repo (setup scripts attach to the environment, not the repo).

On claude.ai → **Add environment**, paste this **one line** into its **Setup script**:
```
curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/scripts/install-toolkit.sh | bash
```
Set **Network access** to allow GitHub (plus any sites your sessions must reach,
e.g. research scraping). That's it — the script installs `directives-toolkit` and
the official `pr-review-toolkit` + `security-guidance` plugins. Thereafter just
**select this environment** when you open a session for any repo.

<details><summary>What it runs / fallback if the fetch is blocked</summary>

The one-liner runs <a href="scripts/install-toolkit.sh"><code>scripts/install-toolkit.sh</code></a>
(the single source of truth for the install set). If your network policy blocks
the fetch, open that file and paste the `claude plugin …` commands it lists
directly into the Setup script instead. CLI / desktop: run the same script (or its
commands) once locally — it persists.
</details>

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
