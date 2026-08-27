#!/usr/bin/env python3
"""Guard: the ui-suite composite's viewport check and its Playwright run must see
the SAME environment.

WHY THIS EXISTS. `check-ui-viewports.js` IMPORTS the Playwright config, so it
evaluates whatever that config computes from process.env. If the check step is
given a thinner environment than the step that actually runs the suite, the two
read DIFFERENT configs: a selection key set only when TEST_AUTH_CREDENTIAL is
present is invisible to the check and active in the run. Codex reproduced exactly
that on #333 (a config setting `shard` under that condition) -- check step exit 0,
run step partitioned.

The fix was to copy the run step's env onto the check step. That copy is a
hand-maintained coupling held together by a comment, which is the enumerate-vs-
derive failure #333 spent seven rounds on. This script derives it instead: add a
variable to the run step and forget the check step, and CI says so.

Keys named in SETUP_ONLY are step plumbing rather than config inputs -- they
address the workspace, not the config's behaviour -- so they are exempt in the
direction that cannot hide a filter (the check step may carry them alone).

NOT exported: .github/ is outside every EXPORTS.json category path.

Run: python3 .github/scripts/check-ui-suite-env.py
"""
import sys
import yaml

ACTION = "templates/actions/ui-suite/action.yml"
CHECK_STEP = "Check three viewport classes are declared"
RUN_STEP = "Run Playwright tests"
SETUP_ONLY = {"TESTS_DIR", "SERVER_ROOT"}


def env_of(steps, name):
    for step in steps:
        if step.get("name") == name:
            return set((step.get("env") or {}).keys()), True
    return set(), False


def main():
    with open(ACTION, encoding="utf-8") as handle:
        doc = yaml.safe_load(handle)
    steps = (doc.get("runs") or {}).get("steps") or []

    check_env, check_found = env_of(steps, CHECK_STEP)
    run_env, run_found = env_of(steps, RUN_STEP)

    problems = []
    # A renamed step is not a pass. Without this the whole guard reads two empty
    # sets, finds them equal, and reports OK -- the fail-open shape it guards.
    if not check_found:
        problems.append(f'no step named "{CHECK_STEP}" in {ACTION}')
    if not run_found:
        problems.append(f'no step named "{RUN_STEP}" in {ACTION}')

    if check_found and run_found:
        missing = sorted((run_env - SETUP_ONLY) - check_env)
        if missing:
            problems.append(
                "the viewport check step is missing environment the run step has: "
                + ", ".join(missing)
                + "\n    The check IMPORTS the config, so a selection key conditional on one"
                + "\n    of these is invisible to it and active in the run (#333, round 8)."
            )

    if problems:
        print("check-ui-suite-env: FAILED")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    shared = sorted(run_env - SETUP_ONLY)
    print(
        "check-ui-suite-env: OK -- viewport check sees the run step's environment "
        f"({', '.join(shared) if shared else 'no config inputs'})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
