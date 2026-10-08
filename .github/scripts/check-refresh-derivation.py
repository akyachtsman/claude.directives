#!/usr/bin/env python3
r"""Guard /refresh-repo's referenced-script derivation against the real callers.

WHY IT EXISTS. refresh-repo Phase 2 (*Deriving the referenced-script set*)
derives WHICH .github/scripts/* files a refresh must install, by grepping the
caller workflows/actions it is installing; Phase 3's applied-check carries a
second copy of the same derivation.
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
`grep -E`, see below -- against every shipped caller, a fixed probe set and a
form-independent scan, these ways:

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
     .github/scripts/, or exactly .github/scripts/package.json (#398) -- see the
     extras split below.
  4. IN STEP. The command carries two copies of the derivation -- the install
     pipeline and the Phase 3 applied-check -- and both must exist and DERIVE
     the same set. Each copy's stages (grep -oE, sed -E, grep -E) are run with
     real grep and sed over a fixed probe set plus every shipped caller, and
     the outputs compared, so the check can never be wider or narrower than the
     install (#398). Comparing one field at a time left the next one open
     through three Codex rounds on #409.
  5. ON CONTRACT. Check 4 compares the copies with EACH OTHER, so two copies
     widened -- or narrowed -- the same way agree, and pass it. Each copy's
     output over PROBES must therefore equal PROBES_CONTRACT, the set the
     contract in check 3 admits from those inputs, exactly. Check 3 only sees
     what the shipped callers happen to contain; the probes carry the shapes
     at each edge of the contract whether a caller has them today or not.
  6. NEEDS NAMED. The derivation finds only what a caller NAMES, so a caller
     must name every file it needs by its `.github/scripts/` path -- and the
     name may sit in a comment, because the token grep reads mentions too.
     cron-notify.yml names notify-email.js and package.json ONLY in a comment:
     reword it and both drop out of the derivation with no error. So the
     dependencies are derived from the files that CREATE them, never from a
     hand-list here: a local `require`/`import` in the template source of a
     script the caller names (followed transitively), and `npm install|ci` run
     with `.github/scripts` as its directory (needs package.json). Each must be
     in the install derivation over THAT caller, or this fails. Chosen over
     moving the names out of the comment: any spot in the YAML is just as
     rewordable, while a dependency read from the `require` line and the npm
     step moves when they move -- the guard follows the facts, not a list
     someone has to remember to update.

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
derivation finds every script a caller could conceivably need. Check 6 reads
only the dependency shapes it names: a literal relative `require`/`import`, a
sibling Python `import`, and npm run in `.github/scripts` by `working-directory`
(step, job or workflow `defaults`), `cd`, or `--prefix`. A computed `require`
path or a dependency loaded any other way is invisible to it.
"""

# ── HISTORY MOVED FROM CLAUDE.md (2026-09-23) ────────────────────
# CLAUDE.md now keeps a one-line purpose per gate command; the history and
# evidence it carried about this script moved here, verbatim.
#
# From CLAUDE.md → Self-test monitoring, the `qa.yml` bullet:
#   `/refresh-repo`'s script derivation (`check-refresh-derivation.py` — the
#   derivation is a PATTERN in a markdown file and the callers are YAML edited
#   independently, so a caller changing the FORM of an invocation fell silently
#   out of it; the guard reads the shipped pattern out of the command rather
#   than copying it, PROP6 2026-09-01;

import ast
import posixpath
import re
import subprocess
import sys
from pathlib import Path

import yaml

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

# EVERY copy of the token grep, wherever it sits: the install pipeline and the
# Phase 3 applied-check each carry one. #398's constraint is that they name the
# SAME set -- a check wider than the install refuses a stamp the install can
# never satisfy -- so the extension filter after each copy must be identical.
ANY_TOKEN = re.compile(r"grep -oE '[^']*\\\.github/scripts/[^']*'")

# Every stage of a copy's pipeline, in order. Comparing one field at a time --
# first the filter, then whether Phase 3 exists, then the token pattern -- left
# the next field open each round (Codex, #409, three rounds). So each copy's
# stages are RUN over the same inputs and their outputs compared: a difference
# in the token class, a sed stage, or the filter all show up as a difference in
# what is derived.
STAGE_RE = re.compile(r"(grep -oE|sed -E|grep -E) '([^']+)'")

