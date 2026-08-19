# MAINTAIN-REPO-USER-INSTRUCTIONS.md — keeping the fleet in sync

> Counterpart to `NEW-REPO-USER-INSTRUCTIONS.md`. That doc gets a project
> **started**; this one is the owner's runbook for everything **after** —
> how upstream changes reach the fleet, what you do per change type, and the
> standing loop for findings that surface downstream. Written for the human
> owner; sessions cite it, you execute it.

The fleet today: `claude.trading`, `claude.prop`, `apfp.claude`,
`claude.insurance`, plus this repo. Update this list when a repo is added or
retired. **All of them share ONE web environment**, named `fleet` (verified
2026-07-23 via `list_environments`) — so its egress allowlist and its cached
toolkit install are fleet-wide, and refreshing it is a single action, not one
per repo.

## Propagation Matrix

The single most important table in this repo. Every exported file reaches
projects one of four ways (`EXPORTS.json` → categories), and the way it
travels determines what YOU must do when it changes:

| What changed | Delivery mode | What you do | When it lands downstream | How you verify |
|---|---|---|---|---|
| `directives/*.md` | **Inherited** — fetched live by raw URL | Nothing | Next session start in each repo; mid-session via `/refresh-repo` (Phase 0 re-reads the rules) | `/env-chk` directive-freshness check |
| `plugins/`, `.claude-plugin/marketplace.json`, `scripts/install-toolkit.sh` | **Installed** — `SessionStart` hook per session; env setup script for the first install | Nothing, for a project carrying `.claude/hooks/session-start.sh`. For a legacy project without it: **re-save that environment's setup script** (see Environment Maintenance), or install the hook once via `/refresh-repo` so the step stops recurring | With the hook: the next **new** session. Without it: after that environment's cache rebuilds. Never mid-session either way | `/env-chk` toolkit-attached check |
| `templates/**` | **Copied** — snapshotted into projects at bootstrap | Run `/refresh-repo` in a session of each project and approve the per-file dispositions | On approval, that session | The refresh report + `.claude/directive-sync.json` stamp |
| `docs/**`, the two `*-USER-INSTRUCTIONS.md` files | **Referenced** — read on demand by link | Nothing | Immediately (nothing is stored downstream) | — |

Corollaries worth memorizing:
- A running session never updates itself — inherited rules refresh only via
  `/refresh-repo`, installed tooling only via a NEW session (the `SessionStart`
  hook fetches it; legacy projects wait for a cache rebuild).
- One upstream PR often spans modes (a directive + a template + a plugin
  command). Walk the PR's file list against this table and do the union of
  the actions.
