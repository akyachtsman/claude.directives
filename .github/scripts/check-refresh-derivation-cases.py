#!/usr/bin/env python3
r"""Guard check-refresh-derivation.py — the guard on /refresh-repo's derivation.

WHY THIS EXISTS. Of check-refresh-derivation.py's checks, TWO ARE NEVER
EXERCISED BY THIS REPO. Every shipped caller ends in a newline, so the
concatenation check has nothing to bite on; every shipped caller is matched by
the current pattern, so the per-caller check never has a miss to report. The
guard says so on its own success line -- "concatenation: NOT EXERCISED" -- but a
check that only ever runs against inputs it passes is an assertion, not a test.
It could be deleted, or silently broken, and CI would not notice.

So each case here builds a synthetic repo in a temp directory: a refresh-repo.md
carrying a chosen derivation pipeline, plus caller YAML of a chosen shape, and
runs the REAL guard against it as a subprocess. The guard resolves COMMAND and
CALLER_GLOBS relative to cwd and has no importable surface, so the CLI contract
in a temp cwd is the only honest way to drive it -- and it is also the contract
qa.yml uses.

A case asserts BOTH the exit code and a needle from the diagnostic. Exit code
alone is not enough: this suite's own development produced two runs that exited
non-zero for reasons the case was not about -- a fixture whose mutation never
applied (a quoting mismatch, so the "mutated" pipeline was the original), and a
subshell that resolved the guard's path wrongly and reported the interpreter's
exit 2 as a refusal. A traceback is therefore rejected outright: a crash is not
a catch.

MEASURED 2026-09-01. Four mutations applied to the guard via
CHECK_REFRESH_DERIVATION_BIN, and the cases that reddened for each:

    A  per-caller loop neutered (the pre-review aggregate logic)
       -> "the old command-prefixed form is refused"
       -> "a miss in one caller is NOT masked by a match in another"
    B  run_grep stops treating grep's stderr as fatal
       -> "a Python-only construct grep cannot honour is refused"
    C  concatenation check neutered (`ragged = []`)
       -> "an UNDELIMITED loop that loses a script is refused"
       -> "…and the delimiter fixes exactly that case"
       -> "a ragged caller whose tail is not a path must NOT false-alarm"
    D  off-contract extras demoted back to a printed note
       -> "an unterminated extension filter is refused (.json)"
    E  TRUTH_RE reverted to slash-blind (the #345 round-2 bug itself)
       -> "a nested script is found, not truncated to its directory"
       -> "a SLASH-FREE pattern cannot reach a nested script and is refused"

C is worth reading twice. It reddens a MUST-NOT-FAIL case, and that is the point:
with nothing ragged the guard prints "NOT EXERCISED" instead of the checked-clean
line, so the needle catches a check that stopped looking while still exiting 0.
An exit-code-only assertion would have called that mutant caught by two cases and
missed entirely by the third.

E is here because the case that should have caught it WAS decorative. The green
control was "a widened char class is a widening, not a break", and it passed
against a fixture containing no nested path -- so it exercised the widening in
name only, and the guard's slash-blind ground truth truncated any real nested
match to its directory and then rejected it as off-contract. Codex found it on
round 2. It is replaced by three cases that carry an actual nested path, in both
pattern shapes, plus a bare-directory reference that must not false-alarm.

That is the second decorative case in two PRs (#344 had one too), and both were
found the same way: by running the case against a mutant instead of trusting a
green line. A case built from a fixture that cannot express the condition it
names will pass forever.

The contract check (5) and the needs-named check (6) are pinned the same way,
each refusal beside its accepting complement: two copies widened or narrowed
IDENTICALLY agree with each other, so only the probe-vs-contract check can
refuse them; and a caller whose comment stops naming a file its script
`require`s, or the package.json its `npm install` reads, is refused while the
same caller naming them passes. MEASURED 2026-10-08 via
CHECK_REFRESH_DERIVATION_BIN: with check 5's comparison disabled, exactly the
two "identically" refusals fail; with check 6's, exactly the two "reworded
comment" refusals.
"""

# ── HISTORY MOVED FROM CLAUDE.md (2026-09-23) ────────────────────
# CLAUDE.md now keeps a one-line purpose per gate command; the history and
# evidence it carried about this script moved here, verbatim.
#
# From CLAUDE.md → Self-test monitoring, the `qa.yml` bullet:
#   plus `check-refresh-derivation-cases.py` guarding it — the derivation is run
#   through real `grep -E`, not Python's `re`, because a construct `re` accepts
#   makes grep match NOTHING and the pipeline's trailing `sort` swallows the
#   failure)

