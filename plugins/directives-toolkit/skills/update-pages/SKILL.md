---
name: update-pages
description: "Use whenever asked to deploy, ship, publish, or push a site change live; to confirm the live site is serving the latest version; or when the site still shows the old version, a change did not go live, or a deploy looks stuck or failed — and automatically whenever an edit touches a Pages-served file or Pages config. Runs the gates, pushes, watches the Pages deploy to a terminal state, reports live/stuck/failed."
phase: ship
---
Drive a GitHub Pages deploy from commit to "live" and report back **proactively**,
so the user never babysits it. Follows the Async Operations directive: never block
on a `sleep` loop — surface the result on its own. **"Merged" is not "live": a Pages
change is done only once the deploy reaches a green terminal state and the live URL
serves the new content.**

**Apply this automatically whenever a change updates the Pages site** — any edit to
a file GitHub Pages serves (root `index.html`, `docs/site/commands.html`,
`docs/site/logical-map.html`, other served HTML/CSS/assets) or to the Pages
configuration. Don't wait to be asked: if the change you just made will change
what `*.github.io` serves, run these steps and report when it's live.

Run in order:

1. **Pre-flight (local gate).** Before pushing, run the repo's configured
   validation gates — whatever THIS project wires into CI (in `claude.directives`
   itself that's `node .github/scripts/check-*.js` — `check-paths`,
   `check-sections`, `check-links.js --internal`; a project will have its own) — plus `npx html-validate <changed .html>` for
   any HTML touched. Fix failures before pushing.

2. **Commit, push, merge — then capture the MERGE commit's SHA.** Commit to the
   working branch and ship it through the PR flow (`git.md` → *PR Lifecycle*);
   never push to the Pages source branch directly. Pages publishes the source
   branch (`main`), so the SHA the deploy must publish is the **squash-merge
   commit**, not the branch head: a squash merge creates a new commit, so the
   branch head never appears as a deploy's `head_sha`, and watching for it makes
   a healthy deploy look stuck (step 5). Take it from the merge result (the
   `sha` the merge call returns, or the PR's `merge_commit_sha` once `merged` is
   true), or after the merge from `git fetch origin main` then
   `git rev-parse origin/main`. Also confirm the homepage file is present: `index.html`
   beats `README.md` as the directory index, so a missing root `index.html`
   means the site will fall back to rendering `README.md`.

3. **Identify the deploy workflow.** GitHub Pages "Deploy from a branch" runs as
   the managed **`pages-build-deployment`** workflow. That slug is the WORKFLOW's
   `name` (the workflows endpoint), which is what `workflow_run` filters match;
   each RUN object instead reports the prose title "pages build and deployment"
   (both verified via the Actions API, 2026-10-08), so find runs by `head_sha`
   with `event=dynamic` or by `workflow_id`, never by run name. A custom Actions deploy
   runs as its own named workflow. Know which the repo uses — **the source decides
   the step-5 recovery**, so settle it here, from the tree: a workflow under
   `.github/workflows/` that runs `actions/deploy-pages` means **Actions-source**
   (a filtered copy, a CI build, or both — `global.md` → *Hosting & Deployment*);
   none means branch-source. The settings endpoint that states it outright
   (`GET repos/{owner}/{repo}/pages`, field `build_type`: `legacy` or `workflow`)
   is refused by a web session's GitHub proxy (403, 2026-10-09). Where the tree
   says Actions-source, or a `Build:` bullet in the project's `CLAUDE.md` records
   a build, treat the site as Actions-source even if a run of
   `pages-build-deployment` also appears: a visibility flip can fire that one
   under either source.

4. **Watch to a terminal state — never a blocking or backgrounded sleep.** Find
   the deploy run whose `head_sha` == the merge commit's SHA from step 2 and
   re-check until `status == completed`:
   - Query via the GitHub Actions API — github MCP `actions_list` with
     `method: "list_workflow_runs"` plus `owner`/`repo`, then match the run whose
     `head_sha` is that SHA. There is no top-level `event` argument (it
     lives under `workflow_runs_filter`, and `dynamic` is not one of its values),
     so do not try to filter the managed Pages deploy by event there — match on
     the SHA. With `gh api` (the only `gh` form a web session has; `gh run list`
     is not available): `gh api "repos/{owner}/{repo}/actions/runs?head_sha=<sha>&event=dynamic"`
     returns the managed deploy's run for that SHA (drop `&event=dynamic` for a
     custom Actions deploy and match its workflow).
   - Re-check proactively: schedule the next check with `send_later` — the
     pre-approved primary per `global.md` → *Async Operations* — or with
     `ScheduleWakeup` where a session has that instead. Verify which exists per
     `/env-chk` rather than assuming either. Do **not** background a `sleep` poll
     and do not sit in a foreground sleep — a backgrounded sleep orphans into a
     phantom "running" task on session resume (see `global.md` → *Async Operations*;
     the `wait-gate` hook blocks it).

