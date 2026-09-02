#!/usr/bin/env python3
"""Guard: templates/actions/ui-suite/validate-report-path.py accepts and refuses
the right values.

WHY THIS EXISTS, AND WHY IT DID NOT UNTIL NOW. That validator is the only thing
standing between the `report-path` input and three consumers -- an `rm`, a
`--report` argument, and actions/upload-artifact's MULTILINE path list -- and
this repo does not use the ui-suite composite, so NOTHING here would notice it
break. That is the same hole check-contrast-cases.js was written for (#334):
an exported guard with no local reader.

It is also the file with the worst track record on #347. Three consecutive Codex
rounds found defects in it, and TWO of those were the validator refusing or
admitting the wrong thing rather than the composite misusing it:
  r8   no validation at all -- a newline became a second artifact entry
  r9   `../../../**/*` passed containment and uploaded the workspace
  r10  `..report.json` refused (a text prefix standing in for a path component)
       and `../../../~/secret.txt` admitted (upload-artifact expands a leading ~)
A refusal rule nobody exercises is a rule that drifts in whichever direction the
last edit pushed it, and both directions cost: a wrong ACCEPT is an exfiltration
path, a wrong REFUSE breaks every downstream suite at once.

Each case pins the exit code AND a required substring, for the reason the other
case files here state: several distinct rules exit 1, so a case asserting only
"refused" can keep passing while the rule it was written for is gone.

NOT exported: .github/ is outside every EXPORTS.json category path.

Run: python3 .github/scripts/check-report-path-cases.py
"""
import os
import subprocess
import sys
import tempfile

# Overridable so a MUTANT can be pointed at, the way CHECK_UI_VIEWPORTS_BIN and
# CHECK_CLAIMS_BIN are used elsewhere in this directory: a case that cannot be
# shown to redden is a case nobody has measured.
VALIDATOR = os.environ.get(
    "CHECK_REPORT_PATH_BIN",
    "templates/actions/ui-suite/validate-report-path.py",
)
TESTS_DIR = ".github/scripts/ui-tests"
# The repo root — every case resolves against it.
WORKSPACE = os.path.realpath(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))

# (label, report-path, expected exit, required substring in the output,
#  expected `path=` output when accepted -- None when refused)
CASES = [
    # ── THE SHIPPED DEFAULT. Without this the validator could refuse everything
    # and every other case here would still be green.
    ("the composite's own default",
     "../../../.agent-reports/playwright-results.json", 0,
     "inside the workspace", ".agent-reports/playwright-results.json"),

    ("a plain relative filename", "results.json", 0,
     "inside the workspace", ".github/scripts/ui-tests/results.json"),

    # ── #347 round 10: A TEXT PREFIX IS NOT A PATH COMPONENT ─────────────────
    # `landed.startswith("..")` refused this ordinary filename. The rule is about
    # whether the first step goes UP, which is a question about components.
    ("a filename that merely BEGINS with two dots", "..report.json", 0,
     "inside the workspace", ".github/scripts/ui-tests/..report.json"),

    ("a directory that begins with two dots", "..cache/r.json", 0,
     "inside the workspace", ".github/scripts/ui-tests/..cache/r.json"),

    # ── #347 round 10: THE TILDE IS A THIRD DESTINATION ──────────────────────
    # This normalises to `~/secret.txt`, which climbs nowhere by the containment
    # rule and reads the runner's home by the consumer that expands it.
    ("a path normalising to a leading ~", "../../../~/secret.txt", 1,
     "home-directory reference", None),

    ("a bare leading ~ at the workspace root", "../../../~root/.ssh/id_rsa", 1,
     "home-directory reference", None),

    # The twin: a `~` that is NOT the first component is not expanded by
    # upload-artifact, so refusing it would be a false alarm on a legal filename.
    ("a ~ inside the path, not leading", "reports/~tmp/r.json", 0,
     "inside the workspace", ".github/scripts/ui-tests/reports/~tmp/r.json"),

    # ── #347 round 8: THE ARTIFACT LIST IS LINE-ORIENTED ─────────────────────
    ("a newline injecting a second artifact entry",
     "r.json\n/etc/passwd", 1, "line break", None),

    ("a lone carriage return", "r.json\r/etc/passwd", 1, "line break", None),

    ("a form feed", "r.json\x0c/etc/passwd", 1, "line break", None),

    # U+2028 is a line separator to some consumers and invisible in a diff.
    ("a unicode line separator", "r.json\u2028/etc/passwd", 1, "line break", None),

    # ── #347 round 9: THE UPLOADER EXPANDS PATTERNS ──────────────────────────
    # `../../../**/*` normalises to `**/*`, which is workspace-local by the
    # containment rule and the whole workspace by the consumer.
    ("a glob that normalises inside the workspace", "../../../**/*", 1,
     "glob metacharacters", None),

    ("a single-character wildcard", "r?.json", 1, "glob metacharacters", None),

    ("a character class", "r[12].json", 1, "glob metacharacters", None),

    ("an exclusion pattern", "!r.json", 1, "glob metacharacters", None),

    # ── CONTAINMENT ──────────────────────────────────────────────────────────
    ("a path climbing out of the workspace", "../../../../etc/passwd", 1,
     "resolves outside the workspace", None),

    ("an absolute path", "/etc/passwd", 1, "is absolute", None),

    ("a windows-style absolute path", "C:/secrets", 1, "is absolute", None),

    ("a backslash-rooted path", "\\\\server\\share", 1, "is absolute", None),

    # `..` IS LEGITIMATE HERE -- the shipped default climbs three levels. Pinned
    # so a future tightening that simply banned `..` reddens rather than shipping
    # and breaking every downstream suite.
    ("climbing but landing inside", "../../../r.json", 0,
     "inside the workspace", "r.json"),

    # ── EMPTINESS AND WHITESPACE ─────────────────────────────────────────────
    ("an empty value", "", 1, "is empty", None),

    ("whitespace only", "   ", 1, "is empty", None),

    ("a leading space", " r.json", 1, "leading or trailing whitespace", None),

    ("a trailing space", "r.json ", 1, "leading or trailing whitespace", None),

    # The twin: an INTERNAL space is a legal filename character and a path list
    # does not split on it. Refusing it would be a false alarm.
    ("an internal space", "my report.json", 0,
     "inside the workspace", ".github/scripts/ui-tests/my report.json"),

    # ── #347 round 11: A DIRECTORY IS NOT A REPORT ───────────────────────────
    # `actions/upload-artifact` uploads a directory RECURSIVELY. `../../../.`
    # resolves to the workspace root, passed every round-10 rule, and would have
    # published the whole tree — validation succeeds, so the upload runs under
    # always() even though the `rm -f` step fails on a directory.
    ("a path resolving to the workspace root", "../../../.", 1,
     "names a directory, not a report file", None),

    ("an existing directory inside the tests dir", "../../../templates", 1,
     "names a directory, not a report file", None),

    # `.` and `..` name a directory even where none exists yet, so the isdir
    # check alone would miss them on a clean checkout.
    ("a bare dot", ".", 1, "does not end in a filename", None),

    ("a bare double dot", "..", 1, "names a directory, not a report file", None),

    ("a trailing slash", "reports/", 1, "does not end in a filename", None),

    # ── #347 round 11: WORKSPACE-LOCAL ABSOLUTE tests-dir ────────────────────
    # `working-directory:` accepts an absolute path, and joining one to a
    # relative report-path makes `landed` absolute — which round 10 refused
    # outright, breaking a supported caller. Containment is now asked of resolved
    # paths against the workspace, which is what the rule always meant.
    ("an absolute tests-dir inside the workspace",
     "results.json", 0, "inside the workspace", "templates/ui-tests/results.json",
     os.path.join(WORKSPACE, "templates", "ui-tests")),

    # The twin: an absolute tests-dir OUTSIDE it must still be refused, or the
    # relaxation above would have removed the rule rather than corrected it.
    ("an absolute tests-dir outside the workspace",
     "results.json", 1, "resolves outside the workspace", None, "/etc"),

    # ── THE HANDOFF (#347 round 10) ──────────────────────────────────────────
    # Round 9 emitted only the workspace-relative `path`, so the three steps that
    # run from tests-dir stayed on the RAW input and the post-run gate -- which
    # runs under always() -- still received a refused value. Both bases are
    # emitted now; a validator that stops emitting either silently returns those
    # consumers to the raw input.
    ("the tests-dir-relative base is emitted too",
     "../../../.agent-reports/playwright-results.json", 0,
     "inside the workspace", ".agent-reports/playwright-results.json"),
]


