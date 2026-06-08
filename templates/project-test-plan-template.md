# Project Test Plan

## Scope

- Project/module: `<name>`
- Feature or area under test: `<description>`
- Owner: `<team/person>`
- Last updated: `<date>`

## Test Command Reference

| Test type | Command | Required for PR | Notes |
| --- | --- | --- | --- |
| Unit | `<command>` | Yes/No | `<notes>` |
| Integration | `<command>` | Yes/No | `<services or fixtures>` |
| End-to-end | `<command>` | Yes/No | `<browser/device/environment>` |
| Type check | `<command>` | Yes/No | `<notes>` |
| Lint | `<command>` | Yes/No | `<notes>` |
| Build | `<command>` | Yes/No | `<notes>` |
| Security/audit | `<command>` | Yes/No | `<notes>` |

## Required Coverage Areas

- Happy path behavior
- Validation and invalid input
- Empty and boundary values
- Permission and authorization behavior
- Error handling and retry behavior
- Persistence, migrations, and rollback behavior
- API compatibility and serialization
- Performance-sensitive paths
- Accessibility and UX behavior, if applicable

## Environment Requirements

- Runtime versions: `<versions>`
- Required services: `<database/cache/queue/browser/etc.>`
- Fixtures/seeds: `<commands or files>`
- Required environment variables: `<names only>`
- External APIs: `<mocked/live/offline>`

## CI Expectations

- Required workflow(s): `<workflow names>`
- Required jobs: `<job names>`
- Known flaky tests: `<list and mitigation>`
- Expected runtime: `<duration>`

## Acceptance Criteria

- `<criterion 1>`
- `<criterion 2>`
- `<criterion 3>`
