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
`docs/site/logical-map.html`, other served HTML/CSS/assets), to a build input
under the CI-build opt-in (any path matching `BUILD_PATHS` in `qa.yml`: the
deployed site is the build's output), or to the Pages configuration. Don't wait to be asked: if the change you just made will change
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
   beats `README.md` as the directory index, so on branch-source a missing root
   `index.html` means the site will fall back to rendering `README.md`. On
   Actions-source the homepage is the published directory's own `index.html`
   (`SITE_DIR` after any build); `pages-deploy.yml` refuses to publish one
   without it.

3. **Identify the deploy workflow.** GitHub Pages "Deploy from a branch" runs as
   the managed **`pages-build-deployment`** workflow. That slug is the WORKFLOW's
   `name` (the workflows endpoint), which is what `workflow_run` filters match;
   each RUN object instead reports the prose title "pages build and deployment"
   (both verified via the Actions API, 2026-10-08), so find runs by `head_sha`
   with `event=dynamic` or by `workflow_id`, never by run name. A custom Actions deploy
   runs as its own named workflow. Know which the repo uses — **the source decides
   the step-5 recovery**, so settle it here, taking the first source of these
   that answers:
   1. **The settings endpoint** (`GET repos/{owner}/{repo}/pages`), which is
      authoritative: `build_type: workflow` is **Actions-source** and `legacy`
      is **branch-source**, whatever workflows the tree holds. A web
      session's GitHub proxy refuses it (403, 2026-10-09).
   2. **The user's reading** of **Settings → Pages → Build and deployment →
      Source**: "GitHub Actions" or "Deploy from a branch".
   3. **The tree, one way only:** a workflow under `.github/workflows/` that
      runs `actions/deploy-pages` means **Actions-source**. Its absence proves
      nothing — a deploy can call the Pages deployment API directly or sit
      behind a reusable workflow — so with none, the source is **unknown**.

   A `Build:` bullet in the project's `CLAUDE.md` is not evidence: it records
   a decision, not an installed deploy
   (`global.md` → *Hosting & Deployment*). Nor is a
   `pages-build-deployment` run: a visibility flip fires that one under either
   source. Treat **unknown** as Actions-source for every step-5 decision until
   the user confirms the setting.

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
   - **Branch-source, confirmed** (step 3 — never on an unknown source). This
     needs a **human action you cannot do** — message the user the exact fix
     and then keep watching for the new run:
     > **Settings → Pages → Build and deployment → Source "Deploy from a branch"**
     > → set **Branch: None** → **Save** → set back to **Branch: `main`,
     > Folder: `/ (root)`** → **Save**.
     > (Re-saving the *same* value is a no-op and the Save button stays greyed out;
     > the **None → main** toggle is what forces a fresh build.)
   - **Actions-source.** Start a NEW run of the deploy workflow on `main`; never
     touch the source setting, and never re-run an older run — a re-run keeps
     its original commit, so it would republish stale code while the watch
     waits for this one. If the workflow declares `workflow_dispatch`, dispatch
     it (`gh api -X POST repos/{owner}/{repo}/actions/workflows/<file>/dispatches -f ref=main`,
     or **Run workflow** in the Actions tab). The dispatched run builds `main`'s
     head at that moment, so watch for a run whose `head_sha` is
     `git rev-parse origin/main` after a fresh fetch, not necessarily step 2's
     SHA. If it does not declare `workflow_dispatch`, add the trigger through
     the PR flow (`templates/workflows/pages-deploy.yml` ships it), then dispatch it on `main` as soon as that merges and watch
     the dispatched run. Do not count on the merge push to deploy: a deploy
     whose `push:` carries a `paths:` filter skips a workflow-only commit, and
     that filter may be why the run was missing in the first place. A deploy
     that reads its input from its trigger (a `workflow_run` deploy taking
     `github.event.workflow_run.*`, say) gets none of it from a dispatch:
     dispatch the workflow that produces that input instead, or make the
     deploy safe for a dispatch event first.
   - **Unknown source:** ask the user what Settings → Pages → Source shows
     before recommending anything; until they answer, the Actions-source
     recovery is the only one on offer.
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
   - **BUILD SUCCEEDED, PAGE NOT FETCHED:** `⚠️ Merged <short-sha>, live
     unverified — build succeeded (<run-url>); <pages-url> could not be fetched
     from this session`. Use this, never the SUCCESS line, whenever step 7's
     cache-busted fetch did not happen.
   - **FAILURE:** `❌ Pages build failed for <short-sha> — <run-url>`, with the
     failing step summarized. GitHub's *managed* deploy sometimes fails its publish
     step with a transient **"Deployment failed, try again later."** — a GitHub-side
     blip, not your change. **Re-run it** to a terminal state before reporting done:
     automatically if the project ships an auto-retry deploy workflow
     (`.github/workflows/pages-retry.yml` — watches the managed deploy via
     `workflow_run` and re-runs on failure, bounded to `run_attempt < 4` so a truly
     broken deploy can't loop), otherwise re-run manually via the Actions API. A
     merged-but-failed deploy leaves the site **stale** — that is not "done."
     On Actions-source, never re-run: dispatch a NEW run of the deploy workflow
     on `main` (step 5). `pages-deploy.yml` refuses a re-run of its publish,
     since an older commit would roll the site back, and the run to recover is
     never `pages-build-deployment`.

7. **Verification caveat.** `global.md` → *Async Operations* counts a deploy
   done only once the deployed asset is fetched **cache-busted** and serves the
   new content ("merged" is not "live"); do that whenever the page can be
   fetched. A remote/sandbox session
   often **cannot fetch the `*.github.io` page** (network allowlist blocks it —
   `curl`/`WebFetch` return 403 "Host not in allowlist"). Then fall back to the
   build's `head_sha` + `conclusion` via the Actions API, and confirm the
   intended files are in the published commit's tree with `git show <sha>:<path>`
   — but that proves the build, not what is served, so report the status as
   **"Merged, live unverified"**, never "Deployed", and say why the page could
   not be fetched.
   A clean/empty-cache render (headless Playwright, incognito, or a `?v=` bust)
   confirms the *new* deploy is served but does **not** reproduce a **returning
   visitor's** cached state — so it can't catch a stale-cache regression on its own
   (see the cache-busting gotcha below).

## Gotchas this skill exists to catch
- **Live site shows `README.md`** → no `index.html` in the *published* snapshot
  (or it's cache). Check the deployed SHA, not just that "a build ran."
- **Pushes produce no builds** → stuck pipeline → on a CONFIRMED branch-source
  site the None→main toggle; otherwise (Actions-source, or unknown) a NEW run
  of the deploy workflow on `main`, never a re-run of an older one and never the
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
