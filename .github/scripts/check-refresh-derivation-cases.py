#!/usr/bin/env python3
r"""Guard check-refresh-derivation.py — the guard on /refresh-repo's derivation.

WHY THIS EXISTS. check-refresh-derivation.py makes three checks, and TWO OF THEM
ARE NEVER EXERCISED BY THIS REPO. Every shipped caller ends in a newline, so the
concatenation check has nothing to bite on; every shipped caller is matched by
the current pattern, so the per-caller check never has a miss to report. The
guard says so on its own success line -- "concatenation: NOT EXERCISED" -- but a
check that only ever runs against inputs it passes is an assertion, not a test.
It could be deleted, or silently broken, and CI would not notice.

So each case here builds a synthetic repo in a temp directory: a refresh-repo.md
carrying a chosen derivation pipeline, plus caller YAML of a chosen shape, and
runs the REAL guard against it as a subprocess. The guard resolves COMMAND and
CALLER_GLOBS relative to cwd and has no importable surface, so the CLI contract
in a temp cwd is the only honest way to drive it -- and it is also the contract
qa.yml uses.

A case asserts BOTH the exit code and a needle from the diagnostic. Exit code
alone is not enough: this suite's own development produced two runs that exited
non-zero for reasons the case was not about -- a fixture whose mutation never
applied (a quoting mismatch, so the "mutated" pipeline was the original), and a
subshell that resolved the guard's path wrongly and reported the interpreter's
exit 2 as a refusal. A traceback is therefore rejected outright: a crash is not
a catch.

MEASURED 2026-09-01. Four mutations applied to the guard via
CHECK_REFRESH_DERIVATION_BIN, and the cases that reddened for each:

    A  per-caller loop neutered (the pre-review aggregate logic)
       -> "the old command-prefixed form is refused"
       -> "a miss in one caller is NOT masked by a match in another"
    B  run_grep stops treating grep's stderr as fatal
       -> "a Python-only construct grep cannot honour is refused"
    C  concatenation check neutered (`ragged = []`)
       -> "an UNDELIMITED loop that loses a script is refused"
       -> "…and the delimiter fixes exactly that case"
       -> "a ragged caller whose tail is not a path must NOT false-alarm"
    D  off-contract extras demoted back to a printed note
       -> "an unterminated extension filter is refused (.json)"
    E  TRUTH_RE reverted to slash-blind (the #345 round-2 bug itself)
       -> "a nested script is found, not truncated to its directory"
       -> "a SLASH-FREE pattern cannot reach a nested script and is refused"

C is worth reading twice. It reddens a MUST-NOT-FAIL case, and that is the point:
with nothing ragged the guard prints "NOT EXERCISED" instead of the checked-clean
line, so the needle catches a check that stopped looking while still exiting 0.
An exit-code-only assertion would have called that mutant caught by two cases and
missed entirely by the third.

E is here because the case that should have caught it WAS decorative. The green
control was "a widened char class is a widening, not a break", and it passed
against a fixture containing no nested path -- so it exercised the widening in
name only, and the guard's slash-blind ground truth truncated any real nested
match to its directory and then rejected it as off-contract. Codex found it on
round 2. It is replaced by three cases that carry an actual nested path, in both
pattern shapes, plus a bare-directory reference that must not false-alarm.

That is the second decorative case in two PRs (#344 had one too), and both were
found the same way: by running the case against a mutant instead of trusting a
green line. A case built from a fixture that cannot express the condition it
names will pass forever.
"""

import os
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

# Points the suite at a MUTATED copy of the guard, so "these cases discriminate"
# is re-provable rather than a claim made once in a commit message. Same
# mechanism as CHECK_CLAIMS_BIN (#344).
GUARD = Path(
    os.environ.get("CHECK_REFRESH_DERIVATION_BIN")
    or Path(__file__).resolve().parent / "check-refresh-derivation.py"
).resolve()

