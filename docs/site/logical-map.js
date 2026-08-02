/* Interactive engine for the logical map (docs/site/logical-map.html).
   The HTML around it — frames, chips, legend — is GENERATED from EXPORTS.json by
   .github/scripts/build-logical-map.js, which also inlines the layout and edge
   config as #mapdata. This file is hand-written and is the only place behaviour
   lives: pan, zoom, search, isolate, layer toggles, and drag-to-move /
   drag-to-resize with per-browser persistence.

   Coordinate model: every frame is absolutely positioned in *canvas* space inside
   #viewport, which carries a single `translate(px,py) scale(s)` transform. Edges
   are drawn in that same space, so nothing needs re-projecting on zoom. */
(() => {
  const D = JSON.parse(document.getElementById('mapdata').textContent);
  const wrap = document.getElementById('wrap');
  const vp = document.getElementById('viewport');
  const svg = document.getElementById('edges');
  const frames = [...document.querySelectorAll('.fr')];
  const byId = Object.fromEntries(frames.map(f => [f.dataset.id, f]));
  const STORE = 'logical-map.layout.v2';

  /* ---------------- layout persistence ---------------- */
  const geom = {};                       // id -> {x,y,w,h} in canvas space
  for (const f of frames) {
    geom[f.dataset.id] = {
      x: +f.dataset.x, y: +f.dataset.y, w: +f.dataset.w, h: +f.dataset.h,
    };
  }
  const declared = structuredClone(geom);   // the generator's starting geometry

  const load = () => {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { saved = null; }
    if (!saved) return false;
    let used = false;
    for (const [id, g] of Object.entries(saved)) {
      if (!geom[id]) continue;                       // frame retired since save
      for (const k of ['x', 'y', 'w', 'h']) {
        if (typeof g[k] === 'number' && isFinite(g[k])) { geom[id][k] = g[k]; used = true; }
      }
    }
    return used;
  };
  const save = () => {
    try { localStorage.setItem(STORE, JSON.stringify(geom)); } catch { /* private mode */ }
  };
  const apply = id => {
    const g = geom[id], el = byId[id];
    el.style.left = g.x + 'px'; el.style.top = g.y + 'px';
    el.style.width = g.w + 'px'; el.style.height = g.h + 'px';
  };
  const applyAll = () => { for (const id in geom) apply(id); };

  // Grow every frame to fit its own content, then push the rows below it down.
  // The generator cannot measure text, and hard-coded heights would silently
  // clip files the day EXPORTS.json grows — so the browser settles it instead.
  // Only runs when the reader has no saved layout of their own.
  // `from` picks which geometry defines the rows: the generator's on first load,
  // the reader's current one after a frame is expanded or collapsed.
  function autofit(from = declared) {
    const rows = new Map();
    for (const f of frames) {
      const y = from[f.dataset.id].y;
      const key = [...rows.keys()].find(k => Math.abs(k - y) < 40);
      if (key == null) rows.set(y, [f.dataset.id]);
      else rows.get(key).push(f.dataset.id);
    }
    let shift = 0;
    for (const y of [...rows.keys()].sort((a, b) => a - b)) {
      const row = rows.get(y);
      let need = 0;
      for (const id of row) {
        geom[id].y = y + shift;
        byId[id].style.height = 'auto';
        // offsetHeight, not scrollHeight: these are border-box frames, and
        // scrollHeight omits the borders — which is exactly a 4px clip.
        need = Math.max(need, byId[id].offsetHeight, from === declared ? declared[id].h : 0);
      }
      // Each frame keeps its OWN height — equalising a row leaves dead space
      // under whichever frame has the least content. Only the row's tallest
      // frame decides how far the rows below it move.
      for (const id of row) {
        geom[id].h = Math.max(byId[id].offsetHeight, from === declared ? declared[id].h : 0);
        apply(id);
      }
      shift += need - Math.max(...row.map(id => from[id].h));
    }
  }

  /* ---------------- edges: reserved-channel routing ---------------- */
  // The technique is claude.insurance's — js/keep/logic/relmap.js (orchestrate)
  // and js/keep/views/relmap-view.js (relOrtho, relHopPath): do not SEARCH for
  // space to route through, RESERVE it, and keep every run axis-aligned so it
  // either lies in reserved space or is a short approach to a frame's own edge.
  //
  // Their layout COMPUTES node positions, so the reserved space falls out of the
  // layer/column grid for free. Ours lets the reader drag frames anywhere, so
  // the channels are MEASURED instead of assumed:
  //   • merge every frame's y-interval — the complement is the set of horizontal
  //     BANDS that provably cross no frame at any x;
  //   • merge the x-intervals of just the frames spanning a given y-range — the
  //     complement is the set of vertical CORRIDORS through it.
  // Every route is then `frame edge → band → corridor → band → frame edge`, so
  // no segment can pass behind a frame — structurally, not by obstacle testing.
  //
  // Routes are still verified against every frame afterwards and a blocked
  // candidate falls through to the next corridor, because a reader is free to
  // stack two frames on top of each other and leave no free space at all.
  //
  // The default layout in build-logical-map.js is built to give this router real
  // corridors: frames are laid out on a grid whose gutters line up across rows,
  // so a long edge has an empty column to run down instead of the outer margin.
  const PAD = 10;                 // clearance kept around every frame
  const LANE = 26;                // spacing between parallel runs sharing a channel
  const SEP = 26;                 // clearance needed before two runs may share a lane
  const HOP = 6;                  // half-width of the break where lines cross

  const liveIds = () => frames.filter(f => !f.classList.contains('gone'))
    .map(f => f.dataset.id);

  // Complement of a set of intervals — the free space — plus a margin lane at
  // each end, so an edge always has somewhere to go around the outside.
  function gapsOf(intervals, margin) {
    const merged = [];
    for (const [s, e] of intervals.slice().sort((p, q) => p[0] - q[0])) {
      const last = merged[merged.length - 1];
      if (last && s <= last[1]) last[1] = Math.max(last[1], e);
      else merged.push([s, e]);
    }
    if (!merged.length) return [];
    const out = [[merged[0][0] - margin, merged[0][0]]];
    for (let i = 0; i < merged.length - 1; i++) out.push([merged[i][1], merged[i + 1][0]]);
    out.push([merged[merged.length - 1][1], merged[merged.length - 1][1] + margin]);
    return out.filter(z => z[1] - z[0] > 6);
  }

  // Bands are computed over the x-window the route will actually occupy, not the
  // whole canvas. A frame parked far off to one side still spans its y-interval,
  // and merging it in globally could close the only gap between two frames that
  // are nowhere near it — leaving the route no choice but a long trip around the
  // outside. Nothing is weakened by this: bands only PROPOSE routes, and every
  // route is still tested against every frame on the canvas.
  const bandsIn = (ids, x0, x1) => gapsOf(
    ids.filter(id => geom[id].x + geom[id].w + PAD > x0 && geom[id].x - PAD < x1)
       .map(id => [geom[id].y - PAD, geom[id].y + geom[id].h + PAD]), 140);

  const corridorsOf = (ids, y0, y1) => {
    const hit = ids.filter(id => geom[id].y + geom[id].h + PAD > y0 && geom[id].y - PAD < y1);
    return hit.length
      ? gapsOf(hit.map(id => [geom[id].x - PAD, geom[id].x + geom[id].w + PAD]), 170)
      : null;
  };

  // A lane inside a channel: `n` lanes share it, this is the i-th, and none of
  // them may leave it (relmap-view's channelOf).
  const laneIn = (z, fan) => {
    const mid = (z[0] + z[1]) / 2;
    if (!fan || fan.n < 2) return mid;
    const step = Math.min(LANE, (z[1] - z[0] - 16) / fan.n);
    return Math.min(z[1] - 6, Math.max(z[0] + 6, mid + (fan.i - (fan.n - 1) / 2) * step));
  };

  // Greedy interval colouring: two runs may share a lane when their extents do
  // not overlap, so a band only ever holds as many lanes as it genuinely needs.
  // Six runs stacked 15px apart read as one thick smear even when not one of
  // them touches a frame — which is exactly what the map looked like before.
  function lanesOf(items) {
    const ends = [];                                   // ends[k] = lane k's last extent
    const of = new Map();
    for (const it of items.slice().sort((p, q) => p.s[0] - q.s[0])) {
      let k = ends.findIndex(e => e <= it.s[0] - SEP);
      if (k < 0) { k = ends.length; ends.push(-Infinity); }
      ends[k] = Math.max(ends[k], it.s[1]);
      of.set(it.i, k);
    }
    return { of, n: Math.max(1, ends.length) };
  }
  // Where a run attaches to a frame's edge: runs leaving the same side are
  // spread across its width rather than stacked on its centre.
  const port = (g, fan) => {
    const t = fan && fan.n > 1 ? (fan.i + 1) / (fan.n + 1) : 0.5;
    return Math.min(g.x + g.w - 18, Math.max(g.x + 18, g.x + g.w * t));
  };
  // The same, down a frame's left or right edge.
  const portY = (g, fan) => {
    const t = fan && fan.n > 1 ? (fan.i + 1) / (fan.n + 1) : 0.5;
    return Math.min(g.y + g.h - 16, Math.max(g.y + 16, g.y + g.h * t));
  };

  // Exact, because every segment is axis-aligned: it is a rectangle overlap.
  // The half-pixel inset is what stops a run that starts ON a frame's edge from
  // counting as passing through it.
  const hitsAny = (p, q, ids) => ids.some(id => {
    const g = geom[id];
    return Math.max(p.x, q.x) > g.x + 0.5 && Math.min(p.x, q.x) < g.x + g.w - 0.5
        && Math.max(p.y, q.y) > g.y + 0.5 && Math.min(p.y, q.y) < g.y + g.h - 0.5;
  });
  const blocked = (pts, ids) => {
    let n = 0;
    for (let i = 0; i < pts.length - 1; i++) if (hitsAny(pts[i], pts[i + 1], ids)) n++;
    return n;
  };
  // Drop repeated points AND interior points that bend nothing — a "corner"
  // between two collinear runs still gets drawn as a rounded corner, which on a
  // snapped route reads as a kink in a straight line.
  function simplify(pts) {
    const out = [];
    for (const p of pts) {
      const q = out[out.length - 1];
      if (q && Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5) continue;
      out.push(p);
    }
    for (let i = out.length - 2; i > 0; i--) {
      const [u, p, v] = [out[i - 1], out[i], out[i + 1]];
      if ((Math.abs(u.x - p.x) < 0.5 && Math.abs(p.x - v.x) < 0.5)
       || (Math.abs(u.y - p.y) < 0.5 && Math.abs(p.y - v.y) < 0.5)) out.splice(i, 1);
    }
    return out;
  }

  // Where a run may attach when its assigned port is unusable. The preferred
  // port comes first; the rest are a spread across the edge, because two edges
  // whose ports are both blocked used to fall back on the SAME alternative and
  // were then drawn one on top of the other for their whole length.
  const ALT = [0.5, 0.28, 0.72, 0.15, 0.85, 0.39, 0.61, 0.22, 0.78, 0.08, 0.92];
  const altX = g => ALT.map(t => g.x + 18 + (g.w - 36) * t);
  const altY = g => ALT.map(t => g.y + 16 + (g.h - 32) * t);
  const ALONG = 15;   // two parallel runs closer than this read as one line

  // How much of this route would be drawn on top of the routes already laid:
  // shared attachment points, plus the length of every run lying alongside one
  // of theirs. Lane assignment separates runs that share a CHANNEL, but two
  // edges can reach the same place through different channels and still come
  // out collinear — which is drawn as one line with an arrowhead at each end.
  // Measuring the drawn result catches that however it arose.
  function overlap(pts, ida, idb, taken) {
    if (!taken) return 0;
    let n = 0;
    for (const [id, p] of [[ida, pts[0]], [idb, pts[pts.length - 1]]]) {
      if ((taken.ports.get(id) ?? []).some(q =>
        Math.abs(p.x - q.x) < 14 && Math.abs(p.y - q.y) < 14)) n += 30;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const flat = Math.abs(p.y - q.y) < 0.5;
      for (const [u, v] of taken.wires) {
        if ((Math.abs(u.y - v.y) < 0.5) !== flat) continue;         // not parallel
        const k = flat ? 'y' : 'x', j = flat ? 'x' : 'y';
        if (Math.abs(p[k] - u[k]) >= ALONG) continue;
        n += Math.max(0, Math.min(Math.max(p[j], q[j]), Math.max(u[j], v[j]))
                       - Math.max(Math.min(p[j], q[j]), Math.min(u[j], v[j])));
      }
    }
    return n;
  }

  // `fan` is null on the probe pass (which only discovers WHICH channels the
  // edge wants) and carries a {i,n} per channel on the draw pass. `taken` holds
  // the attachment points of the edges already routed this pass.
  function planEdge(ida, idb, fan, taken) {
    const ids = liveIds();
    const a = geom[ida], b = geom[idb];
    if (!a || !b) return null;
    const bs = bandsIn(ids, Math.min(a.x, b.x) - 40, Math.max(a.x + a.w, b.x + b.w) + 40);
    if (!bs.length) return null;

    // Frames standing beside each other are linked through their FACING edges —
    // the whole band machinery below is for frames stacked ABOVE one another,
    // and applying it sideways sends the line up into whichever band happens to
    // be nearest. When the two are only slightly offset that band belongs to a
    // third frame, which is how a sibling link ended up running the whole way
    // round `standards` to reach the box immediately to its right.
    //
    // Dead level → one straight run. Offset → step through the free column in
    // the gap between them, which is the same reserved-channel idea rotated 90°.
    // Every candidate route is offered here and scored the same way: frame
    // crossings plus shared attachment points. The first that scores zero wins;
    // if a reader's arrangement admits nothing clean, the least-bad one is drawn.
    // Crossing a frame is far worse than being drawn over another line — it
    // hides content the map exists to show, where an overlap is only ugly — so
    // it is weighted heavily. Scored equally, the router happily drove a line
    // through three frames to keep one lane to itself.
    let best = null;
    const offer = o => {
      const cost = o.n * 4000 + overlap(o.pts, ida, idb, taken);
      if (!best || cost < best.cost) best = { ...o, cost };
      return cost === 0;
    };

    const over = [Math.max(a.y, b.y), Math.min(a.y + a.h, b.y + b.h)];
    const toRight = b.x >= a.x + a.w + 30, toLeft = a.x >= b.x + b.w + 30;
    if (toRight || toLeft) {
      // Height on each facing edge comes from that edge's PORT group, which
      // holds every run touching it in either direction. Taking the middle of
      // this pair's own vertical overlap instead ignored the other runs on the
      // same edge, so two side links were drawn one on top of the other — one
      // apparent line with an arrowhead at each end. The two collapse to a
      // single straight run only when nothing else touches either edge.
      const alone = (!fan?.ax || fan.ax.n < 2) && (!fan?.bx || fan.bx.n < 2);
      const exitX = toRight ? a.x + a.w : a.x;
      const enterX = toRight ? b.x : b.x + b.w;
      const lo = Math.min(exitX, enterX), hi = Math.max(exitX, enterX);
      const ays = [portY(a, fan?.ax), ...altY(a)];
      const bys = [portY(b, fan?.bx), ...altY(b)];
      for (const yA0 of ays) for (const yB0 of bys) {
        const level = alone && over[1] - over[0] > 50 && Math.abs(yA0 - yB0) < 60;
        const yA = level
          ? Math.min(over[1] - 10, Math.max(over[0] + 10, (yA0 + yB0) / 2)) : yA0;
        const yB = level ? yA : yB0;
        // Only a column in the gap BETWEEN them is a shortcut; anything else is
        // the long way round, which the band router below already covers.
        const cols = (corridorsOf(ids, Math.min(yA, yB), Math.max(yA, yB)) ?? [])
          .filter(z => z[1] > lo && z[0] < hi)
          .sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]));
        for (const c of (level ? [null, ...cols] : cols)) {
          const cx = c ? Math.min(hi - 6, Math.max(lo + 6, laneIn(c, fan?.cx))) : null;
          const pts = simplify(cx == null
            ? [{ x: exitX, y: yA }, { x: enterX, y: yB }]
            : [{ x: exitX, y: yA }, { x: cx, y: yA }, { x: cx, y: yB }, { x: enterX, y: yB }]);
          const done = offer({ pts, n: blocked(pts, ids),
            keyA: `s${over.join(':')}`, keyB: `s${over.join(':')}`,
            keyC: c ? c.join(':') : null,
            exitSide: toRight ? 'R' : 'L', enterSide: toRight ? 'L' : 'R',
            spanA: [lo, hi], spanB: null,
            spanC: c ? [Math.min(yA, yB), Math.max(yA, yB)] : null,
            headA: b.y + b.h / 2, headB: a.y + a.h / 2 });
          if (done) return best;
        }
      }
      // Nothing clean between the facing edges — fall through to the band
      // router, but keep the best side route as the candidate to beat.
    }

    // Which band each end uses is a SEARCH, not a deduction. Taking the band
    // adjacent to each frame is right for a tidy grid, but two frames the reader
    // has left overlapping vertically share one merged block and have no band
    // between them at all — the single candidate then routed all the way round
    // below everything and came back up through whatever stood in the way.
    //
    // Rank every pair of bands by the vertical distance the route would travel,
    // which automatically prefers a band lying BETWEEN the two frames over one
    // beyond either of them, then take the first pair that routes clean.
    //
    // Which side a run leaves and arrives on follows from the band it uses, not
    // from which frame sits lower. When two frames in a row have unequal heights
    // the two disagree, and taking the row's answer sent the line in through the
    // target's far side — i.e. straight down through the target.
    const exitOn = z => (z[0] >= a.y + a.h - 1 ? a.y + a.h : a.y);
    const enterOn = z => (z[0] >= b.y + b.h - 1 ? b.y + b.h : b.y);
    const midOf = z => (z[0] + z[1]) / 2;
    // `nudge` offers the run one lane either side of where the colouring put it.
    // Lanes are assigned per channel, but a side link's approach to a frame edge
    // lands in a band too without being part of that band's pool — the two then
    // came out 8px apart, which is drawn as one line. Rather than merge the
    // pools, let the search move off the assigned lane when it must.
    const pairs = [];
    for (const zA of bs) for (const zB of bs) {
      const base = Math.abs(exitOn(zA) - midOf(zA))
        + Math.abs(midOf(zA) - midOf(zB)) + Math.abs(midOf(zB) - enterOn(zB));
      for (const nudge of [0, 1, -1]) pairs.push({ zA, zB, nudge, cost: base + Math.abs(nudge) });
    }
    pairs.sort((p, q) => p.cost - q.cost);
    const inBand = (z, y) => Math.min(z[1] - 6, Math.max(z[0] + 6, y));

    // A port that lands within a few px of the column it is about to join makes
    // a visible 2px zigzag rather than a straight run. Snap it, but only onto a
    // column that is still on the frame's own edge.
    const snap = (v, to, g) => (Math.abs(v - to) < 12
      && to > g.x + 12 && to < g.x + g.w - 12) ? to : v;

    for (const { zA, zB, nudge } of pairs.slice(0, 24)) {
      const same = zA === zB;
      const exitY = exitOn(zA), enterY = enterOn(zB);
      const yA = inBand(zA, laneIn(zA, fan?.yA) + nudge * LANE);
      const yB = same ? yA : inBand(zB, laneIn(zB, fan?.yB) + nudge * LANE);
      const axs = [port(a, fan?.ax), ...altX(a)];
      const bxs = [port(b, fan?.bx), ...altX(b)];
      const mid = (axs[0] + bxs[0]) / 2;

      let cands = [null];
      if (!same) {
        const cs = corridorsOf(ids, Math.min(yA, yB), Math.max(yA, yB));
        if (cs && cs.length) {
          cands = cs.slice().sort((p, q) =>
            Math.abs(midOf(p) - mid) - Math.abs(midOf(q) - mid));
        }
      }

      for (const c of cands) {
        const cx = c ? laneIn(c, fan?.cx) : mid;
        for (const ax0 of axs) for (const bx0 of bxs) {
          const ax = same ? ax0 : snap(ax0, cx, a);
          const bx = same ? snap(bx0, ax0, b) : snap(bx0, cx, b);
          const pts = simplify(same
            ? [{ x: ax, y: exitY }, { x: ax, y: yA }, { x: bx, y: yA }, { x: bx, y: enterY }]
            : [{ x: ax, y: exitY }, { x: ax, y: yA }, { x: cx, y: yA },
               { x: cx, y: yB }, { x: bx, y: yB }, { x: bx, y: enterY }]);
          const far = same ? bx : cx;
          const done = offer({ pts, n: blocked(pts, ids),
            keyA: zA.join(':'), keyB: zB.join(':'), keyC: c ? c.join(':') : null,
            exitSide: exitY <= a.y + 1 ? 'T' : 'B',
            enterSide: enterY <= b.y + 1 ? 'T' : 'B',
            // extents the lane assignment needs: how far each run reaches
            spanA: [Math.min(ax, far), Math.max(ax, far)],
            spanB: same ? null : [Math.min(cx, bx), Math.max(cx, bx)],
            spanC: same ? null : [Math.min(yA, yB), Math.max(yA, yB)],
            headA: same ? (b.x + b.w / 2) : cx,
            headB: same ? (a.x + a.w / 2) : cx });
          if (done) return best;
        }
      }
    }
    return best;
  }

  // Where two lines genuinely must cross, break the crossed one so it reads as a
  // crossing and not a join — the circuit-diagram convention, from relHopPath.
  function hopPath(pts, crossers) {
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const horizontalRun = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
      if (!horizontalRun) { d += ` L ${b.x} ${b.y}`; continue; }
      const dir = Math.sign(b.x - a.x) || 1;
      const cuts = crossers
        .filter(v => v.c > Math.min(a.x, b.x) + 2 && v.c < Math.max(a.x, b.x) - 2
                  && a.y > v.s0 + 1 && a.y < v.s1 - 1)
        .map(v => v.c)
        .sort((x, y) => dir * (x - y));
      for (const c of cuts) d += ` L ${c - dir * HOP} ${a.y} M ${c + dir * HOP} ${a.y}`;
      d += ` L ${b.x} ${b.y}`;
    }
    return d;
  }

  // A label is part of its line, so it has to clear everything the line clears:
  // the frames, the labels already placed, and the OTHER lines. It prefers the
  // longest horizontal run, which by construction lies in a band.
  //
  // A run shorter than its own label cannot carry it — the side-to-side links
  // are 90px wide and "sequences" is 60px, so sitting it on the line put it over
  // both frames and the arrowhead. Those get the label set BESIDE the run.
  function placeLabel(pts, all, halfW, taken = [], wires = []) {
    const box = c => ({ x0: c.x - halfW - 3, x1: c.x + halfW + 3, y0: c.y - 11, y1: c.y + 11 });
    const clearFrames = c => { const b = box(c);
      return !all.some(g => b.x1 > g.x - 2 && b.x0 < g.x + g.w + 2
                         && b.y1 > g.y - 2 && b.y0 < g.y + g.h + 2); };
    const clearLabels = c => !taken.some(t =>
      Math.abs(t.y - c.y) < 20 && Math.abs(t.x - c.x) < t.w / 2 + halfW + 8);
    const clearWires = c => { const b = box(c);
      return !wires.some(s => Math.max(s.a.x, s.b.x) > b.x0 && Math.min(s.a.x, s.b.x) < b.x1
                           && Math.max(s.a.y, s.b.y) > b.y0 && Math.min(s.a.y, s.b.y) < b.y1); };

    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      segs.push({ a, b, flat: Math.abs(a.y - b.y) < 0.5 ? 1 : 0,
                  len: Math.abs(b.x - a.x) + Math.abs(b.y - a.y) });
    }
    segs.sort((p, q) => (q.flat - p.flat) || (q.len - p.len));

    const cands = [];
    for (const s of segs) {
      const tight = s.len < halfW * 2 + 34;
      for (const t of [0.5, 0.35, 0.65, 0.22, 0.78, 0.14, 0.86]) {
        const c = { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
        if (!tight) cands.push(c);
        else if (s.flat) cands.push({ x: c.x, y: c.y - 17 }, { x: c.x, y: c.y + 17 });
        else cands.push({ x: c.x - halfW - 10, y: c.y }, { x: c.x + halfW + 10, y: c.y });
      }
    }
    // Relax one requirement at a time; a frame is the one thing a label may
    // never sit on, because it hides the content the map exists to show.
    for (const test of [c => clearFrames(c) && clearLabels(c) && clearWires(c),
                        c => clearFrames(c) && clearLabels(c),
                        clearFrames]) {
      const hit = cands.find(test);
      if (hit) return hit;
    }
    return pts[Math.floor(pts.length / 2)];
  }

  const R = 9;
  // Round the interior corners so the route reads as a path, not a staircase.
  function roundPath(pts) {
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], prev = pts[i - 1], next = pts[i + 1];
      const inV = { x: p.x - prev.x, y: p.y - prev.y };
      const outV = { x: next.x - p.x, y: next.y - p.y };
      const inL = Math.hypot(inV.x, inV.y) || 1, outL = Math.hypot(outV.x, outV.y) || 1;
      const r = Math.min(R, inL / 2, outL / 2);
      d += ` L${p.x - inV.x / inL * r},${p.y - inV.y / inL * r}`;
      d += ` Q${p.x},${p.y} ${p.x + outV.x / outL * r},${p.y + outV.y / outL * r}`;
    }
    const last = pts[pts.length - 1];
    return d + ` L${last.x},${last.y}`;
  }

  const NS = 'http://www.w3.org/2000/svg';
  const el = (n, attrs) => {
    const e = document.createElementNS(NS, n);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };

  // Arrows are drawn ON DEMAND, not all at once. Every frame states its
  // relationships in words (the .rel chips), so nothing is hidden; the lines
  // answer "show me THIS box's connections". `showAll` draws the whole graph
  // for anyone who wants it — with reserved-channel routing that stays legible,
  // which is what it did not do when each line hunted for its own space.
  let showAll = false;
  let selected = null;
  let solo = null;                          // {a, b} of the single arrow shown
  function visibleEdges() {
    if (showAll) return D.edges;
    if (solo) return D.edges.filter(e => e.a === solo.a && e.b === solo.b);
    // Selecting a frame shows its connections again. The one-arrow restriction
    // existed because the old router could not keep several lines legible; with
    // channel routing each run sits in a reserved gap, so a fan reads cleanly.
    if (selected) return D.edges.filter(e => e.a === selected || e.b === selected);
    return [];
  }
  function drawEdges() {
    svg.replaceChildren(svg.querySelector('defs'));
    const list = visibleEdges().filter(e =>
      geom[e.a] && geom[e.b]
      && !byId[e.a].classList.contains('gone') && !byId[e.b].classList.contains('gone'));
    if (!list.length) return;
    const all = frames.filter(f => !f.classList.contains('gone')).map(f => geom[f.dataset.id]);

    // Pass 1 — probe: which band, corridor and frame edge does each edge want?
    const probe = list.map(e => planEdge(e.a, e.b, null));
    // Pass 2 — ports. Runs touching one side of a frame are ordered by WHERE
    // each is heading and then spread across that side in the same order, so
    // they come out already sorted and their horizontal runs never cross each
    // other. This is Sugiyama's crossing-minimisation step, applied at the only
    // place a hand-placed layout still leaves a free choice: in declaration
    // order the same four arrows leaving `standards` crossed twice on the way.
    //
    // One group per SIDE, not per direction: `standards → mechanical` and
    // `mechanical → standards` both touch mechanical's top edge, and grouping
    // them separately gave each the middle of that edge — two lines running
    // 96px of the way down the same column, in opposite directions.
    const bySide = new Map();
    probe.forEach((p, i) => {
      if (!p) return;
      const push = (k, m) => { const g = bySide.get(k) ?? []; g.push(m); bySide.set(k, g); };
      push(`${list[i].a}${p.exitSide}`, { i, end: 'a', head: p.headA });
      push(`${list[i].b}${p.enterSide}`, { i, end: 'b', head: p.headB });
    });
    const ports = new Map();
    for (const [k, items] of bySide) {
      items.slice().sort((x, y) => x.head - y.head)
        .forEach((m, n) => ports.set(`${k}|${m.end}${m.i}`, { i: n, n: items.length }));
    }
    const fanPort = (p, e, i) => ({
      ax: ports.get(`${e.a}${p.exitSide}|a${i}`),
      bx: ports.get(`${e.b}${p.enterSide}|b${i}`),
    });

    // Pass 3 — lanes. Colour each channel from the routes as they currently
    // stand, then re-route with those lanes applied.
    //
    // Run twice. Applying a lane moves a run, which can make the route the lane
    // was computed for no longer the cheapest clean one — the edge then takes a
    // different shape, whose channels were never coloured, and falls back to the
    // middle of them. Two edges doing that in the same channel are drawn exactly
    // on top of each other: one apparent line with an arrowhead at each end.
    // The second round colours the shapes that actually came out of the first.
    const laneRound = prev => {
      const chan = new Map();
      const add = (k, i, s) => { const g = chan.get(k) ?? []; g.push({ i, s }); chan.set(k, g); };
      prev.forEach((p, i) => {
        if (!p) return;
        add(`y${p.keyA}`, i, p.spanA);
        if (p.keyB !== p.keyA && p.spanB) add(`y${p.keyB}`, i, p.spanB);
        if (p.keyC && p.spanC) add(`c${p.keyC}`, i, p.spanC);
      });
      const lanes = new Map();
      for (const [k, items] of chan) lanes.set(k, lanesOf(items));
      const fanLane = (k, i) => {
        const l = lanes.get(k);
        return l && l.of.has(i) ? { i: l.of.get(i), n: l.n } : null;
      };
      // Routes are laid one at a time and each records where it went, so the
      // next one can be told that space is spoken for.
      const taken = { ports: new Map(), wires: [] };
      return list.map((e, i) => {
        const p = prev[i];
        if (!p) return null;
        const r = planEdge(e.a, e.b, {
          ...fanPort(p, e, i),
          yA: fanLane(`y${p.keyA}`, i),
          yB: fanLane(`y${p.keyB}`, i),
          cx: p.keyC ? fanLane(`c${p.keyC}`, i) : null,
        }, taken) ?? p;
        for (const [id, q] of [[e.a, r.pts[0]], [e.b, r.pts[r.pts.length - 1]]]) {
          taken.ports.set(id, [...(taken.ports.get(id) ?? []), q]);
        }
        for (let k = 0; k < r.pts.length - 1; k++) taken.wires.push([r.pts[k], r.pts[k + 1]]);
        return r;
      });
    };

    // Pass 4 — route for real.
    const ported = list.map((e, i) =>
      probe[i] ? (planEdge(e.a, e.b, fanPort(probe[i], e, i)) ?? probe[i]) : null);
    const final = laneRound(laneRound(ported));
    const routed = [];
    list.forEach((e, i) => { if (final[i]) routed.push({ e, pts: final[i].pts }); });

    // Pass 5 — collect every vertical run, so a horizontal run crossing one can
    // break over it instead of appearing to join it.
    const crossers = [];
    routed.forEach(({ pts }, i) => {
      for (let k = 0; k < pts.length - 1; k++) {
        const p = pts[k], q = pts[k + 1];
        if (Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) > 1) {
          crossers.push({ i, c: p.x, s0: Math.min(p.y, q.y), s1: Math.max(p.y, q.y) });
        }
      }
    });

    // Pass 6 — labels, placed before anything is drawn so each one can be moved
    // clear of the ones already down. Two labels stacked on each other is the
    // same defect as two lines stacked on each other.
    const segsOf = pts => pts.slice(0, -1).map((a, k) => ({ a, b: pts[k + 1] }));
    const wires = routed.map(({ pts }) => segsOf(pts));
    const placed = [];
    const labels = routed.map(({ e, pts }, i) => {
      if (!e.label) return null;
      const w = e.label.length * 5.4 + 12;
      const c = placeLabel(pts, all, w / 2, placed, wires.filter((_, k) => k !== i).flat());
      placed.push({ x: c.x, y: c.y, w });
      return { c, w };
    });

    // Pass 7 — draw the lines, then ALL the labels on top of them.
    //
    // Labels last, in their own layer, because the side-to-side links are 90px
    // wide and their labels are 60px — there is nowhere in that gutter a label
    // can go that is not also crossed by the corridor running through it. A
    // label has an opaque background, so sitting over a line is fine and is the
    // usual convention; being drawn UNDER the next edge's line is not, and that
    // is what made "fills in" read as "fil in".
    const layer = el('g', { class: 'elabels' });
    routed.forEach(({ e, pts }, i) => {
      const K = e.kind;
      const dim = byId[e.a].classList.contains('faded') || byId[e.b].classList.contains('faded');
      const g = el('g', { class: 'edge' + (dim ? ' faded' : ''), 'data-kind': K,
                          'data-a': e.a, 'data-b': e.b });
      const d = hopPath(pts, crossers.filter(v => v.i !== i));
      g.appendChild(el('path', { d: roundPath(pts), class: 'halo' }));
      g.appendChild(el('path', {
        d, class: 'line', stroke: `var(--k-${K})`, 'marker-end': `url(#arrow-${K})`,
      }));
      svg.appendChild(g);
      if (!labels[i]) return;
      const { c, w } = labels[i];
      const lg = el('g', { class: 'elab' + (dim ? ' faded' : ''), 'data-kind': K,
                           'data-a': e.a, 'data-b': e.b });
      lg.appendChild(el('rect', {
        x: c.x - w / 2, y: c.y - 9, width: w, height: 18, rx: 9,
        class: 'elabel-bg', stroke: `var(--k-${K})`,
      }));
      const t = el('text', {
        x: c.x, y: c.y + 4, 'text-anchor': 'middle',
        class: 'elabel', fill: `var(--k-${K})`,
      });
      t.textContent = e.label;
      lg.appendChild(t);
      layer.appendChild(lg);
    });
    svg.appendChild(layer);
  }

  /* ---------------- pan + zoom ---------------- */
  let px = 0, py = 0, scale = 1;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const paint = () => { vp.style.transform = `translate(${px}px,${py}px) scale(${scale})`; };

  // Frames may sit anywhere, including at negative coordinates, so fit measures
  // the real bounding box rather than assuming it starts at the origin.
  function fit() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id in geom) {
      if (byId[id].classList.contains('gone')) continue;
      const g = geom[id];
      minX = Math.min(minX, g.x); minY = Math.min(minY, g.y);
      maxX = Math.max(maxX, g.x + g.w); maxY = Math.max(maxY, g.y + g.h);
    }
    if (!isFinite(minX)) return;
    const w = maxX - minX, h = maxY - minY;
    const r = wrap.getBoundingClientRect();
    scale = clamp(Math.min((r.width - 48) / (w + 40), (r.height - 48) / (h + 40)), 0.15, 1.6);
    px = (r.width - w * scale) / 2 - minX * scale;
    py = 20 - minY * scale;
    paint();
  }

  // Scroll PANS; pinch or ctrl/cmd+scroll zooms.
  //
  // This used to treat every wheel event as zoom, which broke trackpads badly:
  // a two-finger swipe sends deltaX with deltaY of 0, and `deltaY < 0` is false
  // for 0 — so every sideways swipe silently zoomed OUT instead of panning, and
  // the map felt walled in on all four sides. Panning by drag needs empty canvas
  // to grab, and once you zoom in there is barely any, so scroll is the only
  // gesture that always works. A trackpad pinch arrives as a wheel event with
  // ctrlKey set, which is what makes both gestures coexist.
  wrap.addEventListener('wheel', ev => {
    ev.preventDefault();
    if (ev.ctrlKey || ev.metaKey) {
      const r = wrap.getBoundingClientRect();
      const mx = ev.clientX - r.left, my = ev.clientY - r.top;
      const next = clamp(scale * (ev.deltaY < 0 ? 1.12 : 1 / 1.12), 0.15, 3);
      px = mx - (mx - px) * (next / scale);
      py = my - (my - py) * (next / scale);
      scale = next; paint();
      return;
    }
    // Shift+wheel is the long-standing "scroll sideways" convention for mice,
    // which have no deltaX of their own.
    const sideways = ev.shiftKey && ev.deltaX === 0;
    px -= sideways ? ev.deltaY : ev.deltaX;
    py -= sideways ? 0 : ev.deltaY;
    paint();
  }, { passive: false });

  // Hold space to pan from anywhere, including over a frame. Zoomed in, frames
  // cover almost the whole canvas, so "grab the background" can leave nowhere
  // to grab.
  let spaceHeld = false;
  addEventListener('keydown', ev => {
    if (ev.code === 'Space' && !ev.target.matches('input, textarea, summary')) {
      spaceHeld = true; wrap.classList.add('pannable'); ev.preventDefault();
    }
  });
  addEventListener('keyup', ev => {
    if (ev.code === 'Space') { spaceHeld = false; wrap.classList.remove('pannable'); }
  });

  let panning = null;
  const startPan = ev => {
    panning = { x: ev.clientX - px, y: ev.clientY - py };
    wrap.classList.add('grabbing');
    wrap.setPointerCapture(ev.pointerId);
  };
  wrap.addEventListener('pointerdown', ev => {
    // Middle-drag and space-drag pan regardless of what is underneath.
    if (ev.button === 1 || spaceHeld) { ev.preventDefault(); startPan(ev); return; }
    if (ev.target.closest('.fr')) return;             // frames handle their own drags
    // The legend is a child of #wrap. Without this, pressing it started a pan
    // and captured the pointer, so the click never reached <summary> and the
    // panel simply would not open.
    if (ev.target.closest('.legend')) return;
    startPan(ev);
  });
  wrap.addEventListener('pointermove', ev => {
    if (!panning) return;
    px = ev.clientX - panning.x; py = ev.clientY - panning.y; paint();
  });
  const endPan = () => { panning = null; wrap.classList.remove('grabbing'); };
  wrap.addEventListener('pointerup', endPan);
  wrap.addEventListener('pointercancel', endPan);

  // Two-finger pinch. A trackpad pinch arrives as a ctrlKey wheel event and is
  // handled above, but on a touch screen it is genuinely two pointers, and
  // without this there was no way to zoom on a tablet at all. Capture phase, so
  // a second finger landing on a frame still counts.
  const touches = new Map();
  let pinch = null;
  const spread = () => {
    const [a, b] = [...touches.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y),
             mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  wrap.addEventListener('pointerdown', ev => {
    if (ev.pointerType !== 'touch') return;
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (touches.size === 2) {
      drag = null; endPan();                 // a second finger cancels any drag
      frames.forEach(f => f.classList.remove('dragging'));
      const s0 = spread();
      pinch = { d: s0.d, scale, px, py };
    }
  }, true);
  wrap.addEventListener('pointermove', ev => {
    if (ev.pointerType !== 'touch' || !touches.has(ev.pointerId)) return;
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (touches.size !== 2 || !pinch) return;
    ev.preventDefault();
    const now = spread();
    const r = wrap.getBoundingClientRect();
    const next = clamp(pinch.scale * (now.d / (pinch.d || 1)), 0.15, 3);
    const mx = now.mx - r.left, my = now.my - r.top;
    px = mx - (mx - pinch.px) * (next / pinch.scale);
    py = my - (my - pinch.py) * (next / pinch.scale);
    scale = next; paint();
  }, true);
  for (const t of ['pointerup', 'pointercancel']) {
    wrap.addEventListener(t, ev => {
      touches.delete(ev.pointerId);
      if (touches.size < 2) pinch = null;
    }, true);
  }

  // Keyboard access. Nothing here was reachable without a pointer.
  const zoomBy = k => {
    const r = wrap.getBoundingClientRect();
    const mx = r.width / 2, my = r.height / 2;
    const next = clamp(scale * k, 0.15, 3);
    px = mx - (mx - px) * (next / scale);
    py = my - (my - py) * (next / scale);
    scale = next; paint();
  };
  addEventListener('keydown', ev => {
    if (ev.target.matches('input, textarea')) return;
    const step = ev.shiftKey ? 240 : 70;
    switch (ev.key) {
      case 'ArrowLeft':  px += step; break;
      case 'ArrowRight': px -= step; break;
      case 'ArrowUp':    py += step; break;
      case 'ArrowDown':  py -= step; break;
      case '+': case '=': zoomBy(1.2); return void ev.preventDefault();
      case '-': case '_': zoomBy(1 / 1.2); return void ev.preventDefault();
      case '0': fit(); return void ev.preventDefault();
      case 'Escape':
        showAll = false; solo = null;
    frames.forEach(f => setOpen(f, false));
    document.querySelectorAll('.rel.on').forEach(r => r.classList.remove('on'));
    isolate(null); search.value = '';
        document.querySelectorAll('.f').forEach(c => c.classList.remove('hit', 'miss'));
        return void ev.preventDefault();
      case 'Enter':
        if (ev.target.classList?.contains('fr')) {
          isolate(ev.target.classList.contains('focused') ? null : ev.target.dataset.id);
          ev.preventDefault();
        }
        return;
      default: return;
    }
    ev.preventDefault(); paint();
  });

  /* ---------------- move + resize ---------------- */
  const MIN_W = 190, MIN_H = 92;
  let drag = null;
  for (const f of frames) {
    const id = f.dataset.id;
    const start = (ev, mode) => {
      ev.preventDefault(); ev.stopPropagation();
      drag = { id, mode, sx: ev.clientX, sy: ev.clientY, ...geom[id] };
      f.classList.add('dragging');
      f.setPointerCapture(ev.pointerId);
    };
    // Grab ANYWHERE on the frame to move it. This started as a title-bar-only
    // handle, which is a ~15px strip — about 10px on screen at the default
    // zoom, and far too small to hit.
    let travelled = false;
    f.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      travelled = false;
      start(ev, ev.target.closest('.rs') ? 'resize' : 'move');
    });
    f.addEventListener('pointermove', ev => {
      if (!drag || drag.id !== id) return;
      const dx = (ev.clientX - drag.sx) / scale, dy = (ev.clientY - drag.sy) / scale;
      if (Math.abs(dx) > 3 / scale || Math.abs(dy) > 3 / scale) travelled = true;
      const g = geom[id];
      if (drag.mode === 'move') {
        // No clamp to the canvas origin. Pinning at 0 meant a frame simply
        // stopped when dragged left or up, with empty canvas still visible
        // beside it — the origin is an arbitrary point in an infinite plane,
        // not an edge. fit() handles negative coordinates.
        g.x = Math.round(drag.x + dx);
        g.y = Math.round(drag.y + dy);
      } else {
        g.w = Math.round(Math.max(MIN_W, drag.w + dx));
        g.h = Math.round(Math.max(MIN_H, drag.h + dy));
      }
      apply(id); drawEdges();
    });
    const done = () => {
      if (!drag || drag.id !== id) return;
      drag = null; f.classList.remove('dragging'); save();
    };
    f.addEventListener('pointerup', done);
    f.addEventListener('pointercancel', done);

    // A press that went nowhere is a click: isolate this frame and whatever it
    // connects to. A press that moved was a drag, and must not also isolate.
    f.addEventListener('click', ev => {
      if (ev.target.closest('.rs') || travelled) return;
      isolate(f.classList.contains('focused') ? null : id);
    });
  }

  /* ---------------- isolate + search ---------------- */
  function isolate(id) {
    selected = id;
    if (!id) { solo = null; document.querySelectorAll('.rel.on').forEach(r => r.classList.remove('on')); }
    frames.forEach(f => f.classList.remove('focused', 'faded'));
    if (!id) { drawEdges(); return; }
    const keep = new Set([id]);
    for (const e of D.edges) {
      if (e.a === id) keep.add(e.b);
      if (e.b === id) keep.add(e.a);
    }
    frames.forEach(f => {
      if (f.dataset.id === id) f.classList.add('focused');
      else if (!keep.has(f.dataset.id)) f.classList.add('faded');
    });
    drawEdges();
  }

  // A relationship chip draws its own arrow, and only its own.
  for (const chip of document.querySelectorAll('.rel')) {
    chip.addEventListener('pointerdown', ev => ev.stopPropagation());
    chip.addEventListener('click', ev => {
      ev.stopPropagation();
      const want = { a: chip.dataset.a, b: chip.dataset.b };
      const same = solo && solo.a === want.a && solo.b === want.b;
      document.querySelectorAll('.rel.on').forEach(r => r.classList.remove('on'));
      solo = same ? null : want;
      if (!same) chip.classList.add('on');
      showAll = false;
      frames.forEach(f => f.classList.remove('focused', 'faded'));
      if (solo) {
        frames.forEach(f => {
          if (f.dataset.id === solo.a || f.dataset.id === solo.b) f.classList.add('focused');
          else f.classList.add('faded');
        });
      }
      drawEdges();
    });
  }

  // Files are hidden until asked for. 109 filenames at 10px is a reference table,
  // not a map; the frame leads with what the class IS and how it is delivered.
  function setOpen(f, open) {
    f.classList.toggle('open', open);
    const btn = f.querySelector('.more');
    const n = f.querySelectorAll('.f').length;
    if (btn) btn.textContent = open ? 'hide files' : `show ${n} files`;
  }
  function reflow() {
    const snapshot = structuredClone(geom);
    autofit(snapshot);
    save(); drawEdges();
  }
  for (const f of frames) {
    const btn = f.querySelector('.more');
    if (!btn) continue;
    btn.addEventListener('pointerdown', ev => ev.stopPropagation());
    btn.addEventListener('click', ev => {
      ev.stopPropagation();
      setOpen(f, !f.classList.contains('open'));
      reflow();
    });
  }

  const search = document.getElementById('search');
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    for (const chip of document.querySelectorAll('.f')) {
      chip.classList.toggle('hit', !!q && chip.dataset.search.includes(q));
      chip.classList.toggle('miss', !!q && !chip.dataset.search.includes(q));
    }
    // A match inside a collapsed frame is invisible — open the frames that have one.
    for (const f of frames) setOpen(f, !!q && !!f.querySelector('.f.hit'));
    reflow();
  });

  /* ---------------- layer toggles ---------------- */
  const toggle = (btn, fn, labels) => {
    let on = false;
    btn.addEventListener('click', () => {
      on = !on; fn(on);
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
      if (labels) btn.textContent = on ? labels[1] : labels[0];
    });
    return () => {
      if (!on) return;
      on = false; fn(false);
      btn.classList.remove('on'); btn.setAttribute('aria-pressed', 'false');
      if (labels) btn.textContent = labels[0];
    };
  };

  const resets = [
    toggle(document.getElementById('t_self'), on => {
      byId.self.classList.toggle('gone', on);
      drawEdges(); fit();
    }, ['exports only', 'show all']),
    toggle(document.getElementById('t_cmp'), on => vp.classList.toggle('no-cmp', on),
      ['hide compartments', 'show compartments']),
    toggle(document.getElementById('t_del'), on => vp.classList.toggle('no-del', on),
      ['hide delivery', 'show delivery']),
    toggle(document.getElementById('t_edge'), on => { showAll = on; drawEdges(); },
      ['all arrows', 'selected only']),
  ];

  document.getElementById('t_reset').addEventListener('click', () => {
    resets.forEach(r => r());
    Object.assign(geom, structuredClone(declared));
    try { localStorage.removeItem(STORE); } catch { /* private mode */ }
    showAll = false; solo = null;
    frames.forEach(f => setOpen(f, false));
    document.querySelectorAll('.rel.on').forEach(r => r.classList.remove('on'));
    isolate(null); search.value = '';
    document.querySelectorAll('.f').forEach(c => c.classList.remove('hit', 'miss'));
    applyAll(); autofit(); drawEdges(); fit();
  });

  // Recentre WITHOUT touching the arranged layout. Previously `reset` was the
  // only way back from an off-screen pan, and it also discarded every frame the
  // reader had moved — so getting un-lost cost you your arrangement.
  document.getElementById('t_fit').addEventListener('click', fit);
  document.getElementById('zin').addEventListener('click', () => zoomBy(1.2));
  document.getElementById('zout').addEventListener('click', () => zoomBy(1 / 1.2));

  /* ---------------- go ---------------- */
  const restored = load();
  applyAll();
  if (!restored) autofit();
  drawEdges(); fit();
  addEventListener('resize', fit);
})();
