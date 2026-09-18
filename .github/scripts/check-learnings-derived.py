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


# The activity types workflow_run declares, from github/docs @ 2320b38,
# events-that-trigger-workflows.md -> `workflow_run`. An item outside this set is
# not something GitHub accepts, and whether it ignores the item or rejects the
# whole trigger is undocumented — so the sequence is refused rather than read
# past (Codex, #368 round 23).
ACTIVITY_TYPES = ("completed", "requested", "in_progress")

NULL_TAG = "tag:yaml.org,2002:null"
BOOL_TAG = "tag:yaml.org,2002:bool"


def _mapping_get_all(node, key):
    """Every value node for `key`, in source order.

    Keys match on raw scalar text, so `types:`, `'types':` and `"types":` are one
    key — the quoting is the formatter's business. ALL of them are returned rather
    than just the last, because the caller refuses a duplicate rather than picking
    one; see _root_on_nodes.
    """
    if not isinstance(node, yaml.MappingNode):
        return []
    return [v for k, v in node.value
            if isinstance(k, yaml.ScalarNode) and k.value == key]


def _root_on_nodes(root):
    """(trigger value nodes, undocumented bool-spelled keys) from the root mapping.

    A key is the trigger key when its RAW TEXT is exactly `on`. That covers the
    bare `on:` and the quoted `"on":`, which differ only in PyYAML's tag.

    It deliberately does NOT cover `ON:`, `On:`, `yes:` or `true:`. Those are
    bool-tagged by PyYAML's YAML 1.1 resolution, and that tag describes THIS
    parser, not GitHub's workflow syntax — GitHub's keys are case-sensitive and
    nothing documents the boolean-key behaviour at all (Codex, #368 round 22).
    Treating them as the trigger would invent a watcher out of a round-tripped
    `true:` or an `ON:` typo, and pairing one with a real `on:` would raise a
    FALSE duplicate refusal. They are returned separately so the caller can refuse
    on them rather than silently guess in either direction.
    """
    if not isinstance(root, yaml.MappingNode):
        return [], []
    triggers, bool_spelled = [], []
    for key_node, value_node in root.value:
        if not isinstance(key_node, yaml.ScalarNode):
            continue
        if key_node.value == "on":
            triggers.append(value_node)
        elif key_node.tag == BOOL_TAG:
            bool_spelled.append(key_node.value)
    return triggers, bool_spelled


def _is_null(node):
    """A key written with NO value.

    Tag only. Testing `not node.value.strip()` as well treated a QUOTED empty
    string as an omission, so `workflow_run: ""` invented a terminal-state
    watcher (Codex, #368 round 21). PyYAML tags `""` as str and a valueless key
    as null; that tag is the whole difference and the text cannot show it.
    """
    return node.tag == NULL_TAG


