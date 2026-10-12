#!/usr/bin/env python3
"""Cases for the toolkit's two PreToolUse gates: push-gate.sh and wait-gate.sh.

WHY THIS EXISTS. Neither gate had a case suite, and the audit of 2026-10-06
found three live false ALLOWS inside the shapes each gate claims to catch:
`git push origin +main`, a push hidden by an apostrophe in a double-quoted
commit message, and a backgrounded `sleep 5m` read as five seconds. Each case
below is a hook payload fed to the gate exactly as Claude Code sends it, with
the exit code the gate must return (2 = block, 0 = allow). The allow cases are
the complement: they keep a fix from being bought by blocking everything.

SCOPE. push-gate.sh is a speed bump, not a security boundary (its header and
the owner ruling of 2026-08-22, #257): the server-side ruleset is the control.
These cases pin only the shapes the gate says it catches — a push naming main
as a literal ref — not the open-ended bypass surface #257 records.

EVERY CASE RUNS TWICE: once as shipped, once with `jq` hidden from PATH, so
gate-lib.sh's sed+awk fallback must read each payload exactly as jq does. That
fallback once stopped at the first escaped quote and let a push to main through
behind a quoted commit message (audit, 2026-10-09).

Both gates source gate-lib.sh from their own directory, so every run copies
the gate under test and the library into one temp directory -- the installed
layout -- which lets each be swapped for a MUTANT independently:
PUSH_GATE_BIN / WAIT_GATE_BIN / GATE_LIB_BIN / PAGES_GATE_BIN.

PAGES-EDIT GATE (audit 2026-10-11). pages-edit-gate.sh is the PostToolUse
reminder for an edit that changes what Pages serves. Its cases are Edit
payloads naming a file inside a scratch git repository whose qa.yml carries a
chosen BUILD_PATHS shape; 2 = reminded, 0 = silent. It replaced an inline
hooks.json command that sent nothing for root-served files (I-12), and
build-input-gate.sh, whose BUILD_PATHS reader read a commented `env:` or a
block scalar as empty (M-12).

MEASURED 2026-10-12 against the pre-fix scripts (origin/main 1328c41), each
swapped in alone:
  PAGES_GATE_BIN = the old inline served-file hook + build-input-gate.sh
    -> root-served script, nested served script, root-served page, served
       SVG, commented env:, folded block scalar, and a non-input under a
       literal block scalar (read as the regex `|`, which matches anything);
  GATE_LIB_BIN = the old gate-lib.sh
    -> the heredoc, comment, `\\main` and `$'main'` push shapes and their
       complements (M-13), and, without jq, the later-"command"-key case
       (M-11); the pages cases fail too, since gate_served is new;
  GATE_LIB_BIN = the second draft (7ff7315), after a second review round
    -> the spaced single- and double-quoted heredoc delimiters, the `#` inside
       `${...}`, and the spaced-delimiter complement -- with and without jq.
    (The unbalanced-delimiter case passes against it too: it pins the
    keep-the-text direction for the new delimiter reader, not a bug fixed.)
  GATE_LIB_BIN = the third draft (cb2bfc2), whose ${...} scanner counted
  braces inside quotes
    -> the double- and single-quoted `}` cases and the kept substitution
       after a `#` -- with and without jq.
  GATE_LIB_BIN = the fourth draft (6679c79), which reparsed a kept comment
    -> the kept-comment case -- with and without jq.
  GATE_LIB_BIN = the fifth draft (671b9b0), whose ${...} scanner tried to
  find the expansion's end through quotes
    -> the ANSI-C escaped quote and the `}`-in-a-comment cases -- with and
       without jq. The substitution, backtick and command-word cases pass
       against it too; they pin the fail-closed scanner, not a bug fixed.
  PUSH_GATE_BIN = the old push-gate.sh
    -> `main>/dev/null`, `git -c x=y push`, `git -C dir push` (M-13).
  GATE_LIB_BIN = this change's own first draft (heredocs detected before the
  quote/comment/arithmetic state was known, comments keyed off the last
  output character, `$'...'` read as a plain single-quoted span), which a
  security review flagged
    -> the six "parser differential" cases: `<<'EOF'` inside quotes, inside a
       comment and inside `$((...))`; `#` after `\\ ` and after a quote span;
       `\\'` inside `$'...'` -- with and without jq.

Run: python3 .github/scripts/check-toolkit-gates-cases.py
"""
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

