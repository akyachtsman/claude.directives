# Accepted residuals

Security trade-offs the owner has explicitly accepted, with the reasoning. The
RULES these attach to live in the directives; this file holds the audit record
so the rule text stays short (`global.md` → *Plain Language First*: a rule
states the rule, its reasoning lives elsewhere). Internal-only — not exported.

## Scheduling-tool allowlist (owner-approved 2026-08-18)

Attaches to `global.md` → *Scheduling Tools Never Prompt*. Automated security
review flagged both of these; the owner accepted both after seeing them.

1. **Auto-allowed trigger mutation is a persistence vector.** Content that
   hijacked a session could schedule itself future instructions without a
   prompt. Accepted because the tools only message the owner's own sessions,
   `list_triggers` keeps the schedule auditable, and the owner chose the
   ergonomics explicitly — a per-call prompt defeats unattended monitoring,
   which is the whole point of self-scheduling.
2. **Carrying both server-name spellings widens the grant.** A future MCP
   server registering under the currently-unused spelling would inherit the
   allows. Accepted as unlikely: the owner controls their own MCP config.

Re-evaluate either if the remote toolset gains a tool that can reach beyond the
owner's own sessions, or if MCP server names stop being owner-controlled.

## Read-only tool allowlist (owner-approved 2026-08-26)

Attaches to the same rule. The owner asked to stop being prompted, having
clicked accept "over a 1000 times or more", and chose this scope over two wider
ones: pre-approve the scheduling tools plus tools that only ANSWER, and keep
everything that changes something gated.

Admitted: `list_sessions`, `get_session`, `list_repos`, `list_environments`, and
the GitHub MCP read surface (`pull_request_read`, `list_issues`, `issue_read`,
`get_file_contents`, `list_commits`, the `search_*` family, and the other
getters). The admission test is **"can it change anything a person would want to
be asked about"** — not "is it safe", which is a judgement call that drifts.

Refused, on the owner's own instruction and consistent with the 2026-07-12
ruling: `mcp__Supabase__deploy_edge_function` and any other live-backend deploy
(also given an explicit `permissions.ask` entry, belt-and-braces, since its gate
has now been affirmed twice); and the remote tools that mutate or widen a
session's reach — `add_repo`, `create_session`, `archive_session`,
`unarchive_session`, `interrupt_session`.

1. **Read-only is a property of today's tool, not of its name.** A tool admitted
   here could gain a mutating parameter in a later server version and keep its
   entry. Accepted: the list is enumerated rather than wildcarded, so a NEW tool
   is never auto-admitted, and a changed one is visible in the server's own
   release notes. Re-check the list when the GitHub or remote MCP server
   version changes.
2. **A wide read grant is a wide READ grant.** A hijacked session can now
   enumerate the owner's sessions, repos and environments, and read any file in
   an attached repo, without a prompt. Accepted: every one of those was already
   reachable by a session the owner was going to approve anyway — the prompts
   were being clicked, not read — and the honest position is that a prompt
   approved a thousand times unexamined provides no security, only the
   appearance of it. Removing it costs less than pretending it worked.

Re-evaluate if a tool on this list gains write behaviour, or if sessions begin
running against repos the owner does not own.
