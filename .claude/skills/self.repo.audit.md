---
name: self.repo.audit
description: Audit current repo for drift between directive files and actual code, plus a full recursive code-correctness sweep
trigger: slash_command_and_auto
---
Precondition note: this audits code against the directives as currently
imported. If you suspect the rulebook itself is stale, run env.chk first —
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

List every finding grouped by severity (critical, important, minor), each with
the file:line location and a one-line fix suggestion. Do NOT make changes until
I approve the findings.
