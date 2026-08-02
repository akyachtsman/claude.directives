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

  /* ---------------- edges: channel routing ---------------- */
  // Ported from claude.insurance — js/keep/logic/relmap.js (orchestrate) and
  // js/keep/views/relmap-view.js (relOrtho, relHopPath). That code already solved
  // this properly and was unit-tested; four attempts at hand-rolling an obstacle
  // -avoiding router here produced worse results. Reuse Before Rewrite
  // (global.md) — applied late.
  //
  // The idea that makes it work: do not SEARCH for space, RESERVE it. Frames sit
  // in rows, so the gap between two rows is a channel no frame occupies. Every
  // run is axis-aligned and lives either in a row gap (crossing runs) or on a
  // frame's own column (approach runs), which means a line can never pass behind
  // a frame — structurally, not by obstacle testing.
  const LANE = 14;                // spacing between two sources' parallel runs
  const HOP = 6;                  // half-width of the break where lines cross

  // Rows, derived from the frames' current vertical order. Frames within ~40px of
  // each other are one row, which is what the default layout builds and what a
  // reader's rearrangement usually preserves.
  function rowsOf(ids) {
    const sorted = [...ids].sort((a, b) => geom[a].y - geom[b].y);
    const rows = [];
    for (const id of sorted) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(geom[last[0]].y - geom[id].y) < 40) last.push(id);
      else rows.push([id]);
    }
    return rows;
  }
  function rowIndex() {
    const live = frames.filter(f => !f.classList.contains('gone')).map(f => f.dataset.id);
    const rows = rowsOf(live);
    const idx = {}, bounds = [];
    rows.forEach((row, i) => {
      row.forEach(id => { idx[id] = i; });
      bounds.push({
        top: Math.min(...row.map(id => geom[id].y)),
        bottom: Math.max(...row.map(id => geom[id].y + geom[id].h)),
      });
    });
    return { idx, bounds };
  }

  // The channel between row i and row i+1: the middle of the empty band between
  // them. `lane` fans several edges apart so parallel runs never lie on top of
  // one another (relmap-view's channelOf).
  const channel = (bounds, i, lane) => {
    const a = bounds[i], b = bounds[i + 1];
    if (!a || !b) return (a || b).bottom + 30 + lane * LANE;
    // The lane offset must never push the run out of the gap it belongs to —
    // that is precisely how a "channel" route ends up inside the next row.
    const lo = a.bottom + 8, hi = b.top - 8;
    const mid = (a.bottom + b.top) / 2;
    if (hi <= lo) return mid;
    const spread = Math.min(LANE, (hi - lo) / 4);
    return Math.min(hi, Math.max(lo, mid + lane * spread));
  };

  // Orthogonal route from `a` down/up to `b`, bending through every intervening
  // row gap — the dummy-waypoint idea from orchestrate(), reduced to what an
  // 8-frame map needs: the bend column is the target's, so a long edge runs down
  // its own column clear of whatever it passes.
  function routeEdge(a, b, ida, idb, lane) {
    const { idx, bounds } = rowIndex();
    const ra = idx[ida], rb = idx[idb];
    const ax = clampTo(geom[ida].x + geom[ida].w / 2 + lane * LANE, geom[ida]);
    const bx = clampTo(geom[idb].x + geom[idb].w / 2 - lane * LANE, geom[idb]);
    if (ra == null || rb == null) return null;

    const down = rb > ra;
    const sameRow = ra === rb;
    if (sameRow) {
      // Dip into the gap just below the row and back, staying out of every card
      // in it (relOrtho's same-band case).
      const ch = bounds[ra].bottom + 26 + lane * LANE;
      return [{ x: ax, y: a.y + a.h }, { x: ax, y: ch }, { x: bx, y: ch }, { x: bx, y: b.y + b.h }];
    }
    // Adjacent rows: straight into the gap between them and across. The gap is
    // empty by definition, so nothing is crossed.
    if (Math.abs(rb - ra) === 1) {
      const ch = channel(bounds, Math.min(ra, rb), lane);
      return [{ x: ax, y: down ? a.y + a.h : a.y }, { x: ax, y: ch },
              { x: bx, y: ch }, { x: bx, y: down ? b.y : b.y + b.h }];
    }

    // Spanning more than one row: the long vertical leg must not run down a
    // column occupied by the rows in between. claude.insurance reserves those
    // columns by laying its routing dummies out as real nodes with their own
    // cross-axis width; our frames are wide and leave no such gap, so the
    // reserved channel here is the MARGIN beside the whole arrangement. Pick the
    // nearer side and fan by lane.
    const spanned = frames
      .filter(f => !f.classList.contains('gone'))
      .map(f => f.dataset.id)
      .filter(id => {
        const r = idx[id];
        return r != null && r > Math.min(ra, rb) && r < Math.max(ra, rb);
      })
      .map(id => geom[id]);
    const box = spanned.length
      ? { x0: Math.min(...spanned.map(g => g.x)), x1: Math.max(...spanned.map(g => g.x + g.w)) }
      : { x0: Math.min(a.x, b.x), x1: Math.max(a.x + a.w, b.x + b.w) };
    const mid = (ax + bx) / 2;
    const goLeft = Math.abs(mid - box.x0) <= Math.abs(box.x1 - mid);
    const col = goLeft ? box.x0 - 34 - lane * LANE : box.x1 + 34 + lane * LANE;
    const chA = channel(bounds, down ? ra : ra - 1, lane);
    const chB = channel(bounds, down ? rb - 1 : rb, lane);
    return [
      { x: ax, y: down ? a.y + a.h : a.y },
      { x: ax, y: chA }, { x: col, y: chA },
      { x: col, y: chB }, { x: bx, y: chB },
      { x: bx, y: down ? b.y : b.y + b.h },
    ];
  }
  const clampTo = (x, g) => Math.min(g.x + g.w - 20, Math.max(g.x + 20, x));

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

  // Label goes on the longest run that is clear of every frame.
  function placeLabel(pts, all, halfW) {
    const clearOf = c => !all.some(g =>
      c.x + halfW > g.x - 2 && c.x - halfW < g.x + g.w + 2 &&
      c.y + 10 > g.y - 2 && c.y - 10 < g.y + g.h + 2);
    let best = null, bestLen = -1;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      if (len <= bestLen) continue;
      for (const t of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        const c = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        if (clearOf(c)) { best = c; bestLen = len; break; }
      }
    }
    return best ?? pts[Math.floor(pts.length / 2)];
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

  // Arrows are drawn ON DEMAND, not all at once. Ten free-floating lines across
  // eight draggable boxes is unreadable however well each one is routed — you
  // cannot tell which arrow leaves which box. Every frame states its
  // relationships in words (the .rel chips), so nothing is hidden; the lines
  // exist to answer "show me THIS box's connections", and at most four are ever
  // on screen at once. `showAll` restores the full graph for anyone who wants it.
  // ONE arrow at a time.
  //
  // Crossing-free routing is not achievable in general once the reader fixes the
  // node positions by dragging — so promising "no lines cross" while drawing six
  // at once is a promise that cannot be kept, and three rounds of router work
  // proved it. Drawing exactly one arrow makes it true by construction. The
  // relationship chips on each frame are the control: click one, see precisely
  // that connection. `showAll` remains as an explicit escape hatch, and is the
  // only mode where lines may overlap.
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
    const list = visibleEdges();
    if (!list.length) return;
    const all = frames.filter(f => !f.classList.contains('gone')).map(f => geom[f.dataset.id]);

    // Pass 1 — route every edge into a channel. Each SOURCE gets its own lane so
    // two edges leaving the same frame never lie on top of each other.
    const lanes = {};
    const routed = [];
    for (const e of list) {
      if (!geom[e.a] || !geom[e.b]) continue;
      if (byId[e.a].classList.contains('gone') || byId[e.b].classList.contains('gone')) continue;
      const lane = (lanes[e.a] = (lanes[e.a] ?? -1) + 1);
      const pts = routeEdge(geom[e.a], geom[e.b], e.a, e.b, lane);
      if (pts) routed.push({ e, pts });
    }

    // Pass 2 — collect every vertical run, so a horizontal run crossing one can
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

    // Pass 3 — draw.
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
      if (e.label) {
        const label = placeLabel(pts, all, (e.label.length * 5.4 + 12) / 2);
        const w = e.label.length * 5.4 + 12;
        g.appendChild(el('rect', {
          x: label.x - w / 2, y: label.y - 9, width: w, height: 18, rx: 9,
          class: 'elabel-bg', stroke: `var(--k-${K})`,
        }));
        const t = el('text', {
          x: label.x, y: label.y + 4, 'text-anchor': 'middle',
          class: 'elabel', fill: `var(--k-${K})`,
        });
        t.textContent = e.label;
        g.appendChild(t);
      }
      svg.appendChild(g);
    });
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
