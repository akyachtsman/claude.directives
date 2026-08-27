#!/usr/bin/env python3
"""Pinned cases for check-ui-suite-env.py.

WHY THIS EXISTS. The guard next door was written in round 8 of #333, corrected in
round 9, corrected again in round 10 -- and each time I verified it BY HAND, by
editing the real composite, running the guard, and restoring. That works only for
the branch you happen to think of. Round 10 rewrote the value comparison and
exercised only the "extra variable" path; the "differing value" path, which had
been verified in round 9, was left referencing a name that no longer existed and
raised NameError instead of reporting. Codex found it in round 11.

A guard with no case suite is verified by whoever last remembered to check, which
is the failure this repo keeps writing guards to prevent. Every branch that can
print gets a case here, including the ones that only fire when the guard is doing
its job.

Each case pins BOTH the exit code AND a required diagnostic substring: four
distinct problems exit 1, so "exit 1" alone would let a case keep passing while
the branch it was written for is broken and some other branch catches the input.

NOT exported: .github/ is outside every EXPORTS.json category path.

Run: python3 .github/scripts/check-ui-suite-env-cases.py
"""
import subprocess
import sys
import tempfile
from pathlib import Path

GUARD = Path(__file__).resolve().parent / "check-ui-suite-env.py"
REPO_ROOT = Path(__file__).resolve().parents[2]
LIVE = REPO_ROOT / "templates/actions/ui-suite/action.yml"

CHECK = "Check three viewport classes are declared"
RUN = "Run Playwright tests"


def action(check_env, run_env, check_name=CHECK, run_name=RUN,
           check_wd="tests", run_wd="tests"):
    def block(env):
        if not env:
            return ""
        return "      env:\n" + "".join(f"        {k}: {v}\n" for k, v in env.items())

    def wd(value):
        return f"      working-directory: {value}\n" if value is not None else ""
    return (
        "name: 'fixture'\nruns:\n  using: composite\n  steps:\n"
        f"    - name: {check_name}\n      shell: bash\n{wd(check_wd)}{block(check_env)}"
        "      run: node check.js\n"
        f"    - name: {run_name}\n      shell: bash\n{wd(run_wd)}{block(run_env)}"
        "      run: npx playwright test\n"
    )


BOTH = {"APP_URL": "a", "TEST_AUTH_CREDENTIAL": "b"}

CASES = [
    # The success path. Without this the guard could fail everything and the
    # suite would still be green on all the failure cases.
    ("identical env on both steps", action(dict(BOTH), dict(BOTH)), 0,
     "same step-level env and working directory"),

    # The success message must not overclaim: it compares declared YAML env and
    # cannot see what `npx` adds (#333 round 11).
    ("success line states the limit it operates under", action(dict(BOTH), dict(BOTH)), 0,
     "declared env only"),

    # Round 8's finding: run has something the check lacks.
    ("run step has a variable the check lacks",
     action({"APP_URL": "a"}, dict(BOTH)), 1, "missing environment the run step has"),

    # Round 10's finding: the direction I argued was safe. A config can branch on
    # a variable's ABSENCE, so an extra check-side variable hides a filter too.
    ("check step has a variable the run lacks",
     action(dict(BOTH), {"APP_URL": "a"}), 1, "carries environment the run step lacks"),

    # Round 9's finding, and the branch that broke in round 10: same key, other
    # value. It must REPORT, not raise -- a traceback is not a parity report.
    ("same key, different values — reports both sides",
     action({"APP_URL": "a"}, {"APP_URL": "z"}), 1, "DIFFERENT values"),
    ("same key, different values — names the run-side value, no traceback",
     action({"APP_URL": "a"}, {"APP_URL": "z"}), 1, "run='z'"),

    # WORKING DIRECTORY IS AN INPUT TOO (#333 rounds 9-12). A config is code and
    # can branch on process.cwd(), so the two steps evaluating it must run from
    # the same place. This replaced an `unset TESTS_DIR` mechanism that took four
    # attempts and was defective in two more ways when it was removed: the unset
    # was textual (an `if false; then unset …; fi` satisfied the regex) and the
    # step-level assignment shadowed an inherited value the run step still saw.
    # The composite now passes the directory via working-directory and a literal
    # `--tests-dir .`, so there is no variable to shadow, unset, or verify.
    ("both steps run from the same working directory", action(dict(BOTH), dict(BOTH)), 0,
     "same step-level env and working directory"),

    ("different working directories — a cwd-branching config diverges",
     action(dict(BOTH), dict(BOTH), check_wd=".", run_wd="tests"), 1,
     "DIFFERENT working directories"),

    ("check step declares no working directory at all",
     action(dict(BOTH), dict(BOTH), check_wd=None), 1,
     "DIFFERENT working directories"),

    # A renamed step must fail loudly. Without this the guard looks up two names,
    # finds neither, compares two empty mappings and reports OK.
    ("check step renamed away", action(dict(BOTH), dict(BOTH), check_name="Renamed"),
     1, f'no step named "{CHECK}"'),
    ("run step renamed away", action(dict(BOTH), dict(BOTH), run_name="Renamed"),
     1, f'no step named "{RUN}"'),

    # Neither step declaring env is legitimate parity, not an excuse to skip.
    ("neither step declares env", action({}, {}), 0, "empty"),
]


def run_guard(path):
    r = subprocess.run([sys.executable, str(GUARD), str(path)],
                       capture_output=True, text=True, cwd=REPO_ROOT)
    return r.returncode, f"{r.stdout}{r.stderr}".strip()


def main():
    failures = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, (label, body, expected, needle) in enumerate(CASES):
            path = Path(tmp) / f"case{i}.yml"
            path.write_text(body, encoding="utf-8")
            code, out = run_guard(path)
            if code != expected:
                failures.append(f"{label}\n      expected exit {expected}; got {code}.\n      {out}")
            elif needle not in out:
                failures.append(
                    f"{label}\n      exited {code} as expected, but for the wrong stated reason."
                    f"\n      expected the output to contain: {needle!r}\n      {out}"
                )
            else:
                print(f"OK:   {label} (exit {code})")

    # The guard must also still pass against the REAL composite. A suite that only
    # ever sees fixtures can be perfectly green while the shipped file is broken.
    code, out = run_guard(LIVE)
    if code != 0:
        failures.append(f"the live composite no longer passes\n      exit {code}\n      {out}")
    else:
        print("OK:   the live ui-suite composite passes (exit 0)")

    if failures:
        print("\ncheck-ui-suite-env-cases: FAILED\n")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"\ncheck-ui-suite-env-cases: OK — {len(CASES) + 1} pinned shapes read correctly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
