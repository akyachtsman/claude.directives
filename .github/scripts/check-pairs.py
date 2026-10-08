#!/usr/bin/env python3
"""Fail when an intentionally identical file pair has drifted apart.

THE ONE LIST. Each pair below is a live copy this repo runs and the template
projects copy. They must stay byte-identical: the template IS the live copy.
This file is the single source of truth for which pairs those are -- `qa.yml`
runs it, `CLAUDE.md` → *Local gate — CI scripts (this repo)* runs it, and `CLAUDE.md` → *Self-application*
points here rather than enumerating. Add a pair HERE, nowhere else.

Not every live/template pair belongs on it. `ci-monitor.yml` and `ci-notify.yml`
watch this repo's own workflow name, so they diverge from their templates on
purpose (`CLAUDE.md` → *Self-application*, the "adapted" pattern).

WHY THE SCRIPT PAIRS. A guard that ships to projects from `templates/scripts/`
while this repo runs the `.github/scripts/` copy can be repaired in the copy we
execute while the shipped one stays broken -- and QA would stay green either way.

WHAT IT CHECKS, per pair:
  1. both files exist;
  2. their bytes are identical (a unified diff is printed when they are not);
  3. their executable bits agree -- a content comparison cannot see a mode, and
     a twin that differs only in its mode is not the live copy either;
  4. for a pair marked `executable`, both copies ARE executable. The SessionStart
     hook is the reason: `bash -n` reads a non-executable file happily, so a
     mode-only change slipped past every other check while the registered hook
     failed permission-denied at every session start -- and a non-executable
     template propagates that fault to every project scaffolded from it.

Modes are read from the working tree, as `diff` and `test -x` read them.

Usage: python3 .github/scripts/check-pairs.py [ROOT]
ROOT defaults to the repository this file lives in (the cases pass a fixture).
"""

import difflib
import os
import sys

# (live copy, template copy, both must be executable)
PAIRS = [
    (".claude/settings.json", "templates/claude-settings.json", False),
    (".github/workflows/codex-monitor.yml", "templates/workflows/codex-monitor.yml", False),
    (".github/workflows/pages-monitor.yml", "templates/workflows/pages-monitor.yml", False),
    (".github/workflows/pages-retry.yml", "templates/workflows/pages-retry.yml", False),
    (".github/scripts/workflow-ref-guard.py", "templates/scripts/workflow-ref-guard.py", False),
    (".github/scripts/check-job-bounds.py", "templates/scripts/check-job-bounds.py", False),
    (".github/scripts/check-py-warnings.py", "templates/scripts/check-py-warnings.py", False),
    (".github/scripts/check-ui-suite-env.py", "templates/scripts/check-ui-suite-env.py", False),
    (".claude/hooks/session-start.sh", "templates/claude-hooks/session-start.sh", True),
]


def is_exec(path):
    return bool(os.stat(path).st_mode & 0o111)


def check(root):
    failures = []
    for live, template, executable in PAIRS:
        a, b = os.path.join(root, live), os.path.join(root, template)
        missing = [p for p, full in ((live, a), (template, b)) if not os.path.isfile(full)]
        if missing:
            failures.append(f"{live} <-> {template}: missing {', '.join(missing)}")
            continue
        with open(a, "rb") as fa, open(b, "rb") as fb:
            da, db = fa.read(), fb.read()
        if da != db:
            diff = difflib.unified_diff(
                da.decode("utf-8", "replace").splitlines(keepends=True),
                db.decode("utf-8", "replace").splitlines(keepends=True),
                fromfile=live, tofile=template)
            failures.append(f"{live} <-> {template}: contents differ\n" + "".join(diff).rstrip("\n"))
        ea, eb = is_exec(a), is_exec(b)
        if ea != eb:
            failures.append(f"{live} <-> {template}: executable bit differs "
                            f"({live} {'is' if ea else 'is not'}, {template} {'is' if eb else 'is not'})")
        if executable:
            for rel, ex in ((live, ea), (template, eb)):
                if not ex:
                    failures.append(f"{rel} is not executable (it is registered or shipped as a hook)")
    return failures


def main(argv):
    root = argv[1] if len(argv) > 1 else os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    # An empty list checks nothing, and "OK -- 0 pairs" is a vacuous pass.
    failures = check(root) if PAIRS else ["the pair list is empty — this check verified nothing"]
    if failures:
        for f in failures:
            print(f"FAIL: {f}")
        print(f"check-pairs: FAIL — {len(failures)} problem(s) across {len(PAIRS)} pairs")
        return 1
    for live, template, executable in PAIRS:
        print(f"OK:   {live} == {template}" + (" (both executable)" if executable else ""))
    print(f"check-pairs: OK — {len(PAIRS)} pairs byte-identical, modes in step")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
