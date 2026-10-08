#!/usr/bin/env python3
r"""Catch an apostrophe that the shell reads as a quote, in every bash `run:` block.

WHY THIS EXISTS. `ci-monitor.yml`'s manual-dispatch scan passed its jq program
in single quotes, and a jq comment inside it said "fork B's run can suppress
fork A's cancelled one". The first apostrophe CLOSED the shell quote and the
second reopened it, so the quotes stayed balanced: YAML parsed, `bash -n`
passed, and jq got half a program and failed with a syntax error. The scan
never ran from #264 until #405 found it by reading. Nothing that checks syntax
can see this, because the syntax is valid; it is the wrong program.

THE RULE. In each `run:` block a bash step would execute, a single-quoted span
whose opening or closing `'` has an ASCII letter immediately on BOTH sides is
reported: `B's`, `don't`, `it's`. A real quote boundary almost never sits
between two letters, and an apostrophe in English text almost always does. A
block the parser cannot read at all -- an unclosed quote is the usual cause --
is reported too.

THE PARSER IS shfmt's, NOT MINE. The first version of this guard lexed bash by
hand, and two Codex rounds on #408 found six grammar corners it got wrong:
`$( )` inside an unquoted heredoc body, a delimiter that is not an identifier
(`<<END-JSON`), `.yaml` files, `<<$'EOF'`, `$( )` nested in `$(( ))`, and
`/bin/bash`. The last of those is not grammar and stays fixed here; the other
five were the same mechanism -- a partial lexer for a language with a large
grammar -- and every fix would have waited for the next corner. So the block
is parsed by `shfmt --to-json` (mvdan/sh), and this script reads the AST: each
`SglQuoted` node carries its exact byte offsets, so heredocs, comments, double
quotes, arithmetic and nesting are the parser's job and are right by
construction. shfmt is found as $SHFMT or on PATH; qa.yml downloads a pinned,
checksum-verified release. Without it this is CANNOT CHECK, never a pass.

WHAT IS NOT SHELL, AND IS SKIPPED:
  - `${{ ... }}` expressions are masked: GitHub substitutes them before the
    shell starts. Their VALUE is not known here, so one is CANNOT CHECK unless
    its innermost context is double quotes or a heredoc body -- unquoted or
    single-quoted, an apostrophe in the value is shell syntax;
  - steps whose effective `shell:` (step, then job `defaults.run.shell`, then the
    workflow's) is not bash or sh, judged by the executable's BASENAME, so
    `/bin/bash -e {0}` is bash; with no shell named, a Windows job's default is
    PowerShell and is skipped. A shell this file cannot settle -- an
    expression, a `runs-on` whose labels do not name an OS (`self-hosted`), a
    composite step with no shell -- is CANNOT CHECK, never a guess (Codex,
    #408).

WHAT A CLEAN RUN PROVES. Only that every block parses as bash and no
single-quote boundary in it sits between two letters. It does NOT prove any
quote is where the author meant it: `runs' output` (a closing apostrophe before
a space) is still a quote and is not reported. Such a stray quote usually
leaves the block unbalanced, which IS reported. It also does NOT look at `.sh`
files, at the toolkit's Markdown bash, or at `actions/github-script` bodies.

KNOWN LIMITS, RECORDED NOT BUILT (owner ruling, 2026-10-08). Five Codex rounds
on #408 each found a real corner of bash or GitHub Actions semantics, and every
one was fixed. From here on, a review finding whose shape does not occur in this
repo's workflows is answered on its thread and listed here, with no code. A
finding that occurs here, or that would let this repo's workflows pass when they
should not, is still fixed. Listed so far: (none yet).

Exit 0: clean. Exit 1: findings. Exit 2: CANNOT CHECK -- an unreadable file, no
shfmt, a block whose shell is unknown, an expression outside double quotes and
heredoc bodies, or no `run:` block found at all (a did-not-look must not print the same
OK as a pass).

Usage: check-run-quoting.py [--root DIR] [FILE ...]   (default: every workflow
and composite under the repo root, or DIR, in .yml or .yaml)

Its own guard: check-run-quoting-cases.py.
"""

