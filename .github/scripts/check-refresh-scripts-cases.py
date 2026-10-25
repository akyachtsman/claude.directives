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
KIT_DEFECTS_BIN, REFRESH_VARS_BIN, REFRESH_LIB_BIN, HOUSE_STYLE_INVENTORY_BIN.

THE HOUSE STYLE (#470, 2026-10-25). A project marked as on the house style
(.claude/directive-sync.json -> house_style: true) has styles/components.css
compared verbatim and styles/tokens.css by token name, every run, in drift and
the stamp; an unmarked one compares nothing in styles/. MEASURED 2026-10-25,
each pre-change script swapped in alone (09ace64): REFRESH_DRIFT_BIN -> the 10
house drift cases; REFRESH_STAMP_BIN -> the 8 house stamp cases that refuse or
print a line (the clean stamp and the KEPT ones hold trivially, since the old
stamp compared nothing); REFRESH_LIB_BIN -> 17 (the drift and stamp cases that
need refresh_house_style, and both merge cases, which need
refresh_template_of to map styles/). Then the new lib with one feature
reverted: comments kept in refresh_token_names -> the commented-out-token
case; the marker read as truthy rather than exactly true -> the "true"-string
case. house-style-inventory.sh is new, so HOUSE_STYLE_INVENTORY_BIN = an empty
file -> all 5 inventory cases.

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
bada2fe fails the folded-if and commented-out cases. Round seven: a read in a
trailing comment of the project's file hid one made live upstream; the
baseline side now drops a mid-line `#` onward (the incoming side keeps it),
and d4b92e8 fails the trailing-comment case. Round eight: a `${{` folded over
two lines lost its continuation; the incoming side now follows an open span
to its `}}`, and 4c41b1e fails the folded-expression case.

DRIFT OVER .github/scripts/* (owner-approved 2026-10-13, the claude.prop
pilot: five script templates in the delta were classified by hand, because
refresh-drift.sh compared only workflows, composites and the hook; and its
deliberately kept check-contrast.js came back as a fresh CUSTOM question every
refresh, so a CUSTOM line now names a refresh_kept reason that binds). MEASURED
2026-10-13: REFRESH_DRIFT_BIN = refresh-drift.sh at 569a0ae (the pre-change
script) -> eight cases: the STALE script, the CUSTOM script (plain, no
record), the script MODE line, the SUMMARY that counts the scripts (it said 5
compared, 2 match where 10 and 5 hold), and the three refresh_kept cases (a
matching record annotates a CUSTOM script and a CUSTOM workflow; one bound to
an old template blob does not). The binding itself: the new script with
`.blob == $b` dropped from the record select -> the old-blob case alone.
The not-listed cases hold against the pre-change script trivially
(it listed no script), so they were measured against the new script with one
feature reverted at a time:
  the silent skip removed (a no-template script prints NO-TEMPLATE) -> the
    project-own and package-lock.json cases;
  the kit exclusion removed -> the kit-at-.github/scripts case;
  both removed AND the loop widened to .github/scripts/*/*(/*) -> those three
    plus the .github/scripts/ui-tests/ case (the top-level glob alone already
    keeps the kit subtree out; the case pins that).

LOCAL BINDING (Codex, #451). A refresh_kept record now also names the installed
copy's blob (`local`); drift honours it only when both blobs match, and the stamp
refuses when a record names a local blob the file no longer has. MEASURED
2026-10-13: the pre-change refresh-drift.sh fails the no-local and edited-since
cases; the pre-change refresh-stamp.sh fails the "refusal prints the local blob"
case, and the new stamp with only the local condition removed fails the
"local blob no longer matches" case. Round 3: the stamp now REQUIRES `local`
(`absent` for a required file not installed) -- a record without it refuses --
and drift counts a file under a kit directory as the kit's only when
templates/ui-tests ships its name. MEASURED: the 008b165 stamp fails 4 cases
(no-local refuses, absent printed, absent covered, and the re-run that follows),
the 008b165 drift fails the kit-at-the-scripts-root case. Round 4: a reason
must be a non-blank string in drift AND the stamp (kit_dir_kept's predicate).
MEASURED: the 06a5267 drift fails the three no-reason cases, the 06a5267 stamp
the blank-reason one and the re-run that follows it.
Round 5: `local` is the blob of the bytes on disk (`git hash-object
--no-filters`), so a CRLF rewrite under core.autocrlf is not the approved
content. MEASURED: the dec4182 drift and stamp each fail their CRLF case.
Round 6: a kit at the project root (kit-dirs.sh prints `.`) defeats a
`"$k"/*` prefix test, so drift, merge and the stamp map kit paths through
refresh-lib.sh's refresh_kit_rel / refresh_kit_join, and each takes a path as
the kit's only when templates/ui-tests ships its name. MEASURED: the 954ae12
refresh-merge.sh fails the root-kit kit-file case, the 954ae12 stamp the
root-kit refusal case (it printed ./playwright.config.js).
NO-DELTA STAMP (owner ruling, 2026-10-14, claude.prop pilot). At a head
already stamped the stamp leaves .claude/directive-sync.json byte-identical:
`synced` is the date the sha last changed. MEASURED: the daf57e6 stamp fails
the "unchanged" line and the byte-identical case.
RE-RECORD (claude.prop pilot, 2026-10-15). Drift's warning lines quote a
refresh_kept reason cut to 60 characters, and one RE-RECORD line after SUMMARY
names every file record, kit files included, whose `local` is missing or stale.
MEASURED: the f680dd3 drift fails the cut-reason case and the four RE-RECORD
cases. Round 2 (Codex, #457): each key is read raw, never through @tsv, which
escapes a backslash. MEASURED: the 9e57ed6 drift fails the backslash case and
the count case (it counts the bound backslash record: 3, not 2).
Round 3 (Codex, #457): a key ending in a newline survives command substitution
(a sentinel). MEASURED: the 7258283 drift fails the newline case and the two
cases that assert the count (3, not 2).
Round 4 (claude.prop pilot, 2026-10-15): the line of a record that BINDS --
drift's CUSTOM, the stamp's KEPT, file and kit-directory forms -- is cut to 60
characters too; and refresh-vars.sh baselines at the commit that WROTE the
stamp, not the last one touching the sync file. MEASURED against bde28c9: the
drift fails the binding-cut case, the stamp both KEPT cases, refresh-vars.sh
the baseline case and the read it hides.

Run: python3 .github/scripts/check-refresh-scripts-cases.py
"""
# Before any import: running the gate must leave no __pycache__/ beside the
# local modules it imports (cases_lib.py and/or gh_yaml.py).
import sys
from datetime import datetime, timezone
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
    "house-style-inventory.sh": "HOUSE_STYLE_INVENTORY_BIN",
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
      - name: folded expression
        env:
          ON: ${{ github.ref == 'refs/heads/main' ||
            vars.FOLDED_FLAG }}
      - name: optional db
        env:
          # DB_URL: ${{ vars.OPTIONAL_DB }}
          X: "1"
"""
# The house style (#470): the head adds a token NAME (--color-new) and changes
# the components, so a marked project at the stamp has both to take.
TOKENS_S = """:root {
  --color-accent: #106AD0;
  --color-bg: #F5F5F3;
  --space-1: 4px;
}
"""
TOKENS_H = TOKENS_S.replace("}\n", "  --color-new: #8C887F;\n}\n")
COMP_S = ".btn { color: var(--color-accent); }\n"
COMP_H = COMP_S + ".field { border-color: var(--color-new); }\n"
SETTINGS = json.dumps({"permissions": {"allow": ["Bash(ls:*)"]},
                       "hooks": {"SessionStart": [{"hooks": [
                           {"type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/session-start.sh"}]}]}},
                      indent=2) + "\n"
S_FILES = {
    "templates/workflows/qa.yml": QA_S,
    "templates/workflows/sample-wf.yml": "name: Sample WF\n# v1\n",
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
    "templates/scripts/guard.py": "#!/usr/bin/env python3\nprint('guard v1')\n",
    "templates/scripts/lint.py": "#!/usr/bin/env python3\nprint('lint')\n",
    "templates/ui-tests/tests/app.spec.js": "// spec\n",
    "templates/ui-tests/tests/lib/fixtures.js": "// fixtures v1\n",
    "templates/ui-tests/tests/lib/auth.js": "// auth\n",
    "templates/ui-tests/playwright.config.js": "// config\n",
    "templates/ui-tests/package.json": "{}\n",
    "templates/ui-tests/package-lock.json": "{}\n",
    "templates/claude-settings.json": SETTINGS,
    "templates/styles/tokens.css": TOKENS_S,
    "templates/styles/components.css": COMP_S,
    "docs/standards/kit-defects.md": KIT_DEFECTS,
    "docs/guide.md": "a guide\n",
    **{f"directives/{d}.md": f"# {d}\n" for d in ("global", "git", "design", "test", "data")},
}
H_FILES = {
    **S_FILES,
    "templates/workflows/qa.yml": QA_H,
    "templates/workflows/sample-wf.yml": "name: Sample WF\n# v2\n",
    "templates/workflows/qa-live.yml": LIVE_H,
    "templates/workflows/new.yml": "name: New\n# read: ${{ vars.FROM_NEW }}\nenv:\n  X: ${{ vars.FROM_NEW }}\n",
    "templates/claude-hooks/session-start.sh": "#!/usr/bin/env bash\necho v2\n",
    "templates/ui-tests/tests/lib/fixtures.js": "// fixtures v2\n",
    "templates/scripts/guard.py": "#!/usr/bin/env python3\nprint('guard v2')\n",
    "templates/styles/tokens.css": TOKENS_H,
    "templates/styles/components.css": COMP_H,
}
EXEC = {"templates/claude-hooks/session-start.sh",
        "templates/scripts/guard.py", "templates/scripts/lint.py"}

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
INSTALLED_WORKFLOWS = ("qa.yml", "sample-wf.yml")
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


def obj_id(text):
    """The blob id git gives this content -- what a record's `local` binds."""
    return subprocess.run(["git", "hash-object", "--stdin"], input=text.encode(),
                          capture_output=True, check=True).stdout.decode().strip()


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
r = project("stamp-refuse", changes={".github/workflows/sample-wf.yml": S_FILES["templates/workflows/sample-wf.yml"]})
run(r, "refresh-delta.sh")
rc, out = res = run(r, "refresh-stamp.sh")
expect("stamp: a refused stamp exits non-zero", res, 1, "UNAPPLIED: .github/workflows/sample-wf.yml differs")
check("stamp: a refused stamp keeps Phase 2's verdict (marker, base and delta)",
      all(marker(r, n).is_file() for n in ("classified", "base", "delta")),
      f"markers after a refusal: {[n for n in ('classified', 'base', 'delta') if marker(r, n).is_file()]}")
m = re.search(r"sample-wf\.yml differs .* \(blob ([0-9a-f]{40})\) \(local ([0-9a-f]{40})\)", out)
if m:
    # A record without `local` (the pre-#451 shape) binds nothing: still refused.
    set_kept(r, ".github/workflows/sample-wf.yml", {"blob": m.group(1), "reason": "a local watch list"})
    expect("stamp: a record without a local blob refuses, never inherits the approval (Codex, #451)",
           run(r, "refresh-stamp.sh"), 1, "UNAPPLIED: .github/workflows/sample-wf.yml differs")
    # Both blobs bound but a blank reason: drift shows it as needing a reason,
    # so the stamp must not honour it either (Codex, #451).
    set_kept(r, ".github/workflows/sample-wf.yml",
             {"blob": m.group(1), "local": m.group(2), "reason": "  \n"})
    expect("stamp: a record with a blank reason refuses, as drift reports it",
           run(r, "refresh-stamp.sh"), 1, "UNAPPLIED: .github/workflows/sample-wf.yml differs")
    set_kept(r, ".github/workflows/sample-wf.yml",
             {"blob": m.group(1), "local": m.group(2), "reason": "a local watch list"})
res = run(r, "refresh-stamp.sh")
r2 = project("stamp-local-moved", changes={".github/workflows/sample-wf.yml": S_FILES["templates/workflows/sample-wf.yml"]})
run(r2, "refresh-delta.sh")
rc2, out2 = run(r2, "refresh-stamp.sh")
m2 = re.search(r"sample-wf\.yml differs .* \(blob ([0-9a-f]{40})\) \(local ([0-9a-f]{40})\)", out2)
check("stamp: a refusal prints the installed copy's local blob to record", bool(m2), out2)
if m2:
    set_kept(r2, ".github/workflows/sample-wf.yml",
             {"blob": m2.group(1), "local": m2.group(2), "reason": "a local watch list"})
    (r2 / ".github/workflows/sample-wf.yml").write_text(
        (r2 / ".github/workflows/sample-wf.yml").read_text() + "# edited after approval\n")
    expect("stamp: a record whose local blob no longer matches the file refuses (Codex, #451)",
           run(r2, "refresh-stamp.sh"), 1, "UNAPPLIED: .github/workflows/sample-wf.yml differs")
    # The same approval, then only the line endings change, in a project with
    # core.autocrlf on: a filtered hash would map the CRLF file back to the
    # approved blob; the binding is to the bytes on disk (Codex, #451).
    ci = r2 / ".github/workflows/sample-wf.yml"
    approved = S_FILES["templates/workflows/sample-wf.yml"]
    set_kept(r2, ".github/workflows/sample-wf.yml",
             {"blob": m2.group(1), "local": obj_id(approved), "reason": "a local watch list"})
    ci.write_bytes(approved.replace("\n", "\r\n").encode())
    subprocess.run(["git", "-C", str(r2), "config", "core.autocrlf", "true"], check=True)
    expect("stamp: a CRLF rewrite under core.autocrlf no longer matches the approved local blob",
           run(r2, "refresh-stamp.sh"), 1, "UNAPPLIED: .github/workflows/sample-wf.yml differs")
expect("stamp: the re-run after recording a reason stamps without refresh-delta.sh",
       res, 0, f"stamped: {H}")
check("stamp: a successful stamp consumes the verdict",
      not any(marker(r, n).exists() for n in ("classified", "base", "delta")),
      "a marker survived the stamp")
check("stamp: a stamp that moves the sha writes it with today's date as synced",
      json.loads((r / ".claude/directive-sync.json").read_text())["upstream"]
      == {"sha": H, "synced": datetime.now(timezone.utc).strftime("%Y-%m-%d")},
      (r / ".claude/directive-sync.json").read_text())
# A no-delta run at a head already stamped leaves the file BYTE-IDENTICAL: a
# rewrite only moved `synced` to today, a one-line diff for the stop hook to
# flag (owner ruling, 2026-10-14, claude.prop pilot).
r = project("stamp-unchanged", stamp=H)
before = (r / ".claude/directive-sync.json").read_bytes()
run(r, "refresh-delta.sh")
res = run(r, "refresh-stamp.sh")
expect("stamp: at a head already stamped it says so and exits 0",
       res, 0, f"stamped: {H} (unchanged; file not rewritten)")
check("stamp: ...and leaves .claude/directive-sync.json byte-identical",
      (r / ".claude/directive-sync.json").read_bytes() == before, (r / ".claude/directive-sync.json").read_text())
check("stamp: ...and still consumes the verdict",
      not any(marker(r, n).exists() for n in ("classified", "base", "delta")), "a marker survived")
expect("stamp: with the verdict consumed, a third run refuses as NOT classified",
       run(r, "refresh-stamp.sh"), 1, "was NOT classified")

r = project("stamp-fetch-fails", changes={".github/workflows/sample-wf.yml": S_FILES["templates/workflows/sample-wf.yml"]})
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
# A required file not installed records `local` as `absent`, which the refusal
# prints (Codex, #451).
r = project("absent-kept", changes=LIB_GONE, sync_extra={"refresh_kept": {
    ".github/scripts/ui-tests/tests/lib/fixtures.js": {
        "blob": blob_id(H, "templates/ui-tests/tests/lib/fixtures.js"), "local": "absent",
        "reason": "fixtures stay inline"}}})
run(r, "refresh-delta.sh")
res = run(r, "refresh-stamp.sh")
expect("stamp: an absent required file's refusal prints (local absent)",
       res, 1, "tests/lib/auth.js is absent but required")
check("stamp: the absent-file refusal names local absent", "(local absent)" in res[1], res[1])
expect("stamp: a record with local absent covers a required file not installed",
       res, 1, "KEPT: .github/scripts/ui-tests/tests/lib/fixtures.js -- fixtures stay inline")
for label, key in (("as installed", ".github/scripts/ui-tests/tests/lib/"),
                   ("as shipped", "templates/ui-tests/tests/lib/")):
    r = project(f"kitdir-{label.split()[1]}", changes=LIB_GONE,
                sync_extra={"refresh_kept": {key: {"tree": LIB_TREE, "reason": "helpers stay inline in app.spec.js"}}})
    run(r, "refresh-delta.sh")
    expect(f"stamp: ONE kit-directory entry keyed {label} covers every file under it",
           run(r, "refresh-stamp.sh"), 0, "(directory tests/lib/) helpers stay inline")
# KEPT lines quote the reason cut to 60 characters, as drift does: a
# deliberate divergence printed ~900 characters on every refresh (claude.prop
# pilot, 2026-10-15). Both forms: a file record and a kit-directory record.
r = project("kept-long", changes=LIB_GONE, sync_extra={"refresh_kept": {
    ".github/scripts/ui-tests/tests/lib/fixtures.js": {
        "blob": blob_id(H, "templates/ui-tests/tests/lib/fixtures.js"), "local": "absent",
        "reason": "f" * 100}}})
run(r, "refresh-delta.sh")
expect("stamp: a file record's KEPT line quotes its reason cut to 60 characters (claude.prop pilot, 2026-10-15)",
       run(r, "refresh-stamp.sh"), 1, f"KEPT: .github/scripts/ui-tests/tests/lib/fixtures.js -- {'f' * 60}...", absent="f" * 61)
r = project("kitdir-long", changes=LIB_GONE,
            sync_extra={"refresh_kept": {".github/scripts/ui-tests/tests/lib/": {"tree": LIB_TREE, "reason": "d" * 100}}})
run(r, "refresh-delta.sh")
expect("stamp: a kit-directory record's KEPT line is cut the same way",
       run(r, "refresh-stamp.sh"), 0, f"(directory tests/lib/) {'d' * 60}...", absent="d" * 61)
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
       res, 0, "STALE: .github/workflows/sample-wf.yml")
expect("drift: a copy that differs from the stamp-era template too is CUSTOM",
       res, 0, "CUSTOM: .github/workflows/qa.yml")
expect("drift: a lost executable bit is a MODE line, not DRIFT",
       res, 0, "MODE: .claude/hooks/session-start.sh is 100644, the template is 100755")
expect("drift: the summary counts each class", res, 0, "2 STALE, 1 CUSTOM, 0 DRIFT, 1 MODE")

# .github/scripts/* (claude.prop pilot, 2026-10-13: five script templates in
# the delta were classified by hand). Same classes, same SUMMARY.
r = project("drift-scripts", at=S_FILES, scripts=INSTALLED_SCRIPTS + ("guard.py", "lint.py"), changes={
    ".github/scripts/check-contrast.js": "require('fs'); // local\n",         # CUSTOM
    ".github/scripts/lint.py": (S_FILES["templates/scripts/lint.py"], False),  # match + MODE
    ".github/scripts/mine.py": "print('the project own')\n",                 # no template
    ".github/scripts/package-lock.json": "{}\n",                               # never shipped
    ".github/scripts/ui-tests/tests/app.spec.js": "// a local kit edit\n",     # the kit's
})
run(r, "refresh-delta.sh")
res = run(r, "refresh-drift.sh")
expect("drift: an installed script equal to the stamp-era template, changed upstream, is STALE",
       res, 0, "STALE: .github/scripts/guard.py")
expect("drift: a locally edited script is CUSTOM",
       res, 0, "CUSTOM: .github/scripts/check-contrast.js")
expect("drift: a CUSTOM script with no refresh_kept record is the plain line",
       res, 0, "CUSTOM: .github/scripts/check-contrast.js — differs", absent="recorded in refresh_kept")
expect("drift: a script whose exec bit differs from the template's is a MODE line",
       res, 0, "MODE: .github/scripts/lint.py is 100644, the template is 100755")
expect("drift: the scripts are counted -- unchanged ones as match -- in the same SUMMARY",
       res, 0, f"SUMMARY: 10 installed file(s) compared at {H} — 5 match, 4 STALE, 1 CUSTOM, 0 DRIFT, 1 MODE")
expect("drift: an unchanged script gets no line of its own",
       res, 0, "SUMMARY:", absent="check-ui-viewports.js")
expect("drift: a project-own script with no template is not listed (not even NO-TEMPLATE)",
       res, 0, "SUMMARY:", absent="mine.py")
expect("drift: package-lock.json (never shipped) is not listed",
       res, 0, "SUMMARY:", absent="package-lock.json")
expect("drift: nothing under .github/scripts/ui-tests/ is listed by this loop (the kit is kit-defects.sh's)",
       res, 0, "SUMMARY:", absent=".github/scripts/ui-tests")
# A kit installed AT .github/scripts (UI_TESTS_DIR, read by kit-dirs.sh): its
# package.json is a kit file, never compared with templates/scripts/package.json.
r = project("drift-scripts-kitdir", at=S_FILES, changes={
    ".github/workflows/sample-wf.yml": "name: Sample WF\nenv:\n  UI_TESTS_DIR: .github/scripts\n",
    ".github/scripts/package.json": "{}\n",
    ".github/scripts/playwright.config.js": "// config\n",
})
run(r, "refresh-delta.sh")
expect("drift: a file inside a kit directory kit-dirs.sh names is not compared as a script",
       run(r, "refresh-drift.sh"), 0, "SUMMARY:", absent=".github/scripts/package.json")
# The same kit spelled with a leading `./` (a valid equivalent path): kit-dirs.sh
# drops it, so the prefix match still holds and package.json stays a kit file
# (Codex, #451).
for i, spelling in enumerate(("./.github/scripts", ".//./.github/scripts/", ".github/scripts/.",
                              ".github//scripts", ".github/x/../scripts")):
    r = project(f"drift-scripts-kitdir-dot{i}", at=S_FILES, changes={
        ".github/workflows/sample-wf.yml": f"name: Sample WF\nenv:\n  UI_TESTS_DIR: {spelling}\n",
        ".github/scripts/package.json": "{}\n",
        ".github/scripts/playwright.config.js": "// config\n",
    })
    run(r, "refresh-delta.sh")
    expect(f"drift: a kit directory spelled {spelling!r} still keeps its package.json out of the script loop",
           run(r, "refresh-drift.sh"), 0, "SUMMARY:", absent=".github/scripts/package.json")
# ...but a kit AT the scripts root does not take the standard scripts with it:
# a script the kit template does not ship is still compared (Codex, #451).
r = project("drift-scripts-kitroot", at=S_FILES, scripts=INSTALLED_SCRIPTS + ("lint.py",), changes={
    ".github/workflows/sample-wf.yml": "name: Sample WF\nenv:\n  UI_TESTS_DIR: .github/scripts\n",
    ".github/scripts/package.json": "{}\n",
    ".github/scripts/playwright.config.js": "// config\n",
    ".github/scripts/lint.py": "#!/usr/bin/env python3\nprint('lint, replaced locally')\n",
})
run(r, "refresh-delta.sh")
res = run(r, "refresh-drift.sh")
expect("drift: with the kit at .github/scripts, a standard script is still compared",
       res, 0, "CUSTOM: .github/scripts/lint.py")
expect("drift: ...while the kit's own package.json stays out of the script loop",
       res, 0, "SUMMARY:", absent=".github/scripts/package.json")

# A CUSTOM file the project already decided on (claude.prop's check-contrast.js)
# carries its refresh_kept reason, read as refresh-stamp.sh reads it: keyed by
# the local path, bound to the template's blob at the pin AND to the installed
# copy's own blob (`local`), so a later local edit never inherits the approval
# (Codex, #451).
CONTRAST_LOCAL = "require('fs'); // house palette\n"
QA_LOCAL = DRIFTED[".github/workflows/qa.yml"]
r = project("drift-kept", at=S_FILES, scripts=INSTALLED_SCRIPTS + ("guard.py", "lint.py"), changes={
    ".github/scripts/check-contrast.js": CONTRAST_LOCAL,
    ".github/scripts/guard.py": "#!/usr/bin/env python3\nprint('guard v1, local')\n",
    ".github/scripts/lint.py": "#!/usr/bin/env python3\nprint('lint, edited after approval')\n",
    ".github/workflows/qa.yml": QA_LOCAL,
}, sync_extra={"refresh_kept": {
    ".github/scripts/check-contrast.js": {"blob": blob_id(H, "templates/scripts/check-contrast.js"),
                                          "local": obj_id(CONTRAST_LOCAL), "reason": "the house palette"},
    ".github/scripts/guard.py": {"blob": blob_id(S, "templates/scripts/guard.py"),
                                 "reason": "decided against the old template"},
    ".github/scripts/lint.py": {"blob": blob_id(H, "templates/scripts/lint.py"),
                                "local": obj_id("#!/usr/bin/env python3\nprint('lint, as approved')\n"),
                                "reason": "approved content"},
    ".github/workflows/qa.yml": {"blob": blob_id(H, "templates/workflows/qa.yml"),
                                 "reason": "a local top comment"},
}})
run(r, "refresh-delta.sh")
res = DRIFT_KEPT = run(r, "refresh-drift.sh")
expect("drift: a CUSTOM script whose record binds template AND local content carries its reason",
       res, 0, "CUSTOM: .github/scripts/check-contrast.js (recorded in refresh_kept: the house palette) — ")
expect("drift: a record with no local blob is shown but NOT honoured (Codex, #451)",
       res, 0, "CUSTOM: .github/workflows/qa.yml (refresh_kept says \"a local top comment\", but the record binds no local content")
expect("drift: a file edited since its record was made does not inherit the approval (Codex, #451)",
       res, 0, "CUSTOM: .github/scripts/lint.py (refresh_kept says \"approved content\", but this file changed since it was recorded")
expect("drift: a record bound to an OLD template blob no longer covers it: the plain line",
       res, 0, "CUSTOM: .github/scripts/guard.py — differs", absent="decided against the old template")

# A record that BINDS quotes its reason cut to 60 characters too: claude.prop's
# ~900-character qa.yml reason printed in full on every refresh (pilot,
# 2026-10-15).
r = project("drift-kept-long", at=S_FILES, changes={".github/scripts/check-contrast.js": CONTRAST_LOCAL},
            sync_extra={"refresh_kept": {".github/scripts/check-contrast.js": {
                "blob": blob_id(H, "templates/scripts/check-contrast.js"), "local": obj_id(CONTRAST_LOCAL),
                "reason": "p" * 100}}})
run(r, "refresh-delta.sh")
expect("drift: a binding record's CUSTOM line quotes its reason cut to 60 characters (claude.prop pilot, 2026-10-15)",
       run(r, "refresh-drift.sh"), 0, f"(recorded in refresh_kept: {'p' * 60}...)", absent="p" * 61)

# A CRLF rewrite of the approved content, under core.autocrlf: drift hashes the
# bytes on disk, so it is "changed since recorded", never the approval
# (Codex, #451).
r = project("drift-kept-crlf", at=S_FILES, changes={
    ".github/scripts/check-contrast.js": CONTRAST_LOCAL.replace("\n", "\r\n"),
}, sync_extra={"refresh_kept": {".github/scripts/check-contrast.js": {
    "blob": blob_id(H, "templates/scripts/check-contrast.js"), "local": obj_id(CONTRAST_LOCAL),
    "reason": "the house palette"}}})
subprocess.run(["git", "-C", str(r), "config", "core.autocrlf", "true"], check=True)
run(r, "refresh-delta.sh")
expect("drift: a CRLF rewrite under core.autocrlf is changed since recorded, not the approval",
       run(r, "refresh-drift.sh"), 0,
       "CUSTOM: .github/scripts/check-contrast.js (refresh_kept says \"the house palette\", but this file changed")

# A record binding both blobs but giving no reason is not honoured -- the stamp
# would refuse it, so drift must not say "do not re-ask" (Codex, #451).
for i, why in enumerate(("", "  \n", None)):
    rec = {"blob": blob_id(H, "templates/scripts/check-contrast.js"), "local": obj_id(CONTRAST_LOCAL)}
    if why is not None:
        rec["reason"] = why
    r = project(f"drift-kept-noreason{i}", at=S_FILES, changes={
        ".github/scripts/check-contrast.js": CONTRAST_LOCAL,
    }, sync_extra={"refresh_kept": {".github/scripts/check-contrast.js": rec}})
    run(r, "refresh-delta.sh")
    expect(f"drift: a record with reason {why!r} is shown as needing a reason, never as recorded",
           run(r, "refresh-drift.sh"), 0,
           "CUSTOM: .github/scripts/check-contrast.js (refresh_kept has a record but no reason",
           absent="recorded in refresh_kept")

# claude.prop pilot, 2026-10-15: a warning line quoted a ~800-character reason
# whole, and drift never mentioned the kit's records -- they first surfaced as
# stamp refusals. The warning quotes 60 characters; one RE-RECORD line after
# SUMMARY counts and names every FILE record whose `local` is missing or stale,
# kit files included; a record whose `local` matches, and a directory record,
# are not counted.
LONG = "x" * 100
ODD_PATH, ODD_TEXT = "ui\\tests/kept.js", "// kept under a backslash\n"
NL_PATH = "nl-kept\n"
r = project("drift-rerecord", at=S_FILES, changes={
    ".github/scripts/check-contrast.js": CONTRAST_LOCAL,
    ODD_PATH: ODD_TEXT,
    NL_PATH: ODD_TEXT,
}, sync_extra={"refresh_kept": {
    ".github/scripts/check-contrast.js": {"blob": blob_id(H, "templates/scripts/check-contrast.js"),
                                          "reason": LONG},
    ".github/scripts/ui-tests/playwright.config.js": {
        "blob": blob_id(H, "templates/ui-tests/playwright.config.js"), "reason": "local config"},
    ".github/scripts/ui-tests/tests/app.spec.js": {
        "blob": blob_id(H, "templates/ui-tests/tests/app.spec.js"),
        "local": obj_id(S_FILES["templates/ui-tests/tests/app.spec.js"]), "reason": "bound"},
    ".github/scripts/ui-tests/tests/lib/": {"tree": LIB_TREE, "reason": "helpers inline"},
    ODD_PATH: {"blob": "0" * 40, "local": obj_id(ODD_TEXT), "reason": "bound, under a backslash"},
    NL_PATH: {"blob": "0" * 40, "local": obj_id(ODD_TEXT), "reason": "bound, name ends in a newline"},
}})
run(r, "refresh-delta.sh")
res = run(r, "refresh-drift.sh")
expect("drift: a warning line quotes the reason cut to 60 characters (claude.prop pilot, 2026-10-15)",
       res, 0, f'refresh_kept says "{"x" * 60}...", but the record binds no local content', absent="x" * 61)
expect("drift: RE-RECORD counts and names every file record lacking a current local blob, kit files included",
       res, 0, "(or dropped): .github/scripts/check-contrast.js, .github/scripts/ui-tests/playwright.config.js")
expect("drift: ...and says how many",
       res, 0, "RE-RECORD: 2 refresh_kept file record(s) bind no current local content")
expect("drift: a record whose local blob matches, and a directory record, are not counted",
       res, 0, "RE-RECORD:", absent="app.spec.js")
expect("drift: a key holding a backslash is hashed at its real path, so a matching record is not counted (Codex, #457)",
       res, 0, "RE-RECORD: 2 ", absent="kept.js")
expect("drift: a key ending in a newline is hashed at its real path, so a matching record is not counted (Codex, #457)",
       res, 0, "RE-RECORD: 2 ", absent="nl-kept")
expect("drift: the three stale records of the drift-kept project are named up front",
       DRIFT_KEPT, 0, "RE-RECORD: 3 refresh_kept file record(s)")

# A watcher upstream retired (2026-10-16, #460) is a removal finding, never a
# project-specific file to keep: drift names it RETIRED.
r = project("drift-retired", at=S_FILES, changes={".github/workflows/pages-retry.yml": "name: Pages Deploy Retry\n"})
run(r, "refresh-delta.sh")
expect("drift: a retired watcher still installed is RETIRED, not NO-TEMPLATE (#460)",
       run(r, "refresh-drift.sh"), 0, "RETIRED: .github/workflows/pages-retry.yml — upstream deleted this watcher",
       absent="NO-TEMPLATE: .github/workflows/pages-retry.yml")
# A retired guard script would otherwise read as the project's own script and be
# kept in silence; a retired JSON input is outside every other glob (#460 step 2).
r = project("drift-retired-guard", at=S_FILES, changes={
    ".github/scripts/check-job-bounds.py": "print('old guard')\n",
    ".github/workflow-ref-required.json": "{}\n"})
run(r, "refresh-delta.sh")
res = run(r, "refresh-drift.sh")
expect("drift: a retired guard script still installed is RETIRED, not silently kept (#460)",
       res, 0, "RETIRED: .github/scripts/check-job-bounds.py — upstream deleted this guard")
expect("drift: a retired guard input file is RETIRED too (#460)",
       res, 0, "RETIRED: .github/workflow-ref-required.json — upstream deleted this guard")

r = project("drift-pin", at=S_FILES, stamp=S)
marker(r, "classified").write_text(S)
expect("drift: it reads Phase 2's pin, not main (a copy current AT the pin is not drift)",
       run(r, "refresh-drift.sh"), 0, "0 STALE, 0 CUSTOM, 0 DRIFT", absent="RE-RECORD")
r = project("drift-nostamp", at=S_FILES, stamp=None)
expect("drift: with no stamp, stale cannot be told from custom: DRIFT, with the reason",
       run(r, "refresh-drift.sh"), 0, "DRIFT: .github/workflows/sample-wf.yml (no stamp")
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

# A kit at the project root (UI_TESTS_DIR folds to `.`, e.g. `x/..`): its files
# map through refresh_kit_rel, and only names templates/ui-tests ships are the
# kit's, so a workflow beside it keeps its own template (Codex, #451).
r = project("merge-rootkit", at=S_FILES, changes={
    ".github/workflows/sample-wf.yml": "name: Sample WF\nenv:\n  UI_TESTS_DIR: x/..\n",
    "playwright.config.js": "// config\n// local\n",
    ".github/workflows/qa.yml": DRIFTED[".github/workflows/qa.yml"],
})
expect("merge: a file of a kit at the project root merges against templates/ui-tests",
       run(r, "refresh-merge.sh", "./playwright.config.js", env={"REFRESH_PIN": H}), 0,
       "LOCAL HUNKS (templates/ui-tests/playwright.config.js at the stamp")
expect("merge: ...and a workflow beside a root kit still merges against its own template",
       run(r, "refresh-merge.sh", ".github/workflows/qa.yml", env={"REFRESH_PIN": H}), 0,
       "LOCAL HUNKS (templates/workflows/qa.yml at the stamp")
ROOT_KIT = {rel[len("templates/ui-tests/"):]: text for rel, text in H_FILES.items()
            if rel.startswith("templates/ui-tests/") and not rel.endswith("package-lock.json")}
r = project("stamp-rootkit", changes={
    ".github/workflows/sample-wf.yml": H_FILES["templates/workflows/sample-wf.yml"].replace(
        "name: Sample WF\n", "name: Sample WF\nenv:\n  UI_TESTS_DIR: x/..\n", 1),
    **ROOT_KIT,
    "playwright.config.js": "// config, edited\n",
    **{".github/scripts/ui-tests/" + k: None for k in ROOT_KIT},
})
run(r, "refresh-delta.sh")
res = run(r, "refresh-stamp.sh")
expect("stamp: a kit at the project root is checked at its root paths, never as ./x",
       res, 1, "UNAPPLIED: playwright.config.js differs from templates/ui-tests/playwright.config.js",
       absent="./playwright")

# ---- item 8: the caller set is computed --------------------------------------------
r = project("callers", changes={".github/actions/ui-suite/action.yml": None,
                                ".github/actions/ui-suite/validate-report-path.py": None,
                                ".github/workflows/mine.yml": "name: Mine\n"})
res = run(r, "refresh-callers.sh", "templates/workflows/cron-notify.yml", env={"REFRESH_PIN": H})
want = "\n".join(sorted([
    "templates/workflows/qa.yml", "templates/workflows/sample-wf.yml",
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
expect("vars: a ${{ }} folded over two lines is followed to its }} (Codex, #450)",
       res, 0, "OWNER PRE-MERGE: set repository variable FOLDED_FLAG")
expect("vars: with new reads there is no OK line", res, 0, "SUMMARY: 7 new", absent="OK: no new")

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

r = project("vars-trailing-comment", at=S_FILES, workflows=LIVE,
            changes={".github/workflows/qa-live.yml": LIVE_S.replace("name: QA Live", "name: QA Live # future: ${{ vars.APP_URL }}")})
run(r, "refresh-delta.sh")
refresh_installs(r, LIVE)
expect("vars: a read only in a trailing comment of the project's file is no baseline read (Codex, #450)",
       run(r, "refresh-vars.sh"), 0, "OWNER PRE-MERGE: set repository variable APP_URL")

r = project("vars-inert-text", at=S_FILES, workflows=LIVE,
            changes={".github/workflows/qa-live.yml": LIVE_S.replace("name: QA Live", "name: QA Live (vars.APP_URL later)")
                     + "      - run: echo 'configure vars.APP_URL later'\n"})
run(r, "refresh-delta.sh")
refresh_installs(r, LIVE)
expect("vars: inert text naming a variable is no baseline read: the live one is listed (Codex, #450)",
       run(r, "refresh-vars.sh"), 0, "OWNER PRE-MERGE: set repository variable APP_URL")

# The baseline is the commit that WROTE the stamp, not the last one touching
# the sync file: a refresh_kept re-record after a local edit that added a read
# must not make that read count as run with at the stamp (claude.prop pilot,
# 2026-10-15). Here commit 2 takes qa-live.yml to the head's (APP_URL) and
# commit 3 only re-records; the read is still new against the stamp's files.
r = project("vars-rerecord", at=S_FILES, workflows=LIVE)
stamp_commit = git(r, "rev-parse", "HEAD")
refresh_installs(r, LIVE)
git(r, "commit", "-qam", "local edit: qa-live reads APP_URL")
set_kept(r, ".github/scripts/check-contrast.js", {"blob": "0" * 40, "local": "0" * 40, "reason": "re-recorded"})
git(r, "commit", "-qam", "re-record refresh_kept")
run(r, "refresh-delta.sh")
res = run(r, "refresh-vars.sh")
expect("vars: the baseline is the commit that wrote the stamp, not a later re-record (claude.prop pilot, 2026-10-15)",
       res, 0, f"baseline: project commit {stamp_commit}")
expect("vars: ...so a read added after the stamp is still listed",
       res, 0, "OWNER PRE-MERGE: set repository variable APP_URL")

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
res = run(r, "refresh-vars.sh")
# The fixture's read after a quoted `#` and its `${{` folded over two lines are
# the documented cost of a baseline kept an under-count (it drops a mid-line
# `#` onward and follows no open span): both are listed again even unchanged.
# No shipped template has either shape (checked when this was written).
expect("vars: an unchanged file lists only the two documented-cost reads",
       res, 0, "OWNER PRE-MERGE: set repository secret HASH_QUOTED", absent="APP_URL")
expect("vars: …the folded one", res, 0, "OWNER PRE-MERGE: set repository variable FOLDED_FLAG")
expect("vars: …and nothing else", res, 0, "SUMMARY: 2 new")
r = project("vars-current-plain", stamp=H)
run(r, "refresh-delta.sh")
expect("vars: reads all present at the stamp print the explicit OK line",
       run(r, "refresh-vars.sh"), 0, "OK: no new repository variables or secrets read", absent="OWNER PRE-MERGE")
run(r, "refresh-stamp.sh")
expect("vars: after the stamp consumed Phase 2's marker it refuses, never a false OK",
       run(r, "refresh-vars.sh"), 2, "no Phase 2 marker", absent="OK: no new")

# ---- the house style (#470) --------------------------------------------------
# A project MARKED as on the house style (.claude/directive-sync.json ->
# house_style: true) has styles/components.css compared verbatim and
# styles/tokens.css by token name, every run; an unmarked one compares nothing
# there. Before #470 neither script looked at styles/ at all.
RULED = TOKENS_H.replace("#F5F5F3", "#020305").replace("#106AD0", "#FFD21A")   # an owner-ruled dark palette


def house(name, tokens=TOKENS_H, comp=COMP_H, mark=True, extra=None, **kw):
    sync = {"house_style": mark} if mark is not None else {}
    return project(name, changes={"styles/tokens.css": tokens, "styles/components.css": comp, **(extra or {})},
                   sync_extra=sync, **kw)


r = house("house-current")
res = run(r, "refresh-drift.sh", env={"REFRESH_PIN": H})
expect("house drift: current files print the token line and no styles finding",
       res, 0, "TOKENS: styles/tokens.css declares all 4 house token names", absent="styles/components.css")
r = house("house-stale", comp=COMP_S)
expect("house drift: components.css as taken at the stamp is STALE",
       run(r, "refresh-drift.sh", env={"REFRESH_PIN": H}), 0, "STALE: styles/components.css")
r = house("house-custom", comp=COMP_H + ".mine { color: red; }\n")
expect("house drift: a local edit to components.css is CUSTOM",
       run(r, "refresh-drift.sh", env={"REFRESH_PIN": H}), 0, "CUSTOM: styles/components.css")
r = house("house-comp-gone", comp=None)
expect("house drift: an absent components.css is MISSING, never skipped",
       run(r, "refresh-drift.sh", env={"REFRESH_PIN": H}), 0, "MISSING: styles/components.css")
r = house("house-tokens-gone", tokens=None)
expect("house drift: an absent tokens.css is MISSING, never skipped",
       run(r, "refresh-drift.sh", env={"REFRESH_PIN": H}), 0, "MISSING: styles/tokens.css")
r = house("house-lacks", tokens=TOKENS_S.replace("}\n", "  /* --color-new: #000; */\n}\n"))
expect("house drift: a token name the head added is named, and a commented-out one does not count",
       run(r, "refresh-drift.sh", env={"REFRESH_PIN": H}), 0,
       "TOKENS: styles/tokens.css lacks 1 of 4 house token names at " + H + ": --color-new")
r = house("house-ruled", tokens=RULED)
expect("house drift: a ruled palette (other values, every name) is not a finding",
       run(r, "refresh-drift.sh", env={"REFRESH_PIN": H}), 0, "declares all 4 house token names", absent="styles/tokens.css lacks")
r = house("house-own-sheet", extra={"styles/legacy.css": ".legacy-btn { color: red; }\n"})
expect("house drift: a project's own stylesheet beside them stays silent",
       run(r, "refresh-drift.sh", env={"REFRESH_PIN": H}), 0, "TOKENS:", absent="styles/legacy.css")
r = house("house-unmarked", comp=COMP_S, mark=None)
expect("house drift: an unmarked project says so and compares nothing in styles/",
       run(r, "refresh-drift.sh", env={"REFRESH_PIN": H}), 0, "HOUSE-STYLE: not marked", absent="styles/components.css")
r = house("house-string", comp=COMP_S, mark="true")
expect("house drift: a marker that is not exactly true is not a marker",
       run(r, "refresh-drift.sh", env={"REFRESH_PIN": H}), 0, "HOUSE-STYLE: not marked", absent="STALE: styles/")

r = house("house-stamp-ok", tokens=RULED)
run(r, "refresh-delta.sh")
expect("house stamp: current components and a ruled palette with every name stamp",
       run(r, "refresh-stamp.sh"), 0, f"stamped: {H}")
r = house("house-stamp-comp", comp=COMP_S)
run(r, "refresh-delta.sh")
expect("house stamp: components.css not taken refuses",
       run(r, "refresh-stamp.sh"), 1, "UNAPPLIED: styles/components.css differs from templates/styles/components.css")
r = house("house-stamp-comp-gone", comp=None)
run(r, "refresh-delta.sh")
expect("house stamp: an absent components.css is required",
       run(r, "refresh-stamp.sh"), 1, "UNAPPLIED: styles/components.css is absent but required -- the project is on the house style")
r = house("house-stamp-tokens-gone", tokens=None)
run(r, "refresh-delta.sh")
rc, out = res = run(r, "refresh-stamp.sh")
expect("house stamp: an absent tokens.css is required", res, 1,
       "UNAPPLIED: styles/tokens.css is absent but required")
m = re.search(r"styles/tokens\.css is absent but required .*\(blob ([0-9a-f]{40})\) \(local absent\)", out)
check("house stamp: the refusal prints the blob and local absent a decline binds to", bool(m), out)
if m:
    set_kept(r, "styles/tokens.css", {"blob": m.group(1), "local": "absent", "reason": "tokens live in css/tokens.css here"})
    expect("house stamp: a decline bound to both blobs reads as KEPT and stamps",
           run(r, "refresh-stamp.sh"), 0, "KEPT: styles/tokens.css -- tokens live in css/tokens.css here")
r = house("house-stamp-lacks", tokens=TOKENS_S)
run(r, "refresh-delta.sh")
rc, out = res = run(r, "refresh-stamp.sh")
expect("house stamp: a missing token name refuses and names it", res, 1,
       "UNAPPLIED: styles/tokens.css lacks house token name(s) templates/styles/tokens.css declares at " + H + ": --color-new")
m = re.search(r"--color-new -- .*\(blob ([0-9a-f]{40})\) \(local ([0-9a-f]{40})\)", out)
if m:
    set_kept(r, "styles/tokens.css", {"blob": m.group(1), "local": m.group(2), "reason": "no field edges on this site"})
    expect("house stamp: a recorded decline of the missing name reads as KEPT",
           run(r, "refresh-stamp.sh"), 0, "KEPT: styles/tokens.css -- no field edges on this site")
    (r / "styles/tokens.css").write_text(TOKENS_S + "/* edited */\n", encoding="utf-8")
    run(r, "refresh-delta.sh")
    expect("house stamp: …and binds no longer once the file changes",
           run(r, "refresh-stamp.sh"), 1, "UNAPPLIED: styles/tokens.css lacks")
else:
    CASES.fail("house stamp: the missing-name refusal prints both blobs", out)
r = house("house-stamp-current", comp=None, stamp=H)
run(r, "refresh-delta.sh")
expect("house stamp: required every run, also when the delta lists nothing",
       run(r, "refresh-stamp.sh"), 1, "UNAPPLIED: styles/components.css is absent but required")
r = house("house-stamp-unmarked", comp=COMP_S, tokens=None, mark=False)
run(r, "refresh-delta.sh")
expect("house stamp: an unmarked project compares nothing in styles/ and says so",
       run(r, "refresh-stamp.sh"), 0, "not on the house style", absent="UNAPPLIED: styles/")

# The inventory /design-intake's existing-project move runs before and after
# its rename step: the class names a project's own stylesheets share with the
# house components.css (the fixture's head defines .btn and .field).
r = house("inv-collide", tokens=None, mark=None,
          comp=".btn { background: url(x.field); } /* .field */\n.card { color: red; }\n",
          extra={"styles/layout.css": "@media (min-width: 40.5em) { .btn { color: blue; } }\n"})
res = run(r, "house-style-inventory.sh", env={"REFRESH_PIN": H})
expect("inventory: a shared class name is a COLLISION naming every own sheet, nested @media rules included",
       res, 1, "COLLISION: .btn -- the house components.css defines it, and so do: styles/components.css, styles/layout.css")
expect("inventory: a dotted word in a value or a comment is not a class", res, 1, "SUMMARY: 1 collision(s)", absent="COLLISION: .field")
expect("inventory: with no styles/tokens.css it says so", res, 1, "TOKENS: there is no styles/tokens.css yet")
r = house("inv-clean", tokens=TOKENS_S, mark=None,
          extra={"styles/legacy.css": ".legacy-btn { color: red; } .legacy-field { color: blue; }\n"})
res = run(r, "house-style-inventory.sh", env={"REFRESH_PIN": H})
expect("inventory: after the rename, with the house file installed verbatim, no collision",
       res, 0, "SUMMARY: no collision -- 2 own stylesheet(s)")
expect("inventory: a house token name no stylesheet declares is named", res, 0,
       "TOKENS: no tracked stylesheet declares 1 of 4 house token names: --color-new")

r = house("house-merge", tokens=TOKENS_S.replace("#106AD0", "#0E7C6D"), comp=COMP_H)
res = run(r, "refresh-merge.sh", "styles/tokens.css", "--write", env={"REFRESH_PIN": H})
merged = (r / "styles/tokens.css").read_text(encoding="utf-8")
expect("house merge: tokens.css merges without conflict", res, 0, "MERGED:")
check("house merge: the new name arrives and the ruled value stays",
      "--color-new: #8C887F;" in merged and "#0E7C6D" in merged and "#106AD0" not in merged, merged)

shutil.rmtree(WORK, ignore_errors=True)
sys.exit(CASES.finish(f"{CASES.passed} refresh-script behaviours hold against a fixture upstream."))
