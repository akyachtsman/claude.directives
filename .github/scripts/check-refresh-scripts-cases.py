#!/usr/bin/env python3
r"""Cases for the /refresh-repo mechanism scripts, run against a fixture upstream.

WHY THIS EXISTS. The refresh scripts (plugins/directives-toolkit/scripts/
refresh-*.sh, kit-defects.sh) had no case suite: check-refresh-derivation.py
pins the derivation they share, and nothing ran the scripts themselves. Two
downstream pilots of /refresh-repo (claude.prop and claude.trading,
2026-10-13, stamped at 100d6b4) then found, among others:
  - silent success: refresh-broken-refs.sh and refresh-hook-install.sh printed
    nothing when all was well, indistinguishable from not running;
  - refresh-stamp.sh deleted Phase 2's verdict on entry, so a REFUSED stamp
    burned it and the re-run, after a refresh_kept reason was recorded, said
    "NOT classified"; and it exited 0 on a refusal;
  - Phase 3 demanded a package-lock.json wherever package.json was installed,
    which the qa workflows install for its "type": "commonjs" alone;
  - Phase 1.5 compared against `main` while Phases 2-3 pinned the classified
    SHA, said only DRIFT (never whether the copy was merely old), and could not
    see a lost executable bit;
  - declining a kit subdirectory took one refresh_kept entry per file.
Each case below runs a REAL script against a fixture: a local upstream repo
(three commits: S, the stamp; M; H, the head) served over file://, and a
scratch downstream project built from it. Every script reads its upstream from
refresh-lib.sh's REFRESH_SRC, which REFRESH_UPSTREAM overrides; that override
exists for this suite.

A case asserts BOTH the exit code and a needle (cases_lib), and a case about a
side effect (a file written, a marker kept) checks the file itself.

MUTANTS. Each script is swapped by its own variable, copied into a temp
directory beside the real siblings it sources or runs (the installed layout):
REFRESH_STAMP_BIN, REFRESH_DELTA_BIN, REFRESH_DRIFT_BIN, REFRESH_MERGE_BIN,
REFRESH_CALLERS_BIN, REFRESH_BROKEN_REFS_BIN, REFRESH_HOOK_INSTALL_BIN,
KIT_DEFECTS_BIN, REFRESH_VARS_BIN, REFRESH_LIB_BIN.

MEASURED 2026-10-13 against the pre-fix scripts (100d6b4, with only the
hard-coded upstream URL replaced by ${REFRESH_UPSTREAM:-...} so they could be
pointed at the fixture), each swapped in alone:
  REFRESH_STAMP_BIN = the old refresh-stamp.sh -> all 14 stamp cases: the
    exit status, the kept verdict and the re-run without refresh-delta.sh,
    the base binding, the lockfile only with the cron kit (and, with the
    verdict burned by the first refusal, its "WITH its lockfile" re-run), and
    every kit-directory decline case;
  REFRESH_DELTA_BIN = the old refresh-delta.sh -> the three delta cases, and
    the 11 stamp cases that need its base marker (a verdict without one is
    refused, which is the base binding working);
  REFRESH_BROKEN_REFS_BIN = the old refresh-broken-refs.sh -> the three
    broken-refs cases (no OK line; no non-zero exit for BROKEN).
The old refresh-drift.sh and refresh-hook-install.sh read raw.githubusercontent
.com and cannot be pointed at a fixture at all, and the other scripts are new,
so those cases were measured against the new scripts with one feature
reverted at a time:
  drift's pin forced to ls-remote main -> the three pin cases;
  STALE/CUSTOM collapsed to DRIFT -> STALE, CUSTOM and the summary;
  drift's mode comparison removed -> MODE and the summary;
  the hook's OK lines removed -> the three hook-state cases;
  merge --write ignoring conflicts -> both conflict cases;
  the callers' composite closure removed -> the caller-set case;
  kit-defects running an empty Check block -> the no-Check-block case.

NEW REPOSITORY VARIABLES AND SECRETS (owner ruling, 2026-10-13: after the
pilots merged, QA — UI Tests (live) went red on an unset APP_URL). Before
refresh-vars.sh no step looked, so REFRESH_VARS_BIN = an empty file (the
pre-change state) -> all 10 vars cases. Then the new script with one feature
reverted at a time, MEASURED 2026-10-13:
  the stamp baseline removed (every read new) -> the read-present-at-the-stamp,
    no-OK-line-with-new-reads and all-present-at-the-stamp cases;
  the GITHUB_TOKEN exclusion removed -> the GITHUB_TOKEN case (+ the count);
  `secrets.` reads dropped, or the bracket form dropped -> the secrets case
    (+ the count);
  the OK line removed -> both OK-line cases;
  the installed-only filter removed (every template at the pin) -> the
    not-installed case (+ the count);
  a template absent at the stamp skipped -> the newly-installed case;
  the Phase 2 marker requirement removed -> the after-the-stamp case.
Codex on #450 then found the comment stripping and the template baseline
wrong (a `#` inside a quoted string or opening a block-scalar line hid a read;
a CUSTOM copy that had dropped a read still counted as reading it). Comments
are no longer stripped -- both sides are read alike, so only a NEW mention
lists -- and the baseline is the project's own files at the stamp commit. The
script before those fixes (ff2e2b4) fails the block-scalar, new-comment,
custom-dropped and count cases; the one before that (bb3e993), the quoted-#
case; the one before that (f97e46a), the installed-now case. Round four: a
name the project only commented on, made live upstream, was hidden by the
raw-text baseline; each side is now read whole AND with comments set aside,
and 2d73710 fails the comment-goes-live case. Round five: inert text naming a
variable (`name: … vars.X …`) counted as a baseline read; only what GitHub
evaluates (`${{ }}` spans, a bare `if:`) is read now, and 921f9e7 fails the
inert-text case. Checked against every shipped template: no read is lost.
Round six: a folded `if: >` went unread and a first install listed a
commented-out read. The whole/comment-free union gave way to one light YAML
reader (block scalars are data, `#`-led lines outside them are comments);
bada2fe fails the folded-if and commented-out cases.

Run: python3 .github/scripts/check-refresh-scripts-cases.py
"""
# Before any import: running the gate must leave no __pycache__/ beside the
# local modules it imports (cases_lib.py and/or templates/scripts/gh_yaml.py).
import sys
sys.dont_write_bytecode = True

