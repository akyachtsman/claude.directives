#!/usr/bin/env python3
r"""Guard /refresh-repo's referenced-script derivation against the real callers.

WHY IT EXISTS. refresh-repo Phase 4 derives WHICH .github/scripts/* files a
refresh must install, by grepping the caller workflows/actions it is installing.
That derivation is a PATTERN in a markdown file; the callers are YAML edited
independently. Nothing tied the two together, so a caller could change the FORM
of an invocation and silently fall out of the derivation.

That is not hypothetical. Reported by PROP6 on 2026-09-01 and reproduced here:
the pattern required `node ` or `python3 ` immediately before `.github/`, while
ui-suite/action.yml invokes

    node "$GITHUB_WORKSPACE/.github/scripts/check-ui-viewports.js" --tests-dir .

so the derivation returned NO MATCH for that file. The omission is invisible
wherever the script already exists and installs a red build wherever it does
not — every UI job dies at step resolution. It fails OPEN: a short result looks
exactly like a correct short result, and the procedure's own text (rightly) says
an empty derivation is not automatically wrong.

The tell that it was already known: ui-suite/action.yml carries a hand-written
comment telling you to copy check-ui-viewports.js by hand. Prose compensating
for what the derivation should have caught — enumerate-vs-derive reappearing one
level up, inside the fix for it.

WHAT THIS CHECKS. The pattern is read OUT OF refresh-repo.md rather than copied
here; a copy is the same drift one file over. It is then run against every
shipped caller and compared with a form-independent scan for the same paths. Any
script a caller references that the documented pattern misses is a failure.

MEASURED, 2026-09-01. A guard nobody has run against a mutant is decorative, so
each of these was applied to refresh-repo.md and the result observed. The green
control is the load-bearing one -- three reds prove nothing if the fourth is red
too.

    M1  the old command-prefixed form            -> FAIL, naming check-ui-viewports.js
    M2  `\.(js|py)` with no `$`                  -> FAIL, naming package-lock.json
    M3  pipeline reshaped past the extractor     -> FAIL, naming the extractor
    M4  char class widened to admit `/`          -> OK  (a widening, not a break)

Found by running them: an earlier draft used `findall`, which returns TUPLES for
a pattern carrying capture groups. M1's pattern carries two, so the guard died of
a TypeError on precisely the defect it exists to reject -- exit 1 for the wrong
reason, which a harness reads as a catch.

⚠️ WHAT IT CANNOT CATCH. Ground truth is "the token `.github/scripts/<name>.js|py`
appears in a caller". A caller that referenced a script by some other root, or
built the path by string concatenation, would be invisible to BOTH scans and
this guard would report green. It pins the derivation against invocation-FORM
drift, which is the failure that actually happened; it does not prove the
derivation finds every script a caller could conceivably need.
"""

import re
import sys
from pathlib import Path

COMMAND = Path("plugins/directives-toolkit/commands/refresh-repo.md")
CALLER_GLOBS = ("templates/workflows/*.yml", "templates/actions/*/action.yml")

# The two-stage shape the command documents: grab the whole path token, then
# keep only .js/.py endings. Captured as two regexes so the extension filter is
# applied exactly as the shipped pipeline applies it -- an unterminated
# `\.(js|py)` matches the `.js` inside `.json`, which is why the stages are
# separate rather than one pattern.
TOKEN_LINE = re.compile(r"grep -oE '([^']+)' \"\$buf\"")
FILTER_LINE = re.compile(r"grep -E '([^']+)'")


def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    return 1


