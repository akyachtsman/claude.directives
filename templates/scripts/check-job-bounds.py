#!/usr/bin/env python3
"""check-job-bounds.py — every workflow job must carry a bound that can actually trip.

WHY: an unbounded job that wedges runs to GitHub's 6-hour default, and for all
of it the PR shows neither pass nor fail — no signal, which reads as "still
working" and then as nothing. Measured here twice in one day (2026-08-19): run
32269445117 sat 57 minutes on a browser install; run 32293469078 sat 35 on the
same step and was only stopped because a bound had landed by then.

THREE RULES, because presence alone proves nothing:
  1. Every job declares `timeout-minutes`. (Exception: a job that `uses:` a
     reusable workflow — GitHub does not accept timeout-minutes there; the
     called workflow's own jobs carry the bounds.)
  2. No bound may be >= 360. GitHub's default IS 360, so declaring 360 or more
     is the absent bound wearing a declared one's clothes — it changes nothing
     and reads as protection.
  3. TWO floors, because the two shapes cost different amounts:
       - a job running `playwright install*` DIRECTLY pays the install: >= 30
       - a job using the ui-suite composite pays install + EVERY project in
         playwright.config.js + retries + upload, in one sum it cannot
         subdivide: >= 60 (a 21m25s cold install plus a 16.6min complete warm
         job measured downstream = ~38min healthy cold; 40 cancels it, and a
         cancelled run is not a red one — it reads as inconclusive)
     The cold-cache install alone measured
     21m25s, and a 20-minute bound killed run 32277932813 at 20m21s — a bound
     below the work it bounds does not protect anything; it fails on a
     schedule, and because the cache save runs at job END, each kill also
     leaves the next run cold. Rule 3 exists because rule 1 passed the exact
     defect #238 fixed: every broken template job DECLARED a bound; the value
     was the fault.

Scans .github/workflows AND, where it exists, templates/workflows. The
templates are what every downstream project inherits, and #238's defect lived
only in the templates while this repo's own copy was fine — a scan of the live
workflows alone reports health precisely when the shipped ones are broken.

This file is EXPORTED (templates/scripts/check-job-bounds.py, byte-paired with
this one) and runs downstream too, where templates/workflows does not exist. So
the scan list decides absence from a sibling marker rather than forking the
file or trusting a printed skip: see SCAN_DIRS.

Composite actions (templates/actions/*/action.yml) are not scanned: composite
steps cannot carry timeout-minutes at all; their ceiling is the calling job's,
which is exactly what rules 1-3 police.
"""

import sys
from pathlib import Path

try:
    import yaml
except ModuleNotFoundError:
    sys.stderr.write(
        "❌ check-job-bounds: PyYAML is not installed. It ships with GitHub's "
        "runner images; on a bare host: pip install PyYAML.\n"
    )
    raise SystemExit(1)

# Optional root override so the check can be exercised against synthetic trees;
# defaults to the repo this file lives in.
REPO_ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[2]
# (directory, marker). A missing directory is AMBIGUOUS on its own, and that is
# the whole problem this pairing solves. `templates/workflows` SHOULD be absent
# downstream; here, its absence means the guard has stopped covering the tree
# where #238's defect actually lived. Same input, opposite significance.
#
# An earlier version of this file resolved that by skipping and PRINTING the skip
# on the pass line. claude.trading rejected the mitigation using the argument
# this repo had just made to them: a printed line on a green run is neutral
# informational text that reads identically whether the situation is fine or
# gutted — the same shape as Playwright announcing two phone projects as though
# that were a matrix. A printed skip is not a scanned directory, and relying on a
# human to read green output adversarially is not enforcement.
#
# So absence is no longer interpreted. It is DECIDED, by a sibling that exists
# only where the scan is mandatory:
#
#   templates/ absent   -> a downstream repo. Skip: correct, expected, silent.
#   templates/ present  -> this repo, with the scanned directory deleted or
#                          renamed. FAIL.
#
# One code path, byte-identical upstream and downstream, no fork. marker=None
# means required unconditionally.
SCAN_DIRS = [(".github/workflows", None), ("templates/workflows", "templates")]

GITHUB_DEFAULT = 360
# TWO floors, because the two shapes cost different amounts and a single floor
# cannot police both. A job running `playwright install` directly pays the
# install; a job using the ui-suite composite pays install + EVERY project in
# playwright.config.js + retries + artifact upload, in one sum the composite
# cannot subdivide. Holding both at 30 let a ui-suite caller sit at 40 — the
# exact state #290 raised three of them out of — and this guard passed it.
BROWSER_FLOOR = 30
UI_SUITE_FLOOR = 60
BROWSER_MARKERS = ("playwright install",)
UI_SUITE_MARKERS = ("ui-suite",)


def _job_matches(job, markers):
    for step in job.get("steps") or []:
        if not isinstance(step, dict):
            continue
        text = str(step.get("run", "")) + " " + str(step.get("uses", ""))
        if any(m in text for m in markers):
            return True
    return False


def is_ui_suite_job(job):
    return _job_matches(job, UI_SUITE_MARKERS)


def is_browser_job(job):
    for step in job.get("steps") or []:
        if not isinstance(step, dict):
            continue
        text = str(step.get("run", "")) + " " + str(step.get("uses", ""))
        if any(marker in text for marker in BROWSER_MARKERS):
            return True
    return False


