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

# The stale-report clear joined SEQUENCE in #347 round 21, so every fixture needs
# it; without it the guard reports "no step named …" and every case fails for the
# same uninformative reason.
CLEAR = "Clear any stale Playwright report"
CHECK = "Check three viewport classes are declared"
RUN = "Run Playwright tests"
# The post-run half of the gate (#335). It imports the config exactly as the
# pre-run check does, so every parity argument applies to it and it needs the
# same cases. Its defaults mirror the run step so the fixtures written before it
# existed keep meaning what they meant.
POST = "Check the run scheduled tests at all three viewport classes"
# The step that PRODUCES the value the other four are pinned to. It joined
# SEQUENCE in #347 round 27: outside it, making it skippable or replacing its
# command left the guard green while the post-run gate — guarded by
# `steps.report-path.outcome == 'success'`, false for a skipped step — never ran.
VALIDATE = "Validate report-path"
VALIDATE_ID = "report-path"
UNSET = object()

# THE PINNED BODIES, WRITTEN OUT HERE RATHER THAN IMPORTED. The guard now
# compares each step's `run` against an exact string (#347 round 10, after four
# parsers were each walked around by a shell feature they did not model). A
# cases file that imported that constant would agree with the guard by
# construction and prove nothing about it; spelling them again is what makes a
# silent edit to SEQUENCE fail here.
GATE = 'node "$GITHUB_WORKSPACE/.github/scripts/check-ui-viewports.js"'
DECLARED = '--declared "$RUNNER_TEMP/ui-viewports-declared.json"'
CHECK_BODY = f"{GATE} --tests-dir . {DECLARED}"
CLEAR_BODY = 'rm -f -- "$REPORT_PATH" "$RUNNER_TEMP/ui-viewports-declared.json"'
RUN_BODY = "npx playwright test"
POST_BODY = f'{GATE} --tests-dir . {DECLARED} --report "$REPORT_PATH"'

# The pinned EXECUTION CONTROLS (#347 round 11). Spelled out here for the same
# reason as the bodies: importing them from the guard would make these cases
# agree with it by construction.
IF_POST = "${{ always() && steps.report-path.outcome == 'success' }}"
COE_RUN = "${{ inputs.advisory-run == 'true' }}"
SHELL = "bash"

# The one diagnostic every body-shape refusal now prints. Named because it is
# asserted twenty times below and a typo in one of them would silently weaken
# that case to "exit 1 for some reason" — the failure mode this suite's header
# is about.
PIN = "does not run the pinned command"

# Spelled out rather than imported from the guard, for the same reason the
# bodies are: a fixture that agreed by construction would prove nothing.
VALIDATED = "${{ steps.report-path.outputs.relative }}"
VALIDATE_BODY = 'python3 "$GITHUB_ACTION_PATH/validate-report-path.py"'
# The validator's env is pinned EXACTLY rather than by parity: both variables are
# the RAW inputs, and repointing either validates one path while the other four
# use another. Spelled out here rather than imported, like every other pin.
VALIDATE_ENV = {"REPORT_PATH": "${{ inputs.report-path }}",
                "TESTS_DIR": "${{ inputs.tests-dir }}"}
# The artifact upload — the validated path's consumer OUTSIDE the sequence, and
# the one the validator exists for (#347 rounds 9 and 28). Spelled out here
# rather than imported, like every other pin in this file.
UPLOAD = "Upload test results"
UPLOAD_USES = "actions/upload-artifact@v4"
UPLOAD_PATH = ".agent-reports/screenshots/\n${{ steps.report-path.outputs.path }}"
# The working directory is pinned to the action input as of #347 round 20, so
# the default fixture has to use the real expression rather than a stand-in.
TESTS_DIR = "${{ inputs.tests-dir }}"


