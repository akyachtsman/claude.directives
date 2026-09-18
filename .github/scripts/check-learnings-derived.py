#!/usr/bin/env python3
"""check-learnings-derived.py — a learnings entry whose `files` list is DERIVABLE
must equal what the tree actually contains.

WHY: some entries in `learnings.jsonl` state a lesson that applies to EVERY file
with some property — "a terminal-state watcher cannot see a hang" applies to every
workflow watching `workflow_run` for `completed`. That file list is carried by hand,
and a hand-carried list goes stale SILENTLY: add or rename a watcher and the entry
still looks right, the new file is simply unrouted, and `check-learnings.js` reports
OK because it validates shapes, not facts. #368 needed FOUR successive routing
corrections to one such list before the derivation was written down at all.

So the property is the source of truth and the hand-carried list is compared to it.

⚠️ WHY THIS IS PYTHON, AND NOT A REGEX INSIDE check-learnings.js. It was, for two
rounds, and it was wrong both times in the same way. A line scanner has to
re-implement YAML, and `workflow-ref-guard.py` already has the full account of that
mistake in its own header — thirteen misread forms over four rounds — ending in
"Do NOT reintroduce a hand-rolled scan". This guard reintroduced one anyway. Its
measured failures:

  • `types: [ completed ]` and the block-sequence form both read as NO MATCH, so two
    real watchers were silently excluded while the guard printed OK.
  • a COMMENTED-OUT snippet in pages-monitor.yml matched, so a file with no trigger
    at all entered the derived set — and an entry was asserted equal to that wrong
    set for two rounds. An assertion against a wrong predicate is indistinguishable
    from an assertion against a right one.
  • `types : [completed]`, a quoted `'workflow_run':` key, and the inline flow
    mapping `on: {workflow_run: {...}}` all read as NO MATCH (Codex, #368 round 19).

The last of those is the point: every fix added a spelling, and the set of valid
YAML spellings a scanner can misread is unbounded. Text-scanning cannot even
separate a trigger key from a `${{ github.event.workflow_run.conclusion }}`
expression — pages-monitor.yml carries exactly that, on a live line, with no
trigger. PyYAML separates them structurally.

An unrecognised form REFUSES rather than returning "no match", because "I could not
read it" and "it does not match" must never be the same answer. That is the
fail-open this guard exists to prevent, and it is worth stating that the refusal is
a backstop, not the defence: the defence is that a real parser has almost nothing
left to refuse.

PORTABILITY: PyYAML, preinstalled on GitHub runners, same dependency qa.yml already
takes. No network, no repo-specific state beyond the DERIVED table below.
"""

import json
import sys
from pathlib import Path

try:
    import yaml
except ModuleNotFoundError:
    sys.stderr.write(
        "❌ check-learnings-derived: PyYAML is not installed.\n"
        "   It ships with GitHub's runner images; on a bare host: pip install PyYAML.\n"
        "   Failing rather than skipping — a guard that cannot read the workflows must\n"
        "   never report that they are fine.\n"
    )
    raise SystemExit(1)

REPO_ROOT = Path(__file__).resolve().parents[2]


class Unreadable(Exception):
    """A file this guard cannot classify. NOT the same as one that does not match."""


def trigger_block(doc):
    """The root `on:` value.

    YAML 1.1 — which PyYAML speaks — resolves a bare `on` to boolean true, so the
    key comes back as `True`, and so do `ON:`, `On:` and `yes:`. GitHub still reads
    all of those as the trigger block, so this must too. A QUOTED `"on":` stays a
    string and is also the trigger key; a quoted `"ON":` is not, because GitHub's
    keys are case-sensitive and that is genuinely a different key.
    """
    if not isinstance(doc, dict):
        return None
    if True in doc:
        return doc[True]
    return doc.get("on")


def terminal_state_watcher(path, text):
    """True when this workflow fires on `workflow_run` with `completed` among its types."""
    try:
        doc = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise Unreadable(f"{path}: not parseable as YAML — {exc}")

    on = trigger_block(doc)
    if on is None:
        return False
    if not isinstance(on, dict):
        # `on: push` or `on: [push, pull_request]` — a scalar or sequence of event
        # names cannot carry a workflow_run configuration at all.
        return False
    if "workflow_run" not in on:
        return False

    wr = on["workflow_run"]
    if wr is None:
        # `workflow_run:` with no body at all — default activity types apply.
        return True
    if not isinstance(wr, dict):
        raise Unreadable(
            f"{path}: `on.workflow_run` is {type(wr).__name__}, not a mapping — "
            f"this guard cannot tell which activity types it declares."
        )
    if "types" not in wr or wr["types"] is None:
        # GitHub: omitting `types` runs the workflow for ALL activity types of the
        # event, and `completed` is one of workflow_run's. So an un-typed
        # `workflow_run:` IS a terminal-state watcher. Nothing in this tree spells
        # it that way today, so the behaviour is pinned by a case rather than by a
        # live file — see check-learnings-derived-cases.py.
        return True

    types = wr["types"]
    if isinstance(types, str):
        types = [types]
    if not isinstance(types, list) or not all(isinstance(t, str) for t in types):
        raise Unreadable(
            f"{path}: `on.workflow_run.types` is {types!r}, which is neither a string "
            f"nor a list of strings — teach this guard that form rather than letting "
            f'it read as "no match".'
        )
    return "completed" in types


