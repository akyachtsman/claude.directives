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

Each case pins BOTH the exit code AND a required diagnostic substring: many
distinct problems exit 1, so "exit 1" alone would let a case keep passing while
the branch it was written for is broken and some other branch catches the input.

Since #335 the guard reads a SEQUENCE of three steps rather than a pair, and the
third one gets its own copy of every case. A generalisation that silently dropped
the third entry would look identical from the two that were already covered, so
"it is the same code path" is not evidence -- only a case that reddens is.

NOT exported: .github/ is outside every EXPORTS.json category path.

Run: python3 .github/scripts/check-ui-suite-env-cases.py
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

# Overridable so a MUTANT can be pointed at, the way CHECK_UI_VIEWPORTS_BIN and
# CHECK_CLAIMS_BIN are used elsewhere in this directory. A case that cannot be
# shown to redden is a case nobody has measured -- and this guard's rules have
# been rewritten four times, so "these cases still pass" says nothing on its own.
GUARD = Path(os.environ.get("CHECK_UI_SUITE_ENV_BIN",
                            Path(__file__).resolve().parent / "check-ui-suite-env.py"))
REPO_ROOT = Path(__file__).resolve().parents[2]
LIVE = REPO_ROOT / "templates/actions/ui-suite/action.yml"

CHECK = "Check three viewport classes are declared"
RUN = "Run Playwright tests"
# The post-run half of the gate (#335). It imports the config exactly as the
# pre-run check does, so every parity argument applies to it and it needs the
# same cases. Its defaults mirror the run step so the fixtures written before it
# existed keep meaning what they meant.
POST = "Check the run actually exercised all three viewport classes"
UNSET = object()

# THE PINNED BODIES, WRITTEN OUT HERE RATHER THAN IMPORTED. The guard now
# compares each step's `run` against an exact string (#347 round 10, after four
# parsers were each walked around by a shell feature they did not model). A
# cases file that imported that constant would agree with the guard by
# construction and prove nothing about it; spelling them again is what makes a
# silent edit to SEQUENCE fail here.
GATE = 'node "$GITHUB_WORKSPACE/.github/scripts/check-ui-viewports.js"'
CHECK_BODY = f"{GATE} --tests-dir ."
RUN_BODY = "npx playwright test"
POST_BODY = f'{GATE} --tests-dir . --report "$REPORT_PATH"'

# The one diagnostic every body-shape refusal now prints. Named because it is
# asserted twenty times below and a typo in one of them would silently weaken
# that case to "exit 1 for some reason" — the failure mode this suite's header
# is about.
PIN = "does not run the pinned command"


def action(check_env, run_env, check_name=CHECK, run_name=RUN,
           check_wd="tests", run_wd="tests", decoy=None, between=None,
           check_body=None, run_body=None, run_uses=None,
           post_env=UNSET, post_name=POST, post_wd="tests", post_body=None,
           post_uses=None, between_post=None):
    def block(env):
        if not env:
            return ""
        return "      env:\n" + "".join(f"        {k}: {v}\n" for k, v in env.items())

    def wd(value):
        return f"      working-directory: {value}\n" if value is not None else ""

    def body(text):
        return "      run: |\n" + "".join(f"        {ln}\n" for ln in text.splitlines())

    decoy_yaml = ""
    if decoy:
        decoy_yaml = (f"    - name: {decoy}\n      shell: bash\n{wd('tests')}"
                      f"{block(dict(BOTH))}      run: echo decoy\n")
    return (
        "name: 'fixture'\nruns:\n  using: composite\n  steps:\n"
        + decoy_yaml
        + f"    - name: {check_name}\n      shell: bash\n{wd(check_wd)}{block(check_env)}"
        + body(check_body or CHECK_BODY)
        + (f"    - name: {between}\n      shell: bash\n      run: echo between\n" if between else "")
        + f"    - name: {run_name}\n      shell: bash\n{wd(run_wd)}{block(run_env)}"
        + (f"      uses: {run_uses}\n" if run_uses else body(run_body or RUN_BODY))
        + (f"    - name: {between_post}\n      shell: bash\n      run: echo between\n"
           if between_post else "")
        + f"    - name: {post_name}\n      shell: bash\n{wd(post_wd)}"
        + block(run_env if post_env is UNSET else post_env)
        + (f"      uses: {post_uses}\n" if post_uses
           else body(post_body or POST_BODY))
    )


BOTH = {"APP_URL": "a", "TEST_AUTH_CREDENTIAL": "b"}