def action(check_env, run_env, check_name=CHECK, run_name=RUN,
           val_name=VALIDATE, val_body=None, val_env=UNSET, val_wd=None,
           val_if=None, val_coe=None, val_shell=SHELL, val_id=VALIDATE_ID,
           between_val=None,
           upload_name=UPLOAD, upload_uses=UPLOAD_USES, upload_if=IF_POST,
           upload_path=UPLOAD_PATH, upload_hidden=True, upload=True, upload_coe=None,
           check_wd=TESTS_DIR, run_wd=TESTS_DIR, decoy=None, between=None,
           check_body=None, run_body=None, run_uses=None,
           post_env=UNSET, post_name=POST, post_wd=TESTS_DIR, post_body=None,
           post_uses=None, between_post=None,
           post_if=IF_POST, run_coe=COE_RUN, check_if=None, post_coe=None,
           check_shell=SHELL, run_shell=SHELL, post_shell=SHELL,
           clear_name=CLEAR, clear_body=None, clear_env=UNSET, clear_wd=TESTS_DIR,
           clear_if=None, clear_coe=None, clear_shell=SHELL):
    def block(env):
        if not env:
            return ""
        return "      env:\n" + "".join(f"        {k}: {v}\n" for k, v in env.items())

    def wd(value):
        return f"      working-directory: {value}\n" if value is not None else ""

    def ctl(field, value):
        return f"      {field}: {value}\n" if value is not None else ""

    def body(text):
        return "      run: |\n" + "".join(f"        {ln}\n" for ln in text.splitlines())

    decoy_yaml = ""
    if decoy:
        decoy_yaml = (f"    - name: {decoy}\n      shell: bash\n{wd(TESTS_DIR)}"
                      f"{block(dict(BOTH))}      run: echo decoy\n")
    return (
        "name: 'fixture'\nruns:\n  using: composite\n  steps:\n"
        + decoy_yaml
        + f"    - name: {val_name}\n"
        + (f"      id: {val_id}\n" if val_id is not None else "")
        + f"{ctl('shell', val_shell)}{ctl('if', val_if)}"
        + f"{ctl('continue-on-error', val_coe)}{wd(val_wd)}"
        + block(dict(VALIDATE_ENV) if val_env is UNSET else val_env)
        + body(val_body or VALIDATE_BODY)
        + (f"    - name: {between_val}\n      shell: bash\n      run: echo between\n"
           if between_val else "")
        + f"    - name: {clear_name}\n{ctl('shell', clear_shell)}{ctl('if', clear_if)}"
        + f"{ctl('continue-on-error', clear_coe)}{wd(clear_wd)}"
        + block(check_env if clear_env is UNSET else clear_env)
        + body(clear_body or CLEAR_BODY)
        + f"    - name: {check_name}\n{ctl('shell', check_shell)}{ctl('if', check_if)}{wd(check_wd)}{block(check_env)}"
        + body(check_body or CHECK_BODY)
        + (f"    - name: {between}\n      shell: bash\n      run: echo between\n" if between else "")
        + f"    - name: {run_name}\n{ctl('shell', run_shell)}{ctl('continue-on-error', run_coe)}{wd(run_wd)}{block(run_env)}"
        + (f"      uses: {run_uses}\n" if run_uses else body(run_body or RUN_BODY))
        + (f"    - name: {between_post}\n      shell: bash\n      run: echo between\n"
           if between_post else "")
        + f"    - name: {post_name}\n{ctl('shell', post_shell)}{ctl('if', post_if)}{ctl('continue-on-error', post_coe)}{wd(post_wd)}"
        + block(run_env if post_env is UNSET else post_env)
        + (f"      uses: {post_uses}\n" if post_uses
           else body(post_body or POST_BODY))
        + ("" if not upload else (
            f"    - name: {upload_name}\n"
            + ctl("if", upload_if)
            + ctl("continue-on-error", upload_coe)
            + (f"      uses: {upload_uses}\n" if upload_uses else "")
            + "      with:\n"
            + ("        path: |\n"
               + "".join(f"          {ln}\n" for ln in upload_path.splitlines())
               if upload_path is not None else "")
            + (f"        include-hidden-files: {str(upload_hidden).lower()}\n"
               if upload_hidden is not None else "")))
    )