import os
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

# Points the suite at a MUTATED copy of the guard, so "these cases discriminate"
# is re-provable rather than a claim made once in a commit message. Same
# mechanism as CHECK_CLAIMS_BIN (#344).
GUARD = Path(
    os.environ.get("CHECK_REFRESH_DERIVATION_BIN")
    or Path(__file__).resolve().parent / "check-refresh-derivation.py"
).resolve()

BARE = r"\.github/scripts/[A-Za-z0-9_.-]+"
PREFIXED = r"(node|python3) \.github/scripts/[A-Za-z0-9_.-]+"
SLASHED = r"\.github/scripts/[A-Za-z0-9_./-]+"      # the shipped shape
SLASHFREE = r"\.github/scripts/[A-Za-z0-9_.-]+"      # pre-#345-round-2
EXT = r"\.(js|py)$"
EXT_SHIPPED = r"\.(js|py)$|^\.github/scripts/package\.json$"   # #398
EXT_PKG_UNANCHORED = r"\.(js|py)$|package\.json$"
EXT_LOOSE = r"\.(js|py)"
EXT_PY_ONLY = r"\.(?:js|py)$"

DELIM = """  printf '\\n' >>"$buf" """.rstrip()


# The Phase 3 applied-check's own copy of the derivation, in its real shape.
# Every fixture carries one by default: the guard refuses a command without it.
PHASE3 = ("\n```bash\nscan() {{\n  deps=\"$(printf '%s\\n' \"$1\" | "
          "grep -oE '{token}'{rest}; true)\"\n}}\n```\n")
STRIP = r"s/[.]+$//"


def phase3_md(token, ext, sed=True):
    """The Phase 3 copy: `token`, the trailing-period sed when `sed`, then `ext`
    -- or no filter when ext is None."""
    rest = f" | sed -E '{STRIP}'" if sed else ""
    rest += "" if ext is None else f" | grep -E '{ext}'"
    return PHASE3.format(token=token, rest=rest)


KEEP = object()


def command_md(token=SLASHED, ext=EXT_SHIPPED, delimited=True, token_line=True, ext_line=True,
               phase3=KEEP, sed=True, phase3_token=None, phase3_sed=None):
    """Build a refresh-repo.md carrying the chosen pipeline, plus a Phase 3 copy
    that mirrors it -- same token, sed and filter -- unless told otherwise:
    phase3 is a different filter, None for no filter, or False for no Phase 3
    copy at all; phase3_token and phase3_sed override those stages alone."""
    pipe = "refs=$("
    pipe += f"grep -oE '{token}' \"$buf\"" if token_line else "rg -o 'whatever' \"$buf\""
    if sed:
        pipe += f" \\\n       | sed -E '{STRIP}'"
    if ext_line:
        pipe += f" \\\n       | grep -E '{ext}'"
    pipe += " | sort -u)"
    return (
        "```bash\n"
        "for c in $callers; do\n"
        '  curl -fsSL "$raw/$c" >>"$buf"\n'
        + (DELIM + "\n" if delimited else "")
        + "done\n"
        + pipe + "\n"
        "```\n"
        + ("" if phase3 is False else phase3_md(
            phase3_token or token, ext if phase3 is KEEP else phase3,
            sed if phase3_sed is None else phase3_sed))
    )


def build(tmp, command_text, callers, stamp_text=None):
    root = Path(tmp)
    cmd = root / "plugins/directives-toolkit/commands/refresh-repo.md"
    cmd.parent.mkdir(parents=True, exist_ok=True)
    if command_text is not None:
        cmd.write_text(command_text, encoding="utf-8")
    if stamp_text is not None:
        stamp = root / "plugins/directives-toolkit/scripts/refresh-stamp.sh"
        stamp.parent.mkdir(parents=True, exist_ok=True)
        stamp.write_text(stamp_text, encoding="utf-8")
    for rel, body in callers.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body, encoding="utf-8")
    return root


