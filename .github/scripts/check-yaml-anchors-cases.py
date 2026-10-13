#!/usr/bin/env python3
"""Pinned cases for check-yaml-anchors.py and the gh_yaml.py rules it applies.

WHY THIS EXISTS. Nothing in this repo uses an anchor in an action.yml or a merge
key anywhere, so the guard prints the same OK whether its rules work or do
nothing at all: a pass and a did-not-look are the same output (#323). Each case
hands the REAL guard a small tree, breaks one thing, and requires the exit code
AND the stated reason. Every refusal has an accepting twin: an `&`, `*` or `<<`
that is content (a quoted string, a block scalar, a value) must pass, and so
must a workflow anchor, which GitHub allows. A rule bought by refusing every
`&` would red-build every project that copies the guard.

The API cases import the gh_yaml.py BESIDE the guard under test, so a mutant
directory holding an older gh_yaml.py is tested as a whole.

Re-prove discrimination with a mutant (a guard, with its gh_yaml.py beside it):

    CHECK_YAML_ANCHORS_BIN=/tmp/mutant/check-yaml-anchors.py python3 .github/scripts/check-yaml-anchors-cases.py

Run: python3 .github/scripts/check-yaml-anchors-cases.py
"""

# Before any import: running the gate must leave no __pycache__/ beside the
# local modules it imports (cases_lib.py and/or templates/scripts/gh_yaml.py).
import sys
sys.dont_write_bytecode = True

import os
import tempfile

from cases_lib import Cases, bin_path, bytecode_case, run, write_tree

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# The shipped copy, run where it lives (no .github/scripts twin).
GUARD = bin_path("CHECK_YAML_ANCHORS_BIN",
                 os.path.join(ROOT, "templates", "scripts", "check-yaml-anchors.py"))

WORKFLOW = "name: t\non: push\njobs:\n  a:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: echo hi\n"
ACTION = ("name: a\nruns:\n  using: composite\n  steps:\n"
          "    - shell: bash\n      run: echo hi\n")

# A workflow with an anchor and its alias: GitHub accepts it.
ANCHORED_WORKFLOW = ("name: t\non: push\njobs:\n"
                     "  a: &job\n    runs-on: ubuntu-24.04\n    steps:\n      - run: echo hi\n"
                     "  b: *job\n")
# The anchor sits on a step's env, the shape the ui-suite composite would use.
ANCHORED_ACTION = ("name: a\nruns:\n  using: composite\n  steps:\n"
                   "    - shell: bash\n      env: &env\n        A: '1'\n      run: echo one\n"
                   "    - shell: bash\n      env: *env\n      run: echo two\n")
# An alias whose anchor is absent: on a valid file the anchor before an alias
# is refused first, so this is the one way to reach the alias rule itself.
ALIAS_ACTION = ("name: a\nruns:\n  using: composite\n  steps:\n"
                "    - shell: bash\n      env: *env\n      run: echo hi\n")
MERGE_WORKFLOW = ("name: t\non: push\nenv: &base\n  A: '1'\njobs:\n  a:\n    runs-on: ubuntu-24.04\n"
                  "    env:\n      <<: *base\n      B: '2'\n    steps:\n      - run: echo hi\n")
TAGGED_MERGE_WORKFLOW = ("name: t\non: push\njobs:\n  a:\n    runs-on: ubuntu-24.04\n"
                         "    env:\n      !!merge x: {A: '1'}\n    steps:\n      - run: echo hi\n")
# A merge key with no anchor anywhere, so only the merge rule can catch it.
MERGE_ACTION = ("name: a\nruns:\n  using: composite\n  steps:\n"
                "    - shell: bash\n      env:\n        <<: {A: '1'}\n      run: echo hi\n")
# `&`, `*` and `<<` as CONTENT: quoted, in a block scalar, in a plain value.
QUOTED_ACTION = ("name: 'a &b *c'\ndescription: \"&anchor and *alias and <<: here\"\n"
                 "runs:\n  using: composite\n  steps:\n"
                 "    - shell: bash\n      run: echo 'a &b *c'\n")
