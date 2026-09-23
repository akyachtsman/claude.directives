# UI-test kit defects

An entry here is a bug that shipped in this kit and is therefore in a downstream copy too — NOT an upstream improvement, which stays ordinary per-file diff work.
`/refresh-repo` reads this file from the upstream head BEFORE diffing the kit, runs each entry's check against the project's `.github/scripts/ui-tests/`, and applies the minimal fix unless the project states why it does not apply (#327).
Entries are append-only: never edit or delete one; a wrong entry is corrected by a later entry that names it.

Every check runs from the project's `.github/scripts/ui-tests/` and prints exactly one of `AFFECTED`, `CLEAR` or `UNDECIDED`. `UNDECIDED` means the copy no longer has the shape the check reads — read the code by hand and record the verdict; it is never a pass.

## KD-1 — S2 passes when a credential is configured and no auth gate is found

- **Fixed upstream:** 2026-08-26, PR #316 (commit `1d57879`), the #309 follow-up found by `claude.insurance`; reported undelivered by `claude.trading` (#327).
- **Bug:** with `TEST_AUTH_CREDENTIAL` set, S2 reads "no gate detected" as `mechanism = 'none'`, every assertion after it is guarded by `mechanism !== 'none'`, so a suite that never reached the login route reports "auth gate discovered and credential accepted" green.
- **Check:**
  ```bash
  s2=$(mktemp); awk '/^test\(.S2:/,/^}\);/' tests/app.spec.js \
    | perl -0pe 's#/\*.*?\*/##gs; s#(^|[^:])//[^\n]*#$1#gm' > "$s2"
  if [ ! -s "$s2" ]; then echo UNDECIDED
  elif grep -A4 -E "if \(.*(mechanism === 'none'|!s2Gated)" "$s2" \
       | grep -qE '(^|[;{)[:space:]])throw[[:space:]]+(new[[:space:]]+)?[A-Z]'; then echo CLEAR
  else echo AFFECTED; fi; rm -f "$s2"
  ```
  `AFFECTED` = no executable `throw` (a `throw` statement raising an error object, with comments stripped first — a `// TODO: throw` does not count) within four lines of a condition on `mechanism === 'none'` or `!s2Gated` inside S2. Measured: `AFFECTED` on the kit at `fce69d9` and `ce2140a`; `CLEAR` on the kit since `1d57879`, on `ce2140a` plus the fix below, and on a `claude.trading`-style one-line `throw`; `UNDECIDED` on a file with no top-level S2.
- **Minimal fix** — one line directly after S2's `const mechanism = … : 'none';` (S2 already skipped when no credential is set, so reaching it means one is):
  ```js
  if (mechanism === 'none') throw new Error(`S2 FAIL | no auth gate found at ${page.url()}, but TEST_AUTH_CREDENTIAL is set — this scenario never reached the gate (set APP_URL, or point S2 at the login route). Failing rather than passing: every assertion below is vacuous without a gate (directives#327).`);
  ```
  Not the upstream rewrite: `awaitAuthReady`, `credentialFor`/prefilled credentials and the no-credential skip are evolution — diff them per-file like anything else. The line also fails a gate `detectAndAuth` found but could not act on (it returns `'none'` there too); that is equally an attempt that never happened, so it fails for the same reason.
