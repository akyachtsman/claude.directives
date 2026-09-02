#!/usr/bin/env python3
"""Refuse a report-path that is not a single relative path inside the workspace.

WHY THIS IS A SEPARATE STEP. `report-path` reaches three consumers: an `rm`, a
`--report` argument, and a MULTILINE `path:` list on actions/upload-artifact.
That last one is the dangerous shape -- a newline in the value becomes another
entry in the list, and the upload step runs under `always()`, so a caller
deriving the input from untrusted workflow input could have an arbitrary
runner-readable file uploaded even on a failing run (Codex, #347 round 8).

Validated ONCE here rather than escaped at each use. Three consumers with three
escaping rules is how one of them ends up wrong, and this composite has already
been caught twice on exactly that coupling: a `--report` the guard accepted and
the gate ignored, and an upload path the gate read and the artifact did not.

NOT exported on its own -- it ships inside templates/actions/ui-suite/, which
projects copy whole.
"""
import os
import sys
from pathlib import PurePosixPath

raw = os.environ.get("REPORT_PATH", "")
tests_dir = os.environ.get("TESTS_DIR", ".")


def refuse(reason, detail=None):
    print("validate-report-path: REFUSED")
    print(f"  {reason}")
    if detail:
        print(f"  {detail}")
    print("  report-path must be ONE relative path that stays inside the workspace.")
    print("  test.md -> UI coverage gates, fifth gate.")
    sys.exit(1)


if not raw.strip():
    refuse("report-path is empty.",
           "The post-run gate needs a report to read; an empty value would ask it "
           "for the execution check and give it nothing.")

# Any vertical whitespace, not just \n: \r splits the artifact list too, and a
# lone \r would otherwise pass a `"\n" in raw` test while still ending the line.
if any(ch in raw for ch in "\n\r\v\f\x1c\x1d\x1e\x85  "):
    refuse("report-path contains a line break.",
           "It is interpolated into a MULTILINE artifact path list, where a "
           "second line is a second file to upload.")

if raw != raw.strip():
    refuse("report-path has leading or trailing whitespace.",
           f"got {raw!r} -- a path list trims lines, so this is not the path you think.")

if PurePosixPath(raw).is_absolute() or raw.startswith("\\") or (len(raw) > 1 and raw[1] == ":"):
    refuse("report-path is absolute.", f"got {raw!r}")

# Resolve against tests-dir the way every consumer does, and require the result
# to stay inside the workspace. `..` is legitimate here -- the shipped default
# climbs out of .github/scripts/ui-tests/ to the repo root -- so the rule is
# about where it LANDS, not whether it climbs.
landed = os.path.normpath(os.path.join(tests_dir, raw))
if landed.startswith("..") or os.path.isabs(landed):
    refuse("report-path resolves outside the workspace.",
           f"{tests_dir!r} + {raw!r} -> {landed!r}")

print(f"validate-report-path: OK -- {raw!r} resolves to {landed!r}, inside the workspace.")
