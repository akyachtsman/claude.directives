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

# THE CHARACTER RULES, FACTORED SO THEY CAN RUN TWICE. They were written against
# `report-path` alone, but the value that reaches the consumers is `tests_dir` +
# `report-path`, and NOTHING validated the first half. Codex reproduced
# `TESTS_DIR='suite?'` emitting `path=suite?/results.json`, which the uploader
# expands as a pattern across sibling directories (#347 round 13); measuring it
# turned up the worse sibling, a NEWLINE in tests-dir emitting a two-line `path`
# — the artifact-list injection this whole file exists to stop, arriving through
# the input nobody was checking.
#
# So the rules run on the raw input (where the diagnostics are about what the
# caller typed) and again on the final emitted value (where they are about what
# the consumers actually receive). Validating only the input is the same class of
# mistake as round 9's upload interpolating a value the validator had rejected:
# the check has to be on the thing that travels.
LINE_BREAKS = "\n\r\v\f\x1c\x1d\x1e\x85  "
GLOB_CHARS = "*?[]!"


def forbid_chars(value, what):
    # Any vertical whitespace, not just \n: \r splits the artifact list too, and
    # a lone \r would otherwise pass a `"\n" in value` test while still ending
    # the line.
    if any(ch in value for ch in LINE_BREAKS):
        refuse(f"{what} contains a line break.",
               f"got {value!r} -- it is interpolated into a MULTILINE artifact "
               "path list, where a second line is a second file to upload.")
    # GLOB METACHARACTERS, because the consumer that matters expands them.
    # `actions/upload-artifact` treats each path entry as a PATTERN, so
    # `../../../**/*` survives the containment check below -- it resolves
    # workspace-local -- and then uploads the whole workspace (Codex, #347 round
    # 9). Containment answers "where does this land", which is the wrong question
    # for a value that names MANY places.
    if any(ch in value for ch in GLOB_CHARS):
        refuse(f"{what} contains glob metacharacters.",
               f"got {value!r} -- the artifact uploader expands patterns, so this "
               "names a set of files rather than the one report.")


forbid_chars(raw, "report-path")

if raw != raw.strip():
    refuse("report-path has leading or trailing whitespace.",
           f"got {raw!r} -- a path list trims lines, so this is not the path you think.")

if PurePosixPath(raw).is_absolute() or raw.startswith("\\") or (len(raw) > 1 and raw[1] == ":"):
    refuse("report-path is absolute.", f"got {raw!r}")

# ── WHERE DOES IT LAND, ASKED OF REAL PATHS ──────────────────────────────────
# Rounds 8-10 answered this with string rules on the NORMALISED text, and each
# one was right about the case that motivated it and wrong one step out:
# `landed.startswith("..")` refused `..report.json`, and `os.path.isabs(landed)`
# refused a workspace-local absolute `tests-dir` that the composite's
# working-directory consumers accept (Codex, #347 rounds 10 and 11).
#
# So the containment question is now asked of resolved absolute paths against
# the workspace root, which is what "inside the workspace" actually means.
# realpath on BOTH sides: a symlink inside the workspace pointing out of it lands
# outside, and a workspace root that is itself a symlink would otherwise never
# match its own children.
workspace = os.path.realpath(os.environ.get("GITHUB_WORKSPACE") or os.getcwd())

# RESOLVE THE DIRECTORY, KEEP THE FILENAME LEXICAL. Round 11 resolved the whole
# path, which resolves the FINAL component too -- and if that component is a
# symlink the three consumers stop naming the same file. Codex reproduced
# `report.json -> ../target.txt`: the upload got `path=target.txt` while
# `relative` still said `report.json`, so the clear step removed the link,
# Playwright wrote a fresh report at the link's name, and the artifact collected
# the untouched target instead of the report (#347 round 12).
#
# Resolving the PARENT still catches a directory symlink pointing out of the
# workspace, which is what round 11 added realpath for. Appending the filename
# lexically keeps every consumer on one name.
# os.path.dirname AND os.path.basename, not PurePosixPath().name for the second
# half. The two disagree: for `../../../.` dirname gives `../../..` and basename
# gives `.`, but PurePosixPath normalises the trailing dot away and reports `..`
# — so pairing them double-counted a level and pointed the check one directory
# too high. Caught by running the existing `..` cases against the new resolution,
# not by reading it.
raw_dir = os.path.dirname(raw)
parent_abs = os.path.realpath(os.path.join(workspace, tests_dir, raw_dir) if raw_dir
                              else os.path.join(workspace, tests_dir))
