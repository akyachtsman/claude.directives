# Session Mechanics

The reasoning, mechanism, measurements and history behind session-behaviour
rules in `directives/global.md` — *Behavior Rules*, *Parallel Tasking via
Subagents*, *Async Operations*, *Scheduling Tools Never Prompt* and *A Blocked
Command Is Not a Blocked Capability*. The rules themselves are stated there, and
that is the copy every project reads at session start; this file is read on
demand, when a rule needs its evidence or its edge cases, and does not restate
them — each section names the rule it supports. The passages here were
moved out of those sections (#299); positional references ("above", "below")
were replaced with explicit section references, since their targets moved.

## Provenance and sinks

*Supports:* `directives/global.md` → *Behavior Rules* — when a value's provenance changes, re-audit its sinks in the same diff.

A widened writer changes the provenance of every existing read without touching
any of them. Interpolation that looked safe because the value came from a fixed,
known-safe set stops being safe the moment a change makes it user-editable — and
the sinks are unchanged, so nothing in them looks wrong.

## The scan is a report, not a test

*Supports:* `directives/global.md` → *Parallel Tasking via Subagents* — report the scan's result whenever a turn ends.

Why no turn-end SELF-check belongs there: a session grading its own turn also
decides what was on the list, so no wording of such a check binds. That nothing
enforces the scan is the honest state, not an oversight; #363 carries what would.

## Why independence decides

*Supports:* `directives/global.md` → *Parallel Tasking via Subagents* — judge candidates by independence, not availability.

- **Read-only investigation.** A read-only agent creates no merge conflict,
  which is why pointing one at a tree you are editing goes unnoticed: the tree
  is read as a mixture of revisions, and the answer comes back confidently
  wrong. ⚠️ Aiming an agent at your OWN work (`directives/global.md` → *Parallel Tasking via Subagents*) is exactly when
  this bites. (Making that safe by construction — snapshots, pinned checkouts,
  exclusive windows — is unsolved here; see #363.)
- **Implementation in an isolated worktree.** A revert done for a test inside a
  shared tree makes an unrelated concurrent run report a failure that is not
  real, and that false signal costs more than the parallelism saved.
- **Disjoint files in one tree.** Someone else's in-flight file is read as a
  mixture of revisions exactly like a concurrently edited tree, and code built
  on one is built on a revision that never existed. Staging, committing and the
  rest stay with the orchestrator because an index and a HEAD are shared even
  when no two agents touch the same file.

## Wake coverage

*Supports:* `directives/global.md` → *Async Operations*, item 1 — event wakes are primary, not sole; arm the check-in alongside them.

What `ci-monitor.yml` does and does not cover: it may still surface a cancelled
run as a `ci-failure` issue, but coverage depends on its watch list and on
whether anyone dispatches its manual scan — read that file rather than trusting
a summary. **None of it reaches the session waiting on the PR**, which is the
only part that bears on this rule. The seven ways a dispatched run emits no wake
are in `git.md` → *PR Lifecycle*, with their evidence in `docs/standards/pr-mechanics.md` →
*Wakes that never arrive*.

## The in-flight test

*Supports:* `directives/global.md` → *Async Operations*, item 2 — ask whether this run could end in a way that emits no wake.

"Does this outcome emit a wake?" is only knowable once the run is terminal, and
the decision to arm has to be made before that — a test that needs the answer it
is deciding about. `ci-notify` fires only on `conclusion == 'success'` and only
for workflows it watches by name, and any run can be cancelled — a superseding
push, a manual cancel, a runner loss — which → *Wake coverage* establishes emits
no PR wake. "I expect this one to pass" fails as a test because an anticipated
success that gets cancelled is the case that strands the session, and it is
indistinguishable in advance from the success that would have woken it.

## The settings block nobody noticed

*Supports:* `directives/global.md` → *Async Operations* (PR the current permissions block into an older repo) and *Scheduling Tools Never Prompt* (a repo with no settings file pre-approves nothing).

⚠️ **This instruction was ignored for a month and nobody noticed**, because
its trigger is a prompt the owner clicks rather than anything a session
sees. claude.insurance had NO `.claude/settings.json` at all through
2026-08-26 while claude.prop and claude.directives both carried the block,
so every scheduling call from that repo prompted, indefinitely, and the
cost landed on the owner instead of on any session's error log. A rule
whose violation is invisible to the only party who can fix it does not
get followed — which is why the rule makes the file's ABSENCE a Session Start
finding.

Read-only tools joined the allowlist later. Added 2026-08-26 on the owner's
instruction, after prompt fatigue reached four figures. Narrowed 2026-10-07:
the reads that return outsider-writable content left the template, which is
what a public repository carries, and a private repository may add them back
(`global.md` → *Scheduling Tools Never Prompt*). On a public repository those
reads prompt again; that cost was accepted.

A session that started before a widened allowlist landed keeps prompting until
restarted; that is the single largest source of repeat prompts, and it is not a
misconfiguration.

## Stale recorded SHAs

*Supports:* `directives/global.md` → *Async Operations* — resolve the head from the API at use time, never from the record.

The asymmetry is the whole point. An INVENTED identifier fails loudly: the API
has nothing to return, so a fabricated run ID 404s immediately and no harm is
done. A SUPERSEDED one does the opposite — it resolves perfectly and returns
real, well-formed, entirely valid data about the wrong commit. Not an error: a
correct answer to a question you no longer meant to ask. There is no failure to
catch, which is why this rule cannot live in error handling and has to live in
**where the identifier comes from**. None of the surfaces that hand you one is a
BAD record: each was accurate when written, which is exactly why the API agrees
with it.

Measured in `claude.prop` on 2026-08-23: five `check_suite.completed` events
across two PRs, every one naming a superseded head, four of which would have
merged a stale commit if read as clearance (`git.md` → *PR Lifecycle*). The
same day, `claude.directives`' own check-ins fired twice carrying SHAs three
commits behind, and one carried a claim a later round had already disproved.

## Mixed edit-and-delete commits

*Supports:* `directives/global.md` → *A Blocked Command Is Not a Blocked Capability* — a commit that both edits and deletes has no API equivalent.

Why there is no equivalent: `push_files` requires `content` on every entry, so
it cannot express a deletion, and `delete_file` handles one path and commits by
itself. Do not assume the API can be atomic across a mixed change.

## Mappings that look obvious and are wrong

*Supports:* `directives/global.md` → *A Blocked Command Is Not a Blocked Capability* — `git rm`, `git checkout -b` and `git merge` have no one-call API substitute.

All three are stated because a table invites the substitution. What each
substitution actually does:
- **`git rm` → `delete_file`.** `git rm` stages a deletion for a commit you have
  not written yet, alongside whatever else is in it; `delete_file` commits and
  pushes immediately, by itself (→ *Mixed edit-and-delete commits*).
- **`git checkout -b` → `create_branch`.** A session that substitutes it stays
  on its previous branch, usually `main`, and every later local commit, diff and
  status check reads the wrong branch.
- **`git merge` → `merge_pull_request`.** `git merge` usually means *bring the
  base branch into my working branch*; `merge_pull_request` does the opposite.

## The local checkout after an API write

*Supports:* `directives/global.md` → *A Blocked Command Is Not a Blocked Capability* — before resuming local work, make the checkout carry the API's commit.

A `git fetch` will not fix it: it advances `refs/remotes/origin/<branch>` while
local `HEAD` and the working tree stay on the pre-API commit.

**How to establish that the checkout carries the commit is not written here,
deliberately.** It depends on your checkout in ways this file cannot see —
whether the branch has unpushed commits, what the index flags and
sparse-checkout state are, which refspec the clone maps, what is gitignored.
Each of those silently breaks a different plausible check. Work it out against
the repository in front of you; a procedure copied from a directive that cannot
see your remotes is how you find out by running a gate against the wrong bytes.