BARE = r"\.github/scripts/[A-Za-z0-9_.-]+"
PREFIXED = r"(node|python3) \.github/scripts/[A-Za-z0-9_.-]+"
SLASHED = r"\.github/scripts/[A-Za-z0-9_./-]+"      # the shipped shape
SLASHFREE = r"\.github/scripts/[A-Za-z0-9_.-]+"      # pre-#345-round-2
EXT = r"\.(js|py)$"
EXT_LOOSE = r"\.(js|py)"
EXT_PY_ONLY = r"\.(?:js|py)$"

DELIM = """  printf '\\n' >>"$buf" """.rstrip()


def command_md(token=SLASHED, ext=EXT, delimited=True, token_line=True, ext_line=True):
    """Build a refresh-repo.md carrying the chosen pipeline."""
    pipe = "refs=$("
    pipe += f"grep -oE '{token}' \"$buf\"" if token_line else "rg -o 'whatever' \"$buf\""
    if ext_line:
        pipe += f" \\\n       | grep -E '{ext}'"
    pipe += " | sort -u)"
    return (
        "```bash\n"
        "for c in $callers; do\n"
        '  curl -fsSL "$raw/$c" >>"$buf"\n'
        + (DELIM + "\n" if delimited else "")
        + "done\n"
        + pipe + "\n"
        "```\n"
    )


def build(tmp, command_text, callers):
    root = Path(tmp)
    cmd = root / "plugins/directives-toolkit/commands/refresh-repo.md"
    cmd.parent.mkdir(parents=True, exist_ok=True)
    if command_text is not None:
        cmd.write_text(command_text, encoding="utf-8")
    for rel, body in callers.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body, encoding="utf-8")
    return root


