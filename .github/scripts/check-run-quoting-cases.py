#!/usr/bin/env python3
r"""Guard the run-quoting guard: pinned fixtures, each refusal with its complement.

WHY THIS EXISTS. `check-run-quoting.py` passes against this repo today and would
pass just as quietly if its scanner stopped tracking quotes at all -- nothing
here currently carries the defect, so a guard that looked at nothing prints the
same OK. That is the fail-open family (#323).

It runs the REAL guard against fixture files rather than re-implementing its
rule, so it needs the same shfmt the guard does ($SHFMT or PATH). Every refusal has an accepting complement, so none can be bought by
over-tightening, and the first case is the #264 block itself, as it shipped:
two apostrophes in a jq comment that keep the quotes balanced, which is why
`bash -n` never saw it.

Re-prove discrimination with a mutant:

    CHECK_RUN_QUOTING_BIN=/tmp/mutant.py python3 .github/scripts/check-run-quoting-cases.py
"""

import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GUARD = os.environ.get(
    "CHECK_RUN_QUOTING_BIN",
    os.path.join(ROOT, ".github", "scripts", "check-run-quoting.py"),
)


def workflow(run, shell=None, defaults=None, runs_on="ubuntu-latest"):
    """A one-step workflow whose step runs `run` (a literal block)."""
    body = "\n".join("          " + line if line else "" for line in run.split("\n"))
    head = "on: workflow_dispatch\n"
    if defaults:
        head += f"defaults:\n  run:\n    shell: {defaults}\n"
    step_shell = f"        shell: {shell}\n" if shell else ""
    return (head + f"jobs:\n  j:\n    runs-on: {runs_on}\n    steps:\n"
            "      - name: s\n" + step_shell + "        run: |\n" + body + "\n")


# The #264 defect, verbatim from ci-monitor.yml before #405 (trimmed to the
# program's opening lines), and #405's rewording of the same comment.
BUG_264 = """runs=$(echo "$runs" | jq '[
  # Grouped by REPO too. Without it, two forks using the same branch
  # name share a group, and fork B's run can suppress fork A's cancelled
  # one — silently dropping a real failure.
  ( group_by([.workflow_id, .head_branch, .repo]) | .[] ) as $g
  | $g[]
]')"""
FIX_405 = BUG_264.replace(
    "fork B's run can suppress fork A's cancelled",
    "a run from fork B can suppress a cancelled run from fork A")

COMPOSITE = """name: c
runs:
  using: composite
  steps:
    - shell: bash
      run: |
        RUN
"""

