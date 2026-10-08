#!/usr/bin/env python3
r"""Catch an apostrophe that the shell reads as a quote, in every bash `run:` block.

WHY THIS EXISTS. `ci-monitor.yml`'s manual-dispatch scan passed its jq program
in single quotes, and a jq comment inside it said "fork B's run can suppress
fork A's cancelled one". The first apostrophe CLOSED the shell quote and the
second reopened it, so the quotes stayed balanced: YAML parsed, `bash -n`
passed, and jq got half a program and failed with a syntax error. The scan
never ran from #264 until #405 found it by reading. Nothing that checks syntax
can see this, because the syntax is valid; it is the wrong program.

THE RULE. In each `run:` block a bash step would execute, a `'` that OPENS or
CLOSES a single-quoted span with an ASCII letter immediately on BOTH sides is
reported: `B's`, `don't`, `it's`. A real quote boundary almost never sits
between two letters, and an apostrophe in English text almost always does. A
quote still open at the end of the block is reported too.

WHAT IS NOT SHELL, AND IS SKIPPED:
  - `${{ ... }}` expressions: GitHub substitutes them before the shell starts,
    so their quotes never reach it;
  - heredoc bodies (`<<EOF`, `<<-'EOF'`, ...), which are literal text;
  - a `#` comment that starts a word outside any quote;
  - `'` inside double quotes, which is a literal character;
  - steps whose effective `shell:` (step, then job `defaults.run.shell`, then the
    workflow's) is not bash or sh.

WHAT A CLEAN RUN PROVES. Only that no quote boundary in these blocks sits
between two letters, and none is left open. It does NOT prove any quote is
where the author meant it: `runs' output` (a closing apostrophe before a space)
is still read as a quote and is not reported. Such a stray quote usually
leaves the block unbalanced, which IS reported. It also does NOT look at
`.sh` files, at the toolkit's Markdown bash, or at `actions/github-script`
bodies.

Exit 0: clean. Exit 1: findings. Exit 2: CANNOT CHECK -- an unreadable file,
or no `run:` block found at all (a did-not-look must not print the same OK as a
pass).

Usage: check-run-quoting.py [FILE ...]   (default: every workflow and
composite this repo ships or runs)

Its own guard: check-run-quoting-cases.py.
"""

import glob
import os
import re
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_GLOBS = (
    ".github/workflows/*.yml",
    "templates/workflows/*.yml",
    "templates/actions/*/action.yml",
)
EXPR = re.compile(r"\$\{\{.*?\}\}")
HEREDOC = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")
WORD_START = set(" \t\n;|&(")


def is_letter(c):
    return c.isascii() and c.isalpha()


