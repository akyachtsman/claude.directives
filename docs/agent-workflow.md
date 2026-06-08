# Agent Workflow

Use the agents as independent reviewers, not as a replacement for careful implementation work.

## Recommended Sequence

1. **Create a feature branch**
   - Keep changes isolated and reviewable.

2. **Implement code**
   - The parent Claude Code session or builder agent owns implementation.

3. **Run basic self-tests**
   - Run targeted tests while iterating.

4. **Write implementation summary**
   - Use `.agent-reports/implementation-summary.md`.

5. **Invoke `test-verifier`**
   - The verifier runs tests and checks edge cases independently.
   - The verifier must not edit code.

6. **Invoke `code-reviewer`**
   - The reviewer checks quality, architecture, maintainability, and coverage.

7. **Invoke `security-reviewer` if applicable**
   - Use for auth, authorization, input handling, data access, file handling, dependencies, infrastructure, secrets, or sensitive-data changes.

8. **Fix issues in the parent session**
   - Do not let reviewer agents silently patch their own findings unless explicitly requested.

9. **Re-run `test-verifier`**
   - Confirm fixes did not introduce regressions.

10. **Run CI or CI-equivalent checks**
    - Test, lint, typecheck, build, audit, migrations, or smoke tests as required.

11. **Invoke `pr-readiness-reviewer`**
    - Final gate for reports, checks, unresolved issues, and merge readiness.

## Responsibility Boundaries

- Builder or parent session: implement, fix, summarize, prepare PR.
- `test-verifier`: independent verification and edge-case analysis.
- `code-reviewer`: code quality and maintainability review.
- `security-reviewer`: security risk review.
- `pr-readiness-reviewer`: final readiness gate.
