#!/usr/bin/env python3
"""Fail when an intentionally identical file pair has drifted apart.

THE ONE LIST. Each pair below is a live copy this repo runs and the template
projects copy. They must stay byte-identical: the template IS the live copy.
This file is the single source of truth for which pairs those are -- `qa.yml`
runs it, `CLAUDE.md` → *Local gate — CI scripts (this repo)* runs it, and `CLAUDE.md` → *Self-application*
points here rather than enumerating. Add a pair HERE, nowhere else.

THE ADAPTED PAIRS. `ci-monitor.yml` and `ci-notify.yml` watch this repo's own
workflow name, so they diverge from their templates on purpose (`CLAUDE.md` →
*Self-application*, the "adapted" pattern). That divergence is ONE field, the
`on.workflow_run.workflows` list; the rest (about 250 lines of shared logic) was
compared by nothing, so a fix landed in one copy could silently skip the other.
ADAPTED below holds them to that: each side is COMPOSED (PyYAML's node tree,
as workflow-ref-guard.py reads it), its watch list set aside (it must name at
least one workflow), and the rest must be EQUAL as source text: every scalar
compared by its text, by plain-or-quoted and by its tag, never by a
resolved value. YAML comments and blank lines drop out in the parse, so they may
differ. A `run:` script is a string the parse keeps whole, and the copies DO
word their shell comments differently ("this repo's qa.yml" against
"qa-live.yml"), so each script is compared as shfmt minifies it: comments and
layout gone, every quoted string and heredoc body whole. That needs shfmt
($SHFMT or PATH, as check-run-quoting.py finds it); without it the adapted
pairs fail as NOT checked, never pass (batch C, R7).

WHY THE SCRIPT PAIRS. A guard that ships to projects from `templates/scripts/`
while this repo runs the `.github/scripts/` copy can be repaired in the copy we
execute while the shipped one stays broken -- and QA would stay green either way.

WHAT IT CHECKS, per pair:
  1. both files exist;
  2. their bytes are identical (a unified diff is printed when they are not);
  3. their executable bits agree -- a content comparison cannot see a mode, and
     a twin that differs only in its mode is not the live copy either;
  4. for a pair marked `executable`, both copies ARE executable. The SessionStart
     hook is the reason: `bash -n` reads a non-executable file happily, so a
     mode-only change slipped past every other check while the registered hook
     failed permission-denied at every session start -- and a non-executable
     template propagates that fault to every project scaffolded from it.

Modes are read from the working tree, as `diff` and `test -x` read them.

Usage: python3 .github/scripts/check-pairs.py [ROOT]
ROOT defaults to the repository this file lives in (the cases pass a fixture).
"""

import difflib
import json
import os
import shutil
import stat
import subprocess
import sys

# (live copy, template copy, both must be executable)
PAIRS = [
    (".claude/settings.json", "templates/claude-settings.json", False),
    (".github/workflows/codex-monitor.yml", "templates/workflows/codex-monitor.yml", False),
    (".github/workflows/pages-monitor.yml", "templates/workflows/pages-monitor.yml", False),
    (".github/workflows/pages-retry.yml", "templates/workflows/pages-retry.yml", False),
    (".github/scripts/workflow-ref-guard.py", "templates/scripts/workflow-ref-guard.py", False),
    (".github/scripts/check-job-bounds.py", "templates/scripts/check-job-bounds.py", False),
    (".github/scripts/check-py-warnings.py", "templates/scripts/check-py-warnings.py", False),
    (".github/scripts/check-ui-suite-env.py", "templates/scripts/check-ui-suite-env.py", False),
    (".claude/hooks/session-start.sh", "templates/claude-hooks/session-start.sh", True),
]

# (live copy, template copy): equal apart from on.workflow_run.workflows.
ADAPTED = [
    (".github/workflows/ci-monitor.yml", "templates/workflows/ci-monitor.yml"),
    (".github/workflows/ci-notify.yml", "templates/workflows/ci-notify.yml"),
]
WATCH_LIST = "<the watched workflows — adapted per repo>"


