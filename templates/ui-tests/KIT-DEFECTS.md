# UI-test kit defects

An entry here is a bug that shipped in this kit and is therefore in a downstream copy too — NOT an upstream improvement, which stays ordinary per-file diff work.
`/refresh-repo` reads this file from the upstream head BEFORE diffing the kit, runs each entry's check against the project's `.github/scripts/ui-tests/`, and applies the minimal fix unless the project states why it does not apply (#327).
Entries are never deleted and ids are never reused. Each entry carries a `Revision:` number, starting at 1. A wrong entry is corrected IN PLACE: bump `Revision:` and add a `Corrected (rN):` line saying what changed. `/refresh-repo` always reads this file from the upstream head, so a correction takes effect on the next refresh, whereas a later entry could not stop the wrong fix from being applied first (#373). `/refresh-repo` re-runs EVERY check on EVERY refresh — a project's recorded decline never skips one; it only explains an `AFFECTED` result, and is re-confirmed against the code just checked. So neither an upstream correction nor a later local change can leave a stale decline standing.

Every check runs from the project's kit directory (each `UI_TESTS_DIR` its workflows set, default `.github/scripts/ui-tests/`) and prints exactly one of `AFFECTED`, `CLEAR` or `UNDECIDED`. `UNDECIDED` means the copy no longer has the shape the check reads — read the code by hand and record the verdict; it is never a pass.

## KD-1 — S2 passes when a credential is configured and no auth gate is found

- **Revision:** 1
- **Fixed upstream:** 2026-08-26, PR #316 (commit `1d57879`), the #309 follow-up found by `claude.insurance`; reported undelivered by `claude.trading` (#327).
- **Bug:** with `TEST_AUTH_CREDENTIAL` set, S2 reads "no gate detected" as `mechanism = 'none'`, every assertion after it is guarded by `mechanism !== 'none'`, so a suite that never reached the login route reports "auth gate discovered and credential accepted" green.
- **Check:**
  ```bash
  s2=$(mktemp); awk '/^test\(.S2:/,/^}\);/' tests/app.spec.js \
    | perl -0pe 's{(["\x27\x60])((?:\\.|(?!\1).)*)\1|/\*.*?\*/|//[^\n]*}
                   {defined $1 ? ($2 eq "none" ? "\x27none\x27" : "\x27\x27") : ""}gse' > "$s2"
  if [ ! -s "$s2" ]; then echo UNDECIDED
  elif perl -0ne 'my $top = sub { my $p = shift; my $pre = substr($_, 0, $p);
                                  (($pre =~ tr/{//) - ($pre =~ tr/}//)) == 1
                                  && $pre !~ /\breturn\b/ };
                  while (/if\s*\(\s*mechanism\s*===\s*.none.\s*\)\s*\{?\s*throw\s+new\s+[A-Z]\w*\s*\(
                         |if\s*\(\s*!s2Gated\s*\)\s*\{\s*(?:(?:const|let)\s+\w+\s*=[^;{}]*;\s*)*if\s*\(\s*authConfigured\s*\)\s*\{?\s*throw\s+new\s+[A-Z]\w*\s*\(/gx) {
                    exit 0 if $top->($-[0]) }
                  exit 1' "$s2"
  then echo CLEAR
  else echo AFFECTED; fi; rm -f "$s2"
  ```
  CLOSED on purpose: `CLEAR` only for one of two exact shapes, with comments stripped and every string literal masked first, in ONE left-to-right pass so a `//` inside a string is not read as a comment (string text is replaced, except the literal `'none'` the shapes name) — the minimal fix below (`if (mechanism === 'none') throw new Error(…`), or the upstream kit's own (`if (!s2Gated) { … if (authConfigured) { throw new Error(…`, with nothing between the two conditions but plain `const`/`let` declarations — a further guard, block or early `return` in between means the throw can be skipped, so it is not the fix). Either shape must also sit DIRECTLY in S2's body (brace depth 1), with no `return` anywhere in S2 before it: nested under another condition, or behind an earlier exit, the throw can be skipped. (`test.skip` is not counted: skipping when no credential is set is S2's intended path.) Anything else is `AFFECTED`, including a correct fix written another way: that is the safe direction, and step 3's "state why it does not apply" is how such a project declines. A loose "any `throw` nearby" test was fooled by a comment and then by a string literal (#373), so it is not reopened. SCOPE: a lexical check over honest kit code, not a JavaScript parser — it catches a copy that DRIFTED from the fix, not one written to mislead it; a further spelling is recorded on the issue, not chased (`global.md` → *Review Rounds Have to Terminate*). Measured: `AFFECTED` on the kit at `fce69d9` and `ce2140a`, and on `ce2140a` with the throw inside a line comment, a block comment, a string literal, a string holding the fix's exact text (also after a string containing `//`), or either fix nested under an extra guard or behind an earlier `return` (braced, unbraced, or top-level before the minimal fix); `CLEAR` on the current kit and on `ce2140a` plus the fix below; `UNDECIDED` on a file with no top-level S2.
- **Minimal fix** — one line directly after S2's `const mechanism = … : 'none';` (S2 already skipped when no credential is set, so reaching it means one is):
  ```js
  if (mechanism === 'none') throw new Error(`S2 FAIL | no auth gate found at ${page.url()}, but TEST_AUTH_CREDENTIAL is set — this scenario never reached the gate (set APP_URL, or point S2 at the login route). Failing rather than passing: every assertion below is vacuous without a gate (directives#327).`);
  ```
  Not the upstream rewrite: `awaitAuthReady`, `credentialFor`/prefilled credentials and the no-credential skip are evolution — diff them per-file like anything else. The line also fails a gate `detectAndAuth` found but could not act on (it returns `'none'` there too); that is equally an attempt that never happened, so it fails for the same reason.
