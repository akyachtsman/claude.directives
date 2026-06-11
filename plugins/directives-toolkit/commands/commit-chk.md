---
description: "Manual backup trigger for the pre-push verification directive (run tests, lint, CI checks before committing)"
---
This is the manual backup for the standing verify-locally-before-pushing
directive in claude.directives. The directive should run this
automatically; invoke this skill explicitly when the auto-check did not fire or
you want to force a verification pass.

Run all tests in the repo. Run lint and type checks if configured. Check current
CI/Actions status — wait for green if running. Confirm no uncommitted changes
were accidentally introduced. Report status before opening any PR or pushing.
