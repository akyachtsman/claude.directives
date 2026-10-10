# Repo Map — how it is built and what the suite covers

Internal. Read before changing `docs/site/logical-map.html`,
`docs/site/logical-map.js`, `.github/scripts/build-logical-map.js`, or
`.github/scripts/check-repo-map-ui.js`. `CLAUDE.md` names the job; this file
holds the reasoning, per `global.md` → *Plain Language First* (a rule states the
rule; its reasoning lives elsewhere).

## What the map is (owner ruling, 2026-10-05)

A **lifecycle flow**, start to finish: *Publish → Bootstrap → Session start →
Build → PR & review → Merge & deploy → Upkeep*, with the vendors we delegate to
as a last column. Every exported file sits in exactly one stage, where it first
acts. The arrows between files are the connections that DO something: copies,
installs, imports, runs, triggers, governs, hands off, fills in, plus the guides
that explain and the vendor sockets that delegate. They are drawn at rest.

It replaced the class view (8 boxes for the durability classes, 10 class-level
arrows, nothing drawn until a box was clicked). The owner asked for the map to be
"redone and all the connections wired from the start to finish", and chose this
shape and **derived + checked** wiring over a hand-kept list.

## The evidence rule

A connection is drawn only if the files say so. Each declared connection names
which end carries the reference (`a` by default, `b` where the flow runs opposite
to it: a checker names what it checks, an installer names its source), and the
build looks for one of the other file's NAMES in that file's text: its path, its
basename (only when unique and not generic), `/command`, an agent's
`directives-toolkit:` name, a skill name, `actions/<x>`, a workflow's `name:`,
or an alias listed in the generator. The first matching line is stored (its
file and text, not its number, so an edit above it does not make the map stale)
and shown in the page's side panel, so every arrow can be audited from the page. A
line longer than 180 characters is cut around the quote, or the name it affirms,
never to its first 180 (Codex #393: a hook command ended before either). Code is
preferred to comments (a comment can describe a connection the code no longer
makes), and a **negated** mention never counts: "Do NOT copy `keepalive.yml`"
names the file and says the opposite (Codex, #393). A negation before the name in
the same clause disqualifies it; one after it ("delete X; do not bypass") does
not. Declare the evidence on the side that actually performs the connection — the
workflow that runs a checker, not the checker's own comment about it. Where the
first mention in a file is contrastive and the instruction comes later, give the
connection a **quote**: the evidence line must then carry that phrase too.

**Every ACTIVE connection must carry a quote** (owner ruling, 2026-10-05, after
three Codex rounds on #393 each found more first-mention evidence). Active kinds
claim something happens: publishes, copies, adds when needed, installs, hands off, runs, fills in,
checks, retires, re-syncs. The quote is a phrase from the instruction that makes
it happen. The build looks for it on the same line as the file's name first, and
only then anywhere in the same paragraph (the run of non-blank lines), so a
wrapped sentence, a "copy these…" list, or a rule that names the file before it
says "run it when…" still counts. Because a paragraph can hold more than one
instruction, a quote must be SPECIFIC to the one that performs the connection. Delete or reword that instruction and the build fails. Passive
kinds (governs, details in, imports, explains) are relationships of mention, so
the mention is their evidence. To choose a quote, run
`node .github/scripts/build-logical-map.js --candidates`: it lists every line in
the source that names the other end.

What evidence still cannot prove is the KIND. That is a claim, and it is
reviewed: on 2026-10-05 an independent reviewer read all 122 declared
connections against their sources and flagged 12 (passive or contrastive
mentions recorded as hand-offs, copies or rules). Each was corrected or removed
in #393. After Codex round 8 found the same shape again, a second independent read
of all 122 (owner ruling: audit before the next round) flagged 14 of two shapes:
a file named only in passing (an index entry drawn as "requires", one member of a
set drawn without the rest), and the wrong actor (an arrow drawn "is run by" from
the thing run). Re-run that read when many connections change at once.

**The arrow starts at the actor.** A workflow runs the kit; the kit is never drawn
"is run by" the workflow, because the legend reads every arrow as source acts on
target. A file is placed where it first acts, so a check that acts later than the
thing it checks cannot be drawn forward: the rule that requires the check carries
that link instead (`design.md` → `check-contrast.js`). A **set** is drawn whole —
the directives Phase 0 re-reads, the workflows a project must carry, the files a
guide sets up, everything the plugin installs — or not at all. A set nothing
lists (the plugin's commands, agents, skills and hooks, loaded from its root by
convention) is derived from the tree rather than drawn from whichever file
happens to name a few members (Codex round 9, #393).

What evidence proves: the source file names the target. It does not prove the
connection's KIND (copies vs governs). That is the declaration's job, and a
reviewer's.

Eight families are **derived**, never declared, so none can be forgotten: a
workflow's `uses: ./.github/actions/<x>`, a `workflow_run` watcher and the
workflow it watches, every shipped script a workflow or composite action runs
(`node` / `python3` / `bash` / `sh` followed by its path — hand-declaring these
missed two of qa.yml's four, Codex #393), every shipped `package.json` a step
installs (`npm install` / `npm ci` in its working directory, in a workflow or a
composite action, whose `${{ inputs.x }}` is resolved through every workflow
that passes it — hand-declared, it was drawn from the script that needs the
package instead, Codex #393), the scripts the plugin's hooks run, everything the
plugin installs (every box under its root — an allow-list of four directories
left `scripts/` out, Codex #393), everything `/refresh-repo` re-syncs (read from
its Phase 2 path table, every row not marked "Never overwrite", minus retired
files), and
every vendor socket in `EXPORTS.json` → `externals`. Declaring one of these by hand fails the build.

The manifest and the map files themselves are never evidence: they name every
file.

## Start to finish

Every box must be reachable from the first stage by following arrows. Reachable
is not enough for a **copied** template: it must arrive by a *copies* arrow (or
be *retired*), because a later *runs* arrow can reach a file while the map never
shows how it enters a project (Codex, #393: the composite actions and the notify
scripts). The fill-in artifacts are exempt; a project reads them from upstream
when it needs one. A file
nothing leads to is a file the map cannot explain the existence of, and the build
names it. Only the **re-sync** kind may point backwards (upkeep → session), or
stay in its own column; the trace does not follow it, or every file would be
upstream of every other.

Vendor arrows are the sockets `EXPORTS.json` lists, so their completeness is the
manifest's: a file that invokes, enables or configures a vendor is its socket
(Codex #393 found `/sdd-loop`, `/audit-repo` and `git.md` invoking the review
providers unlisted). A file that only mentions a vendor in passing is not. Several sockets in one box
(a directory or a group) make one arrow whose evidence lists them all.

## Layout

Computed by the generator, not the browser, so the page is right before any
script runs and the geometry can be checked at build time. Columns are stages.
Within a column, boxes are ordered by repeated barycenter sweeps (Sugiyama's
crossing-reduction step with the layers fixed). A connection that skips columns
reserves a thin slot in each column it crosses, so it passes through a gap, never
through a box. Same-column links and the re-sync loop travel in the gutters,
which hold no boxes.

**Boxes cannot be dragged.** The previous map let readers move and resize its
frames, and two of its worst routing defects lived only in layouts a reader had
made, which no fixed test could reach. A computed layout is one layout, and both
the build and the suite prove it.

## What the suite asserts

Run in the `Repo Map UI` job of `qa.yml` against the rendered page:

- every box and every connection in the data is rendered, in its stage column
- every connection is visibly drawn at rest
- **no connection crosses a box it does not connect**, measured on the rendered
  SVG path, and no two boxes overlap — the generator checks the same thing on
  its own numbers; this proves what the browser actually drew
- the trace for **every** box equals an independent walk of the same data
- panel links move the trace; Escape and a second click clear it
- search marks matches, and Enter traces the first and brings it into view
- every toggle (exports only, hide vendors, each kind in the legend) hides and
  **reverses**
- input surface: scroll pans on both axes without zooming, ctrl/pinch zooms, the
  zoom buttons, fit, canvas drag pans without selecting text, a drag that starts
  on a box pans without selecting it, middle-drag, arrow keys, Tab + Enter on a
  box, two-finger touch pinch, two-finger drag, one-finger touch pan; search finds a
  file inside a group box
- at phone width the page does not scroll sideways, the panel stays on screen, and a
  search result is revealed above the bottom-sheet panel, not behind it
- no console or page errors

Each assertion was proven able to fail before shipping (2026-10-05): a trace that
follows the re-sync loop, connections hidden at rest, and a box moved into a
gutter all turn the suite red. A harmless attribute change does not.

## Retired

The class view with draggable frames and its routed edges (2026-10-05). The
physical-folders view (2026-07-21). The old design-theme parity and contrast
checks went with the fixed design system; the contrast guardrail ships in
`templates/scripts/` for projects to run against their own tokens.
