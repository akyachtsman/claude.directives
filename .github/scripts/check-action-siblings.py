#!/usr/bin/env python3
r"""Guard: every file a composite runs by path is tracked and ships with it.

WHY IT EXISTS (#353, from #347 round 35). `ui-suite/action.yml` runs, at its
`Validate report-path` step,

    run: python3 "$GITHUB_ACTION_PATH/validate-report-path.py"

and both documented install carriers copied only `action.yml`. Every project
installing or refreshing the composite got a directory holding the YAML alone,
so every UI job would have died at that step -- after Node setup, dependency
install and the browser download, which is minutes of CI spent to reach a
missing file. (An earlier version of this comment said "its first step"; it is
step 6 of 11. The failure is not first, it is late and expensive.) The
composite was correct,
the file was committed, and it reached nobody.

Nothing else catches that class: `check-refresh-derivation.py` derives the
referenced-script set as `.github/scripts/*`, and an action-path sibling is not
in that set by construction. It is #321 one level in -- there a script the
WORKFLOW named went missing on a downstream refresh; here a script the COMPOSITE
names.

WHAT IT CHECKS. For every `$GITHUB_ACTION_PATH/<file>` this DERIVES from the
shipped composites, the file must be TRACKED at `templates/actions/<a>/<file>`.
Tracked, not merely present: an untracked file passes an existence check on the
machine that wrote it and ships to nobody -- the gate's own fail-open family
(#325, where `git ls-files` not listing untracked paths meant the gate reported
OK for the one file just added).

WHAT IT DELIBERATELY DOES NOT CHECK, AND WHY THAT IS THE POINT
--------------------------------------------------------------
An earlier version also read the install carriers -- `cicd-setup.md`,
`refresh-repo.md`, `new-repo.md` -- and tried to decide whether each *installs*
the derived sibling. That half was removed on the owner's ruling after producing
defects in three consecutive review rounds:

    round 1  seven findings, five of them one shape: a text form standing in
             for the construct it stands for
    round 2  seven more, six of them defects round 1 introduced --
             a reversed `cp` direction accepted; `/` missing from a path
             boundary so `<file>/backup` matched; `*` accepted as wholesale
             though it omits dotfiles; env-bound references invisible because
             the scan had been narrowed to `run:` values

The question it was asking -- *"does this English paragraph install this
file?"* -- has no reliable answer from text. Each fix bought the next false
accept or false refusal, and a guard that is sometimes wrong in the CERTIFYING
direction is worse than no guard, because it is read as coverage.

So this file now asserts only what it can establish exactly. Whether a carrier
installs the sibling is left to review, and the two questions differ in kind:
"is this file in git" is decidable; "does this prose install it" is not.

If that half is ever rebuilt, the lesson to carry is not "match more forms" --
that was tried twice. It is that carrier text is the wrong input, and the right
one would be an observable artefact of an install actually happening.
"""

import os
import re
import subprocess
import sys

import yaml

ROOT = (
    os.path.abspath(sys.argv[1]) if len(sys.argv) > 1
    else os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)

ACTIONS_DIR = "templates/actions"

# A composite names its own directory two ways, and they mean the same thing:
# the environment variable `$GITHUB_ACTION_PATH` (any bracing, and optionally
# quoted before the slash) and the expression context `${{ github.action_path }}`.
# Deriving only the first left a sibling referenced the other way invisible, with
# the guard reporting NOT EXERCISED and exiting 0 (Codex, #354).
#
# `<` and `>` end the name too: `python $GITHUB_ACTION_PATH/helper.py>out` is
# ordinary Bash, and without them the capture was `helper.py>out` -- a file that
# cannot exist, so the gate refused a composite whose helper WAS tracked
# (Codex, #354). A false refusal, and this repo has produced nine of them.
REFERENCE = re.compile(
    r"""(?:\$\{?GITHUB_ACTION_PATH\}?|\$\{\{\s*github\.action_path\s*\}\})"""
    r"""["']?/([^\s"';|)&<>]+)"""
)

# GitHub accepts both manifest spellings. Filtering to one meant a composite
# using the other was skipped, and because another `action.yml` existed the
# empty-set refusal did not fire either (Codex, #354).
MANIFESTS = ("action.yml", "action.yaml")

# The reference syntaxes above are POSIX-shell. A `pwsh` step spells the same
# dependency `$env:GITHUB_ACTION_PATH\helper.ps1` or
# `${{ github.action_path }}\helper.ps1` -- a backslash separator and a different
# variable syntax, neither of which this file parses. Rather than report
# NOT EXERCISED and pass (fail-open for a shape it simply cannot read), a step
# using one of these refuses. This repo ships no such composite; the refusal
# exists so that adding one is a decision somebody makes, not a silent gap
# (Codex, #354).
UNPARSED_SHELLS = ("pwsh", "powershell", "cmd")

# Marks a step this file cannot read. Carried out of run_values() rather than
# raised, so the caller reports it as a refusal with the composite named.
UNPARSED = object()


def strip_shell_comments(body):
    """Drop whole-line `#` comments from a run block.

    A `run: |` block keeps its comments in the parsed string, so a stale example
    in one still matched and the gate demanded a file the shell never touches
    (Codex, #354) -- the same defect the raw-YAML fix addressed, one level in.

    WHOLE-LINE ONLY. A trailing `#` can sit inside a quoted string or a URL
    fragment, and deciding that needs a shell parser; dropping only lines whose
    first non-space character is `#` is exactly what those lines are, and claims
    nothing about the rest.
    """
    return "\n".join(
        line for line in body.split("\n") if not line.lstrip().startswith("#")
    )


