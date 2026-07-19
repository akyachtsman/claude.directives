# docs/ — index

Reference material, split by audience. This is **supporting** documentation; the
canonical exported directives live in `../directives/` (`global.md`, `design.md`,
`test.md`, `data.md`).

**Provenance is now the directory structure** (the split `EXPORTS.json` encodes):
`standards/` and `guides/` are **exported** (downstream projects inherit or
reference them), `site/` holds the **GitHub Pages assets**, `internal/` is
**this-repo-only**. The four `*.html` files at this root are legacy-URL redirect
stubs kept so published `/docs/*.html` links keep resolving — edit the real pages
in `site/`.

## `standards/` — exported standards (downstream projects inherit these)
Referenced by the exported directives and the qa agents.

| File | What it covers |
|------|----------------|
| `standards/automations.md` | The agent-session automation standard — email + CI/Codex/Pages monitors, the Pages auto-retry, in-session subscription, PR lifecycle, escalation rules, tool-use discipline, test-scenario bootstrap |
| `standards/cicd-setup.md` | Canonical CI/CD install procedure — workflow templates to copy, monitors, secrets/variables, verification checklist |
| `standards/ci-triage.md` | **Project** CI triage — expected vs real Playwright failures, two-tier CI, when to trigger `qa-live.yml` (this repo's own self-test triage lives in `internal/repo-monitors.md`) |
| `standards/code-review-standard.md` | Blocking vs non-blocking review criteria and output format |

## `guides/` — exported working guidance and setup
| File | What it covers |
|------|----------------|
| `guides/ai-first-principles.md` | Nine working principles for collaborating with an AI agent (adapted from TechWolf's MIT-licensed AI-First Toolkit) — orientation, not enforced policy |
| `guides/dev-pipeline.md` | The toolkit as one ordered procedure (Think→…→Reflect) — phase map, hand-off artifacts, frontmatter schema, delegation map; the working spec behind the `phase`/`benefits-from` frontmatter |
| `guides/usage-guide.md` | How agents/skills bootstrap into a project, the `/sdd-loop` quickstart, and where reports go |
| `guides/cron-email-notifications.md` | Standing up the scheduled-job + email-notification kit |
| `guides/design-tooling.md` | Design generators (the `frontend-design` skill, wiring Google Stitch's remote MCP) and the `/design-intake` flow |

## `internal/` — this repo only (not inherited downstream)
| File | What it covers |
|------|----------------|
| `internal/repo-monitors.md` | This repo's own infrastructure monitors (`ci-monitor`, `codex-monitor`, `pages-monitor`) **and self-test triage** (the `ci-failure` / `codex-flagged` flow) |
| `internal/design-migration.md` | The per-project generative design migration (tokens + `/design-intake` + Stitch/frontend-design) — the record of the plan, now implemented |

## `site/` — GitHub Pages assets
| File | What it is |
|------|------------|
| `site/repo-map.html` | Interactive map of the whole repo — zoom/pan/search, self-contained (no CDN) |
| `site/logical-map.html` | The logical view — domains, compartments, swap classes, vendor sockets (the `EXPORTS.json` view); same engine as the repo map, cross-linked with it |
| `site/commands.html` | Commands reference — all 13 toolkit slash commands by pipeline phase, what each does and when to use it |
| `site/react-demo.html` | Live browser-only React button (vendored React, no build, no CDN) — demos the production-tier preview technique; pairs with `site/vendor/` |
| `site/index.html` | Demo gallery — links to the repo map, React preview, and commands reference (same list as the site-root `../index.html`) |
| `site/vendor/` | Same-origin vendored React (`react.production.min.js`, `react-dom.production.min.js`) + its README — the no-CDN dependency that makes `react-demo.html` work |
| `site/.htmlvalidate.json` | html-validate config for the site pages |

> Fill-in **templates** (project CLAUDE.md scaffold, PR checklist, test plan,
> implementation summary) live in `../templates/`, not here.
