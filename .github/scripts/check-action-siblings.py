#!/usr/bin/env python3
r"""Guard: a composite's $GITHUB_ACTION_PATH siblings must ship with it.

WHY IT EXISTS (#353, from #347 round 35). `ui-suite/action.yml` opens with

    run: python3 "$GITHUB_ACTION_PATH/validate-report-path.py"

and BOTH documented install carriers copied only `action.yml`. Every project
installing or refreshing the composite got a directory holding the YAML alone,
so every UI job would die on its FIRST step with a missing-file error. The
composite was correct, the file was committed, and it reached nobody.

Nothing caught it, by construction: `check-refresh-derivation.py` derives the
referenced-script set as `.github/scripts/*`, and an action-path sibling is not
in that set. This is the SAME failure as #321 (`check-ui-viewports.js`, a script
the WORKFLOW named, missing after a downstream refresh) one level in -- a script
the COMPOSITE names. Twice, at two levels, is why this exists as code rather
than as another sentence in the refresh row.

WHAT IT CHECKS, for every `$GITHUB_ACTION_PATH/<file>` reference it DERIVES from
the shipped composites:

  1. The sibling is TRACKED at `templates/actions/<a>/<file>`. Tracked, not
     merely present: an untracked file passes `os.path.exists` on the machine
     that wrote it and ships to nobody, which is the gate's own fail-open family
     (#325 -- `git ls-files` does not list untracked paths, so a check that
     enumerates it reports OK for the one file you just added).
  2. Every install carrier INSTALLS it -- either naming the file with both a
     source and a destination, or taking the action directory wholesale.

THE REFERENCE SET IS DERIVED, NEVER HAND-LISTED. That is the whole lesson of
#321 and round 35: the refresh row already carried a note saying a hand-list had
fallen behind its general form twice, and it fell behind a third time, written
by the session that had just read the note. A hand-list here would be the same
mistake a fourth time, inside its own fix.

The CARRIERS are listed, and that is a deliberate, different thing: "which files
document an install" is not derivable from the tree, while "which files a
composite runs" is. A carrier that stops mentioning `.github/actions/` entirely
is refused rather than passed as "nothing to check" -- deleting the install must
not look like having no install to check.

WHAT IT CANNOT ESTABLISH. A carrier is prose, and this reads text. It proves a
carrier NAMES the file as both a source and a destination; it cannot prove the
command works, that the URL resolves, or that a human ran it. It catches a
carrier falling behind the composites -- the failure that has now happened
twice -- not a carrier that is wrong in some other way.
"""

import os
import re
import subprocess
import sys

# An optional argv[1] repoints the whole check at another tree. That is what
# lets `check-action-siblings-cases.py` run the REAL guard against fixture
# repositories instead of re-implementing its rules -- a cases file that copies
# the rules tests the copy (#333 round 8, and the reason the refresh-derivation
# guard reads its pattern out of the shipped markdown rather than duplicating it).
ROOT = (
    os.path.abspath(sys.argv[1]) if len(sys.argv) > 1
    else os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)

ACTIONS_DIR = "templates/actions"
INSTALL_DIR = ".github/actions"

# A reference looks like `$GITHUB_ACTION_PATH/<file>` or `${GITHUB_ACTION_PATH}/<file>`,
# in any quoting. The filename stops at whitespace or a closing quote -- a path
# SEGMENT, so a nested `dir/file.py` is captured whole and checked as written.
REFERENCE = re.compile(r"\$\{?GITHUB_ACTION_PATH\}?/([^\s\"';|)&]+)")

# Carriers: the files that tell somebody how to install a composite. Listed, not
# derived -- see the module docstring for why this list is not the hand-list the
# issue warns about.
CARRIERS = (
    "docs/standards/cicd-setup.md",
    "plugins/directives-toolkit/commands/refresh-repo.md",
)

# A wholesale install names the DIRECTORY. The action name may be spelled out or
# stand in as a placeholder -- the refresh row ships `templates/actions/<a>/**`,
# where `<a>` covers every action -- so a placeholder counts for every action.
PLACEHOLDER = r"(?:<[^/>]+>|\*)"


def tracked_files():
    """Every path git knows about, as a set. NOT a directory walk.

    A directory walk sees the file you just created and have not staged; the
    install carriers fetch from the REPOSITORY, so a path git does not track is
    a path no downstream project can receive. `__pycache__` next to a shipped
    validator is the everyday version of this.
    """
    out = subprocess.run(
        ["git", "-C", ROOT, "ls-files"],
        check=True, capture_output=True, text=True,
    ).stdout
    return set(out.splitlines())


def logical_lines(text):
    """Join shell line-continuations so one command is one line.

    The setup doc splits a curl across two physical lines:

        curl -sL https://raw.../templates/actions/ui-suite/validate-report-path.py \
          -o .github/actions/ui-suite/validate-report-path.py

    Searching physical lines finds the source and the destination in different
    lines and can pair either with anything else in the file. Rejoining is
    performing the shell's own operation instead of modelling it, and it is what
    lets the source->destination pairing be checked as ONE command rather than
    as two mentions (#347 round 9: stop mistaking mention for use).
    """
    joined, buf = [], ""
    for line in text.splitlines():
        if line.endswith("\\"):
            buf += line[:-1] + " "
            continue
        joined.append(buf + line)
        buf = ""
    if buf:
        joined.append(buf)
    return joined


