---
description: "Inspect, compare, or audit any public GitHub repo via gh api — no clone."
argument-hint: "<owner/repo> [inspect|compare <target>|audit]"
phase: cross-cutting
---
Generic cross-repo operator. Invoked as `/do-repo <repo> <command>`, where
`<repo>` is `owner/name` (or a bare name under `akyachtsman`) and `<command>` is
one of the verbs below. Uses `gh api` to read public repos directly — no clone,
no working-tree changes. **Read-only**: never write to, branch, or open PRs
against the target repo. If `gh api` is unavailable, fall back to the public REST
endpoints over `curl`/WebFetch (`https://api.github.com/repos/<repo>/...` and
`https://raw.githubusercontent.com/<repo>/<ref>/<path>`).

Repo-ops family note: current-repo lifecycle is `/new-repo`, `/refresh-repo`,
`/audit-repo`; THIS command is the other-repo READ adapter. The verb list below
is **closed** — unknown verb → refuse and list the supported verbs; never
improvise one.

Resolve the default branch first when a ref is needed:
```bash
ref=$(gh api "repos/<repo>" --jq '.default_branch')
```

## Commands

### inspect
List every file in the repo (full recursive tree):
```bash
gh api "repos/<repo>/git/trees/$ref?recursive=1" \
  --jq '.tree[] | select(.type=="blob") | "\(.size)\t\(.path)"'
```
Report the file list, grouped by directory, with sizes. Note anything notable
(large files, binaries, unexpected layout). To read a specific file:
```bash
gh api "repos/<repo>/contents/<path>?ref=$ref" --jq '.content' | base64 -d
```

### compare <target>
Diff the repo (or a path within it) against `<target>`, where `<target>` is
another `owner/name`, a `repo:path`, or a local file. Steps:
1. `inspect` both sides to get their file/section inventories.
2. For overlapping files, fetch both and show a content diff (pipe both through
   `git diff --no-index -- a b` on temp files).
3. Summarize: what exists only on the left, only on the right, and what differs.
Use this to confirm whether content from an old repo has been migrated into a new
one.

### audit
Run `/audit-repo`'s checklist (directive drift, errors, redundancies, logic
correctness, structural soundness) against the FETCHED tree — read-only,
findings-only, same severity grouping. That command's definition is canonical;
do not maintain a separate audit spec here. If the caller names specific
expectations (`audit <repo> expects:<a,b,c>`), additionally verify each listed
path/section exists and report which are missing.

## Output
Always end with a compact verdict: for `inspect`, the file count and tree; for
`compare`, the three-way only-left / only-right / differs summary; for `audit`,
a pass/fail list of checks. Keep it scannable. Never modify the target repo.


> The closing format above ends the BODY. The status line required by
> `global.md` → *Status Line on Every Stop* still follows it as the message's
> final line.