# Add a row here when an entry's `files` is defined by a PREDICATE rather than by
# judgement. An entry may also list prose files; only paths under `roots` are
# governed, and everything else in its `files` is left alone.
DERIVED = [
    {
        "key": "a-terminal-state-watcher-cannot-see-a-hang",
        "what": "workflows using a terminal-state workflow_run trigger",
        # The canonical watcher set is automations.md -> Watcher Rules. This reads the
        # TREE rather than restating that table, so a new watcher is caught on arrival
        # instead of on the next time somebody remembers the table exists.
        "match": terminal_state_watcher,
        "roots": [".github/workflows", "templates/workflows"],
    },
]


def load_entries():
    """[(line_number, obj)] for every parseable line. check-learnings.js owns the
    verdict on malformed lines, so they are skipped here rather than double-reported."""
    path = REPO_ROOT / "learnings.jsonl"
    entries = []
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            entries.append((i, json.loads(line)))
        except ValueError:
            continue
    return entries


def main():
    entries = load_entries()
    errors = []
    counts = []

    for rule in DERIVED:
        key = rule["key"]
        matching = [(n, d) for n, d in entries if isinstance(d, dict) and d.get("key") == key]

        # `learnings.jsonl` is latest-key-wins and corrections are made by APPENDING,
        # so a superseded line with an older `files` list is normal and inert. Checking
        # every same-key line would make the documented append flow fail against the
        # new tree and force a history rewrite instead (Codex, #368 round 19).
        if not matching:
            # NOT a skip. `DERIVED` still declares this key, so absence means the entry
            # was deleted or its key mistyped, and the recall guarantee vanished with
            # the lesson it protects — while the guard printed OK. Retiring an entry on
            # purpose means removing its row here in the same change.
            errors.append(
                f'"{key}" is declared in DERIVED but no entry in learnings.jsonl has '
                f"that key.\n"
                f"      If the entry was retired on purpose, delete its DERIVED row in "
                f"the same change. If it was renamed, update the row. Failing rather "
                f"than skipping: a rule that quietly guards nothing is worse than no rule."
            )
            continue
        line_no, entry = matching[-1]

        expected = []
        for root in rule["roots"]:
            directory = REPO_ROOT / root
            if not directory.is_dir():
                continue
            for candidate in sorted(directory.iterdir()):
                if candidate.suffix not in (".yml", ".yaml") or not candidate.is_file():
                    continue
                try:
                    text = candidate.read_text(encoding="utf-8")
                except OSError:
                    continue
                # An Unreadable propagates: a derived set missing the file that could
                # not be read is not a set worth comparing an entry against.
                if rule["match"](f"{root}/{candidate.name}", text):
                    expected.append(f"{root}/{candidate.name}")
        expected.sort()

        governed = set(expected)
        listed = sorted(
            f for f in entry.get("files") or []
            if any(f.startswith(f"{root}/") for root in rule["roots"])
        )
        missing = [f for f in expected if f not in listed]
        extra = [f for f in listed if f not in governed]
        if missing or extra:
            detail = ""
            if missing:
                detail += "\n      missing: " + ", ".join(missing)
            if extra:
                detail += "\n      not matching: " + ", ".join(extra)
            errors.append(
                f'learnings.jsonl:{line_no}: "{key}" must list exactly the '
                f"{rule['what']} ({len(expected)} found).{detail}"
            )
        counts.append((key, len(expected)))

    if errors:
        sys.stderr.write("❌ check-learnings-derived: FAILED\n\n")
        for err in errors:
            sys.stderr.write("  • " + err + "\n\n")
        return 1

    noun = "inventory matches" if len(counts) == 1 else "inventories match"
    print(f"✅ check-learnings-derived: {len(counts)} derived {noun} the tree")
    for key, n in counts:
        print(f"   {key}: {n} file(s)")
    print(
        "   (Parsed with PyYAML, not scanned. An unreadable trigger REFUSES rather\n"
        "    than reading as no-match — see this file's header.)"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Unreadable as exc:
        sys.stderr.write(
            "❌ check-learnings-derived: FAILED — a file could not be classified\n\n"
            f"  • {exc}\n\n"
            "      This is a REFUSAL, not a crash: the tree carries a trigger form this\n"
            "      guard cannot read, and reporting no-match would be the fail-open it\n"
            "      exists to prevent.\n"
        )
        raise SystemExit(1)
