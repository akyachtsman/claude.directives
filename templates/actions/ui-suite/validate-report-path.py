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

# GLOB METACHARACTERS, because the consumer that matters expands them.
# `actions/upload-artifact` treats each path entry as a PATTERN, so
# `../../../**/*` survives the containment check below -- normpath reduces it to
# `**/*`, which is workspace-local -- and then uploads the whole workspace
# (Codex, #347 round 9). The containment rule answers "where does this land",
# which is the wrong question for a value that names MANY places.
if any(ch in raw for ch in "*?[]!"):
    refuse("report-path contains glob metacharacters.",
           f"got {raw!r} -- the artifact uploader expands patterns, so this names "
           "a set of files rather than the one report.")

if PurePosixPath(raw).is_absolute() or raw.startswith("\\") or (len(raw) > 1 and raw[1] == ":"):
    refuse("report-path is absolute.", f"got {raw!r}")

# Resolve against tests-dir the way every consumer does, and require the result
# to stay inside the workspace. `..` is legitimate here -- the shipped default
# climbs out of .github/scripts/ui-tests/ to the repo root -- so the rule is
# about where it LANDS, not whether it climbs.
landed = os.path.normpath(os.path.join(tests_dir, raw))
# COMPONENT, NOT PREFIX. `landed.startswith("..")` was a text test standing in
# for a path question, and it got the answer wrong in both directions a text
# test can: `..report.json` is an ordinary filename in the workspace and was
# refused (Codex, #347 round 10). Splitting on the separator asks the question
# the rule is actually about -- does the first step go UP.
parts = landed.split(os.sep)
if parts[0] == os.pardir or os.path.isabs(landed):
    refuse("report-path resolves outside the workspace.",
           f"{tests_dir!r} + {raw!r} -> {landed!r}")

# A LEADING `~` IS A THIRD PLACE THIS CAN LAND. `actions/upload-artifact`
# expands a leading tilde to the runner's home directory, which is OUTSIDE the
# workspace and outside everything the containment rule above reasons about:
# `../../../~/secret.txt` normalises to `~/secret.txt`, which climbs nowhere by
# the rule and reads the runner's home by the consumer (Codex, #347 round 10).
# The containment check answers "where does this path point"; the tilde makes
# that a different question for one consumer, so it is refused rather than
# reasoned about.
if parts[0].startswith("~"):
    refuse("report-path resolves to a home-directory reference.",
           f"{tests_dir!r} + {raw!r} -> {landed!r} -- the artifact uploader expands "
           "a leading ~ to the runner's home, outside the workspace entirely.")

# HAND THE VALIDATED PATH ON IN BOTH BASES, so NO consumer re-reads the raw
# input. Round 9 did this for the upload alone and left the other three steps on
# `${{ inputs.report-path }}`; the post-run gate runs under `always()`, so a
# REFUSED value still reached it and `/dev/zero` blocked its read forever (Codex,
# #347 round 10). One escaped consumer is the same defect as no validation, and
# the reason it escaped was that there were two bases and only one output:
#   path      -- workspace-relative, for actions/upload-artifact
#   relative  -- tests-dir-relative, for the steps that run from tests-dir
# `relative` is the raw value AFTER every rule above accepted it, which is what
# makes it safe to pass on; it is not the raw input by another name.
out = os.environ.get("GITHUB_OUTPUT")
if out:
    with open(out, "a", encoding="utf-8") as handle:
        handle.write(f"path={landed}\n")
        handle.write(f"relative={raw}\n")

print(f"validate-report-path: OK -- {raw!r} resolves to {landed!r}, inside the workspace.")
