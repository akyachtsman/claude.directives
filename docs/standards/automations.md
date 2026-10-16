# Automations — Agent Session Standard

Automations run autonomously and only escalate to the human when a fix requires
judgement or production access beyond the session's scope.

---

## Automation 1 — GitHub Email Notifications (always on)

**Goal:** Deliver CI/CD failure emails without any setup beyond a one-time account preference.

**Implementation:** GitHub built-in — zero code, always on regardless of session state.

**Setup (one-time per GitHub account):**
`github.com` → avatar (top-right) → **Settings** → **Notifications**
→ scroll to **GitHub Actions** → enable **"Send notifications for failed workflows"**

Applies to all repos automatically.

---

## Watcher Rules — canonical

The one `workflow_run` watcher in the set, `qa-live`, obeys these rules. **They
are stated here and nowhere else.** Each workflow file and setup step carries the
ACTION it needs and points back here for the reasoning.

A watcher that resolves but never fires, or fires and asserts too little, is as
green as a healthy one — `code-review-standard.md` → *Fail-Open Guards*.

### W1 — Every watched name must resolve to a workflow this repo has

A `workflow_run` entry naming a workflow you did not install can never fire. It
is not harmless: by reading, it is indistinguishable from an entry that used to
fire and has silently stopped. One exception, and only one — names GitHub
itself manages, currently just `pages-build-deployment`. Everything else is
project-owned.

- Rename a workflow's `name:` and every watcher of it in the **same pull
  request**. A `name:` is also its check name, so a rename can additionally
  break branch-protection required checks.

### W2 — Pages has two sources, and only one name is ours to supply

The managed branch build is `pages-build-deployment`, created by GitHub — that
is the only Pages name every template can pre-fill. An Actions-sourced deploy
runs the project's own workflow: `Pages Deploy` when it is the shipped
`templates/workflows/pages-deploy.yml`, otherwise a `name:` this template set
cannot guess. Setting Settings → Pages → Source to "GitHub Actions" makes the
managed build inert, so a watcher naming only it stops firing with no error —
and a repo scaffolded on the Actions source from day one gets a watcher that has
never fired at all, with no "it used to work" phase to notice. On Actions-source
Pages, **add** your deploy workflow's exact `name:` to `qa-live.yml`.

⚠️ **"Add" is literal, and the existing arm is the load-bearing one.** Keep
`pages-build-deployment` on `qa-live`; the new name goes alongside. That arm
watches the **legacy managed build**, which `global.md` → *Hosting & Deployment* documents as still firing on a **repo
visibility flip even while Actions-source is configured** — unfiltered, and able
to finish later and republish the whole tree over a filtered copy. A reader who
*replaces* rather than adds keeps a green-looking watcher and deletes the only
thing that observes that republish live.

---

## Automation 5 — In-Session Reactive Subscription

When a Claude Code session opens a PR, it receives that PR's activity for fast
feedback. The subscription is **harness-side and automatic** — when to subscribe explicitly, and why never to unsubscribe from a PR you are driving: `git.md` → *PR Lifecycle*.
- Dropping it yourself leaves CI results and review rounds with no push signal
  at all; a scheduled check-in is not a substitute, because a timer cannot know
  whether anything changed
- CI results arrive as native `check_suite.completed` events; arm one
  `send_later` check-in as a safety net for a lost delivery
- Webhooks don't deliver new pushes or merge-conflict transitions, so re-check
  PR state on wake and, if nothing changed, re-arm and emit the heartbeat line
  (`global.md` → *Status Line on Every Stop*); never re-arm silently
- Codex's verdict is read directly from the PR (`git.md` → *PR Lifecycle*)

---

## Automation 6 — Cross-Session Messaging (session-to-session, standing)

**A standing feature of this account (owner ruling, 2026-10-06), with a heads-up
every time.** Before sending, tell the owner in your own session's chat which
session you are messaging and why, in one line; then send. The message carries
information only: the receiver acts in its own repo under its own rules
(`directives/global.md` → *One Session, One Repo*). Find the target with
`list_sessions` (read-only, pre-approved).

Where the sending session's toolset carries `send_message` (the
claude-code-remote MCP server's), that is the direct channel: it posts the message
into the target session as a user turn. Toolsets differ between sessions, so check
yours; where it is absent, one session can still message another:
`create_trigger` with the target's `persistent_session_id`, then `fire_trigger`,
then `delete_trigger`. `ListAgents` shows nothing (cloud sessions are not local
peers) and `SendMessage` fails, so without `send_message` this is the channel. It is written down here because it was not: the procedure
ran the fleet for a day while existing only inside chat messages, and the version
in circulation had the defect below.