import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from cases_lib import Cases, bin_path
from cases_lib import run as run_argv

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "plugins/directives-toolkit/scripts"
BINS = {
    "refresh-stamp.sh": "REFRESH_STAMP_BIN",
    "refresh-delta.sh": "REFRESH_DELTA_BIN",
    "refresh-drift.sh": "REFRESH_DRIFT_BIN",
    "refresh-merge.sh": "REFRESH_MERGE_BIN",
    "refresh-callers.sh": "REFRESH_CALLERS_BIN",
    "refresh-broken-refs.sh": "REFRESH_BROKEN_REFS_BIN",
    "refresh-hook-install.sh": "REFRESH_HOOK_INSTALL_BIN",
    "kit-defects.sh": "KIT_DEFECTS_BIN",
    "refresh-vars.sh": "REFRESH_VARS_BIN",
    "refresh-lib.sh": "REFRESH_LIB_BIN",
}

CASES = Cases("check-refresh-scripts-cases")
WORK = Path(tempfile.mkdtemp(prefix="refresh-cases-"))

# Hermetic git: no user or system config, fixed identity.
GITCFG = WORK / "gitconfig"
GITCFG.write_text("", encoding="utf-8")
ENV = {**os.environ,
       "GIT_CONFIG_GLOBAL": str(GITCFG), "GIT_CONFIG_NOSYSTEM": "1",
       "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.invalid",
       "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.invalid"}
for k in ("REFRESH_PIN", "REFRESH_UPSTREAM", "CLAUDE_PLUGIN_ROOT"):
    ENV.pop(k, None)


def git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, env=ENV, check=True,
                          capture_output=True, text=True).stdout.strip()


# ---- the scripts under test, in the installed layout -----------------------
BIN = WORK / "bin"
shutil.copytree(SCRIPTS, BIN)
for name, var in BINS.items():
    src = bin_path(var, SCRIPTS / name)
    if src != (SCRIPTS / name).resolve():
        shutil.copyfile(src, BIN / name)

# ---- the fixture upstream ---------------------------------------------------
QA_S = """name: QA
# top-1
# top-2
# top-3
jobs:
  q:
    steps:
      # CommonJS: it runs only because .github/scripts/package.json says so
      - run: node .github/scripts/check-contrast.js
      - uses: ./.github/actions/ui-suite
# bottom-1
# bottom-2
# bottom-3
"""
QA_H = QA_S.replace("# bottom-3\n", "# bottom-3 (upstream fix)\n")
ACTION = """runs:
  using: composite
  steps:
    - run: python3 "$GITHUB_ACTION_PATH/validate-report-path.py"
      shell: bash
    # CommonJS: .github/scripts/package.json
    - run: node "$GITHUB_WORKSPACE/.github/scripts/check-ui-viewports.js"
      shell: bash
"""
CRON = """on:
  schedule: [{cron: '0 0 * * *'}]
jobs:
  run:
    steps:
      - working-directory: .github/scripts
        run: npm install
      # needs .github/scripts/notify-email.js and .github/scripts/package.json
      - run: node "$GITHUB_WORKSPACE/.github/scripts/notify-task.js"
"""
KIT_DEFECTS = """# UI-test kit defects

## KD-1 — a fixture defect

- **Revision:** 1
- **Check:**
  ```bash
  if grep -q FIXED tests/app.spec.js; then echo CLEAR; else echo AFFECTED; fi
  ```
- **Minimal fix:** add FIXED.

## KD-2 — an entry whose check went missing

- **Revision:** 1
- **Bug:** no check block here.
"""
# The live workflow reads repository variables and secrets; the release adds
# vars.APP_URL and secrets.NEW_SECRET (the pilots' unset APP_URL, 2026-10-13),
# and also a GITHUB_TOKEN read, a name only a COMMENT mentions, a read after a
# quoted `#` and a `#`-led block-scalar line -- each NEW at the head.
LIVE_S = """name: QA Live
jobs:
  live:
    steps:
      - uses: ./.github/actions/ui-suite
        with:
          test-auth-credential: ${{ secrets.TEST_AUTH_CREDENTIAL }}
          ready: ${{ vars.TEST_AUTH_READY_SELECTOR }}
"""
LIVE_H = LIVE_S + """          # set vars.COMMENTED_ONLY if you like
          app-url: ${{ github.event.inputs.app_url || vars.APP_URL }}
          extra: ${{ secrets['New_Secret'] }}
          token: ${{ secrets.GITHUB_TOKEN }}
      - run: echo "prefix # ${{ secrets.HASH_QUOTED }}"
      - uses: ./.github/actions/notify
        if: vars.GATE == 'on'
        with:
          payload: |
            #${{ secrets.BLOCK_HASH }}
      - name: gated
        if: >
          vars.DEPLOY_ENABLED == 'true'
        run: echo gated
      - name: optional db
        env:
          # DB_URL: ${{ vars.OPTIONAL_DB }}
          X: "1"
"""
SETTINGS = json.dumps({"permissions": {"allow": ["Bash(ls:*)"]},
                       "hooks": {"SessionStart": [{"hooks": [
                           {"type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/session-start.sh"}]}]}},
                      indent=2) + "\n"
