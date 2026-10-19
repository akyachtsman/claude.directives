# Development Pipeline — the toolkit as one ordered procedure

This is the **working spec** for how `directives-toolkit` commands, skills, and
agents compose into a single, ordered project-development procedure — a *chain*,
not a menu. It is synthesised from three sources, keeping our spine and
importing only *methods* that fit the constraint below:

- **our `/sdd-loop` + inherited directives** — the spine (constitution-driven,
  artifact-chained, already delegating review/test);
- **`obra/superpowers`** (v6.0.3, MIT) — the lean Markdown discipline
  (description-as-trigger, file-based handoff artifacts, verification gates);
- **`garrytan/gstack`** (MIT) — the methodology shape (forcing questions →
  multi-lens review → compounding memory → staleness-gated ship). Its thick
  Bun/TypeScript runtime (browser daemon, redaction server, iOS, evals) is
  **deliberately not adopted** — it is a local runtime the constraint below
  rules out.

> **Constraint that governs every choice here:** the OWNER is browser-only —
> he has no terminal, so nothing may depend on him running a command
> (`global.md` → *A Blocked Command Is Not a Blocked Capability*). The session
> has a terminal and git. The site has no build by default; a CI build is a
> per-project opt-in, and a step that reads the site reads the deployed build
> output where one exists (`global.md` → *Hosting & Deployment*). Nothing may
> depend on a local server or daemon outliving the session.
> Every step below is plain Markdown methodology, repo files, delegated official
> plugins, or MCP/CI.

## The pipeline at a glance

| # | Phase | Command / skill / agent | Status | Hand-off artifact |
|---|-------|-------------------------|--------|-------------------|
| 0 | **Think** | `/diagnose` | exists | `brief.md` |
| 1–2 | **Plan** | `/sdd-loop specify` → `/sdd-loop plan` (`/kickoff`) | exists — gated | `spec.md → plan.md` |
| — | **Plan-gate** | folded into `/sdd-loop plan` (consistency check + self-review) | exists | `plan.md` → `## Consistency` |
| 5 | **Build** | `/design-intake` (look-gate) · `/sdd-loop` implement | exists — gated | `design.md` + built pages |
| 6 | **Review** | `pr-review-toolkit`, `/code-review`, `/security-review`, Codex; `/audit-repo` (drift) | **delegated** | `.agent-reports/` review reports |
| 7 | **Test** | `test-verifier`, `ui-tester`, `/commit-chk` (`test.md` → *QA before merge*) | exists — gated | `.agent-reports/` test reports |
| 8 | **Ship** | `push-gate` hook, `update-pages`, `qa-live.yml` (live check) | exists — gated | none — the PR and the reported live check |
| 9 | **Reflect** | `/learn` (alongside `/handoff-session`) | exists | `learnings.jsonl` |
| — | **Cross-cutting** | `/env-chk`, `scope-chk` (preflight); `/refresh-repo` (re-sync); `/my-list`, `/do-repo`, `doc-comp` (utilities) | exists | — |

Numbers **3 and 4 are retired, not missing**: the former `tasks.md` (3) and
`analysis.md` (4) steps folded into `/sdd-loop plan`, which now writes both into
`plan.md` as `## Tasks` and `## Consistency`. The surviving numbers are held
stable so existing specs, reports, and cross-references still resolve.

## The artifact chain

The chain is the point: each phase **reads the prior artifact and writes its
own**, so context flows through files, not through one ballooning conversation
(the superpowers anti-context-pollution idea; the gstack handoff graph).

```
specs/<slug>/
  brief.md       ← 0 Think    (/diagnose)
  spec.md        ← 1 specify+clarify (WHAT/WHY)
  plan.md        ← 2 plan + one adaptive plan-review (HOW)
                 (plan.md also carries `## Tasks`, 2–5 min each, and the
                  `## Consistency` gate — formerly tasks.md and analysis.md)
  design.md      ← 5 Build (/design-intake look-gate → tokens.css + components.css)
.agent-reports/  ← 6 Review + 7 Test (repo-root, written by the agents:
                   code-review-report.md, security-review-report.md,
                   test-report.md, ui-test-report.md — see CLAUDE-template.md)
                 ← 8 Ship writes no file: the PR and update-pages' reported
                   live check are the record
