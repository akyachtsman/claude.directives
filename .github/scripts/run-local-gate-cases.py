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


def workflow(steps):
    """A one-job workflow whose job `validate` has `steps` (YAML text, indented 6)."""
    return "name: t\non: push\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    steps:\n" + steps


STEP = "      - name: {name}\n        run: {run}\n"


def gate(tmp, files, *extra):
    root = tempfile.mkdtemp(dir=tmp)
    write_tree(root, files)
    return run([sys.executable, RUNNER, "--root", root,
                "--workflow", os.path.join(root, "wf.yml"), *extra])


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
     {"wf.yml": workflow("      - uses: actions/checkout@v4\n" + STEP.format(name="one", run="echo ok"))},
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
    ("no such job — CANNOT RUN",
     {"wf.yml": "name: t\non: push\njobs:\n  other:\n    runs-on: x\n    steps:\n      - run: 'true'\n"},
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
    code, out = run([sys.executable, RUNNER, "--list"])
    c.expect("this repo's validate job can be planned", code, out, 0, f"[{want}] ")
    if f"[{want + 1}] " in out:
        c.fail("this repo's validate job plans no extra step", out)
    return c.finish(f"{len(CASES) + 1} pinned workflows read correctly; {want} steps planned for this repo.")


if __name__ == "__main__":
    sys.exit(main())
