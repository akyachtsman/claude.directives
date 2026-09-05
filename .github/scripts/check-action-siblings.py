#!/usr/bin/env python3
r"""Guard: nothing in a composite action's directory is left behind.

WHY IT EXISTS (#353, from #347 round 35). `ui-suite/action.yml` runs, at its
`Validate report-path` step, a file that lives beside it:

    run: python3 "$GITHUB_ACTION_PATH/validate-report-path.py"

and both documented install carriers copied only `action.yml`. Every project
installing or refreshing the composite got a directory holding the YAML alone,
so every UI job died at that step -- after Node setup, dependency install and
the browser download, which is minutes of CI spent to reach a missing file. The
composite was correct, the file was committed, and it reached nobody.

Nothing else catches that class: `check-refresh-derivation.py` derives the
referenced-script set as `.github/scripts/*`, and an action-path sibling is not
in that set by construction. It is #321 one level in.

WHAT IT CHECKS, AND WHY IT NO LONGER READS SHELL
------------------------------------------------
Every file inside `templates/actions/<a>/` must be TRACKED. That is the whole
rule. It reads no `run:` bodies, resolves no variables, and knows nothing about
shells.

Two earlier designs did read them, and both failed the same way:

    the CARRIER half   asked "does this English paragraph install this file?"
                       -- three rounds, fourteen findings, removed on the
                       owner's ruling
    the DERIVATION     asked "which files does this shell command name?"
                       -- four rounds. Round 4 alone: `$TOOL` corrupting
                       `$TOOL_DIR` during substitution; `working-directory:
                       ${{ github.action_path }}` with a bare relative command;
                       `"$GITHUB_ACTION_PATH/x.py".bak` concatenation; `shell:
                       pwsh.exe {0}` slipping past a three-token allowlist;
                       `$GITHUB_ACTION_PATH/./x.py` refused though tracked; and
                       an UNUSED env binding inventing a dependency

Both are the same question in different clothes -- *what does this text mean?* --
and every answer bought the next false accept or false refusal. So the question
changed. "Is every file in this directory tracked" needs no parser, has no
syntax to miss, and cannot be defeated by a spelling nobody thought of. It is
also STRICTLY BROADER than the derivation was: a sibling nothing references yet
is caught too, and that is the state a half-finished change leaves behind.

WHAT THAT COSTS, STATED PLAINLY. It no longer notices a composite naming a file
that was never created at all. That failure is loud on the first run of the
composite; the failure this guard exists for -- a file that exists, works
locally, and silently never ships -- is the quiet one, and it is the one still
covered. A whole class of parser defects traded for the early warning on a
failure that announces itself. That is the deal, made deliberately.

ASK GIT WHAT SHIPS; DO NOT MODEL IT. `git add -N` records that a path WILL be
added and puts it in `git ls-files`, while its content is absent from the tree
that gets committed -- so the advertised post-`git add` gate would pass a sibling
that still does not ship (Codex, #354).

Round 4 answered that by reading the staged blob and calling the empty one a
placeholder. Round 5 measured that wrong: `git add -N` on a file that is
GENUINELY zero bytes gives the empty blob AND a zero-byte working tree, so the
heuristic said tracked while `write-tree` omitted it anyway. Measured on git
2.43.0: `ls-files -s`, `-t` and `-v` all print such an entry identically to a
real one -- the index simply does not distinguish them in any listing (Codex,
#354).

So the question is put to git directly: **write the tree the index would commit,
and list it.** A path in that listing ships; a path missing from it does not.
There is nothing left to infer, and no third form of "in the index but not in the
tree" can be invented that this would miss. It is the same move as #347 rounds
28-32 -- perform the operation instead of predicting it -- and it retires the
empty-blob rule, the file-size read and the special intent-to-add branch
together.
"""

import os
import subprocess
import sys