**Send POKE-ONLY. Never give the trigger a `cron_expression` or a `run_once_at`.**
This one is **contractual, not observed** — the `create_trigger` schema says so
on `cron_expression`: *"Mutually exclusive with `run_once_at`. Omit both for a
poke-only Routine that never fires on its own."* And `run_once_at`'s own text
confirms the other half: *"After the one-shot **fires** the Routine disables
itself"* — it fires first, then disables. So a poke-only trigger cannot deliver
late by construction, and a missed `delete_trigger` is inert.

Give it a `run_once_at` and a missed delete becomes a **time bomb**: the
scheduled copy lands hours later carrying nothing that distinguishes it from a
live instruction. Under poke-only it cannot, which makes the delete tidiness
rather than load-bearing — the only version of the recipe that is safe by
construction instead of by discipline.

⚠️ **Note the two rules in this section carry DIFFERENT epistemic weight, and
filing them alike would misstate both.** Poke-only is a documented guarantee: it
will not quietly stop being true. The delivery correlation below is six samples
with no mechanism. Understating the first or overstating the second is the error
to avoid; `learnings.jsonl` scores only the second, deliberately.

**A fired trigger can silently fail to deliver, and the return value says so.**
`fire_trigger` returns `session_id`. Delivered into the persistent target ⇒ that
value carries the target's id with its prefix **SWAPPED**, not appended:
`session_<id>` → `cse_<id>`. Anything else ⇒ a fresh session ran the prompt and
nobody read it.

⚠️ **Compare the id AFTER the prefix — never the whole string.** A target
`session_01ABC` returns `cse_01ABC`, **not** `cse_session_01ABC`. This line
previously said *"`cse_` + the target's id verbatim"*, which describes an append;
a session applying that literally reads every SUCCESSFUL delivery as a mismatch,
and the remedy below for a mismatch is to re-send — so following it exactly
produces an unbounded loop of duplicate pokes at a target that received the
message the first time. **That is worse than the fault the check exists to
catch**: a lost send costs one message, this costs as many as the loop runs.
Found by `claude.trading` on 2026-08-26 by following the line as written, and
confirmed against three sends whose delivery had already been established
independently.

Then **re-send on a genuine mismatch** — a fresh session cannot coincidentally
carry the target's id, so a matching suffix is conclusive.

Measured across six sends between three sessions, with independent confirmation
from both peers: every matching id was received, every non-matching one was lost
— including a message a peer confirmed never arriving. Perfectly correlated with
passing `fire_trigger`'s optional `text` parameter — sends *with* it were lost,
sends without it landed — so **omit `text`**; put everything in the trigger's own
prompt. Six samples is strong for the correlation and thin for a mechanism, and
`learnings.jsonl` records it at that confidence deliberately.

Two consequences worth stating because both were learned the hard way:
- A lost send is **lost, not delayed**. Do not wait for it to turn up.
- The receiving session runs that turn possibly **without MCP connector tools**.
  Write the prompt so local work is still possible, and do not put the caveat in
  `text` — that is what loses the message.

**Why this section exists at all, which is the part worth carrying elsewhere.**
This procedure coordinated four sessions for a day while living only inside chat
messages. No checker could see it, no refresh could deliver it — and the only
copy in circulation was the defective one. So **every recipient followed it
correctly, and correct compliance is what propagated the defect.** That is a
sharper argument for pointer-not-value than the usual staleness one: the failure
mode is not that a copy drifts, it is that a wrong copy is obeyed faithfully and
its wrongness has no way to reach anyone. Any operating procedure two sessions
depend on belongs in a file under `docs/standards/`, not in the message that
first explained it.

---

## Activation Checklist for New Sessions

- [ ] Do **not** subscribe to open PRs as a blanket session-start step — subscription is harness-side on open. The one exception stands: a session TAKING OVER a PR it did not open subscribes explicitly (Automation 5)
- [ ] Read `CLAUDE.md` for full project context

---

## PR Lifecycle and Escalation Rules

Moved to the directives: the superseded-PR handoff comment to `directives/git.md` → *Superseded PRs*, the merge conditions to `directives/test.md` → *CI triage*, the post-merge live check to `directives/global.md` → *Async Operations*, and the automation triggers and always-escalate keywords to `directives/global.md` → *Escalation Rules*. CI triage, including when to trigger `qa-live.yml`: `docs/standards/ci-triage.md`.
