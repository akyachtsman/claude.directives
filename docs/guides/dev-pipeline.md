# Development Pipeline — the toolkit as one ordered procedure

This is the **working spec** for how `directives-toolkit` commands, skills, and
agents compose into a single, ordered project-development procedure — a *chain*,
not a menu. It is synthesised from three sources, keeping our spine and
importing only browser-only-safe *methods*:

- **our `/sdd-loop` + inherited directives** — the spine (constitution-driven,
  artifact-chained, already delegating review/test);
- **`obra/superpowers`** (v6.0.3, MIT) — the lean Markdown discipline
  (description-as-trigger, file-based handoff artifacts, verification gates);
- **`garrytan/gstack`** (MIT) — the methodology shape (forcing questions →
  multi-lens review → compounding memory → staleness-gated ship). Its thick
  Bun/TypeScript runtime (browser daemon, redaction server, iOS, evals) is
  **deliberately not adopted** — it cannot run in a browser-only session.

> **Constraint that governs every choice here:** browser-only (Claude Code Web,
> no terminal/CLI). Every step below is plain Markdown methodology, repo files,
> delegated official plugins, or MCP/CI — never a local build step or daemon.

## The pipeline at a glance

| # | Phase | Command / skill / agent | Status | Hand-off artifact |
|---|-------|-------------------------|--------|-------------------|
| 0 | **Think** | `/diagnose` | exists | `brief.md` |
| 1–3 | **Plan** | `/sdd-loop` (`/kickoff`) | exists — gated | `spec.md → plan.md → tasks.md` |
| 4 | **Plan-gate** | `/sdd-loop analyze` | exists | `analysis.md` |
| 5 | **Build** | `/design-intake` (look-gate) · `/sdd-loop` implement | exists — gated | `design.md` + built pages |
| 6 | **Review** | `pr-review-toolkit`, `/code-review`, `/security-review`, `codex-monitor`; `/audit-repo` (drift) | **delegated** | `.agent-reports/` / `review.md` |
| 7 | **Test** | `qa-pipeline`, `test-verifier`, `ui-tester`, `/commit-chk` | exists — gated | `qa.md` |
| 8 | **Ship** | `push-gate` hook, `update-pages`, `ci/pages-monitor` (liveness folded into `/env-chk`) | exists — gated | `ship.md` |
| 9 | **Reflect** | `/learn` (alongside `/handoff-session`) | exists | `learnings.jsonl` |
| — | **Cross-cutting** | `/env-chk`, `scope-chk` (preflight); `/refresh-repo` (re-sync); `/my-list`, `/do-repo`, `doc-comp` (utilities) | exists | — |

## The artifact chain

The chain is the point: each phase **reads the prior artifact and writes its
own**, so context flows through files, not through one ballooning conversation
(the superpowers anti-context-pollution idea; the gstack handoff graph).

```
specs/<slug>/
  brief.md       ← 0 Think    (/diagnose)
  spec.md        ← 1 specify+clarify (WHAT/WHY)
  plan.md        ← 2 plan + one adaptive plan-review (HOW)
  tasks.md       ← 3 tasks (2–5 min each)
  analysis.md    ← 4 analyze (cross-artifact consistency gate)
  design.md      ← 5 Build (/design-intake look-gate → tokens.css + components.css)
  review.md      ← 6 review findings (AUTO-FIX vs ASK)
  qa.md          ← 7 test report (verification-before-completion)
  ship.md        ← 8 ship record (PR URL + deploy SHA + live-check)
learnings.jsonl  ← 9 Reflect (repo-root, append-only, auto-consulted)
```

`benefits-from` frontmatter declares each edge so the chain is machine-checkable
(`check-plugin.js` fails if an edge points at a deleted/renamed node).

## Per-phase detail

### 0 · Think — `/diagnose`
Force the problem to be understood before any code. **Method imported:** gstack
`office-hours` six forcing questions + superpowers `brainstorming`
one-question-per-message, *alternatives mandatory*, no "too simple" exemption —
**stripped of the YC/startup framing**. Writes `brief.md`; gates entry to
`specify`. Browser-only: pure Markdown + `AskUserQuestion`.

### 1–3 · Plan — `/sdd-loop specify|clarify|plan|tasks` *(exists — gated)*
Keep our WHAT/HOW split and the constitution (inherited directives) as binding
constraints. **Methods imported:** gstack's CEO/design/eng triple plan-review
collapsed into **one adaptive review** (a fresh subagent scores `plan.md` 0–10,
revises in place under ~8, forces a data-flow/failure-mode note); superpowers
`writing-plans` **2–5 min task granularity** (each task = failing test →
implement → verify → commit) and its **no-placeholder self-review** (reject
"TBD" / "similar to Task N").

