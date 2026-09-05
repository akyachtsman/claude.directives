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
not -- every UI job dies at step resolution. It fails OPEN: a short result looks
exactly like a correct short result, and the procedure's own text (rightly) says
an empty derivation is not automatically wrong.

The tell that it was already known: ui-suite/action.yml carries a hand-written
comment telling you to copy check-ui-viewports.js by hand. Prose compensating
for what the derivation should have caught -- enumerate-vs-derive reappearing one
level up, inside the fix for it.

WHAT THIS CHECKS. The pattern is read OUT OF refresh-repo.md rather than copied
here; a copy is the same drift one file over. It is then run -- through real
`grep -E`, see below -- against every shipped caller and compared with a
form-independent scan, THREE ways:

  1. PER CALLER. A script a caller references must be found in THAT caller. An
     aggregate set hides a miss: if `shared.py` is matched in qa.yml but its
     other invocation form is missed in an action, the union still contains it
     and the check passes -- while a refresh installing only that action derives
     nothing for it. /refresh-repo processes a SUBSET of callers, so the union is
     not the thing to check.
  2. CONCATENATED, the way the shipped loop builds `$buf`. `>>` concatenates and
     a YAML file need not end in a newline, so a caller whose last scalar ends in
     a script path merges into the next file's first word: `.github/scripts/a.js`
     + `name:` = `.github/scripts/a.jsname`, consumed whole by the token grep and
     dropped by the extension filter. The script vanishes with no error. This
     defect exists ONLY in the concatenation, so check 1 is structurally blind to
     it. Whether the loop delimits is read out of the command text, not assumed.
  3. OFF-CONTRACT. Anything the pattern accepts that is not .js/.py under
     .github/scripts/ -- see the extras split below.

