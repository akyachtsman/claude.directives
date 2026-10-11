#!/usr/bin/env python3
"""Run qa.yml's `validate` job locally, step by step, from the workflow itself.

WHY THIS EXISTS. CLAUDE.md's Local gate was a hand-kept mirror of this job,
about forty commands with a "keep the two in sync" rule and nothing enforcing
it. A check added to qa.yml and not to the mirror passed every local run and
first turned red on the PR. This runner reads the steps out of the workflow, so
there is no second list to drift (audit 2026-10-09, batch C, S1).

WHAT IT RUNS, per step, in order:
  - `uses: actions/checkout@...` is skipped: the working tree IS the checkout.
  - `uses: ./<dir>` (a composite in this repo) runs each `run:` step of
    <dir>/action.yml, as `qa.yml`'s Secret scan step does, with the calling
    step's `env:` under each inner step's own.
  - `run:` is written to a file and run the way the runner does: `bash -e` when
    the step names no shell, `bash --noprofile --norc -eo pipefail` for
    `shell: bash`. `working-directory` and literal `env:` values apply.
  - `$GITHUB_ENV` and `$GITHUB_PATH` are real files, read after each step, so a
    step that exports a variable (the shfmt install sets SHFMT) hands it on.
    `$RUNNER_TEMP` is a temporary directory removed at the end.

WHAT IT REFUSES (exit 2, CANNOT RUN), rather than run something else:
  - any key at workflow, job or step level it does not emulate (an allow-list:
    a workflow `env:`, a job's `defaults:`, a step's `continue-on-error`, ...);
  - a `uses:` that is neither checkout nor a local composite;
  - an `if:` on a step: its condition cannot be evaluated here;
  - a `${{ ... }}` expression inside a `run:` script;
  - a `shell:` other than bash.
An `env:` value holding an expression (`${{ secrets.GITHUB_TOKEN }}`) is left to
the caller's environment, and the run says so.

Every step runs even after one fails, so one run lists every failure; a step
can still fail BECAUSE an earlier one did (an install). Exit 0 when all pass,
1 when any fails, 2 when the job cannot be run as written.

Run it AFTER `git add` (CLAUDE.md → *Local gate*): several checks enumerate
`git ls-files`, which cannot see a file not yet staged.

Usage:
    python3 .github/scripts/run-local-gate.py            # the validate job
    python3 .github/scripts/run-local-gate.py --list     # print the steps only
    --workflow PATH --job NAME --root DIR                # another job or tree

Its own guard: .github/scripts/run-local-gate-cases.py.
"""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHELLS = {
    None: ["bash", "-e"],
    "bash": ["bash", "--noprofile", "--norc", "-eo", "pipefail"],
}


class CannotRun(Exception):
    pass


def load(path):
    try:
        import yaml
    except ImportError:
        raise CannotRun("PyYAML is not installed, so the workflow cannot be read")
    try:
        with open(path, encoding="utf-8") as handle:
            return yaml.safe_load(handle)
    except (OSError, yaml.YAMLError) as e:
        raise CannotRun(f"cannot read {path}: {e}")


# The keys the runner understands, at each level. Anything else is refused,
# never ignored: a key the runner drops (a workflow-level `env:`, a job's
# `defaults.run`, a step's `continue-on-error`) runs the same script under
# different settings, and the gate could pass what Actions fails (Codex,
# #431). An allow-list, so a key nobody thought of is refused too. Keys here
# either change nothing a local run can see (name, permissions, concurrency,
# runs-on, timeout-minutes, id) or are emulated (env on a step, shell,
# working-directory, run, uses).
WORKFLOW_KEYS = {"name", "run-name", "on", True, "permissions", "concurrency", "jobs"}
JOB_KEYS = {"name", "runs-on", "timeout-minutes", "permissions", "steps"}
STEP_KEYS = {"name", "id", "run", "uses", "env", "shell", "working-directory", "timeout-minutes"}
COMPOSITE_STEP_KEYS = {"name", "id", "run", "env", "shell", "working-directory"}


def refuse_unknown(keys, allowed, where):
    extra = [k for k in keys if k not in allowed]
    if extra:
        raise CannotRun(f"{where} sets {', '.join(sorted(map(str, extra)))}, which this runner does not "
                        "emulate (see WORKFLOW_KEYS / JOB_KEYS / STEP_KEYS)")