BLOCK_ACTION = ("name: a\nruns:\n  using: composite\n  steps:\n"
                "    - shell: bash\n      run: |\n        sleep 1 &\n        ls *.txt\n"
                "        cat <<EOF\n        x: &y\n        <<: *y\n        EOF\n"
                "    - shell: bash\n      run: cat <<EOF\n")


def guard(tmp, files, *flags):
    root = tempfile.mkdtemp(dir=tmp)
    write_tree(root, files)
    return run([sys.executable, GUARD, root, *flags])


def api(snippet):
    """Run `snippet` against the gh_yaml.py beside the guard under test."""
    prelude = (f"import sys; sys.dont_write_bytecode = True; "
               f"sys.path.insert(0, {os.path.dirname(str(GUARD))!r}); "
               "import yaml, gh_yaml\n")
    return run([sys.executable, "-c", prelude + snippet])


CASES = [
    # ── rule 1: an action.yml carries no anchor, alias or merge key ─────────
    ("an anchor in an action.yml — refused",
     {".github/workflows/qa.yml": WORKFLOW, ".github/actions/x/action.yml": ANCHORED_ACTION},
     (), 1, "found the anchor &env"),
    ("...and the refusal names the file, line and column",
     {".github/workflows/qa.yml": WORKFLOW, ".github/actions/x/action.yml": ANCHORED_ACTION},
     (), 1, ".github/actions/x/action.yml, line 6, column 12:"),
    ("an alias in an action.yml — refused as an alias",
     {".github/workflows/qa.yml": WORKFLOW, ".github/actions/x/action.yml": ALIAS_ACTION},
     (), 1, "found the alias *env"),
    ("a merge key in an action.yml, no anchor anywhere — refused",
     {".github/workflows/qa.yml": WORKFLOW, ".github/actions/x/action.yml": MERGE_ACTION},
     (), 1, "found a merge key (<<)"),
    ("an action.yaml, nested two deep — found and refused",
     {".github/workflows/qa.yml": WORKFLOW, ".github/actions/group/x/action.yaml": ANCHORED_ACTION},
     (), 1, ".github/actions/group/x/action.yaml, line 6"),
    # The twins: content is not a construct.
    ("`&`, `*` and `<<` inside quoted strings in an action.yml — accepted",
     {".github/workflows/qa.yml": WORKFLOW, ".github/actions/x/action.yml": QUOTED_ACTION},
     (), 0, "1 action file(s)"),
    ("`&`, `*` and `<<` in a block scalar and a plain value — accepted",
     {".github/workflows/qa.yml": WORKFLOW, ".github/actions/x/action.yml": BLOCK_ACTION},
     (), 0, "1 action file(s)"),
    # GitHub reads a manifest only where a step points; a vendored dependency's
    # action.yml under node_modules is not one.
    ("an anchored action.yml under node_modules — not scanned",
     {".github/workflows/qa.yml": WORKFLOW,
      ".github/actions/x/action.yml": ACTION,
      ".github/actions/x/node_modules/dep/action.yml": ANCHORED_ACTION},
     (), 0, "1 action file(s)"),

    # ── rule 2: a workflow carries no merge key; anchors are GitHub's to allow ──
    ("a merge key in a workflow — refused",
     {".github/workflows/qa.yml": MERGE_WORKFLOW},
     (), 1, "qa.yml, line 9, column 7: found a merge key (<<)"),
    ("a `!!merge`-tagged key in a workflow — refused",
     {".github/workflows/qa.yml": TAGGED_MERGE_WORKFLOW},
     (), 1, "found a merge key (!!merge x)"),
    ("an anchor and alias in a workflow — accepted (GitHub allows them)",
     {".github/workflows/qa.yml": ANCHORED_WORKFLOW},
     (), 0, "1 workflow file(s) carry no merge key"),

    # ── fail closed ─────────────────────────────────────────────────────────
    ("an action.yml that does not parse — refused, never counted clean",
     {".github/workflows/qa.yml": WORKFLOW, ".github/actions/x/action.yml": "name: [unclosed\n"},
     (), 1, "cannot be read as YAML, so it was never checked"),
    ("no .github/workflows — refused, never a vacuous pass",
     {".github/actions/x/action.yml": ACTION},
     (), 1, ".github/workflows/ does not exist"),
    ("no .github/actions — accepted: a project may have none",
     {".github/workflows/qa.yml": WORKFLOW},
     (), 0, "0 action file(s)"),

    # ── --include-templates: this repo's flag, and only this repo's ─────────
    ("an anchor in templates/actions with --include-templates — refused",
     {".github/workflows/qa.yml": WORKFLOW,
      "templates/workflows/qa.yml": ANCHORED_WORKFLOW,
      "templates/actions/x/action.yml": ANCHORED_ACTION},
     ("--include-templates",), 1, "templates/actions/x/action.yml, line 6"),
    ("a merge key in templates/workflows with --include-templates — refused",
     {".github/workflows/qa.yml": WORKFLOW,
      "templates/workflows/qa.yml": MERGE_WORKFLOW,
      "templates/actions/x/action.yml": ACTION},
     ("--include-templates",), 1, "templates/workflows/qa.yml, line 9"),
    ("...and without the flag templates/ is not read (the downstream shape)",
     {".github/workflows/qa.yml": WORKFLOW,
      "templates/workflows/qa.yml": MERGE_WORKFLOW,
      "templates/actions/x/action.yml": ANCHORED_ACTION},
     (), 0, "(scanned .github/workflows)"),
    ("--include-templates with no action under templates/actions — refused",
     {".github/workflows/qa.yml": WORKFLOW, "templates/workflows/qa.yml": WORKFLOW,
      "templates/actions/x/README.md": "no action here\n"},
     ("--include-templates",), 1, "templates/actions/ holds no action files"),
    ("an unknown flag — refused, not ignored",
     {".github/workflows/qa.yml": WORKFLOW},
     ("--include-template",), 2, "unknown arguments"),
]

