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

EXACT PARITY OF ENV AND WORKING DIRECTORY, no exemptions. An earlier version exempted "step plumbing" names
(TESTS_DIR, SERVER_ROOT) in the direction where the CHECK step carried a variable
the run step lacked, on the argument that this direction could not hide a filter.
That argument was wrong, and Codex showed how (#333 round 10): a config can
declare a filter only when a variable is ABSENT. The check step had TESTS_DIR and
saw no filter; the run step lacked it and applied one. An extra variable on
either side is a divergence, so both directions are now checked and the exemption
list is gone -- the composite gives both steps the same env instead.

NOT exported: .github/ is outside every EXPORTS.json category path.

Run: python3 .github/scripts/check-ui-suite-env.py
"""
import sys

import yaml

# Overridable so check-ui-suite-env-cases.py can point it at fixtures. Without a
# case suite this guard was hand-verified each round, and a branch verified in
# round 9 broke in round 10 unnoticed (#333) -- the guard's own failure path is
# exactly the code nobody exercises.
ACTION = sys.argv[1] if len(sys.argv) > 1 else "templates/actions/ui-suite/action.yml"
CHECK_STEP = "Check three viewport classes are declared"
RUN_STEP = "Run Playwright tests"


def env_of(steps, name):
    """Return the step's env MAPPING, not just its keys.

    Comparing key sets alone passes when a maintainer repoints an existing
    variable at a different input -- same names, different values, and a config
    conditional on that value exposes no selection key to the check while
    activating one in the run (Codex, #333 round 9). The guard's whole job is
    that the two evaluations see the same input, so it has to compare inputs.
    """
    for step in steps:
        if step.get("name") == name:
            return dict(step.get("env") or {}), True
    return {}, False


def workdir_of(steps, name):
    for step in steps:
        if step.get("name") == name:
            return step.get("working-directory")
    return None


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
        missing = sorted(k for k in run_env if k not in check_env)
        extra = sorted(k for k in check_env if k not in run_env)
        differing = sorted(
            k for k in run_env if k in check_env and check_env[k] != run_env[k]
        )
        if missing:
            problems.append(
                "the viewport check step is missing environment the run step has: "
                + ", ".join(missing)
                + "\n    The check IMPORTS the config, so a selection key conditional on one"
                + "\n    of these is invisible to it and active in the run (#333, round 8)."
            )
        if extra:
            problems.append(
                "the viewport check step carries environment the run step lacks: "
                + ", ".join(extra)
                + "\n    This direction hides a filter too: a config can declare one only when"
                + "\n    a variable is ABSENT, so the check sees none and the run applies it"
                + "\n    (#333, round 10). Give both steps the same env, or neither."
            )
        # WORKING DIRECTORY IS AN INPUT TOO. A config is code: its export can
        # depend on process.cwd() as much as on the environment (#333 round 9).
        # Both steps evaluate the config, so both must run from the same place --
        # and unlike the launcher's npm_* additions, this one IS visible here.
        check_wd = workdir_of(steps, CHECK_STEP)
        run_wd = workdir_of(steps, RUN_STEP)
        if check_wd != run_wd:
            problems.append(
                "the two steps run from DIFFERENT working directories: "
                f"check={check_wd!r} run={run_wd!r}"
                + "\n    A config branching on process.cwd() then exports one thing to the"
                + "\n    gate and another to the run (#333, rounds 9-12)."
            )
        if differing:
            problems.append(
                "the two steps set the same variable to DIFFERENT values: "
                + ", ".join(differing)
                + "\n    "
                + "; ".join(
                    f"{k}: check={check_env[k]!r} run={run_env[k]!r}" for k in differing
                )
                + "\n    Matching names are not matching inputs. A config conditional on the"
                + "\n    VALUE then reads one thing here and another in the run (round 9)."
            )

    if problems:
        print("check-ui-suite-env: FAILED")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    # SAY WHAT WAS CHECKED, NOT WHAT WOULD BE NICE. This compares the two steps'
    # step-level `env:` mappings in YAML. It does NOT establish that the two
    # processes see the same environment: the check runs `node` directly while
    # the run goes through `npx`, which injects npm_lifecycle_event, INIT_CWD and
    # a spread of npm_config_* that never appear in this file (Codex, #333 round
    # 11, reproduced with a config branching on npm_lifecycle_event). Claiming
    # "identical environment" here was the same overclaim this guard exists to
    # catch, one level up. Launcher parity is not attainable from YAML and is
    # recorded on #335.
    shared = sorted(run_env)
    print(
        "check-ui-suite-env: OK -- same step-level env and working directory "
        f"({', '.join(shared) if shared else 'empty'})"
    )
    print(
        "  (declared env only: the launchers differ -- `node` vs `npx` -- and the"
        " npm_* / INIT_CWD they add are outside what this file can see; see #335)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