# Inputs every copy must derive identically, beside the shipped callers: the
# shapes each stage exists for.
PROBES = "\n".join([
    "run: node .github/scripts/a.js",
    "run: python3 .github/scripts/b.py",
    'run: node "$GITHUB_WORKSPACE/.github/scripts/c.js"',
    "the nested .github/scripts/nested/d.py",
    "a sentence that ends in .github/scripts/e.js.",
    "npm install reads .github/scripts/package.json",
    "never .github/scripts/package-lock.json",
    "never .github/scripts/ui-tests/package.json",
    "a bare directory .github/scripts/ui-tests/",
]) + "\n"

# What every copy must derive from PROBES -- the contract (check 3) applied to
# them, written out rather than computed so it cannot drift with in_contract().
# Each probe above is in it or deliberately out of it: the lockfile and the
# kit's package.json are other rows' files, and a bare directory is no file.
PROBES_CONTRACT = {
    ".github/scripts/a.js",
    ".github/scripts/b.py",
    ".github/scripts/c.js",
    ".github/scripts/nested/d.py",
    ".github/scripts/e.js",
    ".github/scripts/package.json",
}


def stages_of(text, start):
    return STAGE_RE.findall(pipeline(text, start))


def run_stages(stages, data):
    """Run a copy's stages over `data` with real grep and sed.

    grep exits 1 for "no matches", which is not an error. It exits 2 -- and,
    for some malformed-but-accepted constructs, exits 1 while WARNING on
    stderr -- for a pattern it cannot honour. That warning is the only signal
    distinguishing "matched nothing" from "could not match", and the shipped
    pipeline throws it away, so any stderr is fatal here.
    """
    for kind, pat in stages:
        args = kind.split() + [pat]
        p = subprocess.run(args, input=data, capture_output=True, text=True)
        if p.stderr.strip():
            return None, f"{args[0]} wrote to stderr: {p.stderr.strip()}"
        if p.returncode not in (0, 1):
            return None, f"{args[0]} exited {p.returncode}"
        data = p.stdout
        if not data:
            return set(), None
    return {ln for ln in data.split("\n") if ln}, None


def pipeline(text, start):
    """The rest of the shell pipeline that begins at `start`: its own line plus
    every line a trailing backslash continues. A filter is read ONLY from here.
    An unbounded search skipped past a pipeline that had lost its filter and
    found the NEXT pipeline's -- so a dropped install filter read as "in step"
    with the Phase 3 copy (Codex, #409)."""
    end = start
    while True:
        nl = text.find("\n", end)
        if nl < 0:
            return text[start:]
        if not text[text.rfind("\n", 0, nl) + 1:nl].rstrip().endswith("\\"):
            return text[start:nl]
        end = nl + 1


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

# THE CONTRACT: .js/.py under .github/scripts/, plus EXACTLY
# .github/scripts/package.json -- cron-notify.yml's `npm install` reads it, so it
# installs with that caller like a script (#398). Not ui-tests/package.json (the
# kit row installs that) and never package-lock.json (the project generates it).
PACKAGE_JSON = ".github/scripts/package.json"


def in_contract(path):
    return path.endswith((".js", ".py")) or path == PACKAGE_JSON


def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    return 1


# ---- check 6 helpers: what a caller NEEDS, read from the files that create it --
SCRIPTS = ".github/scripts"
TEMPLATE_SCRIPTS = "templates/scripts"   # where a .github/scripts/<x> comes from
# A literal relative module path: require('./x'), import ... from './x', import('./x').
JS_LOCAL = re.compile(r"""(?:\brequire\s*\(|\bfrom|\bimport\s*\(?)\s*['"](\.{1,2}/[^'"]+)['"]""")
NPM = re.compile(r"\bnpm\s+(?:install|ci|i)\b")
_ROOT = r"""(?:\./|\$GITHUB_WORKSPACE/|\$\{\{\s*github\.workspace\s*\}\}/)?"""
SCRIPTS_DIR = re.compile(rf"^{_ROOT}\.github/scripts/?$")
CD_NPM = re.compile(rf"""\bcd\s+["']?{_ROOT}\.github/scripts/?["']?\s*(?:&&|;|\n)\s*npm\s+(?:install|ci|i)\b""")
# `--prefix` is an npm CONFIG option, so it may sit on either side of the
# subcommand (`npm ci --prefix X` and `npm --prefix X ci` both read X/package.json;
# Codex, #411): both are lookaheads over the one command line, in either order.
# Not read, by design: NPM_CONFIG_PREFIX in `env:`, `pushd`, a subshell `(cd X;
# npm ci)` -- none occurs in a shipped caller; add a form here when one does.
PREFIX_NPM = re.compile(rf"""\bnpm\s(?=[^\n]*?(?<![\w-])(?:install|ci|i)\b)(?=[^\n]*?--prefix[= ]["']?{_ROOT}\.github/scripts/?["']?(?:\s|$))""")


