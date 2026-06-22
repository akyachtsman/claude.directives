# docs/ — index

Reference material, grouped by role. This is **supporting** documentation; the
canonical exported directives live in `../directives/` (`global.md`, `design.md`,
`test.md`, `data.md`).

**Provenance:** files at the `docs/` root are **exported / shared** (downstream
projects inherit or reference them) or **site assets**; **this-repo-only** docs
live under `docs/internal/`.

## Exported standards (downstream projects inherit these)
Referenced by the exported directives and the qa agents.

| File | What it covers |
|------|----------------|
| `automations.md` | The agent-session automation standard — email + CI/Codex monitors, in-session subscription, PR lifecycle, escalation rules, tool-use discipline, test-scenario bootstrap |
| `cicd-setup.md` | Canonical CI/CD install procedure — workflow templates to copy, monitors, secrets/variables, verification checklist |
| `ci-triage.md` | **Project** CI triage — expected vs real Playwright failures, two-tier CI, when to trigger `qa-live.yml` (this repo's own self-test triage lives in `internal/repo-monitors.md`) |
| `code-review-standard.md` | Blocking vs non-blocking review criteria and output format |

## Working guidance
| File | What it covers |
|------|----------------|
| `ai-first-principles.md` | Nine working principles for collaborating with an AI agent (adapted from TechWolf's MIT-licensed AI-First Toolkit) — orientation, not enforced policy |
| `dev-pipeline.md` | The toolkit as one ordered procedure (Think→…→Reflect) — phase map, hand-off artifacts, frontmatter schema, delegation map; the working spec behind the `phase`/`benefits-from` frontmatter |

## Setup guides
| File | What it covers |
|------|----------------|
| `usage-guide.md` | How agents/skills bootstrap into a project, the `/sdd-loop` quickstart, and where reports go |
| `cron-email-notifications.md` | Standing up the scheduled-job + email-notification kit |
| `design-tooling.md` | Design generators (the `frontend-design` skill, wiring Google Stitch's remote MCP) and the `/design-intake` flow |

## Internal — this repo only (not inherited downstream)
Under `docs/internal/`.

| File | What it covers |
|------|----------------|
| `internal/repo-monitors.md` | This repo's own infrastructure monitors (`ci-monitor`, `codex-monitor`, `pages-monitor`) **and self-test triage** (the `ci-failure` / `codex-flagged` flow) |
| `internal/design-migration.md` | The per-project generative design migration (tokens + `/design-intake` + Stitch/frontend-design) — the record of the plan, now implemented |

## Site assets (GitHub Pages)
| File | What it is |
|------|------------|
| `repo-map.html` | Interactive map of the whole repo — zoom/pan/search, self-contained (no CDN) |
| `index.html` | Redirect so `/docs/` resolves to the site root gallery |

> Fill-in **templates** (project CLAUDE.md scaffold, PR checklist, test plan,
> implementation summary) live in `../templates/`, not here.
