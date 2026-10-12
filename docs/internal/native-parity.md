# Native parity — this repo's half of the pass

Internal. `CLAUDE.md` → *Purpose* sets the upkeep mandate, and `CLAUDE.md` →
*Session Start* (step 5) says when to run the pass. The `/audit-repo` command
(`plugins/directives-toolkit/commands/audit-repo.md`) carries the generic
procedure: where the inventory comes from, and which entries count as
Anthropic-owned. This file holds only what is specific to claude.directives:
where its verdicts are recorded, and how the inventory is matched against them.

## Where the verdicts live
- `EXPORTS.json` → `externals` records the natives this repo depends on.
- `EXPORTS.json` → `considered` records the natives evaluated and not adopted
  wholesale, each with a `verdict` (`borrowed`, `rejected` or `deferred`), a
  `rationale`, and for `borrowed` or `rejected` the path that `stays` doing the
  job. `check-exports.js` validates both.
- A grouped entry covers its key AND every name in its `names` array.
- The harness tools in scope are the remote-session, scheduling and
  notification tools. `externals.ccr-harness-tools` lists the ones adopted;
  `considered.ccr-session-mutators`, `considered.cron-tools` and
  `considered.push-notification` list the ones declined.

## Matching the inventory against them
- Exclude this repo's own `claude-directives` marketplace, which advertises
  `directives-toolkit`. Without that, the pass flags the toolkit it is auditing
  as a missing native.
- Strip a `-builtin` suffix from a manifest key before comparing it to an
  inventory name: the inventory calls it `dataviz`, `EXPORTS.json` calls it
  `dataviz-builtin`.
- Name normalisation otherwise follows `/audit-repo` (lowercased directory-cache
  names, a skill recorded under its parent plugin): `Plugin Management` is
  `considered.plugin-management`.

## What is a finding
- An Anthropic-owned native that is in neither `externals` nor `considered`.
- A `deferred` entry, on every pass: it means the work still fits and has not
  been done. The finding carries the recorded rationale rather than re-deriving
  it. Only `borrowed` and `rejected` entries suppress a finding.

Every native evaluated and declined is recorded in `considered`, so the next pass
reads the verdict instead of re-deriving it.
