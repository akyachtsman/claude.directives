# Project Kickoff — Spec-Driven Build Brief (template)

<!-- Reusable, product-agnostic kickoff brief. Copy this file's body, fill the
     [bracketed] spots — only the PRODUCT BRIEF block must be written per project —
     and paste the result as the FIRST message of a new repo's session. It drives
     an inherited-directive, /sdd-loop build with the QA agents running in the loop.
     Everything outside the [bracketed] spots is the generic framework and rarely
     needs editing. The Phase-1 discovery fan-out is OPTIONAL — keep or delete it.
     This is the company kickoff framework for ALL new projects, not one app. -->

---

You are bootstrapping a **brand-new project repo** for **[PRODUCT: one-line description of the app]**. Build it the company way: inherit the directives, then drive the whole build through the Spec-Driven Development loop (`/sdd-loop`), with the QA agents running in the loop. **Do not one-shot it.**

## 0. Verify the toolkit is present (don't install anything here)
Confirm the `directives-toolkit:*` commands and the `pr-review-toolkit` agents resolve at session start. **If they don't, stop** — the reusable environment isn't set up; fix it per `NEW-REPO-USER-INSTRUCTIONS.md` **Step 0**. Do **not** try to install plugins from inside this session (the environment installs them before launch).

## 1. Bootstrap the repo (inherit the directives)
Run **`/new-repo`**. It scaffolds `CLAUDE.md` from the company template, inheriting the four directives by raw URL — **`global.md`, `design.md`, `test.md`, `data.md`**. These are your **constitution**; never restate or override them. Then:
- Pick **one** Design Theme from `design.md` and set `data-theme` on `<html>`.
- Fill in `CLAUDE.md`: project name, live GitHub Pages URL, stack, backend per `data.md`.

## 2. Constitution constraints (from the inherited directives)
- **Stack:** plain HTML + JS — **no frameworks, no npm, no build step.** Must work on **iPad Safari.** Use `textContent` only — never `innerHTML` with backend/user data.
- **Hosting:** GitHub Pages only.
- **Backend:** Supabase per `data.md` — **RLS ON for every table**, service-role key **server-side only** (never in client), connection details via GitHub Secrets.
- **Security:** `/security-review` + the `security-guidance` hooks apply.
  - *[If this app stores sensitive PII / financial / payment data, say so here and call security first-class. Otherwise delete this line.]*

## 3. Build it with `/sdd-loop` — one phase per invocation

### Phase 1 — discovery (optional), then `specify`

**(a) Competitive-research fan-out — OPTIONAL.** *[Keep this if you want the spec grounded in market leaders; delete the whole (a) block if not.]*
1. **Spawn parallel worker agents in one batch so they run concurrently** (Agent tool, `general-purpose` with web access — or the `deep-research` skill). **One worker per target site**, ~6–10 of the most popular **[CATEGORY, e.g. "commercial insurance" / "habit-tracking" / "invoicing"]** sites. Each worker **analyzes its assigned site against this rubric** and returns a structured report:
   - Information architecture — top-level sections & navigation
   - Core user flows — the primary task(s) and how the user is guided through them
   - Content depth & how key concepts are explained
   - Onboarding & signup, primary CTAs, conversion/lead capture
   - Any standout tooling specific to this category
   - Trust/credibility patterns; notable UX strengths & weaknesses
   - *[Add any product-specific rubric rows here.]*
2. **You, the orchestrator, synthesize:** build a comparison matrix, identify the strongest patterns, and **decide a recommended starting version — a single best-fit model or a hybrid** that combines the best elements, justified against the rubric.
3. **Write it to `specs/<feature>/research.md`** (cited — every source URL listed).
   - *Guardrails:* web reach depends on this **environment's network policy** — it must allow outbound to those sites (if egress is locked down, this needs a broader-access environment, or hand the session the site list + notes). Fetch **public pages only**; respect each site's ToS/robots; keep volume reasonable. **Synthesize patterns — don't clone** copy, branding, or designs.

**(b) `/sdd-loop specify`** — feed it the PRODUCT BRIEF below *(augmented by `research.md` if you ran discovery)*. It writes `specs/<feature>/spec.md`, **WHAT & WHY only (no stack).**

> **PRODUCT BRIEF (WHAT & WHY)** — *the one section you must write per project:*
> - **Vision:** [what the app is and why it exists — the outcome it drives]
> - **Primary users:** [who uses it; any secondary roles]
> - **Top-level sections:** [the main areas/screens of the app]
> - **Core capabilities:** [numbered list of the key things it does]
> - **Explicit non-goals (MVP):** [what is intentionally out of scope for v1]

### Phase 2 — `/sdd-loop clarify`
Interrogate gaps **before** planning. Generic ones to resolve: auth/login & accounts? · admin/staff view or end-user only for MVP? · data import/entry approach? · what drives any computed output (fixed rules vs configurable)? · data sensitivity/retention? *[Add product-specific open questions here.]*

### Phase 3 — `/sdd-loop plan` (HOW, within the constitution)
Pages/sections, the Supabase data model, **RLS policies per table**, and key decisions/trade-offs. Default plain HTML + JS + Supabase; flag any needed exception.

### Phase 4 — `/sdd-loop tasks`
Ordered, dependency-aware task list — it will enumerate the pages/sections, tagging parallel-safe ones `[P]`.

### Phase 5 — `/sdd-loop analyze`
Consistency check; delegates to the `pr-review-toolkit` reviewers / `/code-review`. Run **`/security-review`** too if the app handles sensitive data (focus on RLS + key handling).

### Phase 6 — `/sdd-loop implement`
Build task by task. After each, the **`directives-toolkit:qa-pipeline`** agent runs in a loop (test-verifier → ui-tester → code review → pr-readiness) until scenarios pass or it escalates. Honor `/commit-chk` and the PR lifecycle (draft PR → CI green → squash-merge).

## 4. What the human (browser-only) will provide
Theme choice; answers to the clarify questions; the Supabase project + secrets (as GitHub secrets per `data.md` — never in client code); approval at the plan step and before each merge.

**Suggested first loop:** treat the MVP skeleton + core sections as the **first feature**; deepen secondary capabilities in later `/sdd-loop` passes.