import glob
import json
import os
import re
import shutil
import subprocess
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Both extensions: GitHub accepts .yml and .yaml for workflows and for action
# metadata, and a file this list misses is a file the OK line never saw (Codex,
# #408).
DEFAULT_GLOBS = (
    ".github/workflows/*.yml",
    ".github/workflows/*.yaml",
    "templates/workflows/*.yml",
    "templates/workflows/*.yaml",
    "templates/actions/*/action.yml",
    "templates/actions/*/action.yaml",
)


def expressions(text):
    """(start, end) character spans of each `${{ ... }}` in `text`.

    QUOTE-AWARE: GitHub expression strings are '...' with '' for a literal quote,
    and a `}}` inside one does not end the expression --
    `${{ format('{{Hello {0}!}}', x) }}` (Codex, #408). An expression with no
    closing `}}` runs to the end of the block.
    """
    spans, i = [], 0
    while True:
        i = text.find("${{", i)
        if i < 0:
            return spans
        j, in_str = i + 3, False
        while j < len(text):
            if in_str:
                if text.startswith("''", j):
                    j += 2
                    continue
                if text[j] == "'":
                    in_str = False
            elif text[j] == "'":
                in_str = True
            elif text.startswith("}}", j):
                j += 2
                break
            j += 1
        spans.append((i, j))
        i = j
SHFMT_ERROR = re.compile(r"^(?:<standard input>:)?(\d+):(\d+): (.*)$")


class NoParser(Exception):
    pass


def find_shfmt():
    path = os.environ.get("SHFMT") or shutil.which("shfmt")
    if not path or not os.access(path, os.X_OK):
        raise NoParser(path or "shfmt (not on PATH and SHFMT unset)")
    return path


def is_letter(b):
    return 0 <= b < 128 and chr(b).isalpha()


def single_quoted(node, out):
    """Collect every SglQuoted node in a shfmt JSON AST."""
    if isinstance(node, dict):
        if node.get("Type") == "SglQuoted":
            out.append((node["Pos"]["Offset"], node["End"]["Offset"], bool(node.get("Dollar"))))
        for v in node.values():
            single_quoted(v, out)
    elif isinstance(node, list):
        for v in node:
            single_quoted(v, out)


# The nodes that change what an apostrophe means. Inside DblQuoted, or in a
# heredoc body, it is a character; under any of the others -- or none -- it is
# shell syntax.
CONTEXTS = {"DblQuoted", "SglQuoted", "CmdSubst", "ArithmExp", "ProcSubst", "ParamExp"}


def contexts(node, out):
    """Collect (kind, start, end) for each quoting context in a shfmt JSON AST."""
    if isinstance(node, dict):
        if node.get("Type") in CONTEXTS:
            out.append((node["Type"], node["Pos"]["Offset"], node["End"]["Offset"]))
        hdoc = node.get("Hdoc")
        if isinstance(hdoc, dict) and hdoc.get("Parts"):
            parts = hdoc["Parts"]
            out.append(("Hdoc", parts[0]["Pos"]["Offset"], parts[-1]["End"]["Offset"]))
        for v in node.values():
            contexts(v, out)
    elif isinstance(node, list):
        for v in node:
            contexts(v, out)