from cases_lib import Cases, bin_path
from cases_lib import run as run_argv

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "plugins/directives-toolkit/scripts"
PUSH = bin_path("PUSH_GATE_BIN", SCRIPTS / "push-gate.sh")
WAIT = bin_path("WAIT_GATE_BIN", SCRIPTS / "wait-gate.sh")
LIB = bin_path("GATE_LIB_BIN", SCRIPTS / "gate-lib.sh")
PAGES = bin_path("PAGES_GATE_BIN", SCRIPTS / "pages-edit-gate.sh")

BLOCK, ALLOW = 2, 0

PUSH_CASES = [
    ("a push naming main", "git push origin main", BLOCK),
    ("a force push naming +main", "git push origin +main", BLOCK),
    ("-f with +main", "git push -f origin +main", BLOCK),
    ("HEAD:main", "git push origin HEAD:main", BLOCK),
    ("refs/heads/main", "git push origin refs/heads/main", BLOCK),
    ("a quoted single-word ref", 'git push origin "main"', BLOCK),
    ("an apostrophe in a double-quoted message before and after the push",
     'git commit -m "fix the user\'s bug" && git push origin main && echo "it\'s done"', BLOCK),
    ("two apostrophes in short messages",
     'git commit -m "don\'t" && git push origin main && echo "won\'t"', BLOCK),
    ("a backslash-newline continuation", "git push origin \\\nmain", BLOCK),
    ("command substitution in backticks", "result=`git push origin main`", BLOCK),
    ("command substitution inside double quotes", 'out="$(git push origin main)"', BLOCK),
    ("a double-quoted commit message before the push",
     'git commit -m "msg" && git push origin main', BLOCK),
    ("an escaped quote outside quotes before the push",
     'echo \\" && git push origin main && echo "done"', BLOCK),
    # ...and the complement.
    ("a push to a claude/ branch", "git push -u origin claude/foo", ALLOW),
    ("a branch whose name contains main", "git push -u origin claude/main-fix", ALLOW),
    ("a branch name with + before main mid-name (git: + is force only at a refspec's start)",
     "git push origin foo+main", ALLOW),
    ("a branch name with /+main", "git push origin claude/+main", ALLOW),
    ("a push option whose value is +main", "git push -o +main origin claude/foo", ALLOW),
    ("a push option, then main as the ref", "git push -o ci.skip origin main", BLOCK),
    ("-o taking -o as its value, then main", "git push origin -o -o main", BLOCK),
    ("a commit message that says push to main", 'git commit -m "push to main later"', ALLOW),
    ("a single-quoted message, then a branch push",
     "git commit -m 'merge main into it' && git push -u origin claude/x", ALLOW),
    ("an apostrophe in the message, then a branch push",
     'git commit -m "the user\'s fix" && git push -u origin claude/x', ALLOW),
    ("echoing the words in a quoted string", 'echo "git push origin main"', ALLOW),
    ("an escaped quote, then a branch push",
     'echo \\" && git push -u origin claude/x && echo "done"', ALLOW),
    ("not a push at all", "git log main..HEAD", ALLOW),
    # -- audit 2026-10-11, M-13: accidental shapes, cheap to close -----------
    ("a quoted heredoc commit message with a stray double quote, then a push",
     "git commit -m \"$(cat <<'EOF'\nUse a 5\" screen\nEOF\n)\" && git push origin main && echo \"done now\"", BLOCK),
    ("a quoted heredoc with an apostrophe, then a push",
     "cat > m <<'EOF'\nthe user's fix\nEOF\ngit push origin main && echo 'done ok'", BLOCK),
    ("an apostrophe in a # comment, then a push",
     "git status # don't worry\ngit push origin main 2>&1 | grep -v 'remote: x'", BLOCK),
    ("a backslash-escaped ref", "git push origin \\main", BLOCK),
    ("an ANSI-C quoted ref", "git push origin $'main'", BLOCK),
    ("a ref followed by a redirection", "git push origin main>/dev/null", BLOCK),
    ("a global -c option before push", "git -c x=y push origin main", BLOCK),
    ("a global -C option before push", "git -C /tmp/repo push origin main", BLOCK),
    ("a live substitution inside a BARE heredoc body",
     "cat <<EOF\n$(git push origin main)\nEOF", BLOCK),
    ("a heredoc marker inside a message, with no terminator, then a push",
     'git commit -m "see <<EOF" && git push origin main', BLOCK),
    # ...and the complement.
    ("main only in a trailing comment", "git push origin claude/fix # main", ALLOW),
    ("push text inside a QUOTED heredoc body, then a branch push",
     "cat > m <<'EOF'\ngit push origin main\nEOF\ngit push -u origin claude/x", ALLOW),
    ("a global -c option, then a branch push", "git -c x=y push -u origin claude/x", ALLOW),
    # -- security review of the M-13 draft: parser differentials ------------
    # 1. a `<<` the draft took for a heredoc operator before knowing the quote,
    #    comment or arithmetic state, so it dropped a live line as a "body".
    ("a heredoc-looking `<<` inside quotes does not hide the next line",
     'echo "a <<\'EOF\'"\ngit push origin main\nEOF', BLOCK),
    ("a heredoc-looking `<<` inside a comment does not hide the next line",
     "true # <<'EOF'\ngit push origin main\nEOF", BLOCK),
    ("a `<<` inside $((...)) is not a heredoc operator",
     "echo $((1<<'X'))\ngit push origin main\nX", BLOCK),
    # 2. `#` mid-word: after an escaped character or a quote span bash is still
    #    inside the word, so the rest of the line is live.
    ("`#` after an escaped space is not a comment",
     "echo \\ #; git push origin main", BLOCK),
    ("`#` right after a dropped quote span is not a comment",
     'echo "a b"#; git push origin main', BLOCK),
    # 3. ANSI-C quoting: `\'` does not end a $'...' span.
    ("an escaped quote inside $'...' does not end the span",
     "echo $'it\\'s' && git push origin main && echo 'x y'", BLOCK),
    # Second review round: a quoted delimiter with a space, read as its first
    # word, ended the "body" at a later line naming that word, dropping the
    # live line before it; and a `#` after a space inside ${...} dropped the
    # rest of the line as a comment.
    ("a single-quoted heredoc delimiter with spaces is read whole",
     "cat <<'E O F'\nit's\nE O F\ngit push origin main\nE", BLOCK),
    ("a double-quoted heredoc delimiter with spaces is read whole",
     'cat <<"a b"\nit"s\na b\ngit push origin main\na', BLOCK),
    ("a `#` after a space inside ${...} is not a comment",
     "echo ${x:- #y}; git push origin main", BLOCK),
    ("an unbalanced heredoc delimiter quote drops nothing",
     "cat <<'EOF\nEOF\ngit push origin main\nEOF", BLOCK),
    # Third review round: braces inside quotes within ${...} were counted, so
    # the expansion closed early and the parser lost sync.
    ("a quoted `}` inside ${...} does not close it",
     'echo ${x:-"}"}; git push origin main; echo "done now"', BLOCK),
    ("a single-quoted `}` inside ${...} does not close it",
     "echo ${x:-'}'}; git push origin main; echo 'done now'", BLOCK),
    # Fail toward checking: text that could expand is never dropped.
    ("a substitution after a # is kept, not dropped as a comment",
     "true # $(git push origin main)", BLOCK),
    # Fourth round: a kept comment was reparsed, so its apostrophe opened a
    # quote that swallowed the next line.
    ("a kept comment is not reparsed for quotes",
     "true # ${x} don't\ngit push origin main\necho 'ok'", BLOCK),
    # Fifth round: the ${...} scanner fails closed. Only a plain expansion
    # (word characters and :-+=?%/) is skipped as a unit; any other keeps the
    # rest of the input verbatim and unparsed.
    ("an ANSI-C escaped quote inside ${...} does not end it early",
     "echo ${x:-$'\\'}'}; git push origin main; echo 'done now'", BLOCK),
    ("a `}` in a comment inside ${x:-$(...)} does not close the expansion",
     "echo ${x:-$(true # }'\n)}; git push origin main; echo 'a b'", BLOCK),
    ("a substitution with a `}` inside ${...}, then a push",
     "echo ${x:-$(echo })}; git push origin main; echo \"done now\"", BLOCK),
    ("a backtick span with a `}` inside ${...}, then a push",
     "echo ${x:-`echo }`}; git push origin main; echo \"done now\"", BLOCK),
    ("an ANSI-C span inside ${...} as the command word, then a push",
     "${x:-$'\\'}'} ; git push origin main", BLOCK),
    # ...and the complement.
    ("a spaced quoted delimiter's body is still dropped, then a branch push",
     "cat <<'E O F'\ngit push origin main\nE O F\ngit push -u origin claude/x", ALLOW),
    ("${#arr} is not a comment, and a branch push after it passes",
     "echo ${#arr[@]}; git push -u origin claude/x", ALLOW),
    ("an ANSI-C span with an escaped quote, then a branch push",
     "echo $'it\\'s' && git push -u origin claude/x && echo 'x y'", ALLOW),
    ("a real comment at a word boundary still hides its text",
     "git push -u origin claude/x; # then git push origin main", ALLOW),
]

