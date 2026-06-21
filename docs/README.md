# docs/ — index

Reference material, grouped by role. This is **supporting** documentation; the
canonical exported directives live in `../directives/` (`global.md`, `design.md`,
`test.md`, `data.md`).

## Exported standards (downstream projects inherit these)
Referenced by the exported directives and the qa agents.

| File | What it covers |
|------|----------------|
| `automations.md` | The agent-session automation standard — email + CI/Codex monitors, in-session subscription, PR lifecycle, escalation rules, tool-use discipline, test-scenario bootstrap |
| `cicd-setup.md` | Canonical CI/CD install procedure — workflow templates to copy, monitors, secrets/variables, verification checklist |
| `ci-triage.md` | CI triage — expected vs real failures, two-tier CI, when to trigger `qa-live.yml` |
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

## This repo only (not inherited downstream)
| File | What it covers |
|------|----------------|
| `repo-monitors.md` | This repo's own infrastructure monitors (`ci-monitor`, `codex-monitor`, `pages-monitor`) |

## Site assets (GitHub Pages)
| File | What it is |
|------|------------|
| `design-system.html` | Rendered design-system showcase (the visual companion to `directives/design.md`) |
| `index.html` | Redirect so `/docs/` resolves to the site root gallery |

> Fill-in **templates** (project CLAUDE.md scaffold, PR checklist, test plan,
> implementation summary) live in `../templates/`, not here.