def run_values(manifest):
    """Every string a composite EXECUTES: `runs.steps[].run`, plus the step `env`
    values those commands can read.

    Derived from what the action runs, not from its text. Scanning the raw
    manifest made an obsolete example in a comment into a required sibling,
    failing the gate over a file the composite never runs. But narrowing to `run`
    alone then missed a step binding `HELPER: ${{ github.action_path }}/x.py` and
    running `python "$HELPER"` -- an executable dependency the scan could not see
    (Codex, #354). Both are executable inputs; neither comments nor `description`
    are.
    """
    if not isinstance(manifest, dict):
        return []
    runs = manifest.get("runs")
    steps = runs.get("steps") if isinstance(runs, dict) else None
    if not isinstance(steps, list):
        return []
    out = []
    for step in steps:
        if not isinstance(step, dict):
            continue
        shell = step.get("shell")
        if isinstance(shell, str) and shell.split()[0].lower() in UNPARSED_SHELLS:
            out.append(UNPARSED)
            continue
        env = step.get("env") if isinstance(step.get("env"), dict) else {}
        env = {k: v for k, v in env.items() if isinstance(v, str)}
        out.extend(env.values())
        if isinstance(step.get("run"), str):
            # SUBSTITUTE THE STEP'S OWN env FIRST. A binding can hold the
            # DIRECTORY rather than the whole path --
            # `ACTION_DIR: ${{ github.action_path }}` with
            # `run: python "$ACTION_DIR/helper.py"` -- and scanning the two
            # strings independently finds a complete reference in neither, so the
            # guard passed with `helper.py` untracked (Codex, #354). Round 2 added
            # env values to the scan and stopped there; joining them is what makes
            # the dependency visible.
            body = strip_shell_comments(step["run"])
            for name, value in env.items():
                for form in (f"${{{name}}}", f'"${name}"', f"${name}"):
                    body = body.replace(form, value)
            out.append(body)
    return out


def tracked_files():
    """Every path git knows about. NOT a directory walk.

    A walk sees the file you just created and have not staged; the carriers fetch
    from the REPOSITORY, so a path git does not track is a path no downstream
    project can receive. `__pycache__` beside a shipped validator is the everyday
    version of this.
    """
    # `-z`, because git C-QUOTES non-ASCII paths by default: a tracked `café.py`
    # comes back as `"caf\303\251.py"`, which never equals the Unicode name
    # derived from the manifest, and the gate refuses a file that IS tracked
    # (Codex, #354). NUL-delimited output is the raw bytes, no quoting to undo.
    out = subprocess.run(
        ["git", "-C", ROOT, "ls-files", "-z"],
        check=True, capture_output=True, text=True,
    ).stdout
    return set(p for p in out.split("\0") if p)


def main():
    tracked = tracked_files()
    problems = []

    composites = sorted(
        p for p in tracked
        if p.startswith(f"{ACTIONS_DIR}/")
        and any(p.endswith(f"/{m}") for m in MANIFESTS)
    )
    if not composites:
        print("check-action-siblings: FAILED")
        print(f"  - no {ACTIONS_DIR}/*/{{{','.join(MANIFESTS)}}} is tracked")
        print("    The reference set is derived from the composites; with none found")
        print("    this check has nothing to look at and must not pass.")
        return 1

    found = []
    for composite in composites:
        # The directory HOLDING the manifest, indexed from the right: an index
        # from the left silently reads `actions` out of the path prefix.
        action = composite.split("/")[-2]
        # FROM THE INDEX, NOT THE WORKING TREE. `git ls-files` answers what is
        # STAGED, and the documented local gate runs after `git add` -- so
        # reading the manifest with open() mixed two git states: a staged
        # manifest referencing `missing.py` could be committed clean because an
        # unstaged edit had already removed the reference (Codex, #354). One
        # state for both inputs, or the check is about a tree that exists
        # nowhere.
        try:
            body = subprocess.run(
                ["git", "-C", ROOT, "show", f":{composite}"],
                check=True, capture_output=True, text=True,
            ).stdout
        except subprocess.CalledProcessError as exc:
            problems.append(
                f"{composite} is tracked but could not be read from the index: {exc}"
                + "\n    Reading it from the working tree instead would check a different"
                + "\n    git state than the membership test above; that is CANNOT CHECK."
            )
            continue

        try:
            manifest = yaml.safe_load(body)
        except yaml.YAMLError as exc:
            problems.append(
                f"{composite} is not readable as YAML: {exc}"
                + "\n    The reference set is derived from what the action RUNS, so a"
                + "\n    manifest this cannot parse is CANNOT CHECK, never OK."
            )
            continue

        refs = set()
        unreadable = False
        for value in run_values(manifest):
            if value is UNPARSED:
                unreadable = True
                continue
            refs.update(REFERENCE.findall(value))
        if unreadable:
            problems.append(
                f"{composite} has a step whose shell this guard cannot read"
                + f"\n    ({', '.join(UNPARSED_SHELLS)} spell an action-path reference with a"
                + "\n    backslash separator and `$env:` syntax, which the derivation does not"
                + "\n    parse). Reporting NOT EXERCISED here would be a pass for a shape this"
                + "\n    file simply cannot see, so it refuses instead. Teach the derivation"
                + "\n    that syntax, or keep composite steps on a POSIX shell."
            )
            continue

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
        f"{len(composites)} composite(s), each tracked"
    )
    print("  (tracked only. Whether a carrier INSTALLS them is not checked here —")
    print("   that question is not decidable from carrier prose; see this file's header.)")
    for action, name in found:
        print(f"  {ACTIONS_DIR}/{action}/{name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