# M-11: the no-jq reader must take tool_input's command, the FIRST "command"
# key, not a later one. jq reads .tool_input.command either way.
PUSH_EXTRA_CASES = [
    ("a later \"command\" key does not replace tool_input's (no-jq reader)",
     "git push origin main", {"tool_response": {"command": "echo ok"}}, BLOCK),
]

WAIT_CASES = [
    ("sleep 30", "sleep 30", True, BLOCK),
    ("a minutes suffix", "sleep 5m", True, BLOCK),
    ("an hours suffix, then a command", "sleep 2h; echo done", True, BLOCK),
    ("a fractional minutes value", "sleep 1.5m", True, BLOCK),
    ("arguments that sum past the threshold", "sleep 10 10", True, BLOCK),
    ("a variable duration fails closed", "sleep $DELAY", True, BLOCK),
    ("arithmetic fails closed", "sleep $((60*5))", True, BLOCK),
    ("an exponent past the threshold", "sleep 2e1", True, BLOCK),
    ("infinity", "sleep infinity", True, BLOCK),
    ("a long sleep with its output redirected", "sleep 30 >/dev/null", True, BLOCK),
    ("a long sleep, then a separator with no space", "sleep 30;echo done", True, BLOCK),
    ("a long sleep split by a backslash-newline", "sleep 10 \\\n10", True, BLOCK),
    ("a quoted literal duration", 'sleep "30"', True, BLOCK),
    ("a quoted variable duration", 'sleep "$DELAY"', True, BLOCK),
    ("a quoted command substitution with spaces", 'sleep "$(printf %s 30)"', True, BLOCK),
    ("the end-of-options marker before a long duration", "sleep -- 30", True, BLOCK),
    ("a brace-expanded first operand (bash: sleep 8 8)", "sleep {8,8}", True, BLOCK),
    ("an unrecognised first operand after --", "sleep -- {8,8}", True, BLOCK),
    ("a hexadecimal float past the threshold", "sleep 0x1p4", True, BLOCK),
    ("a hexadecimal float after --", "sleep -- 0x1p4", True, BLOCK),
    ("a hexadecimal fraction with an exponent", "sleep 0x.8p5", True, BLOCK),
    ("a hex number whose last digit is d (0x10d = 269 s)", "sleep 0x10d", True, BLOCK),
    ("a days suffix after a hex exponent", "sleep 0x1p0d", True, BLOCK),
    # ...and the complement.
    ("a short pause", "sleep 2", True, ALLOW),
    ("a fraction of a second", "sleep 0.5", True, ALLOW),
    ("a leading-dot fraction", "sleep .5", True, ALLOW),
    ("an exponent under the threshold (GNU float syntax, Codex #396)", "sleep 1e-1", True, ALLOW),
    ("a leading plus sign", "sleep +.5", True, ALLOW),
    ("a short sleep with its output redirected", "sleep 2 >/dev/null", True, ALLOW),
    ("a short sleep with stderr redirected", "sleep 2 2>&1", True, ALLOW),
    ("a short sleep, then a command on the next line", "sleep 2\necho done", True, ALLOW),
    ("a short sleep with a trailing comment", "sleep 2 # short warm-up", True, ALLOW),
    ("the end-of-options marker before a short duration", "sleep -- 2", True, ALLOW),
    ("a short hexadecimal float", "sleep 0xA", True, ALLOW),
    ("a hex number ending in the digit d (not days)", "sleep 0x0.001d", True, ALLOW),
    ("a short sleep, then a quoted message", 'sleep 2 && echo "all done now"', True, ALLOW),
    ("a short sleep split by a backslash-newline", "sleep 2 \\\n2", True, ALLOW),
    ("a seconds suffix under the threshold", "sleep 10s", True, ALLOW),
    ("just under the threshold", "sleep 14", True, ALLOW),
    ("a hair under the threshold (not rounded up)", "sleep 14.99999", True, ALLOW),
    ("exactly the threshold", "sleep 15.000000", True, BLOCK),
    ("a foreground sleep is not this gate's", "sleep 300", False, ALLOW),
    ("a backgrounded job that is not a sleep", "npm test", True, ALLOW),
    # ── the quote parser push-gate.sh uses, shared since 2026-10-08 ─────────
    # The sed passes stripped single-quoted spans BEFORE double-quoted ones, so
    # the apostrophe in a double-quoted note opened a "span" that ran to the
    # next apostrophe and swallowed the sleep: both of these exited 0.
    ("an apostrophe in a double-quoted note, then a long sleep and a quoted echo",
     ": \"it's a note\"; sleep 30; echo 'all done'", True, BLOCK),
    ("an escaped quote inside a double-quoted note, then a long sleep",
     ': "a \\" b"; sleep 30', True, BLOCK),
    # ...and the complement.
    ("an apostrophe in a double-quoted note, then a short sleep and a quoted echo",
     ": \"it's a note\"; sleep 2; echo 'all done'", True, ALLOW),
    ("an escaped quote inside a double-quoted note, then a short sleep",
     ': "a \\" b"; sleep 2', True, ALLOW),
]


