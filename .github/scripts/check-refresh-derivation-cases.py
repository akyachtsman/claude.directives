#!/usr/bin/env python3
r"""Guard check-refresh-derivation.py — the guard on /refresh-repo's derivation.

WHY THIS EXISTS. Of check-refresh-derivation.py's checks, TWO ARE NEVER
EXERCISED BY THIS REPO. Every shipped caller ends in a newline, so the
concatenation check has nothing to bite on; every shipped caller is matched by
the current pattern, so the per-caller check never has a miss to report. The
guard says so on its own success line -- "concatenation: NOT EXERCISED" -- but a
check that only ever runs against inputs it passes is an assertion, not a test.
It could be deleted, or silently broken, and CI would not notice.

So each case here builds a synthetic repo in a temp directory: a
derive-scripts.sh carrying chosen stages, a refresh-repo.md and refresh-stamp.sh
that run it (or, for the one-copy cases, do not), plus caller YAML of a chosen
shape, and runs the REAL guard against it as a subprocess. The guard resolves COMMAND and
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
    B  the guard stops treating the derivation's stderr as fatal
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

The one-copy check (4), the contract check (5) and the needs-named check (6)
are pinned the same way, each refusal beside its accepting complement: an
inline copy of the derivation in either caller, or a caller that stops running
derive-scripts.sh, is refused (4); a derivation widened or narrowed in a way
the shipped callers cannot show is refused against the probe contract (5); and
a caller whose comment stops naming a file its script `require`s, or the
package.json its `npm install` reads, is refused while the same caller naming
them passes (6). MEASURED 2026-10-08 via CHECK_REFRESH_DERIVATION_BIN: with
check 5's comparison disabled, exactly the two contract refusals fail; with
check 6's, exactly the two "reworded comment" refusals. Check 4 replaced a
two-copy comparison in batch C (R1), when the derivation moved into one file.

/new-repo joined check 4 in the 2026-10-11 audit (I-1): it pointed at
refresh-repo.md's block, whose ${CLAUDE_PLUGIN_ROOT} is substituted only when
/refresh-repo itself loads. MEASURED 2026-10-12 against the pre-fix guard
(origin/main 1328c41) via CHECK_REFRESH_DERIVATION_BIN: the seven new-repo
cases fail (pointer-only, prose-only, inline copy, missing file, non-plugin-root
path, undelimited loop, indented fence) plus the one-copy success needle.
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

import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from cases_lib import Cases, bin_path, run as run_cmd

# Points the suite at a MUTATED copy of the guard, so "these cases discriminate"
# is re-provable rather than a claim made once in a commit message. Same
# mechanism as CHECK_CLAIMS_BIN (#344).
GUARD = bin_path("CHECK_REFRESH_DERIVATION_BIN",
                 Path(__file__).resolve().parent / "check-refresh-derivation.py")

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
STRIP = r"s/[.]+$//"
KEEP = object()


def derive_sh(token=SLASHED, ext=EXT_SHIPPED, sed=True):
    """A derive-scripts.sh with the chosen stages: the token grep, the
    trailing-period sed when `sed`, then the `ext` filter -- or none when ext
    is None. Same exit contract as the shipped file."""
    pipe = f"grep -oE '{token}'"
    if sed:
        pipe += f" | sed -E '{STRIP}'"
    if ext is not None:
        pipe += f" | grep -E '{ext}'"
    return f"#!/usr/bin/env bash\n{pipe}\nrc=$?\n[ $rc -le 1 ] || exit 2\nexit 0\n"


CALL = 'derived=$(bash "${CLAUDE_PLUGIN_ROOT}/scripts/derive-scripts.sh" <"$buf")'


def command_md(delimited=True, calls=True, inline=False, commented=False, prose=False,
               call=None, indent=""):
    """A refresh-repo.md whose install block runs derive-scripts.sh over $buf --
    unless `calls` is False. When it does not, `commented` leaves the call behind
    as a comment in the block and `prose` quotes it outside any fence. When
    `inline`, the block also carries its own copy of the token grep."""
    call = call or CALL
    run = call if calls else ("# " + CALL + "\nderived=$(cat \"$buf\")" if commented
                              else 'derived=$(cat "$buf")')
    block = (
        "```bash\n"
        "for c in $callers; do\n"
        '  curl -fsSL "$raw/$c" >>"$buf"\n'
        + (DELIM + "\n" if delimited else "")
        + "done\n"
        + run + "\n"
        + (f"refs=$(grep -oE '{SLASHED}' \"$buf\" | sort -u)\n" if inline else "")
        + "```\n"
    )
    return (("The install runs `" + CALL + "`.\n\n" if prose else "")
            + "".join(indent + ln if ln.strip() else ln for ln in block.splitlines(True)))


def stamp_sh(calls=True, inline=False, commented=False):
    """A refresh-stamp.sh whose scan() runs derive-scripts.sh -- unless `calls`
    is False, when `commented` leaves the call behind as a comment -- and, when
    `inline`, carries its own copy of the token grep."""
    call = '    d=$(printf \'%s\\n\' "$1" | bash "$derive")\n'
    body = call if calls else ("  #" + call[2:] + "    d=\n" if commented else "    d=\n")
    if inline:
        body += f"    d=\"$d $(printf '%s\\n' \"$1\" | grep -oE '{SLASHED}')\"\n"
    return ("#!/usr/bin/env bash\n"
            'derive="$(dirname "${BASH_SOURCE[0]}")/derive-scripts.sh"\n'
            "scan() {\n" + body + "}\n")


def build(tmp, command_text, callers, stamp_text=KEEP, derive_text=KEEP, new_repo_text=KEEP):
    """A synthetic repo. command_text/stamp_text/derive_text None means the file
    is absent; KEEP means the well-formed default."""
    root = Path(tmp)
    files = {
        "plugins/directives-toolkit/commands/refresh-repo.md": command_text,
        # /new-repo carries its own block, indented inside a numbered step.
        "plugins/directives-toolkit/commands/new-repo.md":
            command_md(indent="   ") if new_repo_text is KEEP else new_repo_text,
        "plugins/directives-toolkit/scripts/refresh-stamp.sh":
            stamp_sh() if stamp_text is KEEP else stamp_text,
        "plugins/directives-toolkit/scripts/derive-scripts.sh":
            derive_sh() if derive_text is KEEP else derive_text,
    }
    for rel, body in {**files, **callers}.items():
        if body is None:
            continue
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body, encoding="utf-8")
    return root


def run(root):
    return run_cmd([sys.executable, GUARD], cwd=root)


CASES = Cases("check-refresh-derivation-cases")


def case(name, *, callers, expect_exit, needle, command_text=KEEP, stamp_text=KEEP,
         derive_text=KEEP, new_repo_text=KEEP):
    if command_text is KEEP:
        command_text = command_md()
    with TemporaryDirectory() as tmp:
        root = build(tmp, command_text, callers, stamp_text, derive_text, new_repo_text)
        rc, out = run(root)
    # A traceback is never a catch, whatever the exit code and output say: a
    # crash can exit 1 with the needle already printed.
    if "Traceback (most recent call last)" in out:
        CASES.fail(name, f"the guard CRASHED — a traceback is not a catch, so this proves nothing.\n      {out}")
    else:
        CASES.expect(name, rc, out, expect_exit, needle)


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
     callers=GOOD, expect_exit=0, needle="referenced script(s)")

case("the old command-prefixed form is refused",
     derive_text=derive_sh(token=PREFIXED), callers=GOOD, expect_exit=1,
     needle="MISSED: .github/scripts/b.py")

case("a miss in one caller is NOT masked by a match in another",
     derive_text=derive_sh(token=PREFIXED), callers=MASKING, expect_exit=1,
     needle="referenced by templates/actions/x/action.yml")

case("an unterminated extension filter is refused (.json)",
     derive_text=derive_sh(ext=EXT_LOOSE),
     callers={**GOOD, "templates/workflows/two.yml":
              "steps:\n  - run: cat .github/scripts/package-lock.json\n"},
     expect_exit=1, needle="OFF-CONTRACT: .github/scripts/package-lock.json")

case("a Python-only construct grep cannot honour is refused",
     derive_text=derive_sh(ext=EXT_PY_ONLY), callers=GOOD, expect_exit=1,
     needle="not usable by the engine that RUNS it")

case("an UNDELIMITED loop that loses a script is refused",
     command_text=command_md(delimited=False), callers=RAGGED, expect_exit=1,
     needle="LOST: .github/scripts/a.js")

case("…and the delimiter fixes exactly that case",
     command_text=command_md(delimited=True), callers=RAGGED, expect_exit=0,
     needle="lack a trailing newline")

case("a nested script is found, not truncated to its directory",
     callers=NESTED, expect_exit=0, needle=".github/scripts/nested/a.py")

case("a SLASH-FREE pattern cannot reach a nested script and is refused",
     derive_text=derive_sh(token=SLASHFREE), callers=NESTED, expect_exit=1,
     needle="MISSED: .github/scripts/nested/a.py")

case("a bare directory reference is neither missing nor off-contract",
     callers=DIRREF, expect_exit=0, needle="referenced script(s)")

case("a ragged caller whose tail is not a path must NOT false-alarm",
     command_text=command_md(delimited=False), callers=RAGGED_SAFE, expect_exit=0,
     needle="lack a trailing newline")

case("callers that all end in a newline are reported as NOT EXERCISED",
     callers=GOOD, expect_exit=0, needle="NOT EXERCISED")

case("a missing command file is refused, not skipped",
     command_text=None, callers=GOOD, expect_exit=1, needle="refresh-repo.md not found")

case("a missing derive-scripts.sh is refused, not skipped",
     derive_text=None, callers=GOOD, expect_exit=1, needle="derive-scripts.sh not found")

case("a missing refresh-stamp.sh is refused, not skipped",
     stamp_text=None, callers=GOOD, expect_exit=1, needle="refresh-stamp.sh not found")

case("a derivation with NO extension filter is refused against the contract",
     derive_text=derive_sh(ext=None), callers=GOOD, expect_exit=1,
     needle="only the derivation gives: .github/scripts/package-lock.json")

# #398: exactly .github/scripts/package.json joins the contract.
PKG = {"templates/workflows/cron.yml":
       "steps:\n  - run: npm install  # reads .github/scripts/package.json\n"
       "  - run: node .github/scripts/notify-task.js\n"}
KIT_PKG = {"templates/workflows/q.yml":
           "steps:\n  - run: node .github/scripts/a.js\n"
           "  # kit: .github/scripts/ui-tests/package.json\n"
           "  # lock: .github/scripts/package-lock.json\n"}

case("the shipped filter derives .github/scripts/package.json",
     callers=PKG, expect_exit=0, needle="  .github/scripts/package.json")

case("a .js/.py-only filter MISSES package.json, which the contract now includes",
     derive_text=derive_sh(ext=EXT), callers=PKG, expect_exit=1,
     needle="MISSED: .github/scripts/package.json")

case("an UNANCHORED package.json takes the kit's ui-tests/package.json — refused",
     derive_text=derive_sh(ext=EXT_PKG_UNANCHORED), callers=KIT_PKG, expect_exit=1,
     needle="OFF-CONTRACT: .github/scripts/ui-tests/package.json")

case("the shipped filter leaves the kit's package.json and the lockfile out",
     callers=KIT_PKG, expect_exit=0, needle="1 referenced script(s)")

case("a script named at the end of a sentence is derived",
     callers={"directives/test.md": "Run it with .github/scripts/browser-ladder.js.\n"},
     expect_exit=0, needle="  .github/scripts/browser-ladder.js")

case("a derivation without the trailing-period stage is refused against the contract",
     derive_text=derive_sh(sed=False), callers=PKG, expect_exit=1,
     needle="only the contract admits: .github/scripts/e.js")

# Check 4 -- ONE copy. Batch C (R1) moved the derivation into derive-scripts.sh;
# before it, the command and the Phase 3 script each carried a copy and this
# suite compared them stage by stage. Now a copy anywhere else is refused.
case("every caller running derive-scripts.sh passes the one-copy check",
     callers=PKG, expect_exit=0, needle="all run derive-scripts.sh")

case("an INLINE copy of the derivation in refresh-repo.md is refused",
     command_text=command_md(inline=True), callers=PKG, expect_exit=1,
     needle="refresh-repo.md carries an INLINE copy")

case("an INLINE copy of the derivation in refresh-stamp.sh is refused",
     stamp_text=stamp_sh(inline=True), callers=PKG, expect_exit=1,
     needle="refresh-stamp.sh carries an INLINE copy")

case("a command that does not run derive-scripts.sh over $buf is refused",
     command_text=command_md(calls=False), callers=PKG, expect_exit=1,
     needle="does not run derive-scripts.sh over the fetched buffer")

case("a refresh-stamp.sh that does not run derive-scripts.sh is refused",
     stamp_text=stamp_sh(calls=False), callers=PKG, expect_exit=1,
     needle="refresh-stamp.sh does not run derive-scripts.sh")

# Codex, #427: a call left behind as a comment, or quoted in prose, is not a call.
case("a COMMENTED-OUT call in the command's block is refused",
     command_text=command_md(calls=False, commented=True), callers=PKG, expect_exit=1,
     needle="does not run derive-scripts.sh over the fetched buffer")

case("a call quoted only in the command's PROSE is refused",
     command_text=command_md(calls=False, prose=True), callers=PKG, expect_exit=1,
     needle="does not run derive-scripts.sh over the fetched buffer")

case("a COMMENTED-OUT `bash \"$derive\"` in refresh-stamp.sh is refused",
     stamp_text=stamp_sh(calls=False, commented=True), callers=PKG, expect_exit=1,
     needle="refresh-stamp.sh does not run derive-scripts.sh")

# Audit 2026-10-11, I-1: /new-repo pointed at refresh-repo.md's block, whose
# ${CLAUDE_PLUGIN_ROOT} is substituted only when /refresh-repo itself loads, so
# the bootstrap ran `bash /scripts/derive-scripts.sh` and stopped. It now
# carries its own block, held to the same checks.
case("a new-repo.md that only POINTS at refresh-repo's block is refused",
     new_repo_text=("Run the pipeline `/refresh-repo` uses, `refresh-repo.md` → "
                    "*Deriving the referenced-script set*.\n"),
     callers=PKG, expect_exit=1,
     needle="new-repo.md does not run derive-scripts.sh over the fetched buffer")

case("a new-repo.md that quotes the call only in PROSE is refused",
     new_repo_text=command_md(calls=False, prose=True), callers=PKG, expect_exit=1,
     needle="new-repo.md does not run derive-scripts.sh over the fetched buffer")

case("an INLINE copy of the derivation in new-repo.md is refused",
     new_repo_text=command_md(inline=True), callers=PKG, expect_exit=1,
     needle="new-repo.md carries an INLINE copy")

case("a missing new-repo.md is refused, not skipped",
     new_repo_text=None, callers=GOOD, expect_exit=1, needle="new-repo.md not found")

case("a call by a path that is not the plugin root is refused",
     new_repo_text=command_md(call='derived=$(bash scripts/derive-scripts.sh <"$buf")'),
     callers=PKG, expect_exit=1,
     needle="new-repo.md does not run derive-scripts.sh over the fetched buffer")

case("an UNDELIMITED new-repo loop that loses a script is refused",
     new_repo_text=command_md(delimited=False), callers=RAGGED, expect_exit=1,
     needle="delimiter in plugins/directives-toolkit/commands/new-repo.md")

case("an INDENTED fence (inside a numbered step) still counts as the block",
     new_repo_text=command_md(indent="   "), callers=PKG, expect_exit=0,
     needle="all run derive-scripts.sh")

# Check 5 -- a derivation the shipped callers cannot show is wrong. The callers
# here give no ui-tests/package.json and no package.json, so only the probes can
# refuse these.
case("a derivation WIDENED where no caller shows it is refused against the contract",
     derive_text=derive_sh(ext=EXT_PKG_UNANCHORED), callers=PKG, expect_exit=1,
     needle="only the derivation gives: .github/scripts/ui-tests/package.json")

case("a derivation NARROWED where no caller shows it is refused against the contract",
     derive_text=derive_sh(ext=EXT), callers=GOOD, expect_exit=1,
     needle="only the contract admits: .github/scripts/package.json")

case("the shipped derivation passes the probe check",
     callers=GOOD, expect_exit=0, needle="exactly the 6-path contract set")

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
     callers=CRON_NAMED, expect_exit=0,
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
    case(name,
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
    case(name,
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
     callers={}, expect_exit=1,
     needle="pass vacuously")

sys.exit(CASES.finish(f"{CASES.passed} pinned derivation shapes read correctly."))
