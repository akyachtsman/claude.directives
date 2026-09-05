#!/usr/bin/env python3
r"""Guard the action-sibling guard: pinned trees, each exit and each diagnostic.

WHY THIS EXISTS. `check-action-siblings.py` passes against this repo today and
would pass just as quietly if its rules stopped working -- there is exactly ONE
such sibling in the tree, so a guard that checked nothing at all prints the same
OK. That is the fail-open family (#323): a pass and a did-not-look are the same
output.

It runs the REAL guard against fixture repositories rather than re-implementing
its rules; a cases file holding a copy of the rules tests the copy.

The fixtures are real `git init` repositories because the guard asks git what is
TRACKED, not the filesystem what exists. That distinction is one of its two
claims, and a directory of loose files cannot express "the file is there and git
has never heard of it".

The carrier-matching cases that used to live here went with the code they
pinned -- see the guard's header for why that half was removed rather than fixed
a third time.

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

# A composite that runs a sibling -- the shape that motivated #353. (In the real
# ui-suite this is step 6 of 11, not the first; the fixture is minimal, not a
# claim about ordering.)
COMPOSITE = """\
name: 'ui-suite'
runs:
  using: composite
  steps:
    - name: Validate report-path
      shell: bash
      run: python3 "$GITHUB_ACTION_PATH/validate-report-path.py"
"""

# A composite referencing nothing -- `secret-scan` is this shape today.
PLAIN_COMPOSITE = """\
name: 'secret-scan'
runs:
  using: composite
  steps:
    - name: Scan
      shell: bash
      run: echo scanning
"""


def build(tmp, *, composite=COMPOSITE, sibling="ok\n", track_sibling=True, extra=None,
          worktree_composite=None):
    """Write a fixture repo and return its path. `None` for a file omits it."""
    root = tempfile.mkdtemp(dir=tmp)

    def write(rel, text):
        path = os.path.join(root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)

    if composite is not None:
        write("templates/actions/ui-suite/action.yml", composite)
    for rel, text in (extra or {}).items():
        write(rel, text)

    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    subprocess.run(["git", "add", "-A"], cwd=root, check=True)

    # Written AFTER the add when it must stay untracked, so the fixture
    # distinguishes "absent", "present and tracked", and the case this guard
    # exists for: "present, and git has never heard of it".
    if sibling is not None:
        write("templates/actions/ui-suite/validate-report-path.py", sibling)
        if track_sibling:
            subprocess.run(["git", "add", "-A"], cwd=root, check=True)
    # Written after the last `git add`, so the INDEX and the WORKING TREE hold
    # different manifests -- the only way to tell which one the guard reads.
    if worktree_composite is not None:
        write("templates/actions/ui-suite/action.yml", worktree_composite)
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
            # ── the shipped shape passes ─────────────────────────────────────
            ("the sibling is tracked — accepted", dict(), 0, "each tracked"),

            # ── tracked, not merely present (#325) ──────────────────────────
            # The whole point. An untracked file passes `os.path.exists` on the
            # machine that wrote it and reaches no downstream project.
            ("the sibling exists but is untracked — refused",
             dict(track_sibling=False), 1, "is not tracked"),
            ("the sibling is missing entirely — refused",
             dict(sibling=None), 1, "is not tracked"),

            # ── the reference set must be DERIVED, in every spelling ────────
            ("a braced ${GITHUB_ACTION_PATH} reference is derived",
             dict(composite=COMPOSITE.replace(
                 '"$GITHUB_ACTION_PATH/validate-report-path.py"',
                 '"${GITHUB_ACTION_PATH}/validate-report-path.py"'),
                 sibling=None),
             1, "is not tracked"),
            ("a ${{ github.action_path }} reference is derived",
             dict(composite=COMPOSITE.replace(
                 '"$GITHUB_ACTION_PATH/validate-report-path.py"',
                 '"${{ github.action_path }}/validate-report-path.py"'),
                 sibling=None),
             1, "is not tracked"),
            # `"$GITHUB_ACTION_PATH"/helper.py` is valid shell: the quote closes
            # before the slash. The first regex missed it entirely (Codex, #354).
            ("a quote-separated reference is derived",
             dict(composite=COMPOSITE.replace(
                 '"$GITHUB_ACTION_PATH/validate-report-path.py"',
                 '"$GITHUB_ACTION_PATH"/validate-report-path.py'),
                 sibling=None),
             1, "is not tracked"),
            # A step can bind the path in `env` and run `"$HELPER"`. Narrowing
            # the scan to `run:` alone made that dependency invisible (#354).
            ("a reference bound through step env is derived",
             dict(composite="""\
