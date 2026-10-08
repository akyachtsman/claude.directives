"""Shared plumbing for this repo's Python case suites (`*-cases.py`).

Each suite pins a guard's behaviour by running the REAL guard -- or a mutant
named by the suite's own `*_BIN` variable -- against fixtures, and requires
BOTH the exit code AND a stated reason: a dozen distinct problems can share an
exit code, so "exit 1" alone lets a case keep passing after the branch it was
written for is reverted and something else catches the input (the lesson
check-workflow-ref-guard.py records from #237).

What lives here is only the scaffolding every suite repeated: running a
command, writing a fixture tree, and the OK / FAILED reporting. The cases,
and every fixture builder that says something about a guard, stay in the
suite that owns them.

NOT exported, and not a guard: it lives beside the suites in .github/scripts/,
which `import cases_lib` finds because Python puts a script's own directory
first on sys.path.
"""

import os
import subprocess
from pathlib import Path


def run(argv, **kwargs):
    """Run `argv`; return (exit code, stdout + stderr, stripped).

    Decoded LENIENTLY: a guard that prints a path holding a byte that is not
    valid UTF-8 must reach the suite as a verdict, not as a UnicodeDecodeError
    raised by the harness (check-action-siblings-cases.py, #354).
    """
    proc = subprocess.run([str(a) for a in argv], capture_output=True, **kwargs)
    decode = lambda b: b.decode("utf-8", "surrogateescape")
    return proc.returncode, (decode(proc.stdout) + decode(proc.stderr)).strip()


def write_tree(root, files):
    """Write {relative path: text} under `root`, creating directories."""
    for rel, text in files.items():
        dest = Path(root) / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text, encoding="utf-8")


class Cases:
    """Collects case outcomes and prints the suite's verdict."""

    def __init__(self, name):
        self.name = name
        self.failures = []
        self.passed = 0

    def ok(self, label):
        self.passed += 1
        print(f"OK:   {label}")

    def fail(self, label, detail):
        self.failures.append(f"{label}\n      {detail}")

    def expect(self, label, code, out, expected, needle=None):
        """Pin the exit code, then the stated reason. Returns True on a pass."""
        if code != expected:
            self.fail(label, f"expected exit {expected}; got {code}.\n      {out}")
            return False
        if needle is not None and needle not in out:
            self.fail(label, f"exited {code} as expected, but for the wrong stated reason."
                             f"\n      expected the output to contain: {needle!r}\n      {out}")
            return False
        self.ok(f"{label} (exit {code})")
        return True

    def finish(self, summary):
        """Print the verdict; return the process exit code (0 pass, 1 fail)."""
        if self.failures:
            print(f"\n{self.name}: FAILED — {len(self.failures)} case(s)\n")
            for failure in self.failures:
                print(f"  - {failure}")
            return 1
        print(f"\n{self.name}: OK — {summary}")
        return 0


def bin_path(env_var, default):
    """The script under test: `env_var` names a mutant; otherwise `default`."""
    return Path(os.environ.get(env_var, default)).resolve()