# PRINTING A PATH IS ALSO A BYTES PROBLEM. A name that is not valid UTF-8 comes
# back from `os.walk` surrogate-escaped, and writing that to a strict stdout
# raises UnicodeEncodeError -- so the guard would crash while REPORTING the file
# rather than while reading it. Whether it does depends on the locale, which is
# exactly the kind of environment-dependence this file has already been bitten
# by, so it is pinned here instead of left to chance.
#
# BOTH HALVES, NOT JUST THE ERROR HANDLER. Setting `errors` alone left the
# ENCODING at whatever the locale picked, and under `LC_ALL=C PYTHONUTF8=0` that
# is ASCII -- which cannot encode the em dash in this file's own success line,
# let alone a valid non-ASCII filename (which is not surrogate-escaped and so is
# not rescued by the error handler either). Measured: the live-repo pass path
# raised UnicodeEncodeError at the verdict (Codex, #354). UTF-8 encodes every
# real character; surrogateescape carries the bytes that are not characters.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="surrogateescape")
    except (AttributeError, ValueError):  # pragma: no cover - not a text stream
        pass

ROOT = (
    os.path.abspath(sys.argv[1]) if len(sys.argv) > 1
    else os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)

ACTIONS_DIR = "templates/actions"

# Not shipped, and not anybody's mistake: build artefacts that appear beside a
# validator when it runs. Named because they are the everyday reason a directory
# scan would otherwise be noisy -- not as an exception to the rule.
IGNORED_DIRS = ("__pycache__", ".pytest_cache")


def git_bytes(*args):
    """Git output as BYTES. **The only way this file runs git.**

    A path is not text. Git and every Linux filesystem accept a filename holding
    a byte that is not valid UTF-8, and `text=True` decodes strictly -- so a
    tracked `bad-\xff.sh` made the guard raise `UnicodeDecodeError` instead of
    producing a verdict (Codex, #354).

    THE FIRST FIX CONVERTED ONE CALL SITE AND LEFT THE OTHER. `write-tree` kept
    `text=True`, and git echoes the offending filename in its stderr -- so a
    conflicted index holding a non-UTF-8 name raised while producing the CANNOT
    CHECK message written for exactly that situation (Codex, #354, the round
    after). A rule enforced call-site by call-site gets one site every round, so
    there is now no text-mode git call left to forget: everything goes through
    here, and `git_text` is the only decoder.
    """
    return subprocess.run(
        ["git", "-C", ROOT, *args],
        check=True, capture_output=True,
    ).stdout


def git_text(*args):
    """Git output decoded the way the filesystem decodes: never strictly."""
    return os.fsdecode(git_bytes(*args))


def shipped_paths():
    """Every path under ACTIONS_DIR in the tree the index would commit.

    `write-tree` is the operation a commit performs, so its output is the answer
    rather than a prediction of it -- see the module docstring for what reading
    the index instead cost, twice.

    `-z`, because git C-quotes non-ASCII paths by default: a tracked `café.py`
    comes back as `"caf\303\251.py"` and never equals the name on disk.

    A `write-tree` that CANNOT run -- an index with unmerged entries, mid-merge
    -- is a refusal, never a pass. The one thing this guard must never do is
    report OK because it could not look (#323).
    """
    try:
        tree = git_text("write-tree").strip()
    except subprocess.CalledProcessError as err:
        return None, os.fsdecode(err.stderr or err.stdout or b"").strip()
    out = git_bytes("ls-tree", "-r", "--name-only", "-z", tree, "--", ACTIONS_DIR)
    return {os.fsdecode(p) for p in out.split(b"\0") if p}, None