S_FILES = {
    "templates/workflows/qa.yml": QA_S,
    "templates/workflows/ci-monitor.yml": "name: CI Monitor\n# v1\n",
    "templates/workflows/cron-notify.yml": CRON,
    "templates/workflows/qa-live.yml": LIVE_S,
    "templates/actions/ui-suite/action.yml": ACTION,
    "templates/actions/ui-suite/validate-report-path.py": "print('ok')\n",
    "templates/claude-hooks/session-start.sh": "#!/usr/bin/env bash\necho v1\n",
    "templates/scripts/check-contrast.js": "require('fs');\n",
    "templates/scripts/check-ui-viewports.js": "require('fs');\n",
    "templates/scripts/package.json": '{"type": "commonjs"}\n',
    "templates/scripts/notify-task.js": "require('./notify-email.js');\n",
    "templates/scripts/notify-email.js": "module.exports = {};\n",
    "templates/ui-tests/tests/app.spec.js": "// spec\n",
    "templates/ui-tests/tests/lib/fixtures.js": "// fixtures v1\n",
    "templates/ui-tests/tests/lib/auth.js": "// auth\n",
    "templates/ui-tests/playwright.config.js": "// config\n",
    "templates/ui-tests/package.json": "{}\n",
    "templates/ui-tests/package-lock.json": "{}\n",
    "templates/claude-settings.json": SETTINGS,
    "docs/standards/kit-defects.md": KIT_DEFECTS,
    "docs/guide.md": "a guide\n",
    **{f"directives/{d}.md": f"# {d}\n" for d in ("global", "git", "design", "test", "data")},
}
H_FILES = {
    **S_FILES,
    "templates/workflows/qa.yml": QA_H,
    "templates/workflows/ci-monitor.yml": "name: CI Monitor\n# v2\n",
    "templates/workflows/qa-live.yml": LIVE_H,
    "templates/workflows/new.yml": "name: New\n# read: ${{ vars.FROM_NEW }}\nenv:\n  X: ${{ vars.FROM_NEW }}\n",
    "templates/claude-hooks/session-start.sh": "#!/usr/bin/env bash\necho v2\n",
    "templates/ui-tests/tests/lib/fixtures.js": "// fixtures v2\n",
}
EXEC = {"templates/claude-hooks/session-start.sh"}

UP = WORK / "upstream"
UP.mkdir()
git(UP, "init", "-q", "-b", "main")
git(UP, "config", "uploadpack.allowAnySHA1InWant", "true")
git(UP, "config", "uploadpack.allowFilter", "true")


def commit_tree(files, msg):
    for p in UP.rglob("*"):
        if p.is_file() and ".git" not in p.relative_to(UP).parts:
            p.unlink()
    for rel, text in files.items():
        dest = UP / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text, encoding="utf-8")
        dest.chmod(0o755 if rel in EXEC else 0o644)
    git(UP, "add", "-A")
    git(UP, "commit", "-q", "-m", msg)
    return git(UP, "rev-parse", "HEAD")


S = commit_tree(S_FILES, "S: the stamp")
M = commit_tree({**S_FILES, "docs/guide.md": "a guide, revised\n"}, "M: between")
H = commit_tree(H_FILES, "H: the head")
URL = f"file://{UP}"


def tree_id(rev, path):
    return git(UP, "rev-parse", f"{rev}:{path}")


def blob_id(rev, path):
    return git(UP, "rev-parse", f"{rev}:{path}")


# ---- downstream projects ----------------------------------------------------
INSTALLED_WORKFLOWS = ("qa.yml", "ci-monitor.yml")
INSTALLED_SCRIPTS = ("check-contrast.js", "check-ui-viewports.js", "package.json")


