# Scheduled jobs with email notifications

A scheduled **GitHub Actions** job that runs a Node script and emails a
notification. Transport-agnostic (any SMTP provider) and DST-safe. It carries
no guard against GitHub's 60-day scheduler auto-disable (public repositories
only); that limit counts inactivity, so a repo where PRs land is not at risk
(*Keep it alive* below).

A project gets this kit **when it has a scheduled task** (owner ruling,
2026-10-10): a `schedule:` workflow starts recurring work the moment it lands,
so `/new-repo` does not install it by default; add it with the task
(`docs/standards/cicd-setup.md` Step 9f). The SMTP secrets and variables are
needed only if the project sends email (NEW-REPO-USER-INSTRUCTIONS Step 1). The
shipped entry point `notify-task.js` **guards on the config and emits a GitHub
Actions notice (not a crash) if a required secret/variable is missing**, then
skips — so an unconfigured repo is obvious in the Actions log. Replace the body
of `notify-task.js` with your project's real notification.

## Files
- `.github/workflows/cron-notify.yml`  — the scheduled job, a caller of `shared-cron-notify.yml` (runs `notify-task.js`)
- `.github/scripts/notify-task.js`     — task entry point: config-guard + your notification logic

The shared workflow stages `notify-email.js` (the SMTP helper `notify-task.js`
`require`s) and its `package.json` beside the task on each run and installs
`nodemailer` there, so the project commits neither them nor a lockfile
(`docs/standards/cicd-setup.md` → 9f).

## GitHub settings (Settings → Secrets and variables → Actions)

**Secrets** (credentials only), in the **Secrets** tab:
| Name | Value |
|---|---|
| `SMTP_PASS` | app password / API key |

**Variables** (non-sensitive), in the **Variables** tab:
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

## Keep it alive
GitHub **disables scheduled workflows in a public repository after 60 days of
repository inactivity** —
inactivity, not elapsed time, so a repo where PRs land never approaches it and
needs nothing here. GitHub emails repo admins before disabling, and re-enabling
is one click.

A keepalive workflow that resets that clock is **not part of this standard** — why: `docs/standards/cicd-setup.md` → *9f — Scheduled-job notifications*.

## When the GitHub cron isn't enough
Scheduled jobs run as GitHub Actions, data-heavy and timing-sensitive ones
included (`global.md` → *Automations*; owner ruling 2026-10-12: a database
scheduler such as Supabase `pg_cron` plus an Edge Function is not an
alternative). GitHub's cron can start minutes late, so write each job to
tolerate a late or skipped start rather than moving it off Actions.
Avoid putting durable production crons on **Claude Routines**: routine runs are
capped per day, so reserve that quota for interactive/agentic work.
