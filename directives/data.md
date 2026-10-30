# Claude Data & Backend Directives

## Purpose
Company-wide standards for data access and backend integration. Applies to every
project repo that needs persistence, auth, realtime, or storage. Project-level
`CLAUDE.md` may add specifics but must never relax the security rules here.

## Preferred Backend (owner ruling, 2026-08-22)
- **Supabase is THE backend, permanently** — chosen, not inherited, and kept
  until something better appears. Reach for it before standing up any custom
  server or alternative managed backend.
- **Do not re-propose an alternative** without naming the specific capability
  Supabase lacks. "Evaluated and rejected" applies here as it does to the
  framework tier (`global.md` → *Hosting & Deployment*): a session preferring a
  different stack is not a reason, and neither is a general comparison.
- Use hosted Postgres directly via `supabase-js` or the Supabase MCP tools —
  prefer these over bespoke data layers.
- No other managed backend (Firebase, custom Express servers, etc.) without
  explicit approval at the project level.

## MCP Configuration
- **Web sessions** (Claude Code on the web) reach Supabase through the Supabase
  connector: no project file is needed or created there.
- **CLI / desktop sessions** configure Supabase MCP access per repo in `.mcp.json`
  at the repo root — the project-scope file Claude Code reads (`.claude/mcp.json`
  is never read; verified 2026-10-08 against code.claude.com/docs/en/mcp).
- Wherever it exists, `.mcp.json` is **gitignored** (owner ruling, 2026-10-08) —
  it holds connection setup, which for Supabase can include an access token, and
  must never be committed. Add it to the project `.gitignore` during bootstrap,
  so a CLI/desktop copy is ignored from the start. Claude Code's docs suggest
  committing a project `.mcp.json` that holds no secrets; this standard does not,
  because the only sessions that need the file are local ones holding
  credentials.
