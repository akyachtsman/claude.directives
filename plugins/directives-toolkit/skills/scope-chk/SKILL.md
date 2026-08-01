---
name: scope-chk
description: "Use BEFORE offering or promising work on any repository other than this session's — verifies true repo scope so cross-repo access is never overclaimed."
phase: cross-cutting
---
Establish and report the **real** repository scope of this session, so you never
offer cross-repo capability you can't deliver (the Repository Scope rule in
`global.md`). Quick, read-only. Run it, then report — do not guess.

Execute in order:

1. **In-scope repo(s).** Identify the repo(s) this session can actually act on:
   - `git remote -v` — the cloned repo this session is working in.
   - The GitHub MCP is hard-scoped to that repo (and any others explicitly
     configured for the session). These are the ONLY repos you can read, write,
     branch, or open PRs against.

2. **Can other repos be added?** Check via **ToolSearch** whether the
   `add_repo` / `list_repos` tools (claude-code-remote server) actually exist in
   THIS session:
   - If `list_repos` exists → run it and list the repos that `add_repo` could pull
     in.
   - If they are **absent** → cross-repo is impossible here; another repo can only
     be worked on from a session scoped to it. Do **not** offer to "add" it.

3. **READ scope is a different thing — and it is never restricted for public
   repos.** Raw URLs, the public GitHub API, and codeload tarballs work from
   any session (`/do-repo` packages this). The MCP limit constrains ACTING
   (branch/push/PR/merge), not reading. Never report a public repo as
   inaccessible — fetch it and answer from data.

4. **Report** a compact verdict:
   - **In scope (can ACT on):** `<owner/repo …>`
   - **Readable regardless:** any public repo, via raw/API/tarball (`/do-repo`)
   - **Add-repo capability:** available → `<addable repos>` | **NOT available**
   - **Rule:** do not offer to add, reach, or act on any repo not listed above
     unless `add_repo` was confirmed available.

Use it at **session start** to set the boundary up front, and **any time** you —
or the user — suspect drift toward promising cross-repo work. When in doubt about
another repo, run this before saying anything about it.