WHY grep AND NOT `re`. An earlier version compiled the extracted patterns with
Python's `re` and matched with Python. The shipped pipeline runs GNU `grep -E`,
a DIFFERENT engine, and the two disagree in the dangerous direction: the common
Python form `\.(?:js|py)$` compiles and matches under `re`, while `grep -E`
warns "? at start of expression" and matches nothing. The documented pipeline
ends in `| sort -u`, so the pipeline's exit status is sort's -- 0 -- and the
derivation silently returns EMPTY while this guard reports OK. Certifying one
engine's behaviour to vouch for another's is the fail-open family (#323) inside
the guard written to prevent it. Caught by Codex on #345. So: every pattern is
executed by `grep -E` itself, and grep writing ANYTHING to stderr is a failure,
because that is how it reports a construct it will then silently not match.

⚠️ WHAT IT CANNOT CATCH. Ground truth is "the token `.github/scripts/<name>.js|py`
appears in a caller". A caller that referenced a script by some other root, or
built the path by string concatenation, would be invisible to BOTH scans and
this guard would report green. It pins the derivation against invocation-FORM
drift, which is the failure that actually happened; it does not prove the
derivation finds every script a caller could conceivably need.
"""

import re
import subprocess
import sys
from pathlib import Path

COMMAND = Path("plugins/directives-toolkit/commands/refresh-repo.md")
# directives/*.md joined the set in directives#355: `test.md` names
# `.github/scripts/browser-ladder.js`, which no workflow or composite invokes,
# so a YAML-only caller set derived nothing for it and a refresh shipped the
# directive without the script it tells you to run.
CALLER_GLOBS = ("templates/workflows/*.yml", "templates/actions/*/action.yml",
                "directives/*.md")

# The two-stage shape the command documents: grab the whole path token, then
# keep only .js/.py endings. Captured as two regexes so the extension filter is
# applied exactly as the shipped pipeline applies it -- an unterminated
# `\.(js|py)` matches the `.js` inside `.json`, which is why the stages are
# separate rather than one pattern.
TOKEN_LINE = re.compile(r"grep -oE '([^']+)' \"\$buf\"")
FILTER_LINE = re.compile(r"grep -E '([^']+)'")

# Does the fetch loop put a boundary between concatenated callers? Read, not
# assumed -- this guard models whatever the command actually does.
DELIMITER_LINE = re.compile(r"(printf\s+'\\n'|echo)\s*>>\s*\"\$buf\"")

# Form-independent: the path token anywhere in the file, whatever precedes it.
# SLASH-AWARE, and that is load-bearing twice over. `templates/ui-tests/` installs
# to `.github/scripts/ui-tests/`, so a script one directory down is a reference
# waiting to happen. While this class excluded `/`:
#   * a caller referencing `.github/scripts/nested/a.py` was invisible to ground
#     truth AND truncated to `.github/scripts/nested` by the derivation, so the
#     script was silently omitted and this guard reported OK — the same fail-open
#     it exists to close, one directory down; and
#   * it truncated a legitimately widened pattern's own matches, so a widening
#     was reported as OFF-CONTRACT rather than as the note this file promises.
# A directory reference (`.github/scripts/ui-tests/`) is still excluded, because
# truth keeps only .js/.py endings. Found by Codex on #345 round 2.
TRUTH_RE = re.compile(r"\.github/scripts/[A-Za-z0-9_./-]+")


def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    return 1


def run_grep(args, data):
    """Run one grep stage on `data`. Returns (lines, error_or_None).

    grep exits 1 for "no matches", which is not an error. It exits 2 -- and,
    for some malformed-but-accepted constructs, exits 1 while WARNING on
    stderr -- for a pattern it cannot honour. That warning is the only signal
    distinguishing "matched nothing" from "could not match", and the shipped
    pipeline throws it away, so treat any stderr as fatal here.
    """
    p = subprocess.run(args, input=data, capture_output=True, text=True)
    if p.stderr.strip():
        return [], f"grep wrote to stderr: {p.stderr.strip()}"
    if p.returncode not in (0, 1):
        return [], f"grep exited {p.returncode}"
    return [ln for ln in p.stdout.split("\n") if ln], None


def derive(token_pat, filter_pat, text):
    """Run the SHIPPED two-stage pipeline over `text` using real grep."""
    hits, err = run_grep(["grep", "-oE", token_pat], text)
    if err:
        return None, err
    if not hits:
        return set(), None
    kept, err = run_grep(["grep", "-E", filter_pat], "\n".join(hits) + "\n")
    if err:
        return None, err
    return set(kept), None


def truth(text):
    return {h for h in TRUTH_RE.findall(text) if h.endswith((".js", ".py"))}


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
    token_pat, filter_pat = token_m.group(1), filter_m.group(1)

    callers = sorted({p for g in CALLER_GLOBS for p in Path().glob(g)})
    if not callers:
        return fail(
            "no caller files matched "
            f"{', '.join(CALLER_GLOBS)} — this guard would pass vacuously, which is the\n"
            "      fail-open shape it exists to prevent."
        )

    bodies = {c: c.read_text(encoding="utf-8") for c in callers}

    # ---- check 1: per caller -------------------------------------------------
    missed = []
    documented_all = set()
    for caller in callers:
        got, err = derive(token_pat, filter_pat, bodies[caller])
        if err:
            return fail(
                f"the documented pattern is not usable by the engine that RUNS it.\n"
                f"      {err}\n"
                "      GNU grep -E is not Python's `re`: a construct `re` accepts (e.g. `(?:`)\n"
                "      makes grep warn and match NOTHING, and the pipeline's trailing `sort`\n"
                "      swallows the failure — an empty derivation reported as success.\n"
                f"      token: {token_pat}   filter: {filter_pat}\n"
                f"      Fix the pattern in {COMMAND}, not this guard."
            )
        got = {m.group(0) for h in got for m in [TRUTH_RE.search(h)] if m}
        documented_all |= got
        for script in sorted(truth(bodies[caller]) - got):
            missed.append((script, str(caller)))

    if missed:
        lines = [
            "the documented derivation MISSES script(s) a shipped caller references.",
            "      A refresh installing that caller would not install the script, and the",
            "      job dies at step resolution on any project that lacks it.",
            "      Checked PER CALLER: /refresh-repo installs a SUBSET, so another caller",
            "      matching the same script does not save the one that misses it.",
            "",
        ]
        lines += [f"      MISSED: {s}\n              referenced by {w}" for s, w in missed]
        lines += ["", f"      documented pattern: {token_pat}  then  {filter_pat}",
                  f"      Fix the pattern in {COMMAND}, not this guard."]
        return fail("\n".join(lines))

    # ---- check 2: the concatenated buffer ------------------------------------
    # ORDER-INDEPENDENT on purpose. `$callers` is whatever that refresh lists, not
    # a sorted set, and the hazard only bites when a newline-less caller lands
    # BEFORE another. A single concatenation in one arbitrary order tests one
    # permutation and calls it proof -- the first draft did exactly that, put the
    # newline-less fixture last where nothing follows it, and passed a case built
    # to fail. Only callers missing a trailing newline can cause this, so pair
    # each of those against every other caller instead of guessing an order.
    per_caller = set().union(*(truth(b) for b in bodies.values()))
    delimited = bool(DELIMITER_LINE.search(text))
    ragged = [c for c in callers if not bodies[c].endswith("\n")]
    joiner = "\n" if delimited else ""

    lost, lost_pair = [], None
    for first in ragged:
        for second in callers:
            if second is first:
                continue
            buf = bodies[first] + joiner + bodies[second] + joiner
            got, err = derive(token_pat, filter_pat, buf)
            if err:
                return fail(f"the documented pattern failed on the concatenated buffer: {err}")
            got = {m.group(0) for h in got for m in [TRUTH_RE.search(h)] if m}
            dropped = sorted((truth(bodies[first]) | truth(bodies[second])) - got)
            if dropped:
                lost, lost_pair = dropped, (first, second)
                break
        if lost:
            break

    if lost:
        return fail(
            "script(s) survive a per-caller scan but VANISH from the concatenated buffer.\n"
            "      `>>` concatenates and a YAML file need not end in a newline, so a caller\n"
            "      whose last scalar ends in a script path merges into the next file's first\n"
            "      word — `.github/scripts/a.js` + `name:` = `.github/scripts/a.jsname`, which\n"
            "      the token grep consumes whole and the extension filter drops.\n"
            f"      The fetch loop {'DOES' if delimited else 'DOES NOT'} append a delimiter.\n"
            f"      Concatenating {lost_pair[0]} before {lost_pair[1]} loses:\n"
            + "".join(f"      LOST: {s}\n" for s in lost)
            + f"      Append a token boundary after every fetch in {COMMAND}."
        )

    # ---- check 3: extras -----------------------------------------------------
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
    extra = sorted(documented_all - per_caller)
    off_contract = [s for s in extra if not s.endswith((".js", ".py"))]
    if off_contract:
        return fail(
            "the documented derivation matches path(s) OUTSIDE its own contract.\n"
            "      It is meant to yield .js/.py under .github/scripts/. These are neither,\n"
            "      so a refresh would install them as scripts:\n\n"
            + "".join(f"      OFF-CONTRACT: {s}\n" for s in off_contract)
            + "\n      Usual causes: an unterminated extension filter (`\\.(js|py)` with no `$`\n"
            "      matches the `.js` inside `.json`), or a token pattern reaching a path this\n"
            "      guard's ground truth cannot express.\n"
            f"      documented pattern: {token_pat}  then  {filter_pat}\n"
            f"      Fix the pattern in {COMMAND}, not this guard."
        )
    for script in extra:
        print(f"note: derivation also matches {script}, which the truth scan does not reach")

    print(
        f"check-refresh-derivation: OK — {len(per_caller)} referenced script(s) across "
        f"{len(callers)} caller(s), found per-caller, via grep -E"
    )
    if ragged:
        print(
            f"  concatenation: {len(ragged)} caller(s) lack a trailing newline, each paired "
            f"against every other — none lost ({'delimited' if delimited else 'UNDELIMITED'} loop)"
        )
    else:
        print(
            "  concatenation: NOT EXERCISED — every caller ends in a newline, so the "
            "merge hazard cannot arise today; the check stands for a future one"
        )
    for script in sorted(per_caller):
        print(f"  {script}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
