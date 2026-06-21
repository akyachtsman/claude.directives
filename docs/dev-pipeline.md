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
| 1–3 | **Plan** | `/sdd-loop` (`/kickoff`, `/opt-3`) | exists — harden | `spec.md → plan.md → tasks.md` |
| 4 | **Plan-gate** | `/sdd-loop analyze` | exists | `analysis.md` |
| 5 | **Review** | `pr-review-toolkit`, `/code-review`, `/security-review`, `codex-monitor`; `/audit-repo` (drift) | **delegated** | `.agent-reports/` / `review.md` |
| 6 | **Test** | `qa-pipeline`, `test-verifier`, `ui-tester`, `/commit-chk` | exists — add gates | `qa.md` |
| 7 | **Ship** | `push-gate` hook, `update-pages`, `/live-chk`, `ci/pages-monitor` | exists — add gate | `ship.md` |
| 8 | **Reflect** | `/learn` (alongside `/handoff-session`) | exists | `learnings.jsonl` |
| — | **Cross-cutting** | `/env-chk`, `scope-chk` (preflight); `/my-list`, `/do-repo`, `doc-comp` (utilities) | exists | — |

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
  review.md      ← 5 review findings (AUTO-FIX vs ASK)
  qa.md          ← 6 test report (verification-before-completion)
  ship.md        ← 7 ship record (PR URL + deploy SHA + live-check)
learnings.jsonl  ← 8 Reflect (repo-root, append-only, auto-consulted)
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

### 1–3 · Plan — `/sdd-loop specify|clarify|plan|tasks` *(exists — harden)*
Keep our WHAT/HOW split and the constitution (inherited directives) as binding
constraints. **Methods to import:** collapse gstack's CEO/design/eng triple
plan-review into **one adaptive review** (a fresh subagent rates a few
dimensions 0–10, edits `plan.md` in place if < 8, forces a data-flow/failure-mode
note); adopt superpowers `writing-plans` **2–5 min task granularity** (each task
= failing test → implement → verify → commit) and its **no-placeholder
self-review** (reject "TBD" / "similar to Task N").

### 4 · Plan-gate — `/sdd-loop analyze` *(exists)*
Cross-artifact consistency. **Method imported:** gstack's **verification gate** —
every finding must quote the motivating code or be suppressed; split **AUTO-FIX
vs ASK**.

### 5 · Review — official plugins + monitors *(delegated — do not rebuild)*
This is already gstack's multi-lens + Codex second opinion, inherited:
`pr-review-toolkit` (code-reviewer, silent-failure-hunter, type-design-analyzer,
pr-test-analyzer), the built-in `/code-review` and `/security-review`, and
`codex-monitor.yml`. `/audit-repo` covers directive↔code drift only. **Method to
import:** superpowers `receiving-code-review` **anti-sycophancy** rule (no
"You're absolutely right!", restate the requirement, push back with technical
reasoning) — added as a review-handling directive.

### 6 · Test — `qa-pipeline` / `test-verifier` / `ui-tester` *(exists — add gates)*
**Methods imported:** superpowers `verification-before-completion` as a hard
gate (identify the proving command, run it *fresh*, read full output, *then*
claim done); gstack **circuit-breakers** (stop after 3 failed fix attempts —
already our escalation rule; cap total fixes; flag large/unrelated diffs). The
two-tier CI (`qa.yml` static = free, `qa-live.yml`/Playwright = gated) already
mirrors gstack's tiered testing; the `claude -p` cost-capped eval harness is
**rejected** (CLI/API-billed).

### 7 · Ship — `push-gate` + `update-pages` + `/live-chk` *(exists — add gate)*
**Method imported:** gstack **Review Readiness staleness gate** —
`pr-readiness-reviewer` blocks "ready" unless `review.md` is recent and clean.
Our `push-gate` hook + PR lifecycle + `pages-monitor` already cover gstack's
land-and-deploy + canary.

### 8 · Reflect — `/learn` *(alongside `/handoff-session`)*
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
- **`allowed-tools`** — deferred; needs a per-command tool audit, and a wrong
  allowlist silently breaks a command. Add once audited.
- **`triggers` + description-as-trigger rewrites** — deferred; rewriting live
  skill descriptions changes *when they fire*, so it is a behaviour change, not
  structural. Apply per-skill, reviewed.

## Delegation map — what we do NOT build

| Capability | Owned by |
|------------|----------|
| Code review (multi-lens) | `pr-review-toolkit` (official) + `/code-review` |
| Security review | `/security-review` + `security-guidance` (official) |
| Second-opinion review | `codex-monitor.yml` (Codex) |
| GitHub ops | GitHub MCP |
| Backend / data | Supabase MCP + `supabase` agent (per `data.md`) |
| Browser UI testing | Playwright (kit in `templates/ui-tests/`) / `ui-tester` |

## Deliberate rejects (simplicity discipline)

- **gstack runtime** — browser daemon, GStack Browser, redaction/egress server,
  pair-agent tunnel, ONNX injection classifier, all iOS skills,
  Conductor/worktrees, `claude -p` evals: CLI/native, unusable browser-only.
- **superpowers** — `using-git-worktrees`, local `finishing-a-development-branch`
  (use the GitHub UI/MCP instead), the bash `session-start` hook (use the
  plugin's own mechanism), multi-platform packaging.
- **`frontend-design`** (generative design) — conflicts with `design.md`'s fixed
  system; rejected.

## Implementation status

- **Phase 1 — structure (done):** `phase` + `benefits-from` frontmatter on all
  commands/skills; `check-plugin.js` validates phase + chain resolution;
  `/my-list` ordered by phase; this spec.
- **Phase 2 — the bookends (done):** `/diagnose` (Think → `brief.md`) and
  `/learn` (Reflect → `learnings.jsonl`); `sdd-loop` now declares
  `benefits-from: [kickoff, diagnose]`.
- **Phase 3 — harden the middle:** fold in verification-before-completion,
  circuit-breakers, anti-sycophancy, readiness-staleness, no-placeholder tasks.
- **Phase 4 — composable scaffold:** split the child-repo baseline into CORE +
  opt-in modules (`data`, `ui-tests`, `cron-email`, `expressive-design`).