### 4 · Plan-gate — `/sdd-loop analyze` *(exists)*
Cross-artifact consistency. **Method imported:** gstack's **verification gate** —
every finding must quote the motivating code or be suppressed; split **AUTO-FIX
vs ASK**.

### 5 · Build — `/design-intake` + `/sdd-loop` implement *(exists — gated)*
Where the chosen look becomes a reusable contract and the pages get built.
`/design-intake` (per `design.md`) imports a look — image / Stitch / Figma, or a
first direction generated from a few taste questions — distills it to
`styles/tokens.css` + `styles/components.css` + an approved reference page (the
**look-gate**: sign off before building out, since the look is cheapest to fix on
one page), and writes `specs/<slug>/design.md`. `/sdd-loop` then implements the
remaining tasks against that contract so every page matches. Browser-only: plain
semantic HTML/CSS, no framework. Non-UI work skips the design-intake half and
goes straight to implement.

### 6 · Review — official plugins + monitors *(delegated — do not rebuild)*
This is already gstack's multi-lens + Codex second opinion, inherited:
`pr-review-toolkit` (code-reviewer, silent-failure-hunter, type-design-analyzer,
pr-test-analyzer), the built-in `/code-review` and `/security-review`, and
`codex-monitor.yml`. `/audit-repo` covers directive↔code drift only. **Method to
import:** superpowers `receiving-code-review` **anti-sycophancy** rule (no
"You're absolutely right!", restate the requirement, push back with technical
reasoning) — added as a review-handling directive.

### 7 · Test — `qa-pipeline` / `test-verifier` / `ui-tester` *(exists — gated)*
**Methods imported:** superpowers `verification-before-completion` as a hard
gate (identify the proving command, run it *fresh*, read full output, *then*
claim done); gstack **circuit-breakers** (stop after 3 failed fix attempts —
already our escalation rule; cap total fixes; flag large/unrelated diffs). The
two-tier CI (`qa.yml` static = free, `qa-live.yml`/Playwright = gated) already
mirrors gstack's tiered testing; the `claude -p` cost-capped eval harness is
**rejected** (CLI/API-billed).

### 8 · Ship — `push-gate` + `update-pages` + `pages-monitor` *(exists — gated)*
**Method imported:** gstack **Review Readiness staleness gate** —
`pr-readiness-reviewer` blocks "ready" unless `review.md` is recent and clean.
Our `push-gate` hook + PR lifecycle + `pages-monitor` already cover gstack's
land-and-deploy + canary.

### 9 · Reflect — `/learn` *(alongside `/handoff-session`)*
Compounding institutional memory. **Method imported:** gstack `learnings.jsonl`
— append-only, **typed** (pattern / pitfall / preference / architecture / tool),
**confidence 1–10**, file attribution, latest-key-wins; auto-consulted before
recommendations. Today `/handoff-session` is a one-shot snapshot; `/learn` makes
it compound. Browser-only: a repo file + a skill that greps it.

## Frontmatter schema

Every command and skill carries:

| Field | Required | Purpose |
|-------|----------|---------|
| `description` | yes | what it does (and, for skills, the auto-trigger) |
| `phase` | yes | pipeline position — one of `think · plan · build · review · test · ship · reflect · cross-cutting`; drives `/my-list` ordering |
| `benefits-from` | optional | upstream command/skill whose artifact it consumes (chain edge); each target must resolve |

**Deliberately *not* adopted from gstack/superpowers:**
- **per-skill `version` (semver)** — contradicts this repo's policy that updates
  track `main` via git SHA (`check-plugin.js` already forbids a `version` in
  `plugin.json`). Versioning stays at the repo level.
- **`allowed-tools`** — not adopted: these are broad workflow commands that need
  general tool access (orchestrators like `kickoff`/`sdd-loop`/`new-repo` use most
  tools), and a wrong allowlist silently breaks a command. Revisit only per-command
  if a genuinely narrow command appears.
- **`triggers` + description-as-trigger rewrites** — not adopted: the skill
  `description` already is the auto-trigger, so a separate `triggers` field is
  redundant, and rewriting live descriptions changes *when they fire* (a behaviour
  change). Left as-is by design.

## Delegation map — what we do NOT build

| Capability | Owned by |
|------------|----------|
| Code review (multi-lens) | `pr-review-toolkit` (official) + `/code-review` |
| Security review | `/security-review` + `security-guidance` (official) |
| Second-opinion review | `codex-monitor.yml` (Codex) |
| GitHub ops | GitHub MCP |
| Backend / data | Supabase MCP + `supabase` agent (per `data.md`) |
| Browser UI testing | Playwright (kit in `templates/ui-tests/`) / `ui-tester` |
| Design generation | `frontend-design` skill (primary) + Google Stitch remote MCP — per-project look; see `design.md` / `docs/guides/design-tooling.md` |

## Deliberate rejects (simplicity discipline)