learnings.jsonl  ← 9 Reflect (repo-root, append-only + compaction, auto-consulted)
```

`benefits-from` frontmatter declares each edge so the chain is machine-checkable
(`check-plugin.js` fails if an edge points at a deleted/renamed node).

## Per-phase detail

### 0 · Think — `/diagnose`
Force the problem to be understood before any code. **Method imported:** gstack
`office-hours` six forcing questions + superpowers `brainstorming`
one-question-per-message, *alternatives mandatory*, no "too simple" exemption —
**stripped of the YC/startup framing**. Writes `brief.md`; gates entry to
`specify`. Needs nothing beyond Markdown + `AskUserQuestion`.

### 1–2 · Plan — `/sdd-loop specify|plan` *(exists — gated)*
Keep our WHAT/HOW split and the constitution (inherited directives) as binding
constraints. **Methods imported:** gstack's CEO/design/eng triple plan-review
collapsed into **one adaptive review** (a fresh subagent scores `plan.md` 0–10,
revises in place under ~8, forces a data-flow/failure-mode note); superpowers
`writing-plans` **2–5 min task granularity** (each task = failing test →
implement → verify → commit) and its **no-placeholder self-review** (reject
"TBD" / "similar to Task N").

### Plan-gate — folded into `/sdd-loop plan` *(exists)*
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
remaining tasks against that contract so every page matches. Plain semantic
HTML/CSS with no framework and no build, unless the project's `CLAUDE.md`
records an approved CI build opt-in (`global.md` → *Hosting & Deployment*); then
implement against that build. Non-UI work skips the design-intake half and goes
straight to implement.

### 6 · Review — official plugins + Codex *(delegated — do not rebuild)*
This is already gstack's multi-lens + Codex second opinion, inherited:
`pr-review-toolkit` (code-reviewer, silent-failure-hunter, type-design-analyzer,
pr-test-analyzer), the built-in `/code-review` and `/security-review`, and
Codex's review. `/audit-repo` covers directive↔code drift only. **Method to
import:** superpowers `receiving-code-review` **anti-sycophancy** rule (no
"You're absolutely right!", restate the requirement, push back with technical
reasoning) — added as a review-handling directive.

### 7 · Test — `test-verifier` / `ui-tester` *(exists — gated)*
**Methods imported:** superpowers `verification-before-completion` as a hard
gate (identify the proving command, run it *fresh*, read full output, *then*
claim done); gstack **circuit-breakers** (stop after 3 failed fix attempts —
already our escalation rule; cap total fixes; flag large/unrelated diffs). The
two-tier CI (`qa.yml` static = free, `qa-live.yml`/Playwright = gated) already
mirrors gstack's tiered testing; the `claude -p` cost-capped eval harness is
**rejected** (CLI/API-billed).

### 8 · Ship — `push-gate` + `update-pages` + `qa-live.yml` *(exists — gated)*
**Method imported:** gstack **Review Readiness staleness gate** —
`pr-readiness-reviewer`'s evidence-currency check marks the PR Not Ready unless
the `.agent-reports/` test and review reports and the CI results cover the
current HEAD.
Our `push-gate` hook + PR lifecycle + `qa-live.yml` already cover gstack's
land-and-deploy + canary.

### 9 · Reflect — `/learn` *(alongside `/handoff-session`)*
Compounding institutional memory. **Method imported:** gstack `learnings.jsonl`
— append-only, compacted on budget, **typed** (pattern / pitfall / preference / architecture / tool),
**confidence 1–10**, file attribution, latest-key-wins; auto-consulted before
recommendations. Today `/handoff-session` is a one-shot snapshot; `/learn` makes
it compound. Needs only a repo file + a command that greps it.

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
| Second-opinion review | Codex (verdict per `git.md` → *PR Lifecycle*) |
| GitHub ops | GitHub MCP |
| Backend / data | Supabase MCP + `supabase` agent (per `data.md`) |
| Browser UI testing | Playwright (kit in `templates/ui-tests/`) / `ui-tester` |
| Design generation | `frontend-design` skill (primary) + Google Stitch remote MCP — per-project look; see `design.md` / `docs/guides/design-tooling.md` |

## Deliberate rejects (simplicity discipline)

- **gstack runtime** — browser daemon, GStack Browser, redaction/egress server,
  pair-agent tunnel, ONNX injection classifier, all iOS skills, the Conductor
  app, `claude -p` evals: native runtimes and long-lived local daemons, which
  the no-build stack and an owner without a terminal rule out (and the evals
  are API-billed).
- **superpowers** — the `using-git-worktrees` skill, local `finishing-a-development-branch`
  (use the GitHub UI/MCP instead), the bash `session-start` hook (use the
  plugin's own mechanism), multi-platform packaging.

⚠️ Those two entries reject the named **tools**, never `git worktree` itself —
`global.md` → *Parallel Tasking via Subagents* makes an isolated worktree the
default for concurrent edits, and that rule stands here.
- **frameworked AI UI generators** (v0, Lovable, Bolt, 21st.dev, official Figma
  codegen) — React/Tailwind output and (often) a local server; wrong target for a
  plain-HTML, no-build stack. (`frontend-design` + Stitch's *remote* MCP are
  adopted instead — see the Delegation map and `docs/guides/design-tooling.md`.)

## Complete standard scaffold (Phase 4)

**Decision: no opt-in modules — every new project gets the complete standard set
automatically.** (The toolkit *plugin* already ships all commands/skills/agents
as one unit; this is about the per-project **scaffold**: workflows, scripts,
secrets, directives.) Consistency over minimalism — every repo is identical and
complete, nothing to toggle or forget. Nothing here asks the owner for a
terminal: his only setup step is the one-time env setup-script paste.

What `/new-repo` scaffolds in **every** project:
- `CLAUDE.md` (from `CLAUDE-template.md`) + the five directive URLs + per-project
  `styles/` (`tokens.css` + `components.css`, set by `/design-intake`);
  `index.html` is not scaffolded — the first build writes it
- the `directives-toolkit` plugin (so `env-chk`, the `push-gate` hook, `my-list`, … resolve)
- the standard workflows — **three unconditionally**: `qa.yml`, `qa-live.yml`,
  `qa-response.yml` (`keepalive.yml` is NOT installed — `cicd-setup.md` Step 9f;
  `cron-notify.yml` is added only when the project has a scheduled task, owner
  ruling 2026-10-10)
- **plus `pages-deploy.yml` on an Actions-source project only** (it IS the
  deploy: filter, publish, retry, assert): add its `Pages Deploy` watcher to
  `qa-live.yml` and list it in the `REQUIRED` file; **branch-source** → do not install it (`cicd-setup.md` → *9d-bis — Pages Deploy (Actions-source only)*).
  This is the single exception to "no opt-in modules" above, and the condition
  is a fact about the project's Pages source rather than a toggle anyone chooses
- the Playwright kit (`.github/scripts/ui-tests/`) and the guardrail scripts
  (`.github/scripts/`: `check-contrast.js` and the rest `qa.yml` names); the
  scheduled-job scripts (`notify-email.js`, `notify-task.js`, `package.json`)
  come with `cron-notify.yml`, only when the project has a scheduled task

**Setup, each only where it applies** (NEW-REPO-USER-INSTRUCTIONS Step 1): the
data keys (`DB_URL` variable, `DB_SERVICE_KEY` secret) before the project's
scheduled data workflow, if any, can run — an app with no backend needs
neither — and the test credential (`TEST_AUTH_CREDENTIAL`), unless the
app has no login or its login ships a working credential in a password field,
which needs none
(`cicd-setup.md` Step 5). The email
transport (`SMTP_PASS` secret; `SMTP_HOST`, `SMTP_USER`, `ALERT_TO` variables) is
needed only if the project sends email (owner ruling, 2026-10-07).
No `KEEPALIVE_PAT`: `keepalive.yml` is not scaffolded (`cicd-setup.md` Step 9f). The Supabase connection (`.mcp.json`) stays
per-repo + gitignored by the data directive's security rule — the one thing never
committed.

**Graceful when unconfigured:** once installed, `notify-task.js` checks its required SMTP config
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
  scaffolds the full set (all standard workflows + Playwright kit;
  `keepalive.yml` is excluded, `cicd-setup.md` Step 9f). Since 2026-10-10 (owner ruling) the scheduled
  job and its scripts are added only when a project has a scheduled task.
  Once installed, the email kit is active, with a config-guard notice in
  `notify-task.js`; its secrets are needed only if the project sends email. See "Complete standard scaffold" above.
- **Design — per-project generative (done):** the fixed company design system
  (10 themes, parity/contrast/theme-contract CI, `design-system.html`) is retired;
  `design.md` is now a thin method, `/design-intake` establishes each project's
  own `styles/tokens.css` + `styles/components.css` via `frontend-design` + Stitch,
  and the WCAG guardrail ships per-project. The migration plan, now implemented,
  is in git history (removed in batch C, R12).
- **Design — one house style (2026-10-19):** the owner made the RSO project's UI
  standard the house style for every project. `directives/design.md` now carries
  its words, icons, components and patterns, and `templates/styles/` carries its
  palette and components; `/design-intake` adopts them and imports a palette
  only by owner ruling. Where each project still breaks it: its own
  `DESIGN-GAPS.md`.