def installs_file(lines, action, name):
    """True when one logical line names this file as BOTH source and destination.

    Either half alone is not an install: a source with no destination fetches
    nothing anybody can find, and a destination with no source is a path the
    carrier never fills.
    """
    src = f"{ACTIONS_DIR}/{action}/{name}"
    dst = f"{INSTALL_DIR}/{action}/{name}"
    return any(src in ln and dst in ln for ln in lines)


def installs_directory(lines, action):
    """True when one logical line takes the whole action directory.

    `templates/actions/<a>/**` -> `.github/actions/<a>/**` covers every sibling
    including ones added later, which is why it is accepted in place of naming
    each file -- and why the refresh row was moved to it in round 35.
    """
    esc = re.escape(action)
    src = re.compile(rf"{re.escape(ACTIONS_DIR)}/(?:{esc}|{PLACEHOLDER})/\*\*")
    dst = re.compile(rf"{re.escape(INSTALL_DIR)}/(?:{esc}|{PLACEHOLDER})/\*\*")
    return any(src.search(ln) and dst.search(ln) for ln in lines)


def main():
    tracked = tracked_files()
    problems = []

    composites = sorted(
        p for p in tracked
        if p.startswith(f"{ACTIONS_DIR}/") and p.endswith("/action.yml")
    )
    if not composites:
        print(f"check-action-siblings: FAILED\n  - no {ACTIONS_DIR}/*/action.yml is tracked")
        print("    The reference set is derived from the composites; with none")
        print("    found this check has nothing to look at and must not pass.")
        return 1

    # Read each carrier ONCE, and refuse a carrier that has stopped documenting
    # composite installs at all -- an empty carrier must not read as a clean one.
    carrier_lines = {}
    for carrier in CARRIERS:
        path = os.path.join(ROOT, carrier)
        try:
            with open(path, encoding="utf-8") as handle:
                text = handle.read()
        except OSError as exc:
            problems.append(
                f"carrier {carrier} could not be read: {exc}"
                + "\n    A carrier this check cannot read is a carrier it cannot"
                + "\n    vouch for; that is CANNOT CHECK, never OK."
            )
            continue
        lines = logical_lines(text)
        if not any(INSTALL_DIR + "/" in ln for ln in lines):
            problems.append(
                f"carrier {carrier} no longer mentions {INSTALL_DIR}/ at all"
                + "\n    Either it stopped installing composites — in which case it is"
                + "\n    not a carrier and belongs out of CARRIERS — or the install was"
                + "\n    deleted. Both need a human; neither is a pass."
            )
        carrier_lines[carrier] = lines

    found = []
    for composite in composites:
        # The directory HOLDING the action.yml, indexed from the right: the
        # prefix has a fixed depth today and an index from the left silently
        # reads `actions` out of `templates/actions/<a>/action.yml`.
        action = composite.split("/")[-2]
        with open(os.path.join(ROOT, composite), encoding="utf-8") as handle:
            body = handle.read()

        for name in sorted(set(REFERENCE.findall(body))):
            found.append((action, name))

            sibling = f"{ACTIONS_DIR}/{action}/{name}"
            if sibling not in tracked:
                problems.append(
                    f"{composite} runs $GITHUB_ACTION_PATH/{name}, but {sibling} is not tracked"
                    + "\n    Present-but-untracked ships to nobody and looks identical to"
                    + "\n    correct on the machine that wrote it. `git add` it, or fix the"
                    + "\n    reference."
                )
                continue

            for carrier, lines in carrier_lines.items():
                if installs_file(lines, action, name) or installs_directory(lines, action):
                    continue
                problems.append(
                    f"{carrier} does not install {sibling}"
                    + f"\n    {composite} runs it as its own step, so a project following this"
                    + "\n    carrier gets a composite that dies at that step (#353, #321)."
                    + "\n    Accepted forms, on ONE logical line:"
                    + f"\n      naming the file: {ACTIONS_DIR}/{action}/{name}"
                    + f"\n                   and {INSTALL_DIR}/{action}/{name}"
                    + f"\n      or wholesale:    {ACTIONS_DIR}/<a>/**  ->  {INSTALL_DIR}/<a>/**"
                )

    if problems:
        print("check-action-siblings: FAILED")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    if not found:
        print(
            f"check-action-siblings: OK — {len(composites)} composite(s), "
            "none references a $GITHUB_ACTION_PATH sibling"
        )
        print("  NOT EXERCISED: the rule stands for the first composite that adds one.")
        return 0

    print(
        f"check-action-siblings: OK — {len(found)} sibling(s) derived from "
        f"{len(composites)} composite(s), each tracked and installed by "
        f"{len(carrier_lines)} carrier(s)"
    )
    for action, name in found:
        print(f"  {ACTIONS_DIR}/{action}/{name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