def install(tmp):
    """The plugin's scripts/ layout: each gate beside the library it sources."""
    for src, name in ((PUSH, "push-gate.sh"), (WAIT, "wait-gate.sh"), (LIB, "gate-lib.sh"),
                      (PAGES, "pages-edit-gate.sh")):
        shutil.copyfile(src, Path(tmp) / name)
    return Path(tmp) / "push-gate.sh", Path(tmp) / "wait-gate.sh", Path(tmp) / "pages-edit-gate.sh"


def run(gate, command, background=None, env=None, extra=None):
    tool_input = {"command": command}
    if background is not None:
        tool_input["run_in_background"] = background
    payload = json.dumps({"tool_name": "Bash", "tool_input": tool_input, **(extra or {})})
    return run_argv(["bash", gate], input=payload.encode(), cwd=ROOT, env=env)


# -- pages-edit-gate.sh ------------------------------------------------------
REMIND, SILENT = 2, 0
QA_PLAIN = "env:\n  BUILD_PATHS: '^src/'\njobs: {}\n"
QA_EMPTY = "env:\n  BUILD_PATHS: ''\njobs: {}\n"
QA_COMMENTED_ENV = "env:   # project settings\n  BUILD_PATHS: '^src/'\njobs: {}\n"
# Folding joins lines with a space, as YAML does, so a folded pattern is one line.
QA_FOLDED = "env:\n  BUILD_PATHS: >-  # inputs\n    ^src/|^package\\.json$\n\n  OTHER: x\njobs: {}\n"
QA_LITERAL = "env:\n  BUILD_PATHS: |\n    ^src/\n    ^package\\.json$\njobs: {}\n"
# (label, path relative to the repo root, qa.yml text or None, expected)
PAGES_CASES = [
    ("a root index.html", "index.html", None, REMIND),
    ("a root-served script (I-12)", "app.js", None, REMIND),
    ("a nested served script (I-12)", "js/main.js", None, REMIND),
    ("a root-served page that is not index.html (I-12)", "about.html", None, REMIND),
    ("a stylesheet", "styles/tokens.css", None, REMIND),
    ("an HTML file under docs/", "docs/site/x.html", None, REMIND),
    ("a served SVG", "img/logo.svg", None, REMIND),
    # ...and what Pages never serves to users.
    ("a CI script under .github/", ".github/scripts/check.js", None, SILENT),
    ("a template under templates/", "templates/x/index.html", None, SILENT),
    ("a dependency under node_modules/", "node_modules/x/index.js", None, SILENT),
    ("a markdown file", "README.md", None, SILENT),
    ("a build input with no build (BUILD_PATHS empty)", "src/app.ts", QA_EMPTY, SILENT),
    # BUILD_PATHS shapes (M-12).
    ("a build input under a plain BUILD_PATHS", "src/app.ts", QA_PLAIN, REMIND),
    ("a non-input under a plain BUILD_PATHS", "notes/todo.txt", QA_PLAIN, SILENT),
    ("a build input under a commented env: line", "src/app.ts", QA_COMMENTED_ENV, REMIND),
    ("a build input under a folded block scalar", "package.json", QA_FOLDED, REMIND),
    ("a build input under a literal block scalar", "package.json", QA_LITERAL, REMIND),
    ("a non-input under a literal block scalar", "notes/todo.txt", QA_LITERAL, SILENT),
]


