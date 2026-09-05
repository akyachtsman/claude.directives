#!/usr/bin/env python3
r"""Guard: every file a composite runs by path is tracked and ships with it.

WHY IT EXISTS (#353, from #347 round 35). `ui-suite/action.yml` opens with

    run: python3 "$GITHUB_ACTION_PATH/validate-report-path.py"

and both documented install carriers copied only `action.yml`. Every project
installing or refreshing the composite got a directory holding the YAML alone,
so every UI job would have died on its FIRST step. The composite was correct,
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
REFERENCE = re.compile(
    r"""(?:\$\{?GITHUB_ACTION_PATH\}?|\$\{\{\s*github\.action_path\s*\}\})"""
    r"""["']?/([^\s"';|)&]+)"""
)

# GitHub accepts both manifest spellings. Filtering to one meant a composite
# using the other was skipped, and because another `action.yml` existed the
# empty-set refusal did not fire either (Codex, #354).
MANIFESTS = ("action.yml", "action.yaml")


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
        if isinstance(step.get("run"), str):
            out.append(step["run"])
        env = step.get("env")
        if isinstance(env, dict):
            out.extend(v for v in env.values() if isinstance(v, str))
    return out


def tracked_files():
    """Every path git knows about. NOT a directory walk.

    A walk sees the file you just created and have not staged; the carriers fetch
    from the REPOSITORY, so a path git does not track is a path no downstream
    project can receive. `__pycache__` beside a shipped validator is the everyday
    version of this.
    """
    out = subprocess.run(
        ["git", "-C", ROOT, "ls-files"],
        check=True, capture_output=True, text=True,
    ).stdout
    return set(out.splitlines())


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
        with open(os.path.join(ROOT, composite), encoding="utf-8") as handle:
            body = handle.read()

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
        for value in run_values(manifest):
            refs.update(REFERENCE.findall(value))

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
