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

Both gates source gate-lib.sh from their own directory, so every run copies
the gate under test and the library into one temp directory -- the installed
layout -- which lets each be swapped for a MUTANT independently:
PUSH_GATE_BIN / WAIT_GATE_BIN / GATE_LIB_BIN.

Run: python3 .github/scripts/check-toolkit-gates-cases.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "plugins/directives-toolkit/scripts"
PUSH = Path(os.environ.get("PUSH_GATE_BIN", SCRIPTS / "push-gate.sh")).resolve()
WAIT = Path(os.environ.get("WAIT_GATE_BIN", SCRIPTS / "wait-gate.sh")).resolve()
LIB = Path(os.environ.get("GATE_LIB_BIN", SCRIPTS / "gate-lib.sh")).resolve()

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
    for src, name in ((PUSH, "push-gate.sh"), (WAIT, "wait-gate.sh"), (LIB, "gate-lib.sh")):
        shutil.copyfile(src, Path(tmp) / name)
    return Path(tmp) / "push-gate.sh", Path(tmp) / "wait-gate.sh"


def run(gate, command, background=None):
    tool_input = {"command": command}
    if background is not None:
        tool_input["run_in_background"] = background
    payload = json.dumps({"tool_name": "Bash", "tool_input": tool_input})
    r = subprocess.run(["bash", str(gate)], input=payload, capture_output=True,
                       text=True, cwd=ROOT)
    return r.returncode, f"{r.stdout}{r.stderr}".strip()


def main():
    for path in (PUSH, WAIT, LIB):
        if not path.is_file():
            print(f"CANNOT RUN: {path} does not exist")
            return 1
    with tempfile.TemporaryDirectory() as tmp:
        failures = check(*install(tmp))
        # A gate that cannot load its library must ALLOW, quietly: fail-open is
        # the design (each gate's header), and an error exit here would surface
        # on every Bash call. Both payloads below are ones the gates block.
        os.remove(Path(tmp) / "gate-lib.sh")
        for gate, command, background in ((PUSH, "git push origin main", None),
                                           (WAIT, "sleep 30", True)):
            code, out = run(Path(tmp) / gate.name, command, background)
            if code != ALLOW or out:
                failures.append(f"{gate.name}: with no gate-lib.sh beside it\n      expected a silent allow (exit 0); got {code}\n      {out}")
            else:
                print(f"OK:   {gate.name} with no gate-lib.sh beside it fails open, silently")
    if failures:
        print("\ncheck-toolkit-gates-cases: FAILED\n")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"\ncheck-toolkit-gates-cases: OK — {len(PUSH_CASES) + len(WAIT_CASES) + 2} gate payloads read correctly.")
    return 0


def check(push, wait):
    failures = []
    for label, command, expected in PUSH_CASES:
        code, out = run(push, command)
        verdict = "block" if expected == BLOCK else "allow"
        if code != expected:
            failures.append(f"push-gate: {label}\n      expected {verdict} (exit {expected}); got {code}\n      {command!r}\n      {out}")
        else:
            print(f"OK:   push-gate {verdict}s {label}")
    for label, command, background, expected in WAIT_CASES:
        code, out = run(wait, command, background)
        verdict = "block" if expected == BLOCK else "allow"
        if code != expected:
            failures.append(f"wait-gate: {label}\n      expected {verdict} (exit {expected}); got {code}\n      {command!r}\n      {out}")
        else:
            print(f"OK:   wait-gate {verdict}s {label}")
    return failures


if __name__ == "__main__":
    sys.exit(main())
