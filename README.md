# claude.directives

Consolidated home for the company-wide Claude Code agent directives.

The exported, downstream-imported directives live in `directives/`:

- `directives/global.md` — global agent behavior standard
- `directives/design.md` — UI design system
- `directives/test.md` — test / QA directive
- `directives/data.md` — data / backend directive (backend provider, keys, RLS, MCP config)

Repo-internal operating instructions are in `CLAUDE.md`, and project bootstrap
lives in `NEW-REPO-USER-INSTRUCTIONS.md`. Supporting directories:

- `plugins/directives-toolkit/` — the installable toolkit (commands, auto-skills,
  QA/data agents, guard hooks); this repo doubles as its plugin marketplace
- `docs/` — reference material, including the rendered design system reference at
  `docs/design-system.html`
- `templates/` — installable workflows and the Playwright test kit

**Live demos:** https://akyachtsman.github.io/claude.directives/ — rendered UI
references, including the [design system reference](https://akyachtsman.github.io/claude.directives/docs/design-system.html).
