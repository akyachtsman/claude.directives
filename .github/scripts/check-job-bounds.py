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
         subdivide: >= 60
     Rule 3 exists because rule 1 passed the exact defect #238 fixed: every
     broken template job DECLARED a bound; the value was the fault.

────────────────────────────────────────────────────────────────────────────
THIS FILE IS EXPORTED (templates/scripts/check-job-bounds.py, byte-paired with
it) and runs in downstream repos that this repo has never seen. That inverts the
usual risk, and the inversion is the single most important thing to understand
before editing:

    A FALSE POSITIVE COSTS MORE THAN A FALSE NEGATIVE.

A missed defect leaves one bound unchecked, with rules 1-2 still covering it and
the number still in the comment. A guard that red-builds a repo doing nothing
wrong gets DELETED — and takes the real rules with it.

Seven rounds of review on this file produced one finding of the first kind and
eleven of the second, every one from the same mistake: testing a NAME-SHAPE and
treating the result as the FACT. `templates/` present. `EXPORTS.json` present. A
path prefix matching a sibling directory. A docs job that merely MENTIONS
ui-suite. A remote action whose path happens to END in the same segments.

So the classification below is deliberately CONSERVATIVE and EXACT. Where a job
cannot be identified with certainty, rule 3 is not applied. Do not "improve" any
of these into a looser match.
────────────────────────────────────────────────────────────────────────────

Scans .github/workflows always. Scans templates/workflows ONLY with
--include-templates, which this repo's own qa.yml passes and no downstream
workflow does. That flag replaced four successive attempts to DETECT which repo
was running — each was forged by a legitimate downstream layout. An explicit
argument cannot be: removing it is a visible edit to a workflow file in a PR
diff, which is exactly the review surface a silent heuristic did not have.

