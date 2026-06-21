---
description: "Show all directives-toolkit commands and auto-skills as a clean menu — reads the live plugin so it never goes stale"
phase: cross-cutting
---
List every command and auto-skill the `directives-toolkit` plugin provides in
this session, as a menu **ordered by development-pipeline phase** (see
`docs/dev-pipeline.md`). **Read them live — never hardcode the list** so the
menu stays accurate as the toolkit changes:

1. Locate the plugin in this session and read each `commands/<name>.md` and
   `skills/<name>/SKILL.md` frontmatter — capture its `description` **and its
   `phase`**. In this repo the source is `plugins/directives-toolkit/`;
   downstream it lives wherever the plugin is installed — Glob for the
   `directives-toolkit` `commands/` and `skills/` dirs rather than assuming a
   path. If the plugin dir isn't reachable (installed outside the project
   working tree), fall back to enumerating the `directives-toolkit` commands and
   skills available in this session (group those under "Cross-cutting" if their
   phase can't be read).
2. Print one section **per phase, in pipeline order**:
   `Think → Plan → Build → Review → Test → Ship → Reflect → Cross-cutting`.
   Skip any phase with no items. Within each phase, one table sorted
   alphabetically, using each item's own `description` for the right column (do
   not paraphrase from memory); tag auto-skills with `(auto-skill)` so it's
   clear they fire on their own:

   ## <Phase>
   | Type this | What it does |
   |-----------|--------------|

End with: "Commands run when you type them; auto-skills fire on description
match. Phases mirror `docs/dev-pipeline.md`."

Scope: this lists the **directives-toolkit** (our custom toolkit) only. For the
full set including built-ins and other plugins, use Claude Code's `/help`.
