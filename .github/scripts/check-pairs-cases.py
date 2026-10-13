#!/usr/bin/env python3
"""Pinned cases for check-pairs.py, the paired-file check.

WHY THIS EXISTS. Every pair in this repo is in sync today, so the check prints
the same OK whether its comparison works or does nothing at all -- the
fail-open family (#323). These cases build a fixture holding the real pair
files, break ONE thing, and require the real check to refuse it with the
reason named. Each refusal has an accepting complement, so a fix cannot be
bought by refusing everything.

Every pair on the check's own list is drifted in turn: a pair dropped from the
list (or a comparison that skips one) fails the case named after it. The
ADAPTED pairs (equal apart from their watch list and comments) are drifted in
turn as well, each in a job key and in a `run:` script line, against the
complements that must stay accepted: a changed watch list, a reworded YAML
comment, a reworded shell comment.

Re-prove discrimination with a mutant:

    CHECK_PAIRS_BIN=/tmp/mutant.py python3 .github/scripts/check-pairs-cases.py

Run: python3 .github/scripts/check-pairs-cases.py
"""

# Before any import: running the gate must leave no __pycache__/ beside the
# local modules it imports (cases_lib.py and/or templates/scripts/gh_yaml.py).
import sys
sys.dont_write_bytecode = True

import importlib.util
import os
import shutil
import tempfile

from cases_lib import Cases, bin_path, run

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REAL = os.path.join(ROOT, ".github", "scripts", "check-pairs.py")
GUARD = bin_path("CHECK_PAIRS_BIN", REAL)

# The pair list is read from the REAL check, never copied here: a list held in
# this file would test the copy. A mutant that drops a pair is then caught by
# the drift case for that pair, which the real list still names.
_spec = importlib.util.spec_from_file_location("check_pairs", REAL)
_real = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_real)
PAIRS = _real.PAIRS
ADAPTED = _real.ADAPTED
MONITOR = next(p for p in ADAPTED if p[0].endswith("ci-monitor.yml"))
HOOK = next(p for p in PAIRS if p[2])
PLAIN = next(p for p in PAIRS if not p[2])


def fixture(tmp):
    """A tree holding every pair and adapted-pair file exactly as this repo has it, modes included."""
    root = tempfile.mkdtemp(dir=tmp)
    files = [rel for live, template, _ in PAIRS for rel in (live, template)]
    files += [rel for pair in ADAPTED for rel in pair]
    for rel in files:
        dest = os.path.join(root, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy2(os.path.join(ROOT, rel), dest)
    return root


def append(root, rel, text="# drift\n"):
    with open(os.path.join(root, rel), "a", encoding="utf-8") as handle:
        handle.write(text)


def replace(root, rel, old, new):
    """Swap ONE occurrence of `old`; a fixture that no longer holds it fails
    loudly rather than leaving the file untouched and the case vacuous."""
    path = os.path.join(root, rel)
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    if text.count(old) != 1:
        raise SystemExit(f"check-pairs-cases: {rel} holds {text.count(old)} copies of {old!r}, not 1 -- update the case")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text.replace(old, new))


def chmod(root, rel, mode):
    os.chmod(os.path.join(root, rel), mode)


