#!/usr/bin/env python3
"""Pinned cases for check-job-bounds.py.

WHY THIS EXISTS. #334 filed this guard for reporting green about a rule it never
ran: a ui-suite caller bounded by an expression landed in `unevaluatable` and
`continue`d PAST the 120-minute floor test, and the pass line went on printing
"ui-suite callers >= 120" over it. The disclosure note said one job was not
range-checked; the assertion in front of it said the rule held. That is a defect
nothing observable distinguishes from a working run -- which is precisely why it
survived, and why the fix needs cases rather than one more hand-check.

#334 also states what those cases have to be:

    a case where the checked thing is present and UNREADABLE, not merely absent.
    A fix verified only against ... workflows with only literal timeouts is inert.

So the refusal cases below all hand the guard a bound it can SEE and cannot READ,
and each is paired with a twin that must NOT fail -- because the exemption for
jobs carrying no floor is deliberate, and a fix that red-builds those has broken
a different rule to defend this one.

Every case pins BOTH the exit code AND a required diagnostic substring: a dozen
distinct problems exit 1 here, so "exit 1" alone would let a case keep passing
while the branch it was written for is reverted and something else catches the
input (the lesson check-workflow-ref-guard.py records from #237).

NOT exported: .github/ is outside every EXPORTS.json category path.

Run: python3 .github/scripts/check-job-bounds-cases.py
"""
import subprocess
import sys
import tempfile
from pathlib import Path

GUARD = Path(__file__).resolve().parent / "check-job-bounds.py"
REPO_ROOT = Path(__file__).resolve().parents[2]

UI_SUITE = "./.github/actions/ui-suite"


def job(bound, *, ui=False, extra="", uses=None):
    """One job. `ui` makes it a ui-suite caller, which is what carries the floor."""
    step = f"      - uses: {uses or UI_SUITE}\n" if (ui or uses) else "      - run: echo hi\n"
    tmo = "" if bound is None else f"    timeout-minutes: {bound}\n"
    return tmo + extra + "    steps:\n" + step


def wf(**jobs):
    body = "".join(f"  {name}:\n    runs-on: ubuntu-latest\n{spec}" for name, spec in jobs.items())
    return "on: push\njobs:\n" + body


# A wrapper composite that itself calls ui-suite. The floor is transitive, so the
# guard must refuse an unreadable bound here too -- renaming or wrapping the
# shipped action is the documented way this check was once dodged.
WRAPPER = (
    "name: 'wrapper'\nruns:\n  using: composite\n  steps:\n"
    f"    - uses: {UI_SUITE}\n"
)

FLOOR_REFUSAL = "expression this check cannot evaluate"

