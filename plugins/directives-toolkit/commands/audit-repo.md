---
description: "Audit current repo for drift between directive files and actual code, a full recursive code-correctness sweep, and structural soundness — always weighing whether re-organizing files would make the layout clearer and more error-proof"
---
Precondition note: this audits code against the directives as currently
imported. If you suspect the rulebook itself is stale, run /env-chk first —
self-audit does not verify upstream directive freshness.

Read CLAUDE.md in the current repo and all imported directive URLs it references.

Then recursively visit EVERY file in the repository (skip only vendored/build
artifacts: node_modules, dist, .git, lockfiles, build output) and check for:
- Directive drift — code/config that violates a directive rule.
- Errors — syntax errors, broken references, dead imports, invalid config,
  malformed data, things that won't run.
- Redundancies and duplications — duplicated code, repeated literals/constants,
  copy-pasted blocks, overlapping functions, dead/unused code.
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
