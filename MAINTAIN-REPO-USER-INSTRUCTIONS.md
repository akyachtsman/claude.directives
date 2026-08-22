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

## Branch Protection — one-time, per repo (owner ruling, 2026-08-22)

An agent cannot set this: it is a repository setting, and the whole point is
that it binds every actor including the session. Do it once per repo.

**Why it exists.** The toolkit's `push-gate` hook catches a direct push to main
only in the session running it, and only for shapes it can parse — three review
rounds on #256 found the bypass surface is not enumerable (#257). A ruleset
moves the rule server-side, where no shell form evades it.

**Setup** — *Settings → Rules → Rulesets → New branch ruleset*:
1. Name it (e.g. `main protection`); **Enforcement status: Active**.
2. **Target branches → Add target → Include default branch.**
3. Tick **Restrict deletions**, **Block force pushes**, and **Require a pull
   request before merging**.
4. Inside that last rule set **Required approvals to `0`.** GitHub defaults it
   to 1, and at 1 every agent PR waits forever for a reviewer who does not
   exist — `git.md` → *Conditional Auto-Merge on Green* has sessions merge their
   own PRs without approval.
5. Leave **Restrict updates** UNCHECKED. With an empty bypass list it blocks
   every update to the branch, including merging a PR — it locks the repo rather
   than protecting it.
6. Leave **Require status checks** unchecked. It pins a check by NAME, so a
   renamed workflow silently blocks every merge; sessions already verify CI
   green before merging and `ci-monitor` catches failures independently.

**The one exception: `keepalive.yml`.** It pushes an empty commit to main weekly
with `secrets.KEEPALIVE_PAT`, to stop GitHub disabling scheduled workflows after
60 days. Protection blocks that push, the workflow goes red, and ~60 days later
every cron in that repo is disabled — a slow, quiet failure. In any repo that
has `.github/workflows/keepalive.yml`, add the PAT's owning account under
**Add bypass → Users**. A repo with no scheduled workflows worth keeping can
delete `keepalive.yml` instead and skip the exception entirely.

Nothing else in the standard set pushes: the monitors only open issues, comment
and label, and `pages-retry` re-runs a deploy rather than pushing.

**Verify it took**, rather than trusting the form — attempt a direct write to
main and confirm it is refused:
```
409 Repository rule violations found
Changes must be made through a pull request.
```
Then merge one ordinary PR to confirm the normal flow still works. A
misconfigured ruleset does not leak; it locks you out, so the second check is
the one that matters.

## Downstream-Finding Loop

The standing procedure when a project session surfaces a bug, gap, or
improvement that belongs upstream. Findings propagate **upstream by hand-off,
never by cross-repo edits** (`global.md` → One Session, One Repo):

1. **Capture** — the downstream session emits a hand-off block
   (`/handoff-session` canonical format: header, UNRESOLVED, CONTEXT, GOTCHAS).
2. **Relay** — you paste it into a `claude.directives` session and ask for
   analysis first. The session verifies legitimacy against git history and
   live state before implementing (`global.md` → *Behavior Rules* → evidence before assertions —
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
`docs/site/logical-map.html`, the repo's single map (the physical-folders view
was retired 2026-07-21). Three layers, all CI-validated so they can't rot:

- **`domains`** — domain → compartment → paths. The **compartment** is the
  swappable unit (e.g. `test.ui-kit`, `git.monitors`): replace its file set
  honoring its interface and nothing outside it moves. The compartment's
  paths ARE the shopping list for a swap, across all delivery modes at once.
- **`swap`** — the classes. **Permanent** paths (the five directive contracts;
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
  post-install PR; don't call it a dud.
- **Workflow watch lists** — every rule about which names a `workflow_run`
  watcher may carry, how the two Pages sources differ, and why retry is
  source-specific lives in ONE place: `docs/standards/automations.md` → *Watcher Rules* (W1–W3). Stated here once as a
  pointer on purpose; this ruleset was previously restated in five files and
  every correction landed in four of them.
- **A name resolving is not a trigger firing.** The tree can prove the first and
  never the second. That needs run history, and the test is a COMPARISON: an
  eligible SOURCE run that completed with no corresponding WATCHER run. "No runs
  since the config change" alone is equally consistent with an idle repository,
  and treating it as proof manufactures false alarms in exactly the repos nobody
  is touching.
- **Scheduling tools are pre-approved via committed settings** (`global.md` →
  *Scheduling Tools Never Prompt*, 2026-08-18): the six-tool allowlist in
  `.claude/settings.json` loads at session start; a one-time prompt in an
  already-running session is accepted. ci-notify's webhook wake still covers
  PR-attached completion without any scheduling call.
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
  hourly, so arm ONE `send_later` completion check-in and park — that single
  check-in is also the heartbeat's next opportunity, never a reason to arm a
  second wake for liveness (`directives/global.md` → *Status Line on Every
  Stop*). The owner's browser
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
  elsewhere: push-gate blocks direct-to-main, workflow PRs merge only after a
  line-by-line diff read (`git.md`, 2026-07-19), and workflow-trigger edits
  are stop-and-ask before the change is made. Keep the
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
