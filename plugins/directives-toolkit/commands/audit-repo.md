---
description: "Audit the repo for directive drift, code correctness, duplication, and structural soundness. Reports findings; changes nothing without approval."
phase: review
---
Precondition note: this audits code against the directives as currently
imported. If you suspect the rulebook itself is stale, run /env-chk first —
self-audit does not verify upstream directive freshness.

Read CLAUDE.md in the current repo and all imported directive URLs it references.

Then recursively visit EVERY file in the repository (skip only vendored/build
artifacts: node_modules, dist, .git, lockfiles, build output) and check for:
- Directive drift — code/config that violates a directive rule.
- Errors — syntax errors, broken references, dead imports, invalid config,
  malformed data, things that won't run. For per-file correctness and quality
  depth, delegate to the natives — `/code-review --effort high` and `/simplify`
  (`EXPORTS.json` → `considered.code-simplifier`) — and keep this sweep on what
  they cannot see: repo-wide directive drift, the CLAUDE.md grade, native
  parity, and structural soundness across the tree.
- Redundancies and duplications — **a first-class finding class, not a
  footnote** (`global.md` → *Reuse Before Rewrite*). Hunt for: duplicated code,
  repeated literals/constants, copy-pasted blocks, overlapping functions, dead/
  unused code, and above all **near-duplicate implementations of the same
  feature for different entities** (the same view/handler/renderer rewritten
  per portal, per role, per form type — the classic fleet failure). Compare by
  BEHAVIOR, not by text: two functions that do the same job with different
  identifiers are duplicates even with zero matching lines.
  For each cluster found, propose the concrete consolidation: **one
  implementation, parameterized** — name the surviving unit, the parameter or
  flag that absorbs each small difference (label, table, permission, extra
  column), and every call site to repoint. Only genuinely different *behavior*
  justifies keeping separate code, and that justification must be stated.
  Report the **net line delta** of each proposed merge; **minimizing total
  codebase size is an explicit goal of this audit**, and a consolidation that
  doesn't shrink the codebase needs a reason.
- CLAUDE.md quality — grade the project's own CLAUDE.md, don't just read it.
  Score commands/workflows documented, architecture clarity, non-obvious
  patterns, conciseness, currency and actionability, then report a letter grade
  (A 90-100 comprehensive and current · B 70-89 minor gaps · C 50-69 missing key
  sections · D 30-49 sparse or outdated · F below 30). Rubric borrowed from
  Anthropic's `claude-md-improver`; a grade below B is a finding with the missing
  criterion named.
- Logic correctness — verify the logic of every statement and code path is
  actually correct: off-by-one errors, wrong conditionals, unreachable branches,
  incorrect assumptions, mismatched types, edge cases that break.
- Structural soundness — step back from individual files and judge the layout as a
  whole: could a newcomer grasp where things live and why? ALWAYS weigh whether
  re-organizing — moving, splitting, merging, or renaming files — would make the
  structure more sound and error-proof. Flag specifically:
  - Misfiled content: a file whose role doesn't match its folder (e.g. a fill-in
    template living under `docs/` instead of `templates/`, this-repo-only material
    mixed in with exported material).
  - Partition problems: a single file grown large enough that it should be split by
    responsibility, OR a responsibility scattered across overlapping files that
    should be one.
  - Ambiguous boundaries: folders or names that don't make a file's audience or
    authority obvious (e.g. "directive"-titled docs sitting outside `directives/`),
    and directories with enough files that an index or naming convention would aid
    navigation.
  Aim for clear partitioning — favor it over BOTH monolith files and needless
  fragmentation. Propose each reorg as a concrete finding (from → to), and prefer
  moves that don't churn many cross-references unless the clarity gain is large.

List every finding grouped by severity (critical, important, minor), each with
the file:line location (or path, for structural findings) and a one-line fix
suggestion. Do NOT make changes until I approve the findings.
