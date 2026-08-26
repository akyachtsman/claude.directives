# New Project Quickstart

> This doc gets a project **started**. Once it's running, the ongoing runbook —
> how upstream changes propagate, when to re-save environments, `/refresh-repo`,
> the downstream-finding loop — is `MAINTAIN-REPO-USER-INSTRUCTIONS.md`.

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
- `*.github.io` — so a session can fetch/verify your **live Pages site**
  (`update-pages`, the `/env-chk` deploy check); without it those checks 403 from inside the session.
- `cdn.playwright.dev` — so **Playwright UI tests + screenshots run in‑session**;
  without it the browser download 403s and you can only rely on `qa-live.yml`.
- plus any sites a session must reach (e.g. `/kickoff`'s optional research scraping).

Or set network to **Full** if you'd rather not maintain a list. *(Optional: add
`npx playwright install chromium` to the setup script so the browser is preinstalled
each container once `cdn.playwright.dev` is allowed.)* Reload — now the commands appear,
and **every repo you open in this environment** has them from then on.

**Scheduling-tools pre-approval is template-only.** Projects bootstrapped
before the current `templates/claude-settings.json` inherit nothing
automatically — each existing repo needs the same `permissions.allow` block
(both connector spellings, all six scheduling tools) PR'd into its
`.claude/settings.json` manually. One small PR per repo; a session scoped to
that repo can do it on request.

**Force a toolkit update (skip the ~weekly wait).** Only needed for a project
without `.claude/hooks/session-start.sh`; with the hook, the next session updates
itself. The setup-script install is
cached per environment, so a toolkit change merged upstream normally reaches your
sessions only when that cache rebuilds (~weekly). To get it **now**: open the
environment's settings, make any edit to the Setup script (even re-saving a
whitespace change), save — that is *meant* to invalidate the cache — then start a
**new** session and run `/env-chk` to check what actually attached. Verify rather
than assume: a re-save has been observed not to rebuild (2026-08-19, see
`MAINTAIN-REPO-USER-INSTRUCTIONS.md` → Environment Maintenance). `/env-chk` tells
you when this is needed ("plugins/ changed upstream") and whether it worked.

Environments whose setup script predates 2026-08-05 need that cache-invalidation
step every time. Newer ones do not: the script now refreshes the marketplaces and
runs `claude plugin update` after each install, so a plain re-run moves the
plugins to current. `claude plugin install` alone never could — it reports
"already installed" and leaves the old sha pinned. To adopt the fix on an older
environment, re-save its Setup script once; from then on it self-updates.

**Two later fixes make the manual step rarer still.** First, `--scope` defaults to
`user` on install *and* update, so until 2026-08-17 the script moved only the user
pin; a repo carrying `enabledPlugins` in its own `.claude/settings.json` also holds
a **project**-scope copy, and that stale copy is what the session resolves. An
environment could re-run a "self-updating" script indefinitely and still serve a
months-old toolkit. The script now updates both scopes. Second, the install also
runs from a `SessionStart` hook committed in the repo
(`.claude/hooks/session-start.sh`, scaffolded into new projects from
`templates/claude-hooks/session-start.sh`), so it re-runs every web session
instead of only when the environment's cached Setup script does. The plugin loads
at session start, so an update the hook fetches applies to the **next** session —
verified 2026-08-17, the CLI says "Restart to apply changes". That is still
self-healing without owner action, which the Setup-script route never was.

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
   - `TEST_AUTH_EMAIL` — the matching identifier, required when the app's gate is
     email+password (directives#304). Use a throwaway test-account address: it is
     typed into a visible input, so failure screenshots record it
   - `DB_SERVICE_KEY` — backend service-role key (required before the project's scheduled data workflow, if any, can run)
   - `SMTP_PASS` — SMTP app password / API key for the standard email-notification job (`cron-notify.yml`)
   - Any project-specific secrets the app requires
6. Add repository variables (**Settings → Secrets and variables → Actions → Variables**):
   - `APP_URL` = `https://akyachtsman.github.io/[repo-name]/`
   - `DB_URL` — your backend project/connection URL (required before the project's scheduled data workflow, if any, can run)
   - `SMTP_HOST`, `SMTP_USER`, `ALERT_TO` — email transport for the standard notification job (`SMTP_PORT` / `ALERT_FROM` optional). Until these + `SMTP_PASS` are set, the job emits a notice and skips — see `docs/guides/cron-email-notifications.md`
7. **Protect `main`** (**Settings → Rules → Rulesets → New branch ruleset**).
   This is the only thing that actually stops a direct push to the default
   branch — the toolkit's `push-gate` hook is a local speed bump with a bypass
   surface that is not enumerable, so a repo without this ruleset is unprotected
   no matter what the hook reports. `/new-repo` cannot set it; only you can.
   Enforcement **Active**, target **Include default branch**, tick **Restrict
   deletions**, **Block force pushes** and **Require a pull request before
   merging**; inside that last rule tick **Require conversation resolution before
   merging** and set **Required approvals to `0`**; leave **Restrict updates**
   unchecked, and leave the **bypass list empty**. Then run both probes — a
   direct write to `main` must be refused, and one ordinary PR must still merge.
   Full procedure and the reasoning for each setting:
   `MAINTAIN-REPO-USER-INSTRUCTIONS.md` → *Branch Protection*.

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

#### When does the UI design happen?
**Inside `/kickoff` — after the repo is scaffolded, not before.** You don't need
to design anything (in Stitch or elsewhere) up front to create the repo. The flow:

1. `/kickoff` asks for the brief first — including **"how elaborate, and which 1–2
   apps should it match in polish?"** That's where you seed the look, in words.
2. It scaffolds the repo (neutral starter `styles/tokens.css` + `components.css`).
3. It runs **`/design-intake`**, which establishes the actual look: you **import a
   reference**, it distills that into the project's `tokens.css` + `components.css`
   + one **reference page**, and you **sign off on that page (the look-gate)**
   before any other page is built.
4. `/sdd-loop` then builds the rest against that contract, so every page matches.

**Stitch is optional, and used *during* step 3 — not a prerequisite.** Bring the
look however you like: the simplest browser-only path is to **attach an image**
(a screenshot/mockup from Stitch, Figma, Dribbble, or a sketch); or wire Stitch's
remote MCP for higher-fidelity HTML; or bring nothing and let `/design-intake`
propose a direction from 2–3 taste questions. Re-run `/design-intake` anytime to
re-theme. Details: `directives/design.md` and `docs/guides/design-tooling.md`.

---

### Scheduled email notifications (standard)
`/new-repo` already scaffolds the email kit (`cron-notify.yml`,
`notify-email.js`, `notify-task.js`) into every project. You just set the secrets
and variables in items 5–6 of Step 1 above, then edit `.github/scripts/notify-task.js` to
send your project's actual notification. Until the SMTP secrets are set, the job
emits a notice and skips (no failure). Provider setup (Gmail app password, Resend,
SendGrid) is in `docs/guides/cron-email-notifications.md`.