def pages_case(c, gate, label, rel, qa, expected, env, tag):
    with tempfile.TemporaryDirectory() as repo:
        run_argv(["git", "init", "-q", repo])
        if qa is not None:
            (Path(repo) / ".github/workflows").mkdir(parents=True)
            (Path(repo) / ".github/workflows/qa.yml").write_text(qa)
        f = Path(repo) / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text("x\n")
        payload = json.dumps({"tool_name": "Edit", "tool_input": {"file_path": str(f)},
                              "tool_response": {"filePath": str(f)}})
        code, out = run_argv(["bash", gate], input=payload.encode(), cwd=repo, env=env)
    verdict = "reminds" if expected == REMIND else "stays silent"
    if code != expected:
        c.fail(f"pages-edit-gate{tag}: {label}", f"expected exit {expected}; got {code}\n      {rel}\n      {out}")
    else:
        c.ok(f"pages-edit-gate{tag} {verdict} on {label}")


def no_jq_env(tmp):
    """PATH holding a link to every executable on the real PATH except jq."""
    bindir = Path(tmp) / "nojq-bin"
    bindir.mkdir()
    for d in os.environ.get("PATH", "").split(os.pathsep):
        if not os.path.isdir(d):
            continue
        for name in os.listdir(d):
            src = os.path.join(d, name)
            if name == "jq" or (bindir / name).exists() or not os.access(src, os.X_OK) or os.path.isdir(src):
                continue
            (bindir / name).symlink_to(src)
    return {**os.environ, "PATH": str(bindir)}