def main():
    if not COMMAND.exists():
        return fail(f"{COMMAND} not found — the derivation this guard pins has moved or been deleted.")

    text = COMMAND.read_text(encoding="utf-8")

    token_m = TOKEN_LINE.search(text)
    if not token_m:
        return fail(
            f"could not find the derivation's `grep -oE '<pattern>' \"$buf\"` line in {COMMAND}.\n"
            "      This guard reads the SHIPPED pattern rather than copying it, so it cannot run\n"
            "      if the pipeline is reshaped. Update this extractor in the same change."
        )
    filter_m = FILTER_LINE.search(text[token_m.end():])
    if not filter_m:
        return fail(
            f"found the token grep in {COMMAND} but not the `grep -E '<ext>'` filter after it.\n"
            "      Without the extension stage the derivation matches `.github/scripts/package-lock.json`,\n"
            "      because an unterminated `\\.(js|py)` matches the `.js` inside `.json`."
        )

    try:
        token_re = re.compile(token_m.group(1))
        filter_re = re.compile(filter_m.group(1))
    except re.error as err:
        return fail(f"the derivation's pattern does not compile as a regex: {err}")

    callers = sorted({p for g in CALLER_GLOBS for p in Path().glob(g)})
    if not callers:
        return fail(
            "no caller files matched "
            f"{', '.join(CALLER_GLOBS)} — this guard would pass vacuously, which is the\n"
            "      fail-open shape it exists to prevent."
        )

    documented = set()
    ground_truth = {}
    # Form-independent: the path token anywhere in the file, whatever precedes it.
    truth_re = re.compile(r"\.github/scripts/[A-Za-z0-9_.-]+")

    for caller in callers:
        body = caller.read_text(encoding="utf-8")
        # finditer + group(0), NOT findall: findall returns TUPLES for a pattern
        # carrying capture groups, and the derivation's earlier form carried two
        # (`(node|python3)` and `(js|py)`). With findall this guard crashed with a
        # TypeError on exactly the pattern it exists to reject -- exit 1 for the
        # wrong reason, which reads as a catch and proves nothing.
        for m in token_re.finditer(body):
            hit = m.group(0)
            if filter_re.search(hit):
                documented.add(hit)
        for hit in truth_re.findall(body):
            if hit.endswith(".js") or hit.endswith(".py"):
                ground_truth.setdefault(hit, []).append(str(caller))

    # A prefix-carrying form matches more than the path (`node .github/scripts/x.js`),
    # so compare on the path token the derivation is ultimately after.
    documented = {m.group(0) for h in documented for m in [truth_re.search(h)] if m}

    missed = sorted(set(ground_truth) - documented)
    if missed:
        lines = [
            "the documented derivation MISSES script(s) a shipped caller references.",
            "      A refresh installing that caller would not install the script, and the",
            "      job dies at step resolution on any project that lacks it.",
            "",
        ]
        for script in missed:
            lines.append(f"      MISSED: {script}")
            for where in ground_truth[script]:
                lines.append(f"              referenced by {where}")
        lines.append("")
        lines.append(f"      documented pattern: {token_m.group(1)}  then  {filter_m.group(1)}")
        lines.append(f"      Fix the pattern in {COMMAND}, not this guard.")
        return fail("\n".join(lines))

    # Extras split in two, and the split is the whole point -- "matches more than
    # ground truth" is NOT one condition.
    #
    #   * ends .js/.py -> a NOTE. The only way to get here is a pattern whose char
    #     class admits `/`, so it matches a nested `.../ui-tests/app.spec.js` that
    #     the (slash-free) truth scan truncates. That is a widening, not a break,
    #     and the asymmetry favours it: installing a script nothing referenced
    #     costs a file, missing one ships a red build.
    #
    #   * does NOT end .js/.py -> a FAILURE. The derivation's declared contract is
    #     .js/.py under .github/scripts/, so this is the pattern accepting
    #     something outside its own contract. The live instance:
    #     `grep -E '\.(js|py)'` unterminated matches the `.js` inside `.json`, so
    #     `.github/scripts/package-lock.json` enters the install list as a script.
    #     Printing that and exiting 0 is the fail-open shape (#323) -- a green run
    #     with a note nobody reads is indistinguishable from a guard that passed.
    extra = sorted(documented - set(ground_truth))
    off_contract = [s for s in extra if not s.endswith((".js", ".py"))]
    if off_contract:
        lines = [
            "the documented derivation matches path(s) OUTSIDE its own contract.",
            "      It is meant to yield .js/.py under .github/scripts/. These are neither,",
            "      so a refresh would install them as scripts:",
            "",
        ]
        lines += [f"      OFF-CONTRACT: {s}" for s in off_contract]
        lines += [
            "",
            "      The usual cause is an unterminated extension filter: `\\.(js|py)` with",
            "      no `$` matches the `.js` inside `.json`.",
            f"      documented pattern: {token_m.group(1)}  then  {filter_m.group(1)}",
            f"      Fix the pattern in {COMMAND}, not this guard.",
        ]
        return fail("\n".join(lines))

    for script in extra:
        print(f"note: derivation also matches {script}, which the truth scan does not reach")

    print(
        f"check-refresh-derivation: OK — {len(ground_truth)} referenced script(s) "
        f"across {len(callers)} caller(s), all found by the documented pattern"
    )
    for script in sorted(ground_truth):
        print(f"  {script}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