- **Swapping a toolkit/plugin is two halves in ONE PR**: the install side
  (`marketplace.json` / plugin dir / `install-toolkit.sh`) AND the enablement
  side (`templates/claude-settings.json` → each project's `.claude/settings.json`).
  Then re-save environments (install half) AND run `/refresh-repo` per project
  (enablement half). Shipping one half leaves projects installed-but-not-enabled
  or enabled-but-not-installed.

## HUMAN STEPS — after every upstream merge

1. Look at the merged PR's file list and classify each file with the matrix.
2. **Inherited only** → done; the fleet is current at next session start.
3. **Installed touched** → nothing to do for projects carrying the `SessionStart`
   hook; they self-update next session. For legacy projects without it, re-save
   that environment's setup script (below), or install the hook once via
   `/refresh-repo` so this step stops recurring.
4. **Copied touched** → in each project, run `/refresh-repo` and approve the
   dispositions it proposes.
5. **Referenced only** → done.
6. If the change closes out a downstream finding, paste the prepared reply
   back into the session that reported it (see the loop below).

## Downstream-Finding Loop

The standing procedure when a project session surfaces a bug, gap, or
improvement that belongs upstream. Findings propagate **upstream by hand-off,
never by cross-repo edits** (`global.md` → Cross-Repo Boundary):

1. **Capture** — the downstream session emits a hand-off block
   (`/handoff-session` canonical format: header, UNRESOLVED, CONTEXT, GOTCHAS).
2. **Relay** — you paste it into a `claude.directives` session and ask for
   analysis first. The session verifies legitimacy against git history and
   live state before implementing (`global.md` → evidence before assertions —
   downstream reports have been wrong before).
3. **Implement + self-apply** — the fix lands under `directives/`, `templates/`,
   or `plugins/`, AND is applied to this repo itself in the same PR when it
   applies here (`CLAUDE.md` → Self-application).
4. **Merge on green** — normal PR flow; `git.md` gates; ci-notify wakes the
   session to merge.
5. **Propagate** — run HUMAN STEPS above for the modes the PR touched.
6. **Close the loop** — paste the prepared reply back to the reporting
   session so it can proceed with corrected instructions.

## Environment Maintenance

This section applies to **legacy projects only** — one carrying
`.claude/hooks/session-start.sh` re-runs the installer every session and needs
nothing here. The installed-tooling cache is **per environment** and is *meant* to
rebuild on any environment-config change or ~weekly expiry. Since the whole fleet
shares the single `fleet` environment, this is **one action that reaches every
repo**:

1. Open the `fleet` environment (Claude Code on the web → the environment your
   sessions run in — NOT a global account setting).
2. Choose **Edit environment** and **re-save the setup script unchanged**.
3. Start a NEW session and run `/env-chk` to confirm what actually attached.

**Step 3 is a verification step, not a formality — the re-save is best-effort.**
Measured 2026-08-19: the owner re-saved `fleet`, and the next new session in a
legacy project still carried a plugin the current installer had already removed
(`hookify` was live in `~/.claude/plugins/installed_plugins.json` and
`~/.claude/settings.json`), spewing an import error on every tool call. A
`claude.directives` session in that same environment, at that same time, was
clean — because it commits the hook and re-runs the installer itself. One repo
broken and one repo clean in one environment is the signature: the difference is
the hook, not the environment, and no further re-saving fixes it.

So treat the re-save as a nudge that may not land, and treat the hook as the
cure. If `/env-chk` still reports a stale or unwanted plugin after a re-save,
stop re-saving and **install the hook once** in that project — `/refresh-repo`
does it (Phase 2 installs `.claude/hooks/session-start.sh` and merges the
`SessionStart` row even when the local path does not exist). From then on the
project heals itself every session and never needs this section again.

(If the fleet ever splits across multiple environments, repeat per environment
and update the fleet list above.)

## Domain Boundaries — the logical view

The folder layout is **physical** (organized by delivery mode, because that is
what the raw-URL / plugin / template machinery enforces). The **logical** view
lives in `EXPORTS.json` and is drawn interactively at
`docs/site/logical-map.html` (the physical map's sibling — each links to the
other). Three layers, all CI-validated so they can't rot:

- **`domains`** — domain → compartment → paths. The **compartment** is the
  swappable unit (e.g. `test.ui-kit`, `git.monitors`): replace its file set
  honoring its interface and nothing outside it moves. The compartment's
  paths ARE the shopping list for a swap, across all delivery modes at once.
- **`swap`** — the classes. **Permanent** paths (the four directive contracts;
  the whole `meta` domain) evolve via PR, never wholesale replacement.
  **Orchestrators** (`sdd-loop` for development, `qa-pipeline` for testing)
  are permanent AND define the interfaces components must fit — **a new
  component does not exist until its orchestrator sequences it**. Everything
  else is swappable.
- **`externals`** — vendor-owned capabilities we hold only **sockets** for
  (pr-review-toolkit, security-guidance, Playwright, Codex, Stitch,
  Supabase MCP, …). Each entry records the vendor, the compartment it serves,
  and the exact socket files that name/enable it. To swap a vendor: rewire
  the sockets, never fork the vendor's code.

Standing rules:
- **Interfaces between domains**: a directive may *reference* another domain's
  sections (test.md points at global.md's escalation rules) but never
  *redefines* them. One owner per rule; pointers elsewhere.
- **`meta` is not swappable** — it's the machinery that delivers the other
  five. Changing it changes how everything propagates; treat it with
  workflow-file caution.
- Precedent that this works: the design paradigm was already swapped once
  (fixed shared theme → per-project generative method) by replacing the
  `design` set, with no other domain touched — its 3-point interface held.

## Known Gotchas

Hard-won; each cost a real debugging session:
- **ci-notify bootstrap gap** — `workflow_run` reads the default branch, so
  ci-notify can never wake the PR that installs it. Verify on the FIRST
  post-install PR (the one allowed backstop check); don't call it a dud.
- **Watch lists match workflow `name:` exactly** — repos with non-template QA
  names must adapt `ci-monitor.yml`/`ci-notify.yml` lists. `/refresh-repo` no
  longer carries a named exception for those two files (removed 2026-08-19):
  every drop-in that differs from its template is flagged `DRIFT`, shown as a
  diff, and **defaults to keeping the local copy**, so an adapted watch list is
  preserved by the general rule rather than by being on a list. An allow-list of
  files permitted to differ rots the same way a watch list pinned to one
  workflow name does — right when written, silently wrong after the next local
  improvement.
- **Every watched name must resolve to a workflow the repo actually has** —
  with ONE documented exception: names GitHub itself manages, currently only
  `pages-build-deployment`. Everything else is project-owned, and an entry
  naming a project workflow you never installed can never fire and is
  indistinguishable by reading from one that has silently stopped matching. That
  is why the optional `qa-response.yml` entry is no longer pre-listed. Rename a
  watched workflow and its watchers in the SAME pull request.
- **An Actions-sourced Pages deploy needs YOUR workflow's name added by hand.**
  Flipping Settings → Pages → Source to "GitHub Actions" makes
  `pages-build-deployment` inert, and any watcher naming only it stops firing
  with no error at all. But the replacement is your own deploy workflow, whose
  `name:` this template set does not ship and cannot guess — so `qa-live.yml`,
  `pages-retry.yml` and `pages-monitor.yml` ship WITHOUT one and tell you to add
  it. A pre-filled guess would be the same defect as the bullet above.
- **A name resolving is not a trigger firing.** Everything above is checkable
  against the tree; whether a watcher still receives events is not. That needs
  run history — if a watched workflow has no runs since a config change, treat
  it as dead regardless of how correct the file reads.
- **Web sessions ignore project `permissions.allow`** — MCP prompt reduction
  on web comes from architecture (ci-notify wake, no-backstop ruling), not
  settings.
- **The managed Pages workflow's real name is the slug** `pages-build-deployment`,
  not the UI prose title.
- **Mid-session staleness** — `CLAUDE.md` → *Mid-session change semantics*:
  what a live session sees when files change under it. Don't expect hot reload.
- **api.github.com rate limits in remote sessions** — shared-fleet IP; use
  WebFetch or raw URLs, and a failed fetch is "cannot verify", never "broken".
- **The GitHub App token's hourly quota is shared and exhaustible** — distinct
  from the bullet above: every session and monitor draws authenticated REST
  calls from ONE identity (the error names it: `API rate limit already
  exceeded for user ID 108373010`), so an API-heavy day throttles *write*
  calls at the worst moment — un-draft/merge got struck four times on
  2026-07-21 alone. Failed calls are retryable, not fatal: the window rolls
  hourly, so arm ONE `send_later` check-in and park. The owner's browser
  session has its own separate quota — a UI "Ready for review → Squash and
  merge" is the instant fallback. Economize the budget: small `per_page`,
  jq-summarize oversized saved payloads instead of re-fetching, WebFetch
  (server-side, own egress) for reads when the MCP is throttled. The full
  fleet-wide rulebook is exported to every repo as `directives/git.md` →
  *GitHub API Quota Economy* (inherited live at session start).
- **REST and GraphQL quotas are separate, and un-drafting needs GraphQL** —
  observed 2026-08-01: `merge_pull_request` returned a clean `405 still a
  draft` (REST alive) while `update_pull_request draft:false` returned
  `rate limit already exceeded` (GraphQL out). GitHub has no REST endpoint for
  marking a PR ready. So when a session says it is quota-blocked on a green PR,
  your single click on **Ready for review** may be all it needs — it can merge
  over REST straight after, no need to wait out the hour.
- **Plugin supply chain has no review point in our repos** — external plugin
  updates (even Anthropic-official) reach sessions automatically — every session
  now, via the `SessionStart` hook, rather than on the ~weekly cache rebuild —
  unreviewed by us. The hook shortens that window, so it raises this risk rather
  than lowering it. The defenses are layered
  elsewhere: push-gate blocks direct-to-main, workflow files are excluded
  from auto-merge, workflow-trigger edits are stop-and-ask, and every
  workflow PR gets a line-by-line diff read (`git.md`, 2026-07-19). Keep the
  install list minimal — ours plus the named Anthropic-official set in
  `scripts/install-toolkit.sh`.
- **`/refresh-repo` is a sync negotiator, not a restore-from-backup** — its
  Phase 2 diffs the *upstream delta*, so a locally corrupted copy of an
  unchanged template is invisible to it; and when it does see local changes
  it preserves them pending approval by design. Local corruption is caught by
  Phase 1.5's delta-independent integrity check (drift vs the current
  templates) and fixed by restore-from-template or `git revert` — not by
  waiting for a refresh to notice. Since 2026-08-19 that check is also the
  whole disposition rule for workflow drop-ins: `DRIFT` is a question, answered
  by reading the diff, never a batch overwrite.
