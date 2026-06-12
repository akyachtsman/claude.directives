# Pull Request Checklist

## Summary

- [ ] The PR title clearly describes the change.
- [ ] The implementation summary is attached or available at `.agent-reports/implementation-summary.md`.
- [ ] The change is focused and does not include unrelated files.

## Testing

- [ ] I ran the project test command.
- [ ] I ran relevant targeted tests.
- [ ] I ran lint, typecheck, and build commands when available.
- [ ] I documented skipped checks and environment limitations.
- [ ] The independent `test-verifier` report is attached or available at `.agent-reports/test-report.md`.

## Review

- [ ] The code review report (official `pr-review-toolkit:code-reviewer`) is attached or available at `.agent-reports/code-review-report.md`.
- [ ] Critical review issues are fixed.
- [ ] Remaining follow-ups are documented and acceptable.

## Security

- [ ] I considered whether a security review is required.
- [ ] The security review (`/security-review`, written to `.agent-reports/security-review-report.md`) was run for auth, input handling, data access, secrets, dependency, infrastructure, file handling, or sensitive-data changes.
- [ ] No secrets or sensitive data were committed.

## CI and Readiness

- [ ] CI is expected to pass.
- [ ] The `pr-readiness-reviewer` final status is Ready or accepted as Conditional with documented reasons.
- [ ] Deployment, migration, or rollout notes are documented if applicable.
