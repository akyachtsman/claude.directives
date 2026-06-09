# Scheduled jobs with email notifications

A scheduled **GitHub Actions** job that runs a Node script and emails a
notification. Transport-agnostic (any SMTP provider), DST-safe, and protected
against GitHub's 60-day scheduler auto-disable.

## Files
- `.github/workflows/<your-job>.yml`  — from `templates/workflows/cron-notify.yml`
- `.github/scripts/notify-email.js`    — SMTP helper, `require` it from your task
- `.github/scripts/package.json`       — declares `nodemailer` (run `npm install` once to generate a lockfile)
- `.github/workflows/keepalive.yml`    — keeps the schedule alive

## GitHub settings (Settings → Secrets and variables → Actions)

**Secrets** (sensitive):
| Name | Value |
|---|---|
| `SMTP_HOST` | e.g. `smtp.gmail.com` |
| `SMTP_USER` | the sending account |
| `SMTP_PASS` | app password / API key |
| `SMTP_PORT` | optional, default `587` |
| `ALERT_FROM` | optional, default = `SMTP_USER` |
| `KEEPALIVE_PAT` | PAT (fine-grained, this repo, **Contents: read/write**) |

**Variables** (non-sensitive) → *Variables* tab:
| Name | Value |
|---|---|
| `NOTIFY_MODE` | `log` (default — formats the report into the run log, no SMTP secrets needed) or `email` |
| `ALERT_TO` | recipient address (change anytime, no redeploy) |

> **Start in log mode.** `NOTIFY_MODE` defaults to `log` — the report is formatted
> into the workflow run log and **no SMTP secrets are required**. Set
> `NOTIFY_MODE=email` only when you're ready to send; the `SMTP_*` secrets (and
> `ALERT_TO`) are needed only then. Call `notify({ subject, text })` from your task
> (it routes to log or email by mode); `sendEmail(...)` is still exported for the
> always-email path.

> The task's own backend inputs (e.g. `DB_URL` / `DB_SERVICE_KEY` — see the data
> directive `data.md`) are separate and added to the workflow's `env:` block.

### Getting a Gmail / Google Workspace app password
1. Enable **2-Step Verification** (myaccount.google.com → Security).
2. Go to **myaccount.google.com/apppasswords** → create one → copy the 16-char value.
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