# (name, files {relname: text}, expected exit, text the output must contain
#  [, "root" to run the guard's own discovery under the fixture dir instead of
#  passing the files, or "noparser" to point SHFMT at nothing])
CASES = [
    ("the #264 jq comment — two apostrophes, balanced, FAIL on the right line",
     {"w.yml": workflow(BUG_264)}, 1, "w.yml:10: an apostrophe CLOSES"),
    ("the same block as #405 reworded it — OK",
     {"w.yml": workflow(FIX_405)}, 0, "1 bash run block(s)"),
    ("an unquoted contraction OPENS a quote — FAIL",
     {"w.yml": workflow("echo don't panic'")}, 1, "OPENS"),
    ("the contraction inside double quotes is a literal — OK",
     {"w.yml": workflow("echo \"don't panic\"")}, 0, "OK"),
    ("a lone apostrophe leaves the block open — FAIL",
     {"w.yml": workflow("echo runs' output")}, 1, "w.yml:8: does not parse as bash"),
    ("an unclosed double quote — FAIL",
     {"w.yml": workflow('echo "half')}, 1, "does not parse as bash"),
    ("a shell comment is not shell — OK",
     {"w.yml": workflow("# don't run this twice\necho ok")}, 0, "OK"),
    ("a # inside a word is not a comment — FAIL",
     {"w.yml": workflow("echo a#b don't'")}, 1, "OPENS"),
    ("a heredoc body is literal text — OK",
     {"w.yml": workflow("cat <<'EOF'\nit's fine here\nEOF\necho done")}, 0, "OK"),
    ("the heredoc ends at its delimiter — an apostrophe after it is shell, FAIL",
     {"w.yml": workflow("cat <<-EOF\nit's fine\nEOF\necho it's'")}, 1, "OPENS"),
    ("a here-string is not a heredoc — FAIL",
     {"w.yml": workflow("cat <<< 'x'\necho it's'")}, 1, "OPENS"),
    ("quotes inside a ${{ }} expression never reach the shell — OK",
     {"w.yml": workflow("echo \"${{ inputs.x || 'it' }}\"\necho ${{ github.event_name == 'push' }}")},
     0, "OK"),
    ("$'...' with an escaped quote — OK",
     {"w.yml": workflow("printf $'it\\'s\\n'")}, 0, "OK"),
    ("single quotes inside $( ) inside double quotes — OK",
     {"w.yml": workflow("x=\"$(jq -r '.a' f.json)\"\necho \"$x\"")}, 0, "OK"),
    ("an apostrophe inside $( ) inside double quotes is shell — FAIL",
     {"w.yml": workflow("x=\"$(echo it's')\"")}, 1, "OPENS"),
    ("a step with shell: python is not shell — skipped",
     {"w.yml": workflow("print(\"x\")\nprint('don''t')", shell="python")
      + "      - run: echo ok\n"}, 0, "1 non-bash skipped"),
    ("a workflow defaulting to pwsh is skipped — only the bash step counts",
     {"w.yml": workflow("Write-Host it's", defaults="pwsh")
      + "      - shell: bash\n        run: echo ok\n"}, 0, "1 bash run block(s) in 1 file(s) (1 non-bash skipped)"),
    ("a job defaulting to pwsh is skipped too",
     {"w.yml": workflow("Write-Host it's").replace(
         "    runs-on: ubuntu-latest\n",
         "    runs-on: ubuntu-latest\n    defaults:\n      run:\n        shell: pwsh\n")
      + "      - shell: bash\n        run: echo ok\n"}, 0, "(1 non-bash skipped)"),
    ("a step's own shell: bash overrides a pwsh default — FAIL",
     {"w.yml": workflow("echo it's'", shell="bash", defaults="pwsh")}, 1, "OPENS"),
    ("shell: bash -euo pipefail {0} is bash — FAIL",
     {"w.yml": workflow("echo it's'", shell="bash -euo pipefail {0}")}, 1, "OPENS"),
    ("a composite action's steps are scanned — FAIL",
     {"action.yml": COMPOSITE.replace("RUN", "echo it's'")}, 1, "action.yml:7: an apostrophe OPENS"),
    ("the composite reworded — OK",
     {"action.yml": COMPOSITE.replace("RUN", "echo it is")}, 0, "OK"),
    ("no run block at all is a did-not-look — CANNOT CHECK",
     {"w.yml": "on: push\njobs:\n  j:\n    runs-on: x\n    steps:\n      - uses: actions/checkout@v4\n"},
     2, "no bash `run:` block"),
    ("no shell parser — CANNOT CHECK, never a pass",
     {"w.yml": workflow("echo ok")}, 2, "no usable shfmt", "noparser"),
    ("unparseable YAML — CANNOT CHECK",
     {"w.yml": "jobs: [\n"}, 2, "could not be read as YAML"),
    ("one clean file and one bad — the bad one still FAILS",
     {"a.yml": workflow("echo ok"), "b.yml": workflow("echo it's'")}, 1, "b.yml:"),

    # Codex, #408 — an UNQUOTED heredoc body still runs $( ) and backticks.
    ("$( ) in an unquoted heredoc body is shell — FAIL on the body line",
     {"w.yml": workflow("cat <<EOF\nhead\n$(printf '%s' 'fork B's run, fork A's x')\nEOF")}, 1,
     "w.yml:10: an apostrophe CLOSES"),
    ("the same body under a QUOTED delimiter is literal — OK",
     {"w.yml": workflow("cat <<'EOF'\nhead\n$(printf '%s' 'fork B's run, fork A's x')\nEOF")}, 0, "OK"),
    ("a backslash-quoted delimiter is literal too — OK",
     {"w.yml": workflow("cat <<\\EOF\n$(echo it's')\nEOF")}, 0, "OK"),
    ("a backtick in an unquoted heredoc body is shell — FAIL",
     {"w.yml": workflow("cat <<EOF\n`echo it's'`\nEOF")}, 1, "OPENS"),
    ("plain text and quotes in an unquoted body stay literal — OK",
     {"w.yml": workflow("cat <<EOF\nit's \"fine\" and $(date +%s) too\nEOF")}, 0, "OK"),

    # Codex, #408 — the delimiter is the WHOLE word, compared exactly.
    ("<<END-JSON ends at END-JSON — the line after it is shell, FAIL",
     {"w.yml": workflow("cat <<END-JSON\nit's literal\nEND-JSON\necho it's'")}, 1,
     "w.yml:11: an apostrophe OPENS"),
    ("<<END-JSON with nothing after it — its body was skipped, OK",
     {"w.yml": workflow("cat <<END-JSON\nit's literal\nEND-JSON\necho ok")}, 0, "OK"),
    ("a quoted punctuation delimiter — the body is literal, OK",
     {"w.yml": workflow("cat <<'END.TXT'\ndon't\nEND.TXT\necho ok")}, 0, "OK"),
    ("<<- strips leading TABS from the terminator — the line after is shell, FAIL",
     {"w.yml": workflow("cat <<-EOF\n\tit's literal\n\tEOF\necho it's'")}, 1, "OPENS"),
    ("plain << does NOT strip tabs: the heredoc never ends — FAIL, does not parse",
     {"w.yml": workflow("cat <<EOF\nit's literal\n\tEOF\necho ok")}, 1, "unclosed here-document"),

    # Codex, #408 round 2 — the three shapes that retired the hand lexer.
    ("<<$'EOF' is a quoted delimiter named EOF — the line after it is shell, FAIL",
     {"w.yml": workflow("cat <<$'EOF'\nit's literal\nEOF\necho it's'")}, 1,
     "w.yml:11: an apostrophe OPENS"),
    ("<<$'EOF' with a clean line after — its body was skipped, OK",
     {"w.yml": workflow("cat <<$'EOF'\nit's literal\nEOF\necho ok")}, 0, "OK"),
    ("$( ) nested in $(( )) is shell — FAIL",
     {"w.yml": workflow("x=$(( $(echo 'fork B's run, fork A's x' | wc -c) + 1 ))")}, 1,
     "an apostrophe CLOSES"),
    ("shell: /bin/bash -e {0} is bash — FAIL",
     {"w.yml": workflow("echo 'fork B's run, fork A's x'", shell="/bin/bash -e {0}")}, 1,
     "an apostrophe CLOSES"),
    ("shell: /usr/bin/python3 {0} is not — skipped",
     {"w.yml": workflow("print('it''s')", shell="/usr/bin/python3 {0}")
      + "      - run: echo ok\n"}, 0, "(1 non-bash skipped)"),

    # Codex, #408 round 3 — a shell the file cannot settle is UNKNOWN, never a guess.
    ("a matrix-selected default shell — CANNOT CHECK, not skipped",
     {"w.yml": workflow("echo it's'", defaults="${{ matrix.shell }}")}, 2,
     "w.yml:11: cannot tell which shell"),
    ("a step shell from an expression — CANNOT CHECK",
     {"w.yml": workflow("echo ok", shell="${{ inputs.shell }}")}, 2, "cannot tell which shell"),
    ("an unknown block does not hide a real finding elsewhere — FAIL wins",
     {"a.yml": workflow("echo ok", shell="${{ inputs.shell }}"),
      "b.yml": workflow("echo it's'")}, 1, "b.yml:8: an apostrophe OPENS"),
    ("a Windows job with no shell runs PowerShell — skipped, not parsed as bash",
     {"w.yml": workflow("Write-Host (Get-Date) it's", runs_on="windows-latest")
      + "      - shell: bash\n        run: echo ok\n"}, 0, "(1 non-bash skipped)"),
    ("a Windows job that names bash IS bash — FAIL",
     {"w.yml": workflow("echo it's'", shell="bash", runs_on="windows-latest")}, 1, "OPENS"),
    ("runs-on as a label list naming Windows — skipped",
     {"w.yml": workflow("Write-Host (Get-Date)", runs_on="[self-hosted, Windows]")
      + "      - shell: bash\n        run: echo ok\n"}, 0, "(1 non-bash skipped)"),
    ("runs-on as a runner group with Windows labels — skipped",
     {"w.yml": workflow("Write-Host (Get-Date)", runs_on="{group: g, labels: [windows-2022]}")
      + "      - shell: bash\n        run: echo ok\n"}, 0, "(1 non-bash skipped)"),
    ("runs-on from an expression with no shell — CANNOT CHECK",
     {"w.yml": workflow("echo ok", runs_on="${{ matrix.os }}")}, 2, "cannot tell which shell"),
    ("runs-on from an expression WITH shell: bash — scanned, FAIL",
     {"w.yml": workflow("echo it's'", shell="bash", runs_on="${{ matrix.os }}")}, 1, "OPENS"),
    ("a composite step with no shell — CANNOT CHECK",
     {"action.yml": COMPOSITE.replace("    - shell: bash\n      run: |", "    - run: |")
      .replace("RUN", "echo ok")}, 2, "cannot tell which shell"),

    # `<<` inside arithmetic is a shift, not a heredoc.
    ("$((1<<2)) is a shift — the next line is still scanned, FAIL",
     {"w.yml": workflow("x=$((1<<2))\necho it's'")}, 1, "OPENS"),
    ("(( y = 1 << 3 )) is a shift too — FAIL",
     {"w.yml": workflow("(( y = 1 << 3 ))\necho it's'")}, 1, "OPENS"),

    # Codex, #408 — the DEFAULT scan finds .yaml as well as .yml.
    ("default scan: a .yaml workflow is found — FAIL",
     {".github/workflows/w.yaml": workflow("echo it's'"),
      ".github/workflows/ok.yml": workflow("echo ok")}, 1, "w.yaml:", "root"),
    ("default scan: an action.yaml composite is found — FAIL",
     {"templates/actions/x/action.yaml": COMPOSITE.replace("RUN", "echo it's'"),
      ".github/workflows/ok.yml": workflow("echo ok")}, 1, "action.yaml:", "root"),
    ("default scan: both extensions, both clean — OK, two files",
     {".github/workflows/a.yaml": workflow("echo ok"),
      "templates/workflows/b.yml": workflow("echo ok")}, 0, "in 2 file(s)", "root"),
]