CASES = [
    # The success path. Without this the guard could fail everything and the
    # suite would still be green on all the failure cases.
    ("identical env on both steps", action(dict(BOTH), dict(BOTH)), 0,
     "same step-level env and working directory"),

    # Codex round 17: index adjacency is not EXECUTION adjacency. A command inside
    # either step runs between the two config evaluations while the indices stay
    # consecutive — the cheap observable standing in for the property, again.
    ("a command inside the run step before playwright — refused",
     action(dict(BOTH), dict(BOTH),
            run_body="./flip-the-world.sh\nnpx playwright test"),
     1, PIN),

    ("a command inside the check step after the gate — refused",
     action(dict(BOTH), dict(BOTH),
            check_body=CHECK_BODY + "\n./flip-the-world.sh"),
     1, PIN),

    # Codex round 18: ONE line, two commands. The round-17 line count called this
    # adjacent. Shapes are now constrained rather than lines counted.
    ("commands composed with && on one line — refused",
     action(dict(BOTH), dict(BOTH),
            run_body="./flip-the-world.sh && npx playwright test"),
     1, PIN),

    ("a command substitution on the invocation line — refused",
     action(dict(BOTH), dict(BOTH),
            run_body="npx playwright test $(./flip-the-world.sh)"),
     1, PIN),

    # Round 18 again: the round-17 version never checked the surviving line, so a
    # step could be renamed onto an entirely different command and still pass.
    ("the run step invokes something else entirely — refused",
     action(dict(BOTH), dict(BOTH), run_body="./flip-the-world.sh"),
     1, PIN),

    ("the run step is a `uses:` — refused, its internals are invisible",
     action(dict(BOTH), dict(BOTH), run_uses="./some/action"), 1, "is a `uses:` step"),

    # THE PIN IS A PIN. This body runs the right script with the right argument
    # by a different path spelling, and it is refused — deliberately. The guard
    # no longer decides what a command DOES from its text; four attempts to do
    # that were each walked around (#347 rounds 5, 6, 9, 10). What it can decide
    # is whether the body is the one this composite ships, and a downstream copy
    # that edited it is a copy nothing here has checked.
    ("a different path spelling of the same invocation — refused",
     action(dict(BOTH), dict(BOTH),
            check_body="node .github/scripts/check-ui-viewports.js --tests-dir .",
            run_body=RUN_BODY), 1, PIN),

    # The twin the success case above already carries: the shipped bodies pass.
    # Spelled out again with them passed EXPLICITLY, so a defaults change in
    # action() cannot make the success path vacuous.
    ("the pinned bodies, passed explicitly — must NOT trip",
     action(dict(BOTH), dict(BOTH), check_body=CHECK_BODY,
            run_body=RUN_BODY, post_body=POST_BODY), 0, "consecutive steps"),

    # Round 16: a step between the two lets the config observe a different world
    # at the gate than at the run — Codex reproduced it with `Start local server`
    # flipping whether APP_URL answers.
    ("a step between the check and the run — refused",
     action(dict(BOTH), dict(BOTH), between="Start local server"), 1,
     f'"{RUN}" does not run immediately after "{CHECK}"'),

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
     "DIFFERENT working directory"),

    ("check step declares no working directory at all",
     action(dict(BOTH), dict(BOTH), check_wd=None), 1,
     "DIFFERENT working directory"),

    # Codex round 14: a DECOY step carrying a reserved name, placed before the
    # real one, made env_of() return the decoy's environment and the guard report
    # parity while the actual run saw something else. "Take the first match" is
    # the same substitution as every other one on this PR — a cheap stand-in for
    # identifying the thing itself.
    ("a decoy step named like the run step — refused, not silently preferred",
     action({"APP_URL": "a"}, dict(BOTH), decoy=RUN), 1, f'2 steps are named "{RUN}"'),

    ("a decoy step named like the check step — refused",
     action(dict(BOTH), dict(BOTH), decoy=CHECK), 1, f'2 steps are named "{CHECK}"'),

    # A renamed step must fail loudly. Without this the guard looks up two names,
    # finds neither, compares two empty mappings and reports OK.
    ("check step renamed away", action(dict(BOTH), dict(BOTH), check_name="Renamed"),
     1, f'no step named "{CHECK}"'),
    ("run step renamed away", action(dict(BOTH), dict(BOTH), run_name="Renamed"),
     1, f'no step named "{RUN}"'),

    # Neither step declaring env is legitimate parity, not an excuse to skip.
    ("neither step declares env", action({}, {}), 0, "empty"),

    # ── THE POST-RUN CHECK IS THE SAME STEP AGAIN (#335) ────────────────────
    # It imports the config too, so every branch above has to hold from its side
    # as well. Generalising the guard over a SEQUENCE rather than a pair is what
    # makes that true by construction; these cases are what prove it, because a
    # generalisation that quietly skipped the third entry would look identical
    # from the two that were already covered.
    ("post-run check renamed away", action(dict(BOTH), dict(BOTH), post_name="Renamed"),
     1, f'no step named "{POST}"'),

    ("a decoy step named like the post-run check — refused",
     action(dict(BOTH), dict(BOTH), decoy=POST), 1, f'2 steps are named "{POST}"'),

    ("post-run check is missing environment the run has",
     action(dict(BOTH), dict(BOTH), post_env={"APP_URL": "a"}), 1,
     f'"{POST}" is missing environment the run step has'),

    ("post-run check carries environment the run lacks",
     action(dict(BOTH), {"APP_URL": "a"}, post_env=dict(BOTH)), 1,
     f'"{POST}" carries environment the run step lacks'),

    ("post-run check sets the same variable to a different value",
     action({"APP_URL": "z"}, {"APP_URL": "z"}, post_env={"APP_URL": "a"}), 1,
     "DIFFERENT values"),

    ("post-run check runs from a different working directory",
     action(dict(BOTH), dict(BOTH), post_wd="."), 1,
     f'"{POST}" runs from a DIFFERENT working directory'),

    ("a step between the run and the post-run check — refused",
     action(dict(BOTH), dict(BOTH), between_post="Upload test results"), 1,
     f'"{POST}" does not run immediately after "{RUN}"'),

    ("post-run check composes another command onto its invocation",
     action(dict(BOTH), dict(BOTH),
            post_body="./flip-the-world.sh && " + POST_BODY),
     1, PIN),

    ("post-run check runs two commands",
     action(dict(BOTH), dict(BOTH),
            post_body="./flip-the-world.sh\n" + POST_BODY),
     1, PIN),

    # Codex #347 round 9: a body that MENTIONS the script runs nothing. This
    # satisfied the one-line rule, the no-composer rule and both token tests.
    ("post-run check merely echoes the script name — refused",
     action(dict(BOTH), dict(BOTH),
            post_body="echo check-ui-viewports --report r.json"), 1, PIN),

    ("run step merely echoes playwright test — refused",
     action(dict(BOTH), dict(BOTH), run_body="echo npx playwright test"), 1, PIN),

    ("post-run check names the gate only in a trailing argument — refused",
     action(dict(BOTH), dict(BOTH),
            post_body="node ./other.js --tests-dir . --report r.json --note check-ui-viewports"),
     1, PIN),

    # ── THE TWO ROUND-10 WALKAROUNDS ─────────────────────────────────────────
    # Both of these passed the round-9 guard, which required a launcher in token
    # 0 and the needles inside the first three whitespace-separated tokens.
    # Neither runs the gate. They are the reason the parser is gone rather than
    # patched a fifth time, and they stay here as the pin's discrimination: a
    # rewrite that goes back to reading shell text reddens on them.
    ("`python3 -c` with the script name as a STRING — refused (#347 r10)",
     action(dict(BOTH), dict(BOTH),
            post_body="python3 -c \"'check-ui-viewports'\" --report r.json"), 1, PIN),

    ("`--report` sitting after a `#` comment — refused (#347 r10)",
     action(dict(BOTH), dict(BOTH),
            post_body="node check-ui-viewports.js # --report r.json"), 1, PIN),

    ("post-run check invokes something else entirely",
     action(dict(BOTH), dict(BOTH), post_body="./flip-the-world.sh"), 1, PIN),

    # Codex #347 round 5. The post-run step exists FOR --report: without it the
    # gate reports what the config declares and exits 0, so dropping the argument
    # leaves this guard green, the live composite green, and execution coverage
    # silently unchecked. Naming the script is not enough.
    # Codex #347 round 6: `--report` is a SUBSTRING of `--reporter=json` and of
    # `--report-path`, and the viewport script ignores both as unknown options
    # while doing only its declaration check.
    #
    # Under the pin these are three spellings of one thing — a body that is not
    # the pinned body — and that is the simplification the pin buys. They stay as
    # separate cases because each names a real way the post-run step has been
    # observed to stop checking execution, and a case list is also a record.
    ("post-run check passes --reporter=json instead of --report — refused",
     action(dict(BOTH), dict(BOTH),
            post_body=CHECK_BODY + " --reporter=json"), 1, PIN),

    ("post-run check passes --report-path instead of --report — refused",
     action(dict(BOTH), dict(BOTH),
            post_body=CHECK_BODY + " --report-path r.json"), 1, PIN),

    ("post-run check passes --report=<path> rather than the pinned spelling — refused",
     action(dict(BOTH), dict(BOTH),
            post_body=CHECK_BODY + " --report=r.json"), 1, PIN),

    ("post-run check drops --report — refused",
     action(dict(BOTH), dict(BOTH), post_body=CHECK_BODY), 1, PIN),

    # The twin: the pre-run check must NOT be required to pass --report, or the
    # requirement would be a blanket rule rather than one about this step's job.
    ("pre-run check without --report — must NOT trip",
     action(dict(BOTH), dict(BOTH), check_body=CHECK_BODY), 0,
     "consecutive steps"),

    ("post-run check is a `uses:` step",
     action(dict(BOTH), dict(BOTH), post_uses="./some/action"), 1, "is a `uses:` step"),
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
