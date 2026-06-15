---
description: "Show all directives-toolkit commands and auto-skills as a clean menu — reads the live plugin so it never goes stale"
---
List every command and auto-skill the `directives-toolkit` plugin provides in
this session, as a menu. **Read them live — never hardcode the list** so the
menu stays accurate as the toolkit changes:

1. Locate the plugin in this session and read each `commands/<name>.md` and
   `skills/<name>/SKILL.md` `description` frontmatter. In this repo the source
   is `plugins/directives-toolkit/`; downstream it lives wherever the plugin is
   installed — Glob for the `directives-toolkit` `commands/` and `skills/` dirs
   rather than assuming a path.
2. Print two alphabetically-sorted tables, using each item's own `description`
   for the right column (do not paraphrase from memory):

   ## Commands
   | Type this | What it does |
   |-----------|--------------|

   ## Auto-skills (fire on description match)
   | Skill | Fires when |
   |-------|------------|

End with: "Type a command name to run it; auto-skills fire on their own."

Scope: this lists the **directives-toolkit** (our custom toolkit) only. For the
full set including built-ins and other plugins, use Claude Code's `/help`.
