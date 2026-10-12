#!/usr/bin/env python3
"""Pinned cases for run-local-gate.py, the local runner of qa.yml's validate job.

WHY THIS EXISTS. The runner is trusted when it says OK: a session pushes on it.
A runner that skipped a step, or ran one differently from GitHub's runner,
would print the same OK while CI went red, or worse, while a step it never ran
stayed unchecked locally. Each case hands the REAL runner a small workflow,
breaks ONE thing, and requires the exit code AND the reason. Every refusal has
an accepting complement, so a fix cannot be bought by refusing everything.

The last cases run against THIS repo's qa.yml in --list mode: every run step,
and every run step of a local composite, must be planned.

Re-prove discrimination with a mutant:

    RUN_LOCAL_GATE_BIN=/tmp/mutant.py python3 .github/scripts/run-local-gate-cases.py

Run: python3 .github/scripts/run-local-gate-cases.py
"""

import os
import sys
import tempfile

from cases_lib import Cases, bin_path, run, write_tree

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RUNNER = bin_path("RUN_LOCAL_GATE_BIN", os.path.join(ROOT, ".github", "scripts", "run-local-gate.py"))


CHECKOUT = "      - uses: actions/checkout@v4\n"

# Fixtures target THIS host's Ubuntu release, read from the host, so they mean
# "a job this host can stand in for" whatever `ubuntu-latest` resolves to now.
# The label mapping itself has its own case below.
def _host_release():
    try:
        with open("/etc/os-release", encoding="utf-8") as handle:
            fields = dict(l.rstrip("\n").split("=", 1) for l in handle if "=" in l)
    except OSError:
        return "none"
    return fields.get("VERSION_ID", "").strip('"') or "none"


HOST_RELEASE = _host_release()
HOST_LABEL = f"ubuntu-{HOST_RELEASE}"
OTHER_RELEASE = "22.04" if HOST_RELEASE != "22.04" else "20.04"
# What ubuntu-latest resolves to per actions/runner-images' README, the same
# TIME-SENSITIVE.md row as run-local-gate.py's UBUNTU_LATEST: the case below
# pins the runner's value against it, so the two move together.
LATEST_IS = "24.04"


def workflow(steps, checkout=True):
    """A one-job workflow whose job `validate` has `steps` (YAML text, indented
    6), after the checkout every job here must open with."""
    return (f"name: t\non: push\njobs:\n  validate:\n    runs-on: {HOST_LABEL}\n    steps:\n"
            + (CHECKOUT if checkout else "") + steps)


STEP = "      - name: {name}\n        run: {run}\n"


def gate(tmp, files, *extra):
    root = tempfile.mkdtemp(dir=tmp)
    write_tree(root, files)
    # One timeout minute lasts a second here (RUN_LOCAL_GATE_MINUTE), so a
    # `timeout-minutes: 1` case, a value GitHub accepts, expires quickly.
    return run([sys.executable, RUNNER, "--root", root,
                "--workflow", os.path.join(root, "wf.yml"), *extra],
               env=dict(os.environ, RUN_LOCAL_GATE_MINUTE="1"))