def main():
    for path in (PUSH, WAIT, LIB, PAGES):
        if not path.is_file():
            print(f"CANNOT RUN: {path} does not exist")
            return 1
    c = Cases("check-toolkit-gates-cases")
    with tempfile.TemporaryDirectory() as tmp:
        gates = install(tmp)
        check(c, *gates)
        env = no_jq_env(tmp)
        if run_argv(["bash", "-c", "command -v jq"], env=env)[0] == 0:
            c.fail("no-jq pass", "jq is still on the PATH built without it")
        else:
            check(c, *gates, env=env, tag=" (no jq)")
        # A gate that cannot load its library must ALLOW, quietly: fail-open is
        # the design (each gate's header), and an error exit here would surface
        # on every Bash call. Both payloads below are ones the gates block.
        os.remove(Path(tmp) / "gate-lib.sh")
        for gate, command, background in ((PUSH, "git push origin main", None),
                                           (WAIT, "sleep 30", True)):
            code, out = run(Path(tmp) / gate.name, command, background)
            label = f"{gate.name} with no gate-lib.sh beside it fails open, silently"
            if code != ALLOW or out:
                c.fail(label, f"expected a silent allow (exit 0); got {code}\n      {out}")
            else:
                c.ok(label)
    n = len(PUSH_CASES) + len(PUSH_EXTRA_CASES) + len(WAIT_CASES) + len(PAGES_CASES) + 6
    return c.finish(f"{2 * n + 2} gate payloads read correctly, with and without jq.")


