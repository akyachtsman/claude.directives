# claude.directives

Consolidated home for the company-wide Claude Code agent directives.

The exported, downstream-imported directives live in `directives/`:

- `directives/global.md` — global agent behavior standard
- `directives/git.md` — git/GitHub directive (PR lifecycle, conditional auto-merge, repo-settings preflight)
- `directives/design.md` — design method (per-project generative: tokens + `/design-intake`)
- `directives/test.md` — test / QA directive
- `directives/data.md` — data / backend directive (backend provider, keys, RLS, MCP config)

Repo-internal operating instructions are in `CLAUDE.md`, and project bootstrap
lives in `NEW-REPO-USER-INSTRUCTIONS.md`. Supporting directories:

- `plugins/directives-toolkit/` — the installable toolkit (commands, auto-skills,
  QA/data agents, guard hooks); this repo doubles as its plugin marketplace
- `docs/` — reference material, including the interactive repo map at
  `docs/site/repo-map.html` and the [AI-first working principles](docs/guides/ai-first-principles.md)
- `templates/` — installable workflows and the Playwright test kit

**Live demos:** https://akyachtsman.github.io/claude.directives/ — rendered UI
references, including the [interactive repo map](https://akyachtsman.github.io/claude.directives/docs/site/repo-map.html).