def installed(files, workflows=INSTALLED_WORKFLOWS, scripts=INSTALLED_SCRIPTS):
    """{local path: (text, executable)} for a project that took `files`."""
    out = {}
    for rel, text in files.items():
        local = None
        if rel.startswith("templates/workflows/") and rel.rsplit("/", 1)[1] in workflows:
            local = ".github/workflows/" + rel.rsplit("/", 1)[1]
        elif rel.startswith("templates/actions/"):
            local = ".github/actions/" + rel[len("templates/actions/"):]
        elif rel.startswith("templates/scripts/") and rel.rsplit("/", 1)[1] in scripts:
            local = ".github/scripts/" + rel.rsplit("/", 1)[1]
        elif rel.startswith("templates/ui-tests/") and not rel.endswith("package-lock.json"):
            local = ".github/scripts/ui-tests/" + rel[len("templates/ui-tests/"):]
        elif rel == "templates/claude-hooks/session-start.sh":
            local = ".claude/hooks/session-start.sh"
        elif rel == "templates/claude-settings.json":
            local = ".claude/settings.json"
        if local:
            out[local] = (text, rel in EXEC)
    return out


def project(name, at=H_FILES, stamp=S, changes=None, sync_extra=None, **kw):
    """A scratch downstream repo that installed `at`, stamped at `stamp`, with
    `changes` ({local path: text, or None to delete, or (text, exec)}) on top.
    Committed, so git records each file's mode."""
    root = WORK / name
    root.mkdir()
    files = installed(at, **kw)
    for path, val in (changes or {}).items():
        if val is None:
            files.pop(path, None)
        elif isinstance(val, tuple):
            files[path] = val
        else:
            files[path] = (val, files.get(path, ("", False))[1])
    sync = {"upstream": {"sha": stamp, "synced": "2026-10-01"}} if stamp else {}
    sync.update(sync_extra or {})
    files[".claude/directive-sync.json"] = (json.dumps(sync, indent=2) + "\n", False)
    for rel, (text, ex) in files.items():
        dest = root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text, encoding="utf-8")
        dest.chmod(0o755 if ex else 0o644)
    git(root, "init", "-q", "-b", "main")
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "project")
    return root


def run(root, script, *args, env=None):
    e = {**ENV, "REFRESH_UPSTREAM": URL, **(env or {})}
    return run_argv(["bash", BIN / script, *args], cwd=root, env=e)


def failing(tool, when=""):
    """A PATH whose `tool` fails -- every call, or only one whose arguments
    contain `when` -- and defers to the real one otherwise. How a case makes a
    write or a fetch fail as root, where a read-only mode would not."""
    d = WORK / f"fail-{tool}-{when or 'all'}"
    d.mkdir(exist_ok=True)
    real = shutil.which(tool)
    stub = d / tool
    stub.write_text("#!/bin/bash\n"
                    + (f'case " $* " in *" {when} "*) exit 1;; esac\nexec {real} "$@"\n' if when
                       else "exit 1\n"))
    stub.chmod(0o755)
    return {"PATH": f"{d}:{os.environ['PATH']}"}


def marker(root, name):
    return root / ".git" / f"refresh-repo-{name}"


def set_kept(root, key, entry):
    p = root / ".claude/directive-sync.json"
    d = json.loads(p.read_text(encoding="utf-8"))
    d.setdefault("refresh_kept", {})[key] = entry
    p.write_text(json.dumps(d, indent=2) + "\n", encoding="utf-8")


def expect(label, result, code, needle, absent=None):
    rc, out = result
    if absent is not None and absent in out:
        CASES.fail(label, f"the output must NOT contain {absent!r}.\n      {out}")
        return False
    return CASES.expect(label, rc, out, code, needle)


def check(label, ok, detail):
    if ok:
        CASES.ok(label)
    else:
        CASES.fail(label, detail)


# ---- item 1: no silent success ----------------------------------------------
def refs_project(name, body):
    root = project(name)
    (root / "CLAUDE.md").write_text(body, encoding="utf-8")
    return root


RAW = "https://raw.githubusercontent.com/akyachtsman/claude.directives/main/"
r = refs_project("refs-ok", f"see {RAW}docs/guide.md and {RAW}directives/git.md\n")
expect("broken-refs: every reference valid prints an OK line with the count",
       run(r, "refresh-broken-refs.sh"), 0, "OK: 2 upstream reference(s) checked")
r = refs_project("refs-none", "no upstream links here\n")
expect("broken-refs: no reference at all still prints OK with 0, never silence",
       run(r, "refresh-broken-refs.sh"), 0, "OK: 0 upstream reference(s) checked")
r = refs_project("refs-bad", f"see {RAW}docs/guide.md and {RAW}docs/gone.md\n")
expect("broken-refs: a missing path is BROKEN and the summary counts it",
       run(r, "refresh-broken-refs.sh"), 1, "BROKEN: 1 of 2 upstream reference(s)")

r = project("hook-ok")
expect("hook-install: a present, executable hook prints its state",
       run(r, "refresh-hook-install.sh"), 0, "OK: hook state: .claude/hooks/session-start.sh present, executable")