def files_on_disk():
    """Every real file under the action directories, ignoring build artefacts.

    Returns `(paths, errors)`. A DIRECTORY THIS CANNOT READ IS NOT AN EMPTY
    DIRECTORY. `os.walk` swallows every error it meets unless given `onerror`,
    so an unreadable subdirectory made its whole subtree vanish from the listing
    and the guard reported that every file ships -- measured, exit 0, with an
    untracked helper inside it (Codex, #354). A guard whose answer is a
    comparison against what it found must refuse when it could not finish
    finding; that is the same fail-open family (#323) as `write-tree` above.
    """
    base = os.path.join(ROOT, ACTIONS_DIR)
    if not os.path.isdir(base):
        return [], []
    found = []
    errors = []

    def rel(full):
        return os.path.relpath(full, ROOT).replace(os.sep, "/")

    for dirpath, dirnames, filenames in os.walk(base, onerror=errors.append):
        keep = []
        for name in dirnames:
            full = os.path.join(dirpath, name)
            # A SYMLINK TO A DIRECTORY IS A PATH GIT STORES, and `os.walk` puts
            # it in `dirnames` and neither descends into it nor lists it -- so an
            # untracked one was invisible here while a composite used it happily
            # through the local link (Codex, #354). Record the LINK, and do not
            # follow it: git stores the link, not what it points at, so
            # enumerating the target would demand paths git never keeps.
            #
            # ⚠️ THIS TEST COMES FIRST, BEFORE THE NAME FILTER. `IGNORED_DIRS`
            # excuses GENERATED DIRECTORY CONTENTS; a symlink is a single path
            # git tracks, and its NAME says nothing about that. With the filter
            # first, an untracked `__pycache__ -> tools` link was discarded and
            # the guard exited 0 (Codex, #354). What a path IS decides before
            # what it is CALLED.
            if os.path.islink(full):
                found.append(rel(full))
                continue
            if name in IGNORED_DIRS:
                continue
            keep.append(name)
        dirnames[:] = keep
        for name in filenames:
            found.append(rel(os.path.join(dirpath, name)))
    return sorted(found), errors


def main():
    disk, walk_errors = files_on_disk()
    if walk_errors:
        print("check-action-siblings: CANNOT CHECK")
        print(f"  - {ACTIONS_DIR}/ could not be listed completely, so what is in it")
        print("    is unknown. An unreadable directory is not an empty one, and a")
        print("    pass computed from a partial listing is a pass that did not look.")
        for err in walk_errors:
            print(f"      {err.filename}: {err.strerror}")
        return 1

    if not disk:
        print("check-action-siblings: FAILED")
        print(f"  - {ACTIONS_DIR}/ holds no files")
        print("    This exists to notice a file left behind there; with the directory")
        print("    empty it has nothing to look at, and that is not a pass.")
        return 1

    shipped, blocked = shipped_paths()
    if shipped is None:
        print("check-action-siblings: CANNOT CHECK")
        print("  - `git write-tree` could not run, so what this index would commit")
        print("    is unknown. That is not a pass.")
        for line in blocked.split("\n"):
            print(f"      {line}")
        return 1

    problems = []
    for path in disk:
        if path not in shipped:
            problems.append(
                f"{path} would NOT be committed"
                + "\n    It sits in a composite's directory, so a carrier copying that"
                + "\n    directory expects to find it -- but it ships to nobody. Present"
                + "\n    and unshipped looks identical to correct on the machine that"
                + "\n    wrote it (#325, #353)."
                + "\n    Untracked, or `git add -N` and never staged for real: the tree"
                + "\n    `git write-tree` produces does not contain it either way, which"
                + "\n    is the only question asked here. `git add` it, or delete it."
            )

    if problems:
        print("check-action-siblings: FAILED")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    actions = sorted({p.split("/")[2] for p in disk if len(p.split("/")) > 2})
    print(
        f"check-action-siblings: OK — {len(disk)} file(s) across {len(actions)} "
        "action(s), every one in the tree this index would commit"
    )
    print("  (shipped only. This reads no `run:` bodies and resolves no variables:")
    print("   whether a carrier INSTALLS these, and whether a composite names a file")
    print("   that does not exist, are both outside it — see this file's header.)")
    for path in disk:
        print(f"  {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
