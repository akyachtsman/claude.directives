#!/usr/bin/env python3
"""Guard: the ui-suite composite's viewport checks and its Playwright run must see
the SAME environment.

WHY THIS EXISTS. `check-ui-viewports.js` IMPORTS the Playwright config, so it
evaluates whatever that config computes from process.env. If a check step is
given a thinner environment than the step that actually runs the suite, the two
read DIFFERENT configs: a selection key set only when TEST_AUTH_CREDENTIAL is
present is invisible to the check and active in the run. Codex reproduced exactly
that on #333 (a config setting `shard` under that condition) -- check step exit 0,
run step partitioned.

THREE STEPS, NOT TWO, since #335 put the gate on both sides of the suite: the
pre-run check (which widths are DECLARED), the run, and the post-run check with
--report (which were SCHEDULED). All three are compared against the run step,
which is the reference because it is what the other two make claims about.

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
# THE POST-RUN STEP IS NOT A THIRD SPECIAL CASE, it is the same step twice. Since
# #335 the gate runs on BOTH sides of the suite: once before, reporting which
# widths are DECLARED, and once after with --report, reporting which were
# SCHEDULED. Both invocations IMPORT the config, so both are subject to every
# argument above -- an env or a cwd that differs from the run's makes the second
# one read a different config than the run it is certifying, which is #333's
# finding arriving a third time. The three steps run consecutively and share one
# environment; RUN_STEP is the reference all of them are compared against,
# because it is the thing being measured.
POST_STEP = "Check the run scheduled tests at all three viewport classes"

# (label, the exact command bodies accepted), in the order the steps must appear.
#
# THIS IS A PIN, NOT A PARSE, AND THAT IS THE POINT. Four rounds tried to decide
# from shell TEXT whether a body runs the program it names, and each fix was
# defeated by a shell feature the previous one had not modelled:
#   r5   substring `--report`         -> `--reporter=json` satisfied it
#   r6   token `--report`             -> `echo check-ui-viewports --report` did
#   r9   launcher + first-3-tokens    -> `python3 -c "'check-ui-viewports'"
#                                        --report r.json` did (#347 r10), and so
#                                        did `node check-ui-viewports.js
#                                        # --report r.json`, where whitespace
#                                        splitting sees a token and bash sees a
#                                        comment
# Every one of those was a cheaper observable standing in for "this command runs
# that program" -- the defect class this whole PR is about. A fifth parser would
# be the same bet again, so the mechanism is REMOVED rather than patched: the
# body must be one of a small set of exact strings, and no shell subtlety
# (comments, -c, quoting, redirection, expansion) can matter to a comparison
# that does not interpret anything.
#
# The cost is that changing a command here also means changing this list. That
# is the intended cost: this composite is COPIED whole by downstream projects,
# so its command bodies are not a place for local variation, and a deliberate
# edit in two files beats a parser that can be talked around.
#
# The post-run body carries `--report` because the gate without it reports what
# the config DECLARES and exits 0 -- drop the argument and the step still runs,
# still passes, and silently stops checking execution (Codex, #347 round 5).
GATE = 'node "$GITHUB_WORKSPACE/.github/scripts/check-ui-viewports.js"'

# A PINNED BODY IS NOT A PINNED STEP. Round 11: the guard read the command, the
# env, the directory and the order, and never read either field that decides
# whether the step RUNS or whether its failure COUNTS. So `if: ${{ false }}` on
# the post-run gate, or `continue-on-error: true`, left this green while the
# composite skipped the execution check or ignored its missing-band failure —
# the same defect as a body that merely mentions the gate, one field over.
#
# Both fields are pinned exactly, alongside the body. `None` means the field must
# be ABSENT: a step with no `if` always runs and a step with no
# `continue-on-error` blocks, and those are the states the composite depends on.
# The run step is the one exception, and it is written out rather than exempted —
# `advisory-run` is a project's choice to tolerate failing TESTS, and this pin is
# what keeps that from silently becoming a choice to stop checking widths.
IF_POST = "${{ always() && steps.report-path.outcome == 'success' }}"
COE_RUN = "${{ inputs.advisory-run == 'true' }}"

# THE SHELL IS PART OF THE PIN. `shell:` accepts a custom COMMAND TEMPLATE, where
# `{0}` is the generated script file -- so `bash -c 'exit 0' {0}` never runs the
# script at all, and the body, env, cwd, order, `if` and `continue-on-error` all
# still match. Codex reproduced this guard returning OK for that shape (#347
# round 12).
#
# Third field in a row of the same kind: round 11 added the two execution
# controls after learning a pinned body says nothing about a step that does not
# run; this is the same lesson about a step that does not run its body. Pinning
# the literal `bash` is the whole rule -- no parsing of the template, because a
# template is a shell string and parsing those is what rounds 5-10 were.
SHELL = "bash"
# `--declared` carries the project->width mapping ACROSS the run (#347 round 14):
# the pre-run step writes it, the post-run step reads it instead of importing a
# config that globalSetup, the tests and globalTeardown have all had a turn at.
# Both bodies must name the same sidecar or the handoff silently degrades into
# the re-evaluation it replaced, which is why it is pinned rather than described.
DECLARED = '--declared "$RUNNER_TEMP/ui-viewports-declared.json"'
# PINNED ENV, NOT JUST MATCHING ENV. Everything else in this file compares the
# three steps against each other, which catches a variable dropped from ONE step
# and says nothing about one dropped from all three -- parity between three
# absences is still parity. That is the fail-open shape this guard exists to
# refuse, so the variables whose PRESENCE is load-bearing are named here.
#
# PLAYWRIGHT_JSON_OUTPUT_FILE takes precedence over the json reporter's
# configured `outputFile` (measured, 1.62.1: with it set the configured file is
# not written at all). Unset, a caller job that exports it redirects the report
# away from the validated path and the post-run gate exits 15 on a run that
# passed (Codex, #347 round 18). Its value must be the SAME expression as
# REPORT_PATH -- the validated output -- or the run writes the report somewhere
# the gate does not read, which is the same failure with an extra step.
REQUIRED_ENV = ("REPORT_PATH", "PLAYWRIGHT_JSON_OUTPUT_FILE")
# EQUAL TO EACH OTHER IS ANOTHER RELATIVE RULE, and it fails the same way the
# parity rules do. Round 18 required the two variables to MATCH; three steps all
# set to `other.json` match perfectly, while the stale-report clear and the
# artifact upload keep reading `steps.report-path.outputs.*`. The run would then
# write somewhere those two do not look: an aborted run leaves the previous
# report uncleared and certifiable, and the upload publishes no report at all
# (Codex, #347 round 19). Requiring "the same" was the same mistake one level
# up from the one it fixed.
#
# So the value is pinned to the LITERAL expression, which is the only one the
# validator produces. `${{ inputs.report-path }}` is the near-miss this refuses:
# it is the raw input, and every consumer in this composite reads the validated
# output instead (#347 round 10).
VALIDATED_REPORT = "${{ steps.report-path.outputs.relative }}"
# THE WORKING DIRECTORY IS THE SAME KIND OF VALUE AND WAS LEFT RELATIVE. Round 19
# pinned the env to a literal and left this comparison as "all three agree",
# which three steps moved together to the same wrong directory satisfy. The
# validator and the stale-report clear keep resolving from `inputs.tests-dir`,
# so Playwright and the post-run gate would resolve the report from somewhere
# else: with an advisory run that aborts before writing, an UNCLEARED stale
# report in the replacement directory satisfies the post-run gate, and the
# upload still looks where the input points (Codex, #347 round 20).
#
# Third instance of one mistake — parity, then equal-values, now cwd. A relative
# rule cannot see a coordinated move, and every value here has exactly one
# correct spelling, so each is pinned to it.
PINNED_WORKDIR = "${{ inputs.tests-dir }}"
PINNED_ENV_VALUES = (
    ("REPORT_PATH", VALIDATED_REPORT),
    ("PLAYWRIGHT_JSON_OUTPUT_FILE", VALIDATED_REPORT),
)
# THE CLEAR STEP IS PART OF THE SEQUENCE, not a preamble to it. It was outside
# SEQUENCE entirely, so skipping it, making it advisory, moving it to another
# directory or changing its command all left this guard green — and in an
# `advisory-run` invocation where Playwright aborts before its reporter writes,
# an UNCLEARED report from a previous invocation then satisfies the post-run gate
# and the job stays green (Codex, #347 round 21).
#
# Folded into SEQUENCE rather than given its own mechanism, which means it
# inherits every rule at once: body, `if`, `continue-on-error`, shell, working
# directory, adjacency, and env. The env parity is the one that reads oddly on an
# `rm` — it does not import the config and does not need APP_URL. It carries the
# same block anyway because ONE rule over four steps is worth more than an
# exemption that has to be argued each time it is read, and because the two
# variables that ARE load-bearing here (REPORT_PATH, and the destination the run
# is pinned to) must match what the other three use or this clears the wrong file.
CLEAR_STEP = "Clear any stale Playwright report"
SEQUENCE = (
    (CLEAR_STEP,
     ('rm -f -- "$REPORT_PATH" "$RUNNER_TEMP/ui-viewports-declared.json"',),
     None, None, SHELL),
    (CHECK_STEP, (f"{GATE} --tests-dir . {DECLARED}",), None, None, SHELL),
    (RUN_STEP, ("npx playwright test",), None, COE_RUN, SHELL),
    (POST_STEP, (f'{GATE} --tests-dir . {DECLARED} --report "$REPORT_PATH"',),
     IF_POST, None, SHELL),
)


def env_of(steps, name):
    """Return the step's env MAPPING, not just its keys.

    Comparing key sets alone passes when a maintainer repoints an existing
    variable at a different input -- same names, different values, and a config
    conditional on that value exposes no selection key to the check while
    activating one in the run (Codex, #333 round 9). The guard's whole job is
    that the two evaluations see the same input, so it has to compare inputs.
    """
    matches = [s for s in steps if s.get("name") == name]
    if len(matches) != 1:
        # NOT "take the first". A decoy step carrying the reserved name, placed
        # before the real one, silently disabled this whole check -- Codex, #333
        # round 14, reproduced with a decoy `Run Playwright tests` holding the
        # check-side env while the actual run carried an extra filter switch.
        # Zero matches and two matches are both "this file is not the shape this
        # guard understands", and neither may read as parity.
        return {}, len(matches)
    return dict(matches[0].get("env") or {}), 1


def index_of(steps, name):
    matches = [i for i, s in enumerate(steps) if s.get("name") == name]
    return matches[0] if len(matches) == 1 else None


def workdir_of(steps, name):
    matches = [s for s in steps if s.get("name") == name]
    return matches[0].get("working-directory") if len(matches) == 1 else None


def main():
    with open(ACTION, encoding="utf-8") as handle:
        doc = yaml.safe_load(handle)
    steps = (doc.get("runs") or {}).get("steps") or []

    envs = {label: env_of(steps, label) for label, *_ in SEQUENCE}
    run_env = envs[RUN_STEP][0]
    all_found = all(count == 1 for _, count in envs.values())

    problems = []
    for label, *_ in SEQUENCE:
        count = envs[label][1]
        if count > 1:
            problems.append(
                f'{count} steps are named "{label}" in {ACTION}'
                + "\n    This guard identifies each step by name, so a duplicate makes it"
                + "\n    unable to say which one runs -- and taking the first silently"
                + "\n    disabled it (#333, round 14)."
            )
        # A renamed step is not a pass. Without this the whole guard reads empty
        # sets, finds them equal, and reports OK -- the fail-open shape it guards.
        if count == 0:
            problems.append(f'no step named "{label}" in {ACTION}')

    if all_found:
        # EVERY viewport step is compared against the RUN step, in both
        # directions. Two comparisons rather than one since #335 put the gate on
        # both sides of the suite; the run is the reference because it is what
        # the other two make claims about.
        for label, *_ in SEQUENCE:
            if label == RUN_STEP:
                continue
            step_env = envs[label][0]
            missing = sorted(k for k in run_env if k not in step_env)
            extra = sorted(k for k in step_env if k not in run_env)
            if missing:
                problems.append(
                    f'"{label}" is missing environment the run step has: '
                    + ", ".join(missing)
                    + "\n    It IMPORTS the config, so a selection key conditional on one of"
                    + "\n    these is invisible to it and active in the run (#333, round 8)."
                )
            if extra:
                problems.append(
                    f'"{label}" carries environment the run step lacks: '
                    + ", ".join(extra)
                    + "\n    This direction hides a filter too: a config can declare one only when"
                    + "\n    a variable is ABSENT, so the step sees none and the run applies it"
                    + "\n    (#333, round 10). Give every step the same env, or none of them."
                )
        # THE NAMED VARIABLES MUST BE THERE AT ALL. See REQUIRED_ENV above:
        # the comparisons before this one are relative, and three steps that all
        # dropped a variable agree perfectly.
        for key in REQUIRED_ENV:
            absent = sorted(label for label, *_ in SEQUENCE if key not in envs[label][0])
            if absent:
                problems.append(
                    f"{key} is not set on: " + ", ".join(f'"{a}"' for a in absent)
                    + "\n    Every step of the sequence must set it. Parity alone cannot see"
                    + "\n    this: three steps that all dropped it compare equal (#347 round 18)."
                )
        for key, pinned in PINNED_ENV_VALUES:
            for label, *_ in SEQUENCE:
                step_env = envs[label][0]
                if key in step_env and step_env[key] != pinned:
                    problems.append(
                        f'"{label}" sets {key} to {step_env[key]!r}, not the validated output'
                        + f"\n    expected: {pinned}"
                        + "\n    Equal to each other is not enough: the stale-report clear and the"
                        + "\n    artifact upload read that expression directly, so three steps"
                        + "\n    agreeing on a DIFFERENT value still writes where they do not look"
                        + "\n    (#347 round 19)."
                    )

        # WORKING DIRECTORY IS AN INPUT TOO. A config is code: its export can
        # depend on process.cwd() as much as on the environment (#333 round 9).
        # Both steps evaluate the config, so both must run from the same place --
        # and unlike the launcher's npm_* additions, this one IS visible here.
        # ADJACENCY. Both steps evaluate the config, so anything running between
        # them changes what the second one can observe and the first could not.
        # Round 16: the check ran before `Start local server`, so a config that
        # branches on whether APP_URL answers saw a dead URL at the gate and a
        # live one at the run -- both exiting 0 on different configs. The fix was
        # to move the step; this keeps it moved, because a comment saying "do not
        # insert a step here" is not a mechanism.
        order = [(label, index_of(steps, label)) for label, *_ in SEQUENCE]
        for (before, i), (after, j) in zip(order, order[1:]):
            if i is None or j is None or j == i + 1:
                continue
            between = [steps[k].get("name") for k in range(min(i, j) + 1, max(i, j))]
            problems.append(
                f'"{after}" does not run immediately after "{before}"'
                + (f"\n    between them: {', '.join(str(b) for b in between)}" if between else "")
                + (f"\n    (\"{before}\" is at index {i}, \"{after}\" at {j})")
                + "\n    All three steps evaluate the config. Anything in between can change"
                + "\n    what the config observes, so the gate checks one config and the run"
                + "\n    uses another (#333, round 16)."
            )

        # INDEX ADJACENCY IS NOT EXECUTION ADJACENCY. Two consecutive steps can
        # still run something in between if it is INSIDE one of them: a command
        # prepended to the run step's body executes after the gate's import and
        # before Playwright's. A `uses:` step can hide arbitrary work for the same
        # reason. Codex round 17 -- and the same substitution as everywhere else
        # on #333: the cheap observable (index) standing in for the property
        # (nothing happens between the two config evaluations).
        # CONSTRAIN THE SHAPE, DO NOT COUNT LINES. Round 17 split each step's body
        # into non-comment lines and required one at the edge. Codex round 18:
        # `./flip-the-world.sh && npx playwright test` is ONE line, so the count
        # said adjacent while a command ran between the two config evaluations —
        # and the edge line was never checked at all, so a REPLACEMENT command
        # passed too. Sixth time on this PR I measured the cheap observable
        # (line count) instead of the property (what executes, and only that).
        #
        # So each step's body must be EXACTLY the invocation it exists for, and
        # "exactly" is now literal: the body is compared, character for
        # character, against the strings pinned in SEQUENCE. The composer list
        # this used to carry (&& || ; | & $( `) is gone with the rest of the
        # parser -- an exact match rejects every one of those without enumerating
        # them, and enumerating them is what left `#` and `-c` off the list.
        for (label, bodies, want_if, want_coe, want_shell), (_, i) in zip(SEQUENCE, order):
            if i is None:
                continue
            step = steps[i]
            if step.get("uses"):
                problems.append(
                    f'"{label}" is a `uses:` step'
                    + "\n    Its internals are not visible here, so nothing can establish that no"
                    + "\n    other work runs between the config evaluations (#333, round 17)."
                )
                continue
            # COMMENTS ARE NOT STRIPPED ANY MORE. The old reader dropped lines
            # beginning with `#` and then split the rest on whitespace, so
            # `node check-ui-viewports.js # --report r.json` handed the guard a
            # `--report` token that bash treats as a comment (Codex, #347 r10).
            # An exact comparison needs no such pre-processing: the body either
            # is one of the pinned strings or it is not.
            # EXECUTION CONTROLS FIRST: a step that does not run, or whose
            # failure is discarded, makes its body irrelevant.
            for field, want in (("if", want_if), ("continue-on-error", want_coe),
                                ("shell", want_shell)):
                got = step.get(field)
                if got is None and want is None:
                    continue
                if got == want:
                    continue
                problems.append(
                    f'"{label}" has the wrong `{field}:`'
                    + f"\n    got:      {got!r}"
                    + f"\n    expected: {want!r}"
                    + ("\n    (absent — the step must always run and must block on failure)"
                       if want is None else "")
                    + "\n    These two fields decide whether the step runs at all and whether"
                    + "\n    its failure counts, so a pinned command says nothing without them"
                    + "\n    (#347, round 11)."
                )

            body = str(step.get("run") or "").strip()
            if body not in bodies:
                problems.append(
                    f'"{label}" does not run the pinned command'
                    + f"\n    got:      {body!r}"
                    + "".join(f"\n    expected: {b!r}" for b in bodies)
                    + "\n    These three steps must be exactly their invocations: two of them"
                    + "\n    evaluate the config, so anything else in any body runs BETWEEN the"
                    + "\n    evaluations (#333, round 17), and four attempts to decide that from"
                    + "\n    shell text were each walked around by a shell feature they did not"
                    + "\n    model (#347, rounds 5, 6, 9, 10). The bodies are pinned in"
                    + "\n    check-ui-suite-env.py -> SEQUENCE; change both together."
                )

        run_wd = workdir_of(steps, RUN_STEP)
        # PINNED, not merely shared. See PINNED_WORKDIR above: the relative check
        # below still runs, because it is the one that explains WHY when a step
        # drifts, but it is no longer the only thing standing here.
        for label, *_ in SEQUENCE:
            step_wd = workdir_of(steps, label)
            if step_wd != PINNED_WORKDIR:
                problems.append(
                    f'"{label}" runs from {step_wd!r}, not the action input'
                    + f"\n    expected: {PINNED_WORKDIR}"
                    + "\n    Agreeing with each other is not enough: the report-path validator"
                    + "\n    and the stale-report clear resolve from the input, so three steps"
                    + "\n    moved together read and write a different directory than the ones"
                    + "\n    that clear and upload the report (#347 round 20)."
                )
        for label, *_ in SEQUENCE:
            if label == RUN_STEP:
                continue
            step_wd = workdir_of(steps, label)
            if step_wd != run_wd:
                problems.append(
                    f'"{label}" runs from a DIFFERENT working directory than the run: '
                    f"step={step_wd!r} run={run_wd!r}"
                    + "\n    A config branching on process.cwd() then exports one thing to the"
                    + "\n    gate and another to the run (#333, rounds 9-12)."
                )
            step_env = envs[label][0]
            differing = sorted(
                k for k in run_env if k in step_env and step_env[k] != run_env[k]
            )
            if differing:
                problems.append(
                    f'"{label}" and the run step set the same variable to DIFFERENT values: '
                    + ", ".join(differing)
                    + "\n    "
                    + "; ".join(
                        f"{k}: step={step_env[k]!r} run={run_env[k]!r}" for k in differing
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
        f"check-ui-suite-env: OK -- {len(SEQUENCE)} consecutive steps, same step-level "
        f"env and working directory ({', '.join(shared) if shared else 'empty'})"
    )
    print(
        "  (declared env only: the launchers differ -- `node` vs `npx` -- and the"
        " npm_* / INIT_CWD they add are outside what this file can see; see #335)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