r = project("hook-noexec", changes={".claude/hooks/session-start.sh": ("#!/usr/bin/env bash\necho v2\n", False)})
expect("hook-install: a present, non-executable hook says so",
       run(r, "refresh-hook-install.sh"), 0, "present, NOT executable")
r = project("hook-nosettings", changes={".claude/settings.json": None, ".claude/hooks/session-start.sh": None})
expect("hook-install: no settings file prints not-applicable, never silence",
       run(r, "refresh-hook-install.sh"), 0, "OK: hook state: not applicable")
r = project("hook-absent", changes={".claude/hooks/session-start.sh": None})
res = run(r, "refresh-hook-install.sh", env={"REFRESH_PIN": H})
hook = r / ".claude/hooks/session-start.sh"
if expect("hook-install: an absent hook is installed from the PINNED template",
          res, 0, f"INSTALLED: .claude/hooks/session-start.sh (was absent) from the template at {H}"):
    check("hook-install: the installed hook is executable and is the pinned content",
          hook.is_file() and os.access(hook, os.X_OK) and "echo v2" in hook.read_text(),
          f"hook missing, not executable, or wrong content: {hook.read_text() if hook.is_file() else 'absent'}")

# ---- Phase 2: the pin -------------------------------------------------------
r = project("delta-pin", at=S_FILES)
expect("delta: it prints the head it pins, and lists the delta",
       run(r, "refresh-delta.sh"), 0, f"pinned: {H}")
check("delta: the base marker records the stamp the delta was listed from",
      marker(r, "base").is_file() and marker(r, "base").read_text() == S,
      f"base marker: {marker(r, 'base').read_text() if marker(r, 'base').is_file() else 'absent'}")
r = project("delta-current", stamp=H)
expect("delta: a stamp already at head says so, never silence",
       run(r, "refresh-delta.sh"), 0, f"OK: stamp already at {H}")

# ---- item 2: the stamp keeps Phase 2's verdict through a refusal -------------
r = project("stamp-refuse", changes={".github/workflows/ci-monitor.yml": S_FILES["templates/workflows/ci-monitor.yml"]})
run(r, "refresh-delta.sh")
rc, out = res = run(r, "refresh-stamp.sh")
expect("stamp: a refused stamp exits non-zero", res, 1, "UNAPPLIED: .github/workflows/ci-monitor.yml differs")
check("stamp: a refused stamp keeps Phase 2's verdict (marker, base and delta)",
      all(marker(r, n).is_file() for n in ("classified", "base", "delta")),
      f"markers after a refusal: {[n for n in ('classified', 'base', 'delta') if marker(r, n).is_file()]}")
m = re.search(r"ci-monitor\.yml differs .* \(blob ([0-9a-f]{40})\)", out)
if m:
    set_kept(r, ".github/workflows/ci-monitor.yml", {"blob": m.group(1), "reason": "a local watch list"})
res = run(r, "refresh-stamp.sh")
expect("stamp: the re-run after recording a reason stamps without refresh-delta.sh",
       res, 0, f"stamped: {H}")
check("stamp: a successful stamp consumes the verdict",
      not any(marker(r, n).exists() for n in ("classified", "base", "delta")),
      "a marker survived the stamp")
expect("stamp: with the verdict consumed, a third run refuses as NOT classified",
       run(r, "refresh-stamp.sh"), 1, "was NOT classified")

r = project("stamp-fetch-fails", changes={".github/workflows/ci-monitor.yml": S_FILES["templates/workflows/ci-monitor.yml"]})
run(r, "refresh-delta.sh")
res = run(r, "refresh-stamp.sh", env=failing("git", "fetch"))
expect("stamp: an upstream tree that cannot be fetched is exit 2 (could not run), not a refusal (Codex, #449)",
       res, 2, "upstream tree unavailable this run", absent="the paths above are unapplied")
check("stamp: a fetch failure keeps Phase 2's verdict for the re-run",
      all(marker(r, n).is_file() for n in ("classified", "base", "delta")), "a marker was consumed")

r = project("stamp-base", at=H_FILES)
run(r, "refresh-delta.sh")
p = r / ".claude/directive-sync.json"
d = json.loads(p.read_text())
d["upstream"]["sha"] = M
p.write_text(json.dumps(d))
expect("stamp: a stamp changed since Phase 2 listed the delta refuses (base bound)",
       run(r, "refresh-stamp.sh"), 1, "was NOT classified")

# ---- item 3: the lockfile only with the scheduled-task kit --------------------
r = project("lock-none")
run(r, "refresh-delta.sh")
expect("stamp: package.json without the cron kit needs no lockfile",
       run(r, "refresh-stamp.sh"), 0, f"stamped: {H}", absent="package-lock.json")
r = project("lock-cron", workflows=INSTALLED_WORKFLOWS + ("cron-notify.yml",),
            scripts=INSTALLED_SCRIPTS + ("notify-task.js", "notify-email.js"))
run(r, "refresh-delta.sh")
expect("stamp: the cron kit without a lockfile is refused, naming the kit",
       run(r, "refresh-stamp.sh"), 1,
       "package-lock.json is absent but required by the scheduled-task kit")