def run(value, tests_dir=None):
    with tempfile.NamedTemporaryFile("w+", delete=False) as handle:
        out_file = handle.name
    try:
        env = dict(os.environ)
        env["REPORT_PATH"] = value
        env["TESTS_DIR"] = tests_dir or TESTS_DIR
        env["GITHUB_OUTPUT"] = out_file
        # PINNED, not inherited. Containment is resolved against GITHUB_WORKSPACE
        # since #347 round 11, so a suite that let the runner's own value through
        # would pass or fail by where it happened to be checked out.
        env["GITHUB_WORKSPACE"] = WORKSPACE
        proc = subprocess.run([sys.executable, VALIDATOR], env=env,
                              capture_output=True, text=True, timeout=30)
        with open(out_file, encoding="utf-8") as handle:
            outputs = handle.read()
        return proc.returncode, proc.stdout + proc.stderr, outputs
    finally:
        os.unlink(out_file)


def main():
    failures = []
    for case in CASES:
        label, value, want_code, needle, want_path = case[:5]
        tests_dir = case[5] if len(case) > 5 else None
        code, text, outputs = run(value, tests_dir)
        if code != want_code:
            failures.append(f"{label}\n      expected exit {want_code}; got {code}.\n"
                            + "\n".join("      " + ln for ln in text.splitlines()))
            continue
        if needle not in text:
            failures.append(f"{label}\n      exit {code} was right but the diagnostic was not:\n"
                            + f"      expected to contain {needle!r}\n"
                            + "\n".join("      " + ln for ln in text.splitlines()))
            continue
        if want_path is None:
            if outputs.strip():
                failures.append(f"{label}\n      a REFUSED value still emitted step outputs:\n"
                                + f"      {outputs!r}\n"
                                + "      A consumer reading them would receive the rejected path.")
                continue
        else:
            emitted = dict(
                line.split("=", 1) for line in outputs.splitlines() if "=" in line
            )
            if emitted.get("path") != want_path:
                failures.append(f"{label}\n      path output was {emitted.get('path')!r}, "
                                f"expected {want_path!r}")
                continue
            # BOTH BASES, every time. The steps that run from tests-dir need the
            # value in THEIR base; round 9 shipped only the other one and left
            # them on the raw input (#347 round 10).
            if emitted.get("relative") != value:
                failures.append(f"{label}\n      relative output was "
                                f"{emitted.get('relative')!r}, expected {value!r}\n"
                                + "      The three sequence steps read this one; without it they"
                                + "\n      fall back to the unvalidated action input.")
                continue
        print(f"OK:   {label} (exit {code})")

    if failures:
        print("\ncheck-report-path-cases: FAILED")
        for item in failures:
            print(f"  - {item}")
        return 1
    print(f"\ncheck-report-path-cases: OK — {len(CASES)} pinned report-path shapes read correctly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
