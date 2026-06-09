---
name: deploy.watch
description: Standard procedure for ANY change that updates a GitHub Pages site (root/docs index.html, design-system.html, served CSS/HTML/content, or Pages config). Ship it, watch the deploy end-to-end, and proactively report live / stuck / failed so the user never has to re-prompt or babysit it.
trigger: slash_command_and_auto
---
Drive a GitHub Pages deploy from commit to "live" and report back **proactively**,
so the user never babysits it. Follows the Async Operations directive: never block
on a `sleep` loop — surface the result on its own.

**Apply this automatically whenever a change updates the Pages site** — any edit to
a file GitHub Pages serves (root `index.html`, `docs/index.html`,
`docs/design-system.html`, other served HTML/CSS/assets) or to the Pages
configuration. Don't wait to be asked: if the change you just made will change
what `*.github.io` serves, run these steps and report when it's live.

Run in order:

1. **Pre-flight (local gate).** Before pushing, run the repo's validation:
   - `node .github/scripts/check-paths.js`, `check-sections.js`,
     `check-links.js --internal`
   - `npx html-validate <changed .html>` for any HTML touched
   Fix failures before pushing.

2. **Commit, push, capture the SHA.** Commit to the working branch (or `main`
   per repo policy), push, and record `git rev-parse HEAD` — this is the SHA the
   deploy must publish. Also confirm the homepage file is present: `index.html`
   beats `README.md` as the directory index, so a missing root `index.html`
   means the site will fall back to rendering `README.md`.

3. **Identify the deploy workflow.** GitHub Pages "Deploy from a branch" runs as
   the **`pages build and deployment`** workflow (Actions `event: dynamic`). A
   custom Actions deploy runs as its own named workflow. Know which the repo uses.

4. **Watch to a terminal state — no blocking sleep.** Poll the deploy workflow
   for a run whose `head_sha` == the pushed SHA, until `status == completed`:
   - Query via the GitHub Actions API — github MCP `actions_list`
     (`event: dynamic`), or `gh run list` where `gh` is available.
   - Do it proactively: if `send_later` is available, schedule a check-in ~60s
     out and re-poll when it fires, repeating until terminal. Otherwise run a
     background poll (Bash `run_in_background` / Monitor) that **exits on the
     terminal state**. Never sit in a foreground sleep.

5. **Stuck detection.** If no run for the pushed SHA appears within ~2 minutes,
   the branch-source build is not auto-firing (common right after enabling Pages,
   or when the pipeline is wedged). This needs a **human action you cannot do** —
   message the user the exact fix and then keep watching for the new run:
   > **Settings → Pages → Build and deployment → Source "Deploy from a branch"**
   > → set **Branch: None** → **Save** → set back to **Branch: `main`,
   > Folder: `/ (root)`** → **Save**.
   > (Re-saving the *same* value is a no-op and the Save button stays greyed out;
   > the **None → main** toggle is what forces a fresh build.)

6. **Report proactively on the terminal state** (message / `SendUserFile` with
   `status: proactive` so it reaches the user's phone):
   - **SUCCESS:** `✅ Deployed <short-sha> — live at <pages-url>`. Warn that the
     served root (`/`) can stay CDN-cached for up to ~10 min after a deploy; tell
     the user to verify *now* via a cache-busted URL
     (`<pages-url>/index.html?v=<timestamp>`) or an incognito window.
   - **FAILURE:** `❌ Pages build failed for <short-sha> — <run-url>`, with the
     failing step summarized.

7. **Verification caveat.** A remote/sandbox session often **cannot fetch the
   `*.github.io` page** (network allowlist blocks it — `curl`/`WebFetch` return
   403 "Host not in allowlist"). So verify by the build's `head_sha` +
   `conclusion` via the Actions API, **not** by loading the page. Confirm the
   intended files are in the published commit's tree with `git show <sha>:<path>`.

## Gotchas this skill exists to catch
- **Live site shows `README.md`** → no `index.html` in the *published* snapshot
  (or it's cache). Check the deployed SHA, not just that "a build ran."
- **Pushes produce no builds** → stuck pipeline → the None→main toggle (step 5).
- **Same old page after a successful deploy** → browser/CDN cache → cache-bust
  with `?v=` or incognito (step 6); `/` catches up when the CDN TTL expires.
- **A green build for the wrong SHA** → confirm `head_sha` matches the commit you
  just pushed, not an older enable-time build.
