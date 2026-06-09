# claude.directives

Consolidated home for the company-wide Claude Code agent directives.

The exported, downstream-imported directives live in `directives/`:

- `directives/global.md` — global agent behavior standard
- `directives/design.md` — UI design system
- `directives/test.md` — test / QA directive
- `directives/data.md` — data / backend directive (Supabase, RLS, MCP config)

Repo-internal operating instructions are in `CLAUDE.md`, and project bootstrap
lives in `NEW-PROJECT-QUICKSTART.md`. Supporting directories:

- `.claude/skills/` — personal skills, invoked by typing the skill name (type
  `my.list` for the menu); bootstrapped fresh from this repo each session
- `.claude/agents/` — agent definitions in purpose-based subfolders (`qa/`, `data/`)
- `docs/` — reference material, including the rendered design system reference at
  `docs/design-system.html`
- `templates/` — installable workflows, agents, and the Playwright test kit

**Live demos:** https://akyachtsman.github.io/claude.directives/ — rendered UI
references, including the [design system reference](https://akyachtsman.github.io/claude.directives/docs/design-system.html).