def cases():
    out = [("an untouched copy of every pair — accepted", lambda r: None, 0, "pairs byte-identical")]
    # Every pair, drifted in turn. The needle names the pair, so a check that
    # refuses for some OTHER pair's reason does not satisfy it.
    for live, template, _ in PAIRS:
        out.append((f"{template} drifted from {live} — refused",
                    lambda r, t=template: append(r, t), 1, f"{live} <-> {template}: contents differ"))
    # Every adapted pair, drifted in turn where the parse keeps it: a job key,
    # and a line of the `run:` script. Each needle names the pair.
    for live, template in ADAPTED:
        out += [
            (f"{template}: a job key drifted from {live} — refused",
             lambda r, t=template: replace(r, t, "runs-on: ubuntu-latest", "runs-on: ubuntu-22.04"),
             1, f"{live} <-> {template}: differ beyond their watch list"),
            (f"{template}: a run-script line drifted from {live} — refused",
             lambda r, t=template: replace(r, t, "set -euo pipefail\n", "set -euo pipefail\n          echo drift\n"),
             1, f"{live} <-> {template}: differ beyond their watch list"),
            (f"{template}: a reworded YAML comment — accepted",
             lambda r, t=template: append(r, t, "# a comment only this copy has\n"),
             0, "equal apart from their watch list"),
            (f"{template}: a renamed watched workflow — accepted",
             lambda r, t=template: replace(r, t, "      - 'QA — Static + UI Tests'\n", "      - 'QA — Renamed'\n"),
             0, "equal apart from their watch list"),
            (f"{template}: an emptied watch list — refused",
             lambda r, t=template: replace(r, t, "    workflows:\n      - 'QA — Static + UI Tests'\n      - 'QA — UI Tests (live)'\n      - 'QA — Event-Driven Response'\n", "    workflows: []\n"),
             1, f"{live} <-> {template}: on.workflow_run.workflows is not a non-empty list"),
            (f"{template}: no on.workflow_run.workflows — refused",
             lambda r, t=template: replace(r, t, "    workflows:\n", "    branches:\n"),
             1, f"{live} <-> {template}: has no on.workflow_run.workflows"),
            (f"{template} missing — refused",
             lambda r, t=template: os.remove(os.path.join(r, t)), 1, f"missing {template}"),
        ]
    out += [
        # The diff names the moved line, so the log shows what drifted.
        ("an adapted refusal prints the drifted line",
         lambda r: replace(r, MONITOR[1], "set -euo pipefail\n", "set -euo pipefail\n          echo drift\n"),
         1, "echo drift"),
        # A shell comment inside `run:` survives the YAML parse as text; the
        # copies word theirs differently, so it must be set aside too.
        ("a reworded shell comment inside run: — accepted",
         lambda r: replace(r, MONITOR[1], "# THE RECORD OF WHY.", "# THE RECORD, REWORDED."),
         0, "equal apart from their watch list"),
        # Python calls False == 0; GitHub does not, and requires a boolean here.
        ("required: false turned to 0 — refused (no type coercion)",
         lambda r: replace(r, MONITOR[1], "required: false", "required: 0"),
         1, "differ beyond their watch list"),
        # YAML 1.1 (PyYAML) reads `no` as false; YAML 1.2 (GitHub) reads a string.
        ("required: false turned to no — refused (no YAML 1.1 resolution)",
         lambda r: replace(r, MONITOR[1], "required: false", "required: no"),
         1, "differ beyond their watch list"),
        # An explicit tag keeps the text and changes what GitHub reads.
        ("required: false turned to !!str false — refused (explicit tag)",
         lambda r: replace(r, MONITOR[1], "required: false", "required: !!str false"),
         1, "differ beyond their watch list"),
        # The composer resolves plain `on` to bool too; only an event knows the
        # tag was WRITTEN. GitHub (YAML 1.2) needs the string key `on`.
        ("on: turned to !!bool on: — refused (an explicit tag on a key)",
         lambda r: replace(r, MONITOR[1], "\non:\n", "\n!!bool on:\n"),
         1, "has no on.workflow_run.workflows"),
        ("required: false turned to 'false' — refused (a string is not a boolean)",
         lambda r: replace(r, MONITOR[1], "required: false", "required: 'false'"),
         1, "differ beyond their watch list"),
        # A `#` line INSIDE a multi-line quoted string is data, not a comment:
        # ci-monitor's msgs="..." holds one such string (Codex, #430).
        ("a # line inside a quoted string — refused (data, not a comment)",
         lambda r: replace(r, MONITOR[1], 'msgs="$msgs\n', 'msgs="$msgs\n              # Canceling since a higher priority waiting request\n'),
         1, "differ beyond their watch list"),
        ("a template that is not valid YAML — refused, not a traceback",
         lambda r: append(r, MONITOR[1], "  : [unbalanced\n"),
         1, "does not parse as YAML"),
        # The same line, de-commented, is code: refused.
        ("a shell comment turned into code — refused",
         lambda r: replace(r, MONITOR[1], "# THE RECORD OF WHY.", "echo THE RECORD OF WHY."),
         1, "differ beyond their watch list"),
        # The diff is printed, so the line that moved is visible in the log.
        ("a refusal prints the drifted line",
         lambda r: append(r, PLAIN[1], "# the drifted line\n"), 1, "+# the drifted line"),
        ("a missing template copy — refused",
         lambda r: os.remove(os.path.join(r, PLAIN[1])), 1, f"missing {PLAIN[1]}"),
        ("a missing live copy — refused",
         lambda r: os.remove(os.path.join(r, PLAIN[0])), 1, f"missing {PLAIN[0]}"),
        # ── modes: what `diff` could never see ──────────────────────────────
        ("the live hook not executable — refused",
         lambda r: chmod(r, HOOK[0], 0o644), 1, f"{HOOK[0]} is not executable"),
        ("the template hook not executable — refused",
         lambda r: chmod(r, HOOK[1], 0o644), 1, f"{HOOK[1]} is not executable"),
        # Both copies agree, so the mode-agreement test passes; only the
        # must-be-executable rule can catch this one.
        ("BOTH hook copies not executable — refused",
         lambda r: (chmod(r, HOOK[0], 0o644), chmod(r, HOOK[1], 0o644)), 1,
         f"{HOOK[0]} is not executable"),
        ("a plain pair whose modes disagree — refused",
         lambda r: chmod(r, PLAIN[1], 0o755), 1, "executable bit differs"),
        # Git records a file executable from the OWNER bit alone (Codex, #412):
        # group/other execute without it is "not executable" to git, and so here.
        ("both hook copies executable for group/other only (0655) — refused",
         lambda r: (chmod(r, HOOK[0], 0o655), chmod(r, HOOK[1], 0o655)), 1,
         f"{HOOK[0]} is not executable"),
        ("a plain pair 0644 vs 0655 — git records both 100644 — accepted",
         lambda r: chmod(r, PLAIN[1], 0o655), 0, "pairs byte-identical"),
        # The complement: a plain pair needs AGREEMENT, not a particular mode.
        ("a plain pair executable on both sides — accepted",
         lambda r: (chmod(r, PLAIN[0], 0o755), chmod(r, PLAIN[1], 0o755)), 0, "pairs byte-identical"),
    ]
    return out


def main():
    c = Cases("check-pairs-cases")
    all_cases = cases()
    with tempfile.TemporaryDirectory() as tmp:
        for label, mutate, expected, needle in all_cases:
            root = fixture(tmp)
            mutate(root)
            c.expect(label, *run([sys.executable, GUARD, root]), expected, needle)
    # No shell parser: the adapted pairs are NOT checked, and that must fail.
    env = dict(os.environ, SHFMT="/nonexistent/shfmt", PATH="/usr/bin:/bin")
    with tempfile.TemporaryDirectory() as tmp:
        c.expect("no shfmt — the adapted pairs fail as NOT checked",
                 *run([sys.executable, GUARD, fixture(tmp)], env=env), 1, "the adapted pairs cannot be compared")
    # And the live repo. A suite that only ever sees fixtures can be green while
    # the real pairs have drifted.
    c.expect("the live repo passes", *run([sys.executable, GUARD, ROOT]), 0)
    return c.finish(f"{len(all_cases) + 2} pinned trees read correctly.")


if __name__ == "__main__":
    sys.exit(main())
