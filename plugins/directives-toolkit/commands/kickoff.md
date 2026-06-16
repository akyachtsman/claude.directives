---
description: "Kick off a spec-driven build of a new app — scaffold (if needed), gather the product brief, optional competitive discovery, then drive the /sdd-loop"
---
Start a spec-driven build of a **new app**, end to end. This command **orchestrates
the existing pieces — it does not re-implement them**: it delegates scaffolding to
`/new-repo`, the build to `/sdd-loop`, and treats the imported directives as the
constitution (never restate them). The only thing it gathers fresh is the
project-specific brief. Run it in a project session once the toolkit is installed
(per `NEW-REPO-USER-INSTRUCTIONS.md` Step 0).

Execute in order:

1. **Bootstrap if needed.** If `CLAUDE.md` is absent, run **`/new-repo`** first and
   let it finish (it scaffolds `CLAUDE.md` + inherited directives, CI, the
   Playwright kit, and settings). If `CLAUDE.md` already exists, skip — the repo is
   bootstrapped; continue.

2. **Gather the PRODUCT BRIEF (WHAT & WHY).** Ask the user for these — a short
   answer each; this is the only project-specific input the build needs:
   - **Vision** — what the app is and the outcome it drives
   - **Primary users** — who uses it; any secondary roles
   - **Top-level sections** — the main areas/screens
   - **Core capabilities** — the key things it does
   - **Explicit non-goals (MVP)** — what's out of scope for v1

   Don't invent these. If the user is unsure on one, record it as an open item for
   `clarify` rather than guessing.

3. **Optional — competitive discovery fan-out.** Ask whether to ground the spec in
   market leaders (**off by default**). If the user opts in:
   - Spawn parallel worker agents **in one batch so they run concurrently** (Agent
     tool `general-purpose` with web access, or the `deep-research` skill), **one
     per target site** (~6–10 of the most popular sites in this app's category).
     Each analyzes its site against a rubric: information architecture, core user
     flows, content depth, onboarding/CTAs/conversion, category-specific tooling,
     trust patterns, UX strengths & weaknesses.
   - As orchestrator, synthesize a comparison matrix and **recommend a starting
     version** (single best-fit or a hybrid), written cited to
     `specs/<feature>/research.md`.
   - **Guardrails:** needs an environment network policy that allows those sites;
     fetch **public pages only**; respect ToS/robots; **synthesize patterns —
     don't clone** copy, branding, or designs.

4. **Drive the loop.** Hand the brief (and `research.md` if produced) to
   **`/sdd-loop specify`**, then proceed phase by phase
   (`specify → clarify → plan → tasks → analyze → implement`). `/sdd-loop` owns the
   phase mechanics and delegates `analyze`/`implement` to the `pr-review-toolkit`
   reviewers and `qa-pipeline`; the directives are the constitution. Honor the
   Pre-Push gate (`/commit-chk`) and PR lifecycle.

Keep it **stepwise — never one-shot.** The human supplies the brief here, answers
`clarify`, provides backend secrets, and approves the plan and each merge.