landed_abs = os.path.join(parent_abs, os.path.basename(raw))
try:
    contained = os.path.commonpath([landed_abs, workspace]) == workspace
except ValueError:      # different drives on Windows runners
    contained = False
if not contained:
    refuse("report-path resolves outside the workspace.",
           f"{tests_dir!r} + {raw!r} -> {landed_abs!r}, outside {workspace!r}")

# AND REFUSE A SYMLINKED FINAL COMPONENT OUTRIGHT. Keeping the name lexical makes
# the three consumers agree, but the link is still there when Playwright opens
# the path for writing, and a write follows it. The `rm -f` step ahead of the run
# removes it in the shipped ordering -- that is an ordering, not a guarantee, and
# this file exists so no consumer has to depend on another's behaviour.
if os.path.islink(landed_abs):
    refuse("report-path is a symlink.",
           f"{landed_abs!r} -- a link makes the file the gate reads, the file the "
           "run writes and the file the uploader collects three different questions.")

# A DIRECTORY IS NOT A REPORT, and the uploader treats one very differently.
# `actions/upload-artifact` given a directory uploads it RECURSIVELY, so
# `../../../.` — which resolves to the workspace root and passes every rule
# above — publishes the entire workspace as an artifact. Codex walked the whole
# path through on #347 round 11: validation succeeds, the `rm -f` step fails
# (GNU rm refuses `.`), and the upload still runs because it is gated on the
# VALIDATION's outcome, not the clear step's.
#
# Refused rather than escaped, because "which of these three consumers treats a
# directory the way I meant" is the coupling this file exists to remove.
if os.path.isdir(landed_abs):
    refuse("report-path names a directory, not a report file.",
           f"{tests_dir!r} + {raw!r} -> {landed_abs!r} -- the artifact uploader "
           "publishes a directory recursively, so this names the whole tree.")

# `.` and `..` as the FINAL component name a directory even when it does not
# exist yet, so the check above would miss them on a clean checkout. So does a
# TRAILING SLASH, and that one is checked on the raw string rather than through
# PurePosixPath, which strips it -- `PurePosixPath("reports/").name` is
# "reports", so a path parser cannot see the thing that makes it a directory.
# (Found by the case, not by reading the fix: the first version of this rule
# used only the parsed name and let `reports/` through.)
if raw.endswith("/") or raw.endswith("\\") or os.path.basename(raw) in ("", ".", ".."):
    refuse("report-path does not end in a filename.", f"got {raw!r}")

# The value the artifact uploader gets, which is the one the tilde rule is about.
landed = os.path.relpath(landed_abs, workspace)

# A LEADING `~` IS A THIRD PLACE THIS CAN LAND. `actions/upload-artifact`
# expands a leading tilde to the runner's home directory, which is OUTSIDE the
# workspace and outside everything the containment rule above reasons about:
# `../../../~/secret.txt` resolves to a real path inside the workspace, and the
# workspace-relative form handed to the uploader is `~/secret.txt`, which that
# consumer reads as the runner's home (Codex, #347 round 10). The containment
# check answers "where does this path point"; the tilde makes that a different
# question for one consumer, so it is refused rather than reasoned about.
if landed.split(os.sep)[0].startswith("~"):
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
# THE VALUE THE CONSUMERS ACTUALLY GET, checked as such. `landed` carries
# tests-dir, which no rule above has looked at (#347 round 13).
forbid_chars(landed, "the resolved report path")

out = os.environ.get("GITHUB_OUTPUT")
if out:
    with open(out, "a", encoding="utf-8") as handle:
        handle.write(f"path={landed}\n")
        handle.write(f"relative={raw}\n")

print(f"validate-report-path: OK -- {raw!r} resolves to {landed!r}, inside the workspace.")
