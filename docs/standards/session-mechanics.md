# Session Mechanics

The reasoning, mechanism, measurements and history behind session-behaviour
rules in `directives/global.md` — *Behavior Rules*, *Parallel Tasking via
Subagents*, *Async Operations*, *Scheduling Tools Never Prompt* and *A Blocked
Command Is Not a Blocked Capability*. The rules themselves are stated there, and
that is the copy every project reads at session start; this file is read on
demand, when a rule needs its evidence or its edge cases. The passages here were
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

**Report the scan's result whenever a turn ends** — what you started, or what
blocks what you did not. ⛔ **This is a report, not a test, and no turn-end
SELF-check belongs here:** a session grading its own turn also decides what was
on the list, so no wording of such a check binds. ⚠️ **Nothing here enforces the
scan** — that is the honest state, not an oversight; #363 carries what would.

## Why independence decides

*Supports:* `directives/global.md` → *Parallel Tasking via Subagents* — judge candidates by independence, not availability.

- **Read-only investigation** — a census, an audit, *"is this claim actually
  true?"*. **Highest-yield category and the most under-used**, and any number
  run at once. ⛔ **Never point one at a tree you are editing.** They create no
  merge conflict, which is why this goes unnoticed: a tree read while it is
  being written is read as a mixture of revisions, and the answer comes back
  confidently wrong. ⚠️ Aiming an agent at your OWN work (`directives/global.md` → *Parallel Tasking via Subagents*) is exactly when
  this bites. (Making that safe by construction — snapshots, pinned checkouts,
  exclusive windows — is unsolved here; see #363.)
- **Implementation in an ISOLATED WORKTREE** — the default for anything that
  edits code while another run is in flight. A revert done for a test inside a
  shared tree makes an unrelated concurrent run report a failure that is not
  real, and that false signal costs more than the parallelism saved.
- **Disjoint files in one tree** — the ONE exception to that default, and it is
  a capability boundary, not a list of banned commands: an agent may EDIT ITS
  OWN FILES, and READ ONLY WHAT NO OTHER AGENT IS WRITING — someone else's
  in-flight file is read as a mixture of revisions exactly like a concurrently
  edited tree, and code built on one is built on a revision that never existed.
  Nothing else. ⛔ Staging, committing, checking out, reverting, stashing and
  running the suite are the ORCHESTRATOR's, after collection — an index and a
  HEAD are shared even when no two agents touch the same file.

## Wake coverage

*Supports:* `directives/global.md` → *Async Operations*, item 1 — event wakes are primary, not sole; arm the check-in alongside them.

⚠️ **Primary is not sole — event-driven does not mean "no scheduler."** A
wake only covers what something actually emits. A dispatched run on a PR
branch has seven verified ways to emit nothing (`git.md` → *PR Lifecycle*),
and a cancelled run emits no PR WAKE, since `ci-notify` fires only on
success. (`ci-monitor.yml`
may still surface it as a `ci-failure` issue — coverage depends on its watch
list and on whether anyone dispatches its manual scan; read that file rather
than trusting a summary. **None of it reaches the session waiting on the
PR**, which is the only part that bears on this rule.)
Since ANY run can be cancelled, the in-flight test (→ *The in-flight test*) resolves to *yes*
for essentially every CI run you wait on — so the check-in is armed alongside
the event wake rather than instead of it.

## The in-flight test

*Supports:* `directives/global.md` → *Async Operations*, item 2 — ask whether this run could end in a way that emits no wake.

**Ask the question you can answer while the run is still in flight.**
"Does this outcome emit a wake?" is only knowable once the run is
terminal, and the decision to arm has to be made before that — a test
that needs the answer it is deciding about. So the test is
**"could this run end in a way that emits no wake?"**, evaluated over
every conclusion still possible. `ci-notify` fires only on
`conclusion == 'success'` and only for workflows it watches by name, and
**any run can be cancelled** — a superseding push, a manual cancel, a
runner loss — which → *Wake coverage* establishes emits no PR wake. So the
answer for an in-flight CI run is essentially always yes: **arm the
check-in, and drop it when the outcome is terminal.** "PR-attached" is
not the test, "installed" is not the test, and "I expect this one to
pass" is not the test — an anticipated success that gets cancelled is the
case that strands the session, and it is indistinguishable in advance
from the success that would have woken it.

## The settings block nobody noticed

*Supports:* `directives/global.md` → *Async Operations* (PR the current permissions block into an older repo) and *Scheduling Tools Never Prompt* (a repo with no settings file pre-approves nothing).

⚠️ **This instruction was ignored for a month and nobody noticed**, because
its trigger is a prompt the owner clicks rather than anything a session
sees. claude.insurance had NO `.claude/settings.json` at all through
2026-08-26 while claude.prop and claude.directives both carried the block,
so every scheduling call from that repo prompted, indefinitely, and the
cost landed on the owner instead of on any session's error log. A rule
whose violation is invisible to the only party who can fix it does not
get followed. So: check for the file at Session Start — its ABSENCE, not
just its staleness, is the finding — and do not wait for a prompt you will
never observe.

Read-only tools joined the allowlist later. Added 2026-08-26 on the owner's
instruction, after prompt fatigue reached four figures.

Settings load at session start, so a widened allowlist reaches a session only on
its NEXT start — every session already running keeps prompting until restarted,
which is the single largest source of repeat prompts and is not a
misconfiguration. **A repo with no `.claude/settings.json` at all pre-approves
nothing**: claude.insurance was in that state on 2026-08-26 while its sibling
repos were not, so every scheduling call from that session prompted. Check for
the file's existence before diagnosing anything subtler.

## Stale recorded SHAs

*Supports:* `directives/global.md` → *Async Operations* — resolve the head from the API at use time, never from the record.

- **Any recorded SHA is stale from the moment it is written — and a stale one
  does not error.** The asymmetry is the whole point. An INVENTED identifier
  fails loudly: the API has nothing to return, so a fabricated run ID 404s
  immediately and no harm is done. A SUPERSEDED one does the opposite — it
  resolves perfectly and returns real, well-formed, entirely valid data about the
  wrong commit. Not an error: a correct answer to a question you no longer meant
  to ask. There is no failure to catch, which is why this rule cannot live in
  error handling and has to live in **where the identifier comes from**:
  **resolve the head from the API at use time, never from the record.** A
  recorded SHA tells you to go and check; it never tells you the answer. Every
  surface that hands you one is an instance of the same thing — an event
  payload's `head_sha`, a check-in prompt (`directives/global.md` → *Async Operations*, item 2), a PR body, a handoff or
  relay message (`directives/global.md` → *One Session, One Repo*) — and none of them is a BAD record:
  each was accurate when written, which is exactly why the API agrees with it.
  Measured in `claude.prop` on 2026-08-23: five `check_suite.completed` events
  across two PRs, every one naming a superseded head, four of which would have
  merged a stale commit if read as clearance (`git.md` → *PR Lifecycle*). The
  same day, `claude.directives`' own check-ins fired twice carrying SHAs three
  commits behind, and one carried a claim a later round had already disproved.

## Mixed edit-and-delete commits

*Supports:* `directives/global.md` → *A Blocked Command Is Not a Blocked Capability* — a commit that both edits and deletes has no API equivalent.

⚠️ **A commit that both edits and deletes has NO equivalent.** `push_files`
requires `content` on every entry, so it cannot express a deletion; `delete_file`
handles one path and commits by itself. A change mixing the two therefore lands
as **several commits**, and CI runs against each incomplete intermediate tree.
When that matters — a build that breaks unless the edit and the deletion land
together — do it in a real checkout, or sequence it so no intermediate commit
is broken. Do not assume the API can be atomic across a mixed change.

## Mappings that look obvious and are wrong

*Supports:* `directives/global.md` → *A Blocked Command Is Not a Blocked Capability* — `git rm`, `git checkout -b` and `git merge` have no one-call API substitute.

Three mappings that look obvious and are **wrong**, all stated because a table
invites the substitution:
- **`git rm` is NOT `delete_file`.** `git rm` stages a deletion for a commit
  you have not written yet, alongside whatever else is in it. `delete_file`
  commits and pushes immediately, by itself. Substituting it splits an
  intended atomic change (→ *Mixed edit-and-delete commits*).
- **`git checkout -b` is NOT `create_branch`.** `create_branch` creates the
  remote ref and nothing else — it does not move local `HEAD`. A session that
  substitutes it stays on its previous branch, usually `main`, and every later
  local commit, diff and status check reads the wrong branch. Either stay
  API-only and pass the branch explicitly on every call, or fetch and switch
  the local checkout before continuing.
- **`git merge` is NOT `merge_pull_request`.** `git merge` usually means
  *bring the base branch into my working branch*. `merge_pull_request` does
  the opposite and it **publishes**: it merges a PR into its base and closes
  it. Use it only when you actually mean to merge that PR, and only after its
  gates pass. There is no API equivalent for a local branch merge.

## The local checkout after an API write

*Supports:* `directives/global.md` → *A Blocked Command Is Not a Blocked Capability* — before resuming local work, make the checkout carry the API's commit.

The three write rows of the API table (`directives/global.md` → *A Blocked Command Is Not a Blocked Capability*) commit to the **remote**, and your local checkout does
not follow.

⚠️ **Your local checkout does not carry the change, and nothing tells you so.**
A `git fetch` will not fix it: it advances `refs/remotes/origin/<branch>` while
local `HEAD` and the working tree stay on the pre-API commit. Before resuming
local work — any diff, any edit, any gate script — make the checkout actually
carry that commit, and treat the API's returned SHA as the reference rather
than anything git has cached locally.

**How to establish that is not written here, deliberately.** It depends on your
checkout in ways this file cannot see — whether the branch has unpushed
commits, what the index flags and sparse-checkout state are, which refspec the
clone maps, what is gitignored. Each of those silently breaks a different
plausible check. Work it out against the repository in front of you; a
procedure copied from a directive that cannot see your remotes is how you find
out by running a gate against the wrong bytes.