def scan(text, shfmt):
    """Return (findings, unknowns): each a list of (line index in the block, message).

    A `${{ }}` expression is masked before parsing, byte for byte and keeping its
    newlines, so every offset and line stays true. GitHub substitutes its VALUE
    before bash starts, and that value is not known here. An apostrophe in it is
    a plain character only when the innermost context around the expression is
    double quotes or a heredoc body. Inside single quotes it ENDS the quote
    (`'${{ 'It''s' }}'`), and unquoted it OPENS one (`echo ${{ 'It''s' }}` runs
    `echo It's`). Both are Codex, #408, and a PR title does the same. So every
    other position is UNKNOWN, never assumed safe.
    """
    exprs, masked, last = [], [], 0
    for a, b in expressions(text):
        masked.append(text[last:a])
        masked.append("".join("\n" if ch == "\n" else "_" * len(ch.encode("utf-8"))
                              for ch in text[a:b]))
        exprs.append((len(text[:a].encode("utf-8")), len(text[:b].encode("utf-8"))))
        last = b
    masked.append(text[last:])
    src = "".join(masked).encode("utf-8")
    r = subprocess.run([shfmt, "--to-json", "-ln", "bash"], input=src,
                       capture_output=True)
    if r.returncode != 0:
        msg = r.stderr.decode("utf-8", "replace").strip().splitlines() or ["(no message)"]
        m = SHFMT_ERROR.match(msg[0])
        line = int(m.group(1)) - 1 if m else 0
        return [(line, f"does not parse as bash: {m.group(3) if m else msg[0]}")], []
    spans = []
    single_quoted(json.loads(r.stdout), spans)
    findings = []
    for start, end, dollar in spans:
        for at, what in ((start + (1 if dollar else 0), "OPENS"), (end - 1, "CLOSES")):
            if 0 < at < len(src) - 1 and is_letter(src[at - 1]) and is_letter(src[at + 1]):
                snippet = src[max(0, at - 12):at + 12].decode("utf-8", "replace")
                findings.append((src.count(b"\n", 0, at),
                                 f"an apostrophe {what} a single-quoted span: ...{snippet!r}..."))
    ctx = []
    contexts(json.loads(r.stdout), ctx)
    unknowns = []
    for e_start, e_end in exprs:
        around = [c for c in ctx if c[1] <= e_start and e_end <= c[2]]
        inner = min(around, key=lambda c: c[2] - c[1])[0] if around else "unquoted"
        if inner not in ("DblQuoted", "Hdoc"):
            inner = {"SglQuoted": "single-quoted", "CmdSubst": "$( )", "ArithmExp": "$(( ))",
                     "ProcSubst": "<( )", "ParamExp": "${ }"}.get(inner, inner)
            unknowns.append((src.count(b"\n", 0, e_start),
                             f"a ${{{{ }}}} expression in a {inner} position: its value is not"
                             " known here, and an apostrophe in it would be shell syntax."
                             " Pass it through `env:` and use the variable in double quotes."))
    return findings, unknowns


def shell_of(mapping):
    """The `shell` a mapping sets for its run steps, or None."""
    if not isinstance(mapping, dict):
        return None
    if isinstance(mapping.get("shell"), str):
        return mapping["shell"]
    d = mapping.get("defaults")
    if isinstance(d, dict) and isinstance(d.get("run"), dict):
        s = d["run"].get("shell")
        return s if isinstance(s, str) else None
    return None


def platform_of(job):
    """'windows', 'other' or 'unknown' for a job's `runs-on`."""
    labels = job.get("runs-on") if isinstance(job, dict) else None
    if isinstance(labels, dict):          # the runner-group form
        labels = labels.get("labels")
    if isinstance(labels, str):
        labels = [labels]
    if not isinstance(labels, list) or not all(isinstance(x, str) for x in labels):
        return "unknown"
    if any("${{" in x for x in labels):
        return "unknown"
    # POSITIVE EVIDENCE ONLY. `self-hosted` or `[self-hosted, prod]` can select a
    # Windows runner, so the absence of "windows" proves nothing (Codex, #408).
    lower = [x.lower() for x in labels]
    windows = any("windows" in x for x in lower)
    unix = any(k in x for x in lower for k in ("ubuntu", "linux", "macos"))
    if windows != unix:
        return "windows" if windows else "other"
    return "unknown"


# THE SHELL A STEP RUNS IN IS ONE OF THREE THINGS, NEVER A GUESS. Codex found
# it guessed three ways on #408: `/bin/bash` read as not-bash, a
# `${{ matrix.shell }}` read as not-bash, and a Windows job's default read as
# bash (it is PowerShell). Each was a silent default. What cannot be known from
# the file -- an expression, a `runs-on` expression with no explicit shell, a
# composite step with no shell -- is UNKNOWN, and an unknown block is CANNOT
# CHECK, not skipped.
def classify(shell, platform):
    """'bash', 'other' or 'unknown'."""
    if shell is not None:
        if "${{" in shell:
            return "unknown"
        return "bash" if os.path.basename(shell.split()[0]) in ("bash", "sh") else "other"
    if platform == "windows":
        return "other"                    # GitHub's Windows default is pwsh
    return "bash" if platform == "other" else "unknown"


