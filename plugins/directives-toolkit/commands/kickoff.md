---
description: "Start a spec-driven build of a new app — scaffold, product brief, optional discovery, then /sdd-loop."
phase: plan
benefits-from: [new-repo]
---
Start a spec-driven build of a **new app**, end to end. This command **orchestrates
the existing pieces — it does not re-implement them**: it delegates scaffolding to
`/new-repo`, the build to `/sdd-loop`, and treats the imported directives as the
constitution (never restate them). The only thing it gathers fresh is the
project-specific brief. **Run it by itself — just `/kickoff`, with no pre-written
brief; it asks you everything interactively** (a single command kick-starts the
whole build). Run it in a project session once the toolkit is installed (per
`NEW-REPO-USER-INSTRUCTIONS.md` Step 0).

Execute in order:

1. **Gather the PRODUCT BRIEF (WHAT & WHY) — FIRST, before any scaffolding.** Ask
   the user up front so they give input immediately rather than watching an
   autonomous setup run and wondering when they're needed. Ask for these — a short
   answer each:
   - **Vision** — what the app is and the outcome it drives
   - **Primary users** — who uses it; any secondary roles
   - **Top-level sections** — the main areas/screens
   - **Core capabilities** — the key things it does
   - **Ambition & references** — how elaborate should it be, and which 1–2 apps
     should it match in polish/depth? This sets the bar everything downstream is held
     to, and feeds **`/design-intake`** (the look). **Default when unspecified:
     production-grade, not a skeleton.** Carry this bar into `plan` and `implement` —
     do **not** quietly trim it to a minimal MVP.
   - **Explicit non-goals (MVP)** — what's out of scope for v1
   - **Deployment tier** — *static* (GitHub Pages; plain HTML/CSS/JS, the default —
     fine for most apps, including dynamic ones via client-side Supabase) or
     *production* (React + Next.js on Vercel + Supabase, for auth / server-rendered
     or per-user data / real scale). **Default static** unless the app clearly needs
     production (per `global.md` → *Hosting & Deployment*). The tier picks the
     scaffold: a static `index.html` app vs the `templates/nextjs-app/` Next starter.

   Then **invite a detailed spec + reference material, and pause for it.** Ask the
   user to paste any **fuller written spec** they have AND to **attach reference
   images, sketches, brand assets, or example sites/apps** they want it to feel like
   — **read any attached images.** This is their chance to shape the design with
   their own input **before anything is designed**, and it anchors the build
   **alongside** discovery (step 4), not instead of it. Optional but strongly
   encouraged for expressive apps; don't skip the invitation.

   In the same message, ask the **competitive-discovery** yes/no (step 4, off by
   default). Don't invent answers — if the user is unsure on one, log it as an open
   item for `clarify` rather than guessing. **Wait for the user's reply before
   proceeding.**

2. **State the plan, then go hands-off.** Tell the user what happens next so the
   autonomous stretch isn't a surprise: "I'll now scaffold the repo, [run
   discovery,] and start the spec — I'll pause for you again at `clarify` and
   plan approval; merges happen automatically on green per `git.md`."

3. **Bootstrap if needed.** If `CLAUDE.md` is absent, run **`/new-repo`** and let it
   finish (it scaffolds `CLAUDE.md` + inherited directives, CI, the Playwright kit,
   and settings). If `CLAUDE.md` already exists, skip — the repo is bootstrapped.
   If the **production tier** was chosen at step 1, the app is scaffolded from the
   `templates/nextjs-app/` Next starter (Vercel + Supabase) instead of the static
   `index.html` layout — deploy per `docs/standards/cicd-setup.md` → *Production tier — Vercel*.

4. **Optional — competitive discovery fan-out** (only if the user opted in at
   step 1). Spawn parallel worker agents **in one batch so they run concurrently**
   (Agent tool `general-purpose` with web access, or the `deep-research` skill),
   **one per target site** (~6–10 of the most popular sites in this app's
   category). Each analyzes its site against a rubric covering **both structure and
   craft**: information architecture; core user flows; content depth & how much they
   actually offer; onboarding/CTAs/conversion; category-specific tooling; trust
   patterns; **and the experiential layer — visual design language, the landing/hero
   treatment & first impression, layout richness & hierarchy, imagery/iconography,
   and motion/interaction.** As orchestrator, synthesize a comparison matrix and
   recommend a starting version **plus an explicit richness/polish bar** the build
   must hit (so research raises the *look*, not just the flow). **Fold in the user's
   own detailed spec + reference images/attachments from step 1** — their material
   leads, the scrape supports it — and write the synthesis cited to
   `specs/<slug>/research.md`. **Guardrails:** needs an environment network policy
   that allows those sites; fetch **public pages only**; respect ToS/robots;
   **synthesize patterns — don't clone** copy, branding, or designs.

5. **Establish the look.** Run **`/design-intake`** — import a reference (a
   screenshot/mockup, Stitch HTML, or Figma; image is the simplest browser-only
   path) and distill it into `styles/tokens.css` + `styles/components.css` + an
   approved reference page (per `directives/design.md`). Get the user's sign-off on
   the look here, before building out — it's cheapest to fix on one page.

6. **Drive the loop.** Hand the brief (and `research.md` if produced) to
   **`/sdd-loop specify`**, then proceed phase by phase
   (`specify → clarify → plan → tasks → analyze → implement`). `/sdd-loop` owns the
   phase mechanics and delegates `analyze`/`implement` to the `pr-review-toolkit`
   reviewers and `qa-pipeline`; the directives are the constitution. Honor the
   Pre-Push gate (`/commit-chk`) and PR lifecycle.

Keep it **stepwise — never one-shot.** The human supplies the brief up front,
answers `clarify`, provides backend secrets, and approves the plan and each merge.