- **gstack runtime** — browser daemon, GStack Browser, redaction/egress server,
  pair-agent tunnel, ONNX injection classifier, all iOS skills,
  Conductor/worktrees, `claude -p` evals: CLI/native, unusable browser-only.
- **superpowers** — `using-git-worktrees`, local `finishing-a-development-branch`
  (use the GitHub UI/MCP instead), the bash `session-start` hook (use the
  plugin's own mechanism), multi-platform packaging.
- **frameworked AI UI generators** (v0, Lovable, Bolt, 21st.dev, official Figma
  codegen) — React/Tailwind output and (often) a local server; wrong target for a
  plain-HTML, browser-only stack. (`frontend-design` + Stitch's *remote* MCP are
  adopted instead — see the Delegation map and `docs/guides/design-tooling.md`.)

## Complete standard scaffold (Phase 4)

**Decision: no opt-in modules — every new project gets the complete standard set
automatically.** (The toolkit *plugin* already ships all commands/skills/agents
as one unit; this is about the per-project **scaffold**: workflows, scripts,
secrets, directives.) Consistency over minimalism — every repo is identical and
complete, nothing to toggle or forget. Browser-only throughout: the only "CLI"
remains the one-time env setup-script paste.

What `/new-repo` scaffolds in **every** project:
- `CLAUDE.md` (from `CLAUDE-template.md`) + the four directive URLs + `index.html`
  + per-project `styles/` (`tokens.css` + `components.css`, set by `/design-intake`)
- the `directives-toolkit` plugin (so `env-chk`, the `push-gate` hook, `my-list`, … resolve)
- **all ten** workflows: `qa.yml`, `qa-live.yml`, `ci-notify.yml`, `ci-monitor.yml`,
  `codex-monitor.yml`, `pages-monitor.yml`, `pages-retry.yml`, `qa-response.yml`,
  `cron-notify.yml`, `keepalive.yml`
- the Playwright kit (`.github/scripts/ui-tests/`) and the scheduled-job /
  guardrail scripts (`.github/scripts/`: `notify-email.js`, `notify-task.js`,
  `check-contrast.js`, `package.json`)

**Mandatory setup** (NEW-REPO-USER-INSTRUCTIONS Step 1): data secrets (`DB_URL`,
`DB_SERVICE_KEY`), the test credential (`TEST_AUTH_CREDENTIAL`), and the email
transport (`SMTP_PASS`, `KEEPALIVE_PAT` secrets; `SMTP_HOST`, `SMTP_USER`,
`ALERT_TO` variables). The Supabase connection (`.claude/mcp.json`) stays
per-repo + gitignored by the data directive's security rule — the one thing never
committed.

**Graceful when unconfigured:** `notify-task.js` checks its required SMTP config
and, if any is missing, emits a GitHub Actions **notice** and exits 0 — a
not-yet-configured repo surfaces a clear message instead of a cryptic
scheduled-job crash. (Design is **per-project and generated** — see `design.md`
and `docs/guides/design-tooling.md`; there is no shared company theme to inherit.)

## Implementation status

- **Phase 1 — structure (done):** `phase` + `benefits-from` frontmatter on all
  commands/skills; `check-plugin.js` validates phase + chain resolution;
  `/my-list` ordered by phase; this spec.
- **Phase 2 — the bookends (done):** `/diagnose` (Think → `brief.md`) and
  `/learn` (Reflect → `learnings.jsonl`); `sdd-loop` now declares
  `benefits-from: [kickoff, diagnose]`.
- **Phase 3 — harden the middle (done):** `global.md` gains *evidence before
  assertions* (verification-before-completion) and *receiving review feedback*
  (anti-sycophancy); `test.md` gains the *circuit breakers* (attempt cap +
  runaway-diff stop); `pr-readiness-reviewer` gains the *evidence-currency*
  staleness gate; `sdd-loop` tasks gain 2–5 min sizing + no-placeholder
  self-review; `sdd-loop` plan gains the one adaptive plan-review pass (fresh
  subagent scores `plan.md`, revises under ~8, forces data-flow/failure-mode).
- **Phase 4 — complete standard scaffold (done):** no opt-in toggle — `/new-repo`
  scaffolds the full set (all ten workflows + Playwright kit + scheduled-job scripts).
  The email kit is standard + active with mandatory secrets and a config-guard
  notice in `notify-task.js`. See "Complete standard scaffold" above.
- **Design — per-project generative (done):** the fixed company design system
  (10 themes, parity/contrast/theme-contract CI, `design-system.html`) is retired;
  `design.md` is now a thin method, `/design-intake` establishes each project's
  own `styles/tokens.css` + `styles/components.css` via `frontend-design` + Stitch,
  and the WCAG guardrail ships per-project. See `docs/internal/design-migration.md`.
