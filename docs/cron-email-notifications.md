# Scheduled jobs with email notifications

A scheduled **GitHub Actions** job that runs a Node script and emails a
notification. Transport-agnostic (any SMTP provider), DST-safe, and protected
against GitHub's 60-day scheduler auto-disable.

`/new-repo` scaffolds this kit into **every** project as standard, and the SMTP
secrets are **mandatory repo setup** (NEW-REPO-USER-INSTRUCTIONS Step 1). The
shipped entry point `notify-task.js` **guards on the config and emits a GitHub
Actions notice (not a crash) if a required secret/variable is missing**, then
skips — so an unconfigured repo is obvious in the Actions log. Replace the body
of `notify-task.js` with your project's real notification.

## Files
- `.github/workflows/cron-notify.yml`  — the scheduled job (runs `notify-task.js`)
- `.github/scripts/notify-task.js`     — task entry point: config-guard + your notification logic
- `.github/scripts/notify-email.js`    — SMTP helper, `require`d by `notify-task.js`
- `.github/scripts/package.json`       — declares `nodemailer` (run `npm install` once to generate a lockfile)
- `.github/workflows/keepalive.yml`    — keeps the schedule alive

## GitHub settings (Settings → Secrets and variables → Actions)

**Secrets** (credentials only) → *Secrets* tab:
| Name | Value |
|---|---|
| `SMTP_PASS` | app password / API key |
| `KEEPALIVE_PAT` | PAT (fine-grained, this repo, **Contents: read/write**) |

**Variables** (non-sensitive) → *Variables* tab:
| Name | Value |
|---|---|
| `SMTP_HOST` | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | optional, default `587` |
| `SMTP_USER` | the sending account |
| `ALERT_FROM` | optional, default = `SMTP_USER` |
| `ALERT_TO` | recipient address; defaults to `SMTP_USER` (change anytime, no redeploy) |

> Only the **credential** (`SMTP_PASS`) is a Secret — host, port, user, and the
> alert addresses are non-sensitive, so they live in *Variables* where they stay
> editable without a redeploy. **On a public repo, never put a credential
> (`SMTP_PASS`, any key or PAT) in a Variable — Variables are world-readable.**

> The task's own backend inputs are separate, added to the workflow's `env:`
> block: `DB_URL` is a **Variable**, `DB_SERVICE_KEY` is a **Secret** (see the
> data directive `data.md`).

### Getting a Gmail / Google Workspace app password
1. Enable **2-Step Verification** (myaccount.google.com → Security).
2. Go to **myaccount.google.com/apppasswords** → create one → copy the 16-char value.
   **It is shown once and cannot be retrieved later** — if you lose it, delete that
   app password and generate a new one.
3. Enter it as `SMTP_PASS` **without spaces**. Set `SMTP_HOST=smtp.gmail.com`,
   `SMTP_PORT=587`, `SMTP_USER`=your address, `ALERT_FROM`=same address (Gmail
   forces From = the signed-in account).
- If Workspace admin has disabled app passwords, use a provider instead:
  **Resend** (`smtp.resend.com`, user `resend`, pass = API key) or
  **SendGrid** (`smtp.sendgrid.net`, user `apikey`, pass = API key) — needs domain DNS verification.

## Scheduling
- `cron:` is **UTC-only** and **best-effort** (can run minutes late).
- **DST-safe local time:** use two UTC crons bracketing the offset + the in-script
  time-guard. Example for 11:55pm America/Los_Angeles (UTC-7 in DST, UTC-8 in standard):
  ```yaml
  schedule:
    - cron: '55 6 * * *'   # 11:55pm PDT
    - cron: '55 7 * * *'   # 11:55pm PST
  ```
  Then guard in the task so it only ACTS during the intended local window (fires
  once/day year-round):
  ```js
  function localHM(tz) {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(new Date());
    return { hour: Number(p.find(x => x.type === 'hour').value) % 24, minute: Number(p.find(x => x.type === 'minute').value) };
  }
  if (process.env.FORCE !== 'true') {
    const { hour, minute } = localHM('America/Los_Angeles');
    if (!(hour === 23 && minute >= 50)) { console.log('Outside target window; exiting.'); process.exit(0); }
  }
  ```

## Keep it alive (important)
GitHub **disables scheduled workflows after 60 days of no commits**. `keepalive.yml`
makes a weekly empty commit (via `KEEPALIVE_PAT`) to reset that clock for all crons.
GitHub also emails repo admins before disabling — a one-click re-enable is the fallback.

## When the GitHub cron isn't enough
If timing must be exact or the job is data-heavy, move it to the **data tier** —
your database's native scheduler plus a serverless function (e.g. Supabase
`pg_cron` + an Edge Function) — for exact timing and no inactivity rule.
Avoid putting durable production crons on **Claude Routines**: routine runs are
capped per day, so reserve that quota for interactive/agentic work.