def plan(workflow, job, root):
    """The job's steps as (label, script, shell, cwd, env, left) tuples, or CannotRun."""
    doc = load(workflow)
    if not isinstance(doc, dict):
        raise CannotRun(f"{workflow} is not a workflow mapping")
    refuse_unknown(doc, WORKFLOW_KEYS, "the workflow")
    body = (doc.get("jobs") or {}).get(job)
    steps = body.get("steps") if isinstance(body, dict) else None
    if not isinstance(steps, list) or not steps:
        raise CannotRun(f"{workflow} has no steps for job {job!r}")
    refuse_unknown(body, JOB_KEYS, f"job {job!r}")
    out = []
    for i, step in enumerate(steps, 1):
        label = step.get("name") or step.get("uses") or f"step {i}"
        if "if" in step:
            raise CannotRun(f"step {i} ({label}) has an `if:`, which cannot be evaluated here")
        refuse_unknown(step, STEP_KEYS, f"step {i} ({label})")
        uses = step.get("uses")
        if uses is not None:
            if uses.startswith("actions/checkout@"):
                continue
            if not uses.startswith("./"):
                raise CannotRun(f"step {i} ({label}) uses {uses}, which cannot run locally")
            action = load(os.path.join(root, uses, "action.yml"))
            if (action or {}).get("inputs"):
                raise CannotRun(f"{uses}/action.yml declares inputs, which this runner does not pass")
            inner = ((action or {}).get("runs") or {}).get("steps")
            if not isinstance(inner, list):
                raise CannotRun(f"{uses}/action.yml has no composite steps")
            for j, sub in enumerate(inner, 1):
                if "run" not in sub or "uses" in sub or "if" in sub:
                    raise CannotRun(f"{uses} step {j} is not a plain `run:` step")
                refuse_unknown(sub, COMPOSITE_STEP_KEYS, f"{uses} step {j}")
                # The calling step's env reaches the composite's steps, as on
                # GitHub; a key the inner step sets itself wins (Codex, #431).
                merged = dict(sub, env={**(step.get("env") or {}), **(sub.get("env") or {})})
                out.append(make(f"{label} / {sub.get('name') or j}", merged, root))
            continue
        if "run" not in step:
            raise CannotRun(f"step {i} ({label}) has neither `run:` nor `uses:`")
        out.append(make(label, step, root))
    return out


def make(label, step, root):
    script = step["run"]
    if not isinstance(script, str):
        raise CannotRun(f"{label}: its `run:` is not a string (quote it)")
    if "${{" in script:
        raise CannotRun(f"{label}: its script holds a ${{{{ }}}} expression")
    shell = step.get("shell")
    if shell not in SHELLS:
        raise CannotRun(f"{label}: shell {shell!r} is not bash")
    cwd = os.path.join(root, step.get("working-directory", "."))
    env, left = {}, []
    for key, value in (step.get("env") or {}).items():
        if isinstance(value, str) and "${{" in value:
            left.append(key)
        else:
            env[key] = str(value)
    return label, script, shell, cwd, env, left


def read_env_file(path):
    """Parse a $GITHUB_ENV file: `KEY=VALUE` lines and `KEY<<DELIM` blocks."""
    out = {}
    with open(path, encoding="utf-8") as handle:
        lines = handle.read().splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if "<<" in line and ("=" not in line or line.index("<<") < line.index("=")):
            key, delim = line.split("<<", 1)
            body = []
            i += 1
            while i < len(lines) and lines[i] != delim:
                body.append(lines[i])
                i += 1
            out[key] = "\n".join(body)
        elif "=" in line:
            key, value = line.split("=", 1)
            out[key] = value
        i += 1
    return out


def run(steps, root):
    temp = tempfile.mkdtemp(prefix="local-gate-")
    env = dict(os.environ)
    env_file, path_file = os.path.join(temp, "env"), os.path.join(temp, "path")
    runner_temp = os.path.join(temp, "runner")
    os.mkdir(runner_temp)
    failed = []
    try:
        for n, (label, script, shell, cwd, step_env, left) in enumerate(steps, 1):
            open(env_file, "w").close()
            open(path_file, "w").close()
            script_file = os.path.join(temp, f"step{n}.sh")
            with open(script_file, "w", encoding="utf-8") as handle:
                handle.write(script)
            full = dict(env, GITHUB_WORKSPACE=root, RUNNER_TEMP=runner_temp,
                        GITHUB_ENV=env_file, GITHUB_PATH=path_file, **step_env)
            print(f"\n=== [{n}/{len(steps)}] {label}", flush=True)
            for key in left:
                print(f"    ({key}: an expression in qa.yml, left to this environment)", flush=True)
            start = time.monotonic()
            code = subprocess.call(SHELLS[shell] + [script_file], cwd=cwd, env=full)
            took = time.monotonic() - start
            if code == 0:
                print(f"PASS [{n}] {label} ({took:.1f}s)", flush=True)
            else:
                print(f"FAIL [{n}] {label} (exit {code}, {took:.1f}s)", flush=True)
                failed.append(f"[{n}] {label}")
            env.update(read_env_file(env_file))
            with open(path_file, encoding="utf-8") as handle:
                added = [p for p in handle.read().splitlines() if p]
            if added:
                env["PATH"] = os.pathsep.join(list(reversed(added)) + [env.get("PATH", "")])
    finally:
        shutil.rmtree(temp, ignore_errors=True)
    return failed


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--workflow", default=None, help="default: <root>/.github/workflows/qa.yml")
    parser.add_argument("--job", default="validate")
    parser.add_argument("--root", default=ROOT)
    parser.add_argument("--list", action="store_true", help="print the steps, run nothing")
    args = parser.parse_args()
    root = os.path.abspath(args.root)
    workflow = args.workflow or os.path.join(root, ".github", "workflows", "qa.yml")
    try:
        steps = plan(workflow, args.job, root)
    except CannotRun as e:
        print(f"run-local-gate: CANNOT RUN — {e}", file=sys.stderr)
        return 2
    if args.list:
        for n, (label, *_rest) in enumerate(steps, 1):
            print(f"[{n}] {label}")
        return 0
    failed = run(steps, root)
    if failed:
        print(f"\nrun-local-gate: FAIL — {len(failed)} of {len(steps)} step(s):")
        for line in failed:
            print(f"  {line}")
        return 1
    print(f"\nrun-local-gate: OK — all {len(steps)} steps of job {args.job!r} passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
