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