def scan(text):
    """Return (line index within the block, message) for each finding."""
    text = EXPR.sub("EXPR", text)
    findings = []
    # Each frame is a quoting context: 'top', 'cmd' ($( ... )), 'bt' (backtick)
    # or 'dq'. Single quotes are not a frame: nothing nests inside them.
    frames = [["top", 0]]
    i, n = 0, len(text)
    pending_heredocs = []
    sq_open = None   # offset of the opening ' while inside a single-quoted span
    ansi = False     # inside $'...', where \' is an escaped quote
    dq_open = []

    def boundary(at, what):
        if 0 < at < n - 1 and is_letter(text[at - 1]) and is_letter(text[at + 1]):
            findings.append((text.count("\n", 0, at), f"an apostrophe {what} a single-quoted span: "
                                 f"...{text[max(0, at - 12):at + 12]!r}..."))

    while i < n:
        c = text[i]
        if sq_open is not None:
            if ansi and c == "\\":
                i += 2
                continue
            if c == "'":
                boundary(i, "CLOSES")
                sq_open, ansi = None, False
            i += 1
            continue
        kind = frames[-1][0]
        if c == "\n" and pending_heredocs:
            # Skip each pending heredoc body, in order, up to its delimiter line.
            j = i + 1
            for delim in pending_heredocs:
                while j < n:
                    end = text.find("\n", j)
                    end = n if end < 0 else end
                    line = text[j:end]
                    j = end + 1
                    if line.strip() == delim:
                        break
            pending_heredocs = []
            i = j
            continue
        if c == "\\":
            i += 2
            continue
        if kind == "dq":
            if c == '"':
                frames.pop()
                dq_open.pop()
            elif text.startswith("$(", i):
                frames.append(["cmd", 0])
                i += 2
                continue
            elif c == "`":
                frames.append(["bt", 0])
            i += 1
            continue
        # top, cmd, bt: ordinary shell.
        if c == "'":
            ansi = i > 0 and text[i - 1] == "$"
            boundary(i, "OPENS")
            sq_open = i
        elif c == '"':
            frames.append(["dq", 0])
            dq_open.append(i)
        elif c == "#" and (i == 0 or text[i - 1] in WORD_START):
            end = text.find("\n", i)
            i = n if end < 0 else end
            continue
        elif text.startswith("<<<", i):
            i += 3
            continue
        elif text.startswith("<<", i):
            m = HEREDOC.match(text, i)
            if m:
                pending_heredocs.append(m.group(2))
                i = m.end()
                continue
        elif text.startswith("$(", i):
            frames.append(["cmd", 0])
            i += 2
            continue
        elif c == "`":
            if kind == "bt":
                frames.pop()
            else:
                frames.append(["bt", 0])
        elif c == "(":
            frames[-1][1] += 1
        elif c == ")":
            if frames[-1][1] > 0:
                frames[-1][1] -= 1
            elif kind == "cmd":
                frames.pop()
        i += 1
    if sq_open is not None:
        findings.append((text.count("\n", 0, sq_open), "a single quote opened here is never closed"))
    elif dq_open:
        findings.append((text.count("\n", 0, dq_open[-1]), "a double quote opened here is never closed"))
    return findings


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


def is_bash(shell):
    return shell is None or shell.split()[0] in ("bash", "sh")


def blocks(path):
    """Yield (first content line, text, shell) for each step `run:` in a file."""
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
            job_data = data.get("jobs", {}).get(k.value)
            step_lists.append((steps_of(job) if isinstance(job, yaml.MappingNode) else [],
                               shell_of(job_data) or top_shell))
    runs = value_node(node, "runs")
    if isinstance(runs, yaml.MappingNode):
        step_lists.append((steps_of(runs), None))
    for steps, inherited in step_lists:
        for step in steps:
            if not isinstance(step, yaml.MappingNode):
                continue
            run = value_node(step, "run")
            if not isinstance(run, yaml.ScalarNode):
                continue
            sh = value_node(step, "shell")
            shell = sh.value if isinstance(sh, yaml.ScalarNode) else inherited
            first = run.start_mark.line + (2 if run.style in ("|", ">") else 1)
            yield first, run.value, shell


def main(argv):
    if argv:
        paths = argv
    else:
        paths = sorted(p for g in DEFAULT_GLOBS for p in glob.glob(os.path.join(ROOT, g)))
    total, skipped, bad = 0, 0, []
    for path in paths:
        rel = os.path.relpath(path, ROOT) if path.startswith(ROOT) else path
        try:
            found = list(blocks(path))
        except (OSError, UnicodeDecodeError, yaml.YAMLError) as e:
            print(f"CANNOT CHECK: {rel} could not be read as YAML: {e}")
            print("check-run-quoting: FAIL (code 2)")
            return 2
        for first, text, shell in found:
            if not is_bash(shell):
                skipped += 1
                continue
            total += 1
            for line, msg in scan(text):
                bad.append(f"{rel}:{first + line}: {msg}")
    if total == 0:
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
    print(f"check-run-quoting: OK — {total} bash run block(s) in {len(paths)} file(s)"
          f" ({skipped} non-bash skipped): no quote boundary sits between two letters,"
          " and none is left open. Not a check that every quote is where its author"
          " meant it (read the header).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
