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
  - The runner defaults a local run can know are set: CI and GITHUB_ACTIONS
    (`true`), GITHUB_WORKFLOW, GITHUB_JOB, and RUNNER_OS / RUNNER_ARCH from
    the job's `runs-on` (an ubuntu-* label, and only on a host matching it). A script
    naming any other GITHUB_* or RUNNER_* variable is refused (SEEDED).
  - `timeout-minutes` is enforced: a step's own, cut to what remains of the
    job's. A step past it is killed with its whole process group and FAILS.

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
import platform
import re
import signal
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


def minutes(value, where):
    """A `timeout-minutes` as seconds; anything but a positive number is refused."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
        raise CannotRun(f"{where} has timeout-minutes {value!r}, not a positive number")
    return value * 60


def plan(workflow, job, root):
    """(steps, context): the job's steps as (label, script, shell, cwd, env,
    left, timeout seconds or None) tuples, and what the run seeds from the
    workflow (its name, the job id, the job's own timeout). Or CannotRun."""
    doc = load(workflow)
    if not isinstance(doc, dict):
        raise CannotRun(f"{workflow} is not a workflow mapping")
    refuse_unknown(doc, WORKFLOW_KEYS, "the workflow")
    body = (doc.get("jobs") or {}).get(job)
    steps = body.get("steps") if isinstance(body, dict) else None
    if not isinstance(steps, list) or not steps:
        raise CannotRun(f"{workflow} has no steps for job {job!r}")
    refuse_unknown(body, JOB_KEYS, f"job {job!r}")
    context = {"workflow": str(doc.get("name") or os.path.basename(workflow)), "job": job,
               "target": target(body.get("runs-on")),
               "deadline": minutes(body["timeout-minutes"], f"job {job!r}") if "timeout-minutes" in body else None}
    out = []
    for i, step in enumerate(steps, 1):
        label = step.get("name") or step.get("uses") or f"step {i}"
        if "if" in step:
            raise CannotRun(f"step {i} ({label}) has an `if:`, which cannot be evaluated here")
        refuse_unknown(step, STEP_KEYS, f"step {i} ({label})")
        uses = step.get("uses")
        if uses is not None:
            if uses.startswith("actions/checkout@"):
                # The working tree IS the checkout only when checkout comes
                # first, once: a later one cleans the workspace (`git clean
                # -ffdx`), which this runner does not reproduce (Codex, #431).
                if i != 1:
                    raise CannotRun(f"step {i} ({label}) is a checkout after other steps, whose "
                                    "workspace cleanup this runner does not reproduce")
                continue
            if not uses.startswith("./"):
                raise CannotRun(f"step {i} ({label}) uses {uses}, which cannot run locally")
            if "timeout-minutes" in step:
                raise CannotRun(f"step {i} ({label}) bounds a whole composite, which this runner does not")
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
    return out, context


# The runner variables a local run can set truthfully. Actions also sets
# GITHUB_SHA, GITHUB_REF, GITHUB_EVENT_NAME and the like, whose values only a
# real run knows; a script that names one is CANNOT RUN rather than run with
# it unset (Codex, #431). What a script CALLS may read the environment too;
# that is the called program's own business, as it is on a laptop.
SEEDED = {"GITHUB_ACTIONS", "GITHUB_WORKSPACE", "GITHUB_ENV", "GITHUB_PATH", "GITHUB_WORKFLOW",
          "GITHUB_JOB", "RUNNER_TEMP", "RUNNER_OS", "RUNNER_ARCH"}
RUNNER_VARIABLE = re.compile(r"\$\{?((?:GITHUB|RUNNER)_[A-Z0-9_]+)")
HOST_ARCH = {"x86_64": "X64", "amd64": "X64", "aarch64": "ARM64", "arm64": "ARM64"}


# What `ubuntu-latest` resolves to. A fact about GitHub that moves when GitHub
# migrates the label, so it is a TIME-SENSITIVE.md row: the source of truth is
# actions/runner-images' README label table (24.04 there, checked 2026-10-11).
# When GitHub moves it, every ubuntu-latest job here is CANNOT RUN until this
# line follows, and qa.yml's own run of the cases turns red: a loud signal.
UBUNTU_LATEST = "24.04"
UBUNTU_LABEL = re.compile(r"ubuntu-(latest|\d\d\.\d\d)(-arm)?$")


def host_ubuntu_release(path="/etc/os-release"):
    """The host's Ubuntu VERSION_ID, or None when it is not Ubuntu."""
    try:
        with open(path, encoding="utf-8") as handle:
            fields = dict(line.rstrip("\n").split("=", 1) for line in handle if "=" in line)
    except OSError:
        return None
    if fields.get("ID", "").strip('"') != "ubuntu":
        return None
    return fields.get("VERSION_ID", "").strip('"') or None


def target(runs_on):
    """(RUNNER_OS, RUNNER_ARCH) for a job's `runs-on`, which must be a GitHub-
    hosted Ubuntu label this host can stand in for: same OS, architecture and
    Ubuntu release (Codex, #431). The values describe the TARGET, not the
    host, so a step branching on them takes the path it takes on Actions. A
    label this runner cannot reproduce is CANNOT RUN, never run anyway.

    What it can NOT reproduce is the image itself: GitHub's runner image ships
    its own preinstalled tools and versions, which a host of the same release
    does not have. That is why CI stays authoritative and this is a pre-push
    proxy for it."""
    m = UBUNTU_LABEL.match(runs_on) if isinstance(runs_on, str) else None
    if not m:
        raise CannotRun(f"runs-on {runs_on!r} is not a GitHub-hosted ubuntu-<release> or ubuntu-latest "
                        "label this runner reproduces")
    release = UBUNTU_LATEST if m.group(1) == "latest" else m.group(1)
    want = ("Linux", "ARM64" if m.group(2) else "X64", release)
    host = (platform.system(), HOST_ARCH.get(platform.machine().lower(), platform.machine()),
            host_ubuntu_release())
    if host != want:
        raise CannotRun(f"the job targets {runs_on} (Ubuntu {want[2]}, {want[1]}), and this host is "
                        f"{host[0]} {host[1]}, Ubuntu {host[2] or 'none'}")
    return want[:2]


def run_bounded(argv, cwd, env, timeout):
    """Run argv; return its exit code, or None when `timeout` seconds pass first.
    The whole process group is killed then, so a hung download does not
    outlive the step that started it."""
    proc = subprocess.Popen(argv, cwd=cwd, env=env, start_new_session=True)
    try:
        return proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait()
        return None


def make(label, step, root):
    script = step["run"]
    if not isinstance(script, str):
        raise CannotRun(f"{label}: its `run:` is not a string (quote it)")
    if "${{" in script:
        raise CannotRun(f"{label}: its script holds a ${{{{ }}}} expression")
    unseeded = sorted(set(RUNNER_VARIABLE.findall(script)) - SEEDED)
    if unseeded:
        raise CannotRun(f"{label}: its script reads {', '.join(unseeded)}, which only an Actions runner sets")
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
    timeout = minutes(step["timeout-minutes"], label) if "timeout-minutes" in step else None
    return label, script, shell, cwd, env, left, timeout


class BadEnvFile(Exception):
    pass


def read_env_file(path):
    """Parse a $GITHUB_ENV file: `KEY=VALUE` lines and `KEY<<DELIM` blocks.
    A block with no closing delimiter, or a line of neither form, raises
    BadEnvFile: GitHub's runner fails the step on either (Codex, #431)."""
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
            if i >= len(lines):
                raise BadEnvFile(f"{key}<<{delim} is never closed by {delim}")
            out[key] = "\n".join(body)
        elif "=" in line:
            key, value = line.split("=", 1)
            out[key] = value
        elif line.strip():
            raise BadEnvFile(f"line {line!r} is neither KEY=VALUE nor KEY<<DELIMITER")
        i += 1
    return out


def run(steps, root, context):
    temp = tempfile.mkdtemp(prefix="local-gate-")
    env = dict(os.environ, CI="true", GITHUB_ACTIONS="true", GITHUB_WORKFLOW=context["workflow"],
               GITHUB_JOB=context["job"], RUNNER_OS=context["target"][0], RUNNER_ARCH=context["target"][1])
    job_end = time.monotonic() + context["deadline"] if context["deadline"] else None
    env_file, path_file = os.path.join(temp, "env"), os.path.join(temp, "path")
    runner_temp = os.path.join(temp, "runner")
    os.mkdir(runner_temp)
    failed = []
    try:
        for n, (label, script, shell, cwd, step_env, left, step_timeout) in enumerate(steps, 1):
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
            # The step's own bound, cut to what is left of the job's: GitHub
            # cancels the job at its timeout-minutes whatever step is running.
            bounds = [b for b in (step_timeout, job_end - start if job_end else None) if b is not None]
            if bounds and min(bounds) <= 0:
                print(f"FAIL [{n}] {label} (not run: the job's timeout-minutes had passed)", flush=True)
                failed.append(f"[{n}] {label}")
                continue
            code = run_bounded(SHELLS[shell] + [script_file], cwd, full, min(bounds) if bounds else None)
            took = time.monotonic() - start
            if code is None:
                print(f"FAIL [{n}] {label} (timed out after {took:.1f}s)", flush=True)
                failed.append(f"[{n}] {label}")
            elif code == 0:
                print(f"PASS [{n}] {label} ({took:.1f}s)", flush=True)
            else:
                print(f"FAIL [{n}] {label} (exit {code}, {took:.1f}s)", flush=True)
                failed.append(f"[{n}] {label}")
            try:
                written = read_env_file(env_file)
                if "NODE_OPTIONS" in written:
                    raise BadEnvFile("NODE_OPTIONS cannot be set through it")
                # GitHub keeps its own GITHUB_* and RUNNER_* values whatever a
                # step writes here (Codex, #431); so does this runner.
                for key in [k for k in written if k.startswith(("GITHUB_", "RUNNER_"))]:
                    print(f"    ($GITHUB_ENV: {key} is a runner variable and keeps its value)", flush=True)
                    del written[key]
                env.update(written)
            except BadEnvFile as e:
                print(f"FAIL [{n}] {label} ($GITHUB_ENV: {e})", flush=True)
                if not failed or failed[-1] != f"[{n}] {label}":
                    failed.append(f"[{n}] {label}")
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
        steps, context = plan(workflow, args.job, root)
    except CannotRun as e:
        print(f"run-local-gate: CANNOT RUN — {e}", file=sys.stderr)
        return 2
    if args.list:
        for n, (label, *_rest) in enumerate(steps, 1):
            print(f"[{n}] {label}")
        return 0
    failed = run(steps, root, context)
    if failed:
        print(f"\nrun-local-gate: FAIL — {len(failed)} of {len(steps)} step(s):")
        for line in failed:
            print(f"  {line}")
        return 1
    print(f"\nrun-local-gate: OK — all {len(steps)} steps of job {args.job!r} passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