def adapted_logic(path, shfmt):
    """The workflow at `path` as its YAML node tree, every scalar kept as its
    SOURCE TEXT plus whether it is plain or quoted, with the watch list
    replaced by a marker. Raises ValueError when there is no non-empty
    on.workflow_run.workflows to set aside: a pair that watches nothing is not
    the adapted shape at all.

    WHY SOURCE TEXT, NOT VALUES. PyYAML resolves scalars by YAML 1.1 and GitHub
    by YAML 1.2, and they disagree (`no`, `on`, `070`, `080`; see
    check-job-bounds.py's GitHubIntLoader). Comparing resolved values let
    `required: false` pass as `0`, then as `no` (Codex, #430). Two plain
    scalars with the same text resolve the same under ANY schema, so comparing
    the text closes that class instead of chasing it value by value. The cost
    is strictness: `true` against `True` is reported though GitHub reads both
    alike, which is the safe direction for copies meant to match."""
    import yaml   # imported here so the byte pairs run without PyYAML
    try:
        with open(path, encoding="utf-8") as handle:
            doc = source_form(yaml.compose(handle, Loader=yaml.SafeLoader))
    except yaml.YAMLError as e:
        raise ValueError(f"{os.path.basename(path)} does not parse as YAML: {str(e).splitlines()[0]}")
    if not isinstance(doc, dict):
        raise ValueError("is not a YAML mapping")
    on = doc.get("on")
    run = on.get("workflow_run") if isinstance(on, dict) else None
    if not isinstance(run, dict) or "workflows" not in run:
        raise ValueError("has no on.workflow_run.workflows to set aside")
    # Only a list that names something is set aside. An emptied one is a
    # watcher that fires for nothing, and workflow-ref-guard.py, which holds
    # templates to no required list, would pass it (Codex, #430).
    names = run["workflows"]
    if not (isinstance(names, list) and names
            and all(is_scalar(n) and n[2].strip() for n in names)):
        raise ValueError("on.workflow_run.workflows is not a non-empty list of workflow names")
    run["workflows"] = WATCH_LIST
    strip_run_comments(doc, shfmt)
    return doc


def source_form(node):
    """A composed YAML node as plain data: a mapping keyed by its keys' text, a
    list, or a scalar as ["plain" | "quoted", tag, text]. Every quoted style
    (single, double, block) is a string to GitHub, so they are one class; a
    plain scalar is the only kind a schema resolves. The tag is kept because an
    explicit one (`!!str false`) changes what GitHub reads where the text does
    not (Codex, #430); for a plain scalar without one it follows from the text,
    so it adds no difference the text did not already show. A collection with
    a non-default tag carries it too."""
    import yaml
    if isinstance(node, yaml.MappingNode):
        out = {(k.value if isinstance(k, yaml.ScalarNode) else repr(source_form(k))): source_form(v)
               for k, v in node.value}
        if node.tag != "tag:yaml.org,2002:map":
            out["<tag>"] = node.tag
        return out
    if isinstance(node, yaml.SequenceNode):
        items = [source_form(v) for v in node.value]
        return items if node.tag == "tag:yaml.org,2002:seq" else [["<tag>", node.tag]] + items
    return ["plain" if node.style is None else "quoted", node.tag, node.value]


def is_scalar(value):
    return isinstance(value, list) and len(value) == 3 and value[0] in ("plain", "quoted") \
        and isinstance(value[2], str)


class NoShfmt(Exception):
    pass


def find_shfmt():
    """The shell parser, as check-run-quoting.py finds it: $SHFMT or PATH."""
    path = os.environ.get("SHFMT") or shutil.which("shfmt")
    if not path or not os.access(path, os.X_OK):
        raise NoShfmt(path or "shfmt (not on PATH and SHFMT unset)")
    return path


def strip_run_comments(node, shfmt):
    """Replace every `run:` script under `node` with its shfmt minification, in
    place. The copies word their shell comments differently on purpose, and a
    minified script has no comments and no layout, while every quoted string
    and heredoc body survives whole. A line-based "starts with #" filter was
    the first version here, and it also dropped `#` lines INSIDE a multi-line
    quoted string -- data, which ci-monitor's `msgs="..."` really holds (Codex,
    #430). Telling the two apart is a shell parse, and this repo's rule for a
    shell parse is shfmt, never a hand lexer (check-run-quoting.py, #408)."""
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "run" and is_scalar(value):
                out = subprocess.run([shfmt, "-mn"], input=value[2], capture_output=True, text=True)
                if out.returncode:
                    raise ValueError(f"a run: script does not parse as shell: {out.stderr.strip()}")
                value[2] = out.stdout
            else:
                strip_run_comments(value, shfmt)
    elif isinstance(node, list) and not is_scalar(node):
        for item in node:
            strip_run_comments(item, shfmt)