def check(c, push, wait, pages, env=None, tag=""):
    for name, gate, cases in (("push-gate" + tag, push, [(l, cmd, None, e) for l, cmd, e in PUSH_CASES]),
                              ("wait-gate" + tag, wait, WAIT_CASES)):
        for label, command, background, expected in cases:
            code, out = run(gate, command, background, env)
            verdict = "block" if expected == BLOCK else "allow"
            if code != expected:
                c.fail(f"{name}: {label}", f"expected {verdict} (exit {expected}); got {code}\n      {command!r}\n      {out}")
            else:
                c.ok(f"{name} {verdict}s {label}")
    for label, command, extra, expected in PUSH_EXTRA_CASES:
        code, out = run(push, command, None, env, extra)
        if code != expected:
            c.fail(f"push-gate{tag}: {label}", f"expected exit {expected}; got {code}\n      {out}")
        else:
            c.ok(f"push-gate{tag}: {label}")
    for label, rel, qa, expected in PAGES_CASES:
        pages_case(c, pages, label, rel, qa, expected, env, tag)
    bare_dir_cases(c, push, env, tag)


def bare_dir_cases(c, push, env, tag):
    """A bare push reads the branch of the repository it acts on: `git -C <path>`
    selects it, so the invoking checkout's branch must not decide (Codex, #439).
    Two scratch repositories, one on main and one on a feature branch, each
    invoking the gate against the other."""
    with tempfile.TemporaryDirectory() as tmp:
        repos = {}
        for name, branch in (("onmain", "main"), ("onfeature", "claude/x")):
            d = Path(tmp) / name
            d.mkdir()
            run_argv(["git", "init", "-q", "-b", branch, str(d)])
            repos[name] = d
        cases = [
            ("from a main checkout, -C into a feature checkout", "onmain", f"git -C {repos['onfeature']} push", ALLOW),
            ("from a feature checkout, -C into a main checkout", "onfeature", f"git -C {repos['onmain']} push", BLOCK),
            ("from a feature checkout, a relative -C into a main checkout", "onfeature", "git -C ../onmain push", BLOCK),
            ("from a main checkout, a plain bare push", "onmain", "git push", BLOCK),
            ("from a feature checkout, a plain bare push", "onfeature", "git push", ALLOW),
            ("a quoted -C path the gate cannot read", "onfeature", 'git -C "../onmain" push', BLOCK),
        ]
        for label, cwd, command, expected in cases:
            payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})
            code, out = run_argv(["bash", str(push)], input=payload.encode(), cwd=repos[cwd], env=env)
            verdict = "block" if expected == BLOCK else "allow"
            if code != expected:
                c.fail(f"push-gate{tag}: bare push, {label}", f"expected {verdict} (exit {expected}); got {code}\n      {command!r}\n      {out}")
            else:
                c.ok(f"push-gate{tag} {verdict}s a bare push, {label}")


if __name__ == "__main__":
    sys.exit(main())