def run(root):
    p = subprocess.run([sys.executable, str(GUARD)], cwd=root, capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


PASS, FAIL = [], []


def case(name, *, command_text, callers, expect_exit, needle, stamp_text=None):
    with TemporaryDirectory() as tmp:
        root = build(tmp, command_text, callers, stamp_text)
        rc, out = run(root)
    problems = []
    if "Traceback (most recent call last)" in out:
        problems.append("the guard CRASHED — a traceback is not a catch, so this proves nothing")
    if rc != expect_exit:
        problems.append(f"expected exit {expect_exit}, got {rc}")
    if needle and needle not in out:
        problems.append(f"expected {needle!r} in the output")
    if problems:
        FAIL.append((name, problems, out))
        print(f"FAIL: {name} (exit {rc})")
        for pr in problems:
            print(f"        {pr}")
        for line in out.strip().splitlines()[:6]:
            print(f"      | {line}")
    else:
        PASS.append(name)
        print(f"OK:   {name} (exit {rc})")


# A pair of well-formed callers, both ending in a newline.
GOOD = {
    "templates/workflows/one.yml": "steps:\n  - run: node .github/scripts/a.js\n",
    "templates/actions/x/action.yml":
        'runs:\n  - run: node "$GITHUB_WORKSPACE/.github/scripts/b.py"\n',
}
# The action references a script the PREFIXED pattern cannot see, while the
# workflow references the SAME script in a form it can. An aggregated check
# passes this; a per-caller check must not.
MASKING = {
    "templates/workflows/one.yml": "steps:\n  - run: node .github/scripts/shared.py\n",
    "templates/actions/x/action.yml":
        'runs:\n  - run: node "$GITHUB_WORKSPACE/.github/scripts/shared.py"\n',
}
# The workflow has NO trailing newline and ends on a script path. Sorted last,
# so a single arbitrary-order concatenation would put nothing after it and miss
# the hazard entirely — which an earlier draft of the guard did.
RAGGED = {
    "templates/workflows/one.yml": "steps:\n  - run: node .github/scripts/a.js",
    "templates/actions/x/action.yml": "runs:\n  - run: python3 .github/scripts/b.py\n",
}
# A script one directory down — `templates/ui-tests/` installs to
# `.github/scripts/ui-tests/`, so this shape is a reference waiting to happen.
NESTED = {
    "templates/workflows/one.yml": "steps:\n  - run: node .github/scripts/a.js\n",
    "templates/actions/x/action.yml": "runs:\n  - run: python3 .github/scripts/nested/a.py\n",
}
# A bare DIRECTORY reference, as templates/workflows/qa.yml really carries. It is
# not a script and must not be reported as missing or off-contract.
DIRREF = {
    "templates/workflows/one.yml":
        "steps:\n  - run: cp -r kit .github/scripts/ui-tests/\n"
        "  - run: node .github/scripts/a.js\n",
    "templates/actions/x/action.yml": "runs:\n  - run: python3 .github/scripts/b.py\n",
}
# Ragged too, but the dangling token is not a script path, so nothing can be lost.
RAGGED_SAFE = {
    "templates/workflows/one.yml": "steps:\n  - run: node .github/scripts/a.js\n    name: tail",
    "templates/actions/x/action.yml": "runs:\n  - run: python3 .github/scripts/b.py\n",
}

case("the shipped shape passes",
     command_text=command_md(), callers=GOOD, expect_exit=0,
     needle="referenced script(s)")

case("the old command-prefixed form is refused",
     command_text=command_md(token=PREFIXED), callers=GOOD, expect_exit=1,
     needle="MISSED: .github/scripts/b.py")

case("a miss in one caller is NOT masked by a match in another",
     command_text=command_md(token=PREFIXED), callers=MASKING, expect_exit=1,
     needle="referenced by templates/actions/x/action.yml")

case("an unterminated extension filter is refused (.json)",
     command_text=command_md(ext=EXT_LOOSE),
     callers={**GOOD, "templates/workflows/two.yml":
              "steps:\n  - run: cat .github/scripts/package-lock.json\n"},
     expect_exit=1, needle="OFF-CONTRACT: .github/scripts/package-lock.json")

case("a Python-only construct grep cannot honour is refused",
     command_text=command_md(ext=EXT_PY_ONLY), callers=GOOD, expect_exit=1,
     needle="not usable by the engine that RUNS it")

case("an UNDELIMITED loop that loses a script is refused",
     command_text=command_md(delimited=False), callers=RAGGED, expect_exit=1,
     needle="LOST: .github/scripts/a.js")

case("…and the delimiter fixes exactly that case",
     command_text=command_md(delimited=True), callers=RAGGED, expect_exit=0,
     needle="lack a trailing newline")

case("a nested script is found, not truncated to its directory",
     command_text=command_md(), callers=NESTED, expect_exit=0,
     needle=".github/scripts/nested/a.py")

case("a SLASH-FREE pattern cannot reach a nested script and is refused",
     command_text=command_md(token=SLASHFREE), callers=NESTED, expect_exit=1,
     needle="MISSED: .github/scripts/nested/a.py")

case("a bare directory reference is neither missing nor off-contract",
     command_text=command_md(), callers=DIRREF, expect_exit=0,
     needle="referenced script(s)")

case("a ragged caller whose tail is not a path must NOT false-alarm",
     command_text=command_md(delimited=False), callers=RAGGED_SAFE, expect_exit=0,
     needle="lack a trailing newline")

case("callers that all end in a newline are reported as NOT EXERCISED",
     command_text=command_md(), callers=GOOD, expect_exit=0,
     needle="NOT EXERCISED")

case("a missing command file is refused, not skipped",
     command_text=None, callers=GOOD, expect_exit=1,
     needle="not found")

case("a reshaped pipeline the extractor cannot read is refused",
     command_text=command_md(token_line=False), callers=GOOD, expect_exit=1,
     needle="could not find the derivation's")

case("a pipeline with no extension filter is refused",
     command_text=command_md(ext_line=False), callers=GOOD, expect_exit=1,
     needle="not the `grep -E")

# #398: exactly .github/scripts/package.json joins the contract.
PKG = {"templates/workflows/cron.yml":
       "steps:\n  - run: npm install  # reads .github/scripts/package.json\n"
       "  - run: node .github/scripts/notify-task.js\n"}
KIT_PKG = {"templates/workflows/q.yml":
           "steps:\n  - run: node .github/scripts/a.js\n"
           "  # kit: .github/scripts/ui-tests/package.json\n"
           "  # lock: .github/scripts/package-lock.json\n"}

case("the shipped filter derives .github/scripts/package.json",
     command_text=command_md(ext=EXT_SHIPPED), callers=PKG, expect_exit=0,
     needle="  .github/scripts/package.json")

case("a .js/.py-only filter MISSES package.json, which the contract now includes",
     command_text=command_md(ext=EXT), callers=PKG, expect_exit=1,
     needle="MISSED: .github/scripts/package.json")

case("an UNANCHORED package.json takes the kit's ui-tests/package.json — refused",
     command_text=command_md(ext=EXT_PKG_UNANCHORED), callers=KIT_PKG, expect_exit=1,
     needle="OFF-CONTRACT: .github/scripts/ui-tests/package.json")

case("the shipped filter leaves the kit's package.json and the lockfile out",
     command_text=command_md(ext=EXT_SHIPPED), callers=KIT_PKG, expect_exit=0,
     needle="1 referenced script(s)")

case("the Phase 3 copy filtering like the install passes",
     command_text=command_md(ext=EXT_SHIPPED), callers=PKG, expect_exit=0,
     needle="referenced script(s)")

case("a Phase 3 copy that filters DIFFERENTLY from the install is refused",
     command_text=command_md(ext=EXT_SHIPPED, phase3=EXT), callers=PKG, expect_exit=1,
     needle="derive DIFFERENTLY")

case("an install pipeline that LOST its filter is refused, not read from Phase 3's",
     command_text=command_md(ext_line=False, phase3=EXT_SHIPPED), callers=PKG, expect_exit=1,
     needle="not the `grep -E")

case("a Phase 3 copy that LOST its filter is refused",
     command_text=command_md(ext=EXT_SHIPPED, phase3=None), callers=PKG, expect_exit=1,
     needle="NO extension filter of its own")

case("a filterless Phase 3 copy does not borrow an identical filter from LATER in the file",
     command_text=command_md(ext=EXT_SHIPPED, phase3=None)
     + f"\n```bash\nls | grep -E '{EXT_SHIPPED}'\n```\n",
     callers=PKG, expect_exit=1, needle="NO extension filter of its own")

# Codex, #409 round 4: the copies are compared by RUNNING them, every stage.
case("a Phase 3 token that cannot reach a nested path is refused, same filter or not",
     command_text=command_md(ext=EXT_SHIPPED, phase3_token=SLASHFREE), callers=PKG,
     expect_exit=1, needle="only the install derives: .github/scripts/nested/d.py")

case("an install without the trailing-period stage derives LESS than Phase 3 — refused",
     command_text=command_md(ext=EXT_SHIPPED, sed=False, phase3_sed=True), callers=PKG,
     expect_exit=1, needle="derives: .github/scripts/e.js")

case("a script named at the end of a sentence is derived",
     command_text=command_md(ext=EXT_SHIPPED),
     callers={"directives/test.md": "Run it with .github/scripts/browser-ladder.js.\n"},
     expect_exit=0, needle="  .github/scripts/browser-ladder.js")

case("a command with NO Phase 3 copy at all is refused, not compared against itself",
     command_text=command_md(ext=EXT_SHIPPED, phase3=False), callers=PKG, expect_exit=1,
     needle="applied-check's copy of the derivation is missing")

# The shipped layout: Phase 3's copy lives in scripts/refresh-stamp.sh, because a
# command's arguments are substituted into its text on load and scan() takes $1.
# The guard reads the command and the script as one text.
def stamp_sh(ext):
    return "#!/usr/bin/env bash\n" + phase3_md(SLASHED, ext).replace("```bash\n", "").replace("```\n", "")


case("the Phase 3 copy in refresh-stamp.sh, filtering like the install, passes",
     command_text=command_md(ext=EXT_SHIPPED, phase3=False), callers=PKG, expect_exit=0,
     needle="referenced script(s)", stamp_text=stamp_sh(EXT_SHIPPED))

case("a Phase 3 copy in refresh-stamp.sh that filters DIFFERENTLY is refused",
     command_text=command_md(ext=EXT_SHIPPED, phase3=False), callers=PKG, expect_exit=1,
     needle="derive DIFFERENTLY", stamp_text=stamp_sh(EXT))

# Check 5 -- both copies move TOGETHER, so check 4 (copy vs copy) is blind.
case("both copies WIDENED identically are refused against the contract",
     command_text=command_md(ext=EXT_PKG_UNANCHORED), callers=PKG, expect_exit=1,
     needle="only the install pipeline derives: .github/scripts/ui-tests/package.json")

case("both copies NARROWED identically are refused against the contract",
     command_text=command_md(ext=EXT), callers=GOOD, expect_exit=1,
     needle="only the contract admits: .github/scripts/package.json")

case("both copies on the contract pass the probe check",
     command_text=command_md(ext=EXT_SHIPPED), callers=GOOD, expect_exit=0,
     needle="derives exactly the 6-path contract set")

# Check 6 -- the cron-notify shape: a script that require()s a sibling, and
# `npm install` run in .github/scripts. The names live only in a comment.
NOTIFY_TASK = {"templates/scripts/notify-task.js":
               "const { sendEmail } = require('./notify-email.js');\n"}
CRON_STEPS = ("jobs:\n  run:\n    steps:\n"
              "      - name: Install deps\n"
              "        working-directory: .github/scripts\n"
              "        run: npm install\n"
              "{comment}"
              "      - name: Run task\n"
              "        working-directory: .github/scripts\n"
              '        run: node "$GITHUB_WORKSPACE/.github/scripts/notify-task.js"\n')
NAMED = ("      # needs .github/scripts/notify-email.js (required by the task)\n"
         "      # and .github/scripts/package.json (what npm install reads)\n")
CRON_NAMED = {**NOTIFY_TASK, "templates/workflows/cron.yml": CRON_STEPS.format(comment=NAMED)}

case("a caller that names what its script requires and npm reads passes",
     command_text=command_md(), callers=CRON_NAMED, expect_exit=0,
     needle="  .github/scripts/notify-email.js")

case("a reworded comment that drops the required sibling is refused",
     command_text=command_md(),
     callers={**NOTIFY_TASK, "templates/workflows/cron.yml": CRON_STEPS.format(
         comment="      # needs the email helper and .github/scripts/package.json\n")},
     expect_exit=1, needle="UNNAMED: .github/scripts/notify-email.js")

case("a reworded comment that drops package.json is refused",
     command_text=command_md(),
     callers={**NOTIFY_TASK, "templates/workflows/cron.yml": CRON_STEPS.format(
         comment="      # needs .github/scripts/notify-email.js and the manifest\n")},
     expect_exit=1, needle="UNNAMED: .github/scripts/package.json")

# Codex, #411: `--prefix` is a config option, legal before the subcommand too.
PREFIX_FIRST = ("jobs:\n  run:\n    steps:\n"
                "      - run: npm --prefix .github/scripts ci\n"
                "{comment}"
                '      - run: node .github/scripts/a.js\n')

case("`npm --prefix .github/scripts ci` (option first) needs package.json named",
     command_text=command_md(),
     callers={"templates/workflows/p.yml": PREFIX_FIRST.format(comment="")},
     expect_exit=1, needle="UNNAMED: .github/scripts/package.json")

case("the same option-first caller naming package.json passes",
     command_text=command_md(),
     callers={"templates/workflows/p.yml": PREFIX_FIRST.format(
         comment="      # npm reads .github/scripts/package.json\n")},
     expect_exit=0, needle="  .github/scripts/package.json")

# Codex, #411 round 3: npm is read as TOKENS, so any config option may precede
# the subcommand, and a `cd` earlier in the block sets the directory.
def npm_case(name, steps, expect_exit, needle):
    case(name, command_text=command_md(),
         callers={"templates/workflows/n.yml": "jobs:\n  t:\n    steps:\n" + steps
                  + "      - run: node .github/scripts/a.js\n"},
         expect_exit=expect_exit, needle=needle)

npm_case("`npm --silent install` in .github/scripts needs package.json named",
         "      - working-directory: .github/scripts\n        run: npm --silent install\n",
         1, "UNNAMED: .github/scripts/package.json")
npm_case("`cd .github/scripts && npm --loglevel warn ci` needs package.json named",
         "      - run: cd .github/scripts && npm --loglevel warn ci\n",
         1, "UNNAMED: .github/scripts/package.json")
npm_case("`CI=1 npm ci` (an env prefix) in .github/scripts needs package.json named",
         "      - working-directory: .github/scripts\n        run: CI=1 npm ci\n",
         1, "UNNAMED: .github/scripts/package.json")
npm_case("`npm cit` (install-ci-test) in .github/scripts needs package.json named",
         "      - working-directory: .github/scripts\n        run: npm cit\n",
         1, "UNNAMED: .github/scripts/package.json")
npm_case("`npm test` in .github/scripts needs package.json named (no alias list)",
         "      - working-directory: .github/scripts\n        run: npm test\n",
         1, "UNNAMED: .github/scripts/package.json")
npm_case("a `${{ github.workspace }}/.github/scripts` working-directory still counts",
         "      - working-directory: ${{ github.workspace }}/.github/scripts\n        run: npm ci\n",
         1, "UNNAMED: .github/scripts/package.json")
npm_case("`npm --silent install` in ANOTHER directory needs nothing",
         "      - working-directory: .github/scripts/ui-tests\n        run: npm --silent install\n",
         0, "1 referenced script(s)")

# Codex, #411 round 3: an extensionless require resolves as Node does.
LIB_DIR = {"templates/scripts/main.js": "const lib = require('./lib');\n",
           "templates/scripts/lib/index.js": "module.exports = {};\n"}
JS_CALLER = ("jobs:\n  t:\n    steps:\n"
             "      - run: node .github/scripts/main.js\n{comment}")

case("`require('./lib')` resolving to lib/index.js must name lib/index.js",
     command_text=command_md(),
     callers={**LIB_DIR, "templates/workflows/j.yml": JS_CALLER.format(comment="")},
     expect_exit=1, needle="UNNAMED: .github/scripts/lib/index.js")

case("`require('./helper')` with an EXTENSIONLESS helper file must name that file",
     command_text=command_md(),
     callers={"templates/scripts/main.js": "require('./helper');\n",
              "templates/scripts/helper": "module.exports = 1;\n",
              "templates/workflows/j.yml": JS_CALLER.format(
                  comment="      # loads .github/scripts/helper.js\n")},
     expect_exit=1, needle="UNNAMED: .github/scripts/helper")

case("`require('./lib')` with a package.json `main` pointing at a .json file names THAT file",
     command_text=command_md(),
     callers={"templates/scripts/main.js": "require('./lib');\n",
              "templates/scripts/lib/package.json": '{"main": "entry"}\n',
              "templates/scripts/lib/entry.json": "{}\n",
              "templates/workflows/j.yml": JS_CALLER.format(comment="")},
     expect_exit=1, needle="UNNAMED: .github/scripts/lib/entry.json")

case("`require('./lib')` with only lib/index.json names lib/index.json",
     command_text=command_md(),
     callers={"templates/scripts/main.js": "require('./lib');\n",
              "templates/scripts/lib/index.json": "{}\n",
              "templates/workflows/j.yml": JS_CALLER.format(comment="")},
     expect_exit=1, needle="UNNAMED: .github/scripts/lib/index.json")

# Codex, #411 round 6: JS is LEXED -- a require in a comment or a string is not a load.
for label, src in (("a // comment", "// require('./legacy')\nmodule.exports = 1;\n"),
                   ("a /* block */ comment", "/* const old = require('./legacy'); */\n"),
                   ("a string literal", "const msg = \"require('./legacy')\";\n")):
    case(f"a require inside {label} is not a dependency",
         command_text=command_md(),
         callers={"templates/scripts/main.js": src,
                  "templates/scripts/legacy.js": "module.exports = 1;\n",
                  "templates/workflows/j.yml": JS_CALLER.format(comment="")},
         expect_exit=0, needle="1 referenced script(s)")

case("a LIVE ES import is still a dependency after lexing",
     command_text=command_md(),
     callers={"templates/scripts/main.js": "import { x } from './legacy.js';\n",
              "templates/scripts/legacy.js": "export const x = 1;\n",
              "templates/workflows/j.yml": JS_CALLER.format(comment="")},
     expect_exit=1, needle="UNNAMED: .github/scripts/legacy.js")

case("the same caller naming lib/index.js passes (no phantom lib.js asked for)",
     command_text=command_md(),
     callers={**LIB_DIR, "templates/workflows/j.yml": JS_CALLER.format(
         comment="      # loads .github/scripts/lib/index.js\n")},
     expect_exit=0, needle="  .github/scripts/lib/index.js")

# Codex, #411: Python imports are read with `ast`, so every form counts.
PY_CALLER = ("jobs:\n  t:\n    steps:\n"
             "      - run: python3 .github/scripts/main.py\n"
             "{comment}")

def py_case(name, main_src, extra, comment, expect_exit, needle):
    case(name, command_text=command_md(),
         callers={"templates/scripts/main.py": main_src, **extra,
                  "templates/workflows/py.yml": PY_CALLER.format(comment=comment)},
         expect_exit=expect_exit, needle=needle)

HELPER = {"templates/scripts/nested/helper.py": "def run(): pass\n"}
py_case("a DOTTED Python import of a nested helper must be named",
        "from nested.helper import run\n", HELPER, "",
        1, "UNNAMED: .github/scripts/nested/helper.py")
py_case("the same dotted import, helper named, passes",
        "from nested.helper import run\n", HELPER,
        "      # imports .github/scripts/nested/helper.py\n",
        0, "  .github/scripts/nested/helper.py")
py_case("`from pkg import submodule` must name the submodule",
        "from nested import helper\n", HELPER, "",
        1, "UNNAMED: .github/scripts/nested/helper.py")
py_case("a template .py that does not parse is refused, not read as import-free",
        "from nested.helper import (\n", HELPER, "",
        1, "does not parse as Python")

case("npm run in ANOTHER directory needs no .github/scripts/package.json",
     command_text=command_md(),
     callers={"templates/workflows/kit.yml":
              "jobs:\n  t:\n    steps:\n"
              "      - working-directory: .github/scripts/ui-tests\n"
              "        run: npm install\n"
              "      - run: node .github/scripts/a.js\n"},
     expect_exit=0, needle="1 referenced script(s)")

case("an unreadable YAML caller is refused, not passed",
     command_text=command_md(),
     callers={"templates/workflows/bad.yml": "steps: [\n  - run: node .github/scripts/a.js\n"},
     expect_exit=1, needle="not readable YAML")

case("no callers at all is refused, never a vacuous pass",
     command_text=command_md(), callers={}, expect_exit=1,
     needle="pass vacuously")

print()
if FAIL:
    print(f"check-refresh-derivation-cases: FAIL — {len(FAIL)} of {len(PASS) + len(FAIL)} case(s) failed")
    sys.exit(1)
print(f"check-refresh-derivation-cases: OK — {len(PASS)} pinned derivation shapes read correctly.")