def npm_in_scripts(doc):
    """True when some step runs npm with .github/scripts as its directory --
    `npm install` there reads .github/scripts/package.json."""
    def walk(node, wd):
        if isinstance(node, dict):
            d = node.get("defaults")
            if isinstance(d, dict) and isinstance(d.get("run"), dict):
                wd = d["run"].get("working-directory", wd)
            run = node.get("run")
            if isinstance(run, str):
                here = node.get("working-directory", wd)
                if CD_NPM.search(run) or PREFIX_NPM.search(run):
                    return True
                if NPM.search(run) and isinstance(here, str) and SCRIPTS_DIR.match(here.strip()):
                    return True
            return any(walk(v, wd) for v in node.values())
        if isinstance(node, list):
            return any(walk(v, wd) for v in node)
        return False
    return walk(doc, None)


def py_local_deps(rel, body):
    """{template-relative path: import line} for every module a template .py
    loads from its own tree, resolved as the interpreter would with the script's
    directory on sys.path. Read with `ast`, not a regex, so EVERY import form
    counts -- dotted (`from a.b import c`), relative (`from .b import c`), a
    submodule named in the import list (`from a import b`), and the packages a
    dotted import loads on the way (Codex, #411). A file that does not parse is
    a refusal, never "no imports"."""
    base = posixpath.dirname(rel)
    try:
        tree = ast.parse(body)
    except SyntaxError as e:
        raise ValueError(f"{TEMPLATE_SCRIPTS}/{rel} does not parse as Python ({e.msg}, line {e.lineno})")
    found = {}

    def resolve(parts, start, why):
        for i in range(1, len(parts) + 1):          # a.b loads a, then a.b
            stem = posixpath.join(start, *parts[:i])
            for cand in (stem + ".py", posixpath.join(stem, "__init__.py")):
                if (Path(TEMPLATE_SCRIPTS) / cand).is_file():
                    found[posixpath.normpath(cand)] = why

    for node in ast.walk(tree):
        if not isinstance(node, (ast.Import, ast.ImportFrom)):
            continue
        why = (ast.get_source_segment(body, node) or "").strip()
        if isinstance(node, ast.Import):
            for a in node.names:
                resolve(a.name.split("."), base, why)
            continue
        start = base
        for _ in range(max(node.level - 1, 0)):
            start = posixpath.dirname(start)
        mod = node.module.split(".") if node.module else []
        resolve(mod, start, why)
        for a in node.names:
            if a.name != "*":
                resolve(mod + [a.name], start, why)
    return found


def local_deps(script):
    """What `script` (a .github/scripts/ path) loads from beside it, read from
    its template source: {dependency path: the line that creates it}."""
    rel = script[len(SCRIPTS) + 1:]
    src = Path(TEMPLATE_SCRIPTS) / rel
    if not src.is_file():
        return {}
    body = src.read_text(encoding="utf-8")
    here = posixpath.dirname(script)
    deps = {}
    if script.endswith(".js"):
        for m in JS_LOCAL.finditer(body):
            dep = posixpath.normpath(posixpath.join(here, m.group(1)))
            if not posixpath.splitext(dep)[1]:
                dep += ".js"
            deps[dep] = m.group(0)
    elif script.endswith(".py"):
        for dep, why in py_local_deps(rel, body).items():
            deps[posixpath.join(SCRIPTS, dep)] = why
    return {d: why for d, why in deps.items() if d.startswith(SCRIPTS + "/")}


def needs(caller, body, named):
    """{dependency: reason} for everything `caller` needs that the install must
    derive. `named` is what the derivation found in it; local loads are
    followed transitively from there."""
    need = {}
    if caller.suffix in (".yml", ".yaml"):
        try:
            doc = yaml.safe_load(body)
        except yaml.YAMLError as e:
            raise ValueError(f"{caller} is not readable YAML ({e.__class__.__name__})")
        if npm_in_scripts(doc):
            need[PACKAGE_JSON] = "read by `npm install` run in .github/scripts"
    todo, seen = sorted(named), set()
    while todo:
        script = todo.pop()
        if script in seen:
            continue
        seen.add(script)
        for dep, why in local_deps(script).items():
            need.setdefault(dep, f"loaded by {script} via `{why}`")
            todo.append(dep)
    return need


