# Code Review Standard

Code review should improve correctness, maintainability, readability, and delivery confidence without turning every preference into a blocker.

## Review Priorities

1. Correctness and requirement fit
2. Safety and regression risk
3. Test coverage and test quality
4. Maintainability and simplicity
5. Architecture and project convention alignment
6. Naming, readability, and cleanup

## Blocking Issues

Request changes for:

- Incorrect behavior or broken contracts
- Missing handling for common failure paths
- Missing tests for important behavior
- Risky hidden dependencies or global state
- Unjustified complexity that makes the code hard to maintain
- Security issues that should be fixed before merge

## Non-Blocking Suggestions

Use suggestions for:

- Minor naming improvements
- Small refactors that are not required for correctness
- Additional tests for rare edge cases
- Documentation or observability improvements

## Review Output

Every review should include:

- Recommendation: Approve, Approve with follow-ups, or Request changes
- Risk level: Low, Medium, or High
- Critical issues
- Suggested improvements
- Optional improvements
- Test coverage assessment
- Merge recommendation

## Fail-Open Guards — what does this look like when it fails?

A guard **fails open** when its failure produces the same observable output as its success — not a bug that hides, a bug shaped like a pass. Reading CI output cannot find one, because CI output is what it forges. Ask it of every check, timeout, filter, catch and skip: *what does this look like when it fails?* If the answer is "the same", it is not a guard (#323).

That is a question, not a checklist: a list of shapes would itself fail open, covering what is on it and silently missing the next. The instances below — all measured in `claude.insurance` on 2026-08-26, all green for months — illustrate it; they do not bound it:

- **A default that reads as a value.** Playwright's `navigationTimeout` and `actionTimeout` default to `0`, meaning *no* timeout, so every per-scenario budget summed from them was arithmetic over unbounded terms. The config was silent; there was nothing to read.
- **A pipeline that swallows its failure.** `if git diff --name-only "$BASE_SHA"...HEAD | grep -qE …` — `-e` is suspended inside an `if` and there was no `pipefail`, so an unresolvable base made grep match nothing and the job reported "No UI-relevant changes" and skipped, green.
- **A filter narrower than what it filters.** `UI_PATHS` matched only `index.html` on an app that is mostly `js/` and `css/`, so every js- or css-only PR skipped the browser job.
- **A catch that eats a `ReferenceError`.** `catch { return null }` cannot tell "no credential in the file" from "`readFileSync` is not defined". The fallback was dead in the tier nobody watched (local, no secret) and never reached in the one they did.

Two consequences follow. **A skip is not a pass** — anything that can decide to skip needs its skip *reason* asserted, not just its exit code. **A broad catch converts a programming error into a business-logic answer.** And note what found them: three came from diffing an installed copy against the current template and *reading* the diff rather than applying it, the fourth from an adversarial reviewer on a diff its author had called mechanical. None came from running the suite.