(r / ".github/scripts/package-lock.json").write_text("{}\n")
expect("stamp: the cron kit WITH its lockfile stamps",
       run(r, "refresh-stamp.sh"), 0, f"stamped: {H}")

# ---- item 10: one entry declines a whole kit subdirectory ---------------------
LIB_GONE = {".github/scripts/ui-tests/tests/lib/fixtures.js": None,
            ".github/scripts/ui-tests/tests/lib/auth.js": None}
LIB_TREE = tree_id(H, "templates/ui-tests/tests/lib")
r = project("kitdir-hint", changes=LIB_GONE)
run(r, "refresh-delta.sh")
expect("stamp: absent kit lib files are refused, with the one-step decline named",
       run(r, "refresh-stamp.sh"), 1,
       f"one refresh_kept entry keyed \".github/scripts/ui-tests/tests/lib/\" with tree {LIB_TREE}")
for label, key in (("as installed", ".github/scripts/ui-tests/tests/lib/"),
                   ("as shipped", "templates/ui-tests/tests/lib/")):
    r = project(f"kitdir-{label.split()[1]}", changes=LIB_GONE,
                sync_extra={"refresh_kept": {key: {"tree": LIB_TREE, "reason": "helpers stay inline in app.spec.js"}}})
    run(r, "refresh-delta.sh")
    expect(f"stamp: ONE kit-directory entry keyed {label} covers every file under it",
           run(r, "refresh-stamp.sh"), 0, "(directory tests/lib/) helpers stay inline")
r = project("kitdir-stale-tree", changes=LIB_GONE,
            sync_extra={"refresh_kept": {".github/scripts/ui-tests/tests/lib/": {
                "tree": tree_id(S, "templates/ui-tests/tests/lib"), "reason": "old"}}})
run(r, "refresh-delta.sh")
expect("stamp: a kit-directory entry bound to an OLD tree no longer covers it",
       run(r, "refresh-stamp.sh"), 1, "tests/lib/fixtures.js is absent but required")
r = project("kitdir-root", changes=LIB_GONE,
            sync_extra={"refresh_kept": {".github/scripts/ui-tests/": {
                "tree": tree_id(H, "templates/ui-tests"), "reason": "the whole kit"}}})
run(r, "refresh-delta.sh")
expect("stamp: the kit ROOT is never a one-step decline",
       run(r, "refresh-stamp.sh"), 1, "tests/lib/auth.js is absent but required")

# ---- items 5-7: drift at the pin, STALE vs CUSTOM, modes ----------------------
DRIFTED = {
    ".github/workflows/qa.yml": QA_S.replace("# top-1\n", "# top-1 (local)\n"),   # CUSTOM
    ".claude/hooks/session-start.sh": ("#!/usr/bin/env bash\necho v1\n", False),   # STALE + MODE
}
r = project("drift", at=S_FILES, changes=DRIFTED)
run(r, "refresh-delta.sh")
res = run(r, "refresh-drift.sh")
expect("drift: it reads Phase 2's pin", res, 0, f"pinned: {H} (Phase 2's classified head)")
expect("drift: a copy equal to the stamp-era template is STALE",
       res, 0, "STALE: .github/workflows/ci-monitor.yml")
expect("drift: a copy that differs from the stamp-era template too is CUSTOM",
       res, 0, "CUSTOM: .github/workflows/qa.yml")
expect("drift: a lost executable bit is a MODE line, not DRIFT",
       res, 0, "MODE: .claude/hooks/session-start.sh is 100644, the template is 100755")
expect("drift: the summary counts each class", res, 0, "2 STALE, 1 CUSTOM, 0 DRIFT, 1 MODE")

r = project("drift-pin", at=S_FILES, stamp=S)
marker(r, "classified").write_text(S)
expect("drift: it reads Phase 2's pin, not main (a copy current AT the pin is not drift)",
       run(r, "refresh-drift.sh"), 0, "0 STALE, 0 CUSTOM, 0 DRIFT")
r = project("drift-nostamp", at=S_FILES, stamp=None)
expect("drift: with no stamp, stale cannot be told from custom: DRIFT, with the reason",
       run(r, "refresh-drift.sh"), 0, "DRIFT: .github/workflows/ci-monitor.yml (no stamp")
expect("drift: with no Phase 2 marker it says it fell back to main",
       run(r, "refresh-drift.sh"), 0, "ls-remote main -- no Phase 2 marker")

# ---- item 6: the 3-way merge ----------------------------------------------------
r = project("merge-clean", at=S_FILES, changes={".github/workflows/qa.yml": DRIFTED[".github/workflows/qa.yml"]})
res = run(r, "refresh-merge.sh", ".github/workflows/qa.yml", "--write", env={"REFRESH_PIN": H})
expect("merge: a local hunk apart from the upstream one merges cleanly", res, 0, "(0 conflict(s))")
expect("merge: the local hunks are shown on their own", res, 0, "+# top-1 (local)")
merged = (r / ".github/workflows/qa.yml").read_text()
check("merge: --write keeps the local hunk AND takes the upstream one",
      "# top-1 (local)" in merged and "# bottom-3 (upstream fix)" in merged and "<<<<<<<" not in merged,
      f"merged file:\n{merged}")
