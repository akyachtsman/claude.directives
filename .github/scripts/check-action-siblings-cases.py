#!/usr/bin/env python3
r"""Guard the action-sibling guard: pinned trees, each exit and each diagnostic.

WHY THIS EXISTS. `check-action-siblings.py` passes against this repo today and
would pass just as quietly if its rules stopped working -- there is exactly ONE
sibling in the tree, so a guard that checked nothing at all prints the same OK.
That is the fail-open family (#323): a pass and a did-not-look are the same
output. Every case here is a tree the guard must REFUSE, plus the acceptances
that stop a refusal from being bought by over-tightening.

It runs the REAL guard against fixture repositories rather than re-implementing
its rules; a cases file holding a copy of the rules tests the copy.

The fixtures are real `git init` repositories because the guard asks git what is
TRACKED, not the filesystem what exists. That distinction is one of its claims,
so the fixture has to be able to express "the file is there but git does not
know about it" -- which a directory of loose files cannot.

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

# A composite whose first step runs a sibling -- the shape that motivated #353.
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

# Carrier form 1: name the file, source and destination, as the setup doc does.
# Split across physical lines on purpose -- rejoining continuations is one of the
# guard's claims, and a fixture that puts them on one line never tests it.
SETUP_DOC = """\
Copy the composite actions into `.github/actions/`:

