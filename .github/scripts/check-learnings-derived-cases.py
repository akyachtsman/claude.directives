#!/usr/bin/env python3
"""check-learnings-derived-cases.py — guards check-learnings-derived.py.

WHY: that guard prints the same ✅ whether its predicate works or classifies nothing
at all. Its whole value is being trusted when it is quiet, and it has now been wrong
twice in review — once counting a COMMENTED-OUT trigger, once reading four valid YAML
spellings as "no match". Neither was visible from its output. Nothing else in this
repo exercises it: the live tree contains one shape (`types: [completed]`), so every
other form it claims to handle is unexercised until something here drives it.

Each case builds a throwaway repo — `.github/scripts/<guard>`, `learnings.jsonl`,
`.github/workflows/` — and runs the SHIPPED guard against it, because the guard
resolves its own root from `__file__`.

Classification is asserted INDIRECTLY, and deliberately so. A fixture holds exactly
one workflow and an entry listing no workflow files, so:
    should match    -> exit 1, "missing: <path>"      (the entry failed to list it)
    should not match-> exit 0                          (nothing to list)
    unclassifiable  -> exit 1, "could not be classified"
That routes every case through the guard's real comparison rather than through a
predicate called directly, so a case cannot pass against a predicate the guard has
stopped consulting.

Re-prove discrimination by pointing it at a deliberately broken copy:
    CHECK_LEARNINGS_DERIVED_BIN=/tmp/mutant.py python3 .github/scripts/check-learnings-derived-cases.py

TWO THINGS THAT MADE THE MEASUREMENT HONEST, both learned the hard way here:

  * `ast.parse` every mutant before running it. The first batch produced three
    that did not parse; they failed every case and looked like perfect
    discrimination. A mutant that cannot run measures nothing — the same
    pass/did-not-look confusion these guards exist to prevent, one level out.

  * Ask which cases NO mutant kills, not just how many each kills. Collect the
    FAIL labels across every mutant, union them, and subtract from the full case
    list; anything left is a case that has never been observed failing. Targeted
    mutants alone left 20 of 62 unaccounted for, because none of them breaks the
    happy path. Coarse mutants (always-True, always-False, one root instead of
    two, no suffix filter) close that gap: with those, 62 of 62 are killed and no
    case is vacuous. A per-mutant count can look healthy while whole cases sit
    inert, and only the union shows it.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
GUARD = Path(os.environ.get(
    "CHECK_LEARNINGS_DERIVED_BIN",
    REPO_ROOT / ".github" / "scripts" / "check-learnings-derived.py",
))
KEY = "a-terminal-state-watcher-cannot-see-a-hang"

# Sentinels: this workflow "file" is actually a directory, or a symlink to the
# given target. Marked rather than inferred, so a case cannot make one by accident.
DIRECTORY = object()


class SYMLINK:
    def __init__(self, target):
        self.target = target

failures = []
passes = 0


def entry(files):
    return json.dumps({
        "ts": "2026-09-18T00:00:00Z", "type": "pattern", "key": KEY,
        "text": "fixture", "confidence": 9, "files": files,
    })


def run(workflows, lines, templates=None):
    """Build a fixture repo and run the guard in it. -> (exit, stdout+stderr)"""
    tmp = Path(tempfile.mkdtemp())
    try:
        (tmp / ".github" / "scripts").mkdir(parents=True)
        (tmp / ".github" / "workflows").mkdir(parents=True)
        (tmp / "templates" / "workflows").mkdir(parents=True)
        shutil.copy(GUARD, tmp / ".github" / "scripts" / "check-learnings-derived.py")
        for name, body in (workflows or {}).items():
            target = tmp / ".github" / "workflows" / name
            if body is DIRECTORY:
                target.mkdir()
            elif isinstance(body, SYMLINK):
                real = tmp / "elsewhere.yml"
                real.write_text(body.target, encoding="utf-8")
                target.symlink_to(real)
            elif isinstance(body, bytes):
                target.write_bytes(body)
            else:
                target.write_text(body, encoding="utf-8")
        for name, body in (templates or {}).items():
            (tmp / "templates" / "workflows" / name).write_text(body, encoding="utf-8")
        (tmp / "learnings.jsonl").write_text("\n".join(lines) + "\n", encoding="utf-8")
        proc = subprocess.run(
            [sys.executable, str(tmp / ".github" / "scripts" / "check-learnings-derived.py")],
            capture_output=True, text=True, cwd=str(tmp),
        )
        return proc.returncode, proc.stdout + proc.stderr
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def case(label, *, expect_exit, expect_text=None, **kw):
    global passes
    code, out = run(**kw)
    ok = code == expect_exit and (expect_text is None or expect_text in out)
    if ok:
        passes += 1
        print(f"OK:   {label} (exit {code})")
    else:
        detail = f"expected exit {expect_exit}"
        if expect_text:
            detail += f' containing "{expect_text}"'
        failures.append(f"{label}: {detail}, got exit {code}\n{out.rstrip()}")
        print(f"FAIL: {label}")


def matches(label, body, *, name="w.yml"):
    """This workflow IS a terminal-state watcher, so an entry listing nothing fails."""
    case(label, workflows={name: body}, lines=[entry([])],
         expect_exit=1, expect_text=f"missing: .github/workflows/{name}")


def ignores(label, body, *, name="w.yml"):
    """This workflow is NOT one, so an entry listing nothing is correct."""
    case(label, workflows={name: body}, lines=[entry([])], expect_exit=0)


def refuses(label, body, *, name="w.yml"):
    case(label, workflows={name: body}, lines=[entry([])],
         expect_exit=1, expect_text="could not be classified")


JOB = "jobs:\n  j:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: echo hi\n"

# ── the spelling that lives in the tree, and the ones that did not ──────────
matches("types: [completed] — the shipped spelling",
        f"name: W\non:\n  workflow_run:\n    workflows: [X]\n    types: [completed]\n{JOB}")
matches("types: [ completed ] — spaces inside the flow sequence",
        f"name: W\non:\n  workflow_run:\n    workflows: [X]\n    types: [ completed ]\n{JOB}")
matches("types: as a block sequence",
        f"name: W\non:\n  workflow_run:\n    workflows: [X]\n    types:\n      - completed\n{JOB}")
matches("types : [completed] — space BEFORE the colon (round 19)",
        f"name: W\non:\n  workflow_run:\n    workflows: [X]\n    types : [completed]\n{JOB}")
matches("a quoted 'workflow_run': key (round 19)",
        f"name: W\non:\n  'workflow_run':\n    workflows: [X]\n    types: [completed]\n{JOB}")
matches("the inline flow mapping form (round 19)",
        f"name: W\non: {{workflow_run: {{workflows: [X], types: [completed]}}}}\n{JOB}")
matches("an ANCHOR on types — the form the old scan refused",
        f"name: W\non:\n  workflow_run:\n    workflows: [X]\n    types: &t [completed]\n{JOB}")
matches("an ALIAS resolving to the types list",
        f"name: W\nx: &t [completed]\non:\n  workflow_run:\n    workflows: [X]\n    types: *t\n{JOB}")
refuses("types as a bare scalar — the docs only ever show a sequence",
        f"name: W\non:\n  workflow_run:\n    workflows: [X]\n    types: completed\n{JOB}")
matches("completed alongside other activity types",
        f"name: W\non:\n  workflow_run:\n    workflows: [X]\n    types: [requested, completed]\n{JOB}")

# ── the `on:` key itself, which YAML 1.1 turns into a boolean ───────────────
matches("bare `on:` resolves to True and is still the trigger key",
        f"name: W\non:\n  workflow_run:\n    types: [completed]\n{JOB}")
refuses("`ON:` is bool-tagged by PyYAML — that is this parser, not GitHub's syntax",
        f"name: W\nON:\n  workflow_run:\n    types: [completed]\n{JOB}")
refuses("`yes:` likewise — a round-tripped boolean spelling is not a verdict",
        f"name: W\nyes:\n  workflow_run:\n    types: [completed]\n{JOB}")
refuses("`true:` likewise",
        f"name: W\ntrue:\n  workflow_run:\n    types: [completed]\n{JOB}")
matches("a quoted \"on\": is the trigger key",
        f'name: W\n"on":\n  workflow_run:\n    types: [completed]\n{JOB}')
ignores("a quoted \"ON\": is a DIFFERENT key, not the trigger",
        f'name: W\n"ON":\n  workflow_run:\n    types: [completed]\n{JOB}')
refuses("a duplicated bare `on:` — refused, not resolved to a winner",
        f"name: W\non:\n  push:\n    branches: [main]\non:\n  workflow_run:\n    types: [completed]\n{JOB}")

# ── default activity types: unexercised by the live tree, pinned here ───────
matches("`workflow_run:` with NO types: — defaults include completed",
        f"name: W\non:\n  workflow_run:\n    workflows: [X]\n{JOB}")
matches("`workflow_run:` with an EMPTY body",
        f"name: W\non:\n  workflow_run:\n{JOB}")
refuses("`workflow_run: \"\"` — a QUOTED empty string is not an omitted value",
        f'name: W\non:\n  workflow_run: ""\n{JOB}')
refuses("`types: \"\"` — likewise, not the same as omitting types:",
        f'name: W\non:\n  workflow_run:\n    types: ""\n{JOB}')
refuses("`types: \"   \"` — whitespace is not an activity type either",
        f'name: W\non:\n  workflow_run:\n    types: "   "\n{JOB}')
refuses("...and a non-terminal bare scalar refuses too — the form, not the value",
        f"name: W\non:\n  workflow_run:\n    types: requested\n{JOB}")
refuses("`types:` PRESENT but null — the default covers an ABSENT types:, not this",
        f"name: W\non:\n  workflow_run:\n    workflows: [X]\n    types:\n{JOB}")
matches("...while an ABSENT types: does fall back on the documented default",
        f"name: W\non:\n  workflow_run:\n    workflows: [X]\n{JOB}")
matches("...and a null `workflow_run:` does too — it never USES the types keyword",
        f"name: W\non:\n  workflow_run:\n{JOB}")

# ── things that must NOT be counted ─────────────────────────────────────────
ignores("types: [requested] — not a terminal state",
        f"name: W\non:\n  workflow_run:\n    workflows: [X]\n    types: [requested]\n{JOB}")
ignores("a COMMENTED-OUT workflow_run trigger (the pages-monitor defect)",
        f"name: W\n# on:\n#   workflow_run:\n#     types: [completed]\non:\n  page_build:\n{JOB}")
ignores("workflow_run only in an EXPRESSION, no trigger (pages-monitor.yml:61)",
        "name: W\non:\n  page_build:\njobs:\n  j:\n    runs-on: ubuntu-latest\n"
        "    timeout-minutes: 5\n    steps:\n      - run: echo hi\n"
        "        env:\n          C: ${{ github.event.workflow_run.conclusion }}\n")
ignores("workflow_run inside a `run: |` body is not a trigger",
        "name: W\non:\n  push:\njobs:\n  j:\n    runs-on: ubuntu-latest\n"
        "    timeout-minutes: 5\n    steps:\n      - run: |\n          echo 'on:'\n"
        "          echo '  workflow_run:'\n          echo '    types: [completed]'\n")
ignores("`on: push` — a scalar cannot carry workflow_run", f"name: W\non: push\n{JOB}")
ignores("`on: [push, pull_request]` — nor can a sequence",
        f"name: W\non: [push, pull_request]\n{JOB}")
ignores("a workflow with no `on:` at all", f"name: W\n{JOB}")
ignores("a non-YAML-mapping document", "- just\n- a\n- list\n")
case("a non-.yml file in the directory is not a workflow",
     workflows={"notes.md": "on:\n  workflow_run:\n    types: [completed]\n"},
     lines=[entry([])], expect_exit=0)

# ── refusals: unreadable must never read as "no match" ──────────────────────
refuses("a file that is not parseable YAML", "name: W\non:\n  - [unclosed\n")
refuses("`on.workflow_run` is a scalar, not a mapping",
        f"name: W\non:\n  workflow_run: completed\n{JOB}")
refuses("`on.workflow_run` is a sequence",
        f"name: W\non:\n  workflow_run:\n    - completed\n{JOB}")
refuses("`types:` is a mapping",
        f"name: W\non:\n  workflow_run:\n    types:\n      completed: true\n{JOB}")
refuses("an invalid activity type BESIDE completed — ignore-or-reject is undocumented",
        f"name: W\non:\n  workflow_run:\n    types: [completed, 3]\n{JOB}")
refuses("...and one on its own refuses too, rather than reading as no-match",
        f"name: W\non:\n  workflow_run:\n    types: [bogus]\n{JOB}")
ignores("`in_progress` is a DOCUMENTED type, so it reads as a clean non-match",
        f"name: W\non:\n  workflow_run:\n    types: [in_progress]\n{JOB}")
matches("all three documented types together still declare completed",
        f"name: W\non:\n  workflow_run:\n    types: [requested, in_progress, completed]\n{JOB}")
refuses("a NESTED structure inside types: is refused, not flattened",
        f"name: W\non:\n  workflow_run:\n    types: [[completed]]\n{JOB}")

# ── the entry comparison itself ─────────────────────────────────────────────
W = f"name: W\non:\n  workflow_run:\n    types: [completed]\n{JOB}"
case("an entry listing exactly the matching file passes",
     workflows={"w.yml": W}, lines=[entry([".github/workflows/w.yml"])], expect_exit=0)
case("an entry listing a NON-matching workflow is refused",
     workflows={"w.yml": W, "plain.yml": f"name: P\non:\n  push:\n{JOB}"},
     lines=[entry([".github/workflows/w.yml", ".github/workflows/plain.yml"])],
     expect_exit=1, expect_text="not matching: .github/workflows/plain.yml")
case("prose files OUTSIDE the governed roots are left alone",
     workflows={"w.yml": W},
     lines=[entry([".github/workflows/w.yml", "directives/global.md"])], expect_exit=0)
case("a matching file in templates/workflows is governed too",
     workflows={}, templates={"t.yml": W}, lines=[entry([])],
     expect_exit=1, expect_text="missing: templates/workflows/t.yml")

# ── latest-key-wins, and a declared key that vanished (round 19) ────────────
case("a SUPERSEDED entry with a stale list does not fail the run",
     workflows={"w.yml": W},
     lines=[entry([]), entry([".github/workflows/w.yml"])], expect_exit=0)
case("...and the LATEST entry is the one that must be right",
     workflows={"w.yml": W},
     lines=[entry([".github/workflows/w.yml"]), entry([])],
     expect_exit=1, expect_text="missing: .github/workflows/w.yml")
case("a DERIVED key with no entry at all FAILS rather than skipping",
     workflows={"w.yml": W},
     lines=[json.dumps({"ts": "2026-09-18T00:00:00Z", "type": "pattern",
                        "key": "something-else", "text": "x", "confidence": 5,
                        "files": []})],
     expect_exit=1, expect_text="declared in DERIVED but no entry")
case("a malformed JSONL line is skipped, not fatal — check-learnings.js owns it",
     workflows={"w.yml": W},
     lines=["{not json", entry([".github/workflows/w.yml"])], expect_exit=0)


# ── duplicate `on:` keys across spellings: GitHub takes the LAST (round 20) ──
# safe_load collapses these into separate dict keys (True and "on") and loses the
# order entirely, so both of these were wrong before the node-level rewrite — and
# wrong in OPPOSITE directions, which is why both orderings are pinned.
# Which duplicate wins is UNDOCUMENTED — github/docs @ 2320b38 says nothing about
# duplicate keys or about `on` resolving to a YAML boolean. So these refuse rather
# than resolve: a wrong pick silently drops or invents a watcher, a refusal is loud.
refuses("bare `on:` and quoted \"on\": together — which wins is undocumented",
        f'name: W\non: push\n"on":\n  workflow_run:\n    types: [completed]\n{JOB}')
refuses("...in the other order too — the refusal is not order-dependent",
        f'name: W\non:\n  workflow_run:\n    types: [completed]\n"on": push\n{JOB}')
refuses("`ON:` alongside a bare `on:` — refused on the bool spelling, not as a duplicate",
        f"name: W\non: push\nON:\n  workflow_run:\n    types: [completed]\n{JOB}")
refuses("a duplicated `workflow_run:` inside one `on:`",
        f"name: W\non:\n  workflow_run:\n    types: [requested]\n  \"workflow_run\":\n    types: [completed]\n{JOB}")
refuses("a duplicated `types:` inside one workflow_run",
        f"name: W\non:\n  workflow_run:\n    types: [requested]\n    types: [completed]\n{JOB}")
matches("a quoted \"ON\": is a DIFFERENT key, so it is not a duplicate and the trigger stands",
        f'name: W\non:\n  workflow_run:\n    types: [completed]\n"ON": push\n{JOB}')
matches("a quoted \"on\": on its own IS the trigger key — same raw text as a bare on:",
        f'name: W\n"on":\n  workflow_run:\n    types: [completed]\n{JOB}')

# ── a file that cannot be READ must refuse, never drop out (round 20) ────────
# Dropping it is the guard's own fail-open: an unreadable workflow is exactly the
# one most likely to BE the drift, and excluding it leaves missing and extra both
# empty and the run green.
refuses("a workflow that is not valid UTF-8",
        b"name: W\non:\n  workflow_run:\n    types: [completed]\n# \xff\xfe\n")
refuses("a DIRECTORY named like a workflow — no is_file() filter to swallow it",
        DIRECTORY)
case("a directory named .yaml is refused too, not just .yml",
     workflows={"d.yaml": DIRECTORY}, lines=[entry([])],
     expect_exit=1, expect_text="could not be classified")
case("an unreadable file refuses even when the entry ALREADY lists it",
     workflows={"w.yml": b"name: W\non:\n  workflow_run:\n    types: [completed]\n# \xff\n"},
     lines=[entry([".github/workflows/w.yml"])],
     expect_exit=1, expect_text="could not be classified")

# ── a symlinked candidate is refused, not followed (round 23) ───────────────
case("a symlinked workflow is refused, not read through to its target",
     workflows={"w.yml": SYMLINK(f"name: W\non:\n  workflow_run:\n    types: [completed]\n{JOB}")},
     lines=[entry([])], expect_exit=1, expect_text="is a symlink")
case("...even when the target would NOT have matched — the refusal is about the link",
     workflows={"w.yml": SYMLINK(f"name: W\non:\n  push:\n{JOB}")},
     lines=[entry([])], expect_exit=1, expect_text="is a symlink")
case("...and even when the entry already lists it",
     workflows={"w.yml": SYMLINK(f"name: W\non:\n  workflow_run:\n    types: [completed]\n{JOB}")},
     lines=[entry([".github/workflows/w.yml"])], expect_exit=1, expect_text="is a symlink")

# ── multi-document files: composing refuses rather than guessing ─────────────
refuses("a multi-document YAML file",
        f"name: W\non:\n  workflow_run:\n    types: [completed]\n---\nname: X\n{JOB}")

print()
if failures:
    sys.stderr.write(f"❌ check-learnings-derived-cases: {len(failures)} case(s) FAILED\n\n")
    for f in failures:
        sys.stderr.write("  • " + f + "\n\n")
    raise SystemExit(1)
print(f"✅ check-learnings-derived-cases: OK — {passes} pinned behaviour(s) read correctly.")