def blocks(path):
    """Yield (first content line, text, 'bash'|'other'|'unknown') per step `run:`."""
    with open(path, encoding="utf-8") as f:
        source = f.read()
    node = yaml.compose(source)
    data = yaml.safe_load(source)
    if node is None or not isinstance(data, dict):
        return

    def value_node(mapping_node, key):
        for k, v in mapping_node.value:
            if getattr(k, "value", None) == key:
                return v
        return None

    def steps_of(mapping_node):
        s = value_node(mapping_node, "steps")
        return s.value if isinstance(s, yaml.SequenceNode) else []

    top_shell = shell_of(data)
    step_lists = []
    jobs = value_node(node, "jobs")
    if isinstance(jobs, yaml.MappingNode):
        for k, job in jobs.value:
            # From the job's OWN node: safe_load resolves YAML 1.1 keys, so a job
            # named `yes`, `no` or `on` becomes a boolean key and a lookup by its
            # name finds nothing (Codex, #408).
            job_data = (yaml.safe_load(yaml.serialize(job))
                        if isinstance(job, yaml.MappingNode) else None)
            step_lists.append((steps_of(job) if isinstance(job, yaml.MappingNode) else [],
                               shell_of(job_data) or top_shell, platform_of(job_data)))
    runs = value_node(node, "runs")
    if isinstance(runs, yaml.MappingNode):
        # A composite step must name its shell; one that does not is unknown.
        step_lists.append((steps_of(runs), None, "unknown"))
    for steps, inherited, platform in step_lists:
        for step in steps:
            if not isinstance(step, yaml.MappingNode):
                continue
            run = value_node(step, "run")
            if not isinstance(run, yaml.ScalarNode):
                continue
            sh = value_node(step, "shell")
            shell = sh.value if isinstance(sh, yaml.ScalarNode) else inherited
            first = run.start_mark.line + (2 if run.style in ("|", ">") else 1)
            yield first, run.value, classify(shell, platform)


def main(argv):
    root = ROOT
    if argv[:1] == ["--root"] and len(argv) >= 2:
        root, argv = os.path.abspath(argv[1]), argv[2:]
    if argv:
        paths = argv
    else:
        paths = sorted(p for g in DEFAULT_GLOBS for p in glob.glob(os.path.join(root, g)))
    try:
        shfmt = find_shfmt()
    except NoParser as e:
        print(f"CANNOT CHECK: no usable shfmt: {e}")
        print("  This guard reads each block through shfmt's parser. Install the pinned")
        print("  release qa.yml downloads, or set SHFMT=<path>. No parser is not a pass.")
        print("check-run-quoting: FAIL (code 2)")
        return 2
    total, skipped, bad, unknown = 0, 0, [], []
    for path in paths:
        rel = os.path.relpath(path, root) if path.startswith(root) else path
        try:
            found = list(blocks(path))
        except (OSError, UnicodeDecodeError, yaml.YAMLError) as e:
            print(f"CANNOT CHECK: {rel} could not be read as YAML: {e}")
            print("check-run-quoting: FAIL (code 2)")
            return 2
        for first, text, kind in found:
            if kind == "other":
                skipped += 1
                continue
            if kind == "unknown":
                unknown.append(f"{rel}:{first}: cannot tell which shell runs this block (an"
                               " expression, a `runs-on` that does not name an OS with no"
                               " `shell:`, or a composite step with none). Name the shell"
                               " on the step.")
                continue
            total += 1
            findings, unknowns = scan(text, shfmt)
            bad.extend(f"{rel}:{first + line}: {msg}" for line, msg in findings)
            unknown.extend(f"{rel}:{first + line}: {msg}" for line, msg in unknowns)
    for u in unknown:
        print(f"CANNOT CHECK: {u}")
    if unknown:
        print("  What this file cannot settle is neither skipped nor guessed.")
    if total == 0 and not bad and not unknown:
        print(f"CANNOT CHECK: no bash `run:` block found in {len(paths)} file(s).")
        print("  A scan that looked at nothing is not a pass.")
        print("check-run-quoting: FAIL (code 2)")
        return 2
    if bad:
        for b in bad:
            print(f"FAIL: {b}")
        print("  In a single-quoted shell string an apostrophe ENDS the quote. Reword")
        print("  it (\"fork B's run\" -> \"a run from fork B\"), or move the text out of")
        print("  the quoted program.")
        print("check-run-quoting: FAIL (code 1)")
        return 1
    if unknown:
        print("check-run-quoting: FAIL (code 2)")
        return 2
    print(f"check-run-quoting: OK — {total} bash run block(s) in {len(paths)} file(s)"
          f" ({skipped} non-bash skipped): every block parses, and no single-quote"
          " boundary sits between two letters. Not a check that every quote is where"
          " its author meant it (read the header).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