# (label, {workflow name: body}, expected exit, required diagnostic, extra files)
CASES = [
    ['a literal-bounded ui-suite caller clears the floor',
     {"a.yml": wf(ui=job(120, ui=True))}, 0, "ui-suite callers >= 120", {}],

    # ── #334's repro ──────────────────────────────────────────────────────────
    # Before the fix: "✅ … ui-suite callers >= 120.", exit 0, over the only
    # ui-suite caller in the file, which was never tested against 120.
    ['an expression-bounded ui-suite caller is refused (#334)',
     {"a.yml": wf(ui=job("${{ fromJSON('60') }}", ui=True))}, 1, FLOOR_REFUSAL, {}],

    ['a context-dependent expression on a ui-suite caller is refused',
     {"a.yml": wf(ui=job("${{ inputs.tmo }}", ui=True))}, 1, FLOOR_REFUSAL, {}],

    ['a matrix expression on a ui-suite caller is refused',
     {"a.yml": wf(ui=job("${{ matrix.timeout }}", ui=True))}, 1, FLOOR_REFUSAL, {}],

    # The floor follows the composite graph, so the refusal has to as well.
    ['an expression-bounded TRANSITIVE ui-suite caller is refused',
     {"a.yml": wf(ui=job("${{ inputs.tmo }}", uses="./.github/actions/wrapper"))},
     1, FLOOR_REFUSAL, {".github/actions/wrapper/action.yml": WRAPPER}],

    # ── The must-NOT-fail twins ───────────────────────────────────────────────
    # #334 is explicit that the exemption stays valid where no floor applies:
    # "the job IS bounded, which is rule 1, and failing it would red-build a
    # valid workflow." If this case turns red the fix has overreached.
    ['an expression-bounded job with NO floor keeps the exemption',
     {"a.yml": wf(plain=job("${{ inputs.tmo }}"))}, 0, "1 expression-bounded job(s) not range-checked", {}],

    # A job GitHub can see is off incurs no cost, so the cost floors do not apply
    # to it -- the same carve-out the literal path already makes two branches
    # down. Refusing here would fail a parked workflow for a rule it is exempt
    # from.
    # …but exempt is not verified. The expression could resolve below the floor
    # if the job were re-enabled, so the pass line names it instead of folding it
    # into "ui-suite callers >= 120" — the same over-claim as the original
    # defect, one carve-out further in (Codex, #337 round 2).
    ['a statically disabled ui-suite caller keeps the exemption',
     {"a.yml": wf(ui=job("${{ inputs.tmo }}", ui=True, extra="    if: false\n"))},
     0, "1 expression-bounded job(s) not range-checked", {}],

    ['…and the pass line does not credit the floor for it',
     {"a.yml": wf(ui=job("${{ inputs.tmo }}", ui=True, extra="    if: false\n"))},
     0, "disabled caller(s) exempt, so unchecked", {}],

    # Readability is irrelevant: the disabled `continue` sits ABOVE the floor
    # test, so a LITERAL bound below the floor was exempted and uncounted too.
    # Recording the exemption only in the expression branch covered half the
    # cases and left the same over-claim for the other half (Codex, #337 r3).
    ['a disabled ui-suite caller with a literal sub-floor bound is also unchecked',
     {"a.yml": wf(ui=job(60, ui=True, extra="    if: false\n"))},
     0, "disabled caller(s) exempt, so unchecked", {}],

    ['an ENABLED ui-suite caller is still credited plainly',
     {"a.yml": wf(ui=job(130, ui=True))}, 0, "ui-suite callers >= 120.", {}],

    # A CONSTANT expression is not context-dependent, and the guard evaluates it.
    # Both directions pinned: refusing this would be the overreach, and passing
    # the 60 would be the original defect wearing a different literal.
    ['a constant expression clearing the floor still passes',
     {"a.yml": wf(ui=job("${{ 130 }}", ui=True))}, 0, "ui-suite callers >= 120", {}],

    ['a constant expression BELOW the floor fails on the floor itself',
     {"a.yml": wf(ui=job("${{ 60 }}", ui=True))}, 1, "ui-suite callers need >= 120", {}],

    # ── The pass line must not out-claim what it checked ─────────────────────
    # "none >= 360" over a set including jobs the guard skipped is the same
    # over-claim the ui-suite line carried. One literal job plus one exempt
    # expression job: the count in the claim has to be 1, not 2.
    ['the max claim is scoped to the range-checked jobs',
     {"a.yml": wf(plain=job("${{ inputs.tmo }}"), other=job(10))},
     0, "none of the 1 range-checked >= 360", {}],

    # ── Pre-existing branches, pinned so the new code cannot swallow them ─────
    ['a literal ui-suite caller under the floor still fails',
     {"a.yml": wf(ui=job(60, ui=True))}, 1, "ui-suite callers need >= 120", {}],

    ['an unbounded job still fails',
     {"a.yml": wf(plain=job(None))}, 1, "has no timeout-minutes", {}],

    ['a bound at GitHub\'s default still fails',
     {"a.yml": wf(plain=job(360))}, 1, "declaring >= it changes nothing", {}],

    ['a YAML boolean bound still fails',
     {"a.yml": wf(plain=job("true"))}, 1, "not an integer minute count", {}],

    ['a zero bound still fails',
     {"a.yml": wf(plain=job(0))}, 1, "no usable execution", {}],

    ['unparseable YAML fails closed, never counts as empty',
     {"a.yml": "on: push\njobs:\n  a: [\n"}, 1, "never checked", {}],
]


def run_guard(root, extra_args=()):
    r = subprocess.run([sys.executable, str(GUARD), str(root), *extra_args],
                       capture_output=True, text=True, cwd=REPO_ROOT)
    return r.returncode, f"{r.stdout}{r.stderr}".strip()


def main():
    failures = []
    for label, workflows, expected, needle, extra in CASES:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".github/workflows").mkdir(parents=True)
            for name, body in workflows.items():
                (root / ".github/workflows" / name).write_text(body, encoding="utf-8")
            for rel, body in extra.items():
                dest = root / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text(body, encoding="utf-8")
            code, out = run_guard(root)
        if code != expected:
            failures.append(f"{label}\n      expected exit {expected}; got {code}.\n      {out}")
        elif needle not in out:
            failures.append(
                f"{label}\n      exited {code} as expected, but for the wrong stated reason."
                f"\n      expected the output to contain: {needle!r}\n      {out}"
            )
        else:
            print(f"OK:   {label} (exit {code})")

    # The guard must also still pass against THIS repo's real workflows. A suite
    # that only ever sees fixtures can be perfectly green while the shipped
    # workflows are broken -- and this is the run qa.yml actually performs.
    code, out = run_guard(REPO_ROOT, ("--include-templates",))
    if code != 0:
        failures.append(f"this repo's own workflows no longer pass\n      exit {code}\n      {out}")
    else:
        print("OK:   this repo's workflows + templates pass (exit 0)")

    if failures:
        print("\ncheck-job-bounds-cases: FAILED\n")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"\ncheck-job-bounds-cases: OK — {len(CASES) + 1} pinned workflow shapes read correctly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