CASES = [
    # ── what it runs ────────────────────────────────────────────────────────
    ("two passing steps — accepted",
     {"wf.yml": workflow(STEP.format(name="one", run="echo ok") + STEP.format(name="two", run="echo ok"))},
     0, "all 2 steps of job 'validate' passed"),
    ("a failing step — refused, and named",
     {"wf.yml": workflow(STEP.format(name="one", run="echo ok") + STEP.format(name="breaks", run="exit 3"))},
     1, "FAIL [2] breaks (exit 3"),
    # One run lists every failure: the step after a failure still runs.
    ("a step after a failure still runs",
     {"wf.yml": workflow(STEP.format(name="breaks", run="exit 1") + STEP.format(name="after", run="echo RAN-AFTER"))},
     1, "RAN-AFTER"),
    ("checkout is skipped, not refused",
     {"wf.yml": workflow(CHECKOUT + STEP.format(name="one", run="echo ok"), checkout=False)},
     0, "all 1 steps"),
    ("working-directory is honoured",
     {"wf.yml": workflow("      - name: wd\n        run: test -f marker\n        working-directory: sub\n"),
      "sub/marker": ""},
     0, "PASS [1] wd"),
    ("working-directory is honoured (complement: the file is elsewhere)",
     {"wf.yml": workflow("      - name: wd\n        run: test -f marker\n        working-directory: sub\n"),
      "marker": "", "sub/.keep": ""},
     1, "FAIL [1] wd"),
    ("a literal env value reaches the step",
     {"wf.yml": workflow("      - name: e\n        run: test \"$WANT\" = yes\n        env:\n          WANT: 'yes'\n")},
     0, "PASS [1] e"),
    ("an expression env value is left to the environment, and said so",
     {"wf.yml": workflow("      - name: e\n        run: 'true'\n        env:\n          TOKEN: ${{ secrets.X }}\n")},
     0, "TOKEN: an expression in qa.yml"),
    # ── what one step hands the next ────────────────────────────────────────
    ("GITHUB_ENV KEY=VALUE reaches the next step",
     {"wf.yml": workflow(STEP.format(name="set", run="echo X=hello >> \"$GITHUB_ENV\"")
                         + STEP.format(name="get", run="test \"$X\" = hello"))},
     0, "PASS [2] get"),
    ("GITHUB_ENV is not shared with a step that ran BEFORE it was set",
     {"wf.yml": workflow(STEP.format(name="get", run="test \"${X:-}\" = hello")
                         + STEP.format(name="set", run="echo X=hello >> \"$GITHUB_ENV\""))},
     1, "FAIL [1] get"),
    ("GITHUB_ENV heredoc form reaches the next step",
     {"wf.yml": workflow("      - name: set\n        run: |\n          printf 'M<<EOF\\nline one\\nline two\\nEOF\\n' >> \"$GITHUB_ENV\"\n"
                         + STEP.format(name="get", run="test \"$M\" = \"$(printf 'line one\\nline two')\""))},
     0, "PASS [2] get"),
    ("GITHUB_PATH reaches the next step",
     {"wf.yml": workflow("      - name: set\n        run: |\n          mkdir -p \"$RUNNER_TEMP/bin\"\n"
                         "          printf '#!/bin/sh\\necho SHIMMED\\n' > \"$RUNNER_TEMP/bin/shim\"\n"
                         "          chmod +x \"$RUNNER_TEMP/bin/shim\"\n"
                         "          echo \"$RUNNER_TEMP/bin\" >> \"$GITHUB_PATH\"\n"
                         + STEP.format(name="get", run="shim"))},
     0, "SHIMMED"),
    # ── the shell, as GitHub's runner sets it ───────────────────────────────
    ("no shell: errexit — an early failure fails the step",
     {"wf.yml": workflow("      - name: e\n        run: |\n          false\n          true\n")},
     1, "FAIL [1] e"),
    # GitHub runs an unnamed shell as `bash -e {0}`: no pipefail. Matching it is
    # the point; a stricter local run would fail what CI passes.
    ("no shell: no pipefail — a failing pipe head passes, as on GitHub",
     {"wf.yml": workflow("      - name: p\n        run: false | true\n")},
     0, "PASS [1] p"),
    ("shell: bash: pipefail — a failing pipe head fails, as on GitHub",
     {"wf.yml": workflow("      - name: p\n        shell: bash\n        run: false | true\n")},
     1, "FAIL [1] p"),
    # ── local composites ────────────────────────────────────────────────────
    ("a local composite's run step runs",
     {"wf.yml": workflow("      - name: comp\n        uses: ./act\n"),
      "act/action.yml": "name: a\nruns:\n  using: composite\n  steps:\n    - name: inner\n      shell: bash\n      run: echo INNER-RAN\n"},
     0, "INNER-RAN"),
    ("a failing local composite step — refused",
     {"wf.yml": workflow("      - name: comp\n        uses: ./act\n"),
      "act/action.yml": "name: a\nruns:\n  using: composite\n  steps:\n    - name: inner\n      shell: bash\n      run: exit 4\n"},
     1, "FAIL [1] comp / inner (exit 4"),
    # ── what it refuses rather than approximate ─────────────────────────────
    # YAML reads a bare `true` as a boolean, not a script.
    ("an unquoted boolean run: — CANNOT RUN",
     {"wf.yml": workflow("      - name: b\n        run: true\n")},
     2, "is not a string"),
    ("a remote action — CANNOT RUN",
     {"wf.yml": workflow("      - uses: actions/setup-node@v4\n")},
     2, "uses actions/setup-node@v4, which cannot run locally"),
    ("an if: on a step — CANNOT RUN",
     {"wf.yml": workflow("      - name: c\n        if: github.event_name == 'push'\n        run: 'true'\n")},
     2, "has an `if:`"),
    ("an expression inside run: — CANNOT RUN",
     {"wf.yml": workflow("      - name: x\n        run: echo ${{ github.sha }}\n")},
     2, "holds a ${{ }} expression"),
    ("a non-bash shell — CANNOT RUN",
     {"wf.yml": workflow("      - name: x\n        shell: python\n        run: print(1)\n")},
     2, "is not bash"),
    ("a composite step that uses an action — CANNOT RUN",
     {"wf.yml": workflow("      - name: comp\n        uses: ./act\n"),
      "act/action.yml": "name: a\nruns:\n  using: composite\n  steps:\n    - uses: actions/cache@v4\n"},
     2, "is not a plain `run:` step"),
    # ── keys the runner does not emulate are refused, never ignored ─────────
    ("a workflow-level env: — CANNOT RUN",
     {"wf.yml": "name: t\non: push\nenv:\n  X: '1'\njobs:\n  validate:\n    runs-on: " + HOST_LABEL + "\n    steps:\n" + CHECKOUT + STEP.format(name="one", run="echo ok")},
     2, "the workflow sets env"),
    ("a job's defaults.run — CANNOT RUN",
     {"wf.yml": "name: t\non: push\njobs:\n  validate:\n    runs-on: " + HOST_LABEL + "\n    defaults:\n      run:\n        shell: bash\n    steps:\n" + CHECKOUT + STEP.format(name="one", run="echo ok")},
     2, "job 'validate' sets defaults"),
    ("a step's continue-on-error — CANNOT RUN",
     {"wf.yml": workflow("      - name: c\n        continue-on-error: true\n        run: exit 1\n")},
     2, "sets continue-on-error"),
    ("a with: on a local composite — CANNOT RUN",
     {"wf.yml": workflow("      - name: comp\n        uses: ./act\n        with:\n          x: 1\n"),
      "act/action.yml": "name: a\nruns:\n  using: composite\n  steps:\n    - shell: bash\n      run: echo hi\n"},
     2, "sets with"),
    # ── a composite sees the calling step's env, under its own ─────────────
    ("the calling step's env reaches a composite's run step",
     {"wf.yml": workflow("      - name: comp\n        uses: ./act\n        env:\n          OUTER: 'yes'\n"),
      "act/action.yml": "name: a\nruns:\n  using: composite\n  steps:\n    - name: inner\n      shell: bash\n      run: test \"$OUTER\" = yes\n"},
     0, "PASS [1] comp / inner"),
    ("a composite step's own env wins over the caller's",
     {"wf.yml": workflow("      - name: comp\n        uses: ./act\n        env:\n          X: outer\n"),
      "act/action.yml": "name: a\nruns:\n  using: composite\n  steps:\n    - name: inner\n      shell: bash\n      env:\n        X: inner\n      run: test \"$X\" = inner\n"},
     0, "PASS [1] comp / inner"),
    # ── the runner's own environment and bounds ─────────────────────────────
    ("CI, GITHUB_ACTIONS, RUNNER_OS and GITHUB_JOB are set as on a runner",
     {"wf.yml": workflow(STEP.format(name="e", run='test "$CI" = true && test "$GITHUB_ACTIONS" = true && test -n "$RUNNER_OS" && test "$GITHUB_JOB" = validate'))},
     0, "PASS [1] e"),
    ("a script naming a variable only Actions knows — CANNOT RUN",
     {"wf.yml": workflow(STEP.format(name="e", run='echo "$GITHUB_SHA"'))},
     2, "reads GITHUB_SHA"),
    ("a step past its timeout-minutes is killed and FAILS",
     {"wf.yml": workflow("      - name: slow\n        timeout-minutes: 1\n        run: sleep 30\n")},
     1, "FAIL [1] slow (timed out"),
    ("a step inside its timeout-minutes passes",
     {"wf.yml": workflow("      - name: quick\n        timeout-minutes: 1\n        run: echo ok\n")},
     0, "PASS [1] quick"),
    ("the job's timeout-minutes bounds the steps after it runs out",
     {"wf.yml": "name: t\non: push\njobs:\n  validate:\n    runs-on: " + HOST_LABEL + "\n    timeout-minutes: 1\n    steps:\n" + CHECKOUT
                + STEP.format(name="first", run="sleep 30") + STEP.format(name="second", run="echo ok")},
     1, "FAIL [2] second (not run: the job's timeout-minutes had passed)"),
    ("a fractional timeout-minutes — CANNOT RUN (GitHub takes whole minutes)",
     {"wf.yml": workflow("      - name: z\n        timeout-minutes: 0.5\n        run: echo ok\n")},
     2, "not a whole number from 1 to 360"),
    ("a timeout-minutes over 360 — CANNOT RUN",
     {"wf.yml": workflow("      - name: z\n        timeout-minutes: 361\n        run: echo ok\n")},
     2, "not a whole number from 1 to 360"),
    ("a working-directory holding an expression — CANNOT RUN",
     {"wf.yml": workflow("      - name: w\n        run: echo ok\n        working-directory: ${{ github.workspace }}\n")},
     2, "is not a literal path"),
    # An expression-valued key is unset here (the cases' caller has no
    # LOCAL_GATE_TEST_TOKEN), even after an earlier step exported one.
    ("an expression-valued env key does not inherit a GITHUB_ENV value",
     {"wf.yml": workflow(STEP.format(name="set", run='echo LOCAL_GATE_TEST_TOKEN=old >> "$GITHUB_ENV"')
                         + "      - name: get\n        run: test -z \"${LOCAL_GATE_TEST_TOKEN:-}\"\n        env:\n          LOCAL_GATE_TEST_TOKEN: ${{ secrets.NOT_SET }}\n")},
     0, "PASS [2] get"),
    ("a timeout-minutes that is not a positive number — CANNOT RUN",
     {"wf.yml": workflow("      - name: z\n        timeout-minutes: 0\n        run: echo ok\n")},
     2, "not a whole number from 1 to 360"),
    ("a runs-on this runner cannot reproduce — CANNOT RUN",
     {"wf.yml": "name: t\non: push\njobs:\n  validate:\n    runs-on: macos-latest\n    steps:\n" + CHECKOUT + STEP.format(name="one", run="echo ok")},
     2, "is not a GitHub-hosted ubuntu-<release>"),
    # This host is Linux X64; an ARM target is a real mismatch, not a label.
    ("a runs-on this host cannot stand in for — CANNOT RUN",
     {"wf.yml": "name: t\non: push\njobs:\n  validate:\n    runs-on: " + HOST_LABEL + "-arm\n    steps:\n" + CHECKOUT + STEP.format(name="one", run="echo ok")},
     2, "this host is"),
    ("RUNNER_OS and RUNNER_ARCH describe the target",
     {"wf.yml": workflow(STEP.format(name="t", run='test "$RUNNER_OS" = Linux && test "$RUNNER_ARCH" = X64'))},
     0, "PASS [1] t"),
    ("an unterminated GITHUB_ENV heredoc FAILS the step",
     {"wf.yml": workflow("      - name: set\n        run: printf 'M<<EOF\\npartial\\n' >> \"$GITHUB_ENV\"\n")},
     1, "never closed by EOF"),
    ("a malformed GITHUB_ENV line FAILS the step",
     {"wf.yml": workflow(STEP.format(name="set", run='echo not-an-assignment >> "$GITHUB_ENV"'))},
     1, "neither KEY=VALUE nor KEY<<DELIMITER"),
    # Another Ubuntu release is a different image even on the same OS and
    # architecture.
    ("a runs-on naming another Ubuntu release — CANNOT RUN",
     {"wf.yml": "name: t\non: push\njobs:\n  validate:\n    runs-on: ubuntu-" + OTHER_RELEASE + "\n    steps:\n" + CHECKOUT + STEP.format(name="one", run="echo ok")},
     2, "Ubuntu " + OTHER_RELEASE),
    # `ubuntu-latest` is read as the release the runner-images README names
    # (LATEST_IS): runnable where the host is that release, CANNOT RUN where
    # it is not -- never silently run on the wrong image.
    ("ubuntu-latest is read as " + LATEST_IS + ", runnable only on that release",
     {"wf.yml": "name: t\non: push\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    steps:\n" + CHECKOUT + STEP.format(name="one", run="echo ok")},
     *((0, "all 1 steps") if HOST_RELEASE == LATEST_IS else (2, "Ubuntu " + LATEST_IS))),
    ("a checkout after another step — CANNOT RUN",
     {"wf.yml": workflow(STEP.format(name="one", run="echo ok") + "      - uses: actions/checkout@v4\n")},
     2, "is a checkout after other steps"),
    ("GITHUB_ENV cannot overwrite a GITHUB_* variable",
     {"wf.yml": workflow(STEP.format(name="set", run='echo GITHUB_ACTIONS=false >> "$GITHUB_ENV"')
                         + STEP.format(name="get", run='test "$GITHUB_ACTIONS" = true'))},
     0, "PASS [2] get"),
    ("GITHUB_ENV setting NODE_OPTIONS FAILS the step",
     {"wf.yml": workflow(STEP.format(name="set", run='echo NODE_OPTIONS=--x >> "$GITHUB_ENV"'))},
     1, "NODE_OPTIONS cannot be set"),
    # ── YAML 1.2 scalars, as GitHub reads them ──────────────────────────────
    ("env FLAG: yes stays the string yes (YAML 1.2, not 1.1's true)",
     {"wf.yml": workflow("      - name: e\n        run: test \"$FLAG\" = yes\n        env:\n          FLAG: yes\n")},
     0, "PASS [1] e"),
    ("env FLAG: true reaches the shell as true",
     {"wf.yml": workflow("      - name: e\n        run: test \"$FLAG\" = true\n        env:\n          FLAG: true\n")},
     0, "PASS [1] e"),
    ("an env key ON stays the name ON",
     {"wf.yml": workflow("      - name: e\n        run: test \"$ON\" = x\n        env:\n          ON: x\n")},
     0, "PASS [1] e"),
    # Integers too (I-4): YAML 1.1 reads a leading 0 as octal, so 0361 was a
    # 241-minute bound that ran, and 080 crashed the gate with a traceback.
    ("timeout-minutes 0361 is 361, as on GitHub, not octal 241 — CANNOT RUN",
     {"wf.yml": workflow("      - name: z\n        timeout-minutes: 0361\n        run: echo ok\n")},
     2, "not a whole number from 1 to 360"),
    ("timeout-minutes 080 is 80, not a traceback",
     {"wf.yml": workflow("      - name: z\n        timeout-minutes: 080\n        run: echo ok\n")},
     0, "PASS [1] z"),
    ("env V: 070 reaches the shell as 70",
     {"wf.yml": workflow("      - name: e\n        run: test \"$V\" = 70\n        env:\n          V: 070\n")},
     0, "PASS [1] e"),
    # ── metadata GitHub rejects is not run ──────────────────────────────────
    ("a composite run step without shell — CANNOT RUN",
     {"wf.yml": workflow("      - name: comp\n        uses: ./act\n"),
      "act/action.yml": "name: a\nruns:\n  using: composite\n  steps:\n    - run: echo hi\n"},
     2, "without `shell:`"),
    ("a local action without runs.using: composite — CANNOT RUN",
     {"wf.yml": workflow("      - name: comp\n        uses: ./act\n"),
      "act/action.yml": "name: a\nruns:\n  steps:\n    - shell: bash\n      run: echo hi\n"},
     2, "is not `runs.using: composite`"),
    ("checkout@v7, the ref qa.yml pins — accepted",
     {"wf.yml": workflow("      - uses: actions/checkout@v7\n" + STEP.format(name="one", run="echo ok"), checkout=False)},
     0, "all 1 steps of job 'validate' passed"),
    ("a checkout ref not known to resolve — CANNOT RUN",
     {"wf.yml": workflow("      - uses: actions/checkout@does-not-exist\n" + STEP.format(name="one", run="echo ok"), checkout=False)},
     2, "are known to resolve"),
    ("a step env cannot override a default variable",
     {"wf.yml": workflow("      - name: e\n        run: test \"$GITHUB_ACTIONS\" = true\n        env:\n          GITHUB_ACTIONS: 'false'\n")},
     0, "PASS [1] e"),
    ("a step env can set a GITHUB_ name that is not a default",
     {"wf.yml": workflow("      - name: e\n        run: test \"$GITHUB_TOKEN\" = x\n        env:\n          GITHUB_TOKEN: x\n")},
     0, "PASS [1] e"),
    ("a GITHUB_ENV path saved by an earlier step is not read for a later one",
     {"wf.yml": workflow(STEP.format(name="save", run='echo "$GITHUB_ENV" > "$RUNNER_TEMP/saved"')
                         + STEP.format(name="late", run='echo LATE_X=1 >> "$(cat "$RUNNER_TEMP/saved")"')
                         + STEP.format(name="check", run='test -z "${LATE_X:-}"'))},
     0, "PASS [3] check"),
    ("a step with both uses: and run: — CANNOT RUN",
     {"wf.yml": workflow("      - uses: actions/checkout@v4\n        run: exit 1\n")},
     2, "has both `uses:` and `run:`"),
    ("a numeric top-level key — CANNOT RUN (1 is not True here)",
     {"wf.yml": "name: t\non: push\n1: bogus\njobs:\n  validate:\n    runs-on: " + HOST_LABEL + "\n    steps:\n" + CHECKOUT + STEP.format(name="one", run="echo ok")},
     2, "the workflow sets 1"),
    ("a job whose first step is not checkout — CANNOT RUN",
     {"wf.yml": workflow(STEP.format(name="one", run="echo ok"), checkout=False)},
     2, "first step is not actions/checkout"),
    ("a bare-name read of a runner variable — CANNOT RUN",
     {"wf.yml": workflow(STEP.format(name="e", run="'[[ -v GITHUB_SHA ]]'"))},
     2, "reads GITHUB_SHA"),
    ("a GITHUB_ENV heredoc with an empty delimiter FAILS the step (#432)",
     {"wf.yml": workflow("      - name: set\n        run: printf 'K<<\\nv\\n\\n' >> \"$GITHUB_ENV\"\n")},
     1, "has an empty name or delimiter"),
    ("a GITHUB_ENV heredoc with an empty name FAILS the step (#432)",
     {"wf.yml": workflow("      - name: set\n        run: printf '<<EOF\\nv\\nEOF\\n' >> \"$GITHUB_ENV\"\n")},
     1, "has an empty name or delimiter"),
    ("a GITHUB_ENV heredoc with a whitespace delimiter is legal, as on GitHub (#435)",
     {"wf.yml": workflow(STEP.format(name="set", run="printf 'K<< \\nv\\n \\n' >> \"$GITHUB_ENV\"")
                         + STEP.format(name="get", run="test \"$K\" = v"))},
     0, "PASS [2] get"),
    ("a fractional timeout-minutes on the checkout step — CANNOT RUN (#432)",
     {"wf.yml": workflow("      - uses: actions/checkout@v4\n        timeout-minutes: 0.5\n" + STEP.format(name="one", run="echo ok"), checkout=False)},
     2, "not a whole number from 1 to 360"),
    # ── composite refusals, each with no case until 2026-10-11 (I-7) ────────
    ("a timeout-minutes on a composite step — CANNOT RUN",
     {"wf.yml": workflow("      - name: comp\n        uses: ./act\n        timeout-minutes: 5\n"),
      "act/action.yml": "name: a\nruns:\n  using: composite\n  steps:\n    - shell: bash\n      run: echo hi\n"},
     2, "bounds a whole composite"),
    ("a composite that declares inputs — CANNOT RUN",
     {"wf.yml": workflow("      - name: comp\n        uses: ./act\n"),
      "act/action.yml": "name: a\ninputs:\n  x:\n    description: d\nruns:\n  using: composite\n  steps:\n    - shell: bash\n      run: echo hi\n"},
     2, "declares inputs"),
    # The needle matters: without the `if` test, the key allow-list below
    # would still refuse it, for a different stated reason.
    ("an if: on a composite step — CANNOT RUN",
     {"wf.yml": workflow("      - name: comp\n        uses: ./act\n"),
      "act/action.yml": "name: a\nruns:\n  using: composite\n  steps:\n    - if: always()\n      shell: bash\n      run: echo hi\n"},
     2, "./act step 1 is not a plain `run:` step"),
    ("an unknown key on a composite step — CANNOT RUN",
     {"wf.yml": workflow("      - name: comp\n        uses: ./act\n"),
      "act/action.yml": "name: a\nruns:\n  using: composite\n  steps:\n    - shell: bash\n      continue-on-error: true\n      run: exit 1\n"},
     2, "./act step 1 sets continue-on-error"),
    # GitHub prepends each entry, so the LAST one written is searched first.
    ("GITHUB_PATH: the entry written last wins",
     {"wf.yml": workflow("      - name: set\n        run: |\n"
                         "          for d in a b; do mkdir -p \"$RUNNER_TEMP/$d\"\n"
                         "            printf '#!/bin/sh\\necho FROM-%s\\n' \"$d\" > \"$RUNNER_TEMP/$d/shim\"\n"
                         "            chmod +x \"$RUNNER_TEMP/$d/shim\"; echo \"$RUNNER_TEMP/$d\" >> \"$GITHUB_PATH\"; done\n"
                         + STEP.format(name="get", run="test \"$(shim)\" = FROM-b"))},
     0, "PASS [2] get"),
    # ── $GITHUB_ENV read as GitHub's runner reads it (I-6) ──────────────────
    # FileCommandManager.cs, EnvFileKeyValuePairs: lines end at \n only.
    ("a GITHUB_ENV heredoc closed only by EOF\\r FAILS the step, as on GitHub",
     {"wf.yml": workflow("      - name: set\n        run: printf 'M<<EOF\\nv\\nEOF\\r\\n' >> \"$GITHUB_ENV\"\n")},
     1, "never closed by EOF"),
    ("a whitespace-only GITHUB_ENV line FAILS the step, as on GitHub",
     {"wf.yml": workflow("      - name: set\n        run: printf 'K=v\\n \\n' >> \"$GITHUB_ENV\"\n")},
     1, "neither KEY=VALUE nor KEY<<DELIMITER"),
    # Accepted on GitHub too: its empty-name test reads the line, not the name.
    ("a GITHUB_ENV =v line is accepted, as on GitHub",
     {"wf.yml": workflow(STEP.format(name="set", run="printf '=v\\nK=w\\n' >> \"$GITHUB_ENV\"")
                         + STEP.format(name="get", run="test \"$K\" = w"))},
     0, "PASS [2] get"),
    # .NET decodes an invalid byte as U+FFFD; it was a traceback here.
    ("a non-UTF-8 GITHUB_ENV byte is read as U+FFFD, not a traceback",
     {"wf.yml": workflow(STEP.format(name="set", run="printf 'K=\\377\\n' >> \"$GITHUB_ENV\"")
                         + STEP.format(name="get", run="test \"$K\" = \"$(printf '\\357\\277\\275')\""))},
     0, "PASS [2] get"),
    ("a non-UTF-8 GITHUB_PATH byte is not a traceback",
     {"wf.yml": workflow(STEP.format(name="set", run="printf '/nonexistent\\377\\n' >> \"$GITHUB_PATH\"")
                         + STEP.format(name="after", run="echo ok"))},
     0, "PASS [2] after"),
    # ── malformed shapes are CANNOT RUN, never a traceback (M-4) ────────────
    ("a step that is a bare string — CANNOT RUN",
     {"wf.yml": workflow("      - echo hi\n")},
     2, "step 2 is a str, not a mapping"),
    ("uses: 4 — CANNOT RUN",
     {"wf.yml": workflow("      - uses: 4\n")},
     2, "not an action reference"),
    ("a composite step that is a bare string — CANNOT RUN",
     {"wf.yml": workflow("      - name: comp\n        uses: ./act\n"),
      "act/action.yml": "name: a\nruns:\n  using: composite\n  steps:\n    - echo hi\n"},
     2, "./act step 1 is a str, not a mapping"),
    ("an env that is a list — CANNOT RUN",
     {"wf.yml": workflow("      - name: e\n        run: echo ok\n        env: [A, B]\n")},
     2, "its env is a list, not a mapping"),
    ("an env value that is a list — CANNOT RUN",
     {"wf.yml": workflow("      - name: e\n        run: echo ok\n        env:\n          A: [1, 2]\n")},
     2, "env A is a list, not a string"),
    ("jobs that is a list — CANNOT RUN",
     {"wf.yml": "name: t\non: push\njobs: [validate]\n"},
     2, "jobs is a list, not a mapping"),
    ("a shell that is a list — CANNOT RUN",
     {"wf.yml": workflow("      - name: s\n        shell: [bash]\n        run: echo ok\n")},
     2, "is not bash"),
    ("no such job — CANNOT RUN",
     {"wf.yml": "name: t\non: push\njobs:\n  other:\n    runs-on: " + HOST_LABEL + "\n    steps:\n      - run: 'true'\n"},
     2, "no steps for job 'validate'"),
    # A refused workflow runs NOTHING: the plan is checked whole before step 1.
    ("a refusal anywhere runs nothing",
     {"wf.yml": workflow(STEP.format(name="first", run="echo SHOULD-NOT-RUN") + "      - uses: some/action@v1\n")},
     2, None),
]