# The two PINNED variables are in the baseline because the guard now requires
# them by NAME, not merely in agreement (#347 round 18): parity is a relative
# rule and three steps that all dropped a variable satisfy it perfectly. A
# fixture without them would be testing a shape the live action cannot have.
BOTH = {"APP_URL": "a", "TEST_AUTH_CREDENTIAL": "b",
        "REPORT_PATH": VALIDATED, "PLAYWRIGHT_JSON_OUTPUT_FILE": VALIDATED}

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

    # "OR NONE OF THEM" SURVIVES, BUT ONLY FOR THE OPTIONAL VARIABLES. The parity
    # rule always allowed three steps to declare nothing, because a variable
    # absent everywhere cannot make the two config imports disagree. That is
    # still true of APP_URL and its neighbours -- and it was never true of the
    # two the pinned bodies NAME: `--report "$REPORT_PATH"` with nothing setting
    # REPORT_PATH is the empty-path usage error, and an unpinned
    # PLAYWRIGHT_JSON_OUTPUT_FILE leaves the report's destination to whatever the
    # caller's job exported (#347 round 18). So an env-less sequence is refused
    # now, and the case says which rule refuses it.
    ("no env at all — refused, the pinned bodies name two variables",
     action({}, {}), 1, "REPORT_PATH is not set on"),
    ("only the two pinned variables, no optional env — still parity",
     action({"REPORT_PATH": VALIDATED, "PLAYWRIGHT_JSON_OUTPUT_FILE": VALIDATED},
            {"REPORT_PATH": VALIDATED, "PLAYWRIGHT_JSON_OUTPUT_FILE": VALIDATED}),
     0, "same step-level env and working directory"),

    # ── THE PINNED VARIABLES (#347 round 18) ────────────────────────────────
    # Each of these is invisible to every other rule in the guard: the three
    # steps stay in perfect agreement while the run writes its report somewhere
    # the gate does not read.
    ("PLAYWRIGHT_JSON_OUTPUT_FILE dropped from all three — refused",
     action({"APP_URL": "a", "REPORT_PATH": VALIDATED},
            {"APP_URL": "a", "REPORT_PATH": VALIDATED}),
     1, "PLAYWRIGHT_JSON_OUTPUT_FILE is not set on"),
    ("REPORT_PATH dropped from all three — refused",
     action({"APP_URL": "a", "PLAYWRIGHT_JSON_OUTPUT_FILE": VALIDATED},
            {"APP_URL": "a", "PLAYWRIGHT_JSON_OUTPUT_FILE": VALIDATED}),
     1, "REPORT_PATH is not set on"),
    ("PLAYWRIGHT_JSON_OUTPUT_FILE pointing somewhere else — refused",
     action({**BOTH, "PLAYWRIGHT_JSON_OUTPUT_FILE": "elsewhere.json"},
            {**BOTH, "PLAYWRIGHT_JSON_OUTPUT_FILE": "elsewhere.json"}),
     1, "not the validated output"),

    # ── EQUAL TO EACH OTHER IS NOT ENOUGH (#347 round 19) ───────────────────
    # The rule round 18 shipped required the two to MATCH, which three steps all
    # set to the same wrong value satisfy perfectly — while the stale-report
    # clear and the artifact upload keep reading the validated output. Same
    # relative-rule mistake, one level up from the one it fixed. These two cases
    # are the ones a match-only rule cannot see.
    ("both variables agreeing on the SAME WRONG value — refused",
     action({**BOTH, "REPORT_PATH": "other.json", "PLAYWRIGHT_JSON_OUTPUT_FILE": "other.json"},
            {**BOTH, "REPORT_PATH": "other.json", "PLAYWRIGHT_JSON_OUTPUT_FILE": "other.json"}),
     1, "not the validated output"),
    # The near-miss: both are `${{ }}` expressions and only one is validated.
    ("both agreeing on the RAW INPUT rather than the validated output",
     action({**BOTH, "REPORT_PATH": "${{ inputs.report-path }}",
             "PLAYWRIGHT_JSON_OUTPUT_FILE": "${{ inputs.report-path }}"},
            {**BOTH, "REPORT_PATH": "${{ inputs.report-path }}",
             "PLAYWRIGHT_JSON_OUTPUT_FILE": "${{ inputs.report-path }}"}),
     1, "not the validated output"),
    ("PLAYWRIGHT_JSON_OUTPUT_FILE from the raw input, REPORT_PATH validated",
     action({**BOTH, "PLAYWRIGHT_JSON_OUTPUT_FILE": "${{ inputs.report-path }}"},
            {**BOTH, "PLAYWRIGHT_JSON_OUTPUT_FILE": "${{ inputs.report-path }}"}),
     1, "not the validated output"),

    # ── THE WORKING DIRECTORY IS PINNED TOO (#347 round 20) ─────────────────
    # Third instance of one mistake: parity, then equal-values, now cwd. All
    # three steps moved together satisfy every relative rule in this guard,
    # while the report-path validator and the stale-report clear keep resolving
    # from `inputs.tests-dir` — so the run writes and the gate reads a directory
    # that nothing clears and nothing uploads.
    ("all three steps moved to the SAME wrong working directory — refused",
     action(dict(BOTH), dict(BOTH), check_wd="elsewhere", run_wd="elsewhere",
            post_wd="elsewhere"),
     1, "not its pinned directory"),
    # The near-miss again: a `${{ }}` expression that is not the pinned one.
    ("all three on a different input expression — refused",
     action(dict(BOTH), dict(BOTH), check_wd="${{ inputs.app-pages }}",
            run_wd="${{ inputs.app-pages }}", post_wd="${{ inputs.app-pages }}"),
     1, "not its pinned directory"),
    # And the relative rule still explains a SINGLE step drifting, which is the
    # diagnostic a reader wants when only one moved.
    ("one step moved — still reported as a mismatch against the run",
     action(dict(BOTH), dict(BOTH), check_wd="elsewhere"),
     1, "runs from a DIFFERENT working directory than the run"),

    # ── THE STALE-REPORT CLEAR IS IN THE SEQUENCE (#347 round 21) ───────────
    # It was outside SEQUENCE, so every one of these passed. The consequence is
    # specific: in an `advisory-run` invocation where Playwright aborts before
    # its reporter writes, an UNCLEARED report from a previous invocation
    # satisfies the post-run gate and the job stays green.
    ("the clear step renamed away — refused",
     action(dict(BOTH), dict(BOTH), clear_name="Renamed"),
     1, f'no step named "{CLEAR}"'),
    ("the clear step made advisory — refused",
     action(dict(BOTH), dict(BOTH), clear_coe="true"),
     1, "has the wrong `continue-on-error:`"),
    ("the clear step made conditional — refused",
     action(dict(BOTH), dict(BOTH), clear_if="${{ inputs.advisory-run != 'true' }}"),
     1, "has the wrong `if:`"),
    ("the clear step's rm replaced — refused",
     action(dict(BOTH), dict(BOTH), clear_body="echo skipping"),
     1, PIN),
    # The `--` is what makes `rm` refuse to read a leading-dash report-path as a
    # flag (#347 round 5). Dropping it is a body change and must be caught here.
    ("the clear step's rm loses its -- — refused",
     action(dict(BOTH), dict(BOTH),
            clear_body='rm -f "$REPORT_PATH" "$RUNNER_TEMP/ui-viewports-declared.json"'),
     1, PIN),
    # It clears the sidecar too: without that, the post-run read gets a mapping
    # from a PREVIOUS invocation (#347 round 14).
    ("the clear step stops clearing the declared sidecar — refused",
     action(dict(BOTH), dict(BOTH), clear_body='rm -f -- "$REPORT_PATH"'),
     1, PIN),
    ("the clear step moved to another directory — refused",
     action(dict(BOTH), dict(BOTH), clear_wd="elsewhere"),
     1, "not its pinned directory"),
    ("a step inserted between the clear and the pre-run check — refused",
     action(dict(BOTH), dict(BOTH), decoy=None, clear_name=CLEAR)
     .replace(f"    - name: {CHECK}\n",
              "    - name: Sneak\n      shell: bash\n      run: echo sneak\n"
              f"    - name: {CHECK}\n", 1),
     1, "does not run immediately after"),

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

    # ── #347 round 14: THE DECLARED MAPPING MUST CROSS THE RUN ───────────────
    # The pre-run step writes the project->width mapping and the post-run step
    # reads it. Drop the flag from either and the post-run check goes back to
    # importing a config that globalSetup, the tests and globalTeardown have all
    # had a turn at — the re-evaluation the flag exists to replace.
    ("post-run check drops --declared — refused",
     action(dict(BOTH), dict(BOTH),
            post_body=f'{GATE} --tests-dir . --report "$REPORT_PATH"'), 1, PIN),

    ("pre-run check drops --declared — refused",
     action(dict(BOTH), dict(BOTH),
            check_body=f"{GATE} --tests-dir ."), 1, PIN),

    ("the two steps name DIFFERENT sidecars — refused",
     action(dict(BOTH), dict(BOTH),
            post_body=f'{GATE} --tests-dir . --declared "other.json" --report "$REPORT_PATH"'),
     1, PIN),

    # The twin: the pre-run check must NOT be required to pass --report, or the
    # requirement would be a blanket rule rather than one about this step's job.
    ("pre-run check without --report — must NOT trip",
     action(dict(BOTH), dict(BOTH), check_body=CHECK_BODY), 0,
     "consecutive steps"),

    # ── EXECUTION CONTROLS (#347 round 11) ───────────────────────────────────
    # The guard read the command, the env, the directory and the order, and never
    # read either field deciding whether the step RUNS or whether its failure
    # COUNTS. A pinned body says nothing about a step that is skipped.
    ("post-run gate disabled with `if: false` — refused",
     action(dict(BOTH), dict(BOTH), post_if="${{ false }}"), 1,
     'has the wrong `if:`'),

    ("post-run gate's `if` dropped entirely — refused",
     action(dict(BOTH), dict(BOTH), post_if=None), 1,
     'has the wrong `if:`'),

    ("post-run gate made advisory with continue-on-error — refused",
     action(dict(BOTH), dict(BOTH), post_coe="true"), 1,
     'has the wrong `continue-on-error:`'),

    # The pre-run check has no `if` at all, and gaining one is the same defect.
    ("pre-run check gains a condition — refused",
     action(dict(BOTH), dict(BOTH), check_if="${{ always() }}"), 1,
     'has the wrong `if:`'),

    # THE TWIN, and it is the one that matters most here: `advisory-run` must
    # keep flipping the RUN step. Pinning "no continue-on-error anywhere" would
    # have passed every case above and broken the input the composite documents.
    ("the run step keeps its advisory-run continue-on-error — must NOT trip",
     action(dict(BOTH), dict(BOTH), run_coe=COE_RUN), 0, "consecutive steps"),

    ("the run step's continue-on-error repointed at something else — refused",
     action(dict(BOTH), dict(BOTH), run_coe="true"), 1,
     'has the wrong `continue-on-error:`'),

    # ── THE SHELL IS PART OF THE PIN (#347 round 12) ────────────────────────
    # `shell:` accepts a custom COMMAND TEMPLATE where `{0}` is the generated
    # script file, so this shape never runs the script — while the body, env,
    # cwd, order, `if` and `continue-on-error` all still match.
    ("post-run gate given a custom shell template that never runs the script",
     action(dict(BOTH), dict(BOTH), post_shell="bash -c 'exit 0' {0}"), 1,
     'has the wrong `shell:`'),

    ("run step given a custom shell template", 
     action(dict(BOTH), dict(BOTH), run_shell="bash -c 'exit 0' {0}"), 1,
     'has the wrong `shell:`'),

    ("pre-run check switched to a different real shell",
     action(dict(BOTH), dict(BOTH), check_shell="sh"), 1,
     'has the wrong `shell:`'),

    ("a step with no shell at all — refused",
     action(dict(BOTH), dict(BOTH), post_shell=None), 1,
     'has the wrong `shell:`'),

    ("post-run check is a `uses:` step",
     action(dict(BOTH), dict(BOTH), post_uses="./some/action"), 1, "is a `uses:` step"),

    # ── THE VALIDATOR IS A SEQUENCE MEMBER (#347 round 27) ────────────────
    # Round 21 folded the CLEAR step in for exactly this reason and stopped
    # there. `Validate report-path` stayed outside, so each of these left the
    # guard green while the post-run gate — guarded by
    # `steps.report-path.outcome == 'success'`, FALSE for a skipped step — never
    # ran, and `advisory-run` carried the composite to green having validated
    # neither the path nor the scheduled coverage.
    ("the validator made skippable — refused",
     action(dict(BOTH), dict(BOTH), val_if="${{ false }}"), 1, "wrong `if:`"),
    ("the validator made advisory — refused",
     action(dict(BOTH), dict(BOTH), val_coe="true"), 1, "wrong `continue-on-error:`"),
    ("the validator's command replaced — refused",
     action(dict(BOTH), dict(BOTH), val_body="echo skipped"), 1, PIN),
    ("a command before the validator's, in its body — refused",
     action(dict(BOTH), dict(BOTH),
            val_body='./widen.sh\npython3 "$GITHUB_ACTION_PATH/validate-report-path.py"'),
     1, PIN),
    ("the validator renamed — refused",
     action(dict(BOTH), dict(BOTH), val_name="Check the path"), 1,
     'no step named "Validate report-path"'),
    # The id, not the name: five later steps and two `if:` guards read
    # `steps.report-path.*`, so a rename detaches all of them while every other
    # rule here still passes.
    ("the validator's id renamed — refused",
     action(dict(BOTH), dict(BOTH), val_id="rp"), 1, "has id 'rp'"),
    ("the validator's id removed — refused",
     action(dict(BOTH), dict(BOTH), val_id=None), 1, "has id None"),
    # Its env is pinned EXACTLY, not by parity: both variables are the raw
    # inputs, so repointing either validates one path while the other four use
    # another — the exact substitution this composite exists to refuse.
    ("the validator pointed at the validated output — refused",
     action(dict(BOTH), dict(BOTH),
            val_env={"REPORT_PATH": VALIDATED, "TESTS_DIR": TESTS_DIR}),
     1, "does not carry its pinned environment"),
    ("the validator's tests-dir repointed — refused",
     action(dict(BOTH), dict(BOTH),
            val_env={"REPORT_PATH": "${{ inputs.report-path }}",
                     "TESTS_DIR": "${{ inputs.app-pages }}"}),
     1, "does not carry its pinned environment"),
    ("the validator given extra env — refused",
     action(dict(BOTH), dict(BOTH),
            val_env=dict(VALIDATE_ENV, APP_URL="a")),
     1, "does not carry its pinned environment"),
    # It runs from the workspace root and resolves tests-dir from TESTS_DIR, so
    # its pin is "no working-directory" — a different pin from the other four,
    # which is why membership had to carry a per-step policy rather than one
    # shared rule.
    ("the validator given a working directory — refused",
     action(dict(BOTH), dict(BOTH), val_wd=TESTS_DIR), 1, "not its pinned directory"),
    ("a step between the validator and the clear — refused",
     action(dict(BOTH), dict(BOTH), between_val="Fetch something"), 1,
     'does not run immediately after "Validate report-path"'),
    ("a decoy validator before the real one — refused",
     action(dict(BOTH), dict(BOTH), decoy=VALIDATE), 1,
     'are named "Validate report-path"'),


    # ── THE UPLOAD IS A VALIDATED-PATH CONSUMER (#347 round 28) ───────────
    # Round 27 pinned the PRODUCER and stopped at the post-run gate, so the step
    # the validator actually exists for stayed unguarded: re-pointing it at the
    # raw input or dropping its outcome guard left the suite green exactly where
    # the protection detaches. It is a `uses:` step, so it cannot join SEQUENCE
    # (which refuses those categorically); it is pinned as what it is.
    ("the upload repointed at the raw input — refused",
     action(dict(BOTH), dict(BOTH),
            upload_path=".agent-reports/screenshots/\n${{ inputs.report-path }}"),
     1, "does not upload the pinned path list"),
    ("the upload losing its outcome guard — refused",
     action(dict(BOTH), dict(BOTH), upload_if="${{ always() }}"), 1,
     "wrong `if:`"),
    ("the upload gaining an extra path entry — refused",
     action(dict(BOTH), dict(BOTH),
            upload_path=".agent-reports/screenshots/\n${{ steps.report-path.outputs.path }}\n/etc/passwd"),
     1, "does not upload the pinned path list"),
    ("the upload dropping include-hidden-files — refused",
     action(dict(BOTH), dict(BOTH), upload_hidden=None), 1,
     "include-hidden-files"),
    ("include-hidden-files turned off — refused",
     action(dict(BOTH), dict(BOTH), upload_hidden=False), 1,
     "include-hidden-files"),
    # THE UPLOAD MUST STILL BLOCK (#347 round 36). Every pin above passed with
    # `continue-on-error: true` on this step, so an upload failure vanished behind
    # a green job while the guard stayed green — the round-11 defect, one step
    # outside the sequence that round fixed.
    ("the upload made advisory — refused",
     action(dict(BOTH), dict(BOTH), upload_coe="true"), 1,
     "does not block on failure"),
    # ...AND AN EXPLICIT `false` IS ACCEPTED. The rule is the BEHAVIOUR, not the
    # text: `false` blocks exactly as absence does, and refusing it would be the
    # form-for-construct substitution that produced all eight false refusals on
    # this PR. This case is the one that would redden if the pin were ever
    # tightened to "must be absent".
    ("the upload blocking via an explicit false — accepted",
     action(dict(BOTH), dict(BOTH), upload_coe="false"), 0, "consecutive steps"),
    # An EXPRESSION is refused: it can evaluate true and nothing here can tell.
    ("the upload gated on an expression — refused",
     action(dict(BOTH), dict(BOTH),
            upload_coe="${{ inputs.advisory-run == 'true' }}"), 1,
     "does not block on failure"),
    ("the upload switched to another action — refused",
     action(dict(BOTH), dict(BOTH), upload_uses="actions/upload-artifact@v3"), 1,
     "not 'actions/upload-artifact@v4'"),
    ("the upload removed entirely — refused",
     action(dict(BOTH), dict(BOTH), upload=False), 1,
     '0 steps are named "Upload test results"'),
    ("a duplicate upload step — refused",
     action(dict(BOTH), dict(BOTH)).replace(
         "    - name: Upload test results\n",
         "    - name: Upload test results\n      uses: actions/upload-artifact@v4\n"
         "      with:\n        path: |\n          /etc/passwd\n"
         "    - name: Upload test results\n", 1),
     1, '2 steps are named "Upload test results"'),

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
