#!/usr/bin/env python3
r"""Guard the action-sibling guard: pinned trees, each exit and each diagnostic.

WHY THIS EXISTS. `check-action-siblings.py` passes against this repo today and
would pass just as quietly if its rule stopped working -- everything in
`templates/actions/` is tracked, so a guard that checked nothing at all prints
the same OK. That is the fail-open family (#323): a pass and a did-not-look are
the same output.

It runs the REAL guard against fixture repositories rather than re-implementing
its rule; a cases file holding a copy of the rule tests the copy.

The fixtures are real `git init` repositories because the guard asks git what is
STAGED, not the filesystem what exists -- and one case turns on the difference
between a staged file and a `git add -N` placeholder, which no directory of
loose files can express.

The parsing cases that used to live here went with the derivation they pinned.
Four rounds of shell-syntax findings are recorded in the guard's header; the rule
no longer reads shell, so there is no syntax left to pin.

Re-prove discrimination with a mutant:

    CHECK_ACTION_SIBLINGS_BIN=/tmp/mutant.py python3 .github/scripts/check-action-siblings-cases.py
"""

import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GUARD = os.environ.get(
    "CHECK_ACTION_SIBLINGS_BIN",
    os.path.join(ROOT, ".github", "scripts", "check-action-siblings.py"),
)

COMPOSITE = """\
name: 'ui-suite'
runs:
  using: composite
  steps:
    - name: Validate report-path
      shell: bash
      run: python3 "$GITHUB_ACTION_PATH/validate-report-path.py"
"""