r = project("merge-conflict", at=S_FILES,
            changes={".github/workflows/qa.yml": QA_S.replace("# bottom-3\n", "# bottom-3 (local)\n")})
res = run(r, "refresh-merge.sh", ".github/workflows/qa.yml", "--write", env={"REFRESH_PIN": H})
expect("merge: an overlapping hunk is a conflict, and --write refuses it", res, 1, "NOT WRITTEN")
check("merge: a refused --write leaves the file untouched",
      "<<<<<<<" not in (r / ".github/workflows/qa.yml").read_text(), "conflict markers were written")
r = project("merge-write-fails", at=S_FILES, changes={".github/workflows/qa.yml": DRIFTED[".github/workflows/qa.yml"]})
before = (r / ".github/workflows/qa.yml").read_text()
res = run(r, "refresh-merge.sh", ".github/workflows/qa.yml", "--write", env={"REFRESH_PIN": H, **failing("mv")})
expect("merge: a write that fails is exit 2 and NOT WRITTEN (Codex, #449)", res, 2, "NOT WRITTEN")
check("merge: a write that fails never also claims WRITTEN",
      not any(line.startswith("WRITTEN:") for line in res[1].splitlines()), res[1])
check("merge: a failed write leaves the file as it was, and no temporary file",
      (r / ".github/workflows/qa.yml").read_text() == before
      and not list((r / ".github/workflows").glob(".refresh-merge.*")),
      f"files: {sorted(p.name for p in (r / '.github/workflows').iterdir())}")

# ---- item 8: the caller set is computed --------------------------------------------
r = project("callers", changes={".github/actions/ui-suite/action.yml": None,
                                ".github/actions/ui-suite/validate-report-path.py": None,
                                ".github/workflows/mine.yml": "name: Mine\n"})
res = run(r, "refresh-callers.sh", "templates/workflows/cron-notify.yml", env={"REFRESH_PIN": H})
want = "\n".join(sorted([
    "templates/workflows/qa.yml", "templates/workflows/ci-monitor.yml",
    "templates/workflows/cron-notify.yml", "templates/actions/ui-suite/action.yml",
    *[f"directives/{d}.md" for d in ("global", "git", "design", "test", "data")]]))
rc, out = res
stdout_lines = "\n".join(ln for ln in out.splitlines() if not ln.startswith("refresh-callers:"))
check("callers: installed callers, the composite they reach upstream, the directives and the named new caller",
      rc == 0 and stdout_lines == want, f"exit {rc}; got:\n{out}\nwant:\n{want}")
expect("callers: a caller upstream does not ship is refused, not skipped",
       run(r, "refresh-callers.sh", "templates/workflows/nope.yml", env={"REFRESH_PIN": H}),
       2, "templates/workflows/nope.yml is not shipped")

# ---- item 8: the kit-defects checks are extracted and run ----------------------------
r = project("kd")
res = run(r, "kit-defects.sh")
expect("kit-defects: an entry's Check block is extracted and run from the kit",
       res, 0, "KD-1 .github/scripts/ui-tests: AFFECTED")
expect("kit-defects: an entry with no Check block is UNDECIDED, never CLEAR",
       res, 0, "KD-2 .github/scripts/ui-tests: UNDECIDED (no Check block")
(r / ".github/scripts/ui-tests/tests/app.spec.js").write_text("// FIXED\n")
expect("kit-defects: the fixed copy reads CLEAR",
       run(r, "kit-defects.sh"), 0, "KD-1 .github/scripts/ui-tests: CLEAR")
r = project("kd-none", changes={p: None for p in installed(H_FILES) if "/ui-tests/" in p})
expect("kit-defects: no kit is said, not silent",
       run(r, "kit-defects.sh"), 0, "OK: no UI-test kit")

# ---- new repository variables and secrets: an OWNER PRE-MERGE item -------------
# Each project stands as it was when the stamp was written (S's files,
# committed with the stamp), and the refresh's installs land UNCOMMITTED on
# top, as they do in Phase 3. The baseline is the project's own files at the
# stamp commit, never the upstream templates (Codex, #450).
LIVE = INSTALLED_WORKFLOWS + ("qa-live.yml",)


def refresh_installs(root, workflows):
    for path, (text, _) in installed(H_FILES, workflows=workflows).items():
        if path.startswith(".github/workflows/"):
            (root / path).write_text(text)


r = project("vars-new", at=S_FILES, workflows=LIVE)
run(r, "refresh-delta.sh")
refresh_installs(r, LIVE)
res = run(r, "refresh-vars.sh")
expect("vars: a release that adds a vars.APP_URL read names the variable and the file",
       res, 0, "OWNER PRE-MERGE: set repository variable APP_URL — newly read by templates/workflows/qa-live.yml")
