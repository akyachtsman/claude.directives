# Repo Map UI — what the suite covers and why

Internal. Read before changing `docs/site/logical-map.html`,
`docs/site/logical-map.js`, `.github/scripts/build-logical-map.js`, or
`.github/scripts/check-repo-map-ui.js`. `CLAUDE.md` names the job; this file
holds the reasoning, per `global.md` → *Plain Language First* (a rule states the
rule; its reasoning lives elsewhere).

The map is this repo dogfooding its own exported UI-testing standard
(`test.md` / `templates/ui-tests`) on a real interactive artifact. The suite is
a headless Chromium run in the `Repo Map UI` job of `qa.yml`.

## Interaction coverage

The map renders; no frame clips its contents; dragging a frame moves it and
dragging its corner resizes it; the layout survives a reload; every layer toggle
works **and reverses**; the legend opens; search and isolate behave; dragging the
canvas selects no text.

## Input surface

A mouse-only test never reaches most of this, which is why it is enumerated
(`test.md` → *Assert the outcome, not the mechanism*, failure shape 1):

- scroll pans on both axes without zooming
- ctrl/pinch zooms; two-finger pinch zooms on touch
- middle-drag pans over a frame
- frames are keyboard-reachable and arrow keys pan
- `fit` recentres **without discarding the reader's arranged layout**

## Visual invariants

The interaction checks kept missing these, and a human had to report them —
which is the whole argument for measuring rather than eyeballing:

- every frame states its relationships in words
- nothing is drawn at rest; selecting a frame draws only its own connections
- **no arrow crosses a frame it does not connect** — asserted on the shipped
  layout AND after frames are dragged, the case the earlier router had never
  been exercised against
- **no two arrows run alongside each other** — measured as the length of one
  line lying within 11px of another: a crossing costs a few px, a bundle costs
  its whole span
- no two edge labels overlap; labels draw above every line
- frames sitting level with each other are linked straight across rather than
  detouring through the band above

**Two arrangements a READER made are pinned as cases** — not the suite's own
scripted drags — because both defects a human reported lived only in layouts the
script never produced: neighbours offset just enough to miss the side-link
threshold, and one frame edge carrying three runs.

`arrange()` fails loudly if a test layout names a frame that does not exist: a
mistyped id is silently ignored on load and would quietly test nothing.

## The router

Ported from `claude.insurance` — its `relmap.js` and `relmap-view.js` under
js/keep: **reserve space rather than search for it**, with hop-breaks where lines
cross. Their layout computes node positions; ours lets the reader drag, so the
channels are MEASURED from the frames' own extents — the complement of the
y-intervals gives the horizontal bands, the complement of the x-intervals over a
y-range gives the vertical corridors. Ports are ordered by where each run is
heading, which is Sugiyama's crossing-minimisation step applied where a
hand-placed layout still leaves a choice.

`build-logical-map.js`'s default geometry is a GRID whose gutters line up across
rows precisely so those corridors exist.

## Why the map opens collapsed

Each frame leads with its meaning and a delivery-mix bar; its files appear on
request (search opens the frame holding a hit). A full filename list shown at
once is a reference table rather than a map.

## Retired

The physical-folders view was retired 2026-07-21; the logical map is the repo's
single map. The old design-theme parity + contrast checks were retired with the
fixed design system — design is now per-project, and the contrast guardrail
ships in `templates/scripts/` for projects to run against their own tokens.