def derive(stages, text):
    """Run the SHIPPED install pipeline's stages over `text` using real grep/sed."""
    return run_stages(stages, text)


def truth(text):
    # A trailing period is sentence punctuation, not part of the path.
    return {h.rstrip(".") for h in TRUTH_RE.findall(text) if in_contract(h.rstrip("."))}


def engine_error(err, what):
    return fail(
        f"the documented pattern is not usable by the engine that RUNS it.\n"
        f"      {err}\n"
        "      GNU grep -E is not Python's `re`: a construct `re` accepts (e.g. `(?:`)\n"
        "      makes grep warn and match NOTHING, and the pipeline's trailing `sort`\n"
        "      swallows the failure — an empty derivation reported as success.\n"
        f"      {what}\n"
        f"      Fix the pattern in {COMMAND}, not this guard."
    )


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
    filter_m = FILTER_LINE.search(pipeline(text, token_m.end()))
    if not filter_m:
        return fail(
            f"found the token grep in {COMMAND} but not the `grep -E '<ext>'` filter after it.\n"
            "      Without the extension stage the derivation matches `.github/scripts/package-lock.json`,\n"
            "      because an unterminated `\\.(js|py)` matches the `.js` inside `.json`."
        )
    token_pat, filter_pat = token_m.group(1), filter_m.group(1)
    install = stages_of(text, token_m.start())

    # THE PHASE 3 COPY MUST EXIST. Comparing filters proves nothing if one side
    # is gone: deleting or reshaping the Phase 3 scan left one copy, one filter,
    # and a pass -- while the applied-check stopped verifying unchanged
    # dependencies such as package.json (Codex, #409). The install pipeline is
    # the copy that reads "$buf"; any other copy is the applied-check's.
    copies = list(ANY_TOKEN.finditer(text))
    if not [m for m in copies if m.start() != token_m.start()]:
        return fail(
            f"the Phase 3 applied-check's copy of the derivation is missing from {COMMAND}.\n"
            "      Only the install pipeline's token grep was found. Phase 3 verifies every\n"
            "      script dependency, delta or not, with its own copy of this pattern; without\n"
            "      it a stale or missing dependency no longer blocks the refresh stamp.\n"
            "      Restore it, or update this guard in the same change if it moved."
        )

    filters = []
    for m in copies:
        f = FILTER_LINE.search(pipeline(text, m.end()))
        filters.append(f.group(1) if f else None)
    if None in filters:
        return fail(
            f"a copy of the derivation in {COMMAND} has NO extension filter of its own.\n"
            "      Each copy -- the install pipeline and the Phase 3 applied-check -- must\n"
            "      filter in its own pipeline; without one it accepts package-lock.json.\n"
            + "".join(f"      copy {i + 1}: {f or '(none)'}\n" for i, f in enumerate(filters))
        )

    callers = sorted({p for g in CALLER_GLOBS for p in Path().glob(g)})
    corpus = PROBES + "".join(c.read_text(encoding="utf-8") + "\n" for c in callers)
    want, err = run_stages(install, corpus)
    if err:
        return engine_error(err, f"install stages: {install}")
    for i, m in enumerate(copies):
        if m.start() == token_m.start():
            continue
        got, err = run_stages(stages_of(text, m.start()), corpus)
        if err:
            return engine_error(err, f"copy {i + 1} stages: {stages_of(text, m.start())}")
        if got != want:
            return fail(
                f"the derivation's copies in {COMMAND} derive DIFFERENTLY.\n"
                "      The install pipeline and the Phase 3 applied-check must name the same\n"
                "      set (#398): a check wider than the install refuses a stamp the install\n"
                "      can never satisfy, and a narrower one passes a dependency it never saw.\n"
                "      Run over the same probes and shipped callers:\n"
                + "".join(f"      only the install derives: {s}\n" for s in sorted(want - got))
                + "".join(f"      only copy {i + 1} derives: {s}\n" for s in sorted(got - want))
                + f"      install stages: {install}\n"
                + f"      copy {i + 1} stages: {stages_of(text, m.start())}\n"
                + "      Change every stage of both copies together."
            )

    if not callers:
        return fail(
            "no caller files matched "
            f"{', '.join(CALLER_GLOBS)} — this guard would pass vacuously, which is the\n"
            "      fail-open shape it exists to prevent."
        )

    bodies = {c: c.read_text(encoding="utf-8") for c in callers}

    # ---- check 1: per caller (check 4, in step, ran above) ---------------------
    missed = []
    documented_all = set()
    for caller in callers:
        got, err = derive(install, bodies[caller])
        if err:
            return engine_error(err, f"token: {token_pat}   filter: {filter_pat}")
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
            got, err = derive(install, buf)
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
    #   * outside the contract -> a FAILURE. The derivation's declared contract is
    #     .js/.py under .github/scripts/ plus exactly package.json there (#398), so
    #     this is the pattern accepting
    #     something outside its own contract. The live instance:
    #     `grep -E '\.(js|py)'` unterminated matches the `.js` inside `.json`, so
    #     `.github/scripts/package-lock.json` enters the install list as a script.
    #     Printing that and exiting 0 is the fail-open shape (#323) -- a green run
    #     with a note nobody reads is indistinguishable from a guard that passed.
    extra = sorted(documented_all - per_caller)
    off_contract = [s for s in extra if not in_contract(s)]
    if off_contract:
        return fail(
            "the documented derivation matches path(s) OUTSIDE its own contract.\n"
            "      It is meant to yield .js/.py under .github/scripts/, plus exactly\n"
            f"      {PACKAGE_JSON}. These are neither,\n"
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

    # ---- check 5: every copy derives exactly the contract from PROBES ---------
    # Check 4 compares the copies with each other, so two copies that widened
    # (or narrowed) the SAME way agree and pass it. Measure each against the
    # contract instead.
    for i, m in enumerate(copies):
        stages = stages_of(text, m.start())
        got, err = run_stages(stages, PROBES)
        if err:
            return engine_error(err, f"copy {i + 1} stages: {stages}")
        if got != PROBES_CONTRACT:
            which = "the install pipeline" if m.start() == token_m.start() else f"copy {i + 1}"
            return fail(
                f"{which} in {COMMAND} derives OFF ITS CONTRACT from the probe inputs.\n"
                "      The contract is .js/.py under .github/scripts/ plus exactly\n"
                f"      {PACKAGE_JSON}. Agreeing with the other copy is not enough: both can\n"
                "      widen or narrow together, and check 4 then passes them.\n"
                + "".join(f"      only {which} derives: {s}\n" for s in sorted(got - PROBES_CONTRACT))
                + "".join(f"      only the contract admits: {s}\n" for s in sorted(PROBES_CONTRACT - got))
                + f"      stages: {stages}\n"
                f"      Fix the pattern in {COMMAND}, not this guard."
            )

    # ---- check 6: every caller NAMES what it needs ----------------------------
    unnamed = []
    for caller in callers:
        got, err = derive(install, bodies[caller])
        if err:
            return engine_error(err, f"token: {token_pat}   filter: {filter_pat}")
        named = {m.group(0) for h in got for m in [TRUTH_RE.search(h)] if m}
        try:
            need = needs(caller, bodies[caller], named)
        except ValueError as e:
            return fail(f"cannot derive what a caller needs: {e}. A caller this guard\n"
                        "      cannot read is not one it can pass.")
        unnamed += [(dep, str(caller), why) for dep, why in sorted(need.items()) if dep not in named]
    if unnamed:
        return fail(
            "a shipped caller NEEDS file(s) it does not name, so the derivation drops them.\n"
            "      /refresh-repo installs only what a caller names by its .github/scripts/\n"
            "      path, so a refresh would install the caller and leave these out.\n\n"
            + "".join(f"      UNNAMED: {d}\n              needed by {c}: {w}\n" for d, c, w in unnamed)
            + "\n      Name each path in the caller (a comment is enough -- the token grep reads\n"
            "      mentions), as cron-notify.yml does. Do not widen the derivation instead."
        )

    print(
        f"check-refresh-derivation: OK — {len(per_caller)} referenced script(s) across "
        f"{len(callers)} caller(s), found per-caller, via grep -E"
    )
    print(f"  contract: every copy derives exactly the {len(PROBES_CONTRACT)}-path contract set from the probes")
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
