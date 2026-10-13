#!/usr/bin/env python3
r"""Guard /refresh-repo's referenced-script derivation against the real callers.

WHY IT EXISTS. refresh-repo Phase 2 (*Deriving the referenced-script set*)
derives WHICH .github/scripts/* files a refresh must install, by running
plugins/directives-toolkit/scripts/derive-scripts.sh over the caller
workflows/actions/directives it is installing; Phase 3's applied-check
(refresh-stamp.sh) runs the same file. The derivation is a few stages of grep
and sed; the callers are YAML edited independently. Nothing tied the two
together, so a caller could change the FORM of an invocation and silently fall
out of the derivation.

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

WHAT THIS CHECKS. derive-scripts.sh is RUN -- by bash, so through real
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
  3. OFF-CONTRACT. Anything the derivation accepts that is not .js/.py under
     .github/scripts/, or exactly .github/scripts/package.json (#398) -- see the
     extras split below.
  4. ONE COPY. Both install derivations -- /refresh-repo's and /new-repo's --
     and the Phase 3 applied-check must all RUN derive-scripts.sh, and none may
     carry an inline copy of the token grep. An installer must name the file as
     "${CLAUDE_PLUGIN_ROOT}/scripts/derive-scripts.sh" in its OWN fenced block:
     the token is substituted only in the text of the command being loaded, so
     /new-repo pointing at refresh-repo.md's block ran `bash
     /scripts/derive-scripts.sh` and stopped the bootstrap (audit 2026-10-11,
     I-1). They once carried a copy each, and keeping two copies in step took
     three Codex rounds on #409 and a stage-by-stage comparison here; one file
     makes "the check is never wider or narrower than the install" (#398)
     structural rather than policed (batch C, R1).
  5. ON CONTRACT. Check 3 only sees what the shipped callers happen to contain,
     so the derivation's output over PROBES must equal PROBES_CONTRACT, the set
     the contract admits from those inputs, exactly. The probes carry the shapes
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
executed by `grep -E` itself -- the guard runs derive-scripts.sh, never a
re-implementation -- and the script writing ANYTHING to stderr is a failure,
because that is how grep reports a construct it will then silently not match.

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

# Before any import: running the gate must leave no __pycache__/ beside the
# local modules it imports (cases_lib.py and/or templates/scripts/gh_yaml.py).
import sys
sys.dont_write_bytecode = True

import ast
import json
import posixpath
import re
import shlex
import subprocess
from pathlib import Path

import yaml

# The shared YAML 1.2 reader (templates/scripts/gh_yaml.py), found from this
# file, not the cwd, which the cases point at a fixture tree (I-24).
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "templates" / "scripts"))
import gh_yaml  # noqa: E402

COMMAND = Path("plugins/directives-toolkit/commands/refresh-repo.md")
# /new-repo installs callers too, from a project with no templates/ of its own,
# so it runs the same derivation over the same kind of fetched buffer (I-1).
NEW_REPO = Path("plugins/directives-toolkit/commands/new-repo.md")
INSTALLERS = (COMMAND, NEW_REPO)
# Phase 3's applied-check runs from this script, not from a fenced block in the
# command: a command's arguments are substituted into its text on load, and the
# check's functions take positional parameters.
STAMP = Path("plugins/directives-toolkit/scripts/refresh-stamp.sh")
# THE derivation. Both of the above run it; this guard runs it too, so what is
# checked is what ships.
DERIVE = Path("plugins/directives-toolkit/scripts/derive-scripts.sh")
# directives/*.md joined the set in directives#355: `test.md` names
# `.github/scripts/browser-ladder.js`, which no workflow or composite invokes,
# so a YAML-only caller set derived nothing for it and a refresh shipped the
# directive without the script it tells you to run.
CALLER_GLOBS = ("templates/workflows/*.yml", "templates/actions/*/action.yml",
                "directives/*.md")

# An INLINE copy of the token grep, in either caller. Check 4 refuses one: the
# derivation must live in DERIVE alone.
INLINE_COPY = re.compile(r"grep -oE '[^']*\\\.github/scripts/[^']*'")
# How each caller must run DERIVE: the install over the fetched buffer, the
# applied-check from its own directory.
# The path must be the plugin-root form: a bare or relative path resolves
# against the project, which has no scripts/ of the plugin's.
COMMAND_CALL = re.compile(r'"\$\{CLAUDE_PLUGIN_ROOT\}/scripts/derive-scripts\.sh"\s*<\s*"\$buf"')
# The applied-check must both point `derive` at the file and RUN it: naming the
# path alone (a variable set and never used) is not running it.
STAMP_DEF = re.compile(r'^\s*derive=.*derive-scripts\.sh', re.M)
STAMP_CALL = re.compile(r'\bbash\s+"\$\{?derive\}?"')
# The calls are matched in EXECUTABLE text only: a call left behind as a comment,
# or quoted in prose, is not one (Codex, #427). The command's code is its fenced
# bash blocks; in both files a comment line is dropped and a trailing comment cut.
# Indented fences count: /new-repo's block sits inside a numbered step.
FENCE = re.compile(r"^[ \t]*```(?:bash|sh)[ \t]*\n(.*?)^[ \t]*```", re.M | re.S)


def shell_code(text):
    """`text` with shell comments removed: whole comment lines dropped, and a
    ` # ...` tail cut. The calls matched here hold no `#`, so a crude cut is safe
    for them; it is never used to read anything else."""
    out = []
    for line in text.splitlines():
        if line.lstrip().startswith("#"):
            continue
        out.append(re.sub(r"\s#.*$", "", line))
    return "\n".join(out)


def command_code(markdown):
    """The executable shell in a command: its fenced bash/sh blocks, comments removed."""
    return shell_code("\n".join(FENCE.findall(markdown)))

# Inputs the derivation must read exactly to the contract (check 5): the
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

# What the derivation must derive from PROBES -- the contract (check 3) applied to
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


def derive(data):
    """Run DERIVE over `data` and return (set of paths, None) or (None, why).

    grep exits 1 for "no matches", which the script maps to exit 0. A pattern
    grep cannot honour exits 2 -- or, for some malformed-but-accepted
    constructs, matches nothing while WARNING on stderr. That warning is the
    only signal distinguishing "matched nothing" from "could not match", so any
    stderr is fatal here, as is any non-zero exit.
    """
    p = subprocess.run(["bash", str(DERIVE)], input=data, capture_output=True, text=True)
    if p.stderr.strip():
        return None, f"it wrote to stderr: {p.stderr.strip()}"
    if p.returncode != 0:
        return None, f"it exited {p.returncode}"
    return {ln for ln in p.stdout.split("\n") if ln}, None


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
def js_tokens(src):
    """A minimal JavaScript lexer: identifiers, string literals (quotes and
    template literals without `${`), single-char punctuation -- with // and /* */
    comments DROPPED and every string kept whole. Enough to tell a live
    `require('./x')` from one in a comment or inside another string (Codex,
    #411 round 6). Known limit: a regex literal holding a quote or `//` can
    mis-lex what follows it; no shipped template has one."""
    toks, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j == -1 else j
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2)
            i = n if j == -1 else j + 2
        elif c in "'\"`":
            j, buf = i + 1, []
            while j < n and src[j] != c:
                if src[j] == "\\" and j + 1 < n:
                    buf.append(src[j + 1])
                    j += 2
                    continue
                buf.append(src[j])
                j += 1
            text = "".join(buf)
            toks.append(("str", None if (c == "`" and "${" in text) else text))
            i = j + 1
        elif c.isalpha() or c in "_$":
            j = i
            while j < n and (src[j].isalnum() or src[j] in "_$"):
                j += 1
            toks.append(("id", src[i:j]))
            i = j
        elif c.isspace():
            i += 1
        else:
            toks.append(("p", c))
            i += 1
    return toks


def js_local_requests(src):
    """{relative specifier: evidence} for each LIVE load of a relative path:
    require('./x'), import('./x'), import ... from './x', import './x'."""
    toks, out = js_tokens(src), {}
    for k, (kind, val) in enumerate(toks):
        nxt = toks[k + 1] if k + 1 < len(toks) else None
        nxt2 = toks[k + 2] if k + 2 < len(toks) else None
        spec = None
        if kind == "id" and val in ("require", "import") and nxt == ("p", "(") \
                and nxt2 and nxt2[0] == "str":
            spec, how = nxt2[1], f"{val}('{nxt2[1]}')"
        elif kind == "id" and val in ("from", "import") and nxt and nxt[0] == "str":
            spec, how = nxt[1], f"{val} '{nxt[1]}'"
        if spec and re.match(r"^\.{1,2}/", spec):
            out[spec] = how
    return out


_ROOT = r"""(?:\./|\$GITHUB_WORKSPACE/)?"""
SCRIPTS_DIR = re.compile(rf"^{_ROOT}\.github/scripts/?$")
SEGMENT = re.compile(r"\n|&&|\|\||;|\|")


def npm_reads_scripts_pkg(run, wd):
    """True when a command in `run` is ANY npm invocation with .github/scripts as
    its directory -- the step's working-directory, a `cd` earlier in the block,
    or `--prefix`. Read as TOKENS, not a regex over the line: npm takes config
    options anywhere, so `npm --silent install` and `npm --prefix X ci` are the
    same command (Codex, #411 rounds 1 and 3). No subcommand list: install, ci,
    cit, it, test, run and their aliases all read the project manifest, and a
    list was one more review round per alias it missed (round 4). Over-reading
    (`npm --version` there) only asks that package.json be named, which a
    directory npm runs in is expected to ship anyway. Not read, by design: NPM_CONFIG_PREFIX in `env:`, `pushd`, a
    subshell `(cd X; npm ci)`, a relative `cd` chain -- none occurs in a
    shipped caller; add a form here when one does."""
    def unexpr(text):   # the expression form tokenises badly; name it as bash does
        return re.sub(r"\$\{\{\s*github\.workspace\s*\}\}", "$GITHUB_WORKSPACE", text)
    run = unexpr(run)
    cwd = unexpr(wd) if isinstance(wd, str) else None
    for seg in SEGMENT.split(run):
        try:
            toks = shlex.split(seg, comments=True)
        except ValueError:
            toks = seg.split()
        while toks and re.match(r"^[A-Za-z_]\w*=", toks[0]):   # VAR=x npm ci
            toks = toks[1:]
        if not toks:
            continue
        if toks[0] == "cd" and len(toks) > 1:
            cwd = toks[1]
            continue
        if toks[0] != "npm":
            continue
        args, target = toks[1:], cwd
        for i, arg in enumerate(args):
            if arg == "--prefix" and i + 1 < len(args):
                target = args[i + 1]
            elif arg.startswith("--prefix="):
                target = arg.split("=", 1)[1]
        if isinstance(target, str) and SCRIPTS_DIR.match(target.strip()):
            return True
    return False


def npm_in_scripts(doc):
    """True when some step runs npm install/ci with .github/scripts as its
    directory -- `npm install` there reads .github/scripts/package.json."""
    def walk(node, wd):
        if isinstance(node, dict):
            d = node.get("defaults")
            if isinstance(d, dict) and isinstance(d.get("run"), dict):
                wd = d["run"].get("working-directory", wd)
            run = node.get("run")
            if isinstance(run, str) and npm_reads_scripts_pkg(run, node.get("working-directory", wd)):
                return True
            return any(walk(v, wd) for v in node.values())
        if isinstance(node, list):
            return any(walk(v, wd) for v in node)
        return False
    return walk(doc, None)


# Node's documented algorithm for a relative require (nodejs.org/api/modules.html,
# "All together"), in its own order -- the whole algorithm, not a candidate list
# grown one review round at a time (Codex, #411 rounds 3-5).
NODE_EXTS = ("", ".js", ".json", ".node")         # LOAD_AS_FILE: X, X.js, X.json, X.node
NODE_INDEX = ("index.js", "index.json", "index.node")  # LOAD_INDEX


def js_resolve(dep):
    """The file Node loads for `require(dep)` (a .github/scripts/ path), checked
    against the template tree: LOAD_AS_FILE(X), then LOAD_AS_DIRECTORY(X) --
    package.json `main` M as LOAD_AS_FILE(M) then LOAD_INDEX(M), then
    LOAD_INDEX(X). With no candidate present it stays `<dep>.js`, so a require
    of a file nothing ships is still reported rather than dropped. (The install
    contract takes .js/.py only, so a JSON, .node or extensionless target is
    reported by its REAL name and refused until it is one -- never as a phantom.)"""
    def tpl(p):
        return Path(TEMPLATE_SCRIPTS) / p[len(SCRIPTS) + 1:]

    def as_file(x):
        return [x + e for e in NODE_EXTS]

    def as_index(x):
        return [posixpath.join(x, i) for i in NODE_INDEX]

    cands = as_file(dep)
    pkg = tpl(posixpath.join(dep, "package.json"))
    if pkg.is_file():
        try:
            main = json.loads(pkg.read_text(encoding="utf-8")).get("main")
        except (ValueError, AttributeError):
            main = None
        if isinstance(main, str) and main:
            m = posixpath.normpath(posixpath.join(dep, main))
            cands += as_file(m) + as_index(m)
    cands += as_index(dep)
    for c in cands:
        if tpl(c).is_file():
            return c
    return dep if posixpath.splitext(dep)[1] else dep + ".js"


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
        for spec, how in js_local_requests(body).items():
            dep = js_resolve(posixpath.normpath(posixpath.join(here, spec)))
            deps[dep] = how
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
            doc = gh_yaml.load(body)
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


def truth(text):
    # A trailing period is sentence punctuation, not part of the path.
    return {h.rstrip(".") for h in TRUTH_RE.findall(text) if in_contract(h.rstrip("."))}


def engine_error(err, what):
    return fail(
        f"{DERIVE} is not usable by the engine that RUNS it.\n"
        f"      {err}\n"
        "      GNU grep -E is not Python's `re`: a construct `re` accepts (e.g. `(?:`)\n"
        "      makes grep warn and match NOTHING, and a caller that ignored the warning\n"
        "      would read an empty derivation as success.\n"
        f"      {what}\n"
        f"      Fix {DERIVE}, not this guard."
    )


def derived_paths(data, what):
    """DERIVE's output over `data`, cut to the path token (ground truth's shape)."""
    got, err = derive(data)
    if err:
        return None, engine_error(err, what)
    return {m.group(0) for h in got for m in [TRUTH_RE.search(h)] if m}, None


def main():
    for f, role in ((COMMAND, "the command that installs by the derivation"),
                    (NEW_REPO, "the bootstrap, which installs by the derivation"),
                    (DERIVE, "the derivation itself"),
                    (STAMP, "the Phase 3 applied-check")):
        if not f.exists():
            return fail(f"{f} not found ({role}) — what this guard pins has moved or been deleted.")

    installers = {f: f.read_text(encoding="utf-8") for f in INSTALLERS}
    stamp = STAMP.read_text(encoding="utf-8")

    # ---- check 4: ONE copy, run by every caller --------------------------------
    for f, text in (*installers.items(), (STAMP, stamp)):
        if INLINE_COPY.search(text):
            return fail(
                f"{f} carries an INLINE copy of the script derivation.\n"
                f"      The derivation lives in {DERIVE} alone, which the install and the\n"
                "      Phase 3 applied-check both run: a second copy can drift, and a check\n"
                "      wider or narrower than the install refuses a stamp the install can\n"
                "      never satisfy, or passes a dependency it never saw (#398).\n"
                f"      Run {DERIVE.name} there instead."
            )
    for f, text in installers.items():
        if not COMMAND_CALL.search(command_code(text)):
            return fail(
                f"{f} does not run {DERIVE.name} over the fetched buffer.\n"
                f"      The install derivation must RUN `bash \"${{CLAUDE_PLUGIN_ROOT}}/scripts/{DERIVE.name}\" <\"$buf\"`\n"
                "      in a fenced bash block of its OWN (a comment, a prose mention, or a pointer\n"
                "      to another command's block is not a call: the plugin root is substituted\n"
                "      only in the command being loaded), so it derives exactly what the\n"
                "      Phase 3 applied-check verifies."
            )
    stamp_code = shell_code(stamp)
    if not (STAMP_DEF.search(stamp_code) and STAMP_CALL.search(stamp_code)):
        return fail(
            f"{STAMP} does not run {DERIVE.name}.\n"
            "      It must set `derive=` to the file and run `bash \"$derive\"`, outside a\n"
            "      comment. Phase 3 verifies every script dependency, delta or not; without\n"
            "      the shared derivation it either stops checking scripts or grows its own copy."
        )

    callers = sorted({p for g in CALLER_GLOBS for p in Path().glob(g)})
    if not callers:
        return fail(
            "no caller files matched "
            f"{', '.join(CALLER_GLOBS)} — this guard would pass vacuously, which is the\n"
            "      fail-open shape it exists to prevent."
        )
    bodies = {c: c.read_text(encoding="utf-8") for c in callers}

    # ---- check 1: per caller -------------------------------------------------
    missed, named_by = [], {}
    documented_all = set()
    for caller in callers:
        got, err = derived_paths(bodies[caller], f"caller: {caller}")
        if err:
            return err
        named_by[caller] = got
        documented_all |= got
        for script in sorted(truth(bodies[caller]) - got):
            missed.append((script, str(caller)))

    if missed:
        lines = [
            "the derivation MISSES script(s) a shipped caller references.",
            "      A refresh installing that caller would not install the script, and the",
            "      job dies at step resolution on any project that lacks it.",
            "      Checked PER CALLER: /refresh-repo installs a SUBSET, so another caller",
            "      matching the same script does not save the one that misses it.",
            "",
        ]
        lines += [f"      MISSED: {s}\n              referenced by {w}" for s, w in missed]
        lines += ["", f"      Fix {DERIVE}, not this guard."]
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
    undelimited = [f for f, text in installers.items() if not DELIMITER_LINE.search(text)]
    delimited = not undelimited
    ragged = [c for c in callers if not bodies[c].endswith("\n")]
    joiner = "\n" if delimited else ""

    lost, lost_pair = [], None
    for first in ragged:
        for second in callers:
            if second is first:
                continue
            buf = bodies[first] + joiner + bodies[second] + joiner
            got, err = derived_paths(buf, f"concatenation: {first} + {second}")
            if err:
                return err
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
            f"      The fetch loop {'DOES' if delimited else 'DOES NOT'} append a delimiter"
            f"{'' if delimited else ' in ' + ', '.join(str(f) for f in undelimited)}.\n"
            f"      Concatenating {lost_pair[0]} before {lost_pair[1]} loses:\n"
            + "".join(f"      LOST: {s}\n" for s in lost)
            + f"      Append a token boundary after every fetch in {', '.join(str(f) for f in undelimited) or COMMAND}."
        )

    # ---- check 3: extras -----------------------------------------------------
    # Extras split in two, and the split is the whole point -- "matches more than
    # ground truth" is NOT one condition.
    #
    #   * ends .js/.py -> a NOTE. A widening, not a break, and the asymmetry
    #     favours it: installing a script nothing referenced costs a file, missing
    #     one ships a red build.
    #
    #   * outside the contract -> a FAILURE. The derivation's declared contract is
    #     .js/.py under .github/scripts/ plus exactly package.json there (#398), so
    #     this is the derivation accepting something outside its own contract.
    #     The live instance: `grep -E '\.(js|py)'` unterminated matches the `.js`
    #     inside `.json`, so `.github/scripts/package-lock.json` enters the
    #     install list as a script. Printing that and exiting 0 is the fail-open
    #     shape (#323) -- a green run with a note nobody reads is
    #     indistinguishable from a guard that passed.
    extra = sorted(documented_all - per_caller)
    off_contract = [s for s in extra if not in_contract(s)]
    if off_contract:
        return fail(
            "the derivation matches path(s) OUTSIDE its own contract.\n"
            "      It is meant to yield .js/.py under .github/scripts/, plus exactly\n"
            f"      {PACKAGE_JSON}. These are neither,\n"
            "      so a refresh would install them as scripts:\n\n"
            + "".join(f"      OFF-CONTRACT: {s}\n" for s in off_contract)
            + "\n      Usual cause: an unterminated extension filter (`\\.(js|py)` with no `$`\n"
            "      matches the `.js` inside `.json`).\n"
            f"      Fix {DERIVE}, not this guard."
        )
    for script in extra:
        print(f"note: derivation also matches {script}, which the truth scan does not reach")

    # ---- check 5: the derivation reads the probes exactly to the contract -----
    got, err = derive(PROBES)
    if err:
        return engine_error(err, "over the probe set")
    if got != PROBES_CONTRACT:
        return fail(
            f"{DERIVE} derives OFF ITS CONTRACT from the probe inputs.\n"
            "      The contract is .js/.py under .github/scripts/ plus exactly\n"
            f"      {PACKAGE_JSON}. The shipped callers may not exercise every edge,\n"
            "      so the probes do:\n"
            + "".join(f"      only the derivation gives: {s}\n" for s in sorted(got - PROBES_CONTRACT))
            + "".join(f"      only the contract admits: {s}\n" for s in sorted(PROBES_CONTRACT - got))
            + f"      Fix {DERIVE}, not this guard."
        )

    # ---- check 6: every caller NAMES what it needs ----------------------------
    unnamed = []
    for caller in callers:
        named = named_by[caller]
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
        f"{len(callers)} caller(s), found per-caller, via {DERIVE.name}"
    )
    print(f"  one copy: {', '.join(f.name for f in INSTALLERS)} and {STAMP.name} all run {DERIVE.name}")
    print(f"  contract: the derivation gives exactly the {len(PROBES_CONTRACT)}-path contract set from the probes")
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