- Treat MCP config as local session setup, not shared project state.
- **Destructive SQL from a Claude project thread (measured 2026-10-30).** The
  hosted Supabase MCP server pauses `execute_sql` and `apply_migration` with a
  form question ("This SQL includes destructive operations ...") whenever its
  detector fires: a statement that starts with `DROP`, `DELETE` or `TRUNCATE`,
  an `ALTER TABLE ... DROP COLUMN`, an `UPDATE` with no `WHERE`, or an `EXECUTE`
  of a string that starts so — statements inside a function or `DO` body
  included, since the detector splits the text on `;`. A statement that starts
  with `REVOKE` is not one, so the *Supabase Defaults* migration never asked
  (prop, insurance, APFP and trade all applied it through the connector), and
  building `TRUNCATE` inside an `EXECUTE` string changed nothing. The terminal
  and a claude.ai chat draw the form and the owner answers it. A project
  thread, a Cowork session and a Routine run Claude Code remotely: the client
  tells the server it can show a form but has nowhere to draw it, so nobody
  can answer and the call ends at the 60-second tool timeout ("The server asked
  the user a question, and no answer came") — trade's `desk_024`, whose
  function bodies hold `delete` (2026-10-27); reproduced in claude.directives
  with a `delete ... where false` (2026-10-30); anthropics/claude-code#88901 and
  #94806, open and unanswered. The way through is Supabase's own documented
  opt-out, set once by the owner on the claude.ai connector (*Supabase
  connector setup* below): with `skip_elicitations=apply_migration`, a
  committed migration applies from a thread with no question. The approval the
  form stood for is the owner's go-ahead in the thread, which
  *Reversible-by-Design Backend Changes* requires whether or not a form
  appears. `execute_sql` keeps the form, so ad hoc destructive SQL still cannot
  run from a thread: put it in a migration, or hand the owner the SQL unchanged
  to paste into the Supabase Dashboard's SQL Editor; after an editor paste the
  committed file stays the record, since `list_migrations` does not list SQL
  run in the editor. Either way, verify with a read-only query through the
  connector. **Never reword SQL to slip past the detector** (a `DROP` assembled
  from pieces, say): the detector is a guardrail Supabase itself calls
  incomplete, and dodging it is a knowing deviation (`global.md` → *A Knowing Deviation Is an Escalation*).
- **Supabase connector setup (owner, once per claude.ai account; ruling
  2026-10-30).** The Supabase connector every project thread uses is a
  **custom** connector named exactly `Supabase` — the name is the tool prefix,
  so `mcp__Supabase__*` keeps resolving in the toolkit's agent and settings —
  with the URL `https://mcp.supabase.com/mcp?skip_elicitations=apply_migration`
  in place of the directory entry. Supabase documents the parameter for its
  hosted server (its MCP docs page, "Skip form confirmations"); it names tools, is
  case-sensitive, and has no `all`. Do not add `execute_sql` to it: that
  removes the last server-side check on ad hoc SQL from a thread. A terminal
  session's `.mcp.json` carries no such parameter, so the form still shows
  there. Proof that the setup holds: a thread applies a committed migration
  holding a `DROP ... IF EXISTS` through `apply_migration` and gets a result,
  not a timeout.

## Row-Level Security (RLS)
- **RLS is always enabled** on every table. No table ships with RLS off.
- Write explicit policies for every access pattern; default-deny is the baseline.
- A table with no policies returns no rows — that is intended, not a bug to be
  worked around by disabling RLS.

## Keys
- **Service-role key** — full access, bypasses RLS. **Server-side only**: store
  as the `DB_SERVICE_KEY` GitHub Actions secret, use it in workflows and server
  functions, and never ship it to the browser.
- **Publishable / anon key** — safe to expose **client-side**, because RLS is the
  enforcement boundary. Pair it with the project URL: the `DB_URL` repo
  variable in workflows; committed in client code on the no-build stack, where
  a page cannot read a repo variable (`global.md` → *Backend*).
- Client-side safety depends entirely on RLS being correct. Never compensate for
  a missing or wrong policy by moving the service-role key client-side.

## Client Auth Pattern (static app + anon key)
The reference hardening recipe for the standard stack — static HTML/JS served
from Pages, anon key in the client, no Supabase Auth (owner ruling, 2026-10-12:
the company-wide stack). Never ship `USING (true)`
write policies instead of this.
- **Login** goes through a `SECURITY DEFINER` function (e.g.
  `login_with_pin(text)`): pin `search_path`, return only the columns the app
  actually consumes, and make `anon` the only caller:
  `REVOKE EXECUTE ON FUNCTION login_with_pin(text) FROM PUBLIC, authenticated;`
  then `GRANT EXECUTE ON FUNCTION login_with_pin(text) TO anon;`. Revoking from
  `authenticated` alone is not enough: Postgres grants EXECUTE on every new
  function to `PUBLIC`, which `authenticated` inherits, and Supabase also
  default-grants it to `anon`, `authenticated` and `service_role` (Supabase
  advisor lints 0028/0029, which pair for exactly this reason).
- **The credential column is never anon-readable**: revoke table SELECT and
  re-grant column-level SELECT on everything except the credential. Filtering on
  a column requires SELECT on it — which is why login must be the function, not
  a client-side `.eq()` query.
- **Writes**: `INSERT` constrained via `WITH CHECK` (row must reference an active
  actor; values bounded). `UPDATE`/`DELETE` restricted to the editable window
  (e.g. same-day rows). Column-level UPDATE grants for only the fields the app
  edits.
- **Rollout order matters**: apply the additive pieces first (function + new
  policies), deploy the app change, verify the **live served HTML** uses the new
  path — past the CDN cache window (~10 min) — and only then revoke the old
  access path. Each migration separate and reversible.
- **Verify after every step**: re-run the security advisors, and run the live QA
  suite against production before and after the revoke.
- **Record accepted residuals** in the project CLAUDE.md security-constraints
  section (e.g. editable-window rows remain anon-mutable, credential space is
  brute-forceable through the login function, public objects reachable by exact
  URL). RLS cannot rate-limit — say so rather than pretend.

## Secret Columns (owner ruling, 2026-10-27, from the APFP project)
A row policy decides *which rows* a caller reads, never *which columns*: a secret
kept in an ordinary column is readable by every role that can read its row. An
audit that looks only for cross-tenant leaks never sees that (APFP: every staff
role in a branch could read suppliers' website passwords). So every security
audit of a project's backend runs these four checks, and so does any change that
adds a column holding a secret, before it merges. A project with no backend
records N/A.
1. **List every secret column** — passwords, logins for outside services, API
   keys, tokens, PINs, account numbers: anything that grants access or names a
   financial account. Include columns added since the last audit.
2. **Check every reader inside the tenant, not only across tenants.** For each
   secret column, name which roles in the same tenant and branch (whatever scope
   the app partitions by) can read it, through every path: direct table reads,
   views and functions/RPCs. Test as the lowest role, not only the owner. A
   Postgres view runs as its owner unless `security_invoker` is set, and a
   `SECURITY DEFINER` function reads past every grant and policy, so a lock on
   the table does not cover either one.
3. **Lock each one behind a named permission** — a column-level grant that leaves
   the secret out, plus a `SECURITY DEFINER` function that returns it only to
   holders of that permission, for their own scope (the shape *Client Auth
   Pattern* uses for the credential column; on another backend, its equivalent).
   A row policy alone is never the lock: it cannot hide one column of a row it
   lets through.
4. **A "readable by all, tighten later" note fails the audit unless it is on the
   accepted-risks list.** Search code, migrations and comments for any deferral
   of tightening ("for now", "if the threat model changes", a TODO beside a grant
   or policy). Each one is either fixed or recorded in the project CLAUDE.md
   security-constraints section (*Record accepted residuals* above). A deferral
   that lives only in a comment is a finding, not an accepted risk.

## Supabase Defaults (owner ruling, 2026-10-27, from the prop and trade audits)
A new Supabase project grants the browser roles more than any app uses, some of
it out of the project's reach, and ships one Auth protection off. Every security
audit of a Supabase backend runs the checks below, beside *Secret Columns*; a new
project applies part 1 in its first migration.
1. **Revoke the table privileges the browser never uses.** Supabase's default
   privileges give `anon` and `authenticated` every privilege on each new table
   in `public`, including `TRUNCATE`, `REFERENCES` and `TRIGGER`. `TRUNCATE`
   empties a table without consulting row-level security (prop's audit), so a
   correct policy does not cover it; PostgREST cannot send it, but anything that
   runs SQL as those roles can. Revoke all three, now and for future tables,
   in a migration whose header names the inverse (`GRANT` the same). Worked
   example: prop's migration `0003_revoke_properties_truncate` (claude.prop#139)
   revoked `TRUNCATE` on its one table, proven live by both roles getting
   permission denied; the shape below also covers the other two and every
   table created later:
   ```sql
   REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
     REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;
   ```
   On Postgres 17 or later, add `MAINTAIN` to both lists and to the checks
   below (Supabase grants it there too: prop, insurance and APFP, 2026-10-29);
   older versions reject the word. The statements start with `REVOKE` and `ALTER
   DEFAULT PRIVILEGES`, not `TRUNCATE`, so the connector's destructive-SQL
   detector never fires on them (*MCP Configuration* above): apply the migration
   through the connector from any session. A project gate that fails closed on `ALTER DEFAULT
   PRIVILEGES` (a migration privilege scanner, say) must accept this revoke-only
   form rather than block it (insurance, 2026-10-29). The first check returns
   no rows when existing tables hold:
   ```sql
   SELECT c.oid::regclass AS object, r.role, p.priv
   FROM pg_class c
   CROSS JOIN (VALUES ('anon'), ('authenticated')) r(role)
   CROSS JOIN (VALUES ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
     AND has_table_privilege(r.role, c.oid, p.priv);
   ```
   That query sees only tables that exist, so a missed `ALTER DEFAULT
   PRIVILEGES` passes it until the next table arrives. The second check reads
   the defaults themselves and must return no rows too:
   ```sql
   SELECT a.grantee::regrole AS role, a.privilege_type
   FROM pg_default_acl d, aclexplode(d.defaclacl) a
   WHERE d.defaclrole = 'postgres'::regrole
     AND d.defaclnamespace = 'public'::regnamespace
     AND d.defaclobjtype = 'r'
     AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole)
     AND a.privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER');
   ```
   The query reads only `postgres`'s defaults, on purpose. `supabase_admin`
   keeps default privileges of its own in `public` that grant the browser roles
   everything on tables it creates, and `postgres` is not a member of
   `supabase_admin`, so it cannot revoke them (prop, insurance and APFP,
   2026-10-29). Without the filter the query returns those rows; they are an
   accepted residual, recorded in the project CLAUDE.md beside the pg_net entry,
   not a finding to chase. They reach nothing while `supabase_admin` owns no
   object in `public`, so the third check confirms that, and returns no rows
   when it holds:
   ```sql
   SELECT c.oid::regclass AS object, c.relkind
   FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
     AND c.relowner = 'supabase_admin'::regrole;
   ```
   A row is a finding to raise with the owner, not to fix in a migration: the
   object's grants are `supabase_admin`'s, so `postgres` cannot revoke them
   either.
2. **Record pg_net's queue as an accepted risk, with the rules that keep it
   safe.** pg_net's `net.http_request_queue` holds each queued request's headers
   (for a cron call, the secret decrypted from Vault) and carries a `PUBLIC`
   grant owned by `supabase_admin`, which the project's `postgres` role cannot
   revoke (trade's audit; every project with pg_net installed has it). It is
   unreachable only while `net` is not an exposed API schema. So a project with
   pg_net lists it in its CLAUDE.md security-constraints section (*Record
   accepted residuals* above) together with these three rules, and the audit
   confirms each still holds:
   - never expose `net`, `extensions`, `cron` or `vault` through the Data API;
   - never enable `pg_graphql` without re-running this audit first;
   - never write a function in an exposed schema that reads `net.*`.
   A project without pg_net records N/A.
3. **Leaked-password protection, where the project uses Supabase Auth
   passwords.** The security advisor flags it when off (prop's audit). It is a
   Dashboard setting under Auth and needs the Pro plan or above. Read the
   organization's plan with the connector's `get_organization` rather than
   guessing it: on Pro or above the setting is the owner's to switch on, and
   stays a finding until it is; on the Free plan, record it as an accepted
   residual rather than upgrading for it without the owner's ruling. A project
   without Supabase Auth passwords (the PIN pattern above) records N/A.

## Reversible-by-Design Backend Changes
Every Supabase change must be undoable by a later session with no memory of this
one:
1. **Everything through versioned migrations** — schema, RPCs, RLS policies,
   grants. Never mutate the backend ad-hoc; the migration history (repo +
   `list_migrations`) IS the undo documentation.
2. **Pair backend and repo in one PR.** A PR that changes an edge function or
   migration carries the versioned source in the same diff, so `git revert`
   restores the exact prior source to redeploy from.
3. **State the inverse at change time.** Each migration's header comment names
   its compensating action ("revert: DROP FUNCTION x; restore y from migration
   desk_004").
4. **Additive over destructive.** Prefer deprecating (rename, null, ignore) over
   DROP/DELETE. Anything that destroys data needs explicit owner approval before
   it is applied to the live database — approval governs the operation, never
   the merge (`git.md` → *Conditional Auto-Merge on Green*) — and note that
   undo = backups/PITR only, not a migration.

**Revert procedure** (when the owner says "undo PR #N"):
1. `git revert` the squash commit (or GitHub's Revert button) → PR → green → merge.
2. Write + apply the compensating migration from the inverse noted in step 3
   above (or reconstruct prior definitions from migration history).
3. Redeploy any affected edge function from the reverted repo source.
4. Verify: `get_advisors` clean, spot-check the restored RPC/table via
   `execute_sql`, and confirm the live site against the reverted Pages deploy.

(Merge timing for backend changes is governed by `git.md` → *Conditional Auto-Merge on Green* — backend PRs merge on green like every other class, and
this section is what makes that safe: whatever merged can be walked back.
Applying the change to the live database still follows the escalation rules
here.)

## Escalation
- Stop and ask before adopting any backend other than Supabase, or adding a
  second one alongside it (→ *Preferred Backend*).
- Stop and ask before disabling RLS on any table.
- Stop and ask before using the service-role key anywhere a browser can reach it.
- Stop and ask before committing `.mcp.json` or any key material.