# ── What this predicate will and will not answer ─────────────────────────────
# Every branch below is one of two things, and the split is the whole design:
#
#   VERDICT, because github/docs @ 2320b38 documents the behaviour
#     * a root key whose text is `on` is the trigger key    (every example)
#     * NO root key resolving to `on`                       -> not a watcher
#     * a root that is not a mapping at all                 -> not a watcher
#     * `on:` holding no `workflow_run` key                 -> not a watcher
#     * `on:` that is not a mapping (`on: push`, `on: [x]`) -> not a watcher
#     * `workflow_run:` with NO value                       -> defaults apply
#     * `types` ABSENT                                      -> defaults apply
#     * `types` as a SEQUENCE of documented activity types  -> membership
#   REFUSE, because nothing documents it and a wrong guess is SILENT
#     * the file is not parseable as YAML, or holds >1 document
#     * a bool-spelled root key (`ON:`, `yes:`, `true:`)
#     * the trigger key, `workflow_run:` or `types:` written TWICE
#     * `workflow_run` as a non-null scalar, or as a sequence
#     * `types` PRESENT but null, or any scalar, or a mapping
#     * a sequence item that is not a scalar, or not a documented activity type
#   (The caller adds two more refusals of its own, for a candidate that is a
#    SYMLINK and for one that cannot be read at all. They are listed at that
#    site, not here, because they are about the file rather than its contents.)
#
# ⚠️ This list is only worth having if it is EXHAUSTIVE — a reader is entitled to
# treat anything absent from it as not happening. Round 23 found three branches
# missing from an earlier version of it (the parse failure and the two
# not-a-mapping verdicts). Add the branch here in the same edit that adds it
# below, or delete the list rather than let it become a coverage claim that is
# not one.
#
# The refusals are affordable because every one of them is a form no real
# workflow contains: `types` appears as a sequence in every example in the docs
# and never as a bare scalar, and `on` appears bare and lower-case every time.
# That is what keeps "refuse rather than guess" from degrading into refusing
# things people actually write.
#
# ⚠️ Note the asymmetry between a null `workflow_run:` and a null `types:`, which
# is deliberate. A null `workflow_run:` does not USE the `types` keyword, so the
# documented default applies to it directly. A null `types:` DOES use the keyword,
# with no value, and what GitHub does with that is not documented anywhere —
# limit to nothing, ignore it, or reject the file. So the first is a verdict and
# the second is a refusal.
def terminal_state_watcher(path, text):
    """True when this workflow fires on `workflow_run` with `completed` among its types."""
    try:
        root = yaml.compose(text)
    except yaml.YAMLError as exc:
        raise Unreadable(f"{path}: not parseable as YAML — {exc}")

    ons, bool_spelled = _root_on_nodes(root)
    if bool_spelled:
        raise Unreadable(
            f"{path}: the root mapping carries {bool_spelled!r}, which YAML 1.1 "
            f"resolves to a boolean. Whether GitHub reads that as the `on:` trigger "
            f"key is undocumented, so this guard will not guess — write `on:`."
        )
    if not ons:
        return False
    if len(ons) > 1:
        raise Unreadable(
            f"{path}: the root mapping carries {len(ons)} `on:` keys (a bare and a "
            f"quoted one count as two). Which wins is undocumented, so this guard "
            f"will not guess — write exactly one."
        )
    on = ons[0]

    # `on: push` and `on: [push]` are not mappings, so no workflow_run can exist.
    wrs = _mapping_get_all(on, "workflow_run")
    if not wrs:
        return False
    if len(wrs) > 1:
        raise Unreadable(
            f"{path}: `on:` carries {len(wrs)} `workflow_run:` keys. Which wins is "
            f"undocumented, so this guard will not guess — write exactly one."
        )
    wr = wrs[0]

    if isinstance(wr, yaml.ScalarNode):
        if _is_null(wr):
            # No `types` keyword is used, so the documented default applies:
            # events-that-trigger-workflows.md pulls in limit_workflow_to_activity_
            # types.md — "By default, all activity types trigger workflows that run
            # on this event" — and workflow_run's types are completed / requested /
            # in_progress.
            return True
        raise Unreadable(
            f"{path}: `on.workflow_run` is the scalar {wr.value!r}, not a mapping — "
            f"this guard cannot tell which activity types it declares."
        )
    if not isinstance(wr, yaml.MappingNode):
        raise Unreadable(
            f"{path}: `on.workflow_run` is a {type(wr).__name__}, not a mapping — "
            f"this guard cannot tell which activity types it declares."
        )

    types_nodes = _mapping_get_all(wr, "types")
    if len(types_nodes) > 1:
        raise Unreadable(
            f"{path}: `on.workflow_run` carries {len(types_nodes)} `types:` keys. "
            f"Which wins is undocumented, so this guard will not guess — write "
            f"exactly one."
        )
    if not types_nodes:
        # ⚠️ The default is PER EVENT, not a general rule — do not carry this
        # reasoning to another event. `pull_request` does not use that reusable and
        # documents a narrower default (opened / synchronize / reopened), so the
        # same argument there would silently misclassify.
        return True
    types = types_nodes[0]

    if not isinstance(types, yaml.SequenceNode):
        what = "null" if _is_null(types) else f"a {type(types).__name__}"
        raise Unreadable(
            f"{path}: `on.workflow_run.types` is {what}. Every example in the docs "
            f"writes it as a sequence and none writes a bare scalar, so what GitHub "
            f"does with this form is unestablished — and unlike an ABSENT `types:`, "
            f"a present one cannot fall back on the documented default. This guard "
            f"will not guess."
        )
    for item in types.value:
        if not isinstance(item, yaml.ScalarNode):
            raise Unreadable(
                f"{path}: an entry in `on.workflow_run.types` is a "
                f"{type(item).__name__}, not a scalar — teach this guard that form "
                f'rather than letting it read as "no match".'
            )
        if item.value not in ACTIVITY_TYPES:
            # An earlier version read past this, reasoning that a junk sibling
            # does not stop the trigger declaring `completed`. That is an
            # inference, not something the docs establish: GitHub may ignore the
            # bad item or reject the whole trigger, and the two give opposite
            # answers here.
            raise Unreadable(
                f"{path}: `on.workflow_run.types` contains {item.value!r}, which is "
                f"not one of {', '.join(ACTIVITY_TYPES)}. Whether GitHub ignores an "
                f"invalid activity type or rejects the trigger is undocumented, so "
                f"this guard will not guess."
            )
    return any(item.value == "completed" for item in types.value)


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
                # A symlink is refused rather than followed. `read_text()` would
                # read the TARGET, so the guard would classify content that is not
                # this workflow — and git stores a symlink as its link PATH, not
                # as that target's YAML, so the verdict would come from checkout
                # filesystem behaviour rather than from what GitHub receives. It
                # can also reach outside both governed roots entirely (Codex,
                # #368 round 23).
                if candidate.is_symlink():
                    raise Unreadable(
                        f"{name}: is a symlink. What GitHub does with a symlinked "
                        f"workflow file is unestablished, and reading through it "
                        f"would classify the target's contents as this file's."
                    )
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