def check_adapted(root):
    failures = []
    for live, template in ADAPTED:
        a, b = os.path.join(root, live), os.path.join(root, template)
        missing = [p for p, full in ((live, a), (template, b)) if not os.path.isfile(full)]
        if missing:
            failures.append(f"{live} <-> {template}: missing {', '.join(missing)}")
            continue
        try:
            shfmt = find_shfmt()
            da, db = adapted_logic(a, shfmt), adapted_logic(b, shfmt)
        except NoShfmt as e:
            failures.append(f"no usable shfmt ({e}): the adapted pairs cannot be compared, so they are NOT "
                            "checked. Set SHFMT to the v3.12.0 release qa.yml downloads")
            break
        except ImportError:
            failures.append("PyYAML is not installed: the adapted pairs cannot be read, so they are NOT checked")
            break
        except ValueError as e:
            failures.append(f"{live} <-> {template}: {e}")
            continue
        if da != db:
            dump = lambda d: json.dumps(d, indent=1, sort_keys=True, default=str).splitlines(keepends=True)
            diff = difflib.unified_diff(dump(da), dump(db), fromfile=live, tofile=template)
            failures.append(f"{live} <-> {template}: differ beyond their watch list\n"
                            + "".join(diff).rstrip("\n"))
    return failures


def is_exec(path):
    # The OWNER execute bit, which is the one git reads when it records a file's
    # mode (100755 vs 100644). Group/other bits alone (0011) leave git storing
    # it non-executable, so they must not satisfy this check (Codex, #412).
    return bool(os.stat(path).st_mode & stat.S_IXUSR)


def check(root):
    failures = []
    for live, template, executable in PAIRS:
        a, b = os.path.join(root, live), os.path.join(root, template)
        missing = [p for p, full in ((live, a), (template, b)) if not os.path.isfile(full)]
        if missing:
            failures.append(f"{live} <-> {template}: missing {', '.join(missing)}")
            continue
        with open(a, "rb") as fa, open(b, "rb") as fb:
            da, db = fa.read(), fb.read()
        if da != db:
            diff = difflib.unified_diff(
                da.decode("utf-8", "replace").splitlines(keepends=True),
                db.decode("utf-8", "replace").splitlines(keepends=True),
                fromfile=live, tofile=template)
            failures.append(f"{live} <-> {template}: contents differ\n" + "".join(diff).rstrip("\n"))
        ea, eb = is_exec(a), is_exec(b)
        if ea != eb:
            failures.append(f"{live} <-> {template}: executable bit differs "
                            f"({live} {'is' if ea else 'is not'}, {template} {'is' if eb else 'is not'})")
        if executable:
            for rel, ex in ((live, ea), (template, eb)):
                if not ex:
                    failures.append(f"{rel} is not executable (it is registered or shipped as a hook)")
    return failures


def main(argv):
    root = argv[1] if len(argv) > 1 else os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    # An empty list checks nothing, and "OK -- 0 pairs" is a vacuous pass.
    failures = check(root) if PAIRS else ["the pair list is empty — this check verified nothing"]
    failures += check_adapted(root) if ADAPTED else ["the adapted list is empty — those pairs are unchecked"]
    if failures:
        for f in failures:
            print(f"FAIL: {f}")
        print(f"check-pairs: FAIL — {len(failures)} problem(s) across {len(PAIRS)} pairs")
        return 1
    for live, template, executable in PAIRS:
        print(f"OK:   {live} == {template}" + (" (both executable)" if executable else ""))
    for live, template in ADAPTED:
        print(f"OK:   {live} ~= {template} (equal apart from the watch list and comments)")
    print(f"check-pairs: OK — {len(PAIRS)} pairs byte-identical, modes in step; "
          f"{len(ADAPTED)} adapted pairs equal apart from their watch list and comments")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