def main():
    c = Cases("run-local-gate-cases")
    with tempfile.TemporaryDirectory() as tmp:
        for label, files, expected, needle in CASES:
            code, out = gate(tmp, files)
            c.expect(label, code, out, expected, needle)
            if label == "a refusal anywhere runs nothing" and "SHOULD-NOT-RUN" in out:
                c.fail(label + " (output)", "step 1 ran before the refusal")
    # A caller's own value for a default the runner does not seed must not
    # reach a step: the step looks for it without naming it, so the scan
    # above cannot be what stops it.
    with tempfile.TemporaryDirectory() as tmp:
        root = tempfile.mkdtemp(dir=tmp)
        write_tree(root, {"wf.yml": workflow(STEP.format(name="e", run="test \"$(env | grep -c '^GITHUB_REF_' || true)\" = 0"))})
        code, out = run([sys.executable, RUNNER, "--root", root, "--workflow", os.path.join(root, "wf.yml")],
                        env=dict(os.environ, GITHUB_REF_NAME="leak", RUN_LOCAL_GATE_MINUTE="1"))
        c.expect("a caller's unseeded default variable is removed from the step's environment",
                 code, out, 0, "PASS [1] e")
    # This repo's own job: every step with a script is planned. Counted from
    # the YAML here, independently of the runner's own reading.
    import yaml
    with open(os.path.join(ROOT, ".github", "workflows", "qa.yml"), encoding="utf-8") as handle:
        steps = yaml.safe_load(handle)["jobs"]["validate"]["steps"]
    want = 0
    for step in steps:
        if "run" in step:
            want += 1
        elif step.get("uses", "").startswith("./"):
            with open(os.path.join(ROOT, step["uses"], "action.yml"), encoding="utf-8") as handle:
                want += sum(1 for s in yaml.safe_load(handle)["runs"]["steps"] if "run" in s)
    code, out = run([sys.executable, RUNNER, "--list", "--root", ROOT])
    c.expect("this repo's validate job can be planned", code, out, 0, f"[{want}] ")
    if f"[{want + 1}] " in out:
        c.fail("this repo's validate job plans no extra step", out)
    return c.finish(f"{len(CASES) + 1} pinned workflows read correctly; {want} steps planned for this repo.")


if __name__ == "__main__":
    sys.exit(main())
