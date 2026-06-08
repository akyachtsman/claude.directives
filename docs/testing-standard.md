# Testing Standard

Testing should provide enough evidence that a change works, does not regress important behavior, and is safe to ship.

## Minimum Expectations

For every behavior change:

- Run the relevant targeted tests.
- Run the full project test suite when feasible.
- Add or update tests for new behavior.
- Cover at least one failure path when the code handles errors.
- Document any skipped checks and why they were skipped.

## Coverage Areas

The `test-verifier` should look for:

- Happy path behavior
- Invalid input and validation errors
- Empty values and boundary values
- Permission and authorization behavior
- API contract and serialization compatibility
- Database migration and persistence behavior
- Retry, timeout, and cleanup behavior
- Regression risk in nearby flows
- Security-adjacent behavior such as sensitive logging or unsafe input handling

## Command Selection

Use commands in this priority order:

1. Commands explicitly listed in `CLAUDE.md`.
2. Commands used by CI.
3. Commands inferred from package metadata.
4. Safe targeted commands for the changed area.

## Reporting

A test report should include exact commands, results, relevant output, skipped checks, suspected root causes for failures, recommended fixes, and a clear merge-safety verdict.
