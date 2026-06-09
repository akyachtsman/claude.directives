# Claude Data & Backend Directives

## Purpose
Company-wide standards for data access and backend integration. Applies to every
project repo that needs persistence, auth, realtime, or storage. Project-level
`CLAUDE.md` may add specifics but must never relax the security rules here.

## Preferred Backend
- **Supabase is the default backend.** Reach for it before standing up any custom
  server or alternative managed backend.
- Use hosted Postgres directly via `supabase-js` or the Supabase MCP tools —
  prefer these over bespoke data layers.
- No other managed backend (Firebase, custom Express servers, etc.) without
  explicit approval at the project level.

## MCP Configuration
- Each repo configures its own Supabase MCP access in `.claude/mcp.json`.
- `.claude/mcp.json` is **per-repo and gitignored** — it holds connection setup
  and must never be committed. Add it to the project `.gitignore` during bootstrap.
- Treat MCP config as local session setup, not shared project state.

## Row-Level Security (RLS)
- **RLS is always enabled** on every table. No table ships with RLS off.
- Write explicit policies for every access pattern; default-deny is the baseline.
- A table with no policies returns no rows — that is intended, not a bug to be
  worked around by disabling RLS.

## Keys
- **Service-role key** — full access, bypasses RLS. **Server-side only**: store as
  the `SUPABASE_SERVICE_KEY` GitHub Actions secret, use it in workflows and server
  functions, and never ship it to the browser.
- **Publishable / anon key** — safe to expose **client-side**, because RLS is the
  enforcement boundary. Pair it with the `SUPABASE_URL` repo variable.
- Client-side safety depends entirely on RLS being correct. Never compensate for a
  missing or wrong policy by moving the service-role key client-side.

## Escalation
- Stop and ask before disabling RLS on any table.
- Stop and ask before using the service-role key anywhere a browser can reach it.
- Stop and ask before committing `.claude/mcp.json` or any key material.