# gh_yaml's API, which every guard reading YAML shares. Each prints OK.
API_CASES = [
    # Backward compatible: a caller written before allow_anchors existed still
    # reads a workflow's anchors.
    ("gh_yaml.load() still accepts anchors and aliases by default",
     "assert gh_yaml.load('a: &x [1]\\nb: *x\\n') == {'a': [1], 'b': [1]}; print('OK')"),
    ("gh_yaml.compose() refuses a merge key, as load() does",
     "try:\n    gh_yaml.compose('a: &x {k: 1}\\nb:\\n  <<: *x\\n')\nexcept gh_yaml.Refused as e:\n"
     "    print('OK', e.problem)\nelse:\n    print('ACCEPTED')"),
    ("gh_yaml.compose(allow_anchors=False) refuses an anchor",
     "try:\n    gh_yaml.compose('a: &x 1\\n', allow_anchors=False)\nexcept gh_yaml.Refused as e:\n"
     "    print('OK', e.problem)\nelse:\n    print('ACCEPTED')"),
    # So every existing `except yaml.YAMLError` in the guards already fails closed.
    ("gh_yaml.Refused is a yaml.YAMLError",
     "assert issubclass(gh_yaml.Refused, yaml.YAMLError); print('OK')"),
    ("a quoted '<<' key is a string, not a merge key",
     "assert gh_yaml.load('a:\\n  \"<<\": 1\\n') == {'a': {'<<': 1}}; print('OK')"),
]


def main():
    c = Cases("check-yaml-anchors-cases")
    with tempfile.TemporaryDirectory() as tmp:
        for label, files, flags, expected, needle in CASES:
            c.expect(label, *guard(tmp, files, *flags), expected, needle)
    for label, snippet in API_CASES:
        c.expect(label, *api(snippet), 0, "OK")
    # A suite that only ever sees fixtures can be green while the shipped tree
    # is broken.
    c.expect("the live repo passes, templates included",
             *run([sys.executable, GUARD, ROOT, "--include-templates"]), 0, "check-yaml-anchors:")
    # A guard run must leave no __pycache__/ in the project it checks: downstream
    # does not gitignore it, so `git add -A` after the gate committed it
    # (claude.prop, 2026-10-13). The guard sets sys.dont_write_bytecode.
    bytecode_case(c, "an installed run leaves no __pycache__ beside gh_yaml.py", GUARD,
                  {".github/workflows/qa.yml": WORKFLOW}, ["{root}"])
    return c.finish(f"{len(CASES) + 2} pinned trees and {len(API_CASES)} API cases read correctly.")


if __name__ == "__main__":
    sys.exit(main())
