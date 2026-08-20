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
