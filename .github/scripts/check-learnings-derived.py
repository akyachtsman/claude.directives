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


# ── YAML node helpers ─────────────────────────────────────────────────────
# These walk the NODE stream (yaml.compose) rather than yaml.safe_load's plain
# dicts, because safe_load throws away the one thing GitHub's duplicate-key rule
# needs: source order. YAML 1.1 resolves a bare `on` to boolean true, so a file
# carrying both `on:` and `"on":` comes back as two SEPARATE dict keys, `True`
# and `"on"`, and nothing in the dict says which was written last. Measured:
#
#     on: push                 ->  keys ['name', True, 'on'], and reading doc[True]
#     "on":                        answers `push` while GitHub runs the LATER
#       workflow_run:              workflow_run block. The reverse order invents a
#         types: [completed]       watcher that GitHub does not have.
#
# Both directions were wrong, in opposite directions (Codex, #368 round 20). The
# node stream preserves ['name', 'on', 'on'], so last-wins is readable from it.
#
# This is ~25 lines of mapping lookup, not a YAML implementation — the parsing is
# still PyYAML's. It mirrors workflow-ref-guard.py's `mapping_get`/`on_node`,
# which solved this same problem over four rounds; that file is a script rather
# than an importable module, so the two are kept in step by hand. If a third
# consumer appears, make it a module instead of copying again.


def _mapping_get(node, key):
    """Value node for `key`, matched on raw scalar text so `types:`, `'types':`
    and `"types":` are one key. LAST match wins — the same rule PyYAML and GitHub
    both apply to a duplicated key."""
    if not isinstance(node, yaml.MappingNode):
        return None
    found = None
    for key_node, value_node in node.value:
        if isinstance(key_node, yaml.ScalarNode) and key_node.value == key:
            found = value_node
    return found


def _on_node(root):
    """The value of the root `on:` key, whichever spelling came LAST.

    `on:` is bool-tagged and `"on":` is str-tagged, but both are the trigger key;
    `ON:`/`yes:`/`true:` are bool-tagged too. A quoted `"ON":` is NOT the trigger
    key — it is str-tagged and GitHub's keys are case-sensitive, so it is
    genuinely a different key.
    """
    if not isinstance(root, yaml.MappingNode):
        return None
    found = None
    for key_node, value_node in root.value:
        if not isinstance(key_node, yaml.ScalarNode):
            continue
        if key_node.value == "on" or (
            key_node.tag == "tag:yaml.org,2002:bool"
            and key_node.value.lower() in ("true", "yes", "y", "on")
        ):
            found = value_node
    return found


def _is_empty_scalar(node):
    return node.tag == "tag:yaml.org,2002:null" or not node.value.strip()


def terminal_state_watcher(path, text):
    """True when this workflow fires on `workflow_run` with `completed` among its types."""
    try:
        root = yaml.compose(text)
    except yaml.YAMLError as exc:
        raise Unreadable(f"{path}: not parseable as YAML — {exc}")

    on = _on_node(root)
    if on is None:
        return False
    # `on: push` or `on: [push, pull_request]` cannot carry a workflow_run block;
    # _mapping_get returns None for a non-mapping, so both fall through to False.
    wr = _mapping_get(on, "workflow_run")
    if wr is None:
        return False

    if isinstance(wr, yaml.ScalarNode):
        if _is_empty_scalar(wr):
            return True          # `workflow_run:` with no body — default types
        raise Unreadable(
            f"{path}: `on.workflow_run` is the scalar {wr.value!r}, not a mapping — "
            f"this guard cannot tell which activity types it declares."
        )
    if not isinstance(wr, yaml.MappingNode):
        raise Unreadable(
            f"{path}: `on.workflow_run` is a {type(wr).__name__}, not a mapping — "
            f"this guard cannot tell which activity types it declares."
        )

    types = _mapping_get(wr, "types")
    if types is None:
        # GitHub: omitting `types` runs the workflow for ALL activity types of the
        # event, and `completed` is one of workflow_run's — so an un-typed
        # `workflow_run:` IS a terminal-state watcher.
        #
        # This reading could not be verified from here (docs.github.com is blocked
        # by the egress proxy) and nothing in this tree corroborates it: every live
        # watcher spells `types: [completed]`. It is kept because of the DIRECTION
        # of its error, not because it is certain. True over-counts a future
        # un-typed watcher, which surfaces as a loud `missing:`/`not matching:`
        # failure someone investigates; False would silently omit a real watcher,
        # which is the fail-open this guard exists to prevent. Pinned by a case
        # rather than by a live file — see check-learnings-derived-cases.py.
        return True
    if isinstance(types, yaml.ScalarNode):
        if _is_empty_scalar(types):
            return True
        return types.value == "completed"
    if isinstance(types, yaml.SequenceNode):
        for item in types.value:
            if not isinstance(item, yaml.ScalarNode):
                raise Unreadable(
                    f"{path}: an entry in `on.workflow_run.types` is a "
                    f"{type(item).__name__}, not a scalar — teach this guard that "
                    f'form rather than letting it read as "no match".'
                )
        # Compared as written text. A non-string scalar (`types: [completed, 3]`)
        # is not an activity type GitHub accepts, but it does not stop the trigger
        # declaring `completed`, and the question here is only whether it does.
        return any(item.value == "completed" for item in types.value)
    raise Unreadable(
        f"{path}: `on.workflow_run.types` is a {type(types).__name__}, which is "
        f"neither a scalar nor a sequence — teach this guard that form rather "
        f'than letting it read as "no match".'
    )


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
                if candidate.suffix not in (".yml", ".yaml"):
                    continue
                name = f"{root}/{candidate.name}"
                # A read failure is a REFUSAL, not an exclusion. This used to
                # `continue`, which is the guard's own fail-open: a workflow that
                # cannot be read is exactly the one most likely to be the drift,
                # and dropping it leaves `missing` and `extra` both empty and the
                # run green (Codex, #368 round 20). There is no `is_file()` filter
                # either, for the same reason — it silently swallowed a DIRECTORY
                # named `x.yml` before any read was attempted.
                #
                # ValueError is in the clause because UnicodeDecodeError is NOT an
                # OSError: a workflow that is not valid UTF-8 used to escape the
                # handler entirely and crash with a traceback.
                try:
                    text = candidate.read_text(encoding="utf-8")
                except (OSError, ValueError) as exc:
                    raise Unreadable(f"{name}: could not be read — {exc}")
                # An Unreadable propagates: a derived set missing the file that could
                # not be read is not a set worth comparing an entry against.
                if rule["match"](name, text):
                    expected.append(name)
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