```bash
curl -sL https://raw.githubusercontent.com/o/r/main/templates/actions/ui-suite/action.yml \\
  -o .github/actions/ui-suite/action.yml

curl -sL https://raw.githubusercontent.com/o/r/main/templates/actions/ui-suite/validate-report-path.py \\
  -o .github/actions/ui-suite/validate-report-path.py
```
"""

# Carrier form 2: take the directory wholesale, with `<a>` standing for any
# action -- the form the refresh row moved to in #347 round 35.
REFRESH_DOC = """\
| Source | Destination | Notes |
|---|---|---|
| `templates/actions/<a>/**` | `.github/actions/<a>/**` | Verbatim drop-ins — the whole directory, not just `action.yml`. |
"""


NEW_REPO_DOC = """\
Copy `templates/actions/<a>/**` into `.github/actions/<a>/**` — the whole
directory, not just `action.yml`.
"""


def build(tmp, *, composite=COMPOSITE, setup=SETUP_DOC, refresh=REFRESH_DOC,
          newrepo=NEW_REPO_DOC, sibling="ok\n", track_sibling=True, extra=None):
    """Write a fixture repo and return its path. `None` for a file omits it."""
    root = tempfile.mkdtemp(dir=tmp)
    def write(rel, text):
        path = os.path.join(root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)

    if composite is not None:
        write("templates/actions/ui-suite/action.yml", composite)
    if setup is not None:
        write("docs/standards/cicd-setup.md", setup)
    if refresh is not None:
        write("plugins/directives-toolkit/commands/refresh-repo.md", refresh)
    if newrepo is not None:
        write("plugins/directives-toolkit/commands/new-repo.md", newrepo)
    for rel, text in (extra or {}).items():
        write(rel, text)

    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    subprocess.run(["git", "add", "-A"], cwd=root, check=True)

    # The sibling is written AFTER the add when it must stay untracked, so the
    # fixture distinguishes "absent", "present and tracked", and the case this
    # guard exists for: "present, and git has never heard of it".
    if sibling is not None:
        write("templates/actions/ui-suite/validate-report-path.py", sibling)
        if track_sibling:
            subprocess.run(["git", "add", "-A"], cwd=root, check=True)
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
            # ── the shipped shape passes ──────────────────────────────────────
            ("both carriers install the sibling — accepted",
             dict(), 0, "each tracked and installed"),

            # ── #353's own defect, in each carrier ────────────────────────────
            # This is the state that shipped in round 35: the composite runs a
            # sibling and the carrier copies only action.yml. Every UI job in
            # every project following that carrier dies on its first step.
            ("the setup doc copies only action.yml — refused",
             dict(setup=SETUP_DOC.split("\ncurl -sL https://raw.githubusercontent.com/o/r/main/templates/actions/ui-suite/validate-report-path.py")[0] + "\n```\n"),
             1, "docs/standards/cicd-setup.md does not install"),
            ("the refresh row names action.yml instead of the directory — refused",
             dict(refresh=REFRESH_DOC.replace("/**", "/action.yml")),
             1, "refresh-repo.md does not install"),

            # ── half an install is not an install ─────────────────────────────
            # A source with no destination fetches nothing anybody can find; a
            # destination with no source is a path the carrier never fills.
            # Either half alone reads as a mention, and mention-for-use is the
            # defect #347 round 9 was about.
            ("the setup doc names the source but no destination — refused",
             dict(setup=SETUP_DOC.replace(
                 "  -o .github/actions/ui-suite/validate-report-path.py", "  -o /dev/null")),
             1, "does not install"),
            ("the setup doc names the destination but no source — refused",
             dict(setup=SETUP_DOC.replace(
                 "templates/actions/ui-suite/validate-report-path.py \\",
                 "templates/actions/ui-suite/SOMETHING-ELSE.py \\")),
             1, "does not install"),

            # ── the continuation join is load-bearing ────────────────────────
            # Source and destination in the same FILE but different commands is
            # not an install of this file. Without rejoining continuations the
            # guard cannot tell this from the real thing.
            ("source and destination in two unrelated commands — refused",
             dict(setup="```bash\ncurl -sL https://raw/o/r/templates/actions/ui-suite/validate-report-path.py -o /tmp/scratch\nrm -f .github/actions/ui-suite/validate-report-path.py\n```\n"),
             1, "does not install"),

            # ── tracked, not merely present (#325) ───────────────────────────
            ("the sibling exists but is untracked — refused",
             dict(track_sibling=False), 1, "is not tracked"),
            ("the sibling is missing entirely — refused",
             dict(sibling=None), 1, "is not tracked"),

            # ── a carrier that stopped carrying ──────────────────────────────
            # An empty carrier must not read as a clean one: with no mention of
            # the install directory at all there is nothing to fall behind, and
            # "nothing to check" is the shape of a pass that looked at nothing.
            ("a carrier no longer mentions .github/actions at all — refused",
             dict(setup="Install the workflows and you are done.\n"),
             1, "no longer mentions"),
            ("a carrier that cannot be read — refused",
             dict(setup=None), 1, "could not be read"),

            # ── the derivation must find the reference at all ────────────────
            # Reached only through a DERIVED reference: with no reference the
            # guard reports NOT EXERCISED and exits 0. An earlier version of this
            # case also emptied a carrier, and the empty-carrier problem is
            # appended independently of any reference — so it passed whether or
            # not the braced form was derived. It tested nothing.
            ("a braced ${GITHUB_ACTION_PATH} reference is still derived",
             dict(composite=COMPOSITE.replace(
                 '"$GITHUB_ACTION_PATH/validate-report-path.py"',
                 '"${GITHUB_ACTION_PATH}/validate-report-path.py"'),
                 sibling=None),
             1, "is not tracked"),

            # ── acceptances that stop over-tightening ────────────────────────
            # Round 35's fix used the wholesale form in one carrier and the named
            # form in the other. BOTH must keep passing, in EITHER carrier, or
            # the guard forces a rewrite of a carrier that is already correct --
            # the false-refusal shape that produced eight findings on #347.
            ("the setup doc taking the directory wholesale — accepted",
             dict(setup="Copy `templates/actions/<a>/**` to `.github/actions/<a>/**`.\n"),
             0, "each tracked and installed"),
            ("the refresh row naming the file explicitly — accepted",
             dict(refresh="Copy `templates/actions/ui-suite/validate-report-path.py` to `.github/actions/ui-suite/validate-report-path.py`.\n"),
             0, "each tracked and installed"),
            ("a wholesale row spelling out the action name — accepted",
             dict(refresh="| `templates/actions/ui-suite/**` | `.github/actions/ui-suite/**` |\n"),
             0, "each tracked and installed"),

            # ── a composite that references nothing ──────────────────────────
            # It must pass, and must SAY it checked nothing rather than implying
            # coverage it does not have.
            ("a composite with no sibling reference — accepted, and says so",
             dict(composite=PLAIN_COMPOSITE, sibling=None),
             0, "NOT EXERCISED"),

            # ── #354 round 1: seven findings, every one about MATCHING ───────
            # A path token ends where a filename character stops. A substring
            # test read a line naming `<file>.bak` as installing `<file>`, so a
            # carrier that copies a backup and nothing else passed.
            ("a carrier naming only a .bak of the sibling — refused",
             dict(setup=SETUP_DOC.replace("validate-report-path.py", "validate-report-path.py.bak")),
             1, "does not install"),

            # An install is ONE COMMAND. `curl <src> -o /tmp/x; rm -f <dst>` has
            # both halves on one logical line, and the only command naming the
            # destination deletes it.
            ("source and destination in two commands on one line — refused",
             dict(setup="```bash\ncurl https://x/templates/actions/ui-suite/validate-report-path.py -o /tmp/x; rm -f .github/actions/ui-suite/validate-report-path.py\n```\n"),
             1, "does not install"),

            # …but a `|` is NOT a command separator here: one carrier states its
            # installs as a markdown table, and splitting on the column
            # separator refused a carrier that was correct. This case is the
            # regression I introduced fixing the one above.
            ("a markdown table row is one install, not two commands — accepted",
             dict(refresh="| `templates/actions/<a>/**` | `.github/actions/<a>/**` | notes |\n"),
             0, "each tracked and installed"),

            # A whole-directory copy is recognised by WHAT IT NAMES, not by the
            # command. Requiring the documentation's `/**` refused `cp -R`,
            # which copies every sibling — a text form standing in for the
            # construct, the shape of every false refusal in this family.
            ("a recursive cp of the action directory — accepted",
             dict(setup="```bash\ncp -R templates/actions/ui-suite/. .github/actions/ui-suite/\n```\n"),
             0, "each tracked and installed"),
            ("an rsync of the action directory — accepted",
             dict(setup="```bash\nrsync -a templates/actions/ui-suite/ .github/actions/ui-suite/\n```\n"),
             0, "each tracked and installed"),

            # The context form means the same thing as the environment variable.
            # Deriving only the latter left a sibling referenced this way absent
            # from git and every carrier, with the guard exiting 0.
            ("a ${{ github.action_path }} reference is derived too",
             dict(composite=COMPOSITE.replace(
                 '"$GITHUB_ACTION_PATH/validate-report-path.py"',
                 '"${{ github.action_path }}/validate-report-path.py"'),
                 sibling=None),
             1, "is not tracked"),

            # GitHub accepts action.yaml; filtering to action.yml skipped such a
            # composite, and because another action.yml existed the empty-set
            # refusal did not fire either.
            ("an action.yaml manifest is read like an action.yml",
             dict(composite=None, sibling=None,
                  extra={"templates/actions/other/action.yaml": COMPOSITE}),
             1, "is not tracked"),

            # References come from what the action RUNS. Scanning raw text made
            # an obsolete example in a comment into a required sibling, failing
            # the gate over a file the composite never runs.
            ("a stale example in a comment is not a reference",
             dict(composite=COMPOSITE + "\n# once ran $GITHUB_ACTION_PATH/removed.py\n"),
             0, "each tracked and installed"),
            ("a manifest that is not YAML — refused, never OK",
             dict(composite="runs: [this: is: not: yaml\n"),
             1, "not readable as YAML"),

            # The third carrier. /new-repo bootstraps projects independently, so
            # a regression there ships every NEW project a broken composite
            # while the other two carriers stay correct.
            ("the new-repo carrier naming only action.yml — refused",
             dict(newrepo="Copy `templates/actions/<a>/action.yml` to `.github/actions/<a>/action.yml`.\n"),
             1, "new-repo.md does not install"),

            # ── nothing to check at all is not a pass ────────────────────────
            ("no composite is tracked — refused",
             dict(composite=None, sibling=None), 1, "no templates/actions"),
        ]

        passed = 0
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
                passed += 1
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