name: 'ui-suite'
runs:
  using: composite
  steps:
    - name: Validate report-path
      shell: bash
      env:
        HELPER: "${{ github.action_path }}/validate-report-path.py"
      run: python3 "$HELPER"
""", sibling=None),
             1, "is not tracked"),

            # ── both manifest spellings ─────────────────────────────────────
            ("an action.yaml manifest is read like an action.yml",
             dict(composite=None, sibling=None,
                  extra={"templates/actions/other/action.yaml": COMPOSITE}),
             1, "is not tracked"),

            # ── text that is not executed is not a reference ────────────────
            ("a stale example in a comment is not a reference",
             dict(composite=COMPOSITE + "\n# once ran $GITHUB_ACTION_PATH/removed.py\n"),
             0, "each tracked"),
            ("a manifest that is not YAML — refused, never OK",
             dict(composite="runs: [this: is: not: yaml\n"),
             1, "not readable as YAML"),

            # ── #354 round 3: six more, four of them pre-existing ───────────
            # `>` ends a filename. `helper.py>out` is a file that cannot exist,
            # so the gate refused a composite whose helper WAS tracked.
            ("a no-space redirection does not become part of the filename",
             dict(composite=COMPOSITE.replace(
                 'python3 "$GITHUB_ACTION_PATH/validate-report-path.py"',
                 'python3 $GITHUB_ACTION_PATH/validate-report-path.py>out')),
             0, "each tracked"),

            # A binding can hold the DIRECTORY, not the whole path. Scanning the
            # two strings independently finds a complete reference in neither.
            ("a directory-valued env binding is joined with its use",
             dict(composite="""\
name: 'ui-suite'
runs:
  using: composite
  steps:
    - name: Validate report-path
      shell: bash
      env:
        ACTION_DIR: "${{ github.action_path }}"
      run: python3 "$ACTION_DIR/validate-report-path.py"
""", sibling=None),
             1, "is not tracked"),

            # A comment inside a `run: |` block survives YAML parsing, and the
            # shell never evaluates it.
            ("a stale example in a SHELL comment is not a reference",
             dict(composite="""\
name: 'ui-suite'
runs:
  using: composite
  steps:
    - name: Validate report-path
      shell: bash
      run: |
        # once ran $GITHUB_ACTION_PATH/removed.py
        python3 "$GITHUB_ACTION_PATH/validate-report-path.py"
"""),
             0, "each tracked"),

            # A shell this file cannot parse must REFUSE, not report
            # NOT EXERCISED — a pass for a shape it cannot see is fail-open.
            ("a pwsh step refuses rather than passing unread",
             dict(composite="""\
name: 'ui-suite'
runs:
  using: composite
  steps:
    - name: Validate report-path
      shell: pwsh
      run: python3 "$env:GITHUB_ACTION_PATH\\helper.ps1"
""", sibling=None),
             1, "cannot read"),

            # THE INDEX, NOT THE WORKING TREE. The staged manifest references
            # `missing.py`; an unstaged edit removes that reference. Reading the
            # working tree finds no reference and exits 0 NOT EXERCISED, so the
            # dangling staged manifest commits clean. Reading the index refuses.
            # (The first version of this case set no worktree copy at all and so
            # could not tell the two readings apart — it passed either way.)
            ("the manifest is read from the index, not the working tree",
             dict(composite=COMPOSITE.replace(
                      'validate-report-path.py"', 'missing.py"'),
                  sibling=None,
                  worktree_composite=PLAIN_COMPOSITE),
             1, "is not tracked"),

            # git C-quotes non-ASCII paths by default, so a tracked `café.py`
            # came back as `"caf\303\251.py"` and never matched the name derived
            # from the manifest — a refusal for a file that IS tracked.
            ("a non-ASCII sibling name is matched, not mangled by git quoting",
             dict(composite=COMPOSITE.replace(
                      "validate-report-path.py", "caf\u00e9.py"),
                  sibling=None,
                  extra={"templates/actions/ui-suite/caf\u00e9.py": "ok\n"}),
             0, "each tracked"),

            # ── honest about what was not exercised ─────────────────────────
            ("a composite with no sibling reference — accepted, and says so",
             dict(composite=PLAIN_COMPOSITE, sibling=None), 0, "NOT EXERCISED"),
            ("no composite is tracked — refused, never a vacuous pass",
             dict(composite=None, sibling=None), 1, "no templates/actions"),

            # ── the verdict states its own limit ────────────────────────────
            # A reader who takes this green as "the carriers install it" has been
            # misled, and that reading is exactly what the removed half invited.
            ("the passing verdict says carrier installs are NOT checked",
             dict(), 0, "Whether a carrier INSTALLS them is not checked"),
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
