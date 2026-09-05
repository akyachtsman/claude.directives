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

import yaml

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

# A composite can name its own directory two ways, and they mean the same thing:
# the environment variable `$GITHUB_ACTION_PATH` (any bracing) and the expression
# context `${{ github.action_path }}`. Deriving only the first left a sibling
# referenced the second way absent from git and from every carrier, with the
# guard reporting NOT EXERCISED and exiting 0 (Codex, #354).
REFERENCE = re.compile(
    r"(?:\$\{?GITHUB_ACTION_PATH\}?|\$\{\{\s*github\.action_path\s*\}\})/([^\s\"';|)&]+)")

# Both manifest spellings. GitHub accepts `action.yml` and `action.yaml`; filtering
# to one meant a composite using the other was skipped, and because another
# `action.yml` existed the empty-set refusal did not fire either -- so its
# siblings passed unnoticed (Codex, #354).
MANIFESTS = ("action.yml", "action.yaml")

# Shell control operators. A "logical line" can hold several commands, so pairing
# a source and a destination anywhere in it matched
# `curl <src> -o /tmp/x; rm -f <dst>` -- where the only command naming the
# destination DELETES it (Codex, #354). An install is one command.
#
# A SINGLE `|` is not a separator here, on purpose. These carriers are prose, and
# one states its installs as a markdown TABLE whose column separator is `|`;
# splitting on it tore each row's source from its destination and refused a
# carrier that was correct. The hazard above needs `;`, `&&` or `&` -- a pipe
# feeds output onward, it does not introduce an unrelated destination.
COMMAND_SPLIT = re.compile(r"(?:\|\||&&|[;&\n])")


def commands(line):
    return [part.strip() for part in COMMAND_SPLIT.split(line) if part.strip()]


def names_path(command, path):
    """True when `command` names exactly this path, not something starting with it.

    A plain substring test accepted a line naming `<path>.bak` as installing
    `<path>` -- the file that actually ships is never copied and the guard is
    green (Codex, #354). The boundary is the construct: a path token ends where a
    filename character stops.

    `/` is deliberately NOT a left boundary. The setup doc names its source
    inside a raw URL, so `…/main/templates/actions/…` is the ordinary form; a
    stricter lookbehind refused all three carriers, which is the false refusal
    this rule was being tightened to avoid.
    """
    return re.search(rf"(?<![\w.-]){re.escape(path)}(?![\w.-])", command) is not None

# Carriers: the files that tell somebody how to install a composite. Listed, not
# derived -- see the module docstring for why this list is not the hand-list the
# issue warns about.
CARRIERS = (
    "docs/standards/cicd-setup.md",
    "plugins/directives-toolkit/commands/refresh-repo.md",
    # /new-repo bootstraps a project independently of the setup doc, so a
    # regression there ships every NEW project a composite without its sibling
    # while the other two carriers stay correct (Codex, #354).
    "plugins/directives-toolkit/commands/new-repo.md",
)

# A wholesale install names the DIRECTORY. The action name may be spelled out or
# stand in as a placeholder -- the refresh row ships `templates/actions/<a>/**`,
# where `<a>` covers every action -- so a placeholder counts for every action.
PLACEHOLDER = r"(?:<[^/>]+>|\*)"


def run_values(manifest):
    """Every `run:` string a composite executes, in order.

    Only `runs.steps[].run` -- that is what the action executes. `uses`, `with`,
    `description` and comments are not executed, and treating them as executed is
    how a stale example in prose became a hard failure.
    """
    if not isinstance(manifest, dict):
        return []
    runs = manifest.get("runs")
    steps = runs.get("steps") if isinstance(runs, dict) else None
    if not isinstance(steps, list):
        return []
    return [s["run"] for s in steps
            if isinstance(s, dict) and isinstance(s.get("run"), str)]


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
    """True when ONE COMMAND names this file as both source and destination.

    Either half alone is not an install: a source with no destination fetches
    nothing anybody can find, and a destination with no source is a path the
    carrier never fills. And both halves in one logical LINE is not enough
    either -- a line can hold several commands.
    """
    src = f"{ACTIONS_DIR}/{action}/{name}"
    dst = f"{INSTALL_DIR}/{action}/{name}"
    return any(names_path(cmd, src) and names_path(cmd, dst)
               for ln in lines for cmd in commands(ln))


def installs_directory(lines, action):
    """True when ONE COMMAND takes the whole action directory.

    Taking the directory covers every sibling, including ones added later, which
    is why it is accepted in place of naming each file -- and why the refresh row
    moved to it in #347 round 35.

    RECOGNISED AS A PROPERTY, NOT AS A COMMAND LIST. The first version required
    the documentation's own `/**` glob, so `cp -R templates/actions/ui-suite/.
    .github/actions/ui-suite/` -- which copies every sibling -- was refused
    (Codex, #354). Listing `cp -R`, `rsync -a`, `cp -a`, … would be the same
    mistake with a longer list: a text form standing in for the construct, which
    is the shape of every false refusal this family of guards has produced.

    So the rule is what the command NAMES: the action directory as a source and
    the install directory as a destination, each as a DIRECTORY rather than as
    one file inside it. `templates/actions/<a>/**`, `.../ui-suite/.`,
    `.../ui-suite/` and a bare `.../ui-suite` all qualify; a path continuing into
    a filename does not.
    """
    esc = re.escape(action)
    # A directory reference: the path ENDS there, or ends with a separator
    # followed by only `.`, `*` or `**`. Spelled as an explicit alternation
    # because an optional tail with a `(?![\w.-])` lookahead also matched the
    # DIRECTORY PREFIX of a longer file path -- `templates/actions/ui-suite` out
    # of `templates/actions/ui-suite/action.yml` -- so a carrier naming only
    # `action.yml` counted as taking the whole directory and four cases that
    # should have refused passed instead. Found by the cases, not by reading.
    tail = r"(?:(?![\w.\-/])|/(?:\.|\*\*?)?(?![\w.\-/]))"
    src = re.compile(rf"(?<![\w.-]){re.escape(ACTIONS_DIR)}/(?:{esc}|{PLACEHOLDER}){tail}")
    dst = re.compile(rf"(?<![\w.-]){re.escape(INSTALL_DIR)}/(?:{esc}|{PLACEHOLDER}){tail}")
    return any(src.search(cmd) and dst.search(cmd)
               for ln in lines for cmd in commands(ln))


def main():
    tracked = tracked_files()
    problems = []

    composites = sorted(
        p for p in tracked
        if p.startswith(f"{ACTIONS_DIR}/")
        and any(p.endswith(f"/{m}") for m in MANIFESTS)
    )
    if not composites:
        print("check-action-siblings: FAILED\n  - no "
              f"{ACTIONS_DIR}/*/{{{','.join(MANIFESTS)}}} is tracked")
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

        # FROM WHAT THE ACTION RUNS, not from its text. Scanning the raw manifest
        # made a comment or a description holding an obsolete example -- say
        # `$GITHUB_ACTION_PATH/removed.py` -- into a required sibling, failing the
        # gate over a file the composite never runs and blocking unrelated
        # documentation edits (Codex, #354).
        refs = set()
        try:
            manifest = yaml.safe_load(body)
        except yaml.YAMLError as exc:
            problems.append(
                f"{composite} is not readable as YAML: {exc}"
                + "\n    The reference set is derived from what the action RUNS, so a"
                + "\n    manifest this cannot parse is CANNOT CHECK, never OK."
            )
            manifest = None
        for run in run_values(manifest):
            refs.update(REFERENCE.findall(run))

        for name in sorted(refs):
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