def build(tmp, *, files=None, unstaged=None, intent_to_add=None, empty_actions=False,
          symlinks=None, unstaged_symlinks=None, conflicted=False,
          raw_files=None, unreadable=None):
    """A fixture repo.

    `files`             written and staged
    `unstaged`          written after the add, so present on disk and absent from git
    `intent_to_add`     written, then registered with `git add -N` only
    `symlinks`          {link: target} created BEFORE the add, so git stores them
    `unstaged_symlinks` {link: target} created after, so git does not
    `conflicted`        left mid-merge, so `git write-tree` cannot run
    `raw_files`         {bytes path: bytes} — a name Python cannot hold as str
    `unreadable`        directory paths chmod'd 000 after everything else
    """
    root = tempfile.mkdtemp(dir=tmp)

    def write(rel, text):
        path = os.path.join(root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)

    def link(rel, target):
        path = os.path.join(root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        os.symlink(target, path)

    def write_raw(rel_bytes, data):
        path = os.path.join(os.fsencode(root), rel_bytes)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(data)

    subprocess.run(["git", "init", "-q"], cwd=root, check=True)
    if not empty_actions:
        write("templates/actions/ui-suite/action.yml", COMPOSITE)
    for rel, text in (files or {}).items():
        write(rel, text)
    for rel, target in (symlinks or {}).items():
        link(rel, target)
    for rel_bytes, data in (raw_files or {}).items():
        write_raw(rel_bytes, data)
    subprocess.run(["git", "add", "-A"], cwd=root, check=True)

    for rel, text in (unstaged or {}).items():
        write(rel, text)
    for rel, target in (unstaged_symlinks or {}).items():
        link(rel, target)

    # Present on disk, and in `git ls-files` -- but staged against the EMPTY
    # blob, so its content is not in the tree that gets committed.
    for rel, text in (intent_to_add or {}).items():
        write(rel, text)
        subprocess.run(["git", "add", "-N", rel], cwd=root, check=True)

    # An index `git write-tree` cannot turn into a tree. The guard's question is
    # "what would this index commit", and mid-merge there is no answer -- so it
    # must refuse rather than report a pass it did not compute.
    #
    # THE UNMERGED ENTRIES ARE WRITTEN DIRECTLY, not produced by running a merge
    # and hoping it conflicts. The first version did that and passed on git
    # 2.43.0 while the merge resolved cleanly on the runner's 2.55.0, so the
    # case reported a pass against a repository that was never conflicted --
    # a fixture that stopped constructing the state it tests, silently. A state
    # a case depends on is asserted below, not inferred from an operation's
    # side effect.
    if conflicted:
        def out(*args):
            return subprocess.run(["git", *args], cwd=root, check=True,
                                  capture_output=True, text=True).stdout

        entry = conflicted if isinstance(conflicted, str) else "templates/actions/ui-suite/action.yml"
        stages = []
        for stage, text in enumerate(("base\n", "ours\n", "theirs\n"), start=1):
            blob = subprocess.run(["git", "hash-object", "-w", "--stdin"], cwd=root,
                                  check=True, capture_output=True, text=True,
                                  input=text).stdout.strip()
            stages.append(f"100644 {blob} {stage}\t{entry}")
        # Written as BYTES: one case conflicts a path whose name is not valid
        # UTF-8, and that is the whole point of it.
        subprocess.run(["git", "update-index", "--index-info"], cwd=root, check=True,
                       capture_output=True,
                       input=os.fsencode("\n".join(stages) + "\n"))
        if not out("ls-files", "-u").strip():
            raise AssertionError("fixture did not produce an unmerged index")

    # Made unreadable LAST, so everything above could still be written. The whole
    # fixture is opened up first because the unreadable case runs the guard as an
    # unprivileged user (see `run`), which must still be able to drive git.
    if unreadable:
        # The temp PARENT is 0700, and an unprivileged process cannot traverse
        # it -- without this the guard sees an empty tree and refuses for the
        # wrong reason, which is a green case pinning nothing.
        os.chmod(os.path.dirname(root), 0o777)
        for path, _, files in os.walk(root):
            os.chmod(path, 0o777)
            for name in files:
                try:
                    os.chmod(os.path.join(path, name), 0o666)
                except OSError:
                    pass
        for rel in unreadable:
            full = os.path.join(root, rel)
            os.chmod(full, 0o000)
            # ASSERT THE STATE. A case that quietly stops constructing what it
            # tests is worse than no case; the merge fixture above became one.
            if os.stat(full).st_mode & 0o777:
                raise AssertionError(f"{rel} is still readable")
    return root


def run(root, unprivileged=False, env_overrides=None):
    """Drive the real guard.

    `unprivileged` matters for exactly one case. Permission bits do not apply to
    root, so a 000 directory is readable here and unreadable on the runner --
    the case would pin the defect in CI and pass vacuously in the local gate,
    which is the environment-dependent fixture this file already got wrong once.
    Dropping to `nobody` when we are root makes both identical; a non-root caller
    is already subject to the bits it set, so it runs directly.
    """
    argv = [sys.executable, GUARD, root]
    env = dict(os.environ)
    env.update(env_overrides or {})
    if unprivileged and os.geteuid() == 0:
        # ⚠️ COPY THE GUARD SOMEWHERE THE DROPPED IDENTITY CAN READ IT.
        # CHECK_ACTION_SIBLINGS_BIN points at a mutant in a 0700 temp directory,
        # which `nobody` cannot open -- so this case reddened under EVERY mutant,
        # always with "Permission denied" and never because of the mutation. A
        # case that always fails tells you as little as one that always passes,
        # and it silently corrupted the discrimination numbers.
        readable = os.path.join(os.path.dirname(root), "guard-under-test.py")
        shutil.copyfile(GUARD, readable)
        os.chmod(readable, 0o755)
        argv = [sys.executable, readable, root]
        # git refuses a repository owned by someone else without this.
        env.update(GIT_CONFIG_COUNT="1", GIT_CONFIG_KEY_0="safe.directory",
                   GIT_CONFIG_VALUE_0="*", HOME="/tmp")
        argv = ["setpriv", "--reuid=65534", "--regid=65534", "--clear-groups"] + argv
    # DECODED LENIENTLY, for the same reason the guard writes leniently: a
    # non-UTF-8 filename reaches this harness through the guard's own output, and
    # `text=True` made THIS FILE raise UnicodeDecodeError while testing the fix
    # for exactly that. The defect was one level up from where it was found.
    proc = subprocess.run(argv, capture_output=True, env=env)
    decode = lambda b: b.decode("utf-8", "surrogateescape")
    return proc.returncode, decode(proc.stdout) + decode(proc.stderr)


def main():
    failures = []
    with tempfile.TemporaryDirectory() as tmp:
        cases = [
            # ── the shipped shape ────────────────────────────────────────────
            ("a composite whose files are all tracked — accepted",
             dict(files={"templates/actions/ui-suite/validate-report-path.py": "ok\n"}),
             0, "every one in the tree"),

            # ── the defect this exists for (#325, #353) ─────────────────────
            # Present, working locally, and shipping to nobody.
            ("an untracked sibling — refused",
             dict(unstaged={"templates/actions/ui-suite/validate-report-path.py": "ok\n"}),
             1, "would NOT be committed"),

            # An untracked file NOTHING references is caught too. The derivation
            # this replaced could not see it, and a half-finished change is
            # exactly how one gets left behind.
            ("an untracked file nothing references — refused",
             dict(unstaged={"templates/actions/ui-suite/scratch.py": "ok\n"}),
             1, "would NOT be committed"),

            # Every action is in scope, not only the one with a reference.
            ("an untracked file in another action — refused",
             dict(unstaged={"templates/actions/secret-scan/helper.sh": "ok\n"}),
             1, "secret-scan/helper.sh"),

            # ── intent-to-add is in ls-files and still does not ship ────────
            ("a `git add -N` sibling — refused",
             dict(intent_to_add={"templates/actions/ui-suite/validate-report-path.py": "ok\n"}),
             1, "would NOT be committed"),

            # ⚠️ THE ROUND-4 RULE PASSED THIS ONE. It read the staged blob and
            # called the empty blob a placeholder only when the file on disk was
            # non-empty -- and `git add -N` on a GENUINELY zero-byte file gives
            # the empty blob AND a zero-byte working tree, so both halves agreed
            # it was fine while `write-tree` omitted it (Codex, #354 round 5).
            # It is the whole reason the rule stopped inspecting the index.
            ("a `git add -N` sibling that is GENUINELY ZERO BYTES — refused",
             dict(intent_to_add={"templates/actions/ui-suite/validate-report-path.py": ""}),
             1, "would NOT be committed"),

            # The complement, so the fix above cannot be bought by refusing every
            # empty file: a zero-byte file staged for real DOES ship, and git
            # stores it against the same empty blob.
            ("a zero-byte sibling staged for real — accepted",
             dict(files={"templates/actions/ui-suite/validate-report-path.py": ""}),
             0, "every one in the tree"),

            # ── a directory symlink is a path git stores, and os.walk hides it ──
            # `os.walk` puts it in `dirnames` and does not follow it by default,
            # so it was never enumerated -- a composite could use `tools/helper.sh`
            # through the local link while the guard reported OK and downstream
            # copies got nothing (Codex, #354 round 5).
            ("an untracked symlink to a directory — refused",
             dict(files={"templates/actions/ui-suite/tools/helper.sh": "ok\n"},
                  unstaged_symlinks={"templates/actions/ui-suite/toolslink": "tools"}),
             1, "toolslink"),

            # And the complement: a TRACKED directory symlink passes. Refusing
            # every symlink would buy the case above with a false refusal, which
            # is the shape that produced eight findings on #347.
            ("a tracked symlink to a directory — accepted",
             dict(files={"templates/actions/ui-suite/tools/helper.sh": "ok\n"},
                  symlinks={"templates/actions/ui-suite/toolslink": "tools"}),
             0, "every one in the tree"),

            # A symlink to a FILE lands in `filenames`, so it was already
            # enumerated -- pinned so the walk rewrite cannot lose it.
            ("an untracked symlink to a file — refused",
             dict(files={"templates/actions/ui-suite/helper.sh": "ok\n"},
                  unstaged_symlinks={"templates/actions/ui-suite/alias.sh": "helper.sh"}),
             1, "alias.sh"),

            # ── build artefacts are not the maintainer's mistake ────────────
            ("__pycache__ beside a validator is ignored",
             dict(files={"templates/actions/ui-suite/validate-report-path.py": "ok\n"},
                  unstaged={"templates/actions/ui-suite/__pycache__/x.pyc": "junk\n"}),
             0, "every one in the tree"),

            # ── a path is bytes, not text ──────────────────────────────────
            # Git and every Linux filesystem accept a filename holding a byte
            # that is not valid UTF-8. Reading `ls-tree` with `text=True`
            # decoded it strictly and the guard raised UnicodeDecodeError
            # instead of producing a verdict (Codex, #354 round 6).
            ("a tracked sibling whose name is not valid UTF-8 — accepted, not a crash",
             dict(raw_files={b"templates/actions/ui-suite/bad-\xff.sh": b"ok\n"}),
             0, "every one in the tree"),

            ("...and an UNTRACKED one with such a name is still refused",
             dict(files={"templates/actions/ui-suite/validate-report-path.py": "ok\n"},
                  unstaged={"templates/actions/ui-suite/plain.sh": "ok\n"}),
             1, "would NOT be committed"),

            # ── an unreadable directory is not an empty one ─────────────────
            # `os.walk` swallows every error unless given `onerror`, so the
            # subtree vanished from the listing and the guard reported that
            # every file ships. Measured at exit 0 with an untracked helper
            # inside it (Codex, #354 round 6). This case runs the guard as
            # `nobody` when we are root — see `run`.
            ("a directory that cannot be listed — CANNOT CHECK, never a pass",
             dict(files={"templates/actions/ui-suite/action.yml": COMPOSITE},
                  unstaged={"templates/actions/ui-suite/private/helper.sh": "ok\n"},
                  unreadable=["templates/actions/ui-suite/private"],
                  unreadable_case=True),
             1, "could not be listed completely"),

            # ── #354 round 7: what a path IS decides before what it is CALLED ──
            # The IGNORED_DIRS filter ran BEFORE the symlink test, so an
            # untracked `__pycache__ -> tools` link was discarded as generated
            # directory contents and the guard exited 0 — measured. The name
            # excuses generated CONTENTS; a symlink is one path git tracks, and
            # its name says nothing about that.
            ("an untracked symlink NAMED like a cache directory — refused",
             dict(files={"templates/actions/ui-suite/tools/helper.sh": "ok\n"},
                  unstaged_symlinks={"templates/actions/ui-suite/__pycache__": "tools"}),
             1, "__pycache__"),

            # The complement, so the fix is not bought by dropping the filter: a
            # REAL __pycache__ directory is still ignored. (Pinned again below in
            # its original case; kept adjacent here because the two rules are one
            # ordering decision.)
            ("...while a real __pycache__ DIRECTORY is still ignored",
             dict(files={"templates/actions/ui-suite/validate-report-path.py": "ok\n"},
                  unstaged={"templates/actions/ui-suite/__pycache__/x.pyc": "junk\n"}),
             0, "every one in the tree"),

            # ── a strict ASCII stdout must not eat the verdict ──────────────
            # Setting `errors` without `encoding` left the encoding at whatever
            # the locale picked; under LC_ALL=C that is ASCII, which cannot
            # encode the em dash in this guard's own success line. Measured: the
            # PASS path raised UnicodeEncodeError before returning a verdict.
            ("the verdict survives a C-locale, ASCII stdout",
             dict(files={"templates/actions/ui-suite/validate-report-path.py": "ok\n"},
                  env={"LC_ALL": "C", "LANG": "C", "PYTHONUTF8": "0",
                       "PYTHONCOERCECLOCALE": "0", "PYTHONIOENCODING": ""}),
             0, "every one in the tree"),

            ("...and so does a refusal naming a non-UTF-8 path",
             dict(raw_files={b"templates/actions/ui-suite/keep-\xff.sh": b"ok\n"},
                  unstaged={"templates/actions/ui-suite/plain.sh": "ok\n"},
                  env={"LC_ALL": "C", "LANG": "C", "PYTHONUTF8": "0",
                       "PYTHONCOERCECLOCALE": "0", "PYTHONIOENCODING": ""}),
             1, "would NOT be committed"),

            # ── the CANNOT CHECK message must survive its own subject ───────
            # `write-tree` kept text=True after `ls-tree` was converted, and git
            # echoes the offending filename in stderr — so a conflicted index
            # holding a non-UTF-8 name raised while producing the message
            # written for exactly that situation.
            ("an unbuildable index whose conflicted path is not UTF-8 — CANNOT CHECK",
             dict(conflicted="templates/actions/ui-suite/bad-\udcff.yml"),
             1, "CANNOT CHECK"),

            # ── a guard that cannot look must not print a pass (#323) ──────
            # `write-tree` is the whole answer, so an index it cannot build a
            # tree from leaves the question unanswered. Nothing else here
            # exercises that branch, and a silent 0 there is the fail-open
            # family inside the fix for it.
            ("an index `git write-tree` cannot build — CANNOT CHECK, never a pass",
             dict(conflicted=True), 1, "CANNOT CHECK"),

            # ── nothing to look at is not a pass ───────────────────────────
            ("no files under templates/actions — refused, never a vacuous pass",
             dict(empty_actions=True), 1, "holds no files"),

            # ── the verdict states its own limits ──────────────────────────
            # Two readings this green must not invite: that the carriers install
            # these files, and that a referenced-but-absent file would be caught.
            ("the passing verdict says it reads no run bodies",
             dict(files={"templates/actions/ui-suite/validate-report-path.py": "ok\n"}),
             0, "reads no `run:` bodies"),
            ("...and that a named-but-missing file is out of scope",
             dict(files={"templates/actions/ui-suite/validate-report-path.py": "ok\n"}),
             0, "names a file"),

            # ── the trade, pinned so it is visible rather than assumed ──────
            # The derivation caught a composite naming a file that does not
            # exist; the rule replacing it does not. If this case ever starts
            # FAILING, someone has added parsing back -- read the header first.
            ("a composite naming a file that does not exist — ACCEPTED (the trade)",
             dict(files={"templates/actions/ui-suite/action.yml":
                         COMPOSITE.replace("validate-report-path.py", "never-created.py")}),
             0, "every one in the tree"),
        ]

        for label, kwargs, expected, needle in cases:
            unprivileged = bool(kwargs.pop("unreadable_case", False))
            env_overrides = kwargs.pop("env", None)
            root = build(tmp, **kwargs)
            code, out = run(root, unprivileged=unprivileged, env_overrides=env_overrides)
            if code != expected:
                failures.append(
                    f"{label}\n      expected exit {expected}; got {code}.\n      {out.strip()}"
                )
            elif needle not in out:
                failures.append(
                    f"{label}\n      exited {code} as expected, but for the wrong stated reason."
                    f"\n      expected the output to contain: {needle!r}\n      {out.strip()}"
                )
            else:
                print(f"OK:   {label} (exit {code})")

    # And it must still pass against the REAL repo. A suite that only ever sees
    # fixtures can be perfectly green while the shipped tree is broken.
    code, out = run(ROOT)
    if code != 0:
        failures.append(f"the live repo passes\n      expected exit 0; got {code}.\n      {out.strip()}")
    else:
        print("OK:   the live repo passes (exit 0)")

    if failures:
        print("\ncheck-action-siblings-cases: FAILED")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    print(f"\ncheck-action-siblings-cases: OK — {len(cases)} pinned trees read correctly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