def run(root):
    p = subprocess.run([sys.executable, str(GUARD)], cwd=root, capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


PASS, FAIL = [], []


def case(name, *, command_text, callers, expect_exit, needle):
    with TemporaryDirectory() as tmp:
        root = build(tmp, command_text, callers)
        rc, out = run(root)
    problems = []
    if "Traceback (most recent call last)" in out:
        problems.append("the guard CRASHED — a traceback is not a catch, so this proves nothing")
    if rc != expect_exit:
        problems.append(f"expected exit {expect_exit}, got {rc}")
    if needle and needle not in out:
        problems.append(f"expected {needle!r} in the output")
    if problems:
        FAIL.append((name, problems, out))
        print(f"FAIL: {name} (exit {rc})")
        for pr in problems:
            print(f"        {pr}")
        for line in out.strip().splitlines()[:6]:
            print(f"      | {line}")
    else:
        PASS.append(name)
        print(f"OK:   {name} (exit {rc})")


# A pair of well-formed callers, both ending in a newline.
GOOD = {
    "templates/workflows/one.yml": "steps:\n  - run: node .github/scripts/a.js\n",
    "templates/actions/x/action.yml":
        'runs:\n  - run: node "$GITHUB_WORKSPACE/.github/scripts/b.py"\n',
}
# The action references a script the PREFIXED pattern cannot see, while the
# workflow references the SAME script in a form it can. An aggregated check
# passes this; a per-caller check must not.
MASKING = {
    "templates/workflows/one.yml": "steps:\n  - run: node .github/scripts/shared.py\n",
    "templates/actions/x/action.yml":
        'runs:\n  - run: node "$GITHUB_WORKSPACE/.github/scripts/shared.py"\n',
}
# The workflow has NO trailing newline and ends on a script path. Sorted last,
# so a single arbitrary-order concatenation would put nothing after it and miss
# the hazard entirely — which an earlier draft of the guard did.
RAGGED = {
    "templates/workflows/one.yml": "steps:\n  - run: node .github/scripts/a.js",
    "templates/actions/x/action.yml": "runs:\n  - run: python3 .github/scripts/b.py\n",
}
# A script one directory down — `templates/ui-tests/` installs to
# `.github/scripts/ui-tests/`, so this shape is a reference waiting to happen.
NESTED = {
    "templates/workflows/one.yml": "steps:\n  - run: node .github/scripts/a.js\n",
    "templates/actions/x/action.yml": "runs:\n  - run: python3 .github/scripts/nested/a.py\n",
}
# A bare DIRECTORY reference, as templates/workflows/qa.yml really carries. It is
# not a script and must not be reported as missing or off-contract.
DIRREF = {
    "templates/workflows/one.yml":
        "steps:\n  - run: cp -r kit .github/scripts/ui-tests/\n"
        "  - run: node .github/scripts/a.js\n",
    "templates/actions/x/action.yml": "runs:\n  - run: python3 .github/scripts/b.py\n",
}
# Ragged too, but the dangling token is not a script path, so nothing can be lost.
RAGGED_SAFE = {
    "templates/workflows/one.yml": "steps:\n  - run: node .github/scripts/a.js\n  name: tail",
    "templates/actions/x/action.yml": "runs:\n  - run: python3 .github/scripts/b.py\n",
}

case("the shipped shape passes",
     command_text=command_md(), callers=GOOD, expect_exit=0,
     needle="referenced script(s)")

case("the old command-prefixed form is refused",
     command_text=command_md(token=PREFIXED), callers=GOOD, expect_exit=1,
     needle="MISSED: .github/scripts/b.py")

case("a miss in one caller is NOT masked by a match in another",
     command_text=command_md(token=PREFIXED), callers=MASKING, expect_exit=1,
     needle="referenced by templates/actions/x/action.yml")

case("an unterminated extension filter is refused (.json)",
     command_text=command_md(ext=EXT_LOOSE),
     callers={**GOOD, "templates/workflows/two.yml":
              "steps:\n  - run: cat .github/scripts/package-lock.json\n"},
     expect_exit=1, needle="OFF-CONTRACT: .github/scripts/package-lock.json")

case("a Python-only construct grep cannot honour is refused",
     command_text=command_md(ext=EXT_PY_ONLY), callers=GOOD, expect_exit=1,
     needle="not usable by the engine that RUNS it")

case("an UNDELIMITED loop that loses a script is refused",
     command_text=command_md(delimited=False), callers=RAGGED, expect_exit=1,
     needle="LOST: .github/scripts/a.js")

case("…and the delimiter fixes exactly that case",
     command_text=command_md(delimited=True), callers=RAGGED, expect_exit=0,
     needle="lack a trailing newline")

case("a nested script is found, not truncated to its directory",
     command_text=command_md(), callers=NESTED, expect_exit=0,
     needle=".github/scripts/nested/a.py")

case("a SLASH-FREE pattern cannot reach a nested script and is refused",
     command_text=command_md(token=SLASHFREE), callers=NESTED, expect_exit=1,
     needle="MISSED: .github/scripts/nested/a.py")

case("a bare directory reference is neither missing nor off-contract",
     command_text=command_md(), callers=DIRREF, expect_exit=0,
     needle="referenced script(s)")

case("a ragged caller whose tail is not a path must NOT false-alarm",
     command_text=command_md(delimited=False), callers=RAGGED_SAFE, expect_exit=0,
     needle="lack a trailing newline")

case("callers that all end in a newline are reported as NOT EXERCISED",
     command_text=command_md(), callers=GOOD, expect_exit=0,
     needle="NOT EXERCISED")

case("a missing command file is refused, not skipped",
     command_text=None, callers=GOOD, expect_exit=1,
     needle="not found")

case("a reshaped pipeline the extractor cannot read is refused",
     command_text=command_md(token_line=False), callers=GOOD, expect_exit=1,
     needle="could not find the derivation's")

case("a pipeline with no extension filter is refused",
     command_text=command_md(ext_line=False), callers=GOOD, expect_exit=1,
     needle="not the `grep -E")

case("no callers at all is refused, never a vacuous pass",
     command_text=command_md(), callers={}, expect_exit=1,
     needle="pass vacuously")

print()
if FAIL:
    print(f"check-refresh-derivation-cases: FAIL — {len(FAIL)} of {len(PASS) + len(FAIL)} case(s) failed")
    sys.exit(1)
print(f"check-refresh-derivation-cases: OK — {len(PASS)} pinned derivation shapes read correctly.")
