# New Project Quickstart

## HUMAN STEPS

### Step 0 — One-time: turn the toolkit on (you may already be done)
The commands (`/kickoff`, `/new-repo`, `/sdd-loop`) live inside a plugin, so the
plugin has to be installed before you can type them. It's "install the app once"
vs. "tap the icon every time" — Step 0 is the one-time install; the commands are
the icon. (A command can't install the plugin it lives in, so this one step can't
be folded into `/kickoff`.)

**First, just check — you probably have nothing to do:**
1. Open a session on the repo, type `/`, and look for the `directives-toolkit`
   commands (e.g. `/kickoff`).
2. **They show up** → you're done. Skip to Step 1.
3. **They don't** → do the one-time setup below, then reload.

**One-time setup (only if the check failed).** On claude.ai, open the environment
selector (the cloud icon) → **Add/Edit environment**, and paste this single line
into its **Setup script** field:
```
curl -fsSL https://raw.githubusercontent.com/akyachtsman/claude.directives/main/scripts/install-toolkit.sh | bash
```
Set **Network access** to allow GitHub (plus any sites your sessions must reach,
e.g. `/kickoff`'s optional research scraping). Reload — now the commands appear,
and **every repo you open in this environment** has them from then on.

<details><summary>What the one-liner does / fallback if the fetch is blocked</summary>

It runs <a href="scripts/install-toolkit.sh"><code>scripts/install-toolkit.sh</code></a>
(the single source of truth for the install set), which installs `directives-toolkit`
plus the official `pr-review-toolkit` + `security-guidance` plugins. If your network
policy blocks the fetch, open that file and paste the `claude plugin …` commands it
lists directly into the Setup script instead. CLI / desktop: run the same script
once locally — it persists.
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

For a full spec-driven build of a new app, run **`/kickoff`** instead — it
scaffolds (via `/new-repo` if needed), asks you for the product brief, offers an
optional competitive-discovery pass, then drives the `/sdd-loop` phases.

---

### Optional — scheduled email notifications
To add a cron job that emails alerts (e.g. a nightly report), copy
`templates/workflows/cron-notify.yml` + `templates/workflows/keepalive.yml` and
`templates/scripts/notify-email.js`, then follow `docs/cron-email-notifications.md`
to set the `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`ALERT_TO` variables, the `SMTP_PASS`
and `KEEPALIVE_PAT` secrets.
