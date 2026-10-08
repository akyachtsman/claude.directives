---
description: "Inspect, compare, or audit any public GitHub repo over raw URLs and git — read-only, no checkout."
argument-hint: "<owner/repo> [inspect|compare <target>|audit]"
phase: cross-cutting
---
Generic cross-repo operator. Invoked as `/do-repo <repo> <command>`, where
`<repo>` is `owner/name` (or a bare name under `akyachtsman`) and `<command>` is
one of the verbs below. **Read-only**: never write to, branch, or open PRs
against the target repo, and never touch this session's working tree or `.git`.

**Transport: raw URLs for files, git for refs and listings — never the API.** A
web session's proxy refuses `api.github.com` (and so `gh api`) and the codeload
tarball for any repo the session was not opened on, which is every repo this
command exists for (verified 2026-10-08: 403, "GitHub access to this repository
is not enabled for this session"; WebFetch is refused too).
`raw.githubusercontent.com` and git transport serve any public repo with no auth
and no quota. For a listing, a **blob-less shallow clone into a scratch
directory** fetches the tree and no file contents; `--no-checkout` leaves
nothing on disk but the scratch `.git`, which is deleted after.

Shell state does not carry between separately-run blocks, so each block below
sets everything it uses. Set `repo=` (and `path=` where named) at its top.

Repo-ops family note: current-repo lifecycle is `/new-repo`, `/refresh-repo`,
`/audit-repo`; THIS command is the other-repo READ adapter. The verb list below
is **closed** — unknown verb → refuse and list the supported verbs; never
improvise one.

## Commands

### inspect
List every file in the repo (full recursive tree), with sizes, at the default
branch's head:
```bash
repo="<owner/name>"
src="https://github.com/$repo.git"
# The default branch, from the remote's own HEAD symref. `|| ref=`: under
# `-e -o pipefail` a failed ls-remote would otherwise end the block unreported.
ref=$(git ls-remote --symref "$src" HEAD | sed -n 's#^ref: refs/heads/\(.*\)\tHEAD$#\1#p') || ref=
# An EMPTY $objs must stop everything: `git -C ""` runs against THIS session's repo.
objs=$(mktemp -d) || objs=
if [ -n "$ref" ] && [ -n "$objs" ] \
   && git clone -q --depth 1 --filter=blob:none --no-checkout --branch "$ref" "$src" "$objs"; then
  echo "TREE $repo@$ref $(git -C "$objs" rev-parse HEAD)"
  # Names only: `--filter=blob:none` fetched no contents, and `ls-tree -l`
  # would fetch every blob back, one request each, just to size it.
  git -C "$objs" ls-tree -r --name-only HEAD
else
  echo "CANNOT READ $repo: default branch or tree not fetched — report it, never an empty repo"
fi
if [ -n "$objs" ]; then rm -rf "$objs"; fi
```
Report the file list, grouped by directory, with the count. Sizes are not in a
blob-less listing; where they matter (large files, binaries), read the few
candidates by raw URL and report their byte counts. To read a specific file:
```bash
repo="<owner/name>"; path="<path>"
ref=$(git ls-remote --symref "https://github.com/$repo.git" HEAD \
      | sed -n 's#^ref: refs/heads/\(.*\)\tHEAD$#\1#p') || ref=
[ -n "$ref" ] && curl -fsSL "https://raw.githubusercontent.com/$repo/$ref/$path" \
  || echo "CANNOT READ $repo:$path — not fetched, which is not the same as absent"
```

### compare <target>
Diff the repo (or a path within it) against `<target>`, where `<target>` is
another `owner/name`, a `repo:path`, or a local file. Steps:
1. `inspect` both sides to get their file/section inventories.
2. For overlapping files, fetch both by raw URL into temp files and show a
   content diff (`git diff --no-index -- a b` on the temp files).
3. Summarize: what exists only on the left, only on the right, and what differs.
Use this to confirm whether content from an old repo has been migrated into a new
one.

### audit
Run `/audit-repo`'s checklist (directive drift, errors, redundancies, logic
correctness, structural soundness) against the FETCHED tree — read-only,
findings-only, same severity grouping. That command's definition is canonical;
do not maintain a separate audit spec here. For an audit that reads many files,
clone without `--filter=blob:none` (still `--depth 1 --no-checkout`, into a
scratch directory) and read each with `git -C "$objs" show HEAD:<path>`, rather
than one raw request per file. If the caller names specific
expectations (`audit <repo> expects:<a,b,c>`), additionally verify each listed
path/section exists and report which are missing.

## Output
Always end with a compact verdict: for `inspect`, the file count and tree; for
`compare`, the three-way only-left / only-right / differs summary; for `audit`,
a pass/fail list of checks. Keep it scannable. A fetch that failed is reported
as CANNOT READ, never as a missing file. Never modify the target repo.

The message still ends with the status line (`global.md` → *Status Line on Every Stop*).
