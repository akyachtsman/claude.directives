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
Set **Network access** so sessions can reach what the toolkit needs. The default
**Trusted** level allows GitHub + package registries (enough to install), but it
**blocks two hosts every project here uses** — so use **Custom** (keep the default
package‑registry list checked) and add:
- `*.github.io` — so a session can fetch/verify your **live Pages site** (`/live-chk`,
  `update-pages`); without it those checks 403 from inside the session.
- `cdn.playwright.dev` — so **Playwright UI tests + screenshots run in‑session**;
  without it the browser download 403s and you can only rely on `qa-live.yml`.
- plus any sites a session must reach (e.g. `/kickoff`'s optional research scraping).

Or set network to **Full** if you'd rather not maintain a list. *(Optional: add
`npx playwright install chromium` to the setup script so the browser is preinstalled
each container once `cdn.playwright.dev` is allowed.)* Reload — now the commands appear,
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
2. **Initialize with a README** — this creates the `main` branch (the base the
   bootstrap PR targets) and is required to enable GitHub Pages. An empty repo
   has no `main`, which stalls the bootstrap; tick **"Add a README file"** when
   creating the repo.
3. Enable GitHub Pages: **Settings → Pages → Source: `main` / `root`**
4. Set repo Watch: **Watch → All Activity**
5. Add repository secrets (**Settings → Secrets and variables → Actions → Secrets**):
   - `TEST_AUTH_CREDENTIAL` — valid login credential for Playwright tests
   - `DB_SERVICE_KEY` — backend service-role key (required before the project's scheduled data workflow, if any, can run)
   - `SMTP_PASS` — SMTP app password / API key for the standard email-notification job (`cron-notify.yml`)
   - `KEEPALIVE_PAT` — fine-grained PAT (this repo, **Contents: read/write**) for `keepalive.yml`
   - Any project-specific secrets the app requires
6. Add repository variables (**Settings → Secrets and variables → Actions → Variables**):
   - `APP_URL` = `https://akyachtsman.github.io/[repo-name]/`
   - `DB_URL` — your backend project/connection URL (required before the project's scheduled data workflow, if any, can run)
   - `SMTP_HOST`, `SMTP_USER`, `ALERT_TO` — email transport for the standard notification job (`SMTP_PORT` / `ALERT_FROM` optional). Until these + `SMTP_PASS` are set, the job emits a notice and skips — see `docs/cron-email-notifications.md`

### Step 2 — Build the app
Open a Claude Code session scoped to the new repo and type:

```
/kickoff
```

That's it. `/kickoff` scaffolds the repo (running `/new-repo` for you), asks you
for the product brief, offers an optional competitive-discovery pass, then drives
the `/sdd-loop` build — answering its prompts is all you do.

*Just want a bare scaffold, no build yet? Run `/new-repo` instead — it sets up
`CLAUDE.md`, CI, and the test kit, and stops there.*

---

### Scheduled email notifications (standard)
`/new-repo` already scaffolds the email kit (`cron-notify.yml`, `keepalive.yml`,
`notify-email.js`, `notify-task.js`) into every project. You just set the secrets
and variables in Steps 5–6 above, then edit `.github/scripts/notify-task.js` to
send your project's actual notification. Until the SMTP secrets are set, the job
emits a notice and skips (no failure). Provider setup (Gmail app password, Resend,
SendGrid) is in `docs/cron-email-notifications.md`.
