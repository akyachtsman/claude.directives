---
name: scope-chk
description: "Use BEFORE offering, promising, or starting work on any repository other than this session's — including when the user asks directly (\"also do this in my other repo\", or names another repo). Verifies true repo scope so cross-repo access is never overclaimed."
phase: cross-cutting
---
Establish and report the **real** repository scope of this session, so you never
offer cross-repo capability you can't deliver (the Repository Scope rule in
`global.md`). Quick, read-only. Run it, then report — do not guess.

Execute in order:

1. **In-scope repo(s).** Identify the repo(s) this session was OPENED for:
   - `git remote -v` — the cloned repo this session is working in.
   - The GitHub MCP is hard-scoped to the session's opened repo(s). A repo the
     MCP can merely see but that this session was not opened for is NOT
     actionable (`global.md` → *One Session, One Repo*) — acting on it
     mid-session is off-policy even where a tool call would succeed.

2. **Attach tools are not permission.** Check via **ToolSearch** whether the
   `add_repo` / `list_repos` tools (claude-code-remote server) actually exist in
   THIS session, and report their presence as a capability fact only —
   `global.md` → *One Session, One Repo* forbids attaching another repository
   mid-session either way. A request targeting a different repo is answered by
   naming the repo it belongs to and stopping, never by adding it.

3. **READ scope is a different thing — and it is never restricted for public
   repos.** Raw URLs, the public GitHub API, and codeload tarballs work from
   any session (`/do-repo` packages this). The MCP limit constrains ACTING
   (branch/push/PR/merge), not reading. Never report a public repo as
   inaccessible — fetch it and answer from data.

4. **Report** a compact verdict:
   - **In scope (can ACT on):** `<owner/repo …>`
   - **Readable regardless:** any public repo, via raw/API/tarball (`/do-repo`)
   - **Add-repo tools:** present | absent — either way attaching is off-policy
     (`global.md` → *One Session, One Repo*)
   - **Rule:** never offer to add, reach, or act on any repo not listed in
     scope; a cross-repo ask is redirected to that repo's own session.

Use it at **session start** to set the boundary up front, and **any time** you —
or the user — suspect drift toward promising cross-repo work. When in doubt about
another repo, run this before saying anything about it.