errors = []
checked = 0
skipped = []

for scan_dir, marker in SCAN_DIRS:
    directory = REPO_ROOT / scan_dir
    if not directory.is_dir():
        if marker is None:
            errors.append(f"{scan_dir}/ does not exist — wrong root? Scanned from {REPO_ROOT}.")
        elif (REPO_ROOT / marker).is_dir():
            errors.append(
                f"{scan_dir}/ is missing, but {marker}/ is present — so this is the repo that\n"
                f"      SHIPS the workflow templates, and the directory this guard must cover has\n"
                f"      been deleted or renamed. Every downstream project inherits those templates;\n"
                f"      #238's defect lived ONLY in them while the live workflows were fine. Restore\n"
                f"      the path or update SCAN_DIRS deliberately — do not let it drop out quietly."
            )
        else:
            skipped.append(scan_dir)
        continue
    for path in sorted(directory.glob("*.yml")) + sorted(directory.glob("*.yaml")):
        rel = path.relative_to(REPO_ROOT)
        try:
            doc = yaml.safe_load(path.read_text(encoding="utf-8"))
        except yaml.YAMLError as exc:
            # FAIL CLOSED: a file this check cannot read is reported, never
            # skipped — a workflow silently treated as empty passes every rule.
            errors.append(f"{rel} is not parseable YAML, so its jobs were never checked: {str(exc).strip()}")
            continue
        jobs = (doc or {}).get("jobs")
        if not isinstance(jobs, dict):
            errors.append(f"{rel} has no jobs mapping — not a workflow, or malformed.")
            continue
        for name, job in jobs.items():
            if not isinstance(job, dict):
                errors.append(f"{rel} → job '{name}' is not a mapping.")
                continue
            if "uses" in job:
                continue  # reusable-workflow call: cannot carry timeout-minutes
            checked += 1
            bound = job.get("timeout-minutes")
            if bound is None:
                errors.append(
                    f"{rel} → job '{name}' has no timeout-minutes.\n"
                    f"      Unbounded means GitHub's 6-hour default: a wedged step shows neither pass\n"
                    f"      nor fail for the whole time. Bound it — and size the bound from the job's\n"
                    f"      measured COLD path, not its warm one (see this file's header, rule 3)."
                )
                continue
            # bool FIRST: Python's bool subclasses int, so `timeout-minutes: true`
            # (a YAML boolean) passes an isinstance(int) check while being no
            # minute count at all — green here, broken after installation.
            if isinstance(bound, bool) or not isinstance(bound, int):
                errors.append(f"{rel} → job '{name}' timeout-minutes is {bound!r}, not an integer minute count.")
                continue
            if bound <= 0:
                errors.append(
                    f"{rel} → job '{name}' declares timeout-minutes: {bound} — no usable execution\n"
                    f"      window at all. The job dies immediately, which reads as flaky CI, not as\n"
                    f"      a bound set to nothing."
                )
                continue
            if bound >= GITHUB_DEFAULT:
                errors.append(
                    f"{rel} → job '{name}' declares timeout-minutes: {bound}, but GitHub's default is\n"
                    f"      {GITHUB_DEFAULT} — declaring >= it changes nothing and reads as protection. Pick a\n"
                    f"      bound the job's real worst case fits under."
                )
                continue
            if bound < UI_SUITE_FLOOR and is_ui_suite_job(job):
                errors.append(
                    f"{rel} → job '{name}' runs the ui-suite composite under timeout-minutes: {bound}.\n"
                    f"      That composite is install + EVERY project + retries + upload in ONE sum. A\n"
                    f"      cold install measures 21m25s and a complete warm job measured 16.6min\n"
                    f"      (apfp.claude, c302827, 4 projects) — ~38min healthy cold. A bound of {bound}\n"
                    f"      cancels a HEALTHY run, and a cancelled run is not a red one: it reads as\n"
                    f"      inconclusive, so nobody chases it. ui-suite callers need >= {UI_SUITE_FLOOR}."
                )
            elif bound < BROWSER_FLOOR and is_browser_job(job):
                errors.append(
                    f"{rel} → job '{name}' installs Playwright browsers under timeout-minutes: {bound}.\n"
                    f"      The cold-cache install alone measured 21m25s; a bound of {bound} kills every\n"
                    f"      cold run before a test executes AND skips the cache save that would warm the\n"
                    f"      next one (#238). Browser jobs need >= {BROWSER_FLOOR}."
                )

if errors:
    sys.stderr.write("❌ check-job-bounds: FAILED\n\n")
    for err in errors:
        sys.stderr.write("  • " + err + "\n\n")
    raise SystemExit(1)

# Name what was NOT scanned. This is INFORMATIONAL only — it is not what makes
# the skip safe. The marker check above is; see SCAN_DIRS.
note = f" (not present, not scanned: {', '.join(skipped)})" if skipped else ""
print(
    f"✅ check-job-bounds: {checked} job(s) bounded, none >= {GITHUB_DEFAULT}, "
    f"direct browser jobs >= {BROWSER_FLOOR}, ui-suite callers >= {UI_SUITE_FLOOR}.{note}"
)