def main():
    failures = 0
    for name, files, want_code, want_text, *how in CASES:
        with tempfile.TemporaryDirectory() as d:
            paths = []
            for rel, text in files.items():
                p = os.path.join(d, rel)
                os.makedirs(os.path.dirname(p), exist_ok=True)
                with open(p, "w", encoding="utf-8") as f:
                    f.write(text)
                paths.append(p)
            # "root": no file arguments, so the guard's own discovery runs.
            args = ["--root", d] if how == ["root"] else paths
            env = dict(os.environ)
            if how == ["noparser"]:
                env["SHFMT"] = os.path.join(d, "no-such-shfmt")
            r = subprocess.run([sys.executable, GUARD, *args],
                               capture_output=True, text=True, env=env)
            out = r.stdout + r.stderr
            if r.returncode == want_code and want_text in out:
                print(f"OK:   {name} (exit {r.returncode})")
            else:
                failures += 1
                print(f"FAIL: {name}")
                print(f"  wanted exit {want_code} with {want_text!r}; got exit {r.returncode}:")
                for line in out.splitlines()[:8]:
                    print(f"    {line}")
    if failures:
        print(f"check-run-quoting-cases: FAIL — {failures} of {len(CASES)} case(s)")
        return 1
    print(f"check-run-quoting-cases: OK — {len(CASES)} pinned fixtures read correctly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
