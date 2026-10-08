#!/usr/bin/env python3
"""Pinned cases for check-pairs.py, the paired-file check.

WHY THIS EXISTS. Every pair in this repo is in sync today, so the check prints
the same OK whether its comparison works or does nothing at all -- the
fail-open family (#323). These cases build a fixture holding the real pair
files, break ONE thing, and require the real check to refuse it with the
reason named. Each refusal has an accepting complement, so a fix cannot be
bought by refusing everything.

Every pair on the check's own list is drifted in turn: a pair dropped from the
list (or a comparison that skips one) fails the case named after it.

Re-prove discrimination with a mutant:

    CHECK_PAIRS_BIN=/tmp/mutant.py python3 .github/scripts/check-pairs-cases.py

Run: python3 .github/scripts/check-pairs-cases.py
"""

import importlib.util
import os
import shutil
import sys
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
HOOK = next(p for p in PAIRS if p[2])
PLAIN = next(p for p in PAIRS if not p[2])


def fixture(tmp):
    """A tree holding every pair file exactly as this repo has it, modes included."""
    root = tempfile.mkdtemp(dir=tmp)
    for live, template, _ in PAIRS:
        for rel in (live, template):
            dest = os.path.join(root, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copy2(os.path.join(ROOT, rel), dest)
    return root


def append(root, rel, text="# drift\n"):
    with open(os.path.join(root, rel), "a", encoding="utf-8") as handle:
        handle.write(text)


def chmod(root, rel, mode):
    os.chmod(os.path.join(root, rel), mode)


def cases():
    out = [("an untouched copy of every pair — accepted", lambda r: None, 0, "pairs byte-identical")]
    # Every pair, drifted in turn. The needle names the pair, so a check that
    # refuses for some OTHER pair's reason does not satisfy it.
    for live, template, _ in PAIRS:
        out.append((f"{template} drifted from {live} — refused",
                    lambda r, t=template: append(r, t), 1, f"{live} <-> {template}: contents differ"))
    out += [
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
    # And the live repo. A suite that only ever sees fixtures can be green while
    # the real pairs have drifted.
    c.expect("the live repo passes", *run([sys.executable, GUARD, ROOT]), 0)
    return c.finish(f"{len(all_cases) + 1} pinned trees read correctly.")


if __name__ == "__main__":
    sys.exit(main())