expect("vars: a new secrets read is named the same way (the bracket form too)",
       res, 0, "OWNER PRE-MERGE: set repository secret NEW_SECRET — newly read by templates/workflows/qa-live.yml")
expect("vars: a read the project already ran with is not flagged",
       res, 0, "OWNER PRE-MERGE", absent="TEST_AUTH_CREDENTIAL")
expect("vars: GITHUB_TOKEN is never flagged", res, 0, "OWNER PRE-MERGE", absent="GITHUB_TOKEN")
expect("vars: a read after a # inside a quoted string is still a read (Codex, #450)",
       res, 0, "OWNER PRE-MERGE: set repository secret HASH_QUOTED")
expect("vars: a #-led line of a block scalar is still a read (Codex, #450)",
       res, 0, "OWNER PRE-MERGE: set repository secret BLOCK_HASH")
expect("vars: a name in plain text (no ${{ }}, no if:) is not a read",
       res, 0, "OWNER PRE-MERGE", absent="COMMENTED_ONLY")
expect("vars: a bare if: expression is a read", res, 0, "OWNER PRE-MERGE: set repository variable GATE")
expect("vars: a folded `if: >` block is read whole (Codex, #450)",
       res, 0, "OWNER PRE-MERGE: set repository variable DEPLOY_ENABLED")
expect("vars: a commented-out read (cron-notify's optional DB lines) is no read, even first time (Codex, #450)",
       res, 0, "OWNER PRE-MERGE", absent="OPTIONAL_DB")
expect("vars: with new reads there is no OK line", res, 0, "SUMMARY: 6 new", absent="OK: no new")

r = project("vars-custom-dropped", at=S_FILES, workflows=LIVE,
            changes={".github/workflows/qa-live.yml": LIVE_S.replace(
                "          test-auth-credential: ${{ secrets.TEST_AUTH_CREDENTIAL }}\n", "")})
run(r, "refresh-delta.sh")
refresh_installs(r, LIVE)
expect("vars: a read the project's CUSTOM copy had dropped is listed when the template brings it (Codex, #450)",
       run(r, "refresh-vars.sh"), 0, "OWNER PRE-MERGE: set repository secret TEST_AUTH_CREDENTIAL")

r = project("vars-comment-goes-live", at=S_FILES, workflows=LIVE,
            changes={".github/workflows/qa-live.yml": LIVE_S + "          # future: use ${{ vars.APP_URL }}\n"})
run(r, "refresh-delta.sh")
refresh_installs(r, LIVE)
expect("vars: a name the project only MENTIONED in a comment is listed when the template makes it live (Codex, #450)",
       run(r, "refresh-vars.sh"), 0, "OWNER PRE-MERGE: set repository variable APP_URL")

r = project("vars-inert-text", at=S_FILES, workflows=LIVE,
            changes={".github/workflows/qa-live.yml": LIVE_S.replace("name: QA Live", "name: QA Live (vars.APP_URL later)")
                     + "      - run: echo 'configure vars.APP_URL later'\n"})
run(r, "refresh-delta.sh")
refresh_installs(r, LIVE)
expect("vars: inert text naming a variable is no baseline read: the live one is listed (Codex, #450)",
       run(r, "refresh-vars.sh"), 0, "OWNER PRE-MERGE: set repository variable APP_URL")

r = project("vars-installed-now", at=S_FILES)
run(r, "refresh-delta.sh")
refresh_installs(r, LIVE)
res = run(r, "refresh-vars.sh")
expect("vars: a template installed by THIS refresh lists even its stamp-era reads (Codex, #450)",
       res, 0, "OWNER PRE-MERGE: set repository secret TEST_AUTH_CREDENTIAL — newly read by templates/workflows/qa-live.yml")
expect("vars: …and its new ones", res, 0, "OWNER PRE-MERGE: set repository variable APP_URL")

r = project("vars-newly-installed", at=S_FILES, workflows=LIVE)
run(r, "refresh-delta.sh")
refresh_installs(r, LIVE + ("new.yml",))
expect("vars: a template absent at the stamp counts its reads as new",
       run(r, "refresh-vars.sh"), 0,
       "OWNER PRE-MERGE: set repository variable FROM_NEW — newly read by templates/workflows/new.yml")

r = project("vars-none")
run(r, "refresh-delta.sh")
expect("vars: a template the project does not install is not read: the OK line, never silence",
       run(r, "refresh-vars.sh"), 0, "OK: no new repository variables or secrets read", absent="APP_URL")
r = project("vars-current", workflows=LIVE, stamp=H)
run(r, "refresh-delta.sh")
expect("vars: reads all present at the stamp print the explicit OK line",
       run(r, "refresh-vars.sh"), 0, "OK: no new repository variables or secrets read", absent="OWNER PRE-MERGE")
run(r, "refresh-stamp.sh")
expect("vars: after the stamp consumed Phase 2's marker it refuses, never a false OK",
       run(r, "refresh-vars.sh"), 2, "no Phase 2 marker", absent="OK: no new")

shutil.rmtree(WORK, ignore_errors=True)
sys.exit(CASES.finish(f"{CASES.passed} refresh-script behaviours hold against a fixture upstream."))
