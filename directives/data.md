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
  the `DB_SERVICE_KEY` GitHub Actions secret, use it in workflows and server
  functions, and never ship it to the browser.
- **Publishable / anon key** — safe to expose **client-side**, because RLS is the
  enforcement boundary. Pair it with the `DB_URL` repo variable.
- Client-side safety depends entirely on RLS being correct. Never compensate for a
  missing or wrong policy by moving the service-role key client-side.

## Client Auth Pattern (static app + anon key)
The reference hardening recipe for the standard stack — static HTML/JS served
from Pages, anon key in the client, no Supabase Auth. Proven in production;
never ship `USING (true)` write policies instead of this.
- **Login** goes through a `SECURITY DEFINER` function (e.g.
  `login_with_pin(text)`): pin `search_path`, return only the columns the app
  actually consumes, and revoke EXECUTE from `authenticated` (Supabase
  default-grants functions broadly) so only `anon` can call it.
- **The credential column is never anon-readable**: revoke table SELECT and
  re-grant column-level SELECT on everything except the credential. (Filtering
  on a column requires SELECT on it — which is why login must be the function,
  not a client-side `.eq()` query.)
- **Writes**: `INSERT` constrained via `WITH CHECK` (row must reference an
  active actor; values bounded). `UPDATE`/`DELETE` restricted to the editable
  window (e.g. same-day rows). Column-level UPDATE grants for only the fields
  the app edits.
- **Rollout order matters**: apply the additive pieces first (function + new
  policies), deploy the app change, verify the **live served HTML** uses the
  new path — past the CDN cache window (~10 min) — and only then revoke the
  old access path. Each migration separate and reversible.
- **Verify after every step**: re-run the security advisors, and run the live
  QA suite against production before and after the revoke.
- **Record accepted residuals** in the project CLAUDE.md security-constraints
  section (e.g. editable-window rows remain anon-mutable, credential space is
  brute-forceable through the login function, public objects reachable by
  exact URL). RLS cannot rate-limit — say so rather than pretend.

## Server-side access (Next.js / production tier)
When a project graduates to the production tier (Next.js on Vercel — see
`global.md` → *Hosting & Deployment*), Supabase gains a **server side**; the rules
above still hold, plus:
- **Client components / the browser** — anon (publishable) key + RLS only, exactly
  as the static-app pattern above. RLS stays the enforcement boundary.
- **Server components, route handlers, server actions** — may use the
  **service-role** key, but it must be a **server-only environment variable**
  (e.g. a Vercel secret, *not* a `NEXT_PUBLIC_*` var), never imported into client
  code or shipped in the bundle. RLS stays enabled even server-side; reach for the
  service role only for genuinely privileged operations.
- **The `login_with_pin` / `SECURITY DEFINER` pattern above is the no-server
  baseline.** With a Next server you can additionally move privileged logic into
  server actions/route handlers — but never relax RLS because "the server checks it."
- Keep secrets out of the repo: server-only keys live in Vercel/CI env vars, the
  anon key + `DB_URL` stay as the repo variable; the `.claude/mcp.json` rule is
  unchanged.

## Escalation
- Stop and ask before disabling RLS on any table.
- Stop and ask before using the service-role key anywhere a browser can reach it.
- Stop and ask before committing `.claude/mcp.json` or any key material.
