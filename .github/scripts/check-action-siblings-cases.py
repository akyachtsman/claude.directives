#!/usr/bin/env python3
r"""Guard the action-sibling guard: pinned trees, each exit and each diagnostic.

WHY THIS EXISTS. `check-action-siblings.py` passes against this repo today and
would pass just as quietly if its rule stopped working -- everything in
`templates/actions/` is tracked, so a guard that checked nothing at all prints
the same OK. That is the fail-open family (#323): a pass and a did-not-look are
the same output.

It runs the REAL guard against fixture repositories rather than re-implementing
its rule; a cases file holding a copy of the rule tests the copy.

The fixtures are real `git init` repositories because the guard asks git what is
STAGED, not the filesystem what exists -- and one case turns on the difference
between a staged file and a `git add -N` placeholder, which no directory of
loose files can express.

The parsing cases that used to live here went with the derivation they pinned.
Four rounds of shell-syntax findings are recorded in the guard's header; the rule
no longer reads shell, so there is no syntax left to pin.

Re-prove discrimination with a mutant:

    CHECK_ACTION_SIBLINGS_BIN=/tmp/mutant.py python3 .github/scripts/check-action-siblings-cases.py
"""

import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GUARD = os.environ.get(
    "CHECK_ACTION_SIBLINGS_BIN",
    os.path.join(ROOT, ".github", "scripts", "check-action-siblings.py"),
)

COMPOSITE = """\
name: 'ui-suite'
runs:
  using: composite
  steps:
    - name: Validate report-path
      shell: bash
      run: python3 "$GITHUB_ACTION_PATH/validate-report-path.py"
"""


def build(tmp, *, files=None, unstaged=None, intent_to_add=None, empty_actions=False):
    """A fixture repo.

    `files`         written and staged
    `unstaged`      written after the add, so present on disk and absent from git
    `intent_to_add` written, then registered with `git add -N` only
    """
    root = tempfile.mkdtemp(dir=tmp)

    def write(rel, text):
        path = os.path.join(root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)

    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    if not empty_actions:
        write("templates/actions/ui-suite/action.yml", COMPOSITE)
    for rel, text in (files or {}).items():
        write(rel, text)
    subprocess.run(["git", "add", "-A"], cwd=root, check=True)

    for rel, text in (unstaged or {}).items():
        write(rel, text)

    # Present on disk, and in `git ls-files` -- but staged against the EMPTY
    # blob, so its content is not in the tree that gets committed.
    for rel, text in (intent_to_add or {}).items():
        write(rel, text)
        subprocess.run(["git", "add", "-N", rel], cwd=root, check=True)
    return root


def run(root):
    proc = subprocess.run(
        [sys.executable, GUARD, root], capture_output=True, text=True,
    )
    return proc.returncode, proc.stdout + proc.stderr


def main():
    failures = []
    with tempfile.TemporaryDirectory() as tmp:
        cases = [
            # ── the shipped shape ────────────────────────────────────────────
            ("a composite whose files are all tracked — accepted",
             dict(files={"templates/actions/ui-suite/validate-report-path.py": "ok\n"}),
             0, "every one tracked"),

            # ── the defect this exists for (#325, #353) ─────────────────────
            # Present, working locally, and shipping to nobody.
            ("an untracked sibling — refused",
             dict(unstaged={"templates/actions/ui-suite/validate-report-path.py": "ok\n"}),
             1, "is not tracked"),

            # An untracked file NOTHING references is caught too. The derivation
            # this replaced could not see it, and a half-finished change is
            # exactly how one gets left behind.
            ("an untracked file nothing references — refused",
             dict(unstaged={"templates/actions/ui-suite/scratch.py": "ok\n"}),
             1, "is not tracked"),

            # Every action is in scope, not only the one with a reference.
            ("an untracked file in another action — refused",
             dict(unstaged={"templates/actions/secret-scan/helper.sh": "ok\n"}),
             1, "secret-scan/helper.sh"),

            # ── intent-to-add is in ls-files and still does not ship ────────
            ("a `git add -N` sibling — refused, and named as intent-to-add",
             dict(intent_to_add={"templates/actions/ui-suite/validate-report-path.py": "ok\n"}),
             1, "INTENT-TO-ADD"),

            # ── build artefacts are not the maintainer's mistake ────────────
            ("__pycache__ beside a validator is ignored",
             dict(files={"templates/actions/ui-suite/validate-report-path.py": "ok\n"},
                  unstaged={"templates/actions/ui-suite/__pycache__/x.pyc": "junk\n"}),
             0, "every one tracked"),

            # ── nothing to look at is not a pass ───────────────────────────
            ("no files under templates/actions — refused, never a vacuous pass",
             dict(empty_actions=True), 1, "holds no files"),

            # ── the verdict states its own limits ──────────────────────────
            # Two readings this green must not invite: that the carriers install
            # these files, and that a referenced-but-absent file would be caught.
            ("the passing verdict says it reads no run bodies",
             dict(files={"templates/actions/ui-suite/validate-report-path.py": "ok\n"}),
             0, "reads no `run:` bodies"),
            ("...and that a named-but-missing file is out of scope",
             dict(files={"templates/actions/ui-suite/validate-report-path.py": "ok\n"}),
             0, "names a file"),

            # ── the trade, pinned so it is visible rather than assumed ──────
            # The derivation caught a composite naming a file that does not
            # exist; the rule replacing it does not. If this case ever starts
            # FAILING, someone has added parsing back -- read the header first.
            ("a composite naming a file that does not exist — ACCEPTED (the trade)",
             dict(files={"templates/actions/ui-suite/action.yml":
                         COMPOSITE.replace("validate-report-path.py", "never-created.py")}),
             0, "every one tracked"),
        ]

        for label, kwargs, expected, needle in cases:
            root = build(tmp, **kwargs)
            code, out = run(root)
            if code != expected:
                failures.append(
                    f"{label}\n      expected exit {expected}; got {code}.\n      {out.strip()}"
                )
            elif needle not in out:
                failures.append(
                    f"{label}\n      exited {code} as expected, but for the wrong stated reason."
                    f"\n      expected the output to contain: {needle!r}\n      {out.strip()}"
                )
            else:
                print(f"OK:   {label} (exit {code})")

    # And it must still pass against the REAL repo. A suite that only ever sees
    # fixtures can be perfectly green while the shipped tree is broken.
    code, out = run(ROOT)
    if code != 0:
        failures.append(f"the live repo passes\n      expected exit 0; got {code}.\n      {out.strip()}")
    else:
        print("OK:   the live repo passes (exit 0)")

    if failures:
        print("\ncheck-action-siblings-cases: FAILED")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    print(f"\ncheck-action-siblings-cases: OK — {len(cases)} pinned trees read correctly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
