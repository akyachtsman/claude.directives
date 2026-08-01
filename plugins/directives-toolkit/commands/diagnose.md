---
description: "Understand the problem before building: one question at a time, 2-3 approaches with tradeoffs, then specs/<slug>/brief.md. Run before /sdd-loop; no 'too simple' exemption."
phase: think
---
Run the **Think** phase: understand the problem before any spec, plan, or code.
This is the entry point of the dev-pipeline (see `docs/guides/dev-pipeline.md`); it
writes the `brief.md` that `/sdd-loop specify` reads. Browser-only — pure
questions + a Markdown file, no CLI.

Method (forcing questions adapted from gstack `office-hours`, de-jargoned; plus
superpowers `brainstorming` — alternatives mandatory, one question per turn):

1. **Do not plan or code yet.** If the user jumped to a solution, step back to
   the problem. There is **no "too simple" exemption** — always do the pass;
   scale its depth to the task.
2. **Consult memory first.** If `learnings.jsonl` exists, grep it for entries
   relevant to this problem/files and weigh them (see `/learn`).
3. **Ask one question at a time** — wait for each answer before the next; use
   `AskUserQuestion` when options sharpen the choice. Cover, in order:
   - What are you trying to do, in one sentence? (the job, not the feature)
   - Who is it for, and what do they do today instead?
   - What does "done" look like — the **smallest version that's actually useful**?
   - What's the riskiest part, and what happens if it's wrong?
   - What must it **not** break or change? (the inherited directives, existing
     data, iPad / browser-only — these are non-negotiable constraints)
   - What's explicitly **out of scope** for now?
4. **Offer 2–3 approaches** with honest tradeoffs and a recommendation. Surface
   only real decisions; don't manufacture choices.
5. **On agreement**, write `specs/<slug>/brief.md` (`<slug>` = kebab problem
   name) with: problem (one sentence) · users & current alternative · definition
   of done (smallest useful) · risks · constraints/non-negotiables ·
   out-of-scope · chosen approach + why · alternatives considered.
6. **Hand off, don't auto-advance:** end with "Next: `/sdd-loop specify` — it
   reads `brief.md`." Stopping at the gate is deliberate; the user starts the
   next phase.
