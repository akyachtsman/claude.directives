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

INTENT-TO-ADD IS NOT TRACKED. `git add -N` records that a path WILL be added and
puts it in `git ls-files`, while its content is absent from the tree that gets
committed -- so the advertised post-`git add` gate would pass a sibling that
still does not ship (Codex, #354). The index's staged blob is read instead.
"""

import os
import subprocess
import sys

ROOT = (
    os.path.abspath(sys.argv[1]) if len(sys.argv) > 1
    else os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)

ACTIONS_DIR = "templates/actions"

# Not shipped, and not anybody's mistake: build artefacts that appear beside a
# validator when it runs. Named because they are the everyday reason a directory
# scan would otherwise be noisy -- not as an exception to the rule.
IGNORED_DIRS = ("__pycache__", ".pytest_cache")


def git(*args):
    return subprocess.run(
        ["git", "-C", ROOT, *args],
        check=True, capture_output=True, text=True,
    ).stdout


def staged_blobs():
    """Path -> staged blob id, for everything in the index.

    `ls-files -s` prints the blob each path is staged with. An intent-to-add
    entry (`git add -N`) is recorded against the EMPTY blob, so it shows up here
    as the placeholder it is rather than as a file that will ship.

    `-z`, because git C-quotes non-ASCII paths by default: a tracked `café.py`
    comes back as `"caf\303\251.py"` and never equals the name on disk.
    """
    out = git("ls-files", "-s", "-z")
    blobs = {}
    for entry in out.split("\0"):
        if not entry:
            continue
        meta, _, path = entry.partition("\t")
        parts = meta.split()
        if len(parts) >= 2 and path:
            blobs[path] = parts[1]
    return blobs


def files_on_disk():
    """Every real file under the action directories, ignoring build artefacts."""
    base = os.path.join(ROOT, ACTIONS_DIR)
    if not os.path.isdir(base):
        return []
    found = []
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if d not in IGNORED_DIRS]
        for name in filenames:
            full = os.path.join(dirpath, name)
            found.append(os.path.relpath(full, ROOT).replace(os.sep, "/"))
    return sorted(found)


def main():
    disk = files_on_disk()
    if not disk:
        print("check-action-siblings: FAILED")
        print(f"  - {ACTIONS_DIR}/ holds no files")
        print("    This exists to notice a file left behind there; with the directory")
        print("    empty it has nothing to look at, and that is not a pass.")
        return 1

    blobs = staged_blobs()
    empty_blob = git("hash-object", "-t", "blob", os.devnull).strip()

    problems = []
    for path in disk:
        blob = blobs.get(path)
        if blob is None:
            problems.append(
                f"{path} is not tracked"
                + "\n    It sits in a composite's directory, so a carrier copying that"
                + "\n    directory expects to find it -- but it ships to nobody. Present"
                + "\n    and untracked looks identical to correct on the machine that"
                + "\n    wrote it (#325, #353). `git add` it, or delete it."
            )
        elif blob == empty_blob and os.path.getsize(os.path.join(ROOT, path)) > 0:
            problems.append(
                f"{path} is INTENT-TO-ADD, not tracked"
                + "\n    `git add -N` records that the path will be added; its content is"
                + "\n    not in the tree that gets committed, so the file still does not"
                + "\n    ship. Stage it properly (Codex, #354)."
            )

    if problems:
        print("check-action-siblings: FAILED")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    actions = sorted({p.split("/")[2] for p in disk if len(p.split("/")) > 2})
    print(
        f"check-action-siblings: OK — {len(disk)} file(s) across {len(actions)} "
        "action(s), every one tracked"
    )
    print("  (tracked only. This reads no `run:` bodies and resolves no variables:")
    print("   whether a carrier INSTALLS these, and whether a composite names a file")
    print("   that does not exist, are both outside it — see this file's header.)")
    for path in disk:
        print(f"  {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