5. **Stuck detection.** If no run for the merge commit's SHA appears within
   ~2 minutes of the merge — check first that it IS the merge commit, not the
   branch head (step 2), or a healthy deploy reads as stuck — the deploy is not
   auto-firing (common right after enabling Pages, or when the pipeline is
   wedged). The fix depends on the source from step 3:
   - **Branch-source.** This needs a **human action you cannot do** — message
     the user the exact fix and then keep watching for the new run:
     > **Settings → Pages → Build and deployment → Source "Deploy from a branch"**
     > → set **Branch: None** → **Save** → set back to **Branch: `main`,
     > Folder: `/ (root)`** → **Save**.
     > (Re-saving the *same* value is a no-op and the Save button stays greyed out;
     > the **None → main** toggle is what forces a fresh build.)
   - **Actions-source.** Start the deploy workflow again; never touch the
     source setting. If it declares `workflow_dispatch`, dispatch it on `main`
     (`gh api -X POST repos/{owner}/{repo}/actions/workflows/<file>/dispatches -f ref=main`);
     otherwise re-run its latest run for that SHA
     (`gh api -X POST repos/{owner}/{repo}/actions/runs/<id>/rerun`), or ask the
     user to press **Run workflow** / **Re-run** on it in the Actions tab.
     ⚠️ **Never recommend "Deploy from a branch" here, not even briefly as a
     toggle.** Branch-source publishes the whole repository: every deny-listed
     path goes public, and a build project serves its unbuilt sources. The
     None → main toggle is a branch-source fix only.

6. **Report proactively on the terminal state** (message / `SendUserFile` with
   `status: proactive` so it reaches the user's phone):
   - **SUCCESS:** `✅ Deployed <short-sha> — live at <pages-url>`. Warn that the
     served root (`/`) can stay CDN-cached for up to ~10 min after a deploy; tell
     the user to verify *now* via a cache-busted URL
     (`<pages-url>/index.html?v=<timestamp>`) or an incognito window.
   - **FAILURE:** `❌ Pages build failed for <short-sha> — <run-url>`, with the
     failing step summarized. GitHub's *managed* deploy sometimes fails its publish
     step with a transient **"Deployment failed, try again later."** — a GitHub-side
     blip, not your change. **Re-run it** to a terminal state before reporting done:
     automatically if the project ships an auto-retry deploy workflow
     (`.github/workflows/pages-retry.yml` — watches the managed deploy via
     `workflow_run` and re-runs on failure, bounded to `run_attempt < 4` so a truly
     broken deploy can't loop), otherwise re-run manually via the Actions API. A
     merged-but-failed deploy leaves the site **stale** — that is not "done."
     On Actions-source, the run to re-run is the deploy workflow's own, never
     `pages-build-deployment` (step 5).

7. **Verification caveat.** A remote/sandbox session often **cannot fetch the
   `*.github.io` page** (network allowlist blocks it — `curl`/`WebFetch` return
   403 "Host not in allowlist"). So verify by the build's `head_sha` +
   `conclusion` via the Actions API, **not** by loading the page. Confirm the
   intended files are in the published commit's tree with `git show <sha>:<path>`.
   A clean/empty-cache render (headless Playwright, incognito, or a `?v=` bust)
   confirms the *new* deploy is served but does **not** reproduce a **returning
   visitor's** cached state — so it can't catch a stale-cache regression on its own
   (see the cache-busting gotcha below).

## Gotchas this skill exists to catch
- **Live site shows `README.md`** → no `index.html` in the *published* snapshot
  (or it's cache). Check the deployed SHA, not just that "a build ran."
- **Pushes produce no builds** → stuck pipeline → on branch-source the None→main
  toggle; on Actions-source re-dispatch or re-run the deploy workflow, never the
  toggle (step 5).
- **Same old page after a successful deploy** → browser/CDN cache → cache-bust
  with `?v=` or incognito (step 6); `/` catches up when the CDN TTL expires.
- **A green build for the wrong SHA** → confirm `head_sha` matches the merge
  commit from step 2, not an older enable-time build.
- **A healthy deploy that looks stuck** → the watch is on the branch head, which
  a squash merge never publishes. Watch the merge commit (step 2) before
  asking anyone for the step-5 toggle.
- **Returning visitors get a broken layout after a deploy** → render-blocking
  assets don't share **one** cache-busting scheme (e.g. a versioned `app.js?v=8`
  loaded against a static `styles.css`). **All render-blocking CSS + JS must use the
  same cache-busting scheme**, so a returning visitor never loads new HTML/JS
  against stale CSS (or vice-versa). Clean-cache tests never catch this — only a
  returning visitor holding the old asset does; bump every render-blocking asset
  together.
