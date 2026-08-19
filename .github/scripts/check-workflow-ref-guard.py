#!/usr/bin/env python3
"""check-workflow-ref-guard.py — pinned cases for workflow-ref-guard.py.

WHY THIS EXISTS. The guard's whole value is being trusted when it is QUIET. A parser
regression does not announce itself: it finds zero references, prints a cheerful
success line, and the dangling watcher it was installed to catch sails through. That
is the same shape as the incidents the guard exists for — an absent signal read as
health — so the guard needs its own guard.

Every case below is a YAML form that a real review round found a hand-rolled line
scanner reading WRONG, in one of two directions, both of which this suite pins:
  • false GREEN — a valid trigger the scanner never saw, so a dangling name passed;
  • false RED   — valid YAML the scanner could not read, failing a correct workflow.
The second kind is why the guard is built on a YAML parser rather than regexes: the
only fix a project has for a false red is to reformat legal YAML, which is a guard
dictating style rather than catching faults.

Run: python3 .github/scripts/check-workflow-ref-guard.py
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
GUARD = REPO_ROOT / ".github" / "scripts" / "workflow-ref-guard.py"
NBSP = "\u00A0"

JOBS = 'jobs: {a: {runs-on: ubuntu-latest, steps: [{run: "true"}]}}\n'
TARGET = "name: Target\non:\n  push:\n    branches: [main]\n" + JOBS

# (label, expected_exit, {filename: body}, required-json or None[, required diagnostic])
#
# The 5th element is not optional decoration. A case that only asserts "exit 1" pins
# almost nothing: several distinct faults exit 1, so a case can keep passing while the
# branch it was written for is reverted and some unrelated check catches the input
# instead. That happened here — the valueless-`workflows:` case was added to pin a new
# diagnostic, but the input already exited 1 by being read as a dangling empty name, so
# the case would have survived the branch being deleted (Codex, #237). Every failing
# case therefore states the diagnostic it expects.
CASES = [
    # ── forms that must PASS: valid YAML, every watched name resolves ──────────
    (
        "block-scalar body holding an illustrative trigger",
        0,
        {
            "target.yml": TARGET,
            "w.yml": "name: W\non:\n  workflow_run:\n    workflows: [Target]\n    types: [completed]\n"
            "jobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n"
            "          on:\n            workflow_run:\n              workflows: [Ghost]\n",
        },
        None,
    ),
    (
        "double-quoted \\u escape in the declared name",
        0,
        {
            "target.yml": 'name: "QA \\u2014 Tests"\non:\n  push:\n    branches: [main]\n' + JOBS,
            "w.yml": 'name: W\non:\n  workflow_run:\n    workflows: ["QA \u2014 Tests"]\n'
            "    types: [completed]\n" + JOBS,
        },
        None,
    ),
    (
        "\\_ (non-breaking space) escape in the declared name",
        0,
        {
            "target.yml": 'name: "QA\\_Tests"\non:\n  push:\n    branches: [main]\n' + JOBS,
            "w.yml": f'name: W\non:\n  workflow_run:\n    workflows: ["QA{NBSP}Tests"]\n'
            "    types: [completed]\n" + JOBS,
        },
        None,
    ),
    (
        "escaped quote followed by ] inside a flow sequence",
        0,
        {
            "target.yml": 'name: "A\\"]B"\non:\n  push:\n    branches: [main]\n' + JOBS,
            "w.yml": 'name: W\non:\n  workflow_run:\n    workflows: ["A\\"]B"]\n'
            "    types: [completed]\n" + JOBS,
        },
        None,
    ),
    (
        "on: scalar shorthand",
        0,
        {"target.yml": TARGET, "w.yml": "name: W\non: push\n" + JOBS},
        None,
    ),
    (
        "on: sequence shorthand",
        0,
        {"target.yml": TARGET, "w.yml": "name: W\non: [push, pull_request]\n" + JOBS},
        None,
    ),
    (
        "quoted top-level name key",
        0,
        {
            "target.yml": "'name': Target\non:\n  push:\n    branches: [main]\n" + JOBS,
            "w.yml": "name: W\non:\n  workflow_run:\n    workflows: [Target]\n    types: [completed]\n" + JOBS,
        },
        None,
    ),
    (
        "consistently indented root mapping",
        0,
        {
            "target.yml": TARGET,
            "w.yml": "  name: W\n  on:\n    workflow_run:\n      workflows: [Target]\n"
            "      types: [completed]\n  " + JOBS,
        },
        None,
    ),
    (
        "indentless block sequence satisfies a REQUIRED watcher",
        0,
        {
            "target.yml": TARGET,
            "w.yml": "name: W\non:\n  workflow_run:\n    workflows:\n    - Target\n"
            "    types: [completed]\n" + JOBS,
        },
        {"w.yml": ["Target"]},
    ),
    # ── the false-RED set: valid YAML a line scanner refused outright ──────────
    (
        "flow-style on: mapping, name resolves",
        0,
        {
            "target.yml": TARGET,
            "w.yml": "name: W\non: {workflow_run: {workflows: [Target], types: [completed]}}\n" + JOBS,
        },
        None,
    ),
    (
        "flow-style workflow_run: mapping, name resolves",
        0,
        {
            "target.yml": TARGET,
            "w.yml": "name: W\non:\n  workflow_run: {workflows: [Target], types: [completed]}\n" + JOBS,
        },
        None,
    ),
    (
        "anchored block mapping under on:, name resolves",
        0,
        {
            "target.yml": TARGET,
            "w.yml": "name: W\non: &events\n  workflow_run:\n    workflows: [Target]\n"
            "    types: [completed]\n" + JOBS,
        },
        None,
    ),
    (
        "alias as the workflows value, name resolves",
        0,
        {
            "target.yml": TARGET,
            "w.yml": "name: W\nx-anchors: &watched [Target]\non:\n  workflow_run:\n"
            "    workflows: *watched\n    types: [completed]\n" + JOBS,
        },
        None,
    ),
    # ── the false-GREEN set: each must still FAIL when the name dangles ────────
    (
        "plain block style, dangling name",
        1,
        {
            "target.yml": TARGET,
            "w.yml": "name: W\non:\n  workflow_run:\n    workflows: [Ghost]\n    types: [completed]\n" + JOBS,
        },
        None,
        'watches "Ghost"',
    ),
    (
        "quoted workflow_run key, dangling name",
        1,
        {
            "target.yml": TARGET,
            "w.yml": "name: W\non:\n  'workflow_run':\n    workflows: [Ghost]\n"
            "    types: [completed]\n" + JOBS,
        },
        None,
        'watches "Ghost"',
    ),
    (
        "quoted workflows key, dangling name",
        1,
        {
            "target.yml": TARGET,
            "w.yml": 'name: W\non:\n  workflow_run:\n    "workflows": [Ghost]\n'
            "    types: [completed]\n" + JOBS,
        },
        None,
        'watches "Ghost"',
    ),
    (
        "flow-style on: mapping, dangling name",
        1,
        {
            "target.yml": TARGET,
            "w.yml": "name: W\non: {workflow_run: {workflows: [Ghost], types: [completed]}}\n" + JOBS,
        },
        None,
        'watches "Ghost"',
    ),
    (
        "flow-style workflow_run: mapping, dangling name",
        1,
        {
            "target.yml": TARGET,
            "w.yml": "name: W\non:\n  workflow_run: {workflows: [Ghost], types: [completed]}\n" + JOBS,
        },
        None,
        'watches "Ghost"',
    ),
    (
        "anchor on the workflows value, dangling name",
        1,
        {
            "target.yml": TARGET,
            "w.yml": "name: W\non:\n  workflow_run:\n    workflows: &watched [Ghost]\n"
            "    types: [completed]\n" + JOBS,
        },
        None,
        'watches "Ghost"',
    ),
    (
        "anchored block mapping under on:, dangling name",
        1,
        {
            "target.yml": TARGET,
            "w.yml": "name: W\non: &events\n  workflow_run:\n    workflows: [Ghost]\n"
            "    types: [completed]\n" + JOBS,
        },
        None,
        'watches "Ghost"',
    ),
    (
        "alias as the workflows value, dangling name",
        1,
        {
            "target.yml": TARGET,
            "w.yml": "name: W\nx-anchors: &watched [Ghost]\non:\n  workflow_run:\n"
            "    workflows: *watched\n    types: [completed]\n" + JOBS,
        },
        None,
        'watches "Ghost"',
    ),
    # ── rule 2, and the fail-closed floor ─────────────────────────────────────
    (
        "REQUIRED watcher deleted outright (rule 2 — dangles nothing)",
        1,
        {
            "target.yml": TARGET,
            "w.yml": "name: W\non:\n  push:\n    branches: [main]\n" + JOBS,
        },
        {"w.yml": ["Target"]},
        'which this repo REQUIRES',
    ),
    (
        "workflow with no top-level name:",
        1,
        {"target.yml": TARGET, "w.yml": "on:\n  push:\n    branches: [main]\n" + JOBS},
        None,
        'no usable top-level `name:`',
    ),
    (
        "bare `name:` with no value (PyYAML hands back a null-tagged scalar)",
        1,
        {"target.yml": TARGET, "w.yml": "name:\non:\n  push:\n    branches: [main]\n" + JOBS},
        None,
        'no usable top-level `name:`',
    ),
    (
        'explicitly empty `name: ""`',
        1,
        {"target.yml": TARGET, "w.yml": 'name: ""\non:\n  push:\n    branches: [main]\n' + JOBS},
        None,
        'no usable top-level `name:`',
    ),
    (
        "`workflows:` key present with no value",
        1,
        {
            "target.yml": TARGET,
            "w.yml": "name: W\non:\n  workflow_run:\n    workflows:\n    types: [completed]\n" + JOBS,
        },
        None,
        'key with no value',
    ),
    (
        "unparseable YAML is reported, never skipped",
        1,
        {"target.yml": TARGET, "w.yml": "name: W\non:\n  workflow_run:\n   :\n  - [\n"},
        None,
        'not parseable YAML',
    ),
    # ── the null/casing set: forms PyYAML hands back as scalars that are not names ──
    (
        "uppercase ON: is still the trigger key, dangling name",
        1,
        {
            "target.yml": TARGET,
            "w.yml": "name: W\nON:\n  workflow_run:\n    workflows: [Ghost]\n"
            "    types: [completed]\n" + JOBS,
        },
        None,
        'watches "Ghost"',
    ),
    (
        "mixed-case On: is still the trigger key, dangling name",
        1,
        {
            "target.yml": TARGET,
            "w.yml": "name: W\nOn:\n  workflow_run:\n    workflows: [Ghost]\n"
            "    types: [completed]\n" + JOBS,
        },
        None,
        'watches "Ghost"',
    ),
    (
        'quoted "ON": is NOT the trigger key — str-tagged, so there is no trigger here',
        0,
        {
            "target.yml": TARGET,
            "w.yml": 'name: W\non:\n  push:\n    branches: [main]\n"ON":\n'
            "  workflow_run:\n    workflows: [Ghost]\n" + JOBS,
        },
        None,
    ),
    (
        "null entry in the workflows list, against a workflow literally named null",
        1,
        {
            "target.yml": 'name: "null"\non:\n  push:\n    branches: [main]\n' + JOBS,
            "w.yml": "name: W\non:\n  workflow_run:\n    workflows: [null]\n"
            "    types: [completed]\n" + JOBS,
        },
        None,
        "null or empty entry",
    ),
    (
        "empty-string entry in the workflows list",
        1,
        {
            "target.yml": TARGET,
            "w.yml": 'name: W\non:\n  workflow_run:\n    workflows: [""]\n'
            "    types: [completed]\n" + JOBS,
        },
        None,
        "null or empty entry",
    ),
]


def run_case(files, required):
    tmp = tempfile.mkdtemp()
    try:
        os.makedirs(os.path.join(tmp, ".github", "workflows"))
        os.makedirs(os.path.join(tmp, ".github", "scripts"))
        shutil.copy(GUARD, os.path.join(tmp, ".github", "scripts", GUARD.name))
        for filename, body in files.items():
            Path(tmp, ".github", "workflows", filename).write_text(body, encoding="utf-8")
        if required is not None:
            Path(tmp, ".github", "workflow-ref-required.json").write_text(json.dumps(required))
        proc = subprocess.run(
            [sys.executable, os.path.join(tmp, ".github", "scripts", GUARD.name)],
            capture_output=True,
            text=True,
        )
        return proc.returncode, (proc.stdout + proc.stderr).strip()
    finally:
        shutil.rmtree(tmp)


failures = []
for case in CASES:
    label, expected, files, required = case[:4]
    diagnostic = case[4] if len(case) > 4 else None
    code, output = run_case(files, required)
    if code != expected:
        want = "pass" if expected == 0 else "fail"
        got = "passed" if code == 0 else "failed"
        failures.append(f"{label}\n      expected the guard to {want}; it {got}.\n      {output}")
    elif diagnostic and diagnostic not in output:
        failures.append(
            f"{label}\n      exited {code} as expected, but for the wrong stated reason.\n"
            f"      expected the output to contain: {diagnostic!r}\n      {output}"
        )

if failures:
    sys.stderr.write("❌ check-workflow-ref-guard: FAILED\n\n")
    for failure in failures:
        sys.stderr.write("  • " + failure + "\n\n")
    raise SystemExit(1)

print(f"✅ check-workflow-ref-guard: {len(CASES)} pinned YAML forms read correctly.")