Composite actions are not scanned as workflows: composite steps cannot carry
timeout-minutes at all, and their ceiling is the calling job's. They ARE read,
transitively, to see whether a caller reaches ui-suite through a local wrapper.
"""

import re
import shlex
import sys
from pathlib import Path, PurePosixPath

try:
    import yaml
except ModuleNotFoundError:
    sys.stderr.write(
        "❌ check-job-bounds: PyYAML is not installed. It ships with GitHub's "
        "runner images; on a bare host: pip install PyYAML.\n"
    )
    raise SystemExit(1)

KNOWN_FLAGS = {"--include-templates"}

args = [a for a in sys.argv[1:] if not a.startswith("--")]
flags = {a for a in sys.argv[1:] if a.startswith("--")}

# FAIL on an unknown flag. `--include-template` (singular) would otherwise be
# accepted, silently leave the template scan off, and exit GREEN having checked
# half the tree — recreating the exact failure the flag was introduced to close.
# A fix for silent narrowing that is itself silently narrowable is not a fix.
unknown = sorted(flags - KNOWN_FLAGS)
if unknown:
    sys.stderr.write(
        "❌ check-job-bounds: unknown flag(s): " + ", ".join(unknown) + "\n"
        "   Known: " + ", ".join(sorted(KNOWN_FLAGS)) + "\n"
        "   Refusing to run rather than silently narrowing the scan — a typo here\n"
        "   would drop templates/workflows from the scan and still exit 0.\n"
    )
    raise SystemExit(1)

INCLUDE_TEMPLATES = "--include-templates" in flags

REPO_ROOT = Path(args[0]).resolve() if args else Path(__file__).resolve().parents[2]

SCAN_DIRS = [".github/workflows"]
if INCLUDE_TEMPLATES:
    SCAN_DIRS.append("templates/workflows")

GITHUB_DEFAULT = 360
BROWSER_FLOOR = 30
UI_SUITE_FLOOR = 60

# The shipped composite, as a LOCAL reference. `./` is load-bearing: a remote
# `acme/tools/.github/actions/ui-suite@v1` is a different action that merely ends
# in the same segments, and applying a 60-minute floor to it red-builds a repo
# using an unrelated fast action.
UI_SUITE_LOCAL = "./.github/actions/ui-suite"

# An actual invocation at a COMMAND POSITION — not the phrase anywhere in a
# script. `rg 'playwright install' docs/` mentions it; it does not run it, and a
# five-minute docs job must not be forced to 30.
# Deciding whether a `run:` block INVOKES playwright is a shell-parsing question,
# and three rounds of regexes proved it is not a regex question. Each pattern was
# correct and each left a new way for text to look like a command:
#
#   rg 'playwright install' docs/        a quoted argument
#   <<'EOF' ... playwright install       a heredoc BODY
#   echo "Example; playwright install"   a quoted semicolon read as a separator
#   # example: cat <<EOF                 a heredoc marker in a COMMENT, which the
#                                        stripper then honoured, swallowing a REAL
#                                        install after it — a FALSE NEGATIVE
#                                        introduced by the fix for the case above
#
# So: tokenize. `shlex` in POSIX mode drops comments and respects quoting, which
# is exactly what every one of those cases turned on. This is the fleet's own
# lesson from the same day, applied to the file that kept relearning it: parse,
# do not grep, when the question is "is this executed" rather than "is this
# mentioned."
ENV_ASSIGN = re.compile(r"[A-Za-z_]\w*=.*")

# Heredoc operators ONLY. `<<<` is a here-string — a different operator that
# consumes no body — and treating it as a heredoc with delimiter "<" discarded
# the rest of the run block, hiding real installs after it.
HEREDOC_OPERATORS = {"<<", "<<-"}

# Words that can precede the real command and still leave it at a command
# position. Matched by BASENAME, so /usr/bin/sudo counts.
LAUNCHERS = {"npx", "sudo", "yarn", "pnpm", "bunx", "dlx", "exec", "command", "time", "env"}

SEPARATORS = {";", "&&", "||", "|", "&", "(", ")", "{", "}", ";;", "|&"}


def _logical_lines(script):
    """Yield logical shell lines, joining backslash continuations.

    `echo \` + `  playwright install` is ONE command. Tokenizing physical lines
    made the first raise and be skipped, and the second parse as a standalone
    install — turning a docs job into a browser job.
    """
    buffer = ""
    for raw in script.splitlines():
        if raw.endswith("\\"):
            buffer += raw[:-1] + " "
            continue
        yield buffer + raw
        buffer = ""
    if buffer:
        yield buffer


def _tokens(line):
    """Tokenize one logical line, or None when it cannot be parsed as shell.

    `punctuation_chars=True` is what makes separators reliable: shlex splits
    `ok;playwright` into three tokens while leaving a QUOTED `"a;b"` whole, which
    no amount of post-hoc string splitting can do. It also normalises `<<'EOF'`
    and `<< EOF` to the same two tokens, and keeps `<<<` distinct.
    """
    lexer = shlex.shlex(line, posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    try:
        return list(lexer)
    except ValueError:
        # Unbalanced quotes: not parseable as shell. Claiming a job installs
        # browsers on text we cannot read is the false positive this file exists
        # to avoid — see the header's asymmetry.
        return None


def _lines_of_tokens(script):
    """Tokenize each logical line, dropping comments and heredoc BODIES."""
    delim = None
    for line in _logical_lines(script):
        if delim is not None:
            if line.strip() == delim:
                delim = None
            continue
        tokens = _tokens(line)
        if tokens is None:
            continue
        for index, token in enumerate(tokens):
            if token in HEREDOC_OPERATORS and index + 1 < len(tokens):
                delim = tokens[index + 1]
                break
        yield tokens


def _segments(tokens):
    """Split a logical line's tokens into command segments at separators."""
    current = []
    for token in tokens:
        if token in SEPARATORS:
            if current:
                yield current
            current = []
            continue
        current.append(token)
    if current:
        yield current


def _segment_installs(segment):
    """True when this ONE command is a playwright install.

    Launchers and env assignments INTERLEAVE — `env CI=1 playwright install` is
    valid, and skipping assignments only BEFORE launchers left `CI=1` treated as
    the command word, so a browser job passed at any bound. Consume both in one
    loop rather than in two phases.
    """
    index = 0
    while index < len(segment):
        token = segment[index]
        if ENV_ASSIGN.fullmatch(token) or PurePosixPath(token).name in LAUNCHERS:
            index += 1
            continue
        break
    if index >= len(segment) or PurePosixPath(segment[index]).name != "playwright":
        return False
    return index + 1 < len(segment) and segment[index + 1].startswith("install")


def _runs_playwright_install(script):
    return any(
        _segment_installs(segment)
        for tokens in _lines_of_tokens(script)
        for segment in _segments(tokens)
    )


def load_jobs(path):
    """Return {job_id: job_mapping}, preserving YAML 1.1-collapsed key spellings.

    PyYAML speaks YAML 1.1, where the bare keys `on`, `yes`, `no`, `y` and `n`
    resolve to booleans. Two jobs named `yes` and `on` therefore collapse to a
    single `True` key and the later silently OVERWRITES the earlier — so an
    unbounded job disappears from this scan while GitHub still runs it. That is a
    green guard over a real defect, the one failure mode this file exists to
    prevent. workflow-ref-guard.py hit the same edge and solved it the same way:
    compose to NODES, where the original spelling survives.

    Raises yaml.YAMLError so the caller can fail closed on an unreadable file.
    """
    root = yaml.compose(path.read_text(encoding="utf-8"))
    if not isinstance(root, yaml.MappingNode):
        return None
    # LAST wins, not first. Duplicate top-level `jobs:` keys resolve to the last
    # occurrence in both GitHub and PyYAML — workflow-ref-guard.py:138-140 already
    # records this. Taking the first left a bounded decoy mapping shadowing the
    # real unbounded one, green here and running there.
    found = None
    for key_node, value_node in root.value:
        if isinstance(key_node, yaml.ScalarNode) and key_node.value == "jobs":
            found = value_node
    if found is None or not isinstance(found, yaml.MappingNode):
        return None
    jobs = {}
    for jk, jv in found.value:
        if isinstance(jk, yaml.ScalarNode):
            jobs[jk.value] = yaml.serialize(jv)
    # Re-parse each job body individually: the collision only affects the jobs
    # mapping's own keys, and per-job bodies are ordinary data.
    return {k: yaml.safe_load(v) for k, v in jobs.items()}


def _steps(node):
    for step in (node or {}).get("steps") or []:
        if isinstance(step, dict):
            yield step


def _uses_ui_suite(node, seen):
    """True when this job/composite reaches the LOCAL ui-suite composite.

    Transitive on purpose: a wrapper composite that itself uses ui-suite incurs
    the identical cost, and a direct-reference-only test let a 40-minute caller
    pass simply by renaming or wrapping the shipped action.
    """
    for step in _steps(node):
        uses = str(step.get("uses", "")).strip()
        ref = uses.split("@", 1)[0].rstrip("/")
        if ref == UI_SUITE_LOCAL:
            return True
        # Follow LOCAL composites only. A remote action's definition is not on
        # disk, and guessing at its cost is how the suffix match went wrong.
        if ref.startswith("./") and ref not in seen:
            seen.add(ref)
            for name in ("action.yml", "action.yaml"):
                path = REPO_ROOT / ref[2:] / name
                if path.is_file():
                    try:
                        sub = yaml.safe_load(path.read_text(encoding="utf-8"))
                    except yaml.YAMLError:
                        break
                    runs = (sub or {}).get("runs")
                    if isinstance(runs, dict) and _uses_ui_suite(runs, seen):
                        return True
                    break
    return False


def is_ui_suite_job(job):
    return _uses_ui_suite(job, set())


def is_browser_job(job):
    """True when a step RUNS the install. `uses:` cannot install browsers."""
    return any(_runs_playwright_install(str(step.get("run", ""))) for step in _steps(job))


errors = []
checked = 0
unevaluatable = []

for scan_dir in SCAN_DIRS:
    directory = REPO_ROOT / scan_dir
    if not directory.is_dir():
        errors.append(f"{scan_dir}/ does not exist — wrong root? Scanned from {REPO_ROOT}.")
        continue
    for path in sorted(directory.glob("*.yml")) + sorted(directory.glob("*.yaml")):
        rel = path.relative_to(REPO_ROOT)
        try:
            jobs = load_jobs(path)
        except yaml.YAMLError as exc:
            # FAIL CLOSED: a file this check cannot read is reported, never
            # skipped — a workflow silently treated as empty passes every rule.
            errors.append(f"{rel} is not parseable YAML, so its jobs were never checked: {str(exc).strip()}")
            continue
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
            if isinstance(bound, bool):
                errors.append(f"{rel} → job '{name}' timeout-minutes is {bound!r}, not an integer minute count.")
                continue
            if isinstance(bound, str) and "${{" in bound:
                # GitHub PERMITS expressions here. Their value is not knowable
                # without the matrix/inputs/vars context, so the numeric rules
                # cannot be applied — but the job IS bounded, which is rule 1.
                # Failing it would red-build a valid workflow, and this file's
                # header says which way that error runs.
                unevaluatable.append(f"{rel} → {name}")
                continue
            if not isinstance(bound, int):
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
                    f"      bound of {bound} cancels a HEALTHY run, and a cancelled run is not a red one:\n"
                    f"      it reads as inconclusive, so nobody chases it. ui-suite callers need >= {UI_SUITE_FLOOR}."
                )
            elif bound < BROWSER_FLOOR and is_browser_job(job):
                errors.append(
                    f"{rel} → job '{name}' installs Playwright browsers under timeout-minutes: {bound}.\n"
                    f"      A cold-cache install has been measured as high as 21m25s upstream; a bound of\n"
                    f"      {bound} risks killing a cold run before a test executes AND skipping the cache\n"
                    f"      save that would warm the next one (#238). Browser jobs need >= {BROWSER_FLOOR}."
                )

if errors:
    sys.stderr.write("❌ check-job-bounds: FAILED\n\n")
    for err in errors:
        sys.stderr.write("  • " + err + "\n\n")
    raise SystemExit(1)

scope = ", ".join(SCAN_DIRS)
note = f" {len(unevaluatable)} expression-bounded job(s) not range-checked." if unevaluatable else ""
print(
    f"✅ check-job-bounds: {checked} job(s) in {scope} bounded, none >= {GITHUB_DEFAULT}, "
    f"direct browser jobs >= {BROWSER_FLOOR}, ui-suite callers >= {UI_SUITE_FLOOR}.{note}"
)
